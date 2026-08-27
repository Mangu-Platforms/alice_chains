#!/usr/bin/env node
/**
 * Documentation governance check — AGENTS.md §12, docs/README.md.
 *
 * Two failures this catches, both of which have happened here:
 *
 *   1. A relative Markdown link that points at nothing. Renaming or moving a
 *      document silently breaks every link into it, and nothing else in the
 *      toolchain looks at Markdown.
 *   2. A document nobody can reach. `docs/README.md` — the documentation index
 *      itself — had zero inbound links for its entire existence, which is a
 *      good index and a useless one at the same time.
 *
 * Not wired into `npm run validate`: the gate covers the application, and a
 * documentation link is not a reason to fail a build that ships code. Run it
 * when you touch documentation — `npm run check:docs` — and CONTRIBUTING.md and
 * AGENTS.md both say so.
 *
 * Usage: node scripts/check-doc-links.mjs
 */
import { readFileSync, existsSync, statSync, readdirSync } from "node:fs";
import { dirname, join, normalize, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "coverage", "storage"]);

/**
 * Documents that are allowed to have no inbound links, with the reason.
 * Anything else unreachable is a governance failure, not a style preference.
 */
const ROOT_DOCUMENTS = new Set([
  "README.md", // the front door — GitHub renders it; nothing needs to link it
  "AGENTS.md", // the agent entry point — tools look for it by name
  "CLAUDE.md", // ditto, Claude Code
  ".github/copilot-instructions.md", // ditto, GitHub Copilot
  ".github/pull_request_template.md", // GitHub loads it by path, never by link
]);

function markdownFiles(dir = ROOT) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...markdownFiles(path));
    else if (entry.endsWith(".md")) out.push(path);
  }
  return out;
}

/** GitHub's heading-to-anchor rule, closely enough for our own documents. */
function anchors(markdown) {
  const found = new Set();
  for (const line of markdown.split("\n")) {
    const heading = line.match(/^#{1,6}\s+(.*)$/);
    if (heading) {
      found.add(
        heading[1]
          .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
          .replace(/[`*_~]/g, "")
          .toLowerCase()
          .trim()
          .replace(/[^\w\s-]/g, "")
          .replace(/ /g, "-"),
      );
    }
    const explicit = line.match(/(?:id|name)="([^"]+)"/);
    if (explicit) found.add(explicit[1].toLowerCase());
  }
  return found;
}

const files = markdownFiles().sort();
const inbound = new Map(files.map((f) => [f, new Set()]));
const problems = [];
let linkCount = 0;

for (const file of files) {
  const source = readFileSync(file, "utf8");
  const here = relative(ROOT, file);
  for (const [, , target] of source.matchAll(/\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
    if (/^(https?:|mailto:|#)/.test(target)) continue;
    const [path, anchor] = target.split("#");
    if (!path) continue;
    linkCount++;

    const resolved = normalize(join(dirname(file), decodeURIComponent(path)));
    if (!existsSync(resolved)) {
      problems.push(`broken link    ${here} → ${target}`);
      continue;
    }
    if (inbound.has(resolved) && resolved !== file) inbound.get(resolved).add(here);
    if (anchor && resolved.endsWith(".md") && statSync(resolved).isFile()) {
      if (!anchors(readFileSync(resolved, "utf8")).has(anchor.toLowerCase())) {
        problems.push(`broken anchor  ${here} → ${target}`);
      }
    }
  }
}

for (const [file, sources] of inbound) {
  const here = relative(ROOT, file);
  if (sources.size === 0 && !ROOT_DOCUMENTS.has(here)) {
    problems.push(
      `unreachable    ${here} — no document links to it. Link it from docs/README.md (AGENTS.md §12)`,
    );
  }
}

console.log(`Checked ${linkCount} relative links across ${files.length} Markdown files.`);
if (problems.length) {
  console.error(`\nFAIL: ${problems.length} problem${problems.length === 1 ? "" : "s"}\n`);
  for (const problem of problems) console.error(`  ${problem}`);
  console.error("\nSee the documentation-governance rule in AGENTS.md §12 and docs/README.md.");
  process.exit(1);
}
console.log("Every relative link resolves, and every document is reachable.");
