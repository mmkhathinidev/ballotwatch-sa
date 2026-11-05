#!/usr/bin/env python3
"""Export a self-contained static build of the dashboard.

For hosting where no Python process can run — GitHub Pages, Namecheap shared
hosting, S3, Netlify — this script polls the IEC feed once, writes the same JSON
the API would serve as plain files, and copies the SPA build next to them.

    python backend/scripts/export_static.py --out public

The result is a snapshot: pages are as fresh as the last export. The UI says so
explicitly when `meta.static` is true.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import shutil
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT / "backend"))

from app import iec, prepoll, store  # noqa: E402
from app import tail as tail_mod  # noqa: E402
from app.config import (  # noqa: E402
    CURRENT_EVENT,
    CURRENT_YEAR,
    POLLING_DAY,
    POLLS_CLOSE,
    POLLS_OPEN,
    PROVINCES,
    PROVINCE_ORDER,
)
from app.poller import Poller  # noqa: E402

SAST = timezone(timedelta(hours=2))


def phase(national: dict) -> str:
    now = datetime.now(SAST)
    if national.get("percent_complete", {}).get("voting_districts", 0) >= 100:
        return "final"
    if now < datetime.fromisoformat(POLLS_OPEN):
        return "pre-poll"
    if now <= datetime.fromisoformat(POLLS_CLOSE):
        return "polls-open"
    return "counting"


def write(path: Path, payload: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


async def build_api(poller: Poller) -> dict[str, Any]:
    baseline = prepoll.read_baseline() or {}
    national = poller.national()
    provinces = poller.provinces()
    provinces.sort(
        key=lambda r: PROVINCE_ORDER.index(r["province_id"])
        if r.get("province_id") in PROVINCE_ORDER
        else 99
    )
    generated = datetime.now(SAST).isoformat(timespec="seconds")

    # The ward-level ingest runs on its own schedule (see scripts/ingest_tail.py);
    # the exporter only folds the latest result in, so a slow ingest can never
    # stall a publish.
    span_tail = tail_mod.read()
    span_tail = tail_mod.with_other(span_tail, national) if span_tail else None

    meta = {
        "app": "BallotWatch SA",
        "election": "2026 Local Government Elections",
        "country": "South Africa",
        "polling_day": POLLING_DAY,
        "polls_open": POLLS_OPEN,
        "polls_close": POLLS_CLOSE,
        "phase": phase(national),
        "server_time": generated,
        "event_id": CURRENT_EVENT,
        "year": CURRENT_YEAR,
        "replay": CURRENT_YEAR != 2026,
        "static": True,
        "generated_at": generated,
        "feed": {
            "status": "static",
            "polled_at": generated,
            "last_change": generated,
            "interval_seconds": 600,
            "error": None,
            "total_polls": 1,
            "changes": 1,
            "avg_latency_ms": 0,
            "recent": [],
        },
        "structure": baseline.get("structure_2026", {}),
        "report_date": national.get("report_date"),
        "has_counts": bool(national.get("votes_cast")),
        "provinces": [{"id": pid, "name": PROVINCES[pid]} for pid in PROVINCE_ORDER],
    }

    sources = {
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
            "This static build reads the public results feed instead.",
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
            "This copy is a snapshot: it refreshes when the publishing job runs again.",
        ],
    }

    return {
        "meta": meta,
        "national": national,
        "provinces": {"count": len(provinces), "provinces": provinces},
        "prepoll": baseline,
        "sources": sources,
        "history": {"points": store.timeline(CURRENT_EVENT)},
        "tail": span_tail,
    }


async def main(out: Path, dist: Path) -> int:
    poller = Poller()
    try:
        await poller.load_parties()
        await poller.tick()
        payloads = await build_api(poller)
    finally:
        await poller.client.aclose()

    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True)

    if dist.exists():
        for item in dist.iterdir():
            target = out / item.name
            if item.is_dir():
                shutil.copytree(item, target)
            else:
                shutil.copy(item, target)
    else:
        print(f"warning: no SPA build at {dist}; exporting JSON only", file=sys.stderr)

    for name, payload in payloads.items():
        if payload is None:
            continue
        write(out / "api" / f"{name}.json", payload)

    # 404 fallback for GitHub Pages / static hosts on deep links
    if (out / "index.html").exists():
        shutil.copy(out / "index.html", out / "404.html")

    national: dict[str, Any] = payloads["national"]
    print(f"exported to {out}")
    print(f"  report_date   {national.get('report_date')}")
    print(f"  ballots cast  {national.get('votes_cast', 0):,}")
    print(f"  provinces     {len(payloads['provinces']['provinces'])}")
    print(f"  files         {sum(1 for _ in out.rglob('*') if _.is_file())}")
    return 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(ROOT / "static-export"), help="output directory")
    ap.add_argument("--dist", default=str(ROOT / "frontend" / "dist"), help="SPA build directory")
    args = ap.parse_args()
    raise SystemExit(asyncio.run(main(Path(args.out), Path(args.dist))))
