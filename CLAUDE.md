# CLAUDE.md

Hearth is a roommate compatibility app for students and first-time movers. The product starts with
explainable compatibility, calm UX, privacy by default, and equal Greek/English quality. This file is
the always-current project guide. Work only on the current milestone and read only its spec in
`docs/specs/`.

## Current milestone

M1 — auth and profiles — implementation complete, waiting for approval before M2. M1 Worker and Playwright
tests are deferred at the user's request (see `docs/specs/M1.md`); shared unit tests and the existing
Worker health test stay in CI.

## Stack

- pnpm workspaces: `apps/web`, `apps/worker`, `packages/shared`.
- Web: React 19, Vite 8, TypeScript 7 strict, Tailwind CSS 4, shadcn/ui conventions, TanStack Query,
  React Router 7, i18next, vite-plugin-pwa.
- API: Cloudflare Worker, Hono, Zod, typed Hono RPC client; assets and API share one Worker in prod.
- Data: D1 + Drizzle ORM, SQL migrations in `migrations/`.
- Tooling: Biome, Vitest with the Cloudflare Workers pool, Playwright, GitHub Actions, Wrangler.

## Commands

```sh
pnpm install               # install workspace dependencies
pnpm dev                   # Wrangler API on :8787 + Vite on :5173 (proxies /api)
pnpm build                 # build the PWA and dry-run bundle the Worker
pnpm preview               # Wrangler serves built PWA + API on :8787
pnpm typecheck             # strict TypeScript across all packages
pnpm lint                  # Biome lint + format check
pnpm format                # apply Biome fixes
pnpm test                  # shared and Worker unit tests
pnpm test:e2e              # build web, then Playwright smoke tests
pnpm check:i18n            # fail if en/el keys or interpolations differ
pnpm db:generate           # generate Drizzle SQL migrations
pnpm db:migrate:local      # apply migrations to local D1
pnpm db:migrate:staging    # apply migrations to staging D1
pnpm deploy:staging        # deploy the staging Worker
pnpm sim                   # deterministic synthetic-data harness foundation
pnpm icons                 # regenerate PWA PNG icons
```

## Conventions

- Strict TypeScript, no `any`, no non-null assertions unless justified.
- All user-facing strings live in `apps/web/src/locales/en.json` and `el.json`.
- Greek copy is written natively, never machine-translated; review it with a native speaker before launch.
- Types, schemas, constants, card definitions, and matching logic belong in `packages/shared` and stay pure.
- Durable Object chat and other I/O stay in `apps/worker`.
- Use unix seconds (integers, UTC) for all persisted timestamps.
- Validate every API input with Zod; never trust the client. Parameterized queries only.
- Never log personal data, message bodies, secrets, or tokens. No third-party analytics or trackers.
- Every new screen needs an empty, loading and error state plus keyboard and screen-reader checks.
- Test data must be synthetic. Never commit `.dev.vars`; use `.dev.vars.example` as the key list.
- Add a dependency only with a one-line justification and commit the lockfile.

## Decisions log

- 2026-11-09 — React Router 7 over TanStack Router for the M0 shell: smaller setup, same routing needs,
  and it is explicitly allowed by the brief.
- 2026-11-09 — Production serves `apps/web/dist` and `/api/*` from one Worker. Local dev runs Wrangler
  for the API and Vite for HMR; Vite proxies `/api` to Wrangler. `pnpm dev` starts both.
- 2026-11-09 — Theme is a system/light/dark tri-state stored under `hearth.theme`. A class on `<html>`
  drives Tailwind v4 dark tokens; no inline scripts, so the production CSP stays strict.
- 2026-11-09 — Brand terracotta `#C8553D` is the visual token. Interactive terracotta is `#B44530` in
  light mode because white text on `#C8553D` is 4.35:1, below WCAG AA for normal text.
- 2026-11-09 — Headings use Source Serif 4 and body text uses Inter, both self-hosted via Fontsource and
  both include Greek subsets. No third-party font requests.
- 2026-11-09 — D1 bindings are stubs until resources are created; replace the zero UUIDs in
  `wrangler.jsonc` with real production/staging IDs before deploying.
- 2026-11-09 — Worker unit tests use a minimal `wrangler.test.jsonc` without static assets. The full
  production config is exercised by `pnpm build` and Playwright.
- 2026-11-09 — `pnpm sim` currently validates seeded archetype generation only. The real deterministic
  matching simulation is completed with the M3 engine.
- 2026-11-09 — `pnpm check:i18n` compares flattened key sets and `{{placeholder}}` sets; it runs in CI.
- 2026-11-11 — Better Auth `1.7.20` with the Drizzle adapter, email one-time codes stored hashed, and
  passkeys. No passwords. Better Auth's `user` model maps onto the existing `users` table.
- 2026-11-11 — Email is sent with a small fetch-based Resend client, not the Resend SDK. Templates are
  bilingual and OTPs or message bodies are never logged.
- 2026-11-11 — Student-email verification is our own 6-digit HMAC-hashed challenge: 10-minute TTL,
  5 attempts, 60-second cooldown, one active challenge per user.
- 2026-11-11 — Account deletion is `DELETE /api/v1/me` with a typed `DELETE` confirmation, explicit
  D1/R2 cleanup, cookie clearing and an anonymized audit row.
- 2026-11-11 — Photo uploads are JPEG/PNG only. The client re-encodes to JPEG; the Worker sniffs magic
  bytes and strips metadata with pure shared functions. Maximum 5 MB.
- 2026-11-11 — Move-in dates are calendar dates (`YYYY-MM-DD`); instants are unix seconds. Coordinates
  are rounded to two decimals and exact addresses are never collected.
- 2026-11-11 — M1 Worker and Playwright tests are deferred at the user's request. Do not add the test
  scaffold or fixed-OTP test config until the user asks for it.
- 2026-11-13 — Staging deploys run only after the CI workflow succeeds on the exact commit
  (`workflow_run` gate in `deploy-staging.yml`); manual `workflow_dispatch` bypasses it by design.
- 2026-11-13 — Academic-email sends are rate limited per user: 60-second resend cooldown plus at most
  5 codes per hour (429 `rate_limited`/`hourly_limit` with `retry-after`). Migration 0002 adds a
  partial unique index so only one unconsumed challenge can exist per user.
- 2026-11-13 — Web calls to `/api/v1/me*` use raw `fetch` plus shared Zod parsing
  (`apps/web/src/lib/me.ts`); the typed Hono RPC client stays for health checks. Do not migrate the
  photo/export endpoints to the RPC client (multipart and file downloads do not fit it).
- 2026-11-13 — The visual system is replaced by the DESIGN.md/Stitch spec, canonically recorded in
  `docs/design/DESIGN.md`. It is dark-only OLED (`#131315` ground) — the system/light/dark tri-state
  and the `#C8553D`/`#B44530` light-mode terracotta are retired — and typography is Inter-only
  (Source Serif 4 retired). Where the original DESIGN.md prose and YAML tokens conflicted, the YAML
  tokens win (they match the Stitch screens). Restyle scope: existing M1 screens only. This
  supersedes the 2026-11-09 theme, typeface, and terracotta decisions.

## Assumptions

- No Cloudflare account resources exist yet, so all resource IDs are placeholders and no deploy is run in
  M1. CI is configured but the staging deploy needs the two documented GitHub secrets. Create the D1, R2
  and Queue resources as described in `README.md`, then replace the zero UUIDs and the staging origin.
- The repository is new and has no pre-existing conventions to preserve.
- `APP_ORIGIN` is non-secret configuration in `wrangler.jsonc`; the rest of the listed values are secrets.
- The primary development environment is NixOS on x86_64 (migrated from Termux on 2026-11-13) and the app
  deploys to Cloudflare. `workerd` and Playwright run locally, so every workspace script — including
  `pnpm test`, `pnpm build:worker`, `pnpm dev` and `pnpm test:e2e` — is a local check. CI on `ubuntu-latest`
  still gates staging deploys.
- English is the fallback language; Greek is selected automatically for `el-*` browsers and persisted.
- PWA update prompts are manual and non-blocking, following the calm-technology principle.
- The Web Push, matching, chat, and admin flows are deliberately absent until their milestones. Auth,
  onboarding, profile editing, student-email verification, export and deletion exist in M1.

## Safety and privacy guardrails

Never add protected-characteristic questions or filters, exact addresses, ID documents, card data,
ad/tracking scripts, engagement mechanics, or an LLM in the matching path. Core matching, messaging and
safety features stay free. Legal pages remain clearly marked placeholders until reviewed.
