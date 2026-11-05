import { useMemo } from "react";
import { Prepoll, Province } from "../lib/api";
import { num, pct } from "../lib/format";
import { orderParties } from "../lib/parties";
import { ZA_PROVINCES, ZA_VIEWBOX } from "../lib/zaProvinces";

type PartyMeta = { abbr: string; colour: string };

export type ProvinceRow = {
  id: number;
  name: string;
  registered2026: number;
  turnout2021: number;
  hung2021: number;
  councils2021: number;
  leader2021?: { id: number; pct: number; votes: number; seats: number; councils_won: number };
  baseParties: { id: number; pct: number; votes: number; seats: number }[];
  live?: Province;
  liveLeader?: { id: number; pct: number; votes: number; seats: number; abbr: string; colour: string };
};

const ABBR: Record<string, string> = {
  Limpopo: "LP",
  Mpumalanga: "MP",
  "North West": "NW",
  Gauteng: "GP",
  "Free State": "FS",
  "KwaZulu-Natal": "KZN",
  "Northern Cape": "NC",
  "Eastern Cape": "EC",
  "Western Cape": "WC",
};

export function useProvinceRows(prepoll: Prepoll | null, live: Province[]) {
  return useMemo(() => {
    const order = ["3", "4", "1", "9", "5", "6", "7", "2", "8"];
    const byId = new Map(live.map((p) => [p.province_id, p]));
    const rows: ProvinceRow[] = order.map((pid) => {
      const base = prepoll?.provinces?.[pid];
      const l = byId.get(Number(pid));
      return {
        id: Number(pid),
        name: base?.province ?? l?.province ?? `Province ${pid}`,
        registered2026:
          prepoll?.registration?.provinces?.[base?.province ?? ""] ?? l?.registered_voters ?? 0,
        turnout2021: base?.turnout ?? 0,
        hung2021: base?.hung ?? 0,
        councils2021: base?.councils ?? 0,
        leader2021: base?.parties?.[0],
        baseParties: (base?.parties ?? []).slice(0, 6),
        live: l,
        liveLeader: l?.parties?.[0],
      };
    });
    const meta: Record<number, PartyMeta> = {};
    for (const p of prepoll?.elections?.["2021"]?.parties ?? []) {
      meta[p.id] = { abbr: p.abbr, colour: p.colour };
    }
    return { rows, meta };
  }, [prepoll, live]);
}

export function ProvinceMap({
  rows,
  selected,
  onSelect,
}: {
  rows: ProvinceRow[];
  selected: string | null;
  onSelect: (name: string) => void;
}) {
  const byName = new Map(rows.map((r) => [r.name, r]));

  return (
    <div className="map-card">
      <svg className="map-svg" viewBox={ZA_VIEWBOX} role="group" aria-label="Map of South African provinces">
        {ZA_PROVINCES.map((p) => {
          const row = byName.get(p.name);
          const counted = row?.live?.percent_complete?.voting_districts ?? 0;
          const leader = row?.liveLeader;
          const active = selected === p.name;
          const fill = leader && counted > 0 ? leader.colour : "#1c2734";
          return (
            <g key={p.name} className={`province ${active ? "active" : ""}`} onClick={() => onSelect(p.name)}>
              <title>
                {p.name}
                {counted > 0 ? ` · ${pct(counted, 0)} counted` : " · awaiting count"}
              </title>
              <path
                d={p.d}
                fill={fill}
                fillOpacity={active ? 0.95 : leader && counted > 0 ? 0.55 : 1}
                className="province-path"
              />
              <text
                x={p.label[0]}
                y={p.label[1]}
                className="province-label"
                textAnchor="middle"
                aria-hidden="true"
              >
                {ABBR[p.name] ?? p.name}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="map-legend">
        <span className="legend-item">
          <i className="swatch" style={{ background: "#1c2734" }} /> awaiting count
        </span>
        <span className="legend-item">
          <i className="swatch" style={{ background: "var(--accent)" }} /> party leading
        </span>
        <span className="muted">click a province to select it</span>
      </div>
    </div>
  );
}

export function ProvinceList({
  rows,
  selected,
  onSelect,
}: {
  rows: ProvinceRow[];
  selected: string | null;
  onSelect: (name: string) => void;
}) {
  return (
    <div className="map-card">
      <div className="province-list">
        {rows.map((r) => {
          const counted = r.live?.percent_complete?.voting_districts ?? 0;
          return (
            <button
              key={r.id}
              type="button"
              className={`province-item ${selected === r.name ? "active" : ""}`}
              onClick={() => onSelect(r.name)}
            >
              <span>
                <span className="province-name">{r.name}</span>
                <span className="province-status">
                  {num(r.registered2026)} registered
                  {r.councils2021 ? ` · ${r.councils2021} councils` : ""}
                </span>
              </span>
              {r.liveLeader && counted > 0 ? (
                <span className="badge badge-live">
                  {r.liveLeader.abbr} {pct(r.liveLeader.pct, 0)}
                </span>
              ) : (
                <span className="badge badge-wait">Awaiting</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function ProvinceTable({
  rows,
  meta,
  selected,
  onSelect,
}: {
  rows: ProvinceRow[];
  meta: Record<number, PartyMeta>;
  selected: string | null;
  onSelect: (name: string) => void;
}) {
  return (
    <div className="card">
      <div className="card-head">
        <span className="card-title">
          Provincial board <span>· 9 provinces</span>
        </span>
        <span className="card-tag">live vs 2021 baseline</span>
      </div>
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Province</th>
              <th className="r">Registered</th>
              <th className="r hide-sm">2021 turnout</th>
              <th>2021 leader</th>
              <th>Live leader</th>
              <th className="r">Counted</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const lm = r.leader2021 ? meta[r.leader2021.id] : undefined;
              return (
                <tr key={r.id} className={selected === r.name ? "active" : ""} onClick={() => onSelect(r.name)}>
                  <td className="name">{r.name}</td>
                  <td className="r">{num(r.registered2026)}</td>
                  <td className="r hide-sm muted">{r.turnout2021 ? pct(r.turnout2021) : "—"}</td>
                  <td>
                    {lm ? (
                      <span className="prov-cell">
                        <i className="swatch" style={{ background: lm.colour }} />
                        {lm.abbr}
                        <span className="muted" style={{ fontSize: 11.5 }}>
                          {pct(r.leader2021?.pct ?? 0)}
                        </span>
                      </span>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td>
                    {r.liveLeader ? (
                      <span className="prov-cell">
                        <i className="swatch" style={{ background: r.liveLeader.colour }} />
                        {r.liveLeader.abbr}
                        <span className="muted" style={{ fontSize: 11.5 }}>
                          {pct(r.liveLeader.pct)}
                        </span>
                      </span>
                    ) : (
                      <span className="muted">awaiting count</span>
                    )}
                  </td>
                  <td className="r">{r.live ? pct(r.live.percent_complete?.voting_districts ?? 0, 0) : "0%"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function ProvinceDetail({
  row,
  meta,
}: {
  row?: ProvinceRow;
  meta: Record<number, PartyMeta>;
}) {
  if (!row) {
    return (
      <div className="card">
        <div className="card-body">
          <p className="muted">Loading provincial baseline…</p>
        </div>
      </div>
    );
  }

  const liveParties =
    orderParties(row.live?.parties?.filter((p) => p.votes > 0) ?? []).slice(0, 6);

  return (
    <div className="card">
      <div className="detail-head">
        <div>
          <div className="detail-title">{row.name}</div>
          <div className="detail-meta">
            {num(row.registered2026)} registered · {num(row.councils2021)} councils in 2021
          </div>
        </div>
        <span className="card-tag" style={{ marginLeft: "auto" }}>
          {row.live ? "live" : "2021 baseline"}
        </span>
      </div>
      <div className="card-body">
        {liveParties.length > 0 ? (
          <>
            <div className="countdown-label" style={{ marginBottom: 10 }}>
              Live · {num(row.live?.ballots_cast ?? 0)} ballots · turnout {pct(row.live?.turnout ?? 0)}
            </div>
            <PartyBars
              parties={liveParties.map((p) => ({
                abbr: p.abbr,
                colour: p.colour,
                pct: p.pct,
                votes: p.votes,
                seats: p.seats,
              }))}
            />
            <div className="stat-grid" style={{ marginTop: 16 }}>
              {/* The IEC's provincial bundle lists seat winners, not every seat;
                  show what is attributed rather than implying a shortfall. */}
              <div className="stat">
                <span>Seats won by listed parties</span>
                <b>{num(row.live?.seats_allocated)}</b>
              </div>
              <div className="stat">
                <span>Council seats in province</span>
                <b>{num(row.live?.seats_total)}</b>
              </div>
              <div className="stat">
                <span>Councils complete</span>
                <b>
                  {num(row.live?.councils.complete)} / {num(row.live?.councils.expected)}
                </b>
              </div>
              <div className="stat">
                <span>Councils without a majority</span>
                <b>{num(row.live?.councils.hung)}</b>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="countdown-label" style={{ marginBottom: 10 }}>
              2021 result · turnout {pct(row.turnout2021)} · {row.hung2021} hung councils
            </div>
            <PartyBars
              parties={row.baseParties.map((p) => ({
                abbr: meta[p.id]?.abbr ?? `Party ${p.id}`,
                colour: meta[p.id]?.colour ?? "#8892a6",
                pct: p.pct,
                votes: p.votes,
                seats: p.seats,
              }))}
            />
            <p className="muted" style={{ fontSize: 12.5, marginBottom: 0 }}>
              Provincial detail fills in the moment the IEC publishes its provincial bundle for this
              province.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function PartyBars({
  parties,
}: {
  parties: { abbr: string; colour: string; pct: number; votes: number; seats: number }[];
}) {
  const max = Math.max(1, ...parties.map((p) => p.pct));
  return (
    <div className="board">
      {parties.map((p) => (
        <div
          className="board-row"
          key={p.abbr}
          style={{ gridTemplateColumns: "56px 1fr 54px 72px", padding: "8px 0", borderBottom: "1px solid var(--line-soft)" }}
        >
          <span className="chip">
            <i className="swatch" style={{ background: p.colour }} />
            {p.abbr}
          </span>
          <span className="bar-track">
            <span
              className="bar-fill"
              style={{ width: `${(p.pct / max) * 100}%`, background: p.colour, display: "block" }}
            />
          </span>
          <span className="num-cell">{pct(p.pct)}</span>
          <span className="num-cell muted">{num(p.seats)} seats</span>
        </div>
      ))}
    </div>
  );
}
