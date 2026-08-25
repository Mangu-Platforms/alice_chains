CREATE TABLE `attachments` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`messageId` bigint unsigned,
	`uploaderId` bigint unsigned NOT NULL,
	`storageKey` varchar(512) NOT NULL,
	`fileName` varchar(255) NOT NULL,
	`mimeType` varchar(127) NOT NULL,
	`byteSize` bigint unsigned NOT NULL,
	`width` bigint unsigned,
	`height` bigint unsigned,
	`checksumSha256` varchar(64),
	`status` enum('pending','ready','failed','quarantined') NOT NULL DEFAULT 'pending',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `attachments_id` PRIMARY KEY(`id`),
	CONSTRAINT `attachments_storageKey_uq` UNIQUE(`storageKey`)
);
--> statement-breakpoint
ALTER TABLE `attachments` ADD CONSTRAINT `attachments_messageId_messages_id_fk` FOREIGN KEY (`messageId`) REFERENCES `messages`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `attachments` ADD CONSTRAINT `attachments_uploaderId_users_id_fk` FOREIGN KEY (`uploaderId`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `attachments_message_idx` ON `attachments` (`messageId`);--> statement-breakpoint
CREATE INDEX `attachments_uploader_created_idx` ON `attachments` (`uploaderId`,`createdAt`);