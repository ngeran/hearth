# PLAN — M6 Web Push Notifications

Executes `docs/specs/M6.md` (read it first; decisions table approved 2026-11-15 by the
owner unless noted). One step per session chunk; tick the box only after its verify
command passes. Keep the gate green between steps.

## Conventions and constraints

- pnpm is not on PATH in the agent shell. Every command runs as:
  `export PATH="/tmp/opencode/bin:$PATH" && <cmd>` (corepack dir provides pnpm 12.18.0).
- Gate: `pnpm typecheck && pnpm lint && pnpm build && pnpm check:i18n && pnpm test`.
- `pnpm format` before `lint` after any ledger/markdown edit (Biome lints table alignment).
- Biome enforces 4-space continuation for PLAN.md status lines under a step bullet.
- No new hex colors, no `any`, Zod on every input, no PII in logs (push endpoints and
  auth secrets are PII-adjacent: never log them).
- Dependency additions this milestone (both owner-approved via spec decision 3/4):
  `webpush-webcrypto` (worker runtime, zero-dep WebCrypto push client) and
  `workbox-precaching` (web, bundled into the SW only). Lockfile committed with the
  one-line justifications in CLAUDE.md's decisions log at wrap-up.
- Grounding facts (verified 2026-11-15): chats enqueue point routes/chats.ts:235-268
  (waitUntil slot after the D1 updatedAt bump, peerId in scope); ChatRoom /state
  shape {last, myRead} with unread rule last.seq > myRead (reuse threadStateSchema);
  queue stub index.ts:117-119; queues config wrangler.jsonc:49-61 + :102-114 (add
  max_retries 3 to both consumers); PWA generateSW options vite.config.ts:12-68 with
  registerType "prompt" + manual registerSW (update-prompt.tsx) — the update contract
  must survive; no custom SW today; _headers CSP already allows worker-src 'self';
  migrations next is 0006; purge block me.ts:489-572 (explicit delete beside :553-556).
- webpush-webcrypto API: `ApplicationServerKeys.generate()/toJSON()/fromJSON()` +
  `generatePushHTTPRequest({ applicationServerKeys, payload, target: { endpoint,
  keys: { p256dh, auth } }, adminContact, ttl, urgency })` → `{ headers, body,
  endpoint }` + own `fetch`. No TS types ship with it → `apps/worker/src/types/`
  declare-module shim. Verify the exact toJSON field names against the installed
  package (node_modules/webpush-webcrypto) in step 3 before wiring fromJSON.

## Steps

1. [ ] **Shared push module** — `packages/shared/src/push.ts`: VAPID key response
   schema, pushSubscriptionSchema (endpoint z.url or https string max 2048, keys
   strict {p256dh, auth} base64url-ish strings), pushDeleteSchema; tests (URL shape,
   missing keys, strictness, length caps). Export from index.ts (alphabetical).
   Verify: `pnpm --filter @hearth/shared test && pnpm typecheck`.
2. [ ] **Migration 0006 + drizzle** — `migrations/0006_push_subscriptions.sql` per
   spec DDL (endpoint PK, FK cascade, idx_push_subscriptions_user); drizzle
   `pushSubscriptions` table in schema.ts after rooms; node:sqlite proof
   (/tmp/opencode/m6-migration-proof.mjs, fresh 0000→0006): insert, upsert on endpoint
   PK, FK cascade, index exists, re-apply rejected. Verify: proof ALL PASS + `pnpm
   --filter @hearth/worker typecheck && pnpm --filter @hearth/worker test`.
3. [ ] **Worker push lib + routes** — add `webpush-webcrypto` to apps/worker deps;
   `declare module` shim; `lib/web-push.ts` (load keys from env via fromJSON — verify
   toJSON field names first; buildPushPayload(senderName, language) with EN/EL copy;
   sendPushToSubscription with 404/410 → prune signal; 503 when VAPID unset);
   `routes/push.ts` mounted at `/api/v1/me/push` (GET /key, POST /, DELETE /) with
   shared schemas; env.ts + wrangler.jsonc vars `VAPID_PUBLIC_KEY`/`VAPID_SUBJECT`
   (top-level empty-string placeholders + staging real values land with owner keys),
   `VAPID_PRIVATE_KEY` optional secret; `.dev.vars.example` entries;
   `scripts/generate-vapid-keys.mjs` (prints toJSON pair + export commands);
   package.json script `vapid:generate`. Verify: typecheck + tests + `pnpm build`.
4. [ ] **Chats enqueue + queue consumer** — chats.ts POST /:peerId/messages:
   `c.executionCtx.waitUntil(c.env.JOBS.send({ recipientId: peerId, senderId: id,
   senderName: meSnapshot displayName… }))` — senderName resolved without new queries
   if available, else job carries ids only and consumer loads names from D1;
   index.ts `queue(batch)`: per message validate job (Zod), ChatRoom /state as
   recipient → skip when last.seq <= myRead or last.author === recipientId, load
   recipient subscriptions + language, send per subscription, prune on 404/410,
   aggregate failures without PII logs; wrangler.jsonc both consumers `max_retries:
   3`; me.ts purge explicit pushSubscriptions delete. Verify: typecheck + tests +
   build.
5. [ ] **Web SW + NotificationsCard + locales** — vite.config.ts →
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
6. [ ] **e2e** — single shell invocation with the NixOS LD_LIBRARY_PATH wrapper (see
   note below); 8/8 must pass with the injectManifest SW (update-prompt + offline
   flows unaffected). Verify: `pnpm test:e2e` 8/8.
7. [ ] **Wrap-up** — CLAUDE.md current-milestone + dependency-justification decision
   rows; M6.md ledger ticks + verification log rows; full gate; reviewer subagent on
   the full M6 diff; single commit; owner pushes; verify CI + Deploy staging green
   (anonymous GitHub API, head_sha query) + staging health.
8. [ ] **Staging live test** — owner generates VAPID keys (`pnpm vapid:generate`),
   sets `VAPID_PUBLIC_KEY`/`VAPID_SUBJECT` vars in wrangler.jsonc staging env +
   `VAPID_PRIVATE_KEY` secret (`wrangler secret put --env staging`), agent redeploys,
   then owner: enable notifications on two real accounts, send messages with tabs
   closed, confirm one quiet localized push each way + tap-through to the
   conversation. Tick the final M6.md ledger boxes.

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

All 8 boxes ticked; gate green; i18n parity with the `notifications.*` keys; shared
unit tests cover the schema edges; migration proof passed; e2e 8/8 with the custom
service worker; reviewer clean; committed on `main`; CI + Deploy staging green on the
commit; VAPID configured; owner confirms a live two-account push round-trip.
