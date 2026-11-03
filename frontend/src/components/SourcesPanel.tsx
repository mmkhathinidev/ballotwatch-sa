import { Meta, Sources } from "../lib/api";
import { relative, sast } from "../lib/format";

export function SourcesPanel({ sources, meta }: { sources: Sources | null; meta: Meta | null }) {
  return (
    <div className="grid-2even">
      <div className="card">
        <div className="card-head">
          <span className="card-title">
            Sources <span>· where every number comes from</span>
          </span>
          <span className="card-tag">primary data</span>
        </div>
        <div className="card-body">
          <div className="source-list">
            <div className="source-item">
              <strong>{sources?.primary.name ?? "IEC results dashboard"}</strong>
              <a href={sources?.primary.url ?? "https://results.elections.org.za"} target="_blank" rel="noreferrer">
                {sources?.primary.url ?? "https://results.elections.org.za"}
              </a>
              <small>{sources?.primary.note}</small>
            </div>
            <div className="source-item">
              <strong>{sources?.registration.name ?? "IEC registration statistics"}</strong>
              <a href={sources?.registration.url ?? "https://www.elections.org.za"} target="_blank" rel="noreferrer">
                {sources?.registration.url}
              </a>
              <small>Voter roll as at {sources?.registration.as_at ?? "—"}</small>
            </div>
            <div className="source-item">
              <strong>{sources?.official_api.name ?? "IEC Elections API"}</strong>
              <a href={sources?.official_api.url ?? "https://api.elections.org.za"} target="_blank" rel="noreferrer">
                {sources?.official_api.url}
              </a>
              <small>{sources?.official_api.note}</small>
            </div>
            {(sources?.prepoll ?? []).map((s) => (
              <div className="source-item" key={s.url}>
                <strong>{s.label}</strong>
                <a href={s.url} target="_blank" rel="noreferrer">
                  {s.url}
                </a>
                <small>HTTP {s.status} · historical bundle</small>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <span className="card-title">
            Method &amp; health <span>· read before quoting</span>
          </span>
          <span className="card-tag">{meta?.feed.status ?? "—"}</span>
        </div>
        <div className="card-body">
          <div className="stat-grid">
            <div className="stat">
              <span>Last IEC report</span>
              <b>{sast(meta?.report_date)}</b>
            </div>
            <div className="stat">
              <span>Last poll</span>
              <b>{relative(meta?.feed.polled_at)}</b>
            </div>
            <div className="stat">
              <span>Poll interval</span>
              <b>{meta?.feed.interval_seconds ?? "—"}s</b>
            </div>
            <div className="stat">
              <span>Polls recorded</span>
              <b>{meta?.feed.total_polls ?? 0}</b>
            </div>
            <div className="stat">
              <span>Feed changes seen</span>
              <b>{meta?.feed.changes ?? 0}</b>
            </div>
            <div className="stat">
              <span>Avg latency</span>
              <b>{meta?.feed.avg_latency_ms ?? 0} ms</b>
            </div>
          </div>
          <ul className="muted" style={{ fontSize: 12.5, paddingLeft: 18, margin: "14px 0 0" }}>
            {(sources?.caveats ?? []).map((c) => (
              <li key={c} style={{ marginBottom: 6 }}>
                {c}
              </li>
            ))}
            <li>
              Turnout is calculated as ballots cast ÷ two ballots per voter ÷ registered voters,
              because local elections put a ward and a PR ballot in every voter's hands.
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}

export function Footer({ meta }: { meta: Meta | null }) {
  return (
    <footer>
      <span>BallotWatch SA · independent civic dashboard, not affiliated with the IEC.</span>
      <span className="spacer" />
      <span>
        Data © Electoral Commission of South Africa · feed event {meta?.event_id ?? "—"}
      </span>
      <a href="/api/sources" target="_blank" rel="noreferrer" style={{ color: "var(--info)" }}>
        API
      </a>
    </footer>
  );
}
