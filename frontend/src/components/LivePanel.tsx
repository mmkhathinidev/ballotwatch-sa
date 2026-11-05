import { National } from "../lib/api";
import { compact, num, pct, sast } from "../lib/format";
import { isResidual, orderParties } from "../lib/parties";

export function NationalBoard({ national }: { national: National | null }) {
  // The residual "OTHER" line sits after every real party: it is an aggregate,
  // not a contestant, so it must not push a party down the ranking.
  const parties = orderParties((national?.parties ?? []).filter((p) => p.votes > 0 || p.seats > 0));
  const named = parties.filter((p) => !isResidual(p)).length;
  const max = Math.max(1, ...parties.filter((p) => !isResidual(p)).map((p) => p.pct));

  return (
    <div className="card">
      <div className="card-head">
        <span className="card-title">
          National ballot <span>· all councils combined</span>
        </span>
        <span className="card-tag">
          {parties.length ? `${named} parties winning votes` : "awaiting count"}
        </span>
      </div>
      {parties.length === 0 ? (
        <BallotPreview national={national} />
      ) : (
        <div className="board">
          <div className="board-row head">
            <span>#</span>
            <span>Party</span>
            <span>Share of valid votes</span>
            <span className="num-cell">Votes</span>
            <span className="num-cell hide-sm">Seats</span>
            <span className="num-cell hide-sm">Councils</span>
          </div>
          {parties.slice(0, 14).map((p, i) => {
            const residual = isResidual(p);
            return (
              <div className={`board-row ${residual ? "residual-row" : ""}`} key={p.id}>
                <span className="rank">{residual ? "—" : String(i + 1).padStart(2, "0")}</span>
                <span className="chip">
                  <i className={`swatch ${residual ? "residual" : ""}`} style={{ background: residual ? "#7c8698" : p.colour }} />
                  {residual ? "Other" : p.abbr}
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span className="bar-track" style={{ flex: 1 }}>
                    <span
                      className={`bar-fill ${residual ? "residual" : ""}`}
                      style={{
                        width: `${(p.pct / max) * 100}%`,
                        background: residual ? "#7c8698" : p.colour,
                        display: "block",
                      }}
                    />
                  </span>
                  <span className="num-cell" style={{ width: 54 }}>
                    {pct(p.pct)}
                  </span>
                </span>
                <span className="num-cell">{num(p.votes)}</span>
                <span className="num-cell hide-sm" title={residual ? "Seats are attributed to the individual parties inside this bucket, not to the bucket" : `${p.ward_seats} ward · ${p.pr_seats} PR`}>
                  {residual ? "—" : num(p.seats)}
                </span>
                <span className="num-cell hide-sm">{residual ? "—" : num(p.councils_won)}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function BallotPreview({ national }: { national: National | null }) {
  const parties = (national?.parties ?? []).filter((p) => !isResidual(p));
  return (
    <div>
      <div className="empty">
        <strong style={{ color: "var(--text)" }}>Counting has not started</strong>
        <span>
          The IEC has published the 2026 event shell and the ballot line-up, but no votes have been
          counted yet. This board fills itself from the Commission's own feed, in the order results
          are captured.
        </span>
        <code>IEC report date · {sast(national?.report_date)}</code>
      </div>
      {parties.length > 0 && (
        <div className="card-body" style={{ borderTop: "1px solid var(--line-soft)" }}>
          <div className="countdown-label" style={{ marginBottom: 8 }}>
            Parties the IEC feed lists individually · {parties.length}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {parties.map((p) => (
              <span key={p.id} className="pill" title={p.name}>
                <i className="swatch" style={{ background: p.colour }} />
                {p.abbr}
              </span>
            ))}
          </div>
        </div>
      )}
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
