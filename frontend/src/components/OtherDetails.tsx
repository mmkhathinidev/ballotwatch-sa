import { useMemo, useRef, useState } from "react";
import type { Tail } from "../lib/api";
import { num, pct } from "../lib/format";
import { TAIL_2021, TAIL_2021_FACTS } from "../lib/tail2021";

// A drill-down for the IEC's residual "OTHER" line: hidden behind one text
// link so the page stays quiet, opened only when someone is curious enough.
// The 2026 list is not an estimate — it is summed from the party ballot in
// every ward across all 213 municipalities (see backend/app/tail.py).

type Row = { id?: number; abbr: string; name: string; votes?: number; pct: number };

export function OtherDetails({
  share,
  votes,
  tail,
}: {
  share: number;
  votes: number;
  tail?: Tail | null;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [showAll, setShowAll] = useState(false);
  const [query, setQuery] = useState("");
  const f = TAIL_2021_FACTS;
  const other = tail?.other;

  const rows: Row[] = other
    ? other.largest
    : TAIL_2021.map((p) => ({ abbr: p.abbr, name: p.name, pct: p.pct }));
  const max = Math.max(0.01, ...rows.map((p) => p.pct));

  const filtered = useMemo(() => {
    const all = other?.members ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all.filter(
      (p) => p.abbr.toLowerCase().includes(q) || p.name.toLowerCase().includes(q),
    );
  }, [other, query]);

  return (
    <>
      <button type="button" className="link-btn" onClick={() => ref.current?.showModal()}>
        Peek inside Other →
      </button>

      <dialog
        ref={ref}
        className="sheet"
        aria-labelledby="other-sheet-title"
        onClick={(e) => {
          if (e.target === ref.current) ref.current?.close();
        }}
      >
        <div className="sheet-head">
          <div>
            <div className="sheet-eyebrow">Residual line · IEC party ballot</div>
            <h3 id="other-sheet-title">Inside “Other”</h3>
          </div>
          <button type="button" className="sheet-close" onClick={() => ref.current?.close()} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="sheet-body">
          <p className="sheet-lede">
            The IEC lists the parties carrying the contest and folds every other party into one line.
            “Other” is that line — not a party, and not a single result. It currently holds{" "}
            <b>
              {pct(share)} of counted votes ({num(votes)})
            </b>
            , which is why it is drawn on the chart but never ranked.
          </p>

          <div className="sheet-stats">
            <div className="stat">
              <span>Inside Other now</span>
              <b>{pct(share)}</b>
              <em>{num(votes)} votes</em>
            </div>
            <div className="stat">
              <span>Parties in it</span>
              <b>{other ? num(other.parties) : "—"}</b>
              <em>{other ? "with votes" : "counting"}</em>
            </div>
            <div className="stat">
              <span>2021 bucket</span>
              <b>{f.bucketPct.toFixed(2)}%</b>
              <em>{num(f.bucketSeats)} seats</em>
            </div>
          </div>

          <h4>{other ? "The largest parties inside it — 2026 count" : "The last time it could be measured"}</h4>
          {other ? (
            <p className="sheet-note">
              Rebuilt from the party ballot in every ward across all{" "}
              {tail?.coverage.municipalities ?? 0} municipalities, not estimated from the national
              line. These are the twelve largest; the rest are searchable below.
            </p>
          ) : (
            <p className="sheet-note">
              {num(f.partiesContested)} parties contested 2021. Twelve were listed individually; the
              rest shared {f.bucketPct.toFixed(2)}% of the vote. No single party inside the bucket
              broke {f.largest.toFixed(2)}%.
            </p>
          )}

          <div className="tail-list">
            {rows.map((p) => (
              <div className="tail-row" key={`${p.abbr}-${p.name}`}>
                <span className="tail-name">
                  <b>{p.abbr}</b>
                  <em>{p.name}</em>
                </span>
                <span className="bar-track">
                  <span
                    className="bar-fill"
                    style={{ width: `${(p.pct / max) * 100}%`, display: "block" }}
                  />
                </span>
                <span className="tail-value">{p.pct >= 0.5 ? p.pct.toFixed(1) : p.pct.toFixed(2)}%</span>
              </div>
            ))}
            <div className="tail-foot">
              {other ? (
                <>
                  {num(other.parties)} parties with votes, {num(other.votes)} combined. The IEC's own
                  headline row reads {num(other.feed_votes)}
                  {other.delta_pct !== null
                    ? ` — a ${Math.abs(other.delta_pct).toFixed(1)}% gap, which is this rebuild running a few minutes behind the national line`
                    : ""}
                  .
                </>
              ) : (
                <>
                  …and roughly 300 further parties, each below 0.1% nationally — many of them local
                  civic movements that win a seat or two in one municipality.
                </>
              )}
            </div>
          </div>

          {other ? (
            <div className="tail-actions">
              <button type="button" className="tab" onClick={() => setShowAll((v) => !v)} aria-expanded={showAll}>
                {showAll ? "Hide the full list" : `Search all ${num(other.parties)} parties`}
              </button>
            </div>
          ) : null}

          {other && showAll ? (
            <>
              <input
                className="tail-search"
                type="search"
                placeholder="Filter by party name or abbreviation…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Filter the parties inside Other"
              />
              <div className="tail-table">
                {filtered.slice(0, 200).map((p) => (
                  <div className="tail-trow" key={p.id}>
                    <span>{p.abbr}</span>
                    <span className="tail-tname">{p.name}</span>
                    <span>{num(p.votes)}</span>
                    <span>{p.pct.toFixed(2)}%</span>
                  </div>
                ))}
                {filtered.length === 0 ? <div className="tail-foot">No party matches that.</div> : null}
                {filtered.length > 200 ? (
                  <div className="tail-foot">Showing the first 200 matches — keep typing to narrow it.</div>
                ) : null}
              </div>
            </>
          ) : null}

          <h4>How this is built</h4>
          <p className="sheet-note">
            The national bundle carries no per-party tally for the tail, so this site rebuilds one:
            each municipal bundle holds a party ballot in every ward, and the wards are summed
            {tail
              ? ` (${num(tail.coverage.wards_with_votes)} of ${num(tail.coverage.wards_expected)} wards have votes so far)`
              : ""}
            . Those same parties still add up to the IEC's national total — that reconciliation is
            the check that the reconstruction is sound.
          </p>

          <p className="sheet-source">
            Ward-level figures: IEC per-municipality bundles at results.elections.org.za. 2021
            comparison: IEC national results, as tabulated on{" "}
            <a
              href="https://en.wikipedia.org/wiki/2021_South_African_municipal_elections"
              target="_blank"
              rel="noreferrer"
            >
              Wikipedia
            </a>
            .
          </p>
        </div>
      </dialog>
    </>
  );
}
