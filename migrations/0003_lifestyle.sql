-- M2 lifestyle questionnaire: one versioned JSON envelope per profile
-- ({ "version": 1, "answers": { ... } }). A single column keeps scoring data
-- together for the M3 engine; the json_valid CHECK makes damaged rows
-- impossible to store, and reads still parse defensively.

ALTER TABLE `profiles`
  ADD COLUMN `lifestyle_json` TEXT NULL
  CHECK (`lifestyle_json` IS NULL OR json_valid(`lifestyle_json`));
