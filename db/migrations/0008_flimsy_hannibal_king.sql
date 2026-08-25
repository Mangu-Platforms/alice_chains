ALTER TABLE `conversation_participants` MODIFY COLUMN `lastReadAt` timestamp(3);--> statement-breakpoint
ALTER TABLE `conversations` MODIFY COLUMN `createdAt` timestamp(3) NOT NULL DEFAULT (now(3));--> statement-breakpoint
ALTER TABLE `conversations` MODIFY COLUMN `updatedAt` timestamp(3) NOT NULL DEFAULT (now(3));--> statement-breakpoint
ALTER TABLE `message_reads` MODIFY COLUMN `readAt` timestamp(3) NOT NULL DEFAULT (now(3));--> statement-breakpoint
ALTER TABLE `messages` MODIFY COLUMN `createdAt` timestamp(3) NOT NULL DEFAULT (now(3));--> statement-breakpoint
ALTER TABLE `messages` MODIFY COLUMN `updatedAt` timestamp(3) NOT NULL DEFAULT (now(3));