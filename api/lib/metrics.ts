/**
 * RED metrics — Rate, Errors, Duration (BUILD_PLAN S-15, TECH_SPEC §10).
 *
 * In-process counters exposed in Prometheus text format. No client library:
 * the exposition format is a handful of lines, and adding a dependency is a
 * decision rather than a side effect here.
 *
 * Like the rate limiter, these are per process. With several replicas a scraper
 * sums across them, which is the normal Prometheus arrangement — unlike the
 * rate limiter, that is correct rather than a limitation.
 */

interface Histogram {
  count: number;
  sumMs: number;
  /** Cumulative counts per upper bound, in milliseconds. */
  buckets: Map<number, number>;
}

const BUCKET_BOUNDS_MS = [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000];

const counters = new Map<string, number>();
const histograms = new Map<string, Histogram>();

function key(name: string, labels: Record<string, string>): string {
  const rendered = Object.entries(labels)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([k, v]) => `${k}="${escapeLabel(v)}"`)
    .join(",");
  return rendered ? `${name}{${rendered}}` : name;
}

/** Prometheus label values escape backslash, quote and newline. */
function escapeLabel(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
}

export function increment(name: string, labels: Record<string, string> = {}, by = 1): void {
  const k = key(name, labels);
  counters.set(k, (counters.get(k) ?? 0) + by);
}

export function observe(
  name: string,
  durationMs: number,
  labels: Record<string, string> = {}
): void {
  const k = key(name, labels);
  const histogram = histograms.get(k) ?? {
    count: 0,
    sumMs: 0,
    buckets: new Map(BUCKET_BOUNDS_MS.map((b) => [b, 0])),
  };

  histogram.count += 1;
  histogram.sumMs += durationMs;
  for (const bound of BUCKET_BOUNDS_MS) {
    if (durationMs <= bound) histogram.buckets.set(bound, (histogram.buckets.get(bound) ?? 0) + 1);
  }

  histograms.set(k, histogram);
}

/** Time an operation and record its duration and outcome. */
export async function timed<T>(
  name: string,
  labels: Record<string, string>,
  operation: () => Promise<T>
): Promise<T> {
  const started = performance.now();
  try {
    const result = await operation();
    observe(name, performance.now() - started, { ...labels, outcome: "success" });
    return result;
  } catch (error) {
    observe(name, performance.now() - started, { ...labels, outcome: "error" });
    throw error;
  }
}

/** The current snapshot, in Prometheus text exposition format. */
export function render(): string {
  const lines: string[] = [];

  for (const [name, value] of [...counters].sort()) {
    lines.push(`${name} ${value}`);
  }

  for (const [name, histogram] of [...histograms].sort()) {
    const [base, labels] = splitKey(name);
    for (const bound of BUCKET_BOUNDS_MS) {
      lines.push(
        `${base}_bucket{${withLabel(labels, "le", String(bound / 1000))}} ${
          histogram.buckets.get(bound) ?? 0
        }`
      );
    }
    lines.push(`${base}_bucket{${withLabel(labels, "le", "+Inf")}} ${histogram.count}`);
    lines.push(`${base}_sum${labels ? `{${labels}}` : ""} ${(histogram.sumMs / 1000).toFixed(6)}`);
    lines.push(`${base}_count${labels ? `{${labels}}` : ""} ${histogram.count}`);
  }

  return `${lines.join("\n")}\n`;
}

function splitKey(k: string): [string, string] {
  const brace = k.indexOf("{");
  if (brace === -1) return [k, ""];
  return [k.slice(0, brace), k.slice(brace + 1, -1)];
}

function withLabel(labels: string, name: string, value: string): string {
  return labels ? `${labels},${name}="${value}"` : `${name}="${value}"`;
}

/** Tests only. */
export function resetMetrics(): void {
  counters.clear();
  histograms.clear();
}
