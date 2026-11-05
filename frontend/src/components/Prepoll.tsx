import { Prepoll } from "../lib/api";
import { compact, num, pct } from "../lib/format";
import { isResidual } from "../lib/parties";

export function RegistrationCard({ prepoll }: { prepoll: Prepoll | null }) {
  const reg = prepoll?.registration;
  if (!reg) return <CardSkeleton title="Registration" />;

  const maxBand = Math.max(...reg.age_bands.map((b) => Math.max(b.male, b.female)));
  const male = reg.gender.male;
  const female = reg.gender.female;
  const total = male + female;

  return (
    <div className="card">
      <div className="card-head">
        <span className="card-title">
          The roll <span>· registered voters</span>
        </span>
        <span className="card-tag">as at {reg.as_at}</span>
      </div>
      <div className="card-body">
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 4 }}>
          <span style={{ fontSize: 30, fontWeight: 700, letterSpacing: "-1px" }}>{num(total)}</span>
          <span className="muted" style={{ fontSize: 12.5 }}>
            {pct((100 * female) / total)} women · {pct((100 * male) / total)} men
          </span>
        </div>
        <div style={{ display: "flex", height: 6, borderRadius: 4, overflow: "hidden", margin: "12px 0 18px" }}>
          <span style={{ width: `${(100 * male) / total}%`, background: "#4c8dff" }} />
          <span style={{ width: `${(100 * female) / total}%`, background: "#f5a524" }} />
        </div>

        <div className="countdown-label" style={{ marginBottom: 8 }}>
          By age band
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          {reg.age_bands.map((b) => (
            <div className="age-row" key={b.band}>
              <span className="age-band">{b.band}</span>
              <span className="age-v">{compact(b.male)}</span>
              <div className="age-bars">
                <div className="age-half left">
                  <span className="age-male" style={{ width: `${(100 * b.male) / maxBand}%` }} />
                </div>
                <div className="age-half right">
                  <span className="age-female" style={{ width: `${(100 * b.female) / maxBand}%` }} />
                </div>
              </div>
              <span className="age-v right">{compact(b.female)}</span>
            </div>
          ))}
        </div>
        <div className="legend">
          <span>
            <i className="swatch" style={{ background: "#4c8dff" }} /> Male
          </span>
          <span>
            <i className="swatch" style={{ background: "#f5a524" }} /> Female
          </span>
        </div>
      </div>
    </div>
  );
}

export function TurnoutCard({ prepoll, liveTurnout }: { prepoll: Prepoll | null; liveTurnout: number }) {
  const years = ["2011", "2016", "2021"];
  const points = years.map((y) => ({
    label: y,
    value: prepoll?.elections?.[y]?.turnout ?? 0,
  }));
  if (liveTurnout > 0) points.push({ label: "2026", value: liveTurnout });

  return (
    <div className="card">
      <div className="card-head">
        <span className="card-title">
          Turnout <span>· local elections</span>
        </span>
        <span className="card-tag">ballots ÷ registered</span>
      </div>
      <div className="card-body">
        <LineChart points={points} />
        <div className="stat-grid" style={{ marginTop: 8 }}>
          {years.map((y) => {
            const e = prepoll?.elections?.[y];
            return (
              <div className="stat" key={y}>
                <span>{y}</span>
                <b>
                  {pct(e?.turnout ?? 0)} · {compact(e?.ballots_cast ?? 0)} ballots
                </b>
              </div>
            );
          })}
          <div className="stat">
            <span>Roll growth 2021 → 2026</span>
            <b>
              +
              {compact(
                (prepoll?.registration.total ?? 0) - (prepoll?.elections?.["2021"]?.registered_voters ?? 0)
              )}
            </b>
          </div>
        </div>
      </div>
    </div>
  );
}

function LineChart({ points }: { points: { label: string; value: number }[] }) {
  const W = 340;
  const H = 170;
  const pad = { l: 34, r: 30, t: 26, b: 26 };
  const max = Math.max(60, ...points.map((p) => p.value)) * 1.12;
  const x = (i: number) =>
    pad.l + (i * (W - pad.l - pad.r)) / Math.max(1, points.length - 1);
  const y = (v: number) => pad.t + (1 - v / max) * (H - pad.t - pad.b);
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const area = `${path} L${x(points.length - 1).toFixed(1)},${H - pad.b} L${x(0).toFixed(1)},${H - pad.b} Z`;
  const ticks = [0, 20, 40, 60];

  return (
    <svg className="trend" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Turnout trend">
      <defs>
        <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(245,165,36,.28)" />
          <stop offset="100%" stopColor="rgba(245,165,36,0)" />
        </linearGradient>
      </defs>
      {ticks.map((t) => (
        <g key={t}>
          <line className="trend-grid" x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} />
          <text className="trend-axis" x={pad.l - 7} y={y(t) + 3} textAnchor="end">
            {t}%
          </text>
        </g>
      ))}
      <path className="trend-area" d={area} />
      <path className="trend-line" d={path} />
      {points.map((p, i) => (
        <g key={p.label}>
          <circle className="trend-dot" cx={x(i)} cy={y(p.value)} r={3.6} />
          <text className="trend-axis" x={x(i)} y={H - 8} textAnchor="middle">
            {p.label}
          </text>
          <text className="trend-label" x={x(i)} y={y(p.value) - 9} textAnchor="middle">
            {p.value.toFixed(1)}
          </text>
        </g>
      ))}
    </svg>
  );
}

export function BaselineCard({ prepoll }: { prepoll: Prepoll | null }) {
  const y = prepoll?.elections?.["2021"];
  if (!y) return <CardSkeleton title="2021 baseline" />;
  const parties = y.parties
    .filter((p) => p.pct > 0.4 && !isResidual(p))
    .slice(0, 8);
  const other = y.parties.find(isResidual);
  const max = Math.max(1, ...parties.map((p) => p.pct));

  return (
    <div className="card">
      <div className="card-head">
        <span className="card-title">
          2021 baseline <span>· last municipal election</span>
        </span>
        <span className="card-tag">{y.hung} hung councils</span>
      </div>
      <div className="card-body tight" style={{ paddingTop: 6, paddingBottom: 10 }}>
        {parties.map((p) => (
          <div className="board-row" key={p.id} style={{ gridTemplateColumns: "82px 1fr 52px 66px", padding: "7px 8px", borderBottom: "1px solid var(--line-soft)" }}>
            <span className="chip">
              <i className="swatch" style={{ background: p.colour }} />
              {p.abbr}
            </span>
            <span className="bar-track">
              <span className="bar-fill" style={{ width: `${(p.pct / max) * 100}%`, background: p.colour, display: "block" }} />
            </span>
            <span className="num-cell">{pct(p.pct)}</span>
            <span className="num-cell muted">{num(p.seats)}</span>
          </div>
        ))}
        {other ? (
          <div className="chart-note" style={{ borderTop: "none", paddingTop: 4, margin: "4px 8px 6px" }}>
            Excludes <b>Other</b> — the IEC's residual line: {pct(other.pct)} of the 2021 vote and{" "}
            {num(other.seats)} seats across every party outside the individually listed top 12.
          </div>
        ) : null}
        <div className="stat-grid" style={{ padding: "12px 8px 2px" }}>
          <div className="stat">
            <span>Seats filled</span>
            <b>{num(y.seats)}</b>
          </div>
          <div className="stat">
            <span>Councils</span>
            <b>{num(y.councils)}</b>
          </div>
          <div className="stat">
            <span>Wards</span>
            <b>{num(y.wards)}</b>
          </div>
          <div className="stat">
            <span>Majority councils</span>
            <b>{num(y.majority)}</b>
          </div>
        </div>
      </div>
    </div>
  );
}

export function StructureCard({ prepoll }: { prepoll: Prepoll | null }) {
  const s = prepoll?.structure_2026;
  return (
    <div className="card">
      <div className="card-head">
        <span className="card-title">
          The contest <span>· 2026</span>
        </span>
        <span className="card-tag">IEC event {s ? "1887" : "—"}</span>
      </div>
      <div className="card-body">
        <div className="stat-grid">
          <div className="stat">
            <span>Municipal councils</span>
            <b>{num(s?.councils)}</b>
          </div>
          <div className="stat">
            <span>Council seats</span>
            <b>{num(s?.seats)}</b>
          </div>
          <div className="stat">
            <span>Wards contested</span>
            <b>{num(s?.wards)}</b>
          </div>
          <div className="stat">
            <span>Voting districts</span>
            <b>{num(s?.voting_districts)}</b>
          </div>
          <div className="stat">
            <span>Registered voters</span>
            <b>{num(s?.registered_voters)}</b>
          </div>
          <div className="stat">
            <span>Voting stations</span>
            <b>23 696</b>
          </div>
        </div>
        <p className="muted" style={{ fontSize: 12, marginBottom: 0, marginTop: 12 }}>
          Every voter casts a ward ballot and a proportional-representation ballot; district councils
          add a third. Seat control is decided council by council, not by the national vote share.
        </p>
      </div>
    </div>
  );
}

function CardSkeleton({ title }: { title: string }) {
  return (
    <div className="card">
      <div className="card-head">
        <span className="card-title">{title}</span>
      </div>
      <div className="card-body">
        <p className="muted" style={{ margin: 0 }}>
          Loading…
        </p>
      </div>
    </div>
  );
}
