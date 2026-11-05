export type PartyResult = {
  id: number;
  abbr: string;
  name: string;
  colour: string;
  known: boolean;
  votes: number;
  pct: number;
  ward_seats: number;
  pr_seats: number;
  seats: number;
  councils_won: number;
  majority_won: number;
  leading: boolean;
  seat_pct: number;
};

export type IntegrityCheck = {
  id: string;
  label: string;
  detail: string;
  pass: boolean;
};

export type National = {
  available: boolean;
  report_date: string | null;
  registered_voters: number;
  ballots_cast: number;
  valid_votes: number;
  spoilt_votes: number;
  special_votes: number;
  turnout: number;
  seats_expected: number;
  seats_allocated: number;
  progress: Record<string, [number, number]>;
  percent_complete: Record<string, number>;
  councils: { hung: number; majority: number; drawn: number; expected: number };
  parties: PartyResult[];
  integrity: IntegrityCheck[];
  loaded: boolean;
  fetched_at?: string;
  sha?: string;
};

export type Municipality = {
  id: number;
  name: string;
  registered_voters: number;
  votes_cast: number;
  valid_votes: number;
  seats: number;
  hung: number;
  complete: boolean;
  leader: number | null;
  leader_pct: number;
  parties: { id: number; abbr: string; colour: string; votes: number; pct: number; seats: number }[];
  province_id?: number;
  province?: string;
};

export type Province = {
  province_id: number;
  province: string;
  report_date: string | null;
  registered_voters: number;
  ballots_cast: number;
  turnout: number;
  seats_total: number;
  seats_allocated: number;
  councils: { expected: number; complete: number; hung: number; majority: number };
  percent_complete: Record<string, number>;
  parties: PartyResult[];
  municipalities: Municipality[];
};

export type FeedHealth = {
  status: string;
  polled_at: string | null;
  last_change: string | null;
  interval_seconds: number;
  error: string | null;
  total_polls: number;
  changes: number;
  avg_latency_ms: number;
  recent: { ts: string; status: number; ms: number; changed: number }[];
};

export type Meta = {
  app: string;
  election: string;
  country: string;
  polling_day: string;
  polls_open: string;
  polls_close: string;
  phase: "pre-poll" | "polls-open" | "counting" | "final";
  server_time: string;
  event_id: number;
  year: number;
  replay: boolean;
  feed: FeedHealth;
  structure: {
    wards?: number;
    voting_districts?: number;
    councils?: number;
    seats?: number;
    registered_voters?: number;
    report_date?: string;
  };
  report_date: string | null;
  has_counts: boolean;
  static?: boolean;
  generated_at?: string;
  provinces: { id: number; name: string }[];
};

export type ElectionYear = {
  event_id: number;
  report_date: string;
  registered_voters: number;
  ballots_cast: number;
  valid_votes: number;
  spoilt_votes: number;
  special_votes: number;
  turnout: number;
  seats: number;
  seats_expected: number;
  councils: number;
  wards: number;
  voting_districts: number;
  hung: number;
  majority: number;
  parties: {
    id: number;
    abbr: string;
    full_name: string;
    colour: string;
    votes: number;
    pct: number;
    ward_seats: number;
    pr_seats: number;
    seats: number;
    councils_won: number;
  }[];
};

export type Prepoll = {
  generated_at: string;
  registration: {
    as_at: string;
    source: string;
    total: number;
    gender: { male: number; female: number };
    age_bands: { band: string; male: number; female: number }[];
    provinces: Record<string, number>;
  };
  elections: Record<string, ElectionYear>;
  provinces: Record<
    string,
    {
      province_id: number;
      province: string;
      registered_voters: number;
      ballots_cast: number;
      turnout: number;
      seats: number;
      councils: number;
      hung: number;
      majority: number;
      parties: { id: number; votes: number; pct: number; seats: number; councils_won: number }[];
    }
  >;
  structure_2026: {
    wards: number;
    voting_districts: number;
    councils: number;
    seats: number;
    registered_voters: number;
    report_date: string;
  };
  sources: { label: string; url: string; status: number }[];
};

export type TailParty = {
  id: number;
  abbr: string;
  name: string;
  colour: string;
  votes: number;
  pct: number;
};

export type Tail = {
  generated_at: string;
  source: string;
  method: string;
  coverage: {
    municipalities: number;
    municipalities_cached: number;
    refetched: number;
    wards_with_votes: number;
    wards_expected: number;
    valid_votes: number;
  };
  parties: TailParty[];
  other?: {
    parties: number;
    votes: number;
    pct: number;
    feed_votes: number;
    feed_pct: number;
    delta_pct: number | null;
    largest: TailParty[];
    members: TailParty[];
  };
};

export type Sources = {
  primary: { name: string; url: string; note: string; event_id: number };
  official_api: { name: string; url: string; note: string };
  prepoll: { label: string; url: string; status: number }[];
  registration: { name: string; url: string; as_at: string };
  caveats: string[];
};

// Static mode: the same UI, served from pre-rendered JSON (GitHub Pages,
// Namecheap shared hosting, S3...). Paths are relative so a project page under
// /<repo>/ resolves correctly without configuration.
export const isStatic = import.meta.env.VITE_STATIC === "1";

const STATIC_PATHS: Record<string, string> = {
  "/api/meta": "api/meta.json",
  "/api/live/national": "api/national.json",
  "/api/live/provinces": "api/provinces.json",
  "/api/prepoll": "api/prepoll.json",
  "/api/sources": "api/sources.json",
  "/api/tail": "api/tail.json",
};

async function get<T>(path: string): Promise<T> {
  const url = isStatic ? STATIC_PATHS[path] ?? path : path;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return (await res.json()) as T;
}

export const api = {
  meta: () => get<Meta>("/api/meta"),
  national: () => get<National>("/api/live/national"),
  provinces: () => get<{ count: number; provinces: Province[] }>("/api/live/provinces"),
  prepoll: () => get<Prepoll>("/api/prepoll"),
  sources: () => get<Sources>("/api/sources"),
  tail: () => get<Tail>("/api/tail"),
};
