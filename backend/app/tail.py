"""Ward-level tail aggregation.

The national bundle lists the parties carrying the contest and folds the rest
into one aggregate "OTHER" row (ID -2). The per-municipality bundles do not:
each ward carries a party ballot with *every* contesting party, so summing the
wards rebuilds the long tail party by party — and reconciles against the
national figures while doing it.

Cost control: the nine province panels list every municipality with its own
report timestamp. A municipality's ward file is only re-fetched when that
timestamp moves, so a refresh normally costs nine small requests plus whatever
actually changed.
"""
from __future__ import annotations

import asyncio
import json
from datetime import datetime
from typing import Any

import httpx

from .config import CURRENT_EVENT, CURRENT_YEAR, DATA_DIR, IEC_BASE, PROVINCES, USER_AGENT
from . import store

CACHE_PATH = DATA_DIR / "tail-cache.json"
OUT_PATH = DATA_DIR / "tail.json"
CONCURRENCY = 8


def _url(panel: str) -> str:
    return f"{IEC_BASE}/{CURRENT_YEAR}/EEID{CURRENT_EVENT}{panel}.js"


def _now() -> str:
    return datetime.now().astimezone().isoformat(timespec="seconds")


def _pct(part: float, whole: float, digits: int = 2) -> float:
    return round(100.0 * part / whole, digits) if whole else 0.0


async def _get(client: httpx.AsyncClient, url: str) -> Any:
    r = await client.get(url, params={"rnd": f"{datetime.now().timestamp():.6f}"})
    r.raise_for_status()
    return json.loads(r.text.lstrip("\ufeff"))


async def _municipalities(client: httpx.AsyncClient) -> dict[int, dict]:
    """Every municipality in the event, with its latest report timestamp."""
    found: dict[int, dict] = {}
    for pid in PROVINCES:
        try:
            payload = await _get(client, _url(f"Province{pid}"))
        except httpx.HTTPError:
            continue
        for m in payload.get("MunicipalityResults") or []:
            mid = m.get("MunicipalityID")
            if mid:
                found[mid] = {
                    "id": mid,
                    "name": m.get("Municipality") or str(mid),
                    "report_date": m.get("ReportDate"),
                }
    return found


async def _ward_totals(client: httpx.AsyncClient, mid: int, sem: asyncio.Semaphore) -> dict | None:
    async with sem:
        try:
            d = await _get(client, _url(f"Munic{mid}"))
        except (httpx.HTTPError, ValueError):
            return None
    votes: dict[int, int] = {}
    names: dict[int, str] = {}
    wards_with_votes = 0
    valid = 0
    for w in d.get("WardResults") or []:
        rows = w.get("PartyBallotResults") or []
        ward_valid = 0
        for row in rows:
            v = row.get("TotalValidVotes") or 0
            if v:
                pid = row.get("ID")
                votes[pid] = votes.get(pid, 0) + v
                if row.get("Name") and pid not in names:
                    names[pid] = row["Name"]
                ward_valid += v
        if ward_valid:
            wards_with_votes += 1
        valid += ward_valid
    return {
        "report_date": d.get("ReportDate"),
        "votes": {str(k): v for k, v in votes.items()},
        "names": {str(k): v for k, v in names.items()},
        "wards_with_votes": wards_with_votes,
        "wards": len(d.get("WardResults") or []),
        "valid_votes": valid,
    }


def _read_cache() -> dict[str, Any]:
    try:
        return json.loads(CACHE_PATH.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {"municipalities": {}}


def _write(path, payload) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":"), default=str), encoding="utf-8")


async def refresh(force: bool = False) -> dict[str, Any]:
    """Rebuild the per-party national tally from ward-level results."""
    cache = _read_cache()
    cached: dict[str, dict] = cache.get("municipalities") or {}

    async with httpx.AsyncClient(
        timeout=httpx.Timeout(60.0, connect=15.0),
        headers={"User-Agent": USER_AGENT, "Accept": "application/json,text/plain,*/*"},
        follow_redirects=True,
        limits=httpx.Limits(max_connections=CONCURRENCY, max_keepalive_connections=CONCURRENCY),
    ) as client:
        munis = await _municipalities(client)
        stale = [
            mid for mid, m in munis.items()
            if force or m.get("report_date") != (cached.get(str(mid)) or {}).get("report_date")
        ]
        sem = asyncio.Semaphore(CONCURRENCY)
        fetched = await asyncio.gather(*(_ward_totals(client, mid, sem) for mid in stale))
        for mid, result in zip(stale, fetched):
            if result is not None:
                cached[str(mid)] = {**result, "name": munis[mid]["name"]}

    totals: dict[int, int] = {}
    names: dict[int, str] = {}
    wards = wards_expected = 0
    valid = 0
    for mid, m in munis.items():
        entry = cached.get(str(mid))
        if not entry:
            continue
        for pid, v in (entry.get("votes") or {}).items():
            totals[int(pid)] = totals.get(int(pid), 0) + int(v)
        for pid, n in (entry.get("names") or {}).items():
            names.setdefault(int(pid), n)
        wards += entry.get("wards_with_votes") or 0
        wards_expected += entry.get("wards") or 0
        valid += entry.get("valid_votes") or 0

    meta = store.get_parties()
    parties = []
    for pid, votes in totals.items():
        info = meta.get(pid) or {}
        parties.append({
            "id": pid,
            "abbr": info.get("name") or names.get(pid) or f"Party {pid}",
            "name": info.get("full_name") or names.get(pid) or f"Party ID {pid}",
            "votes": votes,
            "pct": _pct(votes, valid),
        })
    parties.sort(key=lambda p: -p["votes"])

    out = {
        "generated_at": _now(),
        "source": "IEC per-municipality ward bundles, party ballot results",
        "method": "sum of every ward's party ballot, all 213 municipalities",
        "coverage": {
            "municipalities": len(munis),
            "municipalities_cached": len([m for m in munis if str(m) in cached]),
            "refetched": len(stale),
            "wards_with_votes": wards,
            "wards_expected": wards_expected,
            "valid_votes": valid,
        },
        "parties": parties,
    }
    _write(CACHE_PATH, {"municipalities": cached})
    _write(OUT_PATH, out)
    return out


def read() -> dict[str, Any] | None:
    try:
        return json.loads(OUT_PATH.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def with_other(tail: dict[str, Any], national: dict[str, Any]) -> dict[str, Any]:
    """Attach the tail's own "Other" block, reconciled against the IEC's row.

    The feed's OTHER line and the ward-level sum are two readings of the same
    ballots taken minutes apart, so a small delta is expected; a large one means
    the ingest is incomplete and the dashboard should say so.
    """
    listed = {p.get("id") for p in national.get("parties") or [] if not p.get("residual")}
    feed_other = next((p for p in national.get("parties") or [] if p.get("residual")), {})
    outside = [p for p in tail.get("parties") or [] if p.get("id") not in listed]

    valid_total = tail.get("coverage", {}).get("valid_votes") or 0
    votes = sum(p["votes"] for p in outside)
    feed_votes = feed_other.get("votes") or 0
    delta = round(100.0 * (votes - feed_votes) / feed_votes, 2) if feed_votes else None

    enriched = dict(tail)
    enriched["other"] = {
        "parties": len(outside),
        "votes": votes,
        "pct": _pct(votes, valid_total),
        "feed_votes": feed_votes,
        "feed_pct": feed_other.get("pct"),
        "delta_pct": delta,
        "largest": outside[:12],
        "members": outside,
    }
    return enriched
