export const nf = new Intl.NumberFormat("en-ZA");

export const num = (v: number | null | undefined) =>
  v === null || v === undefined ? "—" : nf.format(Math.round(v));

export const compact = (v: number | null | undefined) => {
  if (v === null || v === undefined) return "—";
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}m`;
  if (Math.abs(v) >= 10_000) return `${(v / 1_000).toFixed(1)}k`;
  return nf.format(Math.round(v));
};

export const pct = (v: number | null | undefined, digits = 1) =>
  v === null || v === undefined ? "—" : `${v.toFixed(digits)}%`;

const SAST = "Africa/Johannesburg";

export function sast(value: string | null | undefined, withDate = true): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  const opts: Intl.DateTimeFormatOptions = withDate
    ? {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: SAST,
      }
    : { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, timeZone: SAST };
  return new Intl.DateTimeFormat("en-ZA", opts).format(d);
}

export function clock(value: string | null | undefined): string {
  return sast(value, false);
}

export function duration(ms: number): string {
  if (ms <= 0) return "0s";
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${sec}s`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

export function relative(value: string | null | undefined): string {
  if (!value) return "never";
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return "never";
  const diff = Date.now() - then;
  if (diff < 45_000) return "just now";
  return `${duration(diff)} ago`;
}
