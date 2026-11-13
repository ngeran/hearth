# Hearth Design System (canonical)

Source: the DESIGN.md spec supplied on 2026-11-13 plus the 15 Stitch-generated reference
screens. Where the original DESIGN.md prose and its YAML tokens disagreed, the **YAML tokens
win** — they are what the Stitch screens implement. This file is the single source of truth
for the visual system; the app must match the Stitch screens.

Resolved decisions (2026-11-13):

- Dark-only OLED theme. The system/light/dark tri-state and the light-mode terracotta
  (`#C8553D`/`#B44530`) tokens are retired.
- Inter-only typography. Source Serif 4 is retired.
- Restyle scope is the existing M1 screens only (sign-in, onboarding, profile, settings,
  shared shell). Later-milestone screens adopt the system when they are built.

## Colors (dark-only)

| Token                                      | Hex       |
| ------------------------------------------ | --------- |
| surface, surface-dim, background           | `#131315` |
| surface-bright                             | `#39393b` |
| surface-container-lowest                   | `#0e0e10` |
| surface-container-low                      | `#1c1b1d` |
| surface-container                          | `#201f21` |
| surface-container-high                     | `#2a2a2c` |
| surface-container-highest, surface-variant | `#353437` |
| on-surface, on-background, inverse-surface | `#e5e1e4` |
| on-surface-variant                         | `#dec0b9` |
| inverse-on-surface                         | `#313032` |
| outline                                    | `#a68b85` |
| outline-variant                            | `#57423d` |
| surface-tint, primary, primary-fixed-dim   | `#ffb4a4` |
| on-primary                                 | `#640d00` |
| primary-container                          | `#e76b51` |
| on-primary-container                       | `#580a00` |
| inverse-primary                            | `#a53b25` |
| secondary, secondary-fixed-dim             | `#a7d0b0` |
| on-secondary                               | `#123721` |
| secondary-container                        | `#2c5138` |
| on-secondary-container                     | `#9ac2a2` |
| tertiary, tertiary-fixed-dim               | `#f9bb61` |
| on-tertiary                                | `#452b00` |
| tertiary-container                         | `#bd8632` |
| on-tertiary-container                      | `#3c2500` |
| error                                      | `#ffb4ab` |
| on-error                                   | `#690005` |
| error-container                            | `#93000a` |
| on-error-container                         | `#ffdad6` |
| primary-fixed                              | `#ffdad3` |
| on-primary-fixed                           | `#3e0500` |
| on-primary-fixed-variant                   | `#852310` |
| secondary-fixed                            | `#c3edcb` |
| on-secondary-fixed                         | `#00210e` |
| on-secondary-fixed-variant                 | `#2a4e36` |
| tertiary-fixed                             | `#ffddb3` |
| on-tertiary-fixed                          | `#291800` |
| on-tertiary-fixed-variant                  | `#633f00` |

## Typography (Inter only, weights 400/500/600)

| Style             | Size/Line | Weight | Tracking |
| ----------------- | --------- | ------ | -------- |
| display-lg        | 32/40     | 600    | -0.02em  |
| display-lg-mobile | 28/36     | 600    | -0.02em  |
| headline-lg       | 24/32     | 600    | -0.015em |
| headline-md       | 20/28     | 600    | -0.01em  |
| title-md          | 18/24     | 600    | —        |
| body-lg           | 16/24     | 400    | —        |
| body-md           | 14/20     | 400    | —        |
| label-lg          | 14/20     | 500    | 0.01em   |
| label-md          | 12/16     | 500    | 0.02em   |
| label-sm          | 11/14     | 500    | 0.02em   |

## Radii

- sm `0.5rem` (8px), DEFAULT `1rem` (16px, controls/inputs/buttons), md `1.5rem` (24px,
  cards/containers), lg `2rem`, xl `3rem`, full `9999px` (pills/badges).

## Spacing

- gutter `1rem`, margin `1.25rem` (outer screen margins, `px-margin`), space-xs `0.25rem`,
  space-sm `0.5rem`, space-md `1rem`, space-lg `1.5rem`, space-xl `2rem`.
- Mobile-first 390px; reading column caps at `max-w-[480px] mx-auto`; touch targets
  ≥ 44×44px.

## Depth and glow

- No hard shadows; depth via tonal surface-container stacking.
- Card shadow: `0 12px 28px -6px rgba(0,0,0,0.45)`.
- Terracotta button glow: `0 8px 24px -4px rgba(226,103,77,0.28)`.
- Ambient glows: absolutely-positioned `rounded-full bg-primary-container/10 blur-2xl`
  blobs, `pointer-events-none`.

## Component conventions (from the Stitch screens)

- Primary button: `bg-primary-container text-on-primary rounded-xl h-11/12 font-semibold
  active:scale-[0.98]` (min 44–48px). Secondary: `bg-surface-container-high`.
- Cards: `rounded-2xl bg-surface-container p-4/p-5`; inner wells `bg-surface-container-lowest`.
- Pills/chips: `rounded-full`; matched-trait chips `bg-secondary-container/20
  text-on-secondary-container`.
- Bilingual copy pattern: Greek primary + English secondary in `text-on-surface-variant`.
- Screen header (stack screens): fixed, `pt-safe bg-surface/85 backdrop-blur-xl`, h-16,
  `px-margin`; back button w-11 h-11 rounded-full; eyebrow `Hearth` label-sm uppercase
  text-primary + title-md h1; right side = EN/EL language pill + avatar/bell.
- Tab screens: same header + fixed bottom nav h-20 `pb-safe bg-surface/85
  backdrop-blur-xl`; 4 tabs (Matches `local_fire_department`, Rooms `meeting_room`,
  Messages `chat_bubble`, Profile `account_circle`), active = text-primary + FILL 1.
- Content area: `px-margin pt-16 pb-28` (tab) with `max-w-[480px] mx-auto` where noted.

## Reference screens

Fifteen Stitch HTML screens were supplied in-chat on 2026-11-13 (original files not yet in
the repo — drop them under `docs/design/reference/` if available). M1-relevant:

1. **Welcome & Sign-In** — centered hearth flame emblem in nested circles, "Hearth • Εστία"
   badge, display-lg-mobile bilingual headline, EL/EN segmented pill, sign-in card (email
   input + "Αποστολή 6-ψήφιου κωδικού" primary + passkey button), trust card, terms footer.
2. **Life Stage & Campus (onboarding step 1/5)** — 20% 5-segment progress bar; 4 stage
   radio cards (Φοιτητής default-selected w/ sage check + `primary-container/20` icon +
   ring; Πρώτη φορά εκτός σπιτιού; Ήδη αυτόνομος; Εργαζόμενος/Άλλο), GR title + EN label;
   campus picker (search + quick pills EKPA/NTUA/AUEB/AUTH/Patras); sticky bottom
   "Συνέχεια" primary-container min-h-[52px] + "Πίσω".
3. **What We Learned About You** — privacy pill ("Ιδιωτικό" sage); hero archetype card
   rounded-[24px] w/ dual ambient glows, hearth SVG badge (flame `#ffb4a4`), "Γαλήνιο
   Καταφύγιο / Calm Sanctuary", reflection paragraph, 3 trait chips; 5 dimension cards
   (Κοινωνικός Ρυθμός, Καθαριότητα, Κουζίνας, Ώρες Ύπνου, Επισκέπτες) each w/ edit button +
   inner well (GR body + EN label-md); reassurance card w/ "Επιβεβαίωση & Αναζήτηση"
   primary CTA + "Επαναφορά Όλων" secondary.
4. **Student Profile** — hero card (avatar w/ school badge, name + age pill, dept,
   "Επαληθευμένη Φοιτήτρια ΕΚΠΑ" sage pill, bio quote, micro-trait chips); rhythm shortcut
   banner w/ habit bars; vouches section; settings list rows (Γλώσσα, Ειδοποιήσεις,
   Απόρρητο & Εξαγωγή, Υποστήριξη); danger zone (Διαγραφή Λογαριασμού).

Later-milestone (out of current scope, listed for context): Vibe Card, Ideal Week,
Atmosphere Dial, Dealbreakers, Matches, Compatibility Report, Rooms, Intro Requests,
Chat + Pair Game, First Home Kit, Report/Block & States.
