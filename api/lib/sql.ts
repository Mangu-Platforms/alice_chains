/**
 * SQL helpers.
 *
 * `escapeLikePattern` neutralises the wildcards a user can type into a search
 * box. Drizzle binds the value as a parameter, so this was never an injection
 * risk — but an unescaped `%` still turns a lookup into "return everything",
 * and `_` silently matches any character (BUILD_PLAN S-10).
 *
 * The backslash must be escaped first, otherwise the escapes added for `%` and
 * `_` would themselves be escaped.
 */
export function escapeLikePattern(input: string): string {
  return input.replace(/[\\%_]/g, (char) => `\\${char}`);
}
