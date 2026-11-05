import { useState } from "react";
import type { Tail } from "../lib/api";
import { num, pct } from "../lib/format";
import type { Series, SeriesParty } from "../lib/series";
import { CHART_THRESHOLD } from "../lib/series";
import { OtherDetails } from "./OtherDetails";

type Mode = "bar" | "doughnut" | "horizontal";

type Row = SeriesParty & { residual?: boolean };

const MODES: { key: Mode; label: string }[] = [
  { key: "bar", label: "Bar" },
  { key: "doughnut", label: "Doughnut" },
  { key: "horizontal", label: "Horizontal" },
];

const RESIDUAL_COLOUR = "#7c8698";

export function PartyChart({
  series,
  caption,
  tail,
}: {
  series: Series;
  caption: string;
  tail?: Tail | null;
}) {
  const [mode, setMode] = useState<Mode>("bar");

  const rows: Row[] = [
    ...series.shown,
    ...(series.bucket.votes > 0
      ? [
          {
            id: -2,
            abbr: "Other",
            name: `All parties below ${CHART_THRESHOLD}%`,
            colour: RESIDUAL_COLOUR,
            pct: series.bucket.pct,
            votes: series.bucket.votes,
            residual: true,
          } satisfies Row,
        ]
      : []),
  ];
  const max = Math.max(1, ...series.shown.map((p) => p.pct));

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

      {rows.length === 0 ? (
        <div className="empty">
          <strong style={{ color: "var(--text)" }}>No share to plot yet</strong>
          <span>The chart fills in as soon as counted ballots land in the IEC feed.</span>
        </div>
      ) : mode === "doughnut" ? (
        <Doughnut parties={rows} />
      ) : mode === "horizontal" ? (
        <Horizontal parties={rows} max={max} />
      ) : (
        <Columns parties={rows} max={max} />
      )}

      <div className="chart-legend">
        {rows.map((p) => (
          <span key={p.id} className="legend-item" title={p.residual ? undefined : p.name}>
            <i
              className={`swatch ${p.residual ? "residual" : ""}`}
              style={{ background: p.residual ? RESIDUAL_COLOUR : p.colour }}
            />
            {p.abbr}
            <b>{pct(p.pct)}</b>
          </span>
        ))}
      </div>

      {series.bucket.votes > 0 ? (
        <div className="chart-note">
          <b>Other</b> is every party below {CHART_THRESHOLD}% — {num(series.bucket.count)} parties
          holding {num(series.bucket.votes)} votes ({pct(series.bucket.pct)}) between them. It is
          drawn last and never ranked, because no single party in it clears the {CHART_THRESHOLD}%
          line. It is not trivia either: at the last municipal election this territory held 7.6% of
          the vote and 621 council seats.
          <OtherDetails series={series} tail={tail} />
        </div>
      ) : null}
    </div>
  );
}

function Columns({ parties, max }: { parties: Row[]; max: number }) {
  const W = Math.max(520, parties.length * 54);
  const H = 260;
  const pad = { l: 34, r: 10, t: 14, b: 34 };
  const innerW = W - pad.l - pad.r;
  const innerH = H - pad.t - pad.b;
  const step = innerW / Math.max(1, parties.length);

  return (
    <svg className="chart-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Party share of valid votes">
      <defs>
        <pattern id="residual-hatch" width="6" height="6" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
          <line x1="0" y1="0" x2="0" y2="6" stroke="rgba(255,255,255,0.55)" strokeWidth="2" />
        </pattern>
      </defs>
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
          <g key={p.id}>
            <rect
              x={x}
              y={pad.t + innerH - h}
              width={w}
              height={Math.max(1, h)}
              rx={5}
              fill={p.residual ? RESIDUAL_COLOUR : p.colour}
              opacity={p.residual ? 0.55 : 0.92}
            />
            {p.residual ? (
              <rect x={x} y={pad.t + innerH - h} width={w} height={Math.max(1, h)} rx={5} fill="url(#residual-hatch)" opacity={0.5} />
            ) : null}
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

function Horizontal({ parties, max }: { parties: Row[]; max: number }) {
  return (
    <div className="hbars">
      {parties.map((p) => (
        <div className="hbar-row" key={p.id} title={p.residual ? undefined : p.name}>
          <span className={`hbar-label ${p.residual ? "residual" : ""}`}>
            <i
              className={`swatch ${p.residual ? "residual" : ""}`}
              style={{ background: p.residual ? RESIDUAL_COLOUR : p.colour }}
            />
            {p.abbr}
          </span>
          <span className="bar-track">
            <span
              className={`bar-fill ${p.residual ? "residual" : ""}`}
              style={{
                width: `${(p.pct / max) * 100}%`,
                background: p.residual ? RESIDUAL_COLOUR : p.colour,
                display: "block",
              }}
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

function Doughnut({ parties }: { parties: Row[] }) {
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
        return (
          <path
            key={p.id}
            d={d}
            stroke={p.residual ? RESIDUAL_COLOUR : p.colour}
            strokeOpacity={p.residual ? 0.75 : 1}
            strokeWidth={34}
            fill="none"
            strokeLinecap="butt"
          />
        );
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
