/**
 * Render URLs inside message text as links (BUILD_PLAN P-LINK-1).
 *
 * Two rules, both load-bearing:
 *
 * 1. **Only http and https become links.** `javascript:` is the obvious one,
 *    but `data:` can carry an HTML document and `vbscript:` still runs in some
 *    contexts. Anything else is left as plain text, which is safe because React
 *    escapes it.
 * 2. **No unfurling.** Fetching a URL a member pasted, on the server, to build
 *    a preview would make the server issue arbitrary outbound requests on
 *    someone else's say-so — that is SSRF, and it is a feature request away
 *    from reading an internal metadata endpoint.
 *
 * The parsing is deliberately plain: a regex over the text, not an HTML
 * parser, because the input is text and must stay text. Nothing here produces
 * markup from message content, so `dangerouslySetInnerHTML` never enters the
 * picture (FR-MSG-18).
 */
import type { ReactNode } from "react";

/**
 * A URL-ish run of characters.
 *
 * `www.` is included because people write it, and gets an `https://` prefix
 * when linked. Trailing punctuation is trimmed afterwards rather than
 * excluded here — "see https://example.com." should link the URL and keep the
 * full stop.
 */
const URL_PATTERN = /\b((?:https?:\/\/|www\.)[^\s<>"']+)/gi;

/** Characters that end a sentence rather than a URL. */
const TRAILING_PUNCTUATION = /[.,;:!?)\]}'"]+$/;

export interface LinkPart {
  type: "text" | "link";
  value: string;
  /** For a link, the href to use — never the raw text. */
  href?: string;
}

/** Split text into plain runs and linkable URLs. Pure, so it is testable. */
export function splitLinks(text: string): LinkPart[] {
  const parts: LinkPart[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(URL_PATTERN)) {
    const index = match.index ?? 0;
    let candidate = match[0];

    // Balance a closing bracket only when the URL opened one, so
    // "(see https://example.com)" keeps the bracket out of the link but
    // "https://en.wikipedia.org/wiki/Foo_(bar)" keeps it in.
    const trailing = candidate.match(TRAILING_PUNCTUATION);
    if (trailing) {
      const stripped = candidate.slice(0, -trailing[0].length);
      const opens = (stripped.match(/\(/g) ?? []).length;
      const closes = (stripped.match(/\)/g) ?? []).length;
      if (!(trailing[0] === ")" && opens > closes)) {
        candidate = stripped;
      }
    }

    if (index > lastIndex) {
      parts.push({ type: "text", value: text.slice(lastIndex, index) });
    }

    const href = candidate.toLowerCase().startsWith("www.")
      ? `https://${candidate}`
      : candidate;

    if (isSafeHref(href)) {
      parts.push({ type: "link", value: candidate, href });
    } else {
      parts.push({ type: "text", value: candidate });
    }

    lastIndex = index + candidate.length;
  }

  if (lastIndex < text.length) {
    parts.push({ type: "text", value: text.slice(lastIndex) });
  }

  return parts.length > 0 ? parts : [{ type: "text", value: text }];
}

/** Only http and https are ever turned into an anchor. */
export function isSafeHref(href: string): boolean {
  try {
    const { protocol } = new URL(href);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

/** Render message text with its URLs as links. */
export function Linkify({ text }: { text: string }): ReactNode {
  return splitLinks(text).map((part, index) =>
    part.type === "link" ? (
      <a
        key={index}
        href={part.href}
        target="_blank"
        // `noopener` stops the opened page reaching back through
        // `window.opener`; `noreferrer` stops this app's URLs — which contain
        // conversation ids — being sent to whatever a member clicks.
        rel="noopener noreferrer nofollow"
        className="underline underline-offset-2 hover:opacity-80 break-all"
      >
        {part.value}
      </a>
    ) : (
      <span key={index}>{part.value}</span>
    )
  );
}
