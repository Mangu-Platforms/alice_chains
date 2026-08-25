/**
 * Message search (BUILD_PLAN P-SEARCH-1/2).
 *
 * FULLTEXT in BOOLEAN MODE, with a bounded LIKE for queries the index cannot
 * serve. That fallback is not belt-and-braces: InnoDB only tokenises words of
 * at least `innodb_ft_min_token_size` characters — three by default — so a
 * two-letter query against FULLTEXT alone returns *nothing*, silently, and
 * looks exactly like "no results". The minimum is read from the server rather
 * than assumed, because an operator may have changed it.
 *
 * No Meilisearch, no Elasticsearch. ADR-006 requires an in-repo decision record
 * before a search engine joins the stack, and MySQL answers this shape of query
 * perfectly well at the scale a self-hosted instance runs at.
 */
import { sql } from "drizzle-orm";
import { getDb } from "../queries/connection";
import { log } from "./logger";

let cachedMinTokenSize: number | null = null;

/** The server's minimum indexed token length. Read once. */
export async function minTokenSize(): Promise<number> {
  if (cachedMinTokenSize !== null) return cachedMinTokenSize;

  try {
    const [rows] = (await getDb().execute(
      sql`SELECT @@innodb_ft_min_token_size AS size`
    )) as unknown as [{ size: number }[]];
    cachedMinTokenSize = Number(rows[0]?.size ?? 3);
  } catch (error) {
    log.warn("could not read innodb_ft_min_token_size; assuming 3", { error });
    cachedMinTokenSize = 3;
  }

  return cachedMinTokenSize;
}

/** Tests only. */
export function resetMinTokenSizeCache(): void {
  cachedMinTokenSize = null;
}

/**
 * Turn a user's words into a BOOLEAN MODE expression.
 *
 * Every operator character is stripped rather than escaped: `+`, `-`, `*`, `"`,
 * `(`, `)`, `~`, `<`, `>` and `@` all mean something to the parser, and a query
 * that happens to contain one would otherwise change its own meaning — a
 * leading `-` would exclude the very word the member typed. Each surviving word
 * becomes a required prefix, so "hel wor" matches "hello world".
 */
export function toBooleanQuery(input: string): string {
  const words = input
    .replace(/[+\-*~<>()"@]/g, " ")
    .split(/\s+/)
    .map((word) => word.trim())
    .filter(Boolean)
    .slice(0, 10);

  return words.map((word) => `+${word}*`).join(" ");
}

/** Whether FULLTEXT can serve this query at all. */
export async function isFullTextEligible(input: string): Promise<boolean> {
  const minimum = await minTokenSize();
  const words = toBooleanQuery(input)
    .split(" ")
    .map((token) => token.replace(/^\+|\*$/g, ""));

  return words.length > 0 && words.every((word) => word.length >= minimum);
}
