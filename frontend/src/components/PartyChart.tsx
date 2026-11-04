import { useMemo, useState } from "react";
import { num, pct } from "../lib/format";

export type ChartParty = {
  abbr: string;
  colour: string;
  pct: number;
  votes?: number;
  seats?: number;
};

type Mode = "bar" | "doughnut" | "horizontal";

const MODES: { key: Mode; label: string }[] = [
  { key: "bar", label: "Bar" },
  { key: "doughnut", label: "Doughnut" },
  { key: "horizontal", label: "Horizontal" },
];

export function PartyChart({
  parties,
  caption,
}: {
  parties: ChartParty[];
  caption: string;
}) {
  const [mode, setMode] = useState<Mode>("bar");
  const top = useMemo(() => parties.filter((p) => p.pct > 0).slice(0, 8), [parties]);
  const max = Math.max(1, ...top.map((p) => p.pct));

  return (
    <div className="chart-card">
      <div className="chart-head">
        <div className="chart-controls">
          {MODES.map((m) => (
            <button
              key={m.key}
              type="button"
              className={`chart-btn ${mode === m.key ? "active" : ""}`}
              onClick={() => setMode(m.key)}
            >
              {m.label}
            </button>
          ))}
        </div>
        <span className="chart-caption">{caption}</span>
      </div>

      {top.length === 0 ? (
        <div className="empty">
          <strong style={{ color: "var(--text)" }}>No share to plot yet</strong>
          <span>The chart fills in as soon as counted ballots land in the IEC feed.</span>
        </div>
      ) : mode === "doughnut" ? (
        <Doughnut parties={top} />
      ) : mode === "horizontal" ? (
        <Horizontal parties={top} max={max} />
      ) : (
        <Columns parties={top} max={max} />
      )}

      <div className="chart-legend">
        {top.map((p) => (
          <span key={p.abbr} className="legend-item">
            <i className="swatch" style={{ background: p.colour }} />
            {p.abbr}
            <b>{pct(p.pct)}</b>
          </span>
        ))}
      </div>
    </div>
  );
}

function Columns({ parties, max }: { parties: ChartParty[]; max: number }) {
  const W = 520;
  const H = 260;
  const pad = { l: 34, r: 10, t: 14, b: 34 };
  const innerW = W - pad.l - pad.r;
  const innerH = H - pad.t - pad.b;
  const step = innerW / parties.length;

  return (
    <svg className="chart-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Party share of valid votes">
      {[0, 0.25, 0.5, 0.75, 1].map((f) => (
        <g key={f}>
          <line
            x1={pad.l}
            x2={W - pad.r}
            y1={pad.t + innerH * (1 - f)}
            y2={pad.t + innerH * (1 - f)}
            className="chart-grid"
          />
          <text x={pad.l - 8} y={pad.t + innerH * (1 - f) + 3.5} className="chart-axis" textAnchor="end">
            {Math.round(max * f)}%
          </text>
        </g>
      ))}
      {parties.map((p, i) => {
        const h = (p.pct / max) * innerH;
        const x = pad.l + i * step + step * 0.18;
        const w = step * 0.64;
        return (
          <g key={p.abbr}>
            <rect
              x={x}
              y={pad.t + innerH - h}
              width={w}
              height={Math.max(1, h)}
              rx={5}
              fill={p.colour}
              opacity={0.92}
            />
            <text x={x + w / 2} y={pad.t + innerH - h - 6} className="chart-value" textAnchor="middle">
              {pct(p.pct)}
            </text>
            <text x={x + w / 2} y={H - 12} className="chart-axis" textAnchor="middle">
              {p.abbr}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function Horizontal({ parties, max }: { parties: ChartParty[]; max: number }) {
  return (
    <div className="hbars">
      {parties.map((p) => (
        <div className="hbar-row" key={p.abbr}>
          <span className="hbar-label">
            <i className="swatch" style={{ background: p.colour }} />
            {p.abbr}
          </span>
          <span className="bar-track">
            <span
              className="bar-fill"
              style={{ width: `${(p.pct / max) * 100}%`, background: p.colour, display: "block" }}
            />
          </span>
          <span className="hbar-value">{pct(p.pct)}</span>
          <span className="hbar-votes muted">{p.votes ? num(p.votes) : "—"}</span>
        </div>
      ))}
    </div>
  );
}

function arc(cx: number, cy: number, r: number, from: number, to: number) {
  const p = (a: number) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  const [x1, y1] = p(from);
  const [x2, y2] = p(to);
  const large = to - from > Math.PI ? 1 : 0;
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

function Doughnut({ parties }: { parties: ChartParty[] }) {
  const total = parties.reduce((s, p) => s + p.pct, 0) || 1;
  let angle = -Math.PI / 2;
  const cx = 130;
  const cy = 130;
  const r = 100;

  return (
    <svg className="chart-svg doughnut" viewBox="0 0 260 260" role="img" aria-label="Party share of valid votes">
      {parties.map((p) => {
        const sweep = (p.pct / total) * Math.PI * 2;
        const d = arc(cx, cy, r, angle, angle + sweep - 0.012);
        angle += sweep;
        return <path key={p.abbr} d={d} stroke={p.colour} strokeWidth={34} fill="none" strokeLinecap="butt" />;
      })}
      <text x={cx} y={cy - 4} className="chart-center-value" textAnchor="middle">
        {pct(total, 0)}
      </text>
      <text x={cx} y={cy + 18} className="chart-center-label" textAnchor="middle">
        valid votes
      </text>
    </svg>
  );
}
