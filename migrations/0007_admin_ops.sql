-- M7 admin console (docs/specs/M7.md). Three additions, no backfills:
--
-- 1. users.last_seen_at -- coarse presence. 0 means "never seen". requireSession
--    touches it at most once per five minutes, so the online count is cheap and
--    the write amplification is bounded.
-- 2. error_events -- scrubbed server errors for the console. No headers, no
--    query string, no user id; message is capped and redacted by the Worker.
-- 3. match_events -- directed first-impression rows from the matches feed,
--    the clock for "shown but no thread within 7 days". Cascades with either
--    user, so account deletion needs no extra branch.

ALTER TABLE `users` ADD COLUMN `last_seen_at` integer NOT NULL DEFAULT 0;
CREATE INDEX `idx_users_last_seen` ON `users` (`last_seen_at`);

CREATE TABLE `error_events` (
  `id` text PRIMARY KEY,
  `created_at` integer NOT NULL,
  `request_id` text,
  `method` text NOT NULL,
  `route` text NOT NULL,
  `status` integer NOT NULL,
  `error_name` text NOT NULL,
  `message` text NOT NULL
);

CREATE INDEX `idx_error_events_created` ON `error_events` (`created_at`);
CREATE INDEX `idx_error_events_route_created` ON `error_events` (`route`, `created_at`);

CREATE TABLE `match_events` (
  `viewer_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  `candidate_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  `created_at` integer NOT NULL,
  PRIMARY KEY (`viewer_id`, `candidate_id`)
);

CREATE INDEX `idx_match_events_created` ON `match_events` (`created_at`);
CREATE INDEX `idx_match_events_candidate` ON `match_events` (`candidate_id`);
