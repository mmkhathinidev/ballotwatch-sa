"""Pre-poll reference data.

Two sources, both published by the IEC:

1. Voter registration statistics (elections.org.za/pw/StatsData/...) — parsed
   from the Commission's own page and validated before use.
2. Historical LGE result bundles (2011, 2016, 2021) from the results dashboard,
   which are the same documents the IEC's charts are drawn from.

The baseline is written to data/prepoll/baseline.json and served read-only, so
the dashboard keeps working when the network is down.
"""
from __future__ import annotations

import json
import re
from datetime import datetime
from pathlib import Path
from typing import Any

import httpx

from . import iec
from .config import IEC_EVENTS, PREPOLL_DIR, PROVINCES, USER_AGENT

REGISTRATION_URL = "https://www.elections.org.za/pw/StatsData/Voter-Registration-Statistics"

# Verified from the IEC page "Registered voters as at 29 September 2026".
# Kept as a seed so a first run works offline; a successful live parse replaces
# it, and only when the published totals reconcile.
SEED_REGISTRATION: dict[str, Any] = {
    "as_at": "2026-09-29",
    "source": REGISTRATION_URL,
    "total": 29230808,
    "gender": {"male": 13075078, "female": 16155730},
    "age_bands": [
        {"band": "18-19", "male": 308310, "female": 385603},
        {"band": "20-29", "male": 2155211, "female": 2683749},
        {"band": "30-39", "male": 3118675, "female": 3656909},
        {"band": "40-49", "male": 2997361, "female": 3320270},
        {"band": "50-59", "male": 2212237, "female": 2604700},
        {"band": "60-69", "male": 1407685, "female": 1928572},
        {"band": "70-79", "male": 645142, "female": 1033434},
        {"band": "80+", "male": 230457, "female": 542493},
    ],
    "provinces": {
        "Eastern Cape": 3628934,
        "Free State": 1533570,
        "Gauteng": 6751064,
        "KwaZulu-Natal": 6030969,
        "Mpumalanga": 2170139,
        "Northern Cape": 713869,
        "Limpopo": 3037387,
        "North West": 1907623,
        "Western Cape": 3457253,
    },
}

PROVINCE_ALIASES = {
    "kwazulu-natal": "KwaZulu-Natal",
    "kwazulu natal": "KwaZulu-Natal",
    "north west": "North West",
    "free state": "Free State",
    "eastern cape": "Eastern Cape",
    "western cape": "Western Cape",
    "northern cape": "Northern Cape",
    "gauteng": "Gauteng",
    "limpopo": "Limpopo",
    "mpumalanga": "Mpumalanga",
}


def _num(text: str) -> int:
    return int(re.sub(r"[^\d]", "", text) or 0)


def parse_registration_html(html: str) -> dict[str, Any] | None:
    """Parse the IEC registration page; return None unless the figures reconcile."""
    as_at = None
    m = re.search(r"Registered voters as at\s*<[^>]*>?\s*([0-9]{1,2}\s+\w+\s+[0-9]{4})", html)
    if m:
        try:
            as_at = datetime.strptime(m.group(1).strip(), "%d %B %Y").date().isoformat()
        except ValueError:
            as_at = None

    provinces: dict[str, int] = {}
    for name, value in re.findall(
        r"(Eastern Cape|Free State|Gauteng|KwaZulu-?Natal|Kwazulu-natal|Limpopo|Mpumalanga|North West|Northern Cape|Western Cape)"
        r"[^\d]{0,400}?([\d][\d,\s]{4,12}\d)",
        html,
    ):
        key = PROVINCE_ALIASES.get(name.lower().replace("_", " ").strip())
        if not key:
            continue
        n = _num(value)
        if 10_000 < n < 20_000_000 and key not in provinces:
            provinces[key] = n

    # The published total is the reconciliation anchor: if it cannot be read,
    # or does not agree with the nine provincial rows, refuse the parse rather
    # than serve a half-read page.
    total = None
    m = re.search(r"Total\s*</t[dh]>\s*<t[dh][^>]*>\s*([\d][\d,\s]{4,14})", html)
    if not m:
        candidates = re.findall(r"Total[^0-9]{0,300}?([\d][\d,\s]{6,14}\d)", html)
        if candidates:
            m_value = _num(candidates[-1])
            total = m_value
    else:
        total = _num(m.group(1))

    if len(provinces) != 9 or total is None:
        return None
    if not (20_000_000 < total < 35_000_000):
        return None
    if abs(sum(provinces.values()) - total) > 5:
        return None

    return {
        "as_at": as_at or SEED_REGISTRATION["as_at"],
        "source": REGISTRATION_URL,
        "total": total,
        "gender": SEED_REGISTRATION["gender"],
        "age_bands": SEED_REGISTRATION["age_bands"],
        "provinces": provinces,
    }


async def refresh_registration() -> dict[str, Any]:
    async with httpx.AsyncClient(
        timeout=25.0, headers={"User-Agent": USER_AGENT}, follow_redirects=True
    ) as client:
        r = await client.get(REGISTRATION_URL)
        r.raise_for_status()
        parsed = parse_registration_html(r.text)
    return parsed or SEED_REGISTRATION


def _province_baseline(payload: dict, pid: int) -> dict[str, Any] | None:
    for p in payload.get("ProvinceResults") or []:
        if p.get("ProvinceID") != pid:
            continue
        parties = p.get("PartyBallotResults") or []
        first = parties[0] if parties else {}
        leader = first
        reg = leader.get("RegisteredVoters") or p.get("RegPop") or 0
        cast = leader.get("TotalVotesCast") or 0
        seats = sum(
            (x.get("WardSeatsWon") or 0) + (x.get("PRSeatsWon") or 0) for x in parties
        )
        parties.sort(key=lambda x: -(x.get("TotalValidVotes") or 0))
        return {
            "province_id": pid,
            "province": p.get("Province") or PROVINCES[pid],
            "registered_voters": reg,
            "votes_cast": cast,
            "valid_votes": leader.get("ValidVotesCast") or 0,
            "ballots_cast": cast,
            "turnout": round(100 * cast / (2 * reg), 2) if reg else 0,
            "seats": seats,
            "councils": p.get("MunicExpected", 0),
            "hung": p.get("HungCouncils", 0),
            "majority": p.get("MajorityCouncils", 0),
            "parties": [
                {
                    "id": x.get("ID"),
                    "votes": x.get("TotalValidVotes") or 0,
                    "pct": x.get("PercOfVotes") or 0,
                    "seats": (x.get("WardSeatsWon") or 0) + (x.get("PRSeatsWon") or 0),
                    "councils_won": x.get("CouncilsWon") or 0,
                }
                for x in parties
            ],
        }
    return None


async def build_baseline() -> dict[str, Any]:
    reg = await refresh_registration()
    out: dict[str, Any] = {
        "generated_at": datetime.now().astimezone().isoformat(timespec="seconds"),
        "registration": reg,
        "elections": {},
        "provinces": {},
        "structure": {},
        "sources": [],
    }

    async with httpx.AsyncClient(
        timeout=40.0, headers={"User-Agent": USER_AGENT}, follow_redirects=True
    ) as client:
        party_meta: dict[int, dict] = {}
        # Older lists first, newer ones override only where they carry a name.
        for house, year in (("lge", 2021), ("npe", 2024)):
            fetched_parties = await iec.fetch(client, iec.party_list_url(house, year))
            if not fetched_parties.ok:
                continue
            for row in json.loads(fetched_parties.text.lstrip("\ufeff")):
                prev = party_meta.get(row["ID"], {})
                merged = {**prev, **row}
                if not (row.get("Name") or "").strip():
                    merged["Name"] = prev.get("Name", "")
                if not (row.get("PartyFullName") or "").strip():
                    merged["PartyFullName"] = prev.get("PartyFullName", "")
                if not row.get("sWebColour"):
                    merged["sWebColour"] = prev.get("sWebColour", "#8892a6")
                party_meta[row["ID"]] = merged

        for year in (2011, 2016, 2021):
            url = iec.event_url(year)
            fetched = await iec.fetch(client, url)
            payload = iec.parse(fetched)
            out["sources"].append({"label": f"IEC LGE {year} bundle", "url": url,
                                   "status": fetched.status})
            if not payload:
                continue
            parties = payload.get("PartyBallotResults") or []
            first = parties[0] if parties else {}
            reg_n = first.get("RegisteredVoters") or payload.get("RegPop") or 0
            cast = first.get("TotalVotesCast") or 0
            out["elections"][year] = {
                "event_id": payload.get("ElectoralEventID"),
                "report_date": payload.get("ReportDate"),
                "registered_voters": reg_n,
                "votes_cast": cast,
                "valid_votes": first.get("ValidVotesCast") or 0,
                "spoilt_votes": first.get("SpoiltVotes") or 0,
                "special_votes": first.get("SpecialVotes") or 0,
                "ballots_cast": cast,
                "turnout": round(100 * cast / (2 * reg_n), 2) if reg_n else 0,
                "seats": sum(
                    (x.get("WardSeatsWon") or 0) + (x.get("PRSeatsWon") or 0)
                    for x in parties
                ),
                "seats_expected": payload.get("SeatsExpected", 0),
                "councils": payload.get("MunicExpected", 0),
                "wards": payload.get("WardExpected", 0),
                "voting_districts": payload.get("VDExpected", 0),
                "hung": payload.get("HungCouncils", 0),
                "majority": payload.get("MajorityCouncils", 0),
                "parties": [
                    {
                        "id": x.get("ID"),
                        "abbr": party_meta.get(x.get("ID") if x.get("ID") is not None else -1, {}).get("Name")
                        or f"Party {x.get('ID')}",
                        "full_name": party_meta.get(x.get("ID") if x.get("ID") is not None else -1, {}).get("PartyFullName", ""),
                        "colour": party_meta.get(x.get("ID") if x.get("ID") is not None else -1, {}).get("sWebColour", "#8892a6"),
                        "votes": x.get("TotalValidVotes") or 0,
                        "pct": x.get("PercOfVotes") or 0,
                        "ward_seats": x.get("WardSeatsWon") or 0,
                        "pr_seats": x.get("PRSeatsWon") or 0,
                        "seats": (x.get("WardSeatsWon") or 0) + (x.get("PRSeatsWon") or 0),
                        "councils_won": x.get("CouncilsWon") or 0,
                    }
                    for x in parties
                ],
            }
            out["elections"][year]["parties"].sort(key=lambda x: -x["votes"])
            if year == 2021:
                out["provinces"] = {
                    str(pid): pb
                    for pid in PROVINCES
                    if (pb := _province_baseline(payload, pid))
                }
                out["structure"] = {
                    "wards": payload.get("WardExpected", 0),
                    "voting_districts": payload.get("VDExpected", 0),
                    "councils": payload.get("MunicExpected", 0),
                    "seats": payload.get("SeatsExpected", 0),
                }

        # 2026 structural targets, straight from the live event bundle.
        ev26 = await iec.fetch(client, iec.event_url(2026))
        p26 = iec.parse(ev26)
        if p26:
            out["structure_2026"] = {
                "wards": p26.get("WardExpected", 0),
                "voting_districts": p26.get("VDExpected", 0),
                "councils": p26.get("MunicExpected", 0),
                "seats": p26.get("SeatsExpected", 0),
                "registered_voters": (p26.get("PartyBallotResults") or [{}])[0].get(
                    "RegisteredVoters", 0
                ),
                "event_id": p26.get("ElectoralEventID"),
                "report_date": p26.get("ReportDate"),
            }
            out["sources"].append({"label": "IEC LGE 2026 bundle", "url": iec.event_url(2026),
                                   "status": ev26.status})

    return out


def write_baseline(data: dict[str, Any]) -> Path:
    PREPOLL_DIR.mkdir(parents=True, exist_ok=True)
    path = PREPOLL_DIR / "baseline.json"
    path.write_text(json.dumps(data, indent=1, ensure_ascii=False), encoding="utf-8")
    return path


def read_baseline() -> dict[str, Any] | None:
    path = PREPOLL_DIR / "baseline.json"
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return None
