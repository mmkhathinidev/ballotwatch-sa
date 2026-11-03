import { useCallback, useEffect, useRef, useState } from "react";
import { api, Meta, National, Prepoll, Province, Sources } from "./api";

type State = {
  meta: Meta | null;
  national: National | null;
  provinces: Province[];
  prepoll: Prepoll | null;
  sources: Sources | null;
  error: string | null;
  loading: boolean;
  lastFetch: number | null;
};

export function useDashboard() {
  const [state, setState] = useState<State>({
    meta: null,
    national: null,
    provinces: [],
    prepoll: null,
    sources: null,
    error: null,
    loading: true,
    lastFetch: null,
  });
  const inFlight = useRef(false);

  const load = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const [meta, national, provinces, prepoll, sources] = await Promise.all([
        api.meta(),
        api.national(),
        api.provinces(),
        api.prepoll().catch(() => null),
        api.sources().catch(() => null),
      ]);
      setState({
        meta,
        national,
        provinces: provinces.provinces,
        prepoll,
        sources,
        error: null,
        loading: false,
        lastFetch: Date.now(),
      });
    } catch (err) {
      setState((s) => ({
        ...s,
        loading: false,
        error: err instanceof Error ? err.message : "Could not reach the API",
      }));
    } finally {
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 30_000);

    let source: EventSource | null = null;
    try {
      source = new EventSource("/api/stream");
      source.addEventListener("tick", () => void load());
    } catch {
      /* SSE unsupported — the interval above still refreshes */
    }
    return () => {
      window.clearInterval(timer);
      source?.close();
    };
  }, [load]);

  return { ...state, reload: load };
}

export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(t);
  }, [intervalMs]);
  return now;
}
