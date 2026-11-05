import { useMemo, useState } from "react";
import { Meta, Prepoll, Province } from "../lib/api";
import { num, pct } from "../lib/format";

type Entry = {
  name: string;
  type: "province" | "metro" | "local";
  meta: string;
  province: string;
  registered?: number;
  counted?: number;
  leader?: string;
};

// The eight Category A municipalities are fixed by the Demarcation Board, so
// they can be listed before the IEC publishes its first municipal bundle.
const METROS: { name: string; province: string }[] = [
  { name: "eThekwini", province: "KwaZulu-Natal" },
  { name: "City of Johannesburg", province: "Gauteng" },
  { name: "City of Cape Town", province: "Western Cape" },
  { name: "City of Tshwane", province: "Gauteng" },
  { name: "City of Ekurhuleni", province: "Gauteng" },
  { name: "Nelson Mandela Bay", province: "Eastern Cape" },
  { name: "Buffalo City", province: "Eastern Cape" },
  { name: "Mangaung", province: "Free State" },
];

const FILTERS: { key: "all" | "province" | "metro" | "local"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "province", label: "Provinces" },
  { key: "metro", label: "Metros" },
  { key: "local", label: "Local municipalities" },
];

export function SearchPanel({
  meta,
  prepoll,
  live,
  onPick,
  selected,
}: {
  meta: Meta | null;
  prepoll: Prepoll | null;
  live: Province[];
  onPick: (province: string, focus?: string) => void;
  selected: string | null;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "province" | "metro" | "local">("all");

  const entries = useMemo<Entry[]>(() => {
    const byName = new Map<string, Province>();
    for (const p of live) byName.set(p.province, p);

    const list: Entry[] = (meta?.provinces ?? []).map((p) => {
      const l = byName.get(p.name);
      // The 2026 roll lives in registration.provinces; prepoll.provinces holds
      // the 2021 election's roll and must not be shown as current.
      const roll = prepoll?.registration?.provinces?.[p.name] ?? l?.registered_voters ?? 0;
      const leader = l?.parties?.[0];
      return {
        name: p.name,
        type: "province",
        meta: `${num(roll)} registered voters`,
        province: p.name,
        registered: roll,
        counted: l?.percent_complete?.voting_districts ?? 0,
        leader: leader && (l?.percent_complete?.voting_districts ?? 0) > 0 ? leader.abbr : undefined,
      };
    });

    for (const m of METROS) {
      list.push({
        name: m.name,
        type: "metro",
        meta: `${m.province} · Metro`,
        province: m.province,
      });
    }

    for (const p of live) {
      for (const m of p.municipalities ?? []) {
        if (METROS.some((x) => x.name === m.name)) continue;
        list.push({
          name: m.name,
          type: "local",
          meta: `${p.province} · Local municipality`,
          province: p.province,
          registered: m.registered_voters,
          counted: m.complete ? 100 : undefined,
          leader: m.parties?.[0]?.abbr,
        });
      }
    }
    return list;
  }, [meta, prepoll, live]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries
      .filter((e) => (filter === "all" ? true : e.type === filter))
      .filter((e) => !q || e.name.toLowerCase().includes(q) || e.province.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 40);
  }, [entries, filter, query]);

  return (
    <div className="search-box">
      <div className="section-header">
        <h2>Find your ward or municipality</h2>
        <span className="section-note">
          {entries.length} areas indexed · ward level opens as counts are captured
        </span>
      </div>

      <div className="search-input-wrap">
        <span className="search-icon">⌕</span>
        <input
          className="search-input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search municipality, metro or province…"
          autoComplete="off"
          aria-label="Search municipalities, metros and provinces"
        />
        {query ? (
          <button className="search-clear" onClick={() => setQuery("")} type="button" aria-label="Clear search">
            ✕
          </button>
        ) : null}
      </div>

      <div className="search-filters">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            className={`filter-chip ${filter === f.key ? "active" : ""}`}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="search-results">
        {results.length === 0 ? (
          <p className="search-empty">No match for “{query}”. Try a municipality name or province.</p>
        ) : (
          results.map((e) => (
            <button
              key={`${e.type}-${e.name}`}
              type="button"
              className={`search-item ${selected === e.province ? "selected" : ""}`}
              onClick={() => onPick(e.province, e.name)}
            >
              <span className="search-item-main">
                <span className="search-item-name">{e.name}</span>
                <span className="search-item-meta">{e.meta}</span>
              </span>
              <span className="search-item-right">
                {e.leader ? (
                  <span className="search-item-leader">{e.leader} leading</span>
                ) : e.counted ? (
                  <span className="search-item-leader muted">{pct(e.counted, 0)} counted</span>
                ) : null}
                <span className="search-item-type">{e.type}</span>
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
