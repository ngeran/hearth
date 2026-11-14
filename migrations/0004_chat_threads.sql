-- M4 1:1 chat: thread metadata only. Message bodies live inside the
-- ChatRoom Durable Object; this table exists so the thread list can be
-- ordered and joined without waking the DO for discovery. The composite
-- primary key (low, high ids) mirrors the deterministic `chatThreadId`
-- used for idFromName, and both FKs cascade so deleting an account drops
-- its half of every thread after the DO purge.

CREATE TABLE `chat_threads` (
  `user_low` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  `user_high` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  PRIMARY KEY (`user_low`, `user_high`),
  CHECK (`user_low` < `user_high`)
);

CREATE INDEX `idx_chat_threads_high_updated` ON `chat_threads` (`user_high`, `updated_at`);
