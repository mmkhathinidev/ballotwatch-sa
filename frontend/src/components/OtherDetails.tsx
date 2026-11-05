import { useRef } from "react";
import { num, pct } from "../lib/format";
import { TAIL_2021, TAIL_2021_FACTS } from "../lib/tail2021";

// A drill-down for the IEC's residual "OTHER" line: hidden behind one text
// link so the page stays quiet, opened only when someone is curious enough.
// It shows the bucket's real shape from 2021, when the Commission published
// enough detail to measure it, and states plainly what the live feed withholds.

export function OtherDetails({ share, votes }: { share: number; votes: number }) {
  const ref = useRef<HTMLDialogElement>(null);
  const max = Math.max(0.01, ...TAIL_2021.map((p) => p.pct));
  const f = TAIL_2021_FACTS;

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
            “Other” is that line — not a party, and not a single result. Right now it holds{" "}
            <b>
              {pct(share)} of counted votes ({num(votes)})
            </b>
            , which is why it is drawn on the chart but never ranked.
          </p>

          <div className="sheet-stats">
            <div className="stat">
              <span>2026 so far</span>
              <b>{pct(share)}</b>
              <em>{num(votes)} votes</em>
            </div>
            <div className="stat">
              <span>2021 final</span>
              <b>{f.bucketPct.toFixed(2)}%</b>
              <em>{num(f.bucketVotes)} votes</em>
            </div>
            <div className="stat">
              <span>Seats in 2021</span>
              <b>{num(f.bucketSeats)}</b>
              <em>of 8,794</em>
            </div>
          </div>

          <h4>The last time it could be measured</h4>
          <p className="sheet-note">
            {num(f.partiesContested)} parties contested 2021. Twelve were listed individually; the
            rest shared {f.bucketPct.toFixed(2)}% of the vote. These were the largest members — no
            single party inside the bucket broke {f.largest.toFixed(2)}%.
          </p>

          <div className="tail-list">
            {TAIL_2021.map((p) => (
              <div className="tail-row" key={p.abbr}>
                <span className="tail-name">
                  <b>{p.abbr}</b>
                  <em>{p.name}</em>
                </span>
                <span className="bar-track">
                  <span className="bar-fill" style={{ width: `${(p.pct / max) * 100}%`, display: "block" }} />
                </span>
                <span className="tail-value">{p.pct.toFixed(2)}%</span>
              </div>
            ))}
            <div className="tail-foot">
              …and roughly 300 further parties, each below 0.1% nationally — many of them local civic
              movements that win a seat or two in one municipality.
            </div>
          </div>

          <h4>Why 2026 can’t be itemised here yet</h4>
          <p className="sheet-note">
            The public results bundle publishes one aggregate row for the tail; there is no per-party
            tally in it, and the IEC’s credentialed API (which does carry that detail) is issued by
            request. This site will list the members with their own vote counts once ward-level
            results are ingested — until then it shows the aggregate rather than guess at a
            breakdown.
          </p>

          <p className="sheet-source">
            2021 figures: IEC national results, as tabulated on{" "}
            <a
              href="https://en.wikipedia.org/wiki/2021_South_African_municipal_elections"
              target="_blank"
              rel="noreferrer"
            >
              Wikipedia — 2021 South African municipal elections
            </a>
            . 2026 live figures come from the IEC event bundle.
          </p>
        </div>
      </dialog>
    </>
  );
}
