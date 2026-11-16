CREATE TABLE `discovery_cache` (
	`id` text PRIMARY KEY NOT NULL,
	`jobs_json` text DEFAULT '[]' NOT NULL,
	`checked_at` text,
	`expires_at` integer DEFAULT 0 NOT NULL,
	`stale_until` integer DEFAULT 0 NOT NULL,
	`retry_at` integer DEFAULT 0 NOT NULL,
	`claim` text,
	`lease_until` integer DEFAULT 0 NOT NULL,
	`limited` integer DEFAULT 0 NOT NULL,
	`error_code` text,
	`error_message` text
);
--> statement-breakpoint
CREATE INDEX `discovery_cache_expiry` ON `discovery_cache` (`stale_until`,`lease_until`,`retry_at`);--> statement-breakpoint
CREATE TABLE `discovery_rates` (
	`key` text PRIMARY KEY NOT NULL,
	`window` integer NOT NULL,
	`count` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `discovery_rate_window` ON `discovery_rates` (`window`);