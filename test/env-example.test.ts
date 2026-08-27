/**
 * BUILD_PLAN P-TOOL-7 — `.env.example` documents every variable the code reads.
 *
 * Cases: TC-TOOL-01…03.
 *
 * The failure this prevents is quiet and expensive: a variable is added to the
 * schema, works on the machine that added it because that machine's `.env`
 * already has it, and the next person to copy `.env.example` gets a boot
 * failure naming a variable no document mentions. It runs in both directions,
 * because a `.env.example` that lists variables nothing reads is its own kind
 * of wrong — it invites an operator to configure something that has no effect.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { declaredEnvKeys } from "../api/lib/env";

const ROOT = join(__dirname, "..");
const SOURCE_DIRS = ["api", "db", "src", "scripts", "contracts", "test"];

/**
 * Variables that are read but must not be in `.env.example`.
 *
 * `VITE_*` reads in the client are the same variables the server section
 * already documents; anything else here is a deliberate omission with a reason
 * next to it.
 */
const NOT_DOCUMENTED = new Set<string>([
  // H-7. Deprecated aliases the schema still accepts for backward
  // compatibility (ADR-002's migration path) — deliberately absent from the
  // file a new deployment copies, so a stranger is never invited to set a
  // name that is going away. `KIMI_AUTH_URL`/`KIMI_APP_ID`/`SESSION_SECRET`
  // are what .env.example documents instead; env.ts's own comments explain
  // the rename and the fallback.
  "VITE_KIMI_AUTH_URL",
  "VITE_APP_ID",
  "JWT_SECRET",
]);

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "dist") continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...sourceFiles(path));
    // Test files are skipped: this scan is about what the application reads,
    // and a suite that names a variable in an assertion — this one does —
    // would otherwise report itself.
    else if (/\.(test|spec)\.tsx?$/.test(path)) continue;
    else if (/\.(ts|tsx|mjs|js)$/.test(path)) out.push(path);
  }
  return out;
}

/**
 * Comments removed, so a variable *mentioned* in prose is not counted as read.
 *
 * Deliberately coarse — it does not track `//` inside a string literal — which
 * is safe here because the result is only ever searched for `process.env`
 * expressions, and a source line that contains one inside a string is not a
 * read either.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
}

/** Every `process.env` reference in the source tree, outside comments. */
function referencedEnvKeys(): Set<string> {
  const found = new Set<string>();
  const patterns = [
    /process\.env\.([A-Z][A-Z0-9_]*)/g,
    /process\.env\[["'`]([A-Z][A-Z0-9_]*)["'`]\]/g,
  ];

  for (const dir of SOURCE_DIRS) {
    for (const file of sourceFiles(join(ROOT, dir))) {
      const source = stripComments(readFileSync(file, "utf8"));
      for (const pattern of patterns) {
        for (const match of source.matchAll(pattern)) found.add(match[1]);
      }
    }
  }
  return found;
}

/** The variable names `.env.example` assigns, comments ignored. */
function documentedEnvKeys(): Set<string> {
  const text = readFileSync(join(ROOT, ".env.example"), "utf8");
  const keys = new Set<string>();
  for (const line of text.split("\n")) {
    const match = /^([A-Z][A-Z0-9_]*)=/.exec(line.trim());
    if (match) keys.add(match[1]);
  }
  return keys;
}

describe(".env.example (P-TOOL-7)", () => {
  const documented = documentedEnvKeys();
  const referenced = referencedEnvKeys();
  // The schema parses `process.env` as a whole, so its names appear nowhere as
  // a `process.env.X` expression and have to be asked for directly.
  const read = new Set([...referenced, ...declaredEnvKeys]);

  it("documents every variable the code reads", () => {
    // TC-TOOL-01
    const undocumented = [...read]
      .filter((key) => !documented.has(key))
      .filter((key) => !NOT_DOCUMENTED.has(key))
      .sort();

    expect(undocumented, `add these to .env.example: ${undocumented.join(", ")}`)
      .toEqual([]);
  });

  it("documents nothing the code does not read", () => {
    // TC-TOOL-02 — a variable an operator can set that changes nothing is a
    // trap, not documentation.
    const stale = [...documented].filter((key) => !read.has(key)).sort();

    expect(stale, `these are documented but never read: ${stale.join(", ")}`)
      .toEqual([]);
  });

  it("ships no VITE_-prefixed variable that looks like a secret", () => {
    // TC-TOOL-03 — Vite inlines every VITE_* variable into the public bundle,
    // so a secret with that prefix is published on the next build. The server
    // refuses to boot on one (SEC-C-24); this catches it a step earlier, in
    // the file people copy.
    const leaky = [...documented].filter(
      (key) => key.startsWith("VITE_") && /SECRET|PRIVATE|PASSWORD|TOKEN|KEY/.test(key)
    );

    expect(leaky, `VITE_ inlines these into the public bundle: ${leaky.join(", ")}`)
      .toEqual([]);
  });
});
