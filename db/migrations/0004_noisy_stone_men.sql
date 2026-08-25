CREATE TABLE `message_reactions` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`messageId` bigint unsigned NOT NULL,
	`userId` bigint unsigned NOT NULL,
	`emoji` varchar(32) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `message_reactions_id` PRIMARY KEY(`id`),
	CONSTRAINT `message_reactions_msg_user_emoji_uq` UNIQUE(`messageId`,`userId`,`emoji`)
);
--> statement-breakpoint
ALTER TABLE `message_reactions` ADD CONSTRAINT `message_reactions_messageId_messages_id_fk` FOREIGN KEY (`messageId`) REFERENCES `messages`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `message_reactions` ADD CONSTRAINT `message_reactions_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `message_reactions_message_idx` ON `message_reactions` (`messageId`);