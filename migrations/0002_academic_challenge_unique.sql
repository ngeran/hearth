-- Post-M1 hardening: enforce one active (unconsumed) academic verification
-- challenge per user at the database level, closing the consume/insert race.

CREATE UNIQUE INDEX `idx_academic_verifications_active`
  ON `academic_verifications` (`user_id`)
  WHERE `consumed_at` IS NULL;
