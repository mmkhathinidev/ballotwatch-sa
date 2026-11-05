// Parties that sat inside the IEC's residual "OTHER" line at the 2021 municipal
// election, with their published national share of all votes (ward + PR + district
// combined). NFP, UDM and ICOSA are deliberately absent: the IEC listed those
// individually in 2021, so they were never in the bucket.
//
// Source: IEC 2021 municipal election national results, as tabulated at
// https://en.wikipedia.org/wiki/2021_South_African_municipal_elections
// (section "National results by party"). The 2021 bucket as a whole was 7.63%
// of votes and 621 seats, spread across roughly 300 parties.
export type TailParty = { abbr: string; name: string; pct: number };

export const TAIL_2021: TailParty[] = [
  { abbr: "GOOD", name: "Good", pct: 0.61 },
  { abbr: "AIC", name: "African Independent Congress", pct: 0.48 },
  { abbr: "F4SD", name: "Forum for Service Delivery", pct: 0.27 },
  { abbr: "PAC", name: "Pan Africanist Congress of Azania", pct: 0.23 },
  { abbr: "MAP16", name: "MAP16 Civic Movement", pct: 0.22 },
  { abbr: "COPE", name: "Congress of the People", pct: 0.2 },
  { abbr: "AL JAMA-AH", name: "Al Jama-ah", pct: 0.2 },
  { abbr: "APC", name: "African People's Convention", pct: 0.19 },
  { abbr: "ISANCO", name: "Independent SANCO", pct: 0.15 },
  { abbr: "APM", name: "African People's Movement", pct: 0.13 },
];

export const TAIL_2021_FACTS = {
  // As published by the IEC in the 2021 event bundle and carried in prepoll.json.
  bucketPct: 7.63,
  bucketVotes: 1_825_016,
  bucketSeats: 621,
  partiesContested: 325,
  largest: 0.61,
};
