#!/usr/bin/env node
/**
 * Assert the initial JavaScript payload against the NFR-PERF-06 budget
 * (BUILD_PLAN S-16).
 *
 * The budget is on what a first-time visitor must download before the app can
 * render — the entry chunk plus everything it *statically* imports. Chunks
 * behind a `React.lazy` boundary are not on that path and are reported for
 * information only.
 *
 * Read from Vite's manifest rather than guessed from file names, because the
 * difference between a static and a dynamic import is exactly what the budget
 * turns on and only the manifest knows which is which.
 *
 *   npm run check:bundle
 */
import { gzipSync } from "node:zlib";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const DIST = "dist/public";
const MANIFEST = join(DIST, ".vite/manifest.json");

/** NFR-PERF-06: 250 KB gzipped. */
const BUDGET_BYTES = 250 * 1024;

function gzippedSize(file) {
  return gzipSync(readFileSync(join(DIST, file)), { level: 9 }).length;
}

function format(bytes) {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

let manifest;
try {
  manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
} catch {
  console.error(
    `Cannot read ${MANIFEST}. Run \`npm run build\` first; the manifest needs ` +
      `build.manifest = true in vite.config.ts.`
  );
  process.exit(2);
}

const entry = Object.values(manifest).find((chunk) => chunk.isEntry);
if (!entry) {
  console.error("No entry chunk in the manifest.");
  process.exit(2);
}

/** Walk the static import graph from the entry. */
const critical = new Set();
const queue = [entry];
while (queue.length > 0) {
  const chunk = queue.pop();
  if (!chunk || critical.has(chunk.file)) continue;
  critical.add(chunk.file);
  for (const key of chunk.imports ?? []) {
    if (manifest[key]) queue.push(manifest[key]);
  }
}

const criticalJs = [...critical].filter((file) => file.endsWith(".js"));
const total = criticalJs.reduce((sum, file) => sum + gzippedSize(file), 0);

console.log("\nInitial JavaScript payload (gzipped)\n");
for (const file of criticalJs.sort()) {
  console.log(`  ${format(gzippedSize(file)).padStart(10)}  ${file}`);
}
console.log(`  ${"—".repeat(10)}`);
console.log(`  ${format(total).padStart(10)}  total`);
console.log(`  ${format(BUDGET_BYTES).padStart(10)}  budget (NFR-PERF-06)`);

const lazyJs = Object.values(manifest)
  .filter((chunk) => chunk.file?.endsWith(".js") && !critical.has(chunk.file))
  .map((chunk) => chunk.file);

if (lazyJs.length > 0) {
  console.log("\nLoaded on demand, not counted:\n");
  for (const file of lazyJs.sort()) {
    console.log(`  ${format(gzippedSize(file)).padStart(10)}  ${file}`);
  }
}

// Raw size is reported too: gzip is what travels, but a large raw bundle still
// costs parse and compile time on a slow device.
const rawTotal = criticalJs.reduce((sum, file) => sum + statSync(join(DIST, file)).size, 0);
console.log(`\nRaw (uncompressed) critical path: ${format(rawTotal)}`);

if (total > BUDGET_BYTES) {
  console.error(
    `\nFAIL: the initial payload is ${format(total)}, over the ${format(
      BUDGET_BYTES
    )} budget by ${format(total - BUDGET_BYTES)}.\n\n` +
      `Move something behind a React.lazy boundary, or make the case for ` +
      `raising the budget in an ADR.\n`
  );
  process.exit(1);
}

const headroom = ((1 - total / BUDGET_BYTES) * 100).toFixed(0);
console.log(`\nPASS: ${headroom}% headroom under the budget.\n`);
