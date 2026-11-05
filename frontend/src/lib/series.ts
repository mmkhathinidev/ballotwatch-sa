import type { National, Tail, TailParty } from "./api";
import { isResidual } from "./parties";

// Chart rule: a party earns its own bar only above this share of the national
// vote. Everything below is folded into one "Other" bucket, which is what the
// chart now means — the IEC's own residual line is narrower than that (it only
// hides parties it does not list), so this site recomputes the bucket from the
// complete ward-level tally rather than inheriting the Commission's cut.
export const CHART_THRESHOLD = 1;

export type SeriesParty = {
  id: number;
  abbr: string;
  name: string;
  colour: string;
  pct: number;
  votes: number;
  seats?: number;
  /** True when the party is not on the IEC's own list and its tally comes from
   *  the ward-level rebuild. */
  rebuilt?: boolean;
};

export type Series = {
  shown: SeriesParty[];
  bucket: {
    votes: number;
    pct: number;
    parties: SeriesParty[];
    count: number;
  };
  total: number;
  /** How many of the shown parties the IEC itself listed by name. */
  listed: number;
  /** The IEC's own OTHER row, for comparison with this bucket. */
  iecOther: { votes: number; pct: number } | null;
};

function fromTail(p: TailParty): SeriesParty {
  return {
    id: p.id,
    abbr: p.abbr,
    name: p.name,
    colour: p.colour || "#8892a6",
    votes: p.votes,
    pct: p.pct,
    rebuilt: true,
  };
}

export function buildSeries(national: National | null, tail: Tail | null): Series {
  const valid = national?.valid_votes ?? tail?.coverage.valid_votes ?? 0;
  const rows = new Map<number, SeriesParty>();

  for (const p of national?.parties ?? []) {
    if (isResidual(p) || !p.votes) continue;
    rows.set(p.id, {
      id: p.id,
      abbr: p.abbr,
      name: p.name,
      colour: p.colour,
      votes: p.votes,
      pct: valid ? (100 * p.votes) / valid : p.pct,
      seats: p.seats,
    });
  }

  // Promote parties the IEC folded into OTHER — if they clear the threshold
  // they have earned a name and a bar of their own.
  for (const p of tail?.parties ?? []) {
    if (rows.has(p.id) || !p.votes) continue;
    rows.set(p.id, fromTail(p));
  }

  const all = [...rows.values()].sort((a, b) => b.votes - a.votes);
  const shown = all.filter((p) => p.pct >= CHART_THRESHOLD);
  const rest = all.filter((p) => p.pct < CHART_THRESHOLD);
  const shownVotes = shown.reduce((s, p) => s + p.votes, 0);
  const bucketVotes = Math.max(0, valid - shownVotes);
  const residual = (national?.parties ?? []).find(isResidual);

  return {
    shown,
    bucket: {
      votes: bucketVotes,
      pct: valid ? (100 * bucketVotes) / valid : 0,
      parties: rest,
      count: rest.length,
    },
    total: valid,
    listed: shown.filter((p) => !p.rebuilt).length,
    iecOther: residual ? { votes: residual.votes, pct: residual.pct } : null,
  };
}

/** Same threshold rule for a plain party list (the 2021 baseline fallback). */
export function buildSeriesFromParties(
  rows: { id: number; abbr: string; name?: string; colour: string; votes: number; pct: number; seats?: number }[],
  valid: number,
): Series {
  const all: SeriesParty[] = rows
    .filter((p) => p.votes > 0)
    .map((p) => ({
      id: p.id,
      abbr: p.abbr,
      name: p.name || p.abbr,
      colour: p.colour,
      votes: p.votes,
      pct: valid ? (100 * p.votes) / valid : p.pct,
      seats: p.seats,
    }))
    .sort((a, b) => b.votes - a.votes);
  const shown = all.filter((p) => p.pct >= CHART_THRESHOLD);
  const rest = all.filter((p) => p.pct < CHART_THRESHOLD);
  const bucketVotes = valid ? Math.max(0, valid - shown.reduce((s, p) => s + p.votes, 0)) : rest.reduce((s, p) => s + p.votes, 0);
  return {
    shown,
    bucket: {
      votes: bucketVotes,
      pct: valid ? (100 * bucketVotes) / valid : 0,
      parties: rest,
      count: rest.length,
    },
    total: valid,
    listed: shown.length,
    iecOther: null,
  };
}
