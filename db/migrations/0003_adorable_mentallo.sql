ALTER TABLE `messages` ADD `deletedAt` timestamp;--> statement-breakpoint
ALTER TABLE `messages` ADD `deletedBy` bigint unsigned;--> statement-breakpoint
ALTER TABLE `messages` ADD CONSTRAINT `messages_deletedBy_users_id_fk` FOREIGN KEY (`deletedBy`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `messages_conversation_active_idx` ON `messages` (`conversationId`,`deletedAt`,`createdAt`);