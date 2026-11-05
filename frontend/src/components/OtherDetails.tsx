import { useMemo, useRef, useState } from "react";
import type { Tail } from "../lib/api";
import { num, pct } from "../lib/format";
import type { Series } from "../lib/series";
import { CHART_THRESHOLD } from "../lib/series";
import { TAIL_2021_FACTS } from "../lib/tail2021";

// Drill-down for the "Other" bucket: every party below the chart threshold,
// hidden behind one text link so the page stays quiet. The 2026 numbers are
// summed from the party ballot in every ward across all 213 municipalities
// (see backend/app/tail.py), not estimated from the national line.

export function OtherDetails({ series, tail }: { series: Series; tail?: Tail | null }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [showAll, setShowAll] = useState(false);
  const [query, setQuery] = useState("");
  const f = TAIL_2021_FACTS;

  const members = series.bucket.parties;
  const top = members.slice(0, 12);
  // Scale to the threshold, not the biggest member: a 0.92% party should read
  // as "almost at the line", not as a full-length bar.
  const max = Math.max(CHART_THRESHOLD, ...top.map((p) => p.pct));

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return members;
    return members.filter(
      (p) => p.abbr.toLowerCase().includes(q) || p.name.toLowerCase().includes(q),
    );
  }, [members, query]);

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
            <div className="sheet-eyebrow">Residual bucket · IEC party ballot</div>
            <h3 id="other-sheet-title">Inside “Other”</h3>
          </div>
          <button type="button" className="sheet-close" onClick={() => ref.current?.close()} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="sheet-body">
          <p className="sheet-lede">
            On this site “Other” means every party under <b>{CHART_THRESHOLD}%</b> of the national
            vote. Together they hold{" "}
            <b>
              {pct(series.bucket.pct)} — {num(series.bucket.votes)} votes
            </b>
            , which is why they are drawn as one bar and never ranked.
          </p>

          <div className="sheet-stats">
            <div className="stat">
              <span>Bucket share</span>
              <b>{pct(series.bucket.pct)}</b>
              <em>{num(series.bucket.votes)} votes</em>
            </div>
            <div className="stat">
              <span>Parties in it</span>
              <b>{num(series.bucket.count)}</b>
              <em>below {CHART_THRESHOLD}%</em>
            </div>
            <div className="stat">
              <span>2021 comparison</span>
              <b>{f.bucketPct.toFixed(2)}%</b>
              <em>{num(f.bucketSeats)} seats</em>
            </div>
          </div>

          <h4>The largest parties inside it</h4>
          <p className="sheet-note">
            Rebuilt from the party ballot in every ward across all{" "}
            {tail?.coverage.municipalities ?? 213} municipalities. These are the twelve largest; the
            rest are searchable below.
          </p>

          <div className="tail-list">
            {top.map((p) => (
              <div className="tail-row" key={p.id}>
                <span className="tail-name">
                  <b>{p.abbr}</b>
                  <em>{p.name}</em>
                </span>
                <span className="bar-track">
                  <span
                    className="bar-fill"
                    style={{ width: `${(p.pct / max) * 100}%`, background: p.colour, display: "block" }}
                  />
                </span>
                <span className="tail-value">{p.pct.toFixed(2)}%</span>
              </div>
            ))}
            <div className="tail-foot">
              {num(series.bucket.count)} parties, {num(series.bucket.votes)} votes combined.
              {series.iecOther
                ? ` The IEC's own OTHER line reads ${num(series.iecOther.votes)} at this moment — narrower, because it only hides parties it does not name, while this bucket also folds in the named parties that sit below ${CHART_THRESHOLD}%.`
                : ""}
            </div>
          </div>

          <div className="tail-actions">
            <button type="button" className="tab" onClick={() => setShowAll((v) => !v)} aria-expanded={showAll}>
              {showAll ? "Hide the full list" : `Search all ${num(series.bucket.count)} parties`}
            </button>
          </div>

          {showAll ? (
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
            . Those parties still add up to the IEC's national total — that reconciliation is the
            check that the reconstruction is sound.
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
