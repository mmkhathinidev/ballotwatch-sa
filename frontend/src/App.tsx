import { useMemo } from "react";
import { Countdown, TopBar } from "./components/Chrome";
import { IntegrityPanel, NationalBoard, ProgressPanel } from "./components/LivePanel";
import { BaselineCard, RegistrationCard, StructureCard, TurnoutCard } from "./components/Prepoll";
import { ProvinceBoard } from "./components/ProvincePanel";
import { Footer, SourcesPanel } from "./components/SourcesPanel";
import { compact, num } from "./lib/format";
import { useDashboard } from "./lib/useDashboard";

export default function App() {
  const { meta, national, provinces, prepoll, sources, error, loading, reload } = useDashboard();

  const kpis = useMemo(() => {
    const s = prepoll?.structure_2026;
    return [
      {
        label: "Registered voters",
        value: compact(prepoll?.registration.total || s?.registered_voters || 0),
        foot: prepoll ? `roll as at ${prepoll.registration.as_at}` : "IEC voter roll",
      },
      { label: "Municipal councils", value: num(s?.councils), foot: "up for election" },
      { label: "Council seats", value: num(s?.seats), foot: "ward + proportional" },
      { label: "Wards contested", value: num(s?.wards), foot: "23 696 voting districts" },
      {
        label: "Ballots counted",
        value: compact(national?.ballots_cast ?? 0),
        foot: national?.loaded ? `${(national?.turnout ?? 0).toFixed(1)}% turnout` : "counting not started",
      },
    ];
  }, [prepoll, national]);

  return (
    <>
      <TopBar meta={meta} error={error} />

      <main className="shell">
        <section className="hero" style={{ marginTop: 0 }}>
          <div>
            <div className="eyebrow">South Africa · 2026 Local Government Elections</div>
            <h1>
              Every ward. Every ballot.
              <br />
              <em>As the Commission counts.</em>
            </h1>
            <p className="hero-lede">
              Polling day is <b>Wednesday 4 November 2026</b>. This dashboard carries the full
              pre-poll picture — the roll, the 2021 baseline, turnout history — and then follows the
              IEC's own results feed live, province by province, council by council, with the
              arithmetic checked on every refresh.
            </p>
          </div>
          <Countdown meta={meta} />
        </section>

        <div className="kpis">
          {kpis.map((k) => (
            <div className="kpi" key={k.label}>
              <span className="kpi-label">{k.label}</span>
              <span className="kpi-value">{k.value}</span>
              <span className="kpi-foot">{k.foot}</span>
            </div>
          ))}
        </div>

        <section>
          <div className="section-head">
            <h2 className="section-title">Live count</h2>
            <span className="section-sub">
              {loading
                ? "connecting to the IEC feed…"
                : `IEC poll every ${meta?.feed.interval_seconds ?? 30}s · page refresh 30s`}
              <button
                onClick={() => void reload()}
                className="tab"
                style={{ marginLeft: 10 }}
                type="button"
              >
                refresh
              </button>
            </span>
          </div>
          <div className="grid-2">
            <NationalBoard national={national} />
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <ProgressPanel national={national} />
              <IntegrityPanel national={national} />
            </div>
          </div>
        </section>

        <section>
          <div className="section-head">
            <h2 className="section-title">Provinces</h2>
            <span className="section-sub">registered voters, 2021 baseline, live leader</span>
          </div>
          <ProvinceBoard prepoll={prepoll} live={provinces} />
        </section>

        <section>
          <div className="section-head">
            <h2 className="section-title">Pre-poll picture</h2>
            <span className="section-sub">the roll, turnout and the last result</span>
          </div>
          <div className="grid-2even">
            <RegistrationCard prepoll={prepoll} />
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <TurnoutCard prepoll={prepoll} liveTurnout={national?.turnout ?? 0} />
              <StructureCard prepoll={prepoll} />
            </div>
          </div>
          <div style={{ marginTop: 16 }}>
            <BaselineCard prepoll={prepoll} />
          </div>
        </section>

        <section>
          <div className="section-head">
            <h2 className="section-title">Provenance</h2>
            <span className="section-sub">open data, cited end to end</span>
          </div>
          <SourcesPanel sources={sources} meta={meta} />
        </section>

        <Footer meta={meta} />
      </main>
    </>
  );
}
