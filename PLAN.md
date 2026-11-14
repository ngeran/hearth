# PLAN — M4 1:1 chat

Spec: `docs/specs/M4.md` (owner review of the chat model, polling decision, privacy pass and
Greek copy — **approved 2026-11-14**, including the export gap). The spec is canonical for content and
product behavior; this file is the build checklist. The M3 plan that lived here previously is
complete (8/8, shipped in `0f663f0`, seeds live on staging).

## Constraints

- Chat is 1:1 text only between currently-matched members. `POST /api/v1/chats` recomputes the M3
  gates server-side (self/complete/active, seeking pair, budget, window, area) — no like/pass, no
  stored pair state; existing threads stay readable if eligibility later ends.
- Message bodies live only in the `ChatRoom` Durable Object (binding `CHAT`, SQLite-backed).
  D1 stores only thread metadata (`chat_threads`, migration 0004). Bodies are never logged, never
  written to D1; the thread-list preview is fetched live from the DO.
- Transport is REST + polling (messages every 5 s while the tab is visible). No WebSockets, no
  typing indicators, no read-receipt UI. Unread is a dot in the thread list only.
- Auth stays at the Hono route (`requireSession`); the route forwards the verified user id to the
  DO in `x-hearth-user-id`. The DO never parses cookies; it trusts only worker-originated fetches.
- Message body: 1–1000 chars after trim, no control characters (Zod, shared). Send cooldown 1 s
  per sender inside the DO → 429 `rate_limited` (existing code).
- `DELETE /api/v1/me` purges every conversation the account was part of (DO `deleteAll` per
  thread) before the existing D1/R2 cleanup. Message export stays out of M4 (owner-flagged gap).
- All new strings in `apps/web/src/locales/en.json` + `el.json` at exact parity, Greek written
  natively in the informal register. No new dependencies, no new hex/tokens, nav structure
  untouched (Messages entry already exists).
- A DO unit test is in scope (`apps/worker/test/chat.test.ts` via `@cloudflare/vitest-plugin`,
  after adding the `CHAT` binding + `new_sqlite_classes` migration to `wrangler.test.jsonc`);
  route-auth tests stay deferred per the M1 decision; e2e smoke stays green.
- Local gate (NixOS x86_64): `pnpm typecheck && pnpm lint && pnpm build && pnpm check:i18n &&
  pnpm test`. `pnpm` is not on PATH: `corepack enable --install-directory /tmp/opencode/bin &&
  export PATH="/tmp/opencode/bin:$PATH"`.

## Conventions (from existing code — do not invent new ones)

- Strict TypeScript, no `any`, no unjustified non-null assertions; Zod `.strict()` objects.
- Shared package stays pure (no DOM/Worker APIs — `chatThreadId` is string math only); every
  schema edge gets a unit test; export new modules from `packages/shared/src/index.ts`
  (alphabetical order).
- Worker: route modules follow `me.ts`/`matches.ts` (`new Hono<AppEnv>()`, `use("*",
  requireSession)`, export the sub-app, mount with `.route()`); validate inputs/outputs with
  shared schemas; parameterized queries only; never log personal data or message bodies.
- DO: storage keys exactly as specced (`meta`, `seq`, `last`, `m:<12-digit>`, `read:<userId>`,
  `cooldown:<userId>`); every reply uses the shared API envelope; unknown internal endpoint → 404.
- Web: raw `fetch` + shared Zod parse in `lib/*.ts` (the `me.ts` pattern); TanStack Query hooks in
  `use-*.ts` (`retry: false`); empty/loading/error states; `aria-*` wiring; 360 px; focus
  management like the matches overlay (trap + restore).
- Biome formatting enforced (`pnpm lint`); status lines below use 4-space continuation indents.

## Checklist

Run the local gate after every step; tick only when it passes. Fix failures before moving on.

1. [x] **Shared chat module** — `packages/shared/src/chat.ts` + `chat.test.ts`:
   `messageBodySchema` (1–1000 after trim, no control chars), `chatMessageSchema`
   (`{seq, author, body, sentAt}`), `chatMessagesResponseSchema`, `threadListItemSchema`
   (peer summary + lastMessage preview + unread), `chatsResponseSchema`, `sendMessageRequestSchema`,
   and pure `chatThreadId(a, b)` → `chat:${low}:${high}` (lexicographic sort). Unit tests:
   body edges (empty/trim/1001/control chars), id sorting determinism + symmetry. Export from the
   shared index. Verify: `pnpm --filter @hearth/shared test && pnpm --filter @hearth/shared
    typecheck`.
   Status: done 2026-11-14. Thread item shipped as `chatThreadSchema`/`ChatThread`; also added
   `startChatRequestSchema` ({peerId}). Newlines allowed, all other C0/C1 controls rejected.
   18 new tests (87 shared total) + shared typecheck green; exported from index alphabetically.
2. [x] **Migration** — `migrations/0004_chat_threads.sql` (`chat_threads` composite PK
   `user_low`/`user_high`, FKs cascade, `created_at`/`updated_at`, index on `user_high,
   updated_at`); drizzle table in `apps/worker/src/db/schema.ts`. Verify: a `node:sqlite` one-off
   in `/tmp/opencode` applies 0000→0004 to a fresh DB and proves the FK cascade deletes thread
   rows when a user row goes.
   Status: done 2026-11-14. Proof (m4-migration-proof.mjs) surfaced that the composite PK alone
   accepts the reversed pair — added `CHECK (user_low < user_high)` so mis-ordered inserts are
   rejected at the DB level. Cascade + duplicate + index assertions pass; worker typecheck + 4
   existing tests green (migrations apply in the vitest D1).
3. [x] **ChatRoom DO** — implement `apps/worker/src/chat-room.ts` (constructor takes `State`;
   `meta`/`seq`/`last` handling; `POST /send` with cooldown; `GET /list?after=&limit=50`;
   `GET /state`; `POST /read`; `POST /purge`; identity from `x-hearth-user-id`, members-only
   access; shared envelope replies; no logging of bodies). Add `CHAT` binding + `migrations`
   `new_sqlite_classes` to `apps/worker/wrangler.test.jsonc`. New
   `apps/worker/test/chat.test.ts`: send → list order → read marker → unread → cooldown → purge,
   through the real namespace. Verify: `pnpm --filter @hearth/worker test`.
   Status: done 2026-11-14. Meta lazily initialised from the first contacting pair
   (`x-hearth-user-id` + `x-hearth-peer-id`, both required); replies parsed with shared schemas
   (chatMessage/chatMessagesResponse/sendMessageRequest) + local zod for the read marker. Two
   test-design bugs fixed en route (same-sender cooldown; outsider must hit the SAME DO with a
   forged header). 13 worker tests green.
4. [x] **Worker routes + deletion purge** — `apps/worker/src/routes/chats.ts` (`GET /chats` list
   with per-thread DO `state` fan-in + peer summaries, `POST /chats` eligibility recompute +
   idempotent upsert, `GET/POST /chats/:peerId/messages` forwarding; 403 for incomplete caller /
   ineligible peer; 404 when no thread) + mount in `index.ts` + `routes/me.ts` deletion gains the
   DO purge step before D1 cleanup. Verify: `pnpm --filter @hearth/worker typecheck` + full gate.
   Status: done 2026-11-14. List capped at 50 threads (desc updated_at), preview truncated at 80
   chars; GET messages marks the thread read after a successful fetch; DO error envelopes relayed
   verbatim (400/403/404/429); deletion purges each DO before D1 rows fall to the FK cascade;
   `startAfter` built conditionally for exactOptionalPropertyTypes. Typecheck + 13 worker tests +
   build (dry-run resolves the CHAT binding) green.
5. [x] **Web data + locales** — `apps/web/src/lib/chats.ts` (`fetchChats`, `startChat`,
   `fetchThreadMessages`, `sendThreadMessage` — raw fetch + shared schemas) + `use-chats.ts`
   (threads query; messages query with `refetchInterval: 5000` gated on visibility; send
   mutation with cache update). Locale keys at parity: `messages.*` block (titles, empty states,
   composer, send, unread a11y, relative time) + `matches.report.sayHi`. Verify:
   `pnpm check:i18n && pnpm --filter @hearth/web typecheck`.
   Status: done 2026-11-14 — added shared `startChatResponseSchema` (+1 test, both sides parse
   the POST /chats reply); messages query polls the after=0 tail window; send invalidates the
   whole `["chats"]` tree. Locales: 21 new keys (plural `_one`/`_other` relative-time forms);
   check:i18n 318 keys parity; full gate green (88 shared + 13 worker tests). Biome needed a
   justified ignore for the deliberate control-character reject regex.
6. [x] **Messages UI** — new `messages-route.tsx` (thread list + conversation + composer; mobile
   single-pane swap, `lg:` two-pane; unread dots; send states; empty/loading/error; `/messages?
    with=<userId>` creates/focuses the thread); `compatibility-report.tsx` gains the Say hi button;
   `router.tsx`: replace the placeholder with `RequireAuth` + `MessagesRoute`. Verify: full gate.
   Status: done 2026-11-14. Thread rows reuse the match-card pattern (aria-pressed, initials
   avatar, unread dot with sr-only label); conversation autoscrolls on new data, composer
   autosizes to 4 rows, Enter sends only on hover-capable pointers, failed sends keep the text
   (send button doubles as retry). `?with=` is StrictMode-safe via a lastOpened ref. Removed the
   now-dead placeholder-page component + `placeholder.*` keys from both locales (312 keys
   parity). Biome useExhaustiveDependencies fixed (useCallback openThread; effects reference
   their deps). Full gate green (88 shared + 13 worker tests).
7. [x] **e2e stays green** — run `pnpm test:e2e` (NixOS wrapper below); nav structure untouched,
   no spec should need changes. Verify: e2e green locally.
   Status: 8/8 passed (phone + desktop projects) with the NixOS wrapper; no spec changes
   needed. `[WebServer] api_error TypeError` lines remain known-tolerated local Wrangler
   noise (all assertions green).
8. [x] **Wrap-up** — `CLAUDE.md` current-milestone paragraph, `docs/specs/M4.md` ledger +
   verification log, full gate, `reviewer` subagent on the diff, commit. Verify: reviewer findings
   addressed, tree committed; owner pushes and CI + Deploy staging go green.
   Status: reviewer commit-ready (6 nits; fixed unread aria-label composition, EN+EL counter
   plural forms, encodeURIComponent on `?with=`; index-name/read-marker/lazy-meta deltas
   documented). CLAUDE.md + ledgers updated; gate green (313 keys, 89 shared + 13 worker);
   e2e 8/8. Owner push + CI/deploy verification pending (same pattern as M3).
9. [ ] **Staging spot-check** — after deploy: agent verifies health + endpoint envelopes; owner
   opens a chat between two real accounts on staging and says hi. Verify: owner confirms chat
   works end-to-end; tick `M4.md` ledger.

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

All 9 boxes ticked; gate green; `pnpm check:i18n` parity with the new keys; shared unit tests
cover the body/id edges; DO test covers send→list→read→cooldown→purge through the real binding;
e2e smoke green; reviewer clean; committed on `main`; the owner pushes, CI + Deploy staging go
green on the commit, and the owner confirms a live conversation between two accounts on staging.
