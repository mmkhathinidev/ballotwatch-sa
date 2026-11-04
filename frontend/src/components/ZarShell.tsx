import { Meta, National, Prepoll, Province } from "../lib/api";
import { num, pct, sast } from "../lib/format";
import { Countdown, FeedPill } from "./Chrome";

const PHASE_LABEL: Record<string, string> = {
  "pre-poll": "Pre-poll",
  "polls-open": "Polls are open",
  counting: "Counting in progress",
  final: "Final results",
};

const NAV = [
  { href: "#search", label: "Search" },
  { href: "#national", label: "National" },
  { href: "#provinces", label: "Provinces" },
  { href: "#metros", label: "Metros" },
  { href: "#prepoll", label: "Pre-poll" },
  { href: "#sources", label: "Sources" },
];

export function StatusStrip({ meta, error }: { meta: Meta | null; error: string | null }) {
  return (
    <div className="status-strip">
      <div className="status-strip-left">
        <span className="strip-pill">
          <i className="live-dot" />
          {meta ? PHASE_LABEL[meta.phase] ?? meta.phase : "connecting"}
        </span>
        <span>4 November 2026 · Local Government Elections</span>
      </div>
      <div className="status-strip-right">
        {error ? <span className="strip-error">{error}</span> : null}
        <span>Source: Independent Electoral Commission (IEC)</span>
      </div>
    </div>
  );
}

export function Header() {
  return (
    <header className="site-header">
      <nav className="nav">
        <a className="logo" href="#top">
          <span className="logo-mark">ZP</span>
          <span className="logo-text">
            ZAR<span>POLLS</span>
          </span>
        </a>
        <div className="nav-links">
          {NAV.map((n) => (
            <a key={n.href} href={n.href}>
              {n.label}
            </a>
          ))}
        </div>
        <a className="nav-cta" href="#national">
          Live results
        </a>
      </nav>
    </header>
  );
}

export function Hero({
  meta,
  national,
  prepoll,
  loading,
}: {
  meta: Meta | null;
  national: National | null;
  prepoll: Prepoll | null;
  loading: boolean;
}) {
  const structure = prepoll?.structure_2026;
  const counted = national?.percent_complete?.voting_districts ?? 0;

  return (
    <section className="hero" id="top">
      <div className="hero-main">
        <div className="eyebrow">South Africa · 2026 Local Government Elections</div>
        <h1>
          Your municipality.
          <br />
          Your power. <em>Your vote.</em>
        </h1>
        <p className="hero-lede">
          Independent, ward-by-ward results for all {num(structure?.councils ?? 257)} councils —
          read straight from the Electoral Commission's own feed, with the arithmetic checked on
          every refresh. No spin, no noise: just the count as it lands.
        </p>
        <div className="hero-actions">
          <a className="btn btn-primary" href="#national">
            Explore live results →
          </a>
          <a className="btn btn-ghost" href="#search">
            Find your municipality
          </a>
        </div>
      </div>

      <div className="status-card">
        <div>
          <div className="status-label">National status</div>
          <div className="status-value">
            {loading ? "Connecting…" : PHASE_LABEL[meta?.phase ?? ""] ?? "Awaiting feed"}
          </div>
        </div>

        <div className="status-meta">
          <div>
            Polling day · <b>Wednesday 4 November 2026</b>
          </div>
          <div>
            Last IEC report · <b>{sast(meta?.report_date)}</b>
          </div>
          <div>
            Ballots counted · <b>{num(national?.ballots_cast ?? 0)}</b>
            <span className="muted"> · {pct(counted, 0)} of districts</span>
          </div>
          <div className="status-badges">
            <FeedPill feed={meta?.feed} />
            {meta?.static ? null : <span className="badge badge-live">live feed</span>}
          </div>
        </div>

        <Countdown meta={meta} />
      </div>
    </section>
  );
}

export function Ticker({
  meta,
  national,
  provinces,
  prepoll,
}: {
  meta: Meta | null;
  national: National | null;
  provinces: Province[];
  prepoll: Prepoll | null;
}) {
  const items: { name: string; text: string }[] = [];

  items.push({
    name: "National",
    text: national?.loaded
      ? `${num(national.ballots_cast)} ballots counted · ${pct(national.percent_complete?.voting_districts ?? 0, 0)} of districts`
      : "counting not started · awaiting the first result",
  });

  for (const p of meta?.provinces ?? []) {
    const live = provinces.find((x) => x.province_id === p.id);
    const base = prepoll?.provinces?.[String(p.id)];
    const leader = live?.parties?.[0];
    const counted = live?.percent_complete?.voting_districts ?? 0;
    items.push({
      name: p.name,
      text: leader && counted > 0
        ? `${leader.abbr} leading · ${pct(counted, 0)} counted`
        : `${num(base?.registered_voters ?? live?.registered_voters ?? 0)} registered voters · awaiting count`,
    });
  }

  const loop = [...items, ...items];

  return (
    <div className="ticker" aria-hidden="true">
      <div className="ticker-track">
        {loop.map((it, i) => (
          <span className="ticker-item" key={`${it.name}-${i}`}>
            <strong>{it.name}</strong> · {it.text}
          </span>
        ))}
      </div>
    </div>
  );
}
