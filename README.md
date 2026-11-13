# Hearth

A calmer way to find someone you genuinely enjoy living with. Built for students and first-time movers,
with explainable compatibility, privacy by default, and equal Greek/English quality.

This repository is at milestone M1: authentication and profiles. A new person can sign in with an email
one-time code or a passkey, finish onboarding, edit their profile, verify a student email, export their
data and delete their account. See `docs/specs/M1.md` for scope, decisions and the progress ledger.
Read `CLAUDE.md` for commands and conventions.

## Run locally

```sh
pnpm install
cp .dev.vars.example .dev.vars   # then set BETTER_AUTH_SECRET and RESEND_API_KEY
pnpm db:migrate:local
pnpm dev
```

Open <http://localhost:5173>. The API runs on <http://127.0.0.1:8787> and Vite proxies `/api` to it.
Wrangler creates a local D1 database and R2 bucket from `wrangler.jsonc`; no Cloudflare account is
needed for development.

Email codes go through Resend when `RESEND_API_KEY` is set. For automated tests only, set
`ENVIRONMENT=test` and a six-digit `AUTH_TEST_OTP`; never set these on a deployed Worker.

## Checks

```sh
pnpm check:i18n       # EN/EL key and placeholder parity
pnpm typecheck
pnpm lint
pnpm test             # shared unit tests plus the Worker health test
pnpm build:web
pnpm build:worker
```

`workerd` has no Android arm64 binary, so Worker tests, `pnpm build:worker`, `pnpm dev` and Playwright
must run on Linux or CI. The M1-specific Worker and Playwright tests are deferred at the user's request
and are not part of this milestone's tree.

## Cloudflare setup

The repository currently ships placeholder resource IDs. Before the first deploy:

```sh
wrangler login
wrangler d1 create hearth-db
wrangler r2 bucket create hearth-photos
wrangler queues create hearth-jobs
```

Replace the production `database_id` in `wrangler.jsonc` with the UUID returned by `wrangler d1 create`.
Repeat with the `staging` names (`hearth-db-staging`, `hearth-photos-staging`, `hearth-jobs-staging`)
and replace the staging UUID, then set `APP_ORIGIN` to the real Worker origin.

Set secrets with Wrangler; never commit them:

```sh
wrangler secret put BETTER_AUTH_SECRET --env staging
wrangler secret put RESEND_API_KEY --env staging
wrangler secret put MAIL_FROM --env staging
```

`BETTER_AUTH_SECRET` must be at least 32 characters. Adding the `CLOUDFLARE_API_TOKEN` and
`CLOUDFLARE_ACCOUNT_ID` repository secrets enables the staging deploy workflow.

## Privacy guardrails

No trackers, no exact addresses, and no personal data or message bodies in logs. OTPs are hashed at rest
and never returned by the API. Coordinates are rounded to two decimals (roughly 1–2 km).
