CREATE TABLE `resume_uploads` (
	`id` text PRIMARY KEY NOT NULL,
	`resume_id` text NOT NULL,
	`workspace_id` text NOT NULL,
	`object_key` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`resume_id`) REFERENCES `resumes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `resume_uploads_object_key_unique` ON `resume_uploads` (`object_key`);--> statement-breakpoint
CREATE INDEX `upload_workspace` ON `resume_uploads` (`workspace_id`);--> statement-breakpoint
CREATE INDEX `upload_resume` ON `resume_uploads` (`resume_id`);--> statement-breakpoint
ALTER TABLE `plans` ADD `last_approved_at` text;--> statement-breakpoint
ALTER TABLE `resumes` ADD `upload_claim` text;--> statement-breakpoint
ALTER TABLE `resumes` ADD `lease_expires_at` text;--> statement-breakpoint
CREATE INDEX `throttle_window` ON `throttles` (`window`);