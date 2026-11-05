"""Background poller: reads the IEC feed, stores snapshots, fans out events."""
from __future__ import annotations

import asyncio
import contextlib
import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Any

from . import iec, store
from .config import (
    CURRENT_EVENT,
    CURRENT_YEAR,
    POLL_IDLE_SECONDS,
    POLL_LIVE_SECONDS,
    POLL_QUIET_SECONDS,
    POLLS_CLOSE,
    POLLS_OPEN,
    PROVINCES,
)

log = logging.getLogger("ballotwatch.poller")
SAST = timezone(timedelta(hours=2))


def now_iso() -> str:
    return datetime.now(SAST).isoformat(timespec="seconds")


def parse_dt(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=SAST)


class Hub:
    """Minimal pub/sub so the browser can be pushed a tick instead of polling."""

    def __init__(self) -> None:
        self.subscribers: set[asyncio.Queue] = set()

    def subscribe(self) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue(maxsize=8)
        self.subscribers.add(q)
        return q

    def unsubscribe(self, q: asyncio.Queue) -> None:
        self.subscribers.discard(q)

    def publish(self, event: dict[str, Any]) -> None:
        for q in list(self.subscribers):
            with contextlib.suppress(asyncio.QueueFull):
                q.put_nowait(event)


class Poller:
    def __init__(self) -> None:
        self.hub = Hub()
        self.client = iec.make_client()
        self.parties: dict[int, dict] = {}
        self.state: dict[str, Any] = {
            "status": "starting",
            "seq": 0,
            "polled_at": None,
            "report_date": None,
            "last_change": None,
            "error": None,
            "interval": POLL_IDLE_SECONDS,
            "loading": False,
        }
        self._task: asyncio.Task | None = None
        self._run_lock = asyncio.Lock()
        self.province_last_good: dict[int, dict] = {}

    # -- lifecycle ---------------------------------------------------------
    async def start(self) -> None:
        # Never block HTTP startup on the upstream feed: load party metadata and
        # the first tick inside the background task instead.
        self._task = asyncio.create_task(self._boot(), name="iec-poller")

    async def _boot(self) -> None:
        try:
            await self.load_parties()
        except Exception as exc:  # noqa: BLE001
            log.warning("party metadata load failed: %s", exc)
        await self._loop()

    async def stop(self) -> None:
        if self._task:
            self._task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._task
        await self.client.aclose()

    async def load_parties(self) -> None:
        """Party metadata (names, colours) comes from the IEC's own PartyList.

        The 2026 list is not published yet, so fall back to the most recent
        published lists, newest first. Unresolved IDs are shown as 'Party N'
        rather than being guessed."""
        for url, source in (
            (iec.party_list_url("lge", 2026), "lge2026"),
            (iec.party_list_url("npe", 2024), "npe2024"),
            (iec.party_list_url("lge", 2021), "lge2021"),
        ):
            fetched = await iec.fetch(self.client, url)
            if fetched.ok:
                try:
                    rows = json.loads(fetched.text.lstrip("\ufeff"))
                except Exception:  # noqa: BLE001
                    continue
                store.upsert_parties(rows, source)
        self.parties = store.get_parties()
        log.info("party metadata: %s parties", len(self.parties))

    # -- polling -----------------------------------------------------------
    async def _loop(self) -> None:
        while True:
            try:
                await self.tick()
            except asyncio.CancelledError:
                raise
            except Exception as exc:  # noqa: BLE001 - never let the loop die
                log.exception("poll failed")
                self.state["error"] = str(exc)
                self.state["status"] = "degraded"
            await asyncio.sleep(self.state.get("interval") or POLL_IDLE_SECONDS)

    async def tick(self) -> dict[str, Any]:
        async with self._run_lock:
            self.state["loading"] = True
            url = iec.event_url(CURRENT_YEAR)
            fetched = await iec.fetch(self.client, url)
            payload = iec.parse(fetched)
            ts = now_iso()
            changed = False

            if payload is None:
                store.log_poll(url, ts, fetched.status, fetched.ms, fetched.nbytes, False,
                               "unreadable response")
                self.state.update(
                    error=None if fetched.status == 200 else f"IEC feed returned HTTP {fetched.status}",
                    polled_at=ts,
                    status="degraded" if fetched.status != 200 else "idle",
                )
                self.state["interval"] = POLL_IDLE_SECONDS
                return self.state

            changed = store.save_snapshot(
                CURRENT_EVENT, "national", "0", payload.get("ReportDate"), ts, payload
            )
            store.log_poll(url, ts, fetched.status, fetched.ms, fetched.nbytes, changed)

            if changed:
                self.state["last_change"] = ts
                self.state["seq"] += 1
            self.state.update(
                polled_at=ts,
                report_date=payload.get("ReportDate"),
                error=None,
                status="ok",
            )

            # Province bundles: the IEC publishes these per province once
            # counting starts. They are the cheapest reliable provincial feed;
            # if they are missing we fall back to the municipality tree that
            # rides along with the national document.
            provinces = await self._poll_provinces(payload)
            if provinces:
                self.province_last_good = provinces

            live = parse_dt(payload.get("ReportDate"))
            now = datetime.now(SAST)
            age = (now - live).total_seconds() if live else 10**9
            counting_started = bool(
                payload.get("ValidVotesCast") or payload.get("VDsComplete")
            )
            opens = parse_dt(POLLS_OPEN)
            before_open = bool(opens and now < opens)
            if before_open:
                interval = POLL_QUIET_SECONDS
            elif counting_started and age < 900:
                interval = POLL_LIVE_SECONDS
            else:
                interval = POLL_IDLE_SECONDS
            self.state["interval"] = interval

            self.hub.publish({"type": "tick", "seq": self.state["seq"], "changed": changed})
            self.state["loading"] = False
            return self.state

    async def _poll_provinces(self, national_payload: dict) -> dict[int, dict]:
        # The dedicated province panels are the complete document: all 44
        # KwaZulu-Natal municipalities, including eThekwini. The province tree
        # embedded in the national bundle is trimmed (it omitted eThekwini and
        # six other KZN councils), so it is a fallback only — never the source.
        tasks = {
            pid: asyncio.create_task(
                iec.fetch(self.client, iec.event_url(CURRENT_YEAR, f"Province{pid}"))
            )
            for pid in PROVINCES
        }
        out: dict[int, dict] = {}
        for pid, task in tasks.items():
            fetched = await task
            payload = iec.parse(fetched)
            if not payload:
                continue
            store.log_poll(fetched.url, now_iso(), fetched.status, fetched.ms,
                           fetched.nbytes, False, f"province {pid}")
            store.save_snapshot(
                CURRENT_EVENT, "province", str(pid), payload.get("ReportDate"), now_iso(), payload
            )
            out[pid] = iec.province_view(payload, self.parties)

        if out:
            return out

        embedded = {
            p.get("ProvinceID"): p
            for p in (national_payload.get("ProvinceResults") or [])
            if p.get("ProvinceID")
        }
        for pid, p in embedded.items():
            store.save_snapshot(
                CURRENT_EVENT, "province", str(pid), p.get("ReportDate"), now_iso(), p
            )
        return {pid: iec.province_view(p, self.parties) for pid, p in embedded.items()}

    # -- views -------------------------------------------------------------
    def national(self) -> dict[str, Any]:
        snap = store.latest_snapshot(CURRENT_EVENT, "national", "0")
        if not snap:
            return {"available": False, "parties": [], "report_date": None}
        view = iec.national_view(snap["payload"], self.parties)
        view.update(
            available=True,
            fetched_at=snap["fetched_at"],
            sha=snap["sha"][:12],
        )
        return view

    def provinces(self) -> list[dict]:
        out = []
        for pid in PROVINCES:
            if pid in self.province_last_good:
                out.append(self.province_last_good[pid])
                continue
            snap = store.latest_snapshot(CURRENT_EVENT, "province", str(pid))
            if snap:
                out.append(iec.province_view(snap["payload"], self.parties))
        return out


poller = Poller()
