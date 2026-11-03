import { useMemo, useState } from "react";
import { Prepoll, Province } from "../lib/api";
import { num, pct } from "../lib/format";

type PartyMeta = { abbr: string; colour: string };

export function ProvinceBoard({
  prepoll,
  live,
}: {
  prepoll: Prepoll | null;
  live: Province[];
}) {
  const [selected, setSelected] = useState<string | null>(null);

  const meta = useMemo(() => {
    const map: Record<number, PartyMeta> = {};
    const y = prepoll?.elections?.["2021"];
    for (const p of y?.parties ?? []) map[p.id] = { abbr: p.abbr, colour: p.colour };
    return map;
  }, [prepoll]);

  const rows = useMemo(() => {
    const order = ["3", "4", "1", "9", "5", "6", "7", "2", "8"];
    const byId = new Map(live.map((p) => [p.province_id, p]));
    return order.map((pid) => {
      const base = prepoll?.provinces?.[pid];
      const l = byId.get(Number(pid));
      const leader2021 = base?.parties?.[0];
      const liveLeader = l?.parties?.[0];
      return {
        id: Number(pid),
        name: base?.province ?? l?.province ?? `Province ${pid}`,
        registered2026: prepoll?.registration?.provinces?.[base?.province ?? ""] ?? l?.registered_voters ?? 0,
        turnout2021: base?.turnout ?? 0,
        hung2021: base?.hung ?? 0,
        councils2021: base?.councils ?? 0,
        leader2021,
        baseParties: (base?.parties ?? []).slice(0, 6),
        live: l,
        liveLeader,
      };
    });
  }, [prepoll, live]);

  const active = rows.find((r) => r.id === Number(selected)) ?? rows[0];

  return (
    <div className="grid-2">
      <div className="card">
        <div className="card-head">
          <span className="card-title">
            Provincial board <span>· 9 provinces</span>
          </span>
          <span className="card-tag">select a province</span>
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
                  <tr
                    key={r.id}
                    className={active?.id === r.id ? "active" : ""}
                    onClick={() => setSelected(String(r.id))}
                  >
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
                    <td className="r">
                      {r.live ? pct(r.live.percent_complete?.voting_districts ?? 0, 0) : "0%"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <ProvinceDetail row={active} meta={meta} />
    </div>
  );
}

type Row = {
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

function ProvinceDetail({ row, meta }: { row?: Row; meta: Record<number, PartyMeta> }) {
  if (!row) {
    return (
      <div className="card">
        <div className="card-body">
          <p className="muted">Loading provincial baseline…</p>
        </div>
      </div>
    );
  }

  const liveParties = row.live?.parties?.filter((p) => p.votes > 0).slice(0, 6) ?? [];

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
            <PartyBars parties={liveParties.map((p) => ({ abbr: p.abbr, colour: p.colour, pct: p.pct, votes: p.votes, seats: p.seats }))} />
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
            <span className="bar-fill" style={{ width: `${(p.pct / max) * 100}%`, background: p.colour, display: "block" }} />
          </span>
          <span className="num-cell">{pct(p.pct)}</span>
          <span className="num-cell muted">{num(p.seats)} seats</span>
        </div>
      ))}
    </div>
  );
}
