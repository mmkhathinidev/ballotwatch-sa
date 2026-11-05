import { National } from "../lib/api";
import { compact, num, pct } from "../lib/format";
import type { Series } from "../lib/series";
import { CHART_THRESHOLD } from "../lib/series";

export function NationalBoard({ series }: { series: Series }) {
  // Same rule as the chart: a party gets a row only above the threshold; the
  // rest are folded into one residual row at the bottom, unranked.
  const max = Math.max(1, ...series.shown.map((p) => p.pct));
  const rows = series.shown.length;

  return (
    <div className="card">
      <div className="card-head">
        <span className="card-title">
          National ballot <span>· all councils combined</span>
        </span>
        <span className="card-tag">
          {rows ? `${rows} parties above ${CHART_THRESHOLD}%` : "awaiting count"}
        </span>
      </div>
      {rows === 0 ? (
        <BallotPreview series={series} />
      ) : (
        <div className="board">
          <div className="board-row head">
            <span>#</span>
            <span>Party</span>
            <span>Share of valid votes</span>
            <span className="num-cell">Votes</span>
            <span className="num-cell hide-sm">Seats</span>
          </div>
          {series.shown.map((p, i) => (
            <div className="board-row" key={p.id}>
              <span className="rank">{String(i + 1).padStart(2, "0")}</span>
              <span className="chip">
                <i className="swatch" style={{ background: p.colour }} />
                {p.abbr}
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span className="bar-track" style={{ flex: 1 }}>
                  <span
                    className="bar-fill"
                    style={{ width: `${(p.pct / max) * 100}%`, background: p.colour, display: "block" }}
                  />
                </span>
                <span className="num-cell" style={{ width: 54 }}>
                  {pct(p.pct)}
                </span>
              </span>
              <span className="num-cell">{num(p.votes)}</span>
              <span
                className="num-cell hide-sm"
                title={p.rebuilt ? "Not on the IEC's own list; tally rebuilt from ward-level results" : undefined}
              >
                {p.seats === undefined ? "—" : num(p.seats)}
              </span>
            </div>
          ))}
          <div className="board-row residual-row">
            <span className="rank">—</span>
            <span className="chip">
              <i className="swatch residual" style={{ background: "#7c8698" }} />
              Other
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span className="bar-track" style={{ flex: 1 }}>
                <span
                  className="bar-fill residual"
                  style={{
                    width: `${(series.bucket.pct / max) * 100}%`,
                    background: "#7c8698",
                    display: "block",
                  }}
                />
              </span>
              <span className="num-cell" style={{ width: 54 }}>
                {pct(series.bucket.pct)}
              </span>
            </span>
            <span className="num-cell">{num(series.bucket.votes)}</span>
            <span className="num-cell hide-sm" title={`${num(series.bucket.count)} parties below ${CHART_THRESHOLD}%`}>
              —
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function BallotPreview(_props: { series: Series }) {
  return (
    <div>
      <div className="empty">
        <strong style={{ color: "var(--text)" }}>Counting has not started</strong>
        <span>
          The IEC has published the 2026 event shell and the ballot line-up, but no votes have been
          counted yet. This board fills itself from the Commission's own feed, in the order results
          are captured.
        </span>
      </div>
    </div>
  );
}

export function ProgressPanel({ national }: { national: National | null }) {
  const rows: { label: string; done: number; total: number }[] = [
    { label: "Voting districts", done: national?.progress?.voting_districts?.[0] ?? 0, total: national?.progress?.voting_districts?.[1] ?? 0 },
    { label: "Wards", done: national?.progress?.wards?.[0] ?? 0, total: national?.progress?.wards?.[1] ?? 0 },
    { label: "Municipalities", done: national?.progress?.municipalities?.[0] ?? 0, total: national?.progress?.municipalities?.[1] ?? 0 },
    { label: "Provinces", done: national?.progress?.provinces?.[0] ?? 0, total: national?.progress?.provinces?.[1] ?? 0 },
    { label: "Council seats", done: national?.progress?.seats?.[0] ?? 0, total: national?.progress?.seats?.[1] ?? 0 },
  ];

  return (
    <div className="card">
      <div className="card-head">
        <span className="card-title">
          Count progress <span>· national</span>
        </span>
        <span className="card-tag">{pct(national?.percent_complete?.voting_districts ?? 0)} of districts</span>
      </div>
      <div className="card-body">
        <div className="progress-list">
          {rows.map((r) => {
            const share = r.total ? (100 * r.done) / r.total : 0;
            return (
              <div className="progress-row" key={r.label}>
                <span className="progress-label">{r.label}</span>
                <span className="progress-track">
                  <span className="progress-fill" style={{ width: `${Math.min(100, share)}%`, display: "block" }} />
                </span>
                <span className="progress-num">
                  {compact(r.done)}
                  <span style={{ color: "var(--dim)" }}>/{compact(r.total)}</span>
                </span>
              </div>
            );
          })}
        </div>
        <div className="stat-grid" style={{ marginTop: 16 }}>
          <div className="stat">
            <span>Ballots counted</span>
            <b>{num(national?.ballots_cast)}</b>
          </div>
          <div className="stat">
            <span>Spoilt ballots</span>
            <b>{num(national?.spoilt_votes)}</b>
          </div>
          <div className="stat">
            <span>Seats declared</span>
            <b>
              {num(national?.seats_allocated)} / {num(national?.seats_expected)}
            </b>
          </div>
          <div className="stat">
            <span>Councils with a majority</span>
            <b>
              {num(national?.councils?.majority)} · {num(national?.councils?.hung)} hung
            </b>
          </div>
        </div>
      </div>
    </div>
  );
}

export function IntegrityPanel({ national }: { national: National | null }) {
  const checks = national?.integrity ?? [];
  return (
    <div className="card">
      <div className="card-head">
        <span className="card-title">
          Arithmetic checks <span>· run on every poll</span>
        </span>
        <span className={`card-tag ${checks.every((c) => c.pass) ? "" : "warn"}`}>
          {checks.length === 0 ? "no counts" : checks.every((c) => c.pass) ? "all pass" : "attention"}
        </span>
      </div>
      <div className="card-body">
        {checks.length === 0 ? (
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>
            Checks run as soon as the IEC publishes its first counted ballots.
          </p>
        ) : (
          <div className="integrity">
            {checks.map((c) => (
              <div className={`check ${c.pass ? "pass" : "fail"}`} key={c.id}>
                <span className="check-icon">{c.pass ? "✓" : "!"}</span>
                <span className="check-text">
                  <b>{c.label}</b>
                  <span>{c.detail}</span>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
