-- M1: Better Auth, profiles, campuses, academic verification and audit.
-- Append-only: never edit 0000_initial.sql.

ALTER TABLE `users` ADD COLUMN `name` text NOT NULL DEFAULT '';
ALTER TABLE `users` ADD COLUMN `email_verified` integer NOT NULL DEFAULT 0;
ALTER TABLE `users` ADD COLUMN `image` text;
ALTER TABLE `users` ADD COLUMN `updated_at` integer NOT NULL DEFAULT 0;

CREATE TABLE `session` (
  `id` text PRIMARY KEY NOT NULL,
  `expires_at` integer NOT NULL,
  `token` text NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  `ip_address` text,
  `user_agent` text,
  `user_id` text NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON UPDATE no action ON DELETE cascade
);

CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);
CREATE INDEX `idx_session_user_id` ON `session` (`user_id`);

CREATE TABLE `account` (
  `id` text PRIMARY KEY NOT NULL,
  `account_id` text NOT NULL,
  `provider_id` text NOT NULL,
  `user_id` text NOT NULL,
  `access_token` text,
  `refresh_token` text,
  `id_token` text,
  `access_token_expires_at` integer,
  `refresh_token_expires_at` integer,
  `scope` text,
  `password` text,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON UPDATE no action ON DELETE cascade
);

CREATE INDEX `idx_account_user_id` ON `account` (`user_id`);
CREATE UNIQUE INDEX `unique_account_provider` ON `account` (`provider_id`, `account_id`);

CREATE TABLE `verification` (
  `id` text PRIMARY KEY NOT NULL,
  `identifier` text NOT NULL,
  `value` text NOT NULL,
  `expires_at` integer NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);

CREATE INDEX `idx_verification_identifier` ON `verification` (`identifier`);

CREATE TABLE `passkey` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text,
  `public_key` text NOT NULL,
  `user_id` text NOT NULL,
  `credential_id` text NOT NULL,
  `counter` integer NOT NULL,
  `device_type` text NOT NULL,
  `backed_up` integer NOT NULL,
  `transports` text,
  `created_at` integer,
  `aaguid` text,
  FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON UPDATE no action ON DELETE cascade
);

CREATE INDEX `idx_passkey_user_id` ON `passkey` (`user_id`);
CREATE UNIQUE INDEX `unique_passkey_credential` ON `passkey` (`credential_id`);

CREATE TABLE `rate_limit` (
  `id` text PRIMARY KEY NOT NULL,
  `key` text NOT NULL,
  `count` integer NOT NULL,
  `last_request` integer NOT NULL
);

CREATE UNIQUE INDEX `rate_limit_key_unique` ON `rate_limit` (`key`);
CREATE INDEX `idx_rate_limit_last_request` ON `rate_limit` (`last_request`);

CREATE TABLE `campuses` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `name_el` text NOT NULL,
  `city` text NOT NULL,
  `city_el` text NOT NULL,
  `country` text DEFAULT 'GR' NOT NULL,
  `created_at` integer NOT NULL
);

CREATE TABLE `profiles` (
  `user_id` text PRIMARY KEY NOT NULL,
  `display_name` text,
  `photo_key` text,
  `area_label` text,
  `area_lat` real,
  `area_lng` real,
  `move_in_from` text,
  `move_in_to` text,
  `budget_min` integer,
  `budget_max` integer,
  `seeking` text,
  `life_stage` text,
  `campus_id` text,
  `language` text DEFAULT 'en' NOT NULL,
  `bio` text,
  `age_confirmed` integer DEFAULT 0 NOT NULL,
  `academic_email` text,
  `academic_email_verified_at` integer,
  `onboarding_completed_at` integer,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`campus_id`) REFERENCES `campuses` (`id`) ON UPDATE no action ON DELETE set null
);

CREATE INDEX `idx_profiles_campus_id` ON `profiles` (`campus_id`);

CREATE TABLE `academic_verifications` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `email` text NOT NULL,
  `code_hash` text NOT NULL,
  `expires_at` integer NOT NULL,
  `attempts` integer DEFAULT 0 NOT NULL,
  `last_sent_at` integer NOT NULL,
  `consumed_at` integer,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON UPDATE no action ON DELETE cascade
);

CREATE INDEX `idx_academic_verifications_user_id` ON `academic_verifications` (`user_id`);
CREATE INDEX `idx_academic_verifications_user_consumed` ON `academic_verifications` (`user_id`, `consumed_at`);

CREATE TABLE `audit_log` (
  `id` text PRIMARY KEY NOT NULL,
  `actor_user_id` text,
  `event` text NOT NULL,
  `metadata` text DEFAULT '{}' NOT NULL,
  `created_at` integer NOT NULL
);

CREATE INDEX `idx_audit_log_event_created` ON `audit_log` (`event`, `created_at`);

INSERT INTO `campuses` (`id`, `name`, `name_el`, `city`, `city_el`, `country`, `created_at`) VALUES
  ('campus-nkua', 'National and Kapodistrian University of Athens', 'Εθνικό και Καποδιστριακό Πανεπιστήμιο Αθηνών', 'Athens', 'Αθήνα', 'GR', CAST(strftime('%s', 'now') AS INTEGER)),
  ('campus-ntua', 'National Technical University of Athens', 'Εθνικό Μετσόβιο Πολυτεχνείο', 'Athens', 'Αθήνα', 'GR', CAST(strftime('%s', 'now') AS INTEGER)),
  ('campus-aueb', 'Athens University of Economics and Business', 'Οικονομικό Πανεπιστήμιο Αθηνών', 'Athens', 'Αθήνα', 'GR', CAST(strftime('%s', 'now') AS INTEGER)),
  ('campus-panteion', 'Panteion University', 'Πάντειο Πανεπιστήμιο', 'Athens', 'Αθήνα', 'GR', CAST(strftime('%s', 'now') AS INTEGER)),
  ('campus-harokopio', 'Harokopio University', 'Χαροκόπειο Πανεπιστήμιο', 'Athens', 'Αθήνα', 'GR', CAST(strftime('%s', 'now') AS INTEGER)),
  ('campus-unipi', 'University of Piraeus', 'Πανεπιστήμιο Πειραιώς', 'Piraeus', 'Πειραιάς', 'GR', CAST(strftime('%s', 'now') AS INTEGER)),
  ('campus-auth', 'Aristotle University of Thessaloniki', 'Αριστοτέλειο Πανεπιστήμιο Θεσσαλονίκης', 'Thessaloniki', 'Θεσσαλονίκη', 'GR', CAST(strftime('%s', 'now') AS INTEGER)),
  ('campus-uom', 'University of Macedonia', 'Πανεπιστήμιο Μακεδονίας', 'Thessaloniki', 'Θεσσαλονίκη', 'GR', CAST(strftime('%s', 'now') AS INTEGER)),
  ('campus-uop', 'University of Patras', 'Πανεπιστήμιο Πατρών', 'Patras', 'Πάτρα', 'GR', CAST(strftime('%s', 'now') AS INTEGER)),
  ('campus-uoc', 'University of Crete', 'Πανεπιστήμιο Κρήτης', 'Heraklion', 'Ηράκλειο', 'GR', CAST(strftime('%s', 'now') AS INTEGER)),
  ('campus-uoi', 'University of Ioannina', 'Πανεπιστήμιο Ιωαννίνων', 'Ioannina', 'Ιωάννινα', 'GR', CAST(strftime('%s', 'now') AS INTEGER)),
  ('campus-uth', 'University of Thessaly', 'Πανεπιστήμιο Θεσσαλίας', 'Volos', 'Βόλος', 'GR', CAST(strftime('%s', 'now') AS INTEGER)),
  ('campus-aegean', 'University of the Aegean', 'Πανεπιστήμιο Αιγαίου', 'Mytilene', 'Μυτιλήνη', 'GR', CAST(strftime('%s', 'now') AS INTEGER)),
  ('campus-duth', 'Democritus University of Thrace', 'Δημοκρίτειο Πανεπιστήμιο Θράκης', 'Komotini', 'Κομοτηνή', 'GR', CAST(strftime('%s', 'now') AS INTEGER)),
  ('campus-uowm', 'University of Western Macedonia', 'Πανεπιστήμιο Δυτικής Μακεδονίας', 'Kozani', 'Κοζάνη', 'GR', CAST(strftime('%s', 'now') AS INTEGER)),
  ('campus-ionio', 'Ionian University', 'Ιόνιο Πανεπιστήμιο', 'Corfu', 'Κέρκυρα', 'GR', CAST(strftime('%s', 'now') AS INTEGER));
