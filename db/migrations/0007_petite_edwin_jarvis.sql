CREATE TABLE `audit_logs` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`actorId` bigint unsigned,
	`action` varchar(64) NOT NULL,
	`targetUserId` bigint unsigned,
	`targetType` varchar(32),
	`targetId` varchar(64),
	`outcome` enum('success','failure') NOT NULL,
	`detail` varchar(512),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `audit_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` ADD `deactivatedAt` timestamp;--> statement-breakpoint
ALTER TABLE `users` ADD `deletionRequestedAt` timestamp;--> statement-breakpoint
CREATE INDEX `audit_logs_created_idx` ON `audit_logs` (`createdAt`);--> statement-breakpoint
CREATE INDEX `audit_logs_actor_idx` ON `audit_logs` (`actorId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `audit_logs_target_idx` ON `audit_logs` (`targetUserId`,`createdAt`);