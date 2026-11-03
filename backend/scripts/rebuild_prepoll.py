#!/usr/bin/env python3
"""Rebuild the pre-poll baseline from the IEC's published sources.

    python scripts/rebuild_prepoll.py [--serve-check]

Writes data/prepoll/baseline.json and prints a reconciliation summary:
registration total, per-election turnout and the reconciled 2021 result.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import prepoll  # noqa: E402


async def main(serve_check: bool) -> int:
    data = await prepoll.build_baseline()
    path = prepoll.write_baseline(data)

    reg = data["registration"]
    print(f"registration  {reg['total']:,} voters as at {reg['as_at']}")
    print(f"provinces     {len(reg['provinces'])} (sum {sum(reg['provinces'].values()):,})")
    for year, e in data["elections"].items():
        print(
            f"{year}          turnout {e['turnout']:.2f}% "
            f"· {e['seats']:,} seats · {e['hung']} hung councils"
        )
    if "2021" in data["elections"]:
        top = data["elections"]["2021"]["parties"][:3]
        print("2021 top      " + ", ".join(f"{p['abbr']} {p['pct']}%" for p in top))
    print(f"structure2026 {data.get('structure_2026')}")
    print(f"wrote         {path} ({path.stat().st_size:,} bytes)")

    if serve_check:
        import subprocess

        check = subprocess.run(
            [sys.executable, "-m", "unittest", "discover", "-s", "tests"],
            cwd=Path(__file__).resolve().parent.parent,
            capture_output=True,
            text=True,
        )
        print(check.stderr.strip().splitlines()[-1] if check.stderr else "")
        return check.returncode
    return 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--serve-check", action="store_true", help="also run the test suite")
    args = parser.parse_args()
    raise SystemExit(asyncio.run(main(args.serve_check)))
