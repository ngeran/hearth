# PLAN — M5: Rooms (household listings)

Spec: `docs/specs/M5.md` (canonical). Reference:
`docs/design/mockups/10-rooms-and-groups.md`. Every step ends with the gate or
its focused proof; tick the box only when green. Conventions: strict TS, Zod on
every input, unix-second timestamps, parameterized queries only, no personal
data in logs, no new dependencies/hex colors, EN/EL parity via `pnpm check:i18n`.

## Environment notes

- pnpm: `export PATH="/tmp/opencode/bin:$PATH"` (corepack shim dir).
- Gate: `pnpm typecheck && pnpm lint && pnpm build && pnpm check:i18n && pnpm test`.
- `pnpm format` before lint after ledger/table edits (Biome lints md tables;
  status lines use 4-space indents).
- e2e needs the NixOS Playwright lib wrapper (bottom of this file), one shell
  invocation.
- wrangler is project-local: `corepack pnpm exec wrangler …` from repo root.

## Steps

1. [x] **Shared room module** — `packages/shared/src/room.ts`: bounds
   (TITLE 5–80, DESCRIPTION 120–2000, RENT_EUR 50–5000, availableFrom
   YYYY-MM-DD), `roomCreateSchema`, `roomPatchSchema` (partial), `roomStatus`,
   `roomListItemSchema`/`roomDetailsSchema`/`roomsResponseSchema` (strict;
   lister summary + score/tier reuse match types), photo index `0–2` schema.
   Tests: bounds edges, date format, strictness, patch emptiness. Export from
   index. Verify: shared tests + `pnpm typecheck`.
   - Status: done — 17 new tests (105 shared total), typecheck ×3 green;
     score/tier nullable for self-facing payloads; description allows newlines
     (title stays single-line).
2. [x] **Migration + schema** — `migrations/0005_rooms.sql` per spec; drizzle
   `rooms` table; node:sqlite proof (fresh 0000→0005: FK cascade on user
   delete, CHECK status, indexes exist, second active-listing allowed at SQL
   level — uniqueness enforced in route, re-apply rejected). Verify: proof
   script ALL PASS + worker typecheck + worker tests.
   - Status: 0005_rooms.sql written (0004 comment style; route-level
     active-uniqueness documented in header); drizzle `rooms` table added
     after chatThreads (timestamp/boolean helpers, two indexes). Proof at
     /tmp/opencode/m5-migration-proof.mjs: ALL PROOFS PASSED (9 checks —
     two proof-script bugs fixed along the way: explicit bills_included=1
     vs default-0 assertion; active-count 3 not 2 after the defaults row).
     Worker typecheck clean; 13 worker tests green (vitest D1 applies
     0005).
3. [x] **Worker routes** — `apps/worker/src/routes/rooms.ts`: GET / (browse,
   score per listing), GET /mine, POST / (409 on existing active), GET /:id,
   PATCH /:id (own), DELETE /:id (+ R2 photos), POST /:id/photos (multipart ≤3,
   reuse sniff/re-encode guards), GET /:id/photos/:n (serve), DELETE
   /:id/photos/:n. Mount in index.ts. Chats exception: `POST /chats` skips
   match gates when peer has active listing (both still complete + active);
   comment points to M5.md Decision 4. Deletion: `DELETE /api/v1/me` purges
   room photos + rows. Verify: worker typecheck + tests + `pnpm build`
   (bindings dry-run).
   - Status: all routes shipped; photo keys fixed `rooms/<id>/<n>.jpg` (true
     content type rides on httpMetadata); photo slots shift down on delete to
     stay contiguous; PATCH reactivation honours the one-active rule (409);
     withdrawn listings 404 for others; sanitized-files-first upload ordering.
     Chats exception + me.ts purge landed. TS fixes: flatMap narrowing,
     ArrayBuffer R2 put, exactOptionalPropertyTypes httpMetadata spread.
     Worker typecheck + 13 tests + build dry-run green; lint clean.
4. [x] **Web data + locales** — `lib/rooms.ts` (fetchRooms, fetchRoom,
   fetchMyRoom, createRoom, updateRoom, deleteRoom, uploadRoomPhoto,
   deleteRoomPhoto), `use-rooms.ts` (["rooms"], ["rooms","mine"]; invalidation
   prefix), `rooms.*` locale blocks (~40 keys EN/EL, native Greek). Verify:
   web typecheck + `pnpm check:i18n` parity.
   - Status: lib/rooms.ts (8 fns + roomPhotoUrl helper; readError now exported
     from me.ts for the void DELETE), use-rooms.ts (generic invalidating
     mutation wrapper; keys ["rooms"], ["rooms","mine"], ["rooms", id]);
     RoomPhotoIndex type added to shared room.ts. 49 new keys (rooms.* block
     47 + nav.rooms + matches.filters.hasRoom) → parity 362. Typecheck ×3,
     check:i18n, lint green.
5. [x] **Rooms UI** — nav 4 tabs (Matches/Rooms/Messages/Profile, check e2e
   nav assertions); `routes/rooms-route.tsx` (cards grid, empty/loading/error,
   my-listing card); `components/room-card.tsx` (photo strip/placeholder,
   chips, verified badge, score chip); details sheet (bottom-sheet mobile /
   side panel lg, reuse matches overlay focus plumbing, M3 report vs lister,
   say-hi → `/messages?with=`); `routes/room-edit-route.tsx` (create/edit,
   photo picker 0–3, withdraw/reactivate, typed-DELETE confirm). Matches
   `hasRoom` filter chip (MatchItem + worker join). Verify: full gate.
   - Status: nav 4 tabs (BedDouble; mobile grid-cols-4) + /rooms + /rooms/edit
     RequireAuth routes. rooms-route (my-listing section or create prompt,
     cards grid, details overlay on all viewports with full focus-trap
     plumbing; report vs lister via client-side scoreCompatibility adapter —
     reportMatchItem). room-card (3-slot photo grid, chips, verified badge,
     score chip). room-edit-route (outer-gate/inner-form, photo editor with
     upload/delete/shift slots, withdraw/reactivate, two-step delete confirm —
     calmer than typed-DELETE for a listing). Matches hasRoom chip + none-copy
     (hasRoom added to matchItemSchema + one-query worker lookup post-step-3).
     Amendment: room coords nullable end-to-end (form collects label only —
     profiles precedent). 5 extra keys (common.edit, matches.filters.none,
     rooms.incomplete, rooms.form.photoFailed/save) → parity 367. Full gate
     green: typecheck ×3, lint, build, check:i18n, 106 shared + 13 worker.
     noArrayIndexKey satisfied via PHOTO_SLOTS literal arrays (3 files).
6. [x] **Seeds** — `scripts/seed-rooms.mjs` (4 listings on seed personas,
   validation, dry-run default, staging execute + cleanup line) +
   `pnpm seed:rooms`. Verify: dry-run output + node:sqlite insert proof.
   - Status: 4 fixed listings on 4 distinct personas (nikos-a/Zografou 340€
     bills, eleni-p/Exarcheia 380€, sofia-r/Ampelokipi 420€ bills,
     thanos-m/Koukaki 450€), ids `seed_room_*`, coords NULL, photo_count 0,
     one listing per lister (validated). Proof ALL PASS on fresh 0000→0005:
     inserts, defaults, idempotent re-run, FK cascade, cleanup line.
     Node-24 parseArgs needs `{type:"boolean"}` not `Boolean` (fixed).
     `pnpm seed:rooms` added; dry-run lint-clean (129 files). Staging
     execution happens at step 9 after deploy.
7. [x] **e2e** — wrapper below; update nav spec if it asserts tab count.
   Verify: 8/8 (or updated count) green.
   - Status: 8/8 passed (phone + desktop) with the NixOS wrapper; nav spec
     needed no changes (asserts visibility only, not tab count); api_error
     TypeError lines are the known tolerated Wrangler noise.
8. [x] **Wrap-up** — CLAUDE.md milestone paragraph, M5.md ledger/log, full
   gate, reviewer subagent on the full diff, single commit. Owner pushes;
   agent verifies CI + Deploy staging green (anonymous GitHub API) + health.
   - Status: gate green twice (367 keys, 106 shared + 13 worker, typecheck
     ×3, lint, build); e2e 8/8; reviewer blocker (overlay focus on first
     open) + nits fixed; spec wording aligned; commit `9fbca99`. Owner push
     - CI/deploy verification follow (step 9 notes them).
9. [ ] **Staging spot-check** — `pnpm seed:rooms` against staging; row-count
   check; owner browses /rooms and says hi to a seed lister. Tick M5.md.

## NixOS e2e note (Playwright browser libs)

`pnpm test:e2e` fails out of the box: the Playwright chromium in
`~/.cache/ms-playwright` can't find system libs. Wrap the run with nix-built
libs (one command, no repo changes):

```sh
LIBS=$(nix build --no-link --print-out-paths 'nixpkgs#glib^out' nixpkgs#nss nixpkgs#nspr \
  nixpkgs#atk nixpkgs#at-spi2-core nixpkgs#at-spi2-atk nixpkgs#dbus.lib nixpkgs#expat \
  nixpkgs#libgbm 'nixpkgs#systemd^*' nixpkgs#libX11 nixpkgs#libxcb nixpkgs#libXcomposite \
  nixpkgs#libXdamage nixpkgs#libXext nixpkgs#libXfixes nixpkgs#libXrandr nixpkgs#libxkbcommon \
  nixpkgs#alsa-lib 2>/dev/null)
export LD_LIBRARY_PATH=$(echo "$LIBS" | while read -r p; do printf '%s/lib:' "$p"; done)$LD_LIBRARY_PATH
pnpm test:e2e
```

Env vars do not survive between tool calls — build and run in the same shell
invocation.

## Definition of done

All 9 boxes ticked; gate green; i18n parity with the new keys; shared tests
cover room schema edges; migration proof passes; e2e green; reviewer clean;
committed on `main`; owner pushes; CI + Deploy staging green on the commit;
owner browses listings and completes one say-hi to a lister on staging.
