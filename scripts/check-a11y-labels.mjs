#!/usr/bin/env node
/**
 * Find icon-only controls with no accessible name (BUILD_PLAN S-20).
 *
 * A button whose only content is an SVG icon has no accessible name at all: a
 * screen reader announces "button" and nothing else. This walks the JSX with a
 * brace- and string-aware scanner rather than a regular expression — a naive
 * one stops at the first `>` and an arrow function in a handler is enough to
 * hide the very attribute being looked for, which is how the first pass of
 * this audit produced a false positive.
 *
 *   npm run check:a11y
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOTS = ["src"];
// The vendored shadcn primitives are wrappers; the label belongs on the call
// site, which is what this checks.
const SKIP = ["src/components/ui/"];

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...walk(path));
    else if (path.endsWith(".tsx")) out.push(path);
  }
  return out;
}

/**
 * Read one JSX opening tag starting at `start`, respecting nested braces and
 * strings so a `>` inside an expression does not end it early.
 */
function readTag(src, start) {
  let depth = 0;
  let quote = null;
  for (let i = start; i < src.length; i += 1) {
    const char = src[i];
    if (quote) {
      if (char === quote && src[i - 1] !== "\\") quote = null;
      continue;
    }
    if (char === '"' || char === "'" || char === "`") quote = char;
    else if (char === "{") depth += 1;
    else if (char === "}") depth -= 1;
    else if (char === ">" && depth === 0) return src.slice(start, i + 1);
  }
  return null;
}

/**
 * An icon and nothing else. A trailing `{...}` expression is deliberately NOT
 * allowed here: in this codebase that is almost always the button's text, and
 * text is an accessible name — flagging those produced a false positive on the
 * "Leave group" button, whose label is exactly such an expression.
 */
const ICON_ONLY = /^\s*<[A-Z]\w*\s[^>]*\/>\s*<\/(button|Button)>/;
const findings = [];

for (const file of ROOTS.flatMap(walk)) {
  if (SKIP.some((prefix) => file.startsWith(prefix))) continue;
  const src = readFileSync(file, "utf8");

  for (const match of src.matchAll(/<(Button|button)\b/g)) {
    const tag = readTag(src, match.index);
    if (!tag) continue;

    const hasName = /aria-label|aria-labelledby|title=/.test(tag);
    if (hasName) continue;

    const after = src.slice(match.index + tag.length);
    const isIconOnly = ICON_ONLY.test(after) || /size="icon"/.test(tag);
    if (!isIconOnly) continue;

    findings.push({ file, line: src.slice(0, match.index).split("\n").length });
  }
}

if (findings.length === 0) {
  console.log("\nEvery icon-only control has an accessible name.\n");
  process.exit(0);
}

console.error("\nIcon-only controls with no accessible name:\n");
for (const { file, line } of findings) console.error(`  ${file}:${line}`);
console.error(
  `\n${findings.length} found. Add an aria-label — a screen reader announces ` +
    `these as "button" and nothing else.\n`
);
process.exit(1);
