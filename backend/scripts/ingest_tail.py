#!/usr/bin/env python3
"""Rebuild the per-party national tally from ward-level results.

The national bundle collapses the long tail into one "OTHER" row; the
per-municipality bundles carry a party ballot in every ward. This script walks
the 213 municipalities (re-fetching only those whose report timestamp moved),
sums the wards, and writes data/tail.json.

    backend/.venv/bin/python3 backend/scripts/ingest_tail.py
    backend/.venv/bin/python3 backend/scripts/ingest_tail.py --force

Designed to run every ten minutes from the publishing cron; a full pass takes
~4 seconds on a warm connection and costs nine small province requests when
nothing has changed.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT / "backend"))

from app import iec, tail  # noqa: E402
from app.poller import Poller  # noqa: E402


async def main(force: bool) -> int:
    poller = Poller()
    try:
        await poller.load_parties()  # party abbreviations live in the store
        data = await tail.refresh(force=force)
        national = poller.national()
    finally:
        await poller.client.aclose()

    merged = tail.with_other(data, national) if national else data
    other = merged.get("other")
    cov = data["coverage"]
    print(
        f"tail: {len(data['parties'])} parties · {cov['wards_with_votes']}/{cov['wards_expected']} wards "
        f"· {cov['municipalities']} municipalities ({cov['refetched']} refreshed)"
    )
    if other:
        print(
            f"other: {other['parties']} parties · {other['votes']:,} votes ({other['pct']}%) "
            f"vs feed {other['feed_votes']:,} · delta {other['delta_pct']}%"
        )
    return 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true", help="re-fetch every municipality")
    args = ap.parse_args()
    raise SystemExit(asyncio.run(main(args.force)))
