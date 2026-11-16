CREATE TABLE `attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`plan_id` text NOT NULL,
	`workspace_id` text NOT NULL,
	`applicant_hash` text NOT NULL,
	`job_key` text NOT NULL,
	`job_id` text NOT NULL,
	`state` text NOT NULL,
	`snapshot_json` text NOT NULL,
	`created_at` text NOT NULL,
	`dispatched_at` text,
	`confirmed_at` text,
	`application_id` text,
	`response_hash` text,
	`error_code` text,
	`error_message` text,
	`retry_at` text,
	`dispatch_count` integer DEFAULT 0 NOT NULL,
	`approval_generation` integer DEFAULT 0 NOT NULL,
	`claim_token` text,
	`lease_expires_at` text,
	`mode` text DEFAULT 'local' NOT NULL,
	FOREIGN KEY (`plan_id`) REFERENCES `plans`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `attempt_plan` ON `attempts` (`plan_id`);--> statement-breakpoint
CREATE INDEX `attempt_workspace` ON `attempts` (`workspace_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `active_applicant_job` ON `attempts` (`applicant_hash`,`job_key`) WHERE state IN ('dispatching','confirmed','uncertain');--> statement-breakpoint
CREATE UNIQUE INDEX `active_workspace_job` ON `attempts` (`workspace_id`,`job_key`) WHERE state IN ('dispatching','confirmed','uncertain');--> statement-breakpoint
CREATE TABLE `dispatch_gates` (
	`key` text PRIMARY KEY NOT NULL,
	`next_at` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`job_key` text NOT NULL,
	`data_json` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `job_workspace_key` ON `jobs` (`workspace_id`,`job_key`);--> statement-breakpoint
CREATE TABLE `meta` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `pairing_codes` (
	`code_hash` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`claimed_by` text,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `pairing_workspace` ON `pairing_codes` (`workspace_id`);--> statement-breakpoint
CREATE TABLE `plans` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`digest` text NOT NULL,
	`profile_revision` integer NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`stopped` integer DEFAULT 0 NOT NULL,
	`approved_at` text,
	`approval_generation` integer DEFAULT 0 NOT NULL,
	`items_json` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `plan_workspace` ON `plans` (`workspace_id`);--> statement-breakpoint
CREATE TABLE `resumes` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`hash` text NOT NULL,
	`object_key` text NOT NULL,
	`name` text NOT NULL,
	`bytes` integer NOT NULL,
	`state` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `resumes_object_key_unique` ON `resumes` (`object_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `resume_workspace_hash` ON `resumes` (`workspace_id`,`hash`);--> statement-breakpoint
CREATE TABLE `native_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`id` text NOT NULL,
	`workspace_id` text NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `native_sessions_id_unique` ON `native_sessions` (`id`);--> statement-breakpoint
CREATE INDEX `session_workspace` ON `native_sessions` (`workspace_id`);--> statement-breakpoint
CREATE TABLE `throttles` (
	`key` text PRIMARY KEY NOT NULL,
	`window` integer NOT NULL,
	`count` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `workspaces` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`owner_email` text NOT NULL,
	`created_at` text NOT NULL,
	`profile_json` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`deleting_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workspaces_owner_id_unique` ON `workspaces` (`owner_id`);