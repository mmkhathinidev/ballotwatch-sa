"""IEC public results feed client + normalisation.

The IEC's own results dashboard (results.elections.org.za) is a static-file
SPA: every panel is driven by a JSON document under
/dashboards/lge/MapsJason/<year>/EEID<event><Panel>.js
Those documents are published by the Electoral Commission, are key-less, and
are refreshed by the IEC every 5-10 minutes while counting is under way. This
module reads them and converts them into the shapes the dashboard needs.
"""
from __future__ import annotations

import json
import time
from dataclasses import dataclass
from typing import Any

import httpx

from .config import IEC_BASE, IEC_EVENTS, PROVINCES, USER_AGENT


@dataclass
class Fetched:
    url: str
    status: int
    text: str
    ms: int
    nbytes: int

    @property
    def ok(self) -> bool:
        return self.status == 200 and self.text.lstrip().startswith(("{", "["))


def event_url(year: int, panel: str = "LiteMapsNational") -> str:
    event = IEC_EVENTS[year]
    return f"{IEC_BASE}/{year}/EEID{event}{panel}.js"


def party_list_url(house: str, year: int) -> str:
    return f"https://results.elections.org.za/dashboards/{house}/MapsJason/{year}/PartyList.js"


async def fetch(client: httpx.AsyncClient, url: str) -> Fetched:
    t0 = time.perf_counter()
    try:
        r = await client.get(url, params={"rnd": f"{time.time():.6f}"})
        ms = int((time.perf_counter() - t0) * 1000)
        return Fetched(url, r.status_code, r.text, ms, len(r.content))
    except httpx.HTTPError as exc:  # network/DNS/timeout
        ms = int((time.perf_counter() - t0) * 1000)
        return Fetched(url, 0, f"# error: {exc}", ms, 0)


def parse(fetched: Fetched) -> dict[str, Any] | None:
    if not fetched.ok:
        return None
    try:
        return json.loads(fetched.text.lstrip("\ufeff"))
    except json.JSONDecodeError:
        return None


def make_client() -> httpx.AsyncClient:
    return httpx.AsyncClient(
        timeout=httpx.Timeout(20.0, connect=10.0),
        headers={"User-Agent": USER_AGENT, "Accept": "application/json,text/plain,*/*"},
        follow_redirects=True,
        limits=httpx.Limits(max_connections=12, max_keepalive_connections=6),
    )


# --------------------------------------------------------------------------
# normalisation
# --------------------------------------------------------------------------

def _pct(part: float, whole: float) -> float:
    return round(100.0 * part / whole, 2) if whole else 0.0


# The IEC feed lists the parties carrying the contest and folds every other
# party into one "OTHER" row (ID -2). It is an aggregate of hundreds of
# micro-parties, not a contestant — 546 parties contested the 2026 municipal
# election — so it is flagged here and always sorted behind real parties.
RESIDUAL_IDS = frozenset({-2})


def is_residual(party_id: int | None) -> bool:
    return party_id in RESIDUAL_IDS


def _party_sort(v: dict) -> tuple:
    """Real parties by votes, then the residual bucket dead last."""
    return (1 if v.get("residual") else 0, -v["votes"], -v["seats"], v["abbr"])


def _party_row(p: dict, meta: dict[int, dict], total_valid: int, cast: int,
               registered: int) -> dict:
    info = meta.get(p.get("ID") if p.get("ID") is not None else -1, {})
    seats = (p.get("WardSeatsWon") or 0) + (p.get("PRSeatsWon") or 0)
    return {
        "id": p.get("ID"),
        "abbr": info.get("name") or f"Party {p.get('ID')}",
        "name": info.get("full_name") or info.get("name") or f"Party ID {p.get('ID')}",
        "colour": info.get("colour") or "#8892a6",
        "known": bool(info),
        "residual": is_residual(p.get("ID")),
        "votes": p.get("TotalValidVotes") or 0,
        "pct": p.get("PercOfVotes") or _pct(p.get("TotalValidVotes") or 0, total_valid),
        "ward_seats": p.get("WardSeatsWon") or 0,
        "pr_seats": p.get("PRSeatsWon") or 0,
        "seats": seats,
        "councils_won": p.get("CouncilsWon") or 0,
        "majority_won": p.get("MajorityWon") or 0,
        "leading": bool(p.get("IsLeadingPartyVotes")),
        # LGE turnout: each voter casts a ward ballot and a PR ballot, so the
        # published "votes cast" counts ballots, not voters.
        "turnout": _pct(cast, registered * 2),
    }


def _integrity(valid: int, cast: int, spoilt: int, seats_expected: int,
               seats_done: int, votes: list[dict]) -> list[dict]:
    """Reconcile the published figures. A dashboard that cannot prove its own
    arithmetic should not be trusted with a country's results."""
    checks: list[dict] = []
    sum_votes = sum(v["votes"] for v in votes)

    if sum_votes or valid:
        checks.append({
            "id": "party-sum",
            "label": "Party votes sum to valid votes",
            "detail": f"{sum_votes:,} vs {valid:,}",
            "pass": abs(sum_votes - valid) <= max(5, len(votes)),
        })
    if cast or valid:
        checks.append({
            "id": "cast-split",
            "label": "Valid + spoilt = votes cast",
            "detail": f"{valid + spoilt:,} vs {cast:,}",
            "pass": abs((valid + spoilt) - cast) <= max(5, len(votes)),
        })
    seats_expected = seats_expected or 0
    seats_done = seats_done or 0
    if seats_expected:
        checks.append({
            "id": "seats",
            "label": "Seats allocated within bounds",
            "detail": f"{seats_done:,} of {seats_expected:,}",
            "pass": 0 <= seats_done <= seats_expected,
        })
    return checks


def national_view(payload: dict, meta: dict[int, dict]) -> dict[str, Any]:
    raw = payload.get("PartyBallotResults") or []
    first = raw[0] if raw else {}
    registered = first.get("RegisteredVoters") or payload.get("RegPop") or 0
    cast = first.get("TotalVotesCast") or 0
    valid = first.get("ValidVotesCast") or 0
    spoilt = first.get("SpoiltVotes") or 0

    votes = [_party_row(p, meta, valid, cast, registered) for p in raw]
    for v in votes:
        v["seat_pct"] = _pct(v["seats"], payload.get("SeatsExpected") or 0)
    votes.sort(key=_party_sort)

    return {
        "event_id": payload.get("ElectoralEventID"),
        "report_date": payload.get("ReportDate"),
        "registered_voters": registered,
        "votes_cast": cast,
        "valid_votes": valid,
        "spoilt_votes": spoilt,
        "special_votes": first.get("SpecialVotes") or 0,
        "ballots_cast": cast,
        "turnout": _pct(cast, registered * 2),
        "turnout_method": "votes cast ÷ 2 ballots per voter ÷ registered voters",
        "seats_expected": payload.get("SeatsExpected") or 0,
        "seats_allocated": sum(v["seats"] for v in votes),
        "progress": {
            "provinces": [payload.get("ProvincesComplete", 0), payload.get("ProvinceExpected", 0)],
            "municipalities": [payload.get("MuncipalitiesComplete", 0), payload.get("MunicExpected", 0)],
            "wards": [payload.get("WardsComplete", 0), payload.get("WardExpected", 0)],
            "voting_districts": [payload.get("VDsComplete", 0), payload.get("VDExpected", 0)],
            "seats": [payload.get("SeatsComplete", 0), payload.get("SeatsExpected", 0)],
        },
        "percent_complete": {
            "voting_districts": payload.get("Perc_VDsComplete", 0),
            "wards": payload.get("Perc_WardsComplete", 0),
            "municipalities": payload.get("Perc_MunicipalityComplete", 0),
        },
        "councils": {
            "hung": payload.get("HungCouncils", 0),
            "majority": payload.get("MajorityCouncils", 0),
            "drawn": payload.get("TotalDrawnCouncils", 0),
            "expected": payload.get("MunicExpected", 0),
        },
        "parties": votes,
        "integrity": _integrity(
            valid,
            cast,
            spoilt,
            payload.get("SeatsExpected") or 0,
            payload.get("SeatsComplete") or 0,
            votes,
        ),
        "loaded": bool(valid or cast),
    }


def province_view(payload: dict, meta: dict[int, dict]) -> dict[str, Any]:
    pid = payload.get("ProvinceID")
    raw = payload.get("PartyBallotResults") or []
    first = raw[0] if raw else {}
    registered = first.get("RegisteredVoters") or payload.get("RegPop") or 0
    cast = first.get("TotalVotesCast") or 0
    valid = first.get("ValidVotesCast") or 0

    votes = [
        _party_row(p, meta, valid, cast, registered)
        for p in raw
        if (p.get("TotalValidVotes") or 0) > 0 or (p.get("WardSeatsWon") or 0)
        or (p.get("PRSeatsWon") or 0)
    ]
    votes.sort(key=_party_sort)
    munis = [
        {
            "id": m.get("MunicipalityID"),
            "name": m.get("Municipality"),
            "registered_voters": m.get("RegPop") or 0,
            "votes_cast": (m.get("PartyBallotResults") or [{}])[0].get("TotalVotesCast", 0),
            "valid_votes": (m.get("PartyBallotResults") or [{}])[0].get("ValidVotesCast", 0),
            "seats": m.get("SeatsExpected", 0),
            "wards": m.get("WardExpected", 0),
            "wards_complete": m.get("WardsComplete", 0),
            "hung": m.get("HungCouncils", 0),
            "complete": (m.get("Perc_WardsComplete") or 0) >= 100,
            "leader": next(
                (r.get("ID") for r in (m.get("PartyBallotResults") or [])
                 if (r.get("TotalValidVotes") or 0) > 0),
                None,
            ),
            "leader_pct": next(
                (r.get("PercOfVotes") or 0 for r in (m.get("PartyBallotResults") or [])
                 if (r.get("TotalValidVotes") or 0) > 0),
                0,
            ),
            "parties": sorted(
                [
                    {
                        "id": p.get("ID"),
                        "abbr": meta.get(p.get("ID") if p.get("ID") is not None else -1, {}).get("name") or f"Party {p.get('ID')}",
                        "colour": meta.get(p.get("ID") if p.get("ID") is not None else -1, {}).get("colour") or "#8892a6",
                        "votes": p.get("TotalValidVotes") or 0,
                        "pct": p.get("PercOfVotes") or 0,
                        "seats": (p.get("WardSeatsWon") or 0) + (p.get("PRSeatsWon") or 0),
                    }
                    for p in (m.get("PartyBallotResults") or [])
                    if (p.get("TotalValidVotes") or 0) > 0
                ],
                key=lambda x: -x["votes"],
            )[:6],
        }
        for m in (payload.get("MunicipalityResults") or [])
    ]
    munis.sort(key=lambda x: -x["registered_voters"])

    return {
        "province_id": pid,
        "province": payload.get("Province") or PROVINCES.get(pid, "Unknown"),
        "report_date": payload.get("ReportDate"),
        "registered_voters": registered,
        "votes_cast": cast,
        "valid_votes": valid,
        "ballots_cast": cast,
        "turnout": _pct(cast, registered * 2),
        "seats_total": payload.get("SeatsExpected") or 0,
        "seats_allocated": sum((p.get("WardSeatsWon") or 0) + (p.get("PRSeatsWon") or 0) for p in raw),
        "councils": {
            "expected": payload.get("MunicExpected", 0),
            "complete": payload.get("MuncipalitiesComplete", 0),
            "hung": payload.get("HungCouncils", 0),
            "majority": payload.get("MajorityCouncils", 0),
        },
        "percent_complete": {
            "voting_districts": payload.get("Perc_VDsComplete", 0),
            "wards": payload.get("Perc_WardsComplete", 0),
        },
        "parties": votes,
        "municipalities": munis,
    }
