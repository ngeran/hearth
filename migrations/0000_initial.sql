CREATE TABLE `users` (
  `id` text PRIMARY KEY NOT NULL,
  `email` text NOT NULL,
  `role` text DEFAULT 'user' NOT NULL,
  `status` text DEFAULT 'active' NOT NULL,
  `created_at` integer NOT NULL,
  `deleted_at` integer
);

CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);
CREATE INDEX `idx_users_status` ON `users` (`status`);
