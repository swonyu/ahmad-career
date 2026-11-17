CREATE TABLE `auth_accounts` (
	`owner_id` text PRIMARY KEY NOT NULL,
	`origin_method` text NOT NULL,
	`generation` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `auth_deletion_fences` (
	`subject_hash` text PRIMARY KEY NOT NULL,
	`deleted_at` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `auth_deletion_expiry` ON `auth_deletion_fences` (`expires_at`);--> statement-breakpoint
CREATE TABLE `auth_identities` (
	`provider` text NOT NULL,
	`subject` text NOT NULL,
	`subject_hash` text NOT NULL,
	`owner_id` text NOT NULL,
	`email` text,
	`display_name` text NOT NULL,
	`connected_at` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`provider`, `subject`),
	FOREIGN KEY (`owner_id`) REFERENCES `auth_accounts`(`owner_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `auth_owner_provider` ON `auth_identities` (`owner_id`,`provider`);--> statement-breakpoint
CREATE UNIQUE INDEX `auth_subject_hash` ON `auth_identities` (`subject_hash`);--> statement-breakpoint
CREATE TABLE `auth_rates` (
	`key` text PRIMARY KEY NOT NULL,
	`window` integer NOT NULL,
	`count` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `auth_rate_window` ON `auth_rates` (`window`);--> statement-breakpoint
CREATE TABLE `browser_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`id` text NOT NULL,
	`owner_id` text NOT NULL,
	`account_generation` text NOT NULL,
	`provider` text NOT NULL,
	`subject` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `auth_accounts`(`owner_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `browser_sessions_id_unique` ON `browser_sessions` (`id`);--> statement-breakpoint
CREATE INDEX `browser_session_owner` ON `browser_sessions` (`owner_id`);--> statement-breakpoint
CREATE INDEX `browser_session_expiry` ON `browser_sessions` (`expires_at`);--> statement-breakpoint
CREATE TABLE `oauth_transactions` (
	`state_hash` text PRIMARY KEY NOT NULL,
	`browser_hash` text NOT NULL,
	`provider` text NOT NULL,
	`intent` text NOT NULL,
	`owner_id` text,
	`account_generation` text,
	`nonce_hash` text NOT NULL,
	`verifier` text,
	`return_to` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`claim` text
);
--> statement-breakpoint
CREATE INDEX `oauth_owner` ON `oauth_transactions` (`owner_id`);--> statement-breakpoint
CREATE INDEX `oauth_expiry` ON `oauth_transactions` (`expires_at`);
--> statement-breakpoint
CREATE TABLE `account_lifecycles` (
	`owner_hash` text PRIMARY KEY NOT NULL,
	`generation` text NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
ALTER TABLE `oauth_transactions` ADD `lifecycle_key` text;--> statement-breakpoint
ALTER TABLE `oauth_transactions` ADD `lifecycle_generation` text;