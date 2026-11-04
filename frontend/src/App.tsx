import { useMemo, useState } from "react";
import { IntegrityPanel, NationalBoard, ProgressPanel } from "./components/LivePanel";
import { Metros } from "./components/Metros";
import { PartyChart, type ChartParty } from "./components/PartyChart";
import {
  ProvinceDetail,
  ProvinceList,
  ProvinceMap,
  ProvinceTable,
  useProvinceRows,
} from "./components/ProvincePanel";
import { BaselineCard, RegistrationCard, StructureCard, TurnoutCard } from "./components/Prepoll";
import { SearchPanel } from "./components/SearchPanel";
import { Footer, SourcesPanel } from "./components/SourcesPanel";
import { Header, Hero, StatusStrip, Ticker } from "./components/ZarShell";
import { compact, num, sast } from "./lib/format";
import { useDashboard } from "./lib/useDashboard";

export default function App() {
  const { meta, national, provinces, prepoll, sources, error, loading, reload } = useDashboard();
  const [selected, setSelected] = useState<string | null>(null);

  const { rows, meta: partyMeta } = useProvinceRows(prepoll, provinces);
  const active = rows.find((r) => r.name === selected) ?? rows[0];

  const kpis = useMemo(() => {
    const s = prepoll?.structure_2026;
    return [
      {
        label: "Registered voters",
        value: compact(prepoll?.registration.total || s?.registered_voters || 0),
        foot: prepoll
          ? `roll as at ${new Date(prepoll.registration.as_at).toLocaleDateString("en-ZA", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}`
          : "IEC voter roll",
      },
      { label: "Municipal councils", value: num(s?.councils), foot: "up for election" },
      { label: "Council seats", value: num(s?.seats), foot: "ward + proportional" },
      { label: "Wards contested", value: num(s?.wards), foot: `${num(s?.voting_districts)} voting districts` },
      {
        label: "Ballots counted",
        value: compact(national?.ballots_cast ?? 0),
        foot: national?.loaded ? `${(national?.turnout ?? 0).toFixed(1)}% turnout` : "counting not started",
      },
    ];
  }, [prepoll, national]);

  // The live share only exists once ballots are counted; until then the chart
  // shows the 2021 national baseline, labelled as such.
  const chart = useMemo<{ parties: ChartParty[]; caption: string }>(() => {
    const live = (national?.parties ?? []).filter((p) => p.votes > 0 || p.pct > 0);
    if (live.length > 0) {
      return {
        parties: live.map((p) => ({ abbr: p.abbr, colour: p.colour, pct: p.pct, votes: p.votes, seats: p.seats })),
        caption: "2026 count · share of valid votes so far",
      };
    }
    const y2021 = prepoll?.elections?.["2021"];
    return {
      parties: (y2021?.parties ?? []).map((p) => ({
        abbr: p.abbr,
        colour: p.colour,
        pct: p.pct,
        votes: p.votes,
        seats: p.seats,
      })),
      caption: y2021 ? `2021 baseline · ${y2021.turnout.toFixed(1)}% turnout` : "awaiting data",
    };
  }, [national, prepoll]);

  const pick = (province: string) => {
    setSelected(province);
    const el = document.getElementById("provinces");
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <>
      <StatusStrip meta={meta} error={error} />
      <Header />

      {meta?.static ? (
        <div className="notice">
          <strong>Static snapshot</strong> built {sast(meta.generated_at)} SAST — the publishing job
          refreshes it on a schedule. For continuous counting, run the API server.
        </div>
      ) : null}

      <main className="shell">
        <Hero meta={meta} national={national} prepoll={prepoll} loading={loading} />

        <div className="kpis">
          {kpis.map((k) => (
            <div className="kpi" key={k.label}>
              <span className="kpi-label">{k.label}</span>
              <span className="kpi-value">{k.value}</span>
              <span className="kpi-foot">{k.foot}</span>
            </div>
          ))}
        </div>

        <Ticker meta={meta} national={national} provinces={provinces} prepoll={prepoll} />

        <section id="search">
          <SearchPanel meta={meta} prepoll={prepoll} live={provinces} onPick={pick} selected={active?.name ?? null} />
        </section>

        <section id="national">
          <div className="section-header">
            <h2>National overview</h2>
            <span className="section-note">
              {loading
                ? "connecting to the IEC feed…"
                : meta?.static
                  ? "snapshot · re-exported by the publishing job"
                  : `IEC poll every ${meta?.feed.interval_seconds ?? 30}s · page refresh 30s`}
              <button onClick={() => void reload()} className="tab" style={{ marginLeft: 10 }} type="button">
                refresh
              </button>
            </span>
          </div>

          <div className="two-col">
            <PartyChart parties={chart.parties} caption={chart.caption} />
            <div className="stack">
              <ProgressPanel national={national} />
              <IntegrityPanel national={national} />
            </div>
          </div>

          <div className="stack-wide">
            <NationalBoard national={national} />
          </div>
        </section>

        <section id="provinces">
          <div className="section-header">
            <h2>Provinces</h2>
            <span className="section-note">registered voters, 2021 baseline, live leader</span>
          </div>

          <div className="map-section">
            <ProvinceMap rows={rows} selected={active?.name ?? null} onSelect={setSelected} />
            <ProvinceList rows={rows} selected={active?.name ?? null} onSelect={setSelected} />
          </div>

          <div className="grid-2 board-pair">
            <ProvinceTable rows={rows} meta={partyMeta} selected={active?.name ?? null} onSelect={setSelected} />
            <ProvinceDetail row={active} meta={partyMeta} />
          </div>
        </section>

        <section id="metros">
          <div className="section-header">
            <h2>Quick metros</h2>
            <span className="section-note">tap a metro to jump to its province</span>
          </div>
          <Metros live={provinces} selected={active?.name ?? null} onSelect={setSelected} />
        </section>

        <section id="prepoll">
          <div className="section-header">
            <h2>Pre-poll picture</h2>
            <span className="section-note">the roll, turnout and the last result</span>
          </div>
          <div className="grid-2even">
            <RegistrationCard prepoll={prepoll} />
            <div className="stack">
              <TurnoutCard prepoll={prepoll} liveTurnout={national?.turnout ?? 0} />
              <StructureCard prepoll={prepoll} />
            </div>
          </div>
          <div style={{ marginTop: 16 }}>
            <BaselineCard prepoll={prepoll} />
          </div>
        </section>

        <section id="sources">
          <div className="section-header">
            <h2>Provenance</h2>
            <span className="section-note">open data, cited end to end</span>
          </div>
          <SourcesPanel sources={sources} meta={meta} />
        </section>

        <Footer meta={meta} />
      </main>
    </>
  );
}
