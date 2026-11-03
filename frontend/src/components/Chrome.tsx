import { FeedHealth, Meta } from "../lib/api";
import { duration, relative, sast } from "../lib/format";
import { useNow } from "../lib/useDashboard";

export function TopBar({ meta, error }: { meta: Meta | null; error: string | null }) {
  const feed = meta?.feed;
  return (
    <div className="topbar">
      <div className="topbar-inner">
        <div className="brand">
          <div className="brand-mark">BW</div>
          <div className="brand-text">
            <span className="brand-name">BallotWatch SA</span>
            <span className="brand-sub">Local Government Elections · 2026</span>
          </div>
        </div>
        <div className="topbar-right">
          <FeedPill feed={feed} />
          <span className="pill">
            IEC report <strong>{sast(meta?.report_date)}</strong>
          </span>
          <span className="pill hide-sm">
            Polling day <strong>Wed 4 Nov</strong>
          </span>
          {meta?.replay ? <span className="pill warn">replay {meta.year}</span> : null}
          {error ? <span className="pill bad">{error}</span> : null}
        </div>
      </div>
    </div>
  );
}

export function FeedPill({ feed }: { feed?: FeedHealth }) {
  if (!feed) return <span className="pill warn">connecting</span>;
  if (feed.error || feed.status === "degraded") {
    return (
      <span className="pill bad" title={feed.error ?? undefined}>
        <i className="dot" /> feed degraded
      </span>
    );
  }
  const age = feed.polled_at ? Date.now() - new Date(feed.polled_at).getTime() : Infinity;
  // "Stale" must be judged against the poll interval: before polls open the
  // poller deliberately waits ten minutes between reads.
  const limit = Math.max(240_000, (feed.interval_seconds || 120) * 2000);
  const cls = age < limit ? "live" : "warn";
  return (
    <span className={`pill ${cls}`} title={`Last read ${relative(feed.polled_at)} · every ${feed.interval_seconds}s`}>
      <i className="dot" /> {cls === "live" ? "live feed" : "stale"} · {relative(feed.polled_at)}
    </span>
  );
}

function toMs(iso: string | undefined) {
  if (!iso) return NaN;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? NaN : t;
}

export function Countdown({ meta }: { meta: Meta | null }) {
  const now = useNow(1000);
  const open = toMs(meta?.polls_open);
  const close = toMs(meta?.polls_close);

  let label = "Polls open in";
  let value = "";
  let note = "Voting stations open 07:00 and close 21:00 SAST";

  if (Number.isFinite(open) && now >= open) {
    if (Number.isFinite(close) && now < close) {
      label = "Polling day";
      value = "VOTING OPEN";
      note = `Stations close in ${duration(close - now)}`;
    } else {
      label = "Counting";
      value = "LIVE COUNT";
      note = meta?.report_date ? `IEC last published ${sast(meta.report_date)}` : "Awaiting the first result";
    }
  } else if (Number.isFinite(open)) {
    value = duration(open - now);
  }

  return (
    <div className="countdown-card">
      <span className="countdown-label">{label}</span>
      <span className="countdown-value">{value || "—"}</span>
      <div className="countdown-meta">
        <span>
          <b>Wed 4 Nov 2026</b> · public holiday
        </span>
        <span>{note}</span>
      </div>
    </div>
  );
}
