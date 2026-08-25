-- ─────────────────────────────────────────────────────────────────────────────
-- S-3 · foreign keys, unique constraints and indexes.
--
-- Adding UNIQUE to a table holding duplicates aborts with ERROR 1062; adding a
-- foreign key to a table holding orphans aborts with ERROR 1452. So this file
-- is probe → remediate → DDL, in that order, per DATA_MODEL.md 4.3. Every
-- remediation step is idempotent and safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

-- Step 1 · Guard the two orphan classes that CANNOT be auto-remediated.
--
-- messages.senderId and conversations.createdBy take RESTRICT foreign keys, so
-- an orphan there is a real decision — anonymise the author, or purge the
-- content — and not one a migration may take on an operator's behalf. Fail with
-- a message that says so, rather than leaving them to surface as a bare
-- ERROR 1452 thirteen statements later.
DROP PROCEDURE IF EXISTS alice_preflight_0002;--> statement-breakpoint

CREATE PROCEDURE alice_preflight_0002()
BEGIN
  DECLARE orphan_messages INT DEFAULT 0;
  DECLARE orphan_conversations INT DEFAULT 0;

  SELECT COUNT(*) INTO orphan_messages
    FROM messages m LEFT JOIN users u ON u.id = m.senderId WHERE u.id IS NULL;

  SELECT COUNT(*) INTO orphan_conversations
    FROM conversations c LEFT JOIN users u ON u.id = c.createdBy WHERE u.id IS NULL;

  IF orphan_messages > 0 OR orphan_conversations > 0 THEN
    -- MESSAGE_TEXT is capped at 128 characters by MySQL, so the detail lives in
    -- the runbook and this points at it.
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT =
      'Migration 0002 aborted: orphaned messages.senderId or conversations.createdBy. RESTRICT FKs - see DATA_MODEL.md 4.3 step 3.';
  END IF;
END;--> statement-breakpoint

CALL alice_preflight_0002();--> statement-breakpoint

DROP PROCEDURE alice_preflight_0002;--> statement-breakpoint

-- Step 2 · Dedupe. Keep the lowest id, which is the earliest row, so joinedAt
-- and "first read" semantics survive.

DELETE cp FROM conversation_participants cp
JOIN (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY conversationId, userId ORDER BY id) AS rn
  FROM conversation_participants
) d ON d.id = cp.id
WHERE d.rn > 1;--> statement-breakpoint

DELETE r FROM message_reads r
JOIN (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY messageId, userId ORDER BY id) AS rn
  FROM message_reads
) d ON d.id = r.id
WHERE d.rn > 1;--> statement-breakpoint

-- contacts collapses to the most-advanced status per directed pair, precedence
-- blocked > accepted > pending. Collapsing to an arbitrary survivor could
-- silently un-block someone, which is the one outcome that must not happen.
UPDATE contacts c
JOIN (
  SELECT userId, contactUserId,
         MIN(id) AS keep_id,
         MAX(FIELD(status,'pending','accepted','blocked')) AS rank_status
  FROM contacts GROUP BY userId, contactUserId
) d ON d.keep_id = c.id
SET c.status = ELT(d.rank_status,'pending','accepted','blocked');--> statement-breakpoint

DELETE k FROM contacts k
JOIN (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY userId, contactUserId ORDER BY id) AS rn
  FROM contacts
) d ON d.id = k.id
WHERE d.rn > 1;--> statement-breakpoint

-- Step 3 · Orphan remediation for the CASCADE and SET NULL relationships, where
-- the migration's action matches what the foreign key would do anyway.

DELETE cp FROM conversation_participants cp
  LEFT JOIN conversations c ON c.id = cp.conversationId WHERE c.id IS NULL;--> statement-breakpoint

DELETE cp FROM conversation_participants cp
  LEFT JOIN users u ON u.id = cp.userId WHERE u.id IS NULL;--> statement-breakpoint

DELETE m FROM messages m
  LEFT JOIN conversations c ON c.id = m.conversationId WHERE c.id IS NULL;--> statement-breakpoint

UPDATE messages m LEFT JOIN messages p ON p.id = m.replyToId
  SET m.replyToId = NULL WHERE m.replyToId IS NOT NULL AND p.id IS NULL;--> statement-breakpoint

DELETE r FROM message_reads r
  LEFT JOIN messages m ON m.id = r.messageId WHERE m.id IS NULL;--> statement-breakpoint

DELETE r FROM message_reads r
  LEFT JOIN users u ON u.id = r.userId WHERE u.id IS NULL;--> statement-breakpoint

DELETE k FROM contacts k LEFT JOIN users u ON u.id = k.userId WHERE u.id IS NULL;--> statement-breakpoint

DELETE k FROM contacts k LEFT JOIN users u ON u.id = k.contactUserId WHERE u.id IS NULL;--> statement-breakpoint

-- Step 4 · The DDL.

ALTER TABLE `contacts` ADD CONSTRAINT `contacts_user_contact_uq` UNIQUE(`userId`,`contactUserId`);--> statement-breakpoint
ALTER TABLE `conversation_participants` ADD CONSTRAINT `cp_conversation_user_uq` UNIQUE(`conversationId`,`userId`);--> statement-breakpoint
ALTER TABLE `message_reads` ADD CONSTRAINT `message_reads_message_user_uq` UNIQUE(`messageId`,`userId`);--> statement-breakpoint
ALTER TABLE `contacts` ADD CONSTRAINT `contacts_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `contacts` ADD CONSTRAINT `contacts_contactUserId_users_id_fk` FOREIGN KEY (`contactUserId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `conversation_participants` ADD CONSTRAINT `cp_conversationId_conversations_id_fk` FOREIGN KEY (`conversationId`) REFERENCES `conversations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `conversation_participants` ADD CONSTRAINT `cp_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `conversations` ADD CONSTRAINT `conversations_createdBy_users_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `message_reads` ADD CONSTRAINT `message_reads_messageId_messages_id_fk` FOREIGN KEY (`messageId`) REFERENCES `messages`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `message_reads` ADD CONSTRAINT `message_reads_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `messages` ADD CONSTRAINT `messages_conversationId_conversations_id_fk` FOREIGN KEY (`conversationId`) REFERENCES `conversations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `messages` ADD CONSTRAINT `messages_senderId_users_id_fk` FOREIGN KEY (`senderId`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `messages` ADD CONSTRAINT `messages_replyToId_messages_id_fk` FOREIGN KEY (`replyToId`) REFERENCES `messages`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `contacts_contactUser_status_idx` ON `contacts` (`contactUserId`,`status`);--> statement-breakpoint
CREATE INDEX `contacts_user_status_idx` ON `contacts` (`userId`,`status`);--> statement-breakpoint
CREATE INDEX `cp_user_idx` ON `conversation_participants` (`userId`);--> statement-breakpoint
CREATE INDEX `conversations_createdBy_idx` ON `conversations` (`createdBy`);--> statement-breakpoint
CREATE INDEX `message_reads_user_idx` ON `message_reads` (`userId`);--> statement-breakpoint
CREATE INDEX `messages_conversation_created_idx` ON `messages` (`conversationId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `messages_sender_idx` ON `messages` (`senderId`);--> statement-breakpoint
CREATE INDEX `messages_replyTo_idx` ON `messages` (`replyToId`);