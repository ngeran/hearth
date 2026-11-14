# PLAN — M3 matching engine, matches UI, compatibility report

Spec: `docs/specs/M3.md` (owner review of tiers/tags/copy pending — build starts only after
approval). The spec is canonical for content and product behavior; this file is the build
checklist. The M2 plan that lived here previously is complete (9/9, shipped in `30e6998`).

## Constraints

- Scoring is pure shared code over the M2 lifestyle envelope: every question weighs 10%,
  `score = round(mean weight × 100)`, tiers at 75/50. No stored per-pair state, no batch job.
- Eligibility gates (seeking, budget, move-in window, area ±0.05 or same campus) filter who
  appears; they never change the score; missing data passes a gate.
- One new endpoint `GET /api/v1/matches` (session-authed, compute-on-read, limit 20, shared error
  envelope, 403 for incomplete callers). No query params, no new error codes, no logging of match
  data.
- Matches payload includes the other member's lifestyle answer levels (dimension-level report +
  habit tags only in the UI); `profile.lifestyle.body` copy is updated to say who sees it.
- No photos of other members in M3 — initials avatars; public photo endpoint is an M4 decision.
- All new strings in `apps/web/src/locales/en.json` + `el.json` at exact parity (Greek from the
  approved spec tables); report rows reuse the existing `lifestyle.questions.*.options.*` labels.
- Seeds: `scripts/seed-matches.mjs` (deterministic, staging-only, `seed_` ids +
  `@seed.hearth.test`, cascade cleanup) and the `pnpm seed:matches` script entry — no new
  dependencies.
- Visual system: existing dark-only tokens/utilities; no new hex in components.
- No migrations (all data exists after M2).
- Worker endpoint tests stay deferred (M1 decision); shared unit tests cover scoring/gates/tags;
  existing e2e smoke must stay green.
- Local gate (NixOS x86_64): `pnpm typecheck && pnpm lint && pnpm build && pnpm check:i18n &&
  pnpm test`. `pnpm` is not on PATH: `corepack enable --install-directory /tmp/opencode/bin &&
  export PATH="/tmp/opencode/bin:$PATH"`.

## Conventions (from existing code — do not invent new ones)

- Strict TypeScript, no `any`, no unjustified non-null assertions; Zod `.strict()` objects.
- Shared package stays pure (no DOM/Worker APIs); every schema edge gets a unit test; export new
  modules from `packages/shared/src/index.ts` (alphabetical order).
- Worker: route modules follow `me.ts`/`campuses.ts` (`new Hono<AppEnv>()`, `use("*",
  requireSession)`, export the sub-app, mount with `.route()`); validate outputs with shared
  schemas; parameterized queries only; never log personal data.
- Web: raw `fetch` + shared Zod parse in `lib/*.ts` (the `me.ts` pattern — the RPC client stays for
  health only); TanStack Query hooks in `use-*.ts` (`retry: false`); empty/loading/error states;
  `aria-*` wiring; 360 px; focus management like existing screens.
- Biome formatting enforced (`pnpm lint`); status lines below use 4-space continuation indents.

## Checklist

Run the local gate after every step; tick only when it passes. Fix failures before moving on.

1. [x] **Shared match module** — `packages/shared/src/match.ts` + `match.test.ts`: constants
   (`COMPAT_STRONG_THRESHOLD`, `COMPAT_CHAT_THRESHOLD`, `AREA_MATCH_TOLERANCE`, `MATCHES_LIMIT`),
   `MatchTier`, `MatchCandidate`, `scoreCompatibility` (score/tier/dimensionScores/shared +
   friction ids), `matchEligibility` (the 5 gates, null passes), `deriveHabitTags` +
   `HABIT_TAG_IDS` (max 3, question order), `matchesResponseSchema` (strict). Unit tests: weights,
   rounding, symmetry, boundaries 74/75 + 49/50, identical → 100, opposite → 0, full gate matrix,
   tag rules. Export from the shared index. Verify: `pnpm --filter @hearth/shared test &&
    pnpm --filter @hearth/shared typecheck`. — 34 new tests (69 shared total); typecheck green.
2. [x] **Worker matches route** — `apps/worker/src/routes/matches.ts` (requireSession; 403
   `forbidden` when the caller's own onboarding is incomplete; SQL prefilter: not-self,
   `lifestyle_json NOT NULL`, `onboarding_completed_at NOT NULL`, `users.status = 'active'`,
   `deleted_at IS NULL`; per-candidate `toProfileSnapshot` → JS gates → scoring; sort score desc
   then displayName asc; limit 20) + `.route("/api/v1/matches", matchesRoutes)` in `index.ts` +
   fix the stale `scheduled()`/`queue()` comments. Verify: `pnpm --filter @hearth/worker
    typecheck` + full gate. — typecheck + 4 worker tests + lint + build dry-run green.
3. [x] **Seed script** — `scripts/seed-matches.mjs` (`--count` default 12, `--seed` default 42,
   `--dry-run`; mulberry32; personas covering all 5 archetypes with expected-archetype notes;
   Athens-cluster areas, one campus cohort, budgets 250–700, windows inside 12 months, seeking
   weighted roommate/either; generates SQL → `corepack pnpm exec wrangler d1 execute
    hearth-db-staging --remote --env staging --file`) + `"seed:matches"` script in root
   `package.json`. Verify: `pnpm seed:matches --dry-run` prints SQL; a `node:sqlite` one-off in
   `/tmp/opencode` applies it to a fresh 0000→0003 DB and counts 12 users/12 profiles. — proof:
   12/12 complete rows, archetypes derive as expected, double-apply idempotent (INSERT OR
   REPLACE).
4. [x] **Web data + locales** — `apps/web/src/lib/matches.ts` (`fetchMatches`, raw fetch +
   `matchesResponseSchema`) + `use-matches.ts` (`["matches"]`, `retry: false`, `staleTime:
    60_000`); locale keys at parity: tier names/descriptions, habit tags (`lifestyle.tags.*`),
   report copy (title, logistics labels, you/them, align/partially/differ sr labels,
   shared/friction headings), empty state, `profile.lifestyle.body` update. Verify:
   `pnpm check:i18n && pnpm --filter @hearth/web typecheck`. — 296 keys en+el parity; typecheck
   green.
5. [x] **Matches UI** — `match-card.tsx` (initials avatar, name, area, tier-colored score badge,
   tags), `compatibility-report.tsx` (score + tier line, Area/Budget/Move-in rows You vs them, 5
   dimension rows with both option labels + sr-labelled mark, shared/friction chips), new
   `matches-route.tsx` (empty/loading/error, selection, `lg:` two-pane, mobile overlay panel with
   close, keyboard + 360 px); `router.tsx`: replace the placeholder with `RequireAuth` +
   `MatchesRoute`. Verify: full gate. — Gate green (typecheck ×3, lint, build, i18n 297 keys
   en+el with one added `matches.incomplete` pair for the incomplete-profile state, 69+4 tests).
   Dimension rows show mark + % (thresholds reuse `COMPAT_*`); report logistics is a You/them
   table; mobile overlay traps Escape + focuses itself.
6. [x] **e2e stays green** — run `pnpm test:e2e` (NixOS wrapper below); if any spec asserted the
   old Matches placeholder copy, update it to the new screen. Verify: e2e green locally.
   Status: 8/8 passed via the NixOS LD_LIBRARY_PATH wrapper (single invocation); no spec
   referenced the placeholder copy or /matches, so no spec changes were needed; the
   `[WebServer] api_error TypeError` lines are the known tolerated local-Wrangler noise.
7. [x] **Wrap-up** — `CLAUDE.md` current-milestone paragraph, `docs/specs/M3.md` ledger +
   verification log, full gate, `reviewer` subagent on the diff, commit. Verify: reviewer findings
   addressed, tree committed; owner pushes and CI + Deploy staging go green.
   Status: reviewer found no blockers; fixed the one spec deviation (report dimension rows now
   show both sides' option labels), added the overlay Tab trap + focus restore, corrected a seed
   comment; the focus-visible nit was withdrawn (global `:focus-visible` rule already styles the
   card). Full gate green.
8. [x] **Stage the seeds** — after the deploy is green: run `pnpm seed:matches` against staging,
   verify with a `wrangler d1 execute … --command "SELECT count(*) …"` row count, and have the
   owner eyeball `/matches`. Verify: seed count correct, owner sees seeded matches.
   Status: CI (run 43619747850) + Deploy staging (run 43619888801) green on 0f663f0; seeds
   applied (12 users / 12 complete profiles confirmed via remote D1 count, all 5 archetypes);
   staging health ok. Owner eyeball of `/matches` pending.

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

All 8 boxes ticked; gate green; `pnpm check:i18n` parity with the new keys; shared unit tests
cover every scoring edge, gate rule, and tag; seed proof recorded in the spec verification log;
e2e smoke green; reviewer clean; committed on `main`; the owner pushes, CI + Deploy staging go
green on the commit, seeds applied, and the owner sees matches on staging.
