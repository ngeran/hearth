-- M6 web push: one row per subscribed device/browser. The push-service
-- endpoint URL is a natural primary key, so re-subscribing from the same
-- browser upserts on the PK and refreshes its keys instead of piling up
-- rows. No per-user device cap at the SQL level (calm defaults; browsers
-- churn subscriptions often enough that caps cause silent dropouts).

CREATE TABLE `push_subscriptions` (
  `endpoint` text PRIMARY KEY,
  `user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  `p256dh` text NOT NULL,
  `auth` text NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);

CREATE INDEX `idx_push_subscriptions_user` ON `push_subscriptions` (`user_id`);
