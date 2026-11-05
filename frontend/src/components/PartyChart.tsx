import { useMemo, useState } from "react";
import { num, pct } from "../lib/format";
import { isResidual } from "../lib/parties";

export type ChartParty = {
  id?: number;
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

const RESIDUAL_COLOUR = "#7c8698";
const TOP_N = 8;

export function PartyChart({
  parties,
  caption,
}: {
  parties: ChartParty[];
  caption: string;
}) {
  const [mode, setMode] = useState<Mode>("bar");
  // Rank the real parties, then append the IEC's residual line last. It is
  // drawn, because hiding it would break the 100% total, but it never ranks.
  const { top, residual } = useMemo(() => {
    const withShare = parties.filter((p) => p.pct > 0);
    const named = withShare.filter((p) => !isResidual(p));
    return {
      top: [...named.slice(0, TOP_N), ...withShare.filter(isResidual)],
      residual: withShare.find(isResidual),
    };
  }, [parties]);
  const max = Math.max(1, ...top.filter((p) => !isResidual(p)).map((p) => p.pct));

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
          <span key={p.abbr} className="legend-item" title={isResidual(p) ? `Aggregate of all parties outside the top ${TOP_N}` : undefined}>
            <i className={`swatch ${isResidual(p) ? "residual" : ""}`} style={{ background: isResidual(p) ? RESIDUAL_COLOUR : p.colour }} />
            {isResidual(p) ? `Other (${num(p.votes ?? 0)})` : p.abbr}
            <b>{pct(p.pct)}</b>
          </span>
        ))}
      </div>

      {residual ? (
        <p className="chart-note">
          <b>Other</b> is not a party. It is the IEC's residual line — every party outside the{" "}
          {TOP_N} shown above, {num(residual.votes ?? 0)} votes ({pct(residual.pct)}) combined — so it
          is drawn last and carries no rank. The bucket is not trivial: in 2021 it held 7.63% of the
          vote and 621 council seats across the hundreds of parties that did not make the feed's
          individual list.
        </p>
      ) : null}
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
        const residual = isResidual(p);
        return (
          <g key={p.abbr}>
            <rect
              x={x}
              y={pad.t + innerH - h}
              width={w}
              height={Math.max(1, h)}
              rx={5}
              fill={residual ? RESIDUAL_COLOUR : p.colour}
              opacity={residual ? 0.55 : 0.92}
            />
            {residual ? (
              <rect x={x} y={pad.t + innerH - h} width={w} height={Math.max(1, h)} rx={5} fill="url(#residual-hatch)" opacity={0.5} />
            ) : null}
            <text x={x + w / 2} y={pad.t + innerH - h - 6} className="chart-value" textAnchor="middle">
              {pct(p.pct)}
            </text>
            <text x={x + w / 2} y={H - 12} className="chart-axis" textAnchor="middle">
              {residual ? "Other" : p.abbr}
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
      {parties.map((p) => {
        const residual = isResidual(p);
        return (
          <div className="hbar-row" key={p.abbr}>
            <span className={`hbar-label ${residual ? "residual" : ""}`}>
              <i className={`swatch ${residual ? "residual" : ""}`} style={{ background: residual ? RESIDUAL_COLOUR : p.colour }} />
              {residual ? "Other" : p.abbr}
            </span>
            <span className="bar-track">
              <span
                className={`bar-fill ${residual ? "residual" : ""}`}
                style={{ width: `${(p.pct / max) * 100}%`, background: residual ? RESIDUAL_COLOUR : p.colour, display: "block" }}
              />
            </span>
            <span className="hbar-value">{pct(p.pct)}</span>
            <span className="hbar-votes muted">{p.votes ? num(p.votes) : "—"}</span>
          </div>
        );
      })}
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
        const residual = isResidual(p);
        return (
          <path
            key={p.abbr}
            d={d}
            stroke={residual ? RESIDUAL_COLOUR : p.colour}
            strokeOpacity={residual ? 0.75 : 1}
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
