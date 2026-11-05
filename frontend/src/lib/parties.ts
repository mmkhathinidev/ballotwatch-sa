// The IEC's results feed does not list every party individually. It publishes
// the parties that carry the contest and folds the rest into a single "OTHER"
// line (party ID -2). That line is not a party and must never take a rank from
// one: 546 parties contested the 2026 municipal election, and in 2021 the same
// residual line held 7.63% of the vote and 621 council seats — material as an
// aggregate, meaningless as a "third-placed party".

const RESIDUAL_IDS = new Set([-2]);

type Identified = { id?: number; abbr?: string };

/** True when a row is the IEC's aggregate residual line rather than a party. */
export function isResidual(p: Identified): boolean {
  if (typeof p.id === "number" && RESIDUAL_IDS.has(p.id)) return true;
  return /^\s*other\s*$/i.test(p.abbr ?? "");
}

/** Real parties keep their published order; the residual row always goes last. */
export function orderParties<T extends Identified>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => Number(isResidual(a)) - Number(isResidual(b)));
}

export function splitParties<T extends Identified>(
  rows: readonly T[],
  limit: number,
): { ranked: T[]; residual: T | undefined } {
  const ranked = rows.filter((r) => !isResidual(r)).slice(0, limit);
  const residual = rows.find(isResidual);
  return { ranked, residual };
}
