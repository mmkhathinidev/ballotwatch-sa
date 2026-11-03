"""Configuration for the IEC 2026 LGE data service."""
from __future__ import annotations

import os
from pathlib import Path

APP_DIR = Path(__file__).resolve().parent
PROJECT_DIR = APP_DIR.parent.parent
DATA_DIR = Path(os.getenv("LGE_DATA_DIR", PROJECT_DIR / "data"))
DATA_DIR.mkdir(parents=True, exist_ok=True)

DB_PATH = DATA_DIR / "election.sqlite3"
PREPOLL_DIR = DATA_DIR / "prepoll"

# IEC publishes one "LiteMaps" JSON bundle per electoral event on its public
# results dashboard. These files are what the official dashboard itself reads.
IEC_BASE = os.getenv(
    "IEC_BASE", "https://results.elections.org.za/dashboards/lge/MapsJason"
)
IEC_EVENTS = {2000: 2, 2006: 95, 2011: 197, 2016: 402, 2021: 1091, 2026: 1887}
# LGE_YEAR lets you replay a completed election (e.g. 2021) against the same
# live pipeline — useful for rehearsing election night and for screenshots.
CURRENT_YEAR = int(os.getenv("LGE_YEAR", "2026"))
CURRENT_EVENT = IEC_EVENTS[CURRENT_YEAR]

POLL_LIVE_SECONDS = int(os.getenv("POLL_LIVE_SECONDS", "30"))
POLL_IDLE_SECONDS = int(os.getenv("POLL_IDLE_SECONDS", "120"))
POLL_QUIET_SECONDS = int(os.getenv("POLL_QUIET_SECONDS", "600"))

USER_AGENT = (
    "BallotWatchSA/1.0 (+https://github.com/mmkhathinidev; civic-tech dashboard; "
    "contact via repository) httpx"
)

# Election facts published by the IEC for the 2026 LGE.
POLLING_DAY = "2026-11-04"
POLLS_OPEN = "2026-11-04T07:00:00+02:00"
POLLS_CLOSE = "2026-11-04T21:00:00+02:00"

PROVINCES = {
    1: "Eastern Cape",
    2: "Free State",
    3: "Gauteng",
    4: "KwaZulu-Natal",
    5: "Limpopo",
    6: "Mpumalanga",
    7: "North West",
    8: "Northern Cape",
    9: "Western Cape",
}
PROVINCE_ORDER = [3, 4, 1, 9, 5, 6, 7, 2, 8]  # by registered voters, desc
