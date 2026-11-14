-- M5 rooms: one active listing per member with a spare room. Message
-- bodies, chat threads and profiles are untouched; this table is pure
-- listing metadata plus a photo counter (photo bytes live in R2 under
-- rooms/<listingId>/<n>.jpg). Rows persist after withdrawal so the
-- lister's own history stays available; browse only ever selects
-- status = 'active'. Active-uniqueness (one active listing per lister)
-- is enforced at the route layer, not here — withdrawing and re-listing
-- must not collide with a SQL constraint.

CREATE TABLE `rooms` (
  `id` text NOT NULL PRIMARY KEY,
  `lister_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  `title` text NOT NULL,
  `description` text NOT NULL,
  `area_label` text NOT NULL,
  `area_lat` real,
  `area_lng` real,
  `rent_eur` integer NOT NULL,
  `bills_included` integer NOT NULL DEFAULT 0,
  `available_from` text NOT NULL,
  `photo_count` integer NOT NULL DEFAULT 0,
  `status` text NOT NULL DEFAULT 'active' CHECK (`status` IN ('active','withdrawn')),
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);

CREATE INDEX `idx_rooms_status_created` ON `rooms` (`status`, `created_at`);
CREATE INDEX `idx_rooms_lister` ON `rooms` (`lister_id`);
