"""SQLite persistence: snapshots, party metadata, poll log."""
from __future__ import annotations

import hashlib
import json
import sqlite3
import threading
from typing import Any

from .config import DB_PATH

_lock = threading.RLock()  # re-entrant: helpers call conn() while holding it
_conn: sqlite3.Connection | None = None

SCHEMA = """
CREATE TABLE IF NOT EXISTS snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER NOT NULL,
    level TEXT NOT NULL,          -- national | province | municipality
    key TEXT NOT NULL,            -- '0', '3', 'TSH'...
    report_date TEXT,
    fetched_at TEXT NOT NULL,
    sha TEXT NOT NULL,
    payload TEXT NOT NULL,
    UNIQUE(event_id, level, key, sha)
);
CREATE INDEX IF NOT EXISTS idx_snap_lookup ON snapshots(event_id, level, key, id DESC);

CREATE TABLE IF NOT EXISTS parties (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    full_name TEXT,
    colour TEXT,
    source TEXT
);

CREATE TABLE IF NOT EXISTS poll_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts TEXT NOT NULL,
    url TEXT NOT NULL,
    status INTEGER,
    ms INTEGER,
    bytes INTEGER,
    changed INTEGER DEFAULT 0,
    note TEXT
);
CREATE TABLE IF NOT EXISTS meta (
    k TEXT PRIMARY KEY,
    v TEXT
);
"""


def conn() -> sqlite3.Connection:
    global _conn
    with _lock:
        if _conn is None:
            _conn = sqlite3.connect(DB_PATH, check_same_thread=False)
            _conn.row_factory = sqlite3.Row
            _conn.execute("PRAGMA journal_mode=WAL")
            _conn.executescript(SCHEMA)
        return _conn


def save_snapshot(
    event_id: int,
    level: str,
    key: str,
    report_date: str | None,
    fetched_at: str,
    payload: dict[str, Any],
) -> bool:
    """Store a snapshot. Returns True when it differs from the newest one."""
    blob = json.dumps(payload, separators=(",", ":"), sort_keys=True)
    sha = hashlib.sha256(blob.encode()).hexdigest()
    with _lock:
        c = conn()
        row = c.execute(
            "SELECT sha FROM snapshots WHERE event_id=? AND level=? AND key=? "
            "ORDER BY id DESC LIMIT 1",
            (event_id, level, key),
        ).fetchone()
        if row and row["sha"] == sha:
            return False
        c.execute(
            "INSERT OR IGNORE INTO snapshots"
            "(event_id, level, key, report_date, fetched_at, sha, payload)"
            " VALUES (?,?,?,?,?,?,?)",
            (event_id, level, key, report_date, fetched_at, sha, blob),
        )
        c.commit()
    return True


def latest_snapshot(event_id: int, level: str, key: str) -> dict[str, Any] | None:
    with _lock:
        row = conn().execute(
            "SELECT payload, report_date, fetched_at, sha FROM snapshots "
            "WHERE event_id=? AND level=? AND key=? ORDER BY id DESC LIMIT 1",
            (event_id, level, key),
        ).fetchone()
    if not row:
        return None
    return {
        "payload": json.loads(row["payload"]),
        "report_date": row["report_date"],
        "fetched_at": row["fetched_at"],
        "sha": row["sha"],
    }


def timeline(event_id: int, level: str = "national", key: str = "0") -> list[dict]:
    """Snapshot history, compacted to the fields needed for trend charts."""
    with _lock:
        rows = conn().execute(
            "SELECT payload, fetched_at FROM snapshots "
            "WHERE event_id=? AND level=? AND key=? ORDER BY id ASC",
            (event_id, level, key),
        ).fetchall()
    out = []
    for r in rows:
        p = json.loads(r["payload"])
        party = next(
            (x for x in p.get("PartyBallotResults", []) if x.get("ID") == 7), None
        )
        out.append(
            {
                "t": p.get("ReportDate") or r["fetched_at"],
                "vds": p.get("VDsComplete", 0),
                "vds_expected": p.get("VDExpected", 0),
                "votes": p.get("ValidVotesCast", 0)
                or (party or {}).get("ValidVotesCast", 0),
                "seats": p.get("SeatsComplete", 0),
                "councils": p.get("MuncipalitiesComplete", 0),
            }
        )
    return out


def log_poll(url: str, ts: str, status: int | None, ms: int, nbytes: int,
             changed: bool, note: str = "") -> None:
    with _lock:
        c = conn()
        c.execute(
            "INSERT INTO poll_log(ts,url,status,ms,bytes,changed,note) VALUES (?,?,?,?,?,?,?)",
            (ts, url, status, ms, nbytes, int(changed), note),
        )
        c.execute("DELETE FROM poll_log WHERE id < (SELECT MAX(id) - 500 FROM poll_log)")
        c.commit()


def poll_health(limit: int = 20) -> dict:
    with _lock:
        c = conn()
        rows = c.execute(
            "SELECT ts,status,ms,changed FROM poll_log ORDER BY id DESC LIMIT ?", (limit,)
        ).fetchall()
        total = c.execute(
            "SELECT COUNT(*) n, SUM(changed) ch, AVG(ms) avg_ms FROM poll_log"
        ).fetchone()
    return {
        "recent": [dict(r) for r in rows],
        "total_polls": total["n"] or 0,
        "changes": total["ch"] or 0,
        "avg_ms": round(total["avg_ms"] or 0, 1),
    }


def upsert_parties(rows: list[dict], source: str) -> None:
    with _lock:
        c = conn()
        for r in rows:
            c.execute(
                "INSERT INTO parties(id,name,full_name,colour,source) VALUES (?,?,?,?,?) "
                "ON CONFLICT(id) DO UPDATE SET "
                "name=CASE WHEN excluded.name<>'' THEN excluded.name ELSE parties.name END, "
                "full_name=CASE WHEN excluded.full_name<>'' THEN excluded.full_name "
                "ELSE parties.full_name END, "
                "colour=COALESCE(NULLIF(excluded.colour,''), parties.colour), "
                "source=excluded.source",
                (
                    r["ID"],
                    (r.get("Name") or "").strip(),
                    (r.get("PartyFullName") or "").strip(),
                    r.get("sWebColour"),
                    source,
                ),
            )
        c.commit()


def get_parties() -> dict[int, dict]:
    with _lock:
        rows = conn().execute("SELECT * FROM parties").fetchall()
    return {r["id"]: dict(r) for r in rows}


def set_meta(k: str, v: str) -> None:
    with _lock:
        c = conn()
        c.execute("INSERT INTO meta(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=?", (k, v, v))
        c.commit()


def get_meta(k: str, default: str | None = None) -> str | None:
    with _lock:
        row = conn().execute("SELECT v FROM meta WHERE k=?", (k,)).fetchone()
    return row["v"] if row else default
