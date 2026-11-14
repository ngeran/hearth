# PLAN — M2 lifestyle questionnaire

Spec: `docs/specs/M2.md` (owner-approved 2026-11-14 — questionnaire wording, archetype names, all
design decisions). The spec is canonical for content and product behavior; this file is the build
checklist. The restyle plan that lived here previously is complete (12/12, shipped in `deb85dd`).

## Constraints

- Storage is one nullable `lifestyle_json` TEXT column on `profiles` (versioned envelope, shared
  Zod validation on write and read). No per-question columns, no new tables, no new endpoints.
- The questionnaire is required for onboarding completeness; the all-or-nothing patch carries the
  full envelope `{ version: 1, answers: { … } }`.
- The archetype is derived on read in `packages/shared`, never persisted.
- All user-facing strings (questions, options, dimensions, archetypes, step/section copy) live in
  `apps/web/src/locales/en.json` + `el.json`, keyed by the code question ids; parity via
  `pnpm check:i18n`. Greek is the owner-approved wording from the spec.
- No protected-characteristic questions, no judgmental option wording, no free text.
- Visual system: existing dark-only tokens/utilities from the restyle; no new hex in components.
- Existing migrations are immutable; M2 adds `migrations/0003_lifestyle.sql`.
- M1-deferred Worker/Playwright tests stay deferred; M2 adds shared unit tests only. The existing
  e2e smoke suite must stay green (it does not drive onboarding).
- Local gate (NixOS x86_64): `pnpm typecheck && pnpm lint && pnpm build && pnpm check:i18n &&
  pnpm test`. `pnpm` is not on PATH: `corepack enable --install-directory /tmp/opencode/bin &&
  export PATH="/tmp/opencode/bin:$PATH"`.

## Conventions (from existing code — do not invent new ones)

- Strict TypeScript, no `any`, no unjustified non-null assertions; Zod `.strict()` objects; unix
  seconds for instants (no new timestamps in M2 — `profiles.updated_at` already bumps).
- Shared package stays pure (no DOM/Worker APIs); every schema edge gets a unit test; export new
  modules from `packages/shared/src/index.ts`.
- Worker: validate every input with the shared schema, parameterized queries only, shared error
  envelope, never log personal data.
- Web: `react-hook-form` + shared Zod schemas; radio groups use `fieldset`/`legend` +
  `aria-describedby`; empty/loading/error states; 360 px; focus management like existing steps.
- Biome formatting enforced (`pnpm lint`); status lines below use 4-space continuation indents.

## Checklist

Run the local gate after every step; tick only when it passes. Fix failures before moving on.

1. [x] **Shared lifestyle module** — `packages/shared/src/lifestyle.ts`:
   `LIFESTYLE_VERSION`, `LIFESTYLE_DIMENSIONS`, `LIFESTYLE_QUESTIONS` (10 ids + dimension +
   order), `LIFESTYLE_QUESTION_IDS`, level type, `lifestyleEnvelopeSchema` (strict: version
   literal, all 10 ids at levels 0|1|2, no extras), `parseStoredLifestyle` (defensive read:
   null/invalid JSON → null), `deriveLifestyleArchetype` with the exact spec mapping. Unit tests:
   schema rejects partial/unknown/extra/out-of-range, envelope round-trip, parse helper on bad
   input, all 5 archetype branches + boundaries (socialScore 1 vs 2, late+social 2 vs 3). Export
   from the shared index. Verify: `pnpm --filter @hearth/shared test && pnpm --filter
   @hearth/shared typecheck`.
2. [x] **Shared profile integration** — `profile.ts`: `lifestyle: LifestyleProfile | null` in
   `ProfileSnapshot` + snapshot schema, `lifestyle` key in `profilePatchSchema` and
   `onboardingFormSchema`, `lifestyle` in `ONBOARDING_FIELDS` + `getMissingOnboardingFields`
   (missing when null). Verify: shared tests cover the completeness boundary (complete profile
   without lifestyle → missing `lifestyle`) + `pnpm --filter @hearth/shared typecheck`.
3. [x] **Migration + Drizzle schema** — `apps/worker/src/db/schema.ts` adds `lifestyleJson`
   nullable text; `migrations/0003_lifestyle.sql` adds the column with a `json_valid` CHECK.
   Verify with a `node:sqlite` one-off in `/tmp/opencode`: apply 0000→0003, re-apply
   idempotently, insert a row with invalid JSON → rejected by CHECK, valid envelope → accepted.
4. [x] **Worker API wiring** — `apps/worker/src/lib/profiles.ts` + `routes/me.ts`: accept the
   `lifestyle` patch key (all-or-nothing, shared schema), persist the JSON string, parse via
   `parseStoredLifestyle` on read, surface in `GET /api/v1/me` and the export payload.
   Verify: `pnpm --filter @hearth/worker typecheck` + full gate (no Worker runtime tests exist —
   deferred per M1; typecheck + build dry-run is the local proof).
5. [x] **Locale keys** — questions (label + 3 options), dimension names, archetype names +
   one-line descriptions + the "why" line, step/section/empty-state copy in `en.json` + `el.json`
   at exact parity, Greek from the approved spec table. Verify: `pnpm check:i18n`.
6. [x] **Web components** — `lifestyle-questionnaire.tsx` (5 fieldset/legend dimension groups,
   3-option radio rows, error wiring, 360 px) + `lifestyle-summary.tsx` ("What we learned about
   you": 5 dimension lines, archetype name/description, why-line). Verify: `pnpm --filter
   @hearth/web typecheck`.
7. [x] **Onboarding integration** — new Lifestyle step between Living and Finish (6 steps,
   progress bar denominators, STEP_FIELDS for the lifestyle patch, all answered before Continue,
   review step mentions lifestyle, summary shown after finishing). Verify: full gate.
8. [x] **Profile integration** — "Your lifestyle" section (summary + change answers + save),
   empty state, loading/error states. Existing complete profiles re-enter onboarding once via
   the existing guard — verified by the shared completeness test in step 2. Verify: full gate.
9. [x] **Wrap-up** — `CLAUDE.md` current-milestone paragraph, `docs/specs/M2.md` ledger +
   verification log, full gate + `pnpm test:e2e` (NixOS wrapper below), `reviewer` subagent on
   the diff, commit. Verify: e2e green locally, reviewer findings addressed, tree committed.

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
cover every schema edge and all archetype branches; `node:sqlite` migration proof recorded in the
spec verification log; e2e smoke green; reviewer clean; committed on `main`; the owner pushes and
CI + Deploy staging go green on the commit.
