"""BallotWatch SA — API + static host for the 2026 Local Government Elections."""
from __future__ import annotations

import asyncio
import json
import os
import time
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles

from . import iec, prepoll, store, tail
from .config import (
    CURRENT_EVENT,
    CURRENT_YEAR,
    POLLING_DAY,
    POLLS_CLOSE,
    POLLS_OPEN,
    PROVINCES,
    PROVINCE_ORDER,
)
from .poller import poller

SAST = timezone(timedelta(hours=2))
BUILD_DIR = Path(
    os.getenv(
        "FRONTEND_DIR",
        Path(__file__).resolve().parent.parent.parent / "frontend" / "dist",
    )
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    if not prepoll.read_baseline():
        try:
            prepoll.write_baseline(await prepoll.build_baseline())
        except Exception:  # noqa: BLE001 - pre-poll data is best-effort at boot
            pass
    await poller.start()
    try:
        yield
    finally:
        await poller.stop()


app = FastAPI(
    title="BallotWatch SA",
    description="Live and pre-poll analytics for South Africa's 2026 Local Government Elections, "
    "sourced from the Electoral Commission's public results feed.",
    version="1.0.0",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


def _phase() -> str:
    now = datetime.now(SAST)
    opens = datetime.fromisoformat(POLLS_OPEN)
    closes = datetime.fromisoformat(POLLS_CLOSE)
    nat = poller.national()
    if nat.get("available") and nat.get("percent_complete", {}).get("voting_districts", 0) >= 100:
        return "final"
    if now < opens:
        return "pre-poll"
    if now <= closes:
        return "polls-open"
    return "counting"


def _feed_health() -> dict:
    health = store.poll_health()
    last = poller.state.get("polled_at")
    return {
        "status": poller.state.get("status"),
        "polled_at": last,
        "last_change": poller.state.get("last_change"),
        "interval_seconds": poller.state.get("interval"),
        "error": poller.state.get("error"),
        "total_polls": health["total_polls"],
        "changes": health["changes"],
        "avg_latency_ms": health["avg_ms"],
        "recent": health["recent"][:12],
    }


@app.get("/api/health")
async def health():
    return {"ok": True, "phase": _phase(), "feed": _feed_health()}


@app.get("/api/meta")
async def meta():
    nat = poller.national()
    baseline = prepoll.read_baseline() or {}
    structure = baseline.get("structure_2026", {})
    return {
        "app": "BallotWatch SA",
        "election": "2026 Local Government Elections",
        "country": "South Africa",
        "polling_day": POLLING_DAY,
        "polls_open": POLLS_OPEN,
        "polls_close": POLLS_CLOSE,
        "phase": _phase(),
        "server_time": datetime.now(SAST).isoformat(timespec="seconds"),
        "event_id": CURRENT_EVENT,
        "year": CURRENT_YEAR,
        "replay": CURRENT_YEAR != 2026,
        "feed": _feed_health(),
        "structure": structure,
        "report_date": nat.get("report_date"),
        "has_counts": bool(nat.get("votes_cast")),
        "provinces": [{"id": pid, "name": PROVINCES[pid]} for pid in PROVINCE_ORDER],
    }


@app.get("/api/live/national")
async def live_national():
    return poller.national()


@app.get("/api/live/provinces")
async def live_provinces():
    rows = poller.provinces()
    rows.sort(key=lambda r: PROVINCE_ORDER.index(r["province_id"])
              if r.get("province_id") in PROVINCE_ORDER else 99)
    return {"count": len(rows), "provinces": rows}


@app.get("/api/live/provinces/{pid}")
async def live_province(pid: int):
    row = next((r for r in poller.provinces() if r.get("province_id") == pid), None)
    if not row:
        raise HTTPException(404, "No provincial bundle published for that province yet")
    return row


@app.get("/api/live/municipalities")
async def live_municipalities(
    province_id: int | None = None,
    q: str | None = Query(default=None, min_length=2),
    limit: int = 300,
):
    rows: list[dict] = []
    for prov in poller.provinces():
        if province_id and prov.get("province_id") != province_id:
            continue
        for m in prov.get("municipalities", []):
            rows.append({**m, "province_id": prov["province_id"], "province": prov["province"]})
    if q:
        needle = q.lower()
        rows = [r for r in rows if needle in (r.get("name") or "").lower()]
    rows.sort(key=lambda r: -r.get("registered_voters", 0))
    return {"count": len(rows), "results": rows[:limit]}


@app.get("/api/history")
async def history(level: str = "national", key: str = "0"):
    return {"points": store.timeline(CURRENT_EVENT, level, key)}


@app.get("/api/prepoll")
async def prepoll_data():
    baseline = prepoll.read_baseline()
    if not baseline:
        raise HTTPException(503, "Pre-poll baseline not built yet")
    return baseline


@app.post("/api/prepoll/rebuild")
async def rebuild_prepoll():
    baseline = await prepoll.build_baseline()
    prepoll.write_baseline(baseline)
    return {"ok": True, "generated_at": baseline.get("generated_at")}


@app.get("/api/parties")
async def parties():
    return {"parties": sorted(store.get_parties().values(), key=lambda p: p["name"])}


@app.get("/api/tail")
async def tail_results():
    """Per-party national totals rebuilt from ward-level results."""
    data = tail.read()
    if not data:
        raise HTTPException(503, "Ward-level tail not ingested yet")
    return tail.with_other(data, poller.national())


@app.get("/api/sources")
async def sources():
    baseline = prepoll.read_baseline() or {}
    return {
        "primary": {
            "name": "IEC Results Dashboard — 2026 LGE event bundle",
            "url": iec.event_url(CURRENT_YEAR),
            "note": "Machine-readable JSON published by the Electoral Commission; "
            "refreshed by the IEC every 5–10 minutes while counting.",
            "event_id": CURRENT_EVENT,
        },
        "official_api": {
            "name": "IEC Elections API",
            "url": "https://api.elections.org.za",
            "note": "Credentialed REST API (username/password issued by webmaster@elections.org.za). "
            "BallotWatch runs keyless against the public results feed by default and can be "
            "pointed at the credentialed API instead.",
        },
        "prepoll": baseline.get("sources", []),
        "registration": {
            "name": "IEC Voter Registration Statistics",
            "url": prepoll.REGISTRATION_URL,
            "as_at": (baseline.get("registration") or {}).get("as_at"),
        },
        "caveats": [
            "Figures are provisional until the IEC declares a result.",
            "Ward and PR seats are counted per ballot; seat totals move independently of vote share.",
            "Party 1909 does not appear in any published IEC party list yet and is shown by ID.",
        ],
    }


@app.get("/api/stream")
async def stream():
    q = poller.hub.subscribe()

    async def gen():
        try:
            yield "retry: 5000\n\n"
            last = 0
            while True:
                try:
                    event = await asyncio.wait_for(q.get(), timeout=25)
                    last = event.get("seq", last)
                    yield f"event: tick\ndata: {json.dumps(event)}\n\n"
                except asyncio.TimeoutError:
                    yield f": keepalive {int(time.time())}\n\n"
        finally:
            poller.hub.unsubscribe(q)

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ---- static frontend (built with `npm run build`) -------------------------
if BUILD_DIR.exists():
    app.mount("/assets", StaticFiles(directory=BUILD_DIR / "assets"), name="assets")

    @app.get("/{full_path:path}")
    async def spa(full_path: str):
        candidate = BUILD_DIR / full_path
        if full_path and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(BUILD_DIR / "index.html")
