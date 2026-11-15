# PLAN — M7 Admin Operations Console

Executes `docs/specs/M7.md` (read it first; six decisions approved 2026-11-15). One step
per session chunk; tick the box only after its verify command passes. Keep the gate green
between steps.

## Conventions and constraints

- pnpm is not on PATH in the agent shell. Every command runs as:
  `export PATH="/tmp/opencode/bin:$PATH" && <cmd>`.
- Gate: `pnpm typecheck && pnpm lint && pnpm build && pnpm check:i18n && pnpm test`.
- `pnpm format` before `lint` after any ledger/markdown edit.
- No new dependencies. No `any`, no non-null assertions, Zod on every input, no PII in
  logs or audit metadata (emails are displayed in the console, never written to logs).
- Every admin endpoint parses its response with a shared schema; query parameters go
  through Zod with bounds (limit ≤ 50, offset ≥ 0).
- Grounding facts (verified 2026-11-15): worker routes mount in `index.ts:72-78`, notFound
  body at `:79-89`, `onError` at `:90-108`; `requireSession` in
  `middleware/session.ts:7-19`; `AppEnv` variables in `types.ts`; account deletion block
  `routes/me.ts:490-572` (extract to `lib/account-deletion.ts`); `getMeResponse` in
  `lib/profiles.ts:112-116` with call sites at `routes/me.ts:93` and `:257`;
  `meResponseSchema` at `packages/shared/src/profile.ts:387-394`; matches feed returns at
  `routes/matches.ts:124-131`; `users.role` already exists (default `"user"`) but is not
  the gate; rooms statuses live in `db/schema.ts:238`; next migration is 0007; node 24
  provides `node:sqlite` for migration proofs; worker tests use `SELF` + `env` from
  `cloudflare:test` with `test/**/*.test.ts`; web tests do not exist (Vitest is worker +
  shared only).
- Discoverability: `isAdmin` is added to the `/me` payload; the shell nav link renders
  from it. Non-admins never see the admin endpoints (404), so no probe request is added.

## Steps

1. [x] **Spec + plan** — `docs/specs/M7.md` with the six approved decisions, ledger and
   verification log; this plan. Commit both together before code.
   - Status: written 2026-11-15; awaiting the first code step.

2. [x] **Shared admin schemas + tests** — new `packages/shared/src/admin.ts`:
   `adminOverviewSchema`, `adminUserListItemSchema` + `adminUsersResponseSchema`,
   `adminUserDetailSchema`, `adminDeleteUserSchema` (`confirmEmail` 3–320),
   `adminErrorEventSchema` + `adminErrorsResponseSchema`, `adminRoomListItemSchema` +
   `adminRoomsResponseSchema`, action response schemas, and the constants
   `ADMIN_LIST_DEFAULT_LIMIT=25`, `ADMIN_LIST_MAX_LIMIT=50`,
   `ADMIN_ERROR_RETENTION_DAYS=30`, `ADMIN_ONLINE_WINDOW_SECONDS=900`,
   `ADMIN_PRESENCE_TOUCH_SECONDS=300`, `ADMIN_MATCH_WINDOW_DAYS=7`. Re-export from
   `index.ts` alphabetically. Tests: strictness, integer/nonnegative bounds, nullables,
   confirmEmail limits, list caps.
   - Verify: `pnpm --filter @hearth/shared test` + `pnpm typecheck`.
   - Status: `admin.ts` + `admin.test.ts` (16 tests) exported from index; 131 shared
     tests pass, typecheck clean.

3. [x] **Migration 0007 + drizzle tables** — `migrations/0007_admin_ops.sql` exactly as
   the spec's data model; `schema.ts` adds `users.lastSeenAt` (plain integer, default 0),
   `errorEvents`, `matchEvents` after `pushSubscriptions`; `me.ts` purge needs no new
   branch (cascades). Proof: apply all migrations to a throwaway `node:sqlite` database,
   insert a user + error + impression, assert defaults, cascade and the pair PK.
   - Verify: proof script exits 0; `pnpm db:generate` reports no schema drift
     (or an empty diff); `pnpm typecheck`.
   - Status: `0007_admin_ops.sql` + `users.lastSeenAt`/`errorEvents`/`matchEvents`
     written. node:sqlite proof passed (default 0, first impression wins, pair PK,
     cascade keeps the other user). Note: `db:generate` is NOT usable in this repo
     (no Drizzle journal — it emits a bogus fresh 0000 baseline); proof is the
     node:sqlite run only.

4. [x] **Worker core** — `env.ts` adds `ADMIN_EMAILS?: string`; new `lib/admin.ts`
   (`parseAdminEmails`, `isAdminEmail`, `scrubErrorMessage`, `recordErrorEvent`,
   `requireAdmin` returning the standard 404 body); `requireSession` gains the throttled
   conditional presence `UPDATE ... WHERE last_seen_at < now - 300` in `waitUntil`;
   `onError` also records one scrubbed error row via `waitUntil`; `lib/account-deletion.ts`
   extracts the M1 deletion sequence unchanged and `routes/me.ts` calls it; `getMeResponse`
   takes an `isAdmin` flag and `meResponseSchema` gains `isAdmin: boolean`.
   - Verify: `pnpm typecheck && pnpm test` (worker suite still green), then
     `pnpm build` (Workers bundle).

5. [x] **Worker admin routes** — `routes/admin.ts` mounted at `/api/v1/admin`:
   overview aggregates (spec Metrics section), users list/detail, revoke sessions, delete
   with `confirmEmail`, errors list (30-day prune in `waitUntil`), rooms list/delete (rows + R2 photos).
   Every mutation writes `audit_log`; self-delete is rejected. Wire the mount in
   `index.ts` before `notFound`.
   - Verify: typecheck + worker tests; `pnpm build` dry-run lists the routes.

6. [x] **Match impressions** — `routes/matches.ts` inserts `INSERT OR IGNORE` rows for the
   visible matches inside `waitUntil` after the response is formed; no extra reads.
   - Verify: typecheck + worker tests; manual SQL check on a seeded local DB after one
     matches request (row per visible pair, no duplicates on a second request).

7. [x] **Web console** — `lib/admin.ts` fetchers (reuse `requestJson`), `components/
   admin-shell.tsx`, routes `admin-overview-route`, `admin-users-route`,
   `admin-user-detail-route`, `admin-errors-route`, `admin-rooms-route`; router entries;
   sidebar link when `me.isAdmin`; `admin.*` keys in both locales (native Greek). Every
   page has loading, empty and error states; destructive actions confirm.
   - Verify: `pnpm check:i18n` (equal key sets), `pnpm typecheck`, `pnpm build`.
   - Status: 466-key parity; typed keys validated; admin nav appears only for admins
     (5-column mobile grid); build green.

8. [x] **Verification + wrap-up** — new shared tests counted; worker tests for
   `scrubErrorMessage`/`parseAdminEmails` and the unauthenticated 404; full gate;
   Playwright 8/8 unchanged; reviewer subagent on the diff; M7.md ledger + log; CLAUDE.md
   milestone paragraph + decisions row (`ADMIN_EMAILS` secret, 30-day error retention);
   single commit; owner pushes; CI + Deploy staging green (console 404s until the
   `ADMIN_EMAILS` secret is set).
   - Verify: full gate; `pnpm test:e2e` with the NixOS wrapper; reviewer verdict.
   - Status: 131 shared + 22 worker tests; e2e 8/8; reviewer pass after the room-list
     `leftJoin` fix; committed as `Add the M7 admin operations console`.

### NixOS e2e note (Playwright browser libs)

`pnpm test:e2e` fails out of the box: the Playwright chromium in `~/.cache/ms-playwright`
can't find system libs. Wrap the run with nix-built libs (one command, no repo changes):

```sh
LIBS=$(nix build --no-link --print-out-paths 'nixpkgs#glib^out' nixpkgs#nss nixpkgs#nspr \
  nixpkgs#atk nixpkgs#at-spi2-core nixpkgs#at-spi2-atk nixpkgs#dbus.lib nixpkgs#expat \
  nixpkgs#libgbm 'nixpkgs#systemd^*' nixpkgs#libX11 nixpkgs#libxcb nixpkgs#libXcomposite \
  nixpkgs#libXdamage nixpkgs#libXext nixpkgs#libXfixes nixpkgs#libXrandr nixpkgs#libxkbcommon \
  nixpkgs#alsa-lib 2>/dev/null)
export LD_LIBRARY_PATH=$(echo "$LIBS" | while read -r p; do printf '%s/lib:' "$p"; done)$LD_LIBRARY_PATH
pnpm test:e2e
```

Env vars do not survive between tool calls — build and run in the same shell invocation.

## Definition of done

- Admin console usable on staging after the owner sets the `ADMIN_EMAILS` secret.
- A non-admin cannot discover admin routes; every admin mutation is audited.
- Error rows are scrubbed, bounded and 30-day retained; no message bodies, photos or
  emails in logs.
- Full gate green, e2e 8/8, reviewer clean.

## Follow-up: incomplete-profile reasons (2026-11-15)

Owner request: show admins _why_ a member's profile is incomplete so support can help
them finish it. The reason list must come from the same shared rule the member's own
`/me` response uses, so the console never disagrees with the app.

1. [x] **Shared contract** — add `missingProfileFields: OnboardingField[]` to
   `adminUserDetailSchema`; extend the detail test with a valid list and reject an
   unknown field name.
   - Verify: `pnpm --filter @hearth/shared test`; typecheck.
2. [x] **Worker** — in `GET /api/v1/admin/users/:id`, compute the list with
   `getMissingOnboardingFields(toProfileSnapshot(profile))`; with no profile row,
   return every `ONBOARDING_FIELDS` value.
   - Verify: typecheck; worker tests stay green (23, incl. a detail-route integration test
     with a real signed session and the real migrations).
3. [x] **Console** — user detail shows a "Still missing" block with one chip per
   reason, only when non-empty; labels are typed keys (`admin.user.missing.*`, native
   Greek), no API-provided copy rendered.
   - Verify: `pnpm check:i18n`, `pnpm typecheck`, `pnpm build`.
4. [x] **Docs + gate** — M7.md UI/acceptance/ledger/log updated; full gate green.
   - Verify: `pnpm typecheck && pnpm lint && pnpm check:i18n && pnpm test && pnpm build`.
