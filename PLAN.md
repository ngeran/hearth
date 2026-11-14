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

1. [ ] **Shared room module** — `packages/shared/src/room.ts`: bounds
   (TITLE 5–80, DESCRIPTION 120–2000, RENT_EUR 50–5000, availableFrom
   YYYY-MM-DD), `roomCreateSchema`, `roomPatchSchema` (partial), `roomStatus`,
   `roomListItemSchema`/`roomDetailsSchema`/`roomsResponseSchema` (strict;
   lister summary + score/tier reuse match types), photo index `0–2` schema.
   Tests: bounds edges, date format, strictness, patch emptiness. Export from
   index. Verify: shared tests + `pnpm typecheck`.
2. [ ] **Migration + schema** — `migrations/0005_rooms.sql` per spec; drizzle
   `rooms` table; node:sqlite proof (fresh 0000→0005: FK cascade on user
   delete, CHECK status, indexes exist, second active-listing allowed at SQL
   level — uniqueness enforced in route, re-apply rejected). Verify: proof
   script ALL PASS + worker typecheck + worker tests.
3. [ ] **Worker routes** — `apps/worker/src/routes/rooms.ts`: GET / (browse,
   score per listing), GET /mine, POST / (409 on existing active), GET /:id,
   PATCH /:id (own), DELETE /:id (+ R2 photos), POST /:id/photos (multipart ≤3,
   reuse sniff/re-encode guards), GET /:id/photos/:n (serve), DELETE
   /:id/photos/:n. Mount in index.ts. Chats exception: `POST /chats` skips
   match gates when peer has active listing (both still complete + active);
   comment points to M5.md Decision 4. Deletion: `DELETE /api/v1/me` purges
   room photos + rows. Verify: worker typecheck + tests + `pnpm build`
   (bindings dry-run).
4. [ ] **Web data + locales** — `lib/rooms.ts` (fetchRooms, fetchRoom,
   fetchMyRoom, createRoom, updateRoom, deleteRoom, uploadRoomPhoto,
   deleteRoomPhoto), `use-rooms.ts` (["rooms"], ["rooms","mine"]; invalidation
   prefix), `rooms.*` locale blocks (~40 keys EN/EL, native Greek). Verify:
   web typecheck + `pnpm check:i18n` parity.
5. [ ] **Rooms UI** — nav 4 tabs (Matches/Rooms/Messages/Profile, check e2e
   nav assertions); `routes/rooms-route.tsx` (cards grid, empty/loading/error,
   my-listing card); `components/room-card.tsx` (photo strip/placeholder,
   chips, verified badge, score chip); details sheet (bottom-sheet mobile /
   side panel lg, reuse matches overlay focus plumbing, M3 report vs lister,
   say-hi → `/messages?with=`); `routes/room-edit-route.tsx` (create/edit,
   photo picker 0–3, withdraw/reactivate, typed-DELETE confirm). Matches
   `hasRoom` filter chip (MatchItem + worker join). Verify: full gate.
6. [ ] **Seeds** — `scripts/seed-rooms.mjs` (4 listings on seed personas,
   validation, dry-run default, staging execute + cleanup line) +
   `pnpm seed:rooms`. Verify: dry-run output + node:sqlite insert proof.
7. [ ] **e2e** — wrapper below; update nav spec if it asserts tab count.
   Verify: 8/8 (or updated count) green.
8. [ ] **Wrap-up** — CLAUDE.md milestone paragraph, M5.md ledger/log, full
   gate, reviewer subagent on the full diff, single commit. Owner pushes;
   agent verifies CI + Deploy staging green (anonymous GitHub API) + health.
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
