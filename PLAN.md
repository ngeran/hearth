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

<<<<<<< HEAD
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

6. [ ] **Match impressions** — `routes/matches.ts` inserts `INSERT OR IGNORE` rows for the
   visible matches inside `waitUntil` after the response is formed; no extra reads.
   - Verify: typecheck + worker tests; manual SQL check on a seeded local DB after one
     matches request (row per visible pair, no duplicates on a second request).

7. [x] **Web console** — `lib/admin.ts` fetchers (reuse `requestJson`), `components/
   admin-shell.tsx`, routes `admin-overview-route`, `admin-users-route`,
   `admin-user-detail-route`, `admin-errors-route`, `admin-rooms-route`; router entries;
   sidebar link when `me.isAdmin`; `admin.*` keys in both locales (native Greek). Every
   page has loading, empty and error states; destructive actions confirm.
   - Verify: `pnpm check:i18n` (equal key sets), `pnpm typecheck`, `pnpm build`.

8. [x] **Verification + wrap-up** — new shared tests counted; worker tests for
   `scrubErrorMessage`/`parseAdminEmails` and the unauthenticated 404; full gate;
   Playwright 8/8 unchanged; reviewer subagent on the diff; M7.md ledger + log; CLAUDE.md
   milestone paragraph + decisions row (`ADMIN_EMAILS` secret, 30-day error retention);
   single commit; owner pushes; CI + Deploy staging green (console 404s until the
   `ADMIN_EMAILS` secret is set).
   - Verify: full gate; `pnpm test:e2e` with the NixOS wrapper; reviewer verdict.
||||||| parent of 855dcf3 (Add the M7 admin operations console)
1. [x] **Shared push module** — `packages/shared/src/push.ts`: VAPID key response
   schema, pushSubscriptionSchema (endpoint z.url or https string max 2048, keys
   strict {p256dh, auth} base64url-ish strings), pushDeleteSchema; tests (URL shape,
   missing keys, strictness, length caps). Export from index.ts (alphabetical).
   Verify: `pnpm --filter @hearth/shared test && pnpm typecheck`.
   - Status: done. Local pushEndpointSchema = https-prefix refine + max 2048 (no
     z.url — keeps codebase off unverified Zod 4 format APIs); client keys
     base64url regex `/^[A-Za-z0-9_-]+={0,2}$/` (RFC 8291, padding tolerated);
     all three schemas .strict(). 9 new tests → 115 shared green; typecheck ×3
     clean; index export between profile and room.
2. [x] **Migration 0006 + drizzle** — `migrations/0006_push_subscriptions.sql` per
   spec DDL (endpoint PK, FK cascade, idx_push_subscriptions_user); drizzle
   `pushSubscriptions` table in schema.ts after rooms; node:sqlite proof
   (/tmp/opencode/m6-migration-proof.mjs, fresh 0000→0006): insert, upsert on endpoint
   PK, FK cascade, index exists, re-apply rejected. Verify: proof ALL PASS + `pnpm
    --filter @hearth/worker typecheck && pnpm --filter @hearth/worker test`.
   - Status: proof ALL PASS (8 checks: natural-PK duplicate reject, second device
     allowed, cross-user endpoint claim reject, ghost-user FK reject, cascade drops
     rows, index present, re-apply rejected); drizzle table after rooms/before
     auditLog; worker typecheck clean, 13 worker tests green (vitest applied 0006);
     format no fixes, lint 1 pre-existing info.
3. [x] **Worker push lib + routes** — add `webpush-webcrypto` to apps/worker deps;
   `declare module` shim; `lib/web-push.ts` (load keys from env via fromJSON — verify
   toJSON field names first; buildPushPayload(senderName, language) with EN/EL copy;
   sendPushToSubscription with 404/410 → prune signal; 503 when VAPID unset);
   `routes/push.ts` mounted at `/api/v1/me/push` (GET /key, POST /, DELETE /) with
   shared schemas; env.ts + wrangler.jsonc vars `VAPID_PUBLIC_KEY`/`VAPID_SUBJECT`
   (top-level empty-string placeholders + staging real values land with owner keys),
   `VAPID_PRIVATE_KEY` optional secret; `.dev.vars.example` entries;
   `scripts/generate-vapid-keys.mjs` (prints toJSON pair + export commands);
   package.json script `vapid:generate`. Verify: typecheck + tests + `pnpm build`.
   - Status: API verified against installed dist (b33) — shim at
     `src/webpush-webcrypto.d.ts` (flat, tsconfig includes src). lib/web-push.ts:
     PUSH_TTL_SECONDS=3600, urgency normal, buildChatPushPayload(senderName,
     senderId, language) — url carries encodeURIComponent(senderId); loadVapidKeys
     is async (fromJSON imports keys), malformed keys → null (unconfigured).
     Outcome union: sent|prune|unconfigured|failed(status). routes/push.ts: POST
     upserts on endpoint PK (row follows latest owner), DELETE matching
     endpoint+owner via returning() → 404 when 0 rows. index.ts mounts
     `/api/v1/me/push` after rooms (no pattern overlap with meRoutes).
     Key script reimplements generate+toJSON with Node WebCrypto (base64url
     raw/pkcs8) — no cross-package import needed. Verified: script emits valid
     pair; worker typecheck clean; 13 worker tests; pnpm build dry-run shows
     VAPID_PUBLIC_KEY/VAPID_SUBJECT vars bound.
4. [x] **Chats enqueue + queue consumer** — chats.ts POST /:peerId/messages:
   `c.executionCtx.waitUntil(c.env.JOBS.send({ recipientId: peerId, senderId: id,
    senderName: meSnapshot displayName… }))` — senderName resolved without new queries
   if available, else job carries ids only and consumer loads names from D1;
   index.ts `queue(batch)`: per message validate job (Zod), ChatRoom /state as
   recipient → skip when last.seq <= myRead or last.author === recipientId, load
   recipient subscriptions + language, send per subscription, prune on 404/410,
   aggregate failures without PII logs; wrangler.jsonc both consumers `max_retries:
    3`; me.ts purge explicit pushSubscriptions delete. Verify: typecheck + tests +
   build.
   - Status: enqueue after D1 bump via waitUntil; senderName lookup best-effort
     try/catch → "" (reviewer fix: a D1 hiccup can never fail the 201 after delivery;
     consumer has the no-name payload fallback). handlePushBatch: keys loaded once
     per batch, malformed jobs ack'd, transient/failed → message.retry() (max_retries
     3 both envs), counts-only log. Unread-gated at consume via DO /state as
     recipient; 404/410 prunes rows; failed returns early so retries don't
     double-fire already-sent pushes (reviewer fix). apps/web tsconfig includes the
     worker shim (web compiles worker sources via AppType). Verified: full gate
     green — typecheck ×3, tests 115 shared + 13 worker, build dry-run, i18n 367
     (locales are step 5).
5. [x] **Web SW + NotificationsCard + locales** — vite.config.ts →
   `strategies: "injectManifest"`, `srcDir: "src"`, `filename: "sw.ts"`; add
   `workbox-precaching` to apps/web deps; `src/sw.ts` (precacheAndRoute
   `self.__WB_MANIFEST`, cleanupOutdatedCaches, clientsClaim, SKIP_WAITING message
   handler, push → showNotification(payload.title/body/data.url), notificationclick →
   focus-or-open `/messages?with=`); `lib/push.ts` (fetch key, subscribe, unsubscribe
   helpers reusing requestJson/readError); `NotificationsCard` in profile-route
   between PasskeysCard and data section (states: unsupported / off / denied /
   enabled; gesture-gated requestPermission; never auto-prompt); locales
   `notifications.*` EN/EL (~14 keys) + parity. Verify: full gate (build proves the
   SW bundles; check:i18n parity).
   - Status: done. workbox-precaching@7.4.1 pinned (already in lockfile transitively);
     clientsClaim inlined as `activate → clients.claim()` (workbox-core not pulled in);
     navigate fallback rewritten network-first (fetch, catch → precached shell) — a
     deliberate deviation from generateSW's precache-first navigateFallback so deploys
     are picked up promptly; noted for the ledger. Push tag `hearth-chat` collapses
     bursts; notificationclick focuses an existing /messages window or opens it.
     Card states incl. 503 → "unavailable"; 8 notification keys → 375 parity; full
     gate green (typecheck ×3, build — dist/sw.js 17.6 KB with handlers, lint 1
     pre-existing info, tests 115 shared + 13 worker).
6. [x] **e2e** — single shell invocation with the NixOS LD_LIBRARY_PATH wrapper (see
   note below); 8/8 must pass with the injectManifest SW (update-prompt + offline
   flows unaffected). Verify: `pnpm test:e2e` 8/8.
   - Status: 8/8 passed (phone + desktop); update-prompt/offline flows unaffected;
     api_error TypeError lines = known tolerated Wrangler noise.
7. [x] **Wrap-up** — CLAUDE.md current-milestone + dependency-justification decision
   rows; M6.md ledger ticks + verification log rows; full gate; reviewer subagent on
   the full M6 diff; single commit; owner pushes; verify CI + Deploy staging green
   (anonymous GitHub API, head_sha query) + staging health.
   - Status: CLAUDE.md milestone + 2 dependency rows written; reviewer found 1
     blocker (chats 201-failure after delivery) + 3 nits — all fixed; gate re-green
     (375 keys, 115 shared + 13 worker, 1 pre-existing lint info); committed below;
     CI/deploy verification pending owner push.
8. [ ] **Staging live test** — owner generates VAPID keys (`pnpm vapid:generate`),
   sets `VAPID_PUBLIC_KEY`/`VAPID_SUBJECT` vars in wrangler.jsonc staging env +
   `VAPID_PRIVATE_KEY` secret (`wrangler secret put --env staging`), agent redeploys,
   then owner: enable notifications on two real accounts, send messages with tabs
   closed, confirm one quiet localized push each way + tap-through to the
   conversation. Tick the final M6.md ledger boxes.
=======
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
>>>>>>> 855dcf3 (Add the M7 admin operations console)

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
