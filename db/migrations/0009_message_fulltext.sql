-- ─────────────────────────────────────────────────────────────────────────────
-- P-SEARCH-1 · full-text search over message bodies.
--
-- Added by hand because Drizzle has no builder for a FULLTEXT index. It is
-- declared in db/schema.ts as a comment so the next reader knows it exists and
-- does not "fix" its absence.
--
-- InnoDB FULLTEXT only tokenises words of at least `innodb_ft_min_token_size`
-- characters — three by default. `message.search` reads that value from the
-- server and falls back to a bounded LIKE below it, rather than silently
-- returning nothing for a two-letter query.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE FULLTEXT INDEX `messages_content_ft` ON `messages` (`content`);
