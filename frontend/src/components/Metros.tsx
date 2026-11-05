import { useMemo } from "react";
import { Province } from "../lib/api";
import { num, pct } from "../lib/format";

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

function shortName(name: string) {
  return name
    .replace(/^[A-Z]{3}\s*-\s*/, "") // IEC prefixes codes: "NMA - Nelson Mandela Bay"
    .replace(/^City of /, "")
    .trim();
}

export function Metros({
  live,
  selected,
  onSelect,
}: {
  live: Province[];
  selected: string | null;
  onSelect: (province: string) => void;
}) {
  const cards = useMemo(() => {
    return METROS.map((m) => {
      const province = live.find((p) => p.province === m.province);
      const muni = province?.municipalities?.find(
        (x) => shortName(x.name).toLowerCase() === shortName(m.name).toLowerCase(),
      );
      const leader = muni?.parties?.[0];
      return {
        ...m,
        registered: muni?.registered_voters,
        leader: leader?.abbr,
        leaderColour: leader?.colour,
        leaderPct: leader?.pct ?? 0,
        complete: muni?.complete ?? false,
        wards: muni?.wards ?? 0,
        wardsComplete: muni?.wards_complete ?? 0,
        counted: muni ? (muni.complete ? 100 : 0) : null,
      };
    });
  }, [live]);

  return (
    <div className="metro-grid">
      {cards.map((c) => (
        <button
          key={c.name}
          type="button"
          className={`metro-card ${selected === c.province ? "highlight" : ""}`}
          onClick={() => onSelect(c.province)}
        >
          <span className="metro-name">{shortName(c.name)}</span>
          <span className="metro-lead">{c.province}</span>
          <span className="metro-pct">
            {c.leader ? pct(c.leaderPct) : "—"}
          </span>
          <span className="metro-foot">
            {c.leader ? (
              <>
                <i className="swatch" style={{ background: c.leaderColour }} />
                {c.leader} leading
              </>
            ) : c.registered ? (
              `${num(c.registered)} registered · ${c.wardsComplete}/${c.wards} wards`
            ) : (
              "not yet in the IEC feed"
            )}
          </span>
        </button>
      ))}
    </div>
  );
}
