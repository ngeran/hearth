# PLAN — Apply the DESIGN.md/Stitch visual system to M1

Approved 2026-11-13. Canonical design spec: `docs/design/DESIGN.md` (YAML tokens win over the
original prose; Stitch screens are the visual reference). Decisions log entry already in
`CLAUDE.md` (2026-11-13) supersedes the 2026-11-09 theme/typeface/terracotta decisions.

## Resolved decisions (was open questions — user-confirmed)

- **Icons**: keep `lucide-react`. No new icon dependency; lucide line icons approximate the
  Stitch Material Symbols glyphs. Do NOT add `@fontsource/material-symbols*`.
- **Emoji**: none in UI copy. The Stitch screens' emoji (👋 💌 🚫 👍 🤷) are mock decoration and
  are not carried into `en.json`/`el.json` strings.
- **Theme**: dark-only OLED (`#131315`). Remove the tri-state toggle, `hearth.theme`, and
  light tokens entirely.
- **Typography**: Inter-only. Remove Source Serif 4 (dep + all `font-serif` usages).
- **Scope**: existing M1 screens + shells + tokens only. No new routes, no flow changes.

## Goal

Replace the M1 web app's visual system with `docs/design/DESIGN.md`: dark-only OLED palette
(M3-style tokens), Inter-only typography with the 10-step type scale, and the Stitch
component conventions (radii, shadows/glows, pills, bilingual GR-primary + EN-secondary
copy). **Restyle only** — no route, flow, logic, API, or content changes.

## Constraints

- No new routes or screens; bottom nav keeps its 3 current tabs (no Rooms route exists).
- A11y attributes, form semantics, validation, and auth flows stay intact.
- `language-switcher.tsx` keeps its native `<select>` element — e2e `smoke.spec.ts` drives it;
  restyle classes only.
- Fonts stay self-hosted via Fontsource (no Google Fonts CDN — CSP/PWA guardrail).
- Local verification gate (dev environment is NixOS x86_64 — workerd and Playwright run locally):
  `pnpm typecheck && pnpm lint && pnpm build && pnpm check:i18n && pnpm test`.
  Run `pnpm test:e2e` locally at step 12; CI re-runs it (incl. 360px no-overflow smoke test).
- No hardcoded hex in components; hex only in `index.css`, `favicon.svg`, `vite.config.ts`
  manifest, `index.html` meta.
- Decorative glows: `pointer-events-none` + `aria-hidden`. Keep base-layer focus-visible ring
  and `prefers-reduced-motion` rules in `index.css`.
- `CLAUDE.md` needs no further edits (decisions already logged).

## Research facts the build session needs (verified 2026-11-13, commit a828521)

- `apps/web/src/index.css` (142 lines): `@import` of `@fontsource-variable/source-serif-4` (L2)
  and `inter` (L3); `@custom-variant dark` (L5, zero `dark:` usages in src — safe to delete);
  light tokens `:root` L7–32 incl. `--hearth-primary: #c8553d`, `--hearth-primary-strong:
  #b44530`; dark tokens `.dark` L34–58; `@theme inline` L60–90 maps semantics — note
  `--color-primary: var(--hearth-primary-strong)` (L71) and `--color-primary-brand` (L72);
  `--radius-card: 1.25rem` (L87), `--radius-control: 0.875rem` (L88), `--shadow-soft` (L89).
- Theme plumbing: `apps/web/src/lib/theme.ts` (44 ln, `hearth.theme`, `initTheme`) called in
  `main.tsx` L7/L11; toggle component `components/theme-toggle.tsx` used in
  `components/app-shell.tsx` (L9, L112, L131) and `components/auth-shell.tsx` (L7, L32).
- Locale keys to delete: `header.theme`, `header.themeMode.{system,light,dark}`,
  `header.themeAction` in BOTH `apps/web/src/locales/en.json` and `el.json` (~L24–30).
- `font-serif` call sites to swap (21): `index.css` L62; app-shell L57/L127; auth-shell L28;
  home-route L35/L52/L64; sign-in-route L192; onboarding-route L261/L565; profile-route
  L255/L275/L293/L576/L601/L713/L844; not-found L15; placeholder-page L39; page-states L31;
  update-prompt L52; offline-page L14.
- Deps: `@fontsource-variable/source-serif-4@5.3.1` (remove), `@fontsource-variable/inter@5.3.0`
  (keep), `tailwindcss@4.3.5`, `lucide-react@1.70.0` (keep).
- Primitives: `apps/web/src/components/ui/button.tsx` is the ONLY ui/ file (CVA, token
  utilities). No card.tsx — cards hand-rolled `rounded-card border bg-card p-5 shadow-soft`.
  Shared input classes: `controlClasses` in `components/form-controls.tsx`.
- Routes: home (marketing), sign-in (email→code→passkey), onboarding (5 steps, inline progress
  L243–253 `role="progressbar"` — restyle in place, do not extract a component), profile
  (photo, details, AcademicEmailCard, PasskeysCard, export/sign-out, delete-DELETE), not-found,
  placeholders (matches/messages).
- PWA/meta: `apps/web/index.html` L6 meta theme-color `#FAF7F2`; `apps/web/vite.config.ts`
  L23–24 manifest `background_color`/`theme_color` `#FAF7F2`; `apps/web/public/favicon.svg`
  L2 fill `#C8553D`.
- e2e (CI-only): `e2e/smoke.spec.ts` (shell loads, language switch via select persists, no
  horizontal overflow at 360px), `e2e/language-detection.spec.ts` (el-GR defaults Greek).
  Do not break the select or introduce 360px overflow.
- Working tree was clean at plan time on commit `a828521 M1`.

## Conventions (copied from existing code — do not invent new ones)

- Colors flow ONLY through CSS custom properties → `@theme inline` semantic aliases →
  utilities (`bg-surface`, `text-foreground`, `rounded-control`, `shadow-soft`). Components
  never hardcode hex.
- Keep the semantic alias names already consumed by markup (`surface`, `card`, `foreground`,
  `muted-foreground`, `border`, `input`, `ring`, `primary`, `primary-foreground`,
  `primary-brand`, `accent`, `destructive`) and re-point their values to the new palette, so
  existing markup restyles without mass renames. Additionally define the full M3 vocabulary
  (`surface-container-lowest…highest`, `on-surface-variant`, `outline`, `outline-variant`,
  `primary-container`, `on-primary-container`, `secondary`, `secondary-container`,
  `on-secondary-container`, `tertiary`, `tertiary-container`, `error`, `error-container`,
  `on-error-container`) for the Stitch-specific patterns.
- Tailwind v4 token syntax (verified): `--text-display-lg: …` with companions
  `--text-display-lg--line-height`, `--text-display-lg--letter-spacing`,
  `--text-display-lg--font-weight` inside `@theme` produce `text-display-lg` utilities.
- Type scale (from DESIGN.md): display-lg 32/40 600 -0.02em; display-lg-mobile 28/36 600
  -0.02em; headline-lg 24/32 600 -0.015em; headline-md 20/28 600 -0.01em; title-md 18/24 600;
  body-lg 16/24 400; body-md 14/20 400; label-lg 14/20 500 0.01em; label-md 12/16 500 0.02em;
  label-sm 11/14 500 0.02em.
- Key token values (full table in `docs/design/DESIGN.md`): surface family #131315/#0e0e10/
  #1c1b1d/#201f21/#2a2a2c/#353437; primary #ffb4a4, on-primary #640d00, primary-container
  #e76b51, on-primary-container #580a00; secondary #a7d0b0 / container #2c5138 / on-container
  #9ac2a2; tertiary #f9bb61 / container #bd8632; error #ffb4ab / error-container #93000a;
  on-surface #e5e1e4; on-surface-variant #dec0b9; outline #a68b85; outline-variant #57423d.
- Radii: `control` → 1rem (16px), `card` → 1.5rem (24px), pills `rounded-full`.
- Shadows: card `0 12px 28px -6px rgb(0 0 0 / 0.45)`; terracotta button glow
  `0 8px 24px -4px rgb(226 103 77 / 0.28)`.
- Component recipes (Stitch): primary button `bg-primary-container text-on-primary
  rounded-control font-semibold active:scale-[0.98]` + glow, ≥44px (`min-h-11` existing);
  secondary `bg-surface-container-high text-on-surface`; cards `rounded-card bg-card`;
  inner wells `bg-surface-container-lowest`; pills `rounded-full`; matched-trait chips
  `bg-secondary-container/20 text-on-secondary-container`; bilingual static copy = Greek
  primary + English secondary in `text-on-surface-variant`.
- i18n: every user-facing string in `en.json` + `el.json` with parity enforced by
  `pnpm check:i18n`; Greek written natively.
- Biome formatting enforced repo-wide (`pnpm lint`).

## Files to touch

- `apps/web/src/index.css` — token foundation rewrite (steps 1, 3)
- `apps/web/src/main.tsx` — remove `initTheme` (step 2)
- DELETE `apps/web/src/lib/theme.ts`, `apps/web/src/components/theme-toggle.tsx` (step 2)
- `apps/web/src/components/app-shell.tsx`, `auth-shell.tsx` — toggle removal + restyle (2, 7)
- `apps/web/src/locales/en.json`, `el.json` — remove theme keys; add restyle strings (2, 8–10)
- `apps/web/package.json` + lockfile — drop `@fontsource-variable/source-serif-4` (3)
- All 21 `font-serif` call sites listed above (4)
- `apps/web/index.html`, `apps/web/vite.config.ts`, `apps/web/public/favicon.svg` (5)
- `apps/web/src/components/ui/button.tsx`, `form-controls.tsx` (6)
- `apps/web/src/components/{brand-mark,language-switcher,home-illustration,health-card,
  photo-field,page-states,placeholder-page,offline-page,update-prompt}.tsx` (7, 11)
- `apps/web/src/routes/{sign-in,onboarding,profile,home,not-found}-route.tsx` (8–11)

## Checklist

Run the full local gate after every step; tick only when it passes. Fix failures before
moving on. Gate = `pnpm typecheck && pnpm lint && pnpm build && pnpm check:i18n && pnpm test`
(run from repo root; use `corepack pnpm` if `pnpm` is not on PATH).

1. [x] **Token foundation** — rewrite `index.css`: delete `@custom-variant dark` and the
   `:root`/`.dark` split; single dark palette in `@theme`; re-point existing semantic aliases
   to the new values; add the full M3 vocabulary; `color-scheme: dark`; radii `control` 1rem /
   `card` 1.5rem; `shadow-soft` → `0 12px 28px -6px rgb(0 0 0 / 0.45)`; add glow shadow token.
   Verify: gate passes with all existing classes still resolving.
2. [x] **Theme removal** — `main.tsx` drop `initTheme`; delete `lib/theme.ts` +
   `theme-toggle.tsx`; remove usages from both shells; delete `header.theme*` keys in both
   locales. Verify: gate + `rg -n "hearth.theme|initTheme|theme-toggle" apps/web` → empty.
3. [x] **Typography tokens + serif dep** — add the 10 `--text-*` scale entries to `@theme`; remove
   Source Serif 4 import from `index.css` and dep from `package.json`; run `pnpm install` to
   update the lockfile. Verify: gate + `rg -n "source-serif" apps/web apps/web/package.json` →
   empty.
4. [x] **Serif call-site swap** — replace all 21 `font-serif` usages with the new type-scale
   utilities (headings → `text-headline-lg`/`text-headline-md`/`text-title-md` by context;
   page titles keep their hierarchy). Verify: gate + `rg -n "font-serif" apps/web` → empty.
5. [x] **Meta/PWA/favicon** — `index.html` meta theme-color `#131315`; `vite.config.ts` manifest
   `background_color`/`theme_color` `#131315`; favicon fill `#ffb4a4`. Verify: gate +
   `rg -n "#FAF7F2|#C8553D" apps/web` → empty.
6. [x] **Primitives** — `ui/button.tsx` variants (default → `bg-primary-container
   text-on-primary` + glow + `active:scale-[0.98]`; secondary → `bg-surface-container-high`;
   destructive → error-container tokens; outline → `outline-variant` border);
   `form-controls.tsx` `controlClasses` (bg `surface-container-low`, border `outline-variant`,
   focus `primary-container`). Verify: gate.
7. [x] **Shells** — restyle `app-shell` chrome (header/nav `bg-surface/85 backdrop-blur-xl`,
   active nav `text-primary`), `auth-shell`, `brand-mark` fills (primary `#ffb4a4`-mapped
   token), `language-switcher` pill look (keep the `<select>`), `home-illustration` token
   sweep. Verify: gate.
8. [x] **Sign-in restyle** — Screen 1 patterns: hearth emblem in nested circles, bilingual
   headline, email/OTP card, primary CTA with glow, passkey secondary, trust note, terms
   footer. New strings → both locales. Verify: gate.
9. [x] **Onboarding restyle** — segmented 5-step progress (keep `role="progressbar"`), choice
   cards with selected state (`bg-surface-container-highest` + sage indicator), sticky bottom
   continue CTA. New strings → both locales. Verify: gate.
10. [x] **Profile restyle** — hero card, sage verified pill, section cards with inner wells,
    settings rows, danger zone (`error-container`). New strings → both locales. Verify: gate.
11. [x] **Remaining surfaces sweep** — home, not-found, placeholders, loading/error, offline,
    update-prompt, health-card, photo-field: token/serif leftovers, ambient glows. Verify:
    gate.
12. [x] **Final** — full gate one more time plus `pnpm test:e2e` locally (e2e smoke incl. 360px
    overflow + language tests); push branch and confirm CI green; run the `reviewer` subagent
    on the full diff before committing. Verify: e2e + CI green + review findings addressed.
    Status 2026-11-13: gate green, e2e 8/8 local, reviewer clean (2 major + 3 nits fixed),
    committed `deb85dd` on `main`.
    Status 2026-11-14: remote `origin` (github.com/ngeran/hearth) exists; `main` at `535b030`
    already pushed; gate re-run green at HEAD; CI green on `535b030` (run 43589358990).
    `Deploy staging` fails at "Apply staging D1 migrations" — the two GitHub secrets were
    missing at the time (since resolved by the 2026-11-14 move to the ngeran account;
    secrets still to be added), outside this plan's scope.

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

Gotchas: `nixpkgs#glib` resolves to the `bin` output (use `^out`), `libgbm` is its own
package now (not in `mesa`), and systemd libs need the `^*` output selector. Env vars do
not survive between tool calls — build and run in the same shell invocation.

## Definition of done

All 12 boxes ticked, gate green locally, CI green (including e2e smoke), reviewer clean, no
`font-serif`/`hearth.theme`/`#FAF7F2`/`#C8553D` remnants in `apps/web`, `en.json`/`el.json` in
parity, and the M1 screens visually match `docs/design/DESIGN.md`.
