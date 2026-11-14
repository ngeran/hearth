#!/usr/bin/env node
// Seeds synthetic members into the STAGING D1 database only, so the owner can
// exercise /api/v1/matches end-to-end. Deterministic for a given (seed, run
// day): mulberry32 drives every random choice, mirroring scripts/sim.mjs.
// Cleanup is one cascading line (profiles FK ON DELETE CASCADE):
//   DELETE FROM users WHERE id LIKE 'seed_%';
// Run with --dry-run to print the SQL instead of executing it.

import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    count: { type: "string", default: "12" },
    seed: { type: "string", default: "42" },
    "dry-run": { type: "boolean", default: false },
  },
  allowPositionals: false,
});

const count = Number.parseInt(values.count, 10);
const seed = Number.parseInt(values.seed, 10);

if (!Number.isInteger(count) || count < 1) {
  console.error("--count must be a positive integer.");
  process.exit(1);
}
if (!Number.isInteger(seed)) {
  console.error("--seed must be an integer.");
  process.exit(1);
}

function mulberry32(initialSeed) {
  let state = initialSeed >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

const random = mulberry32(seed);

// Coarsened (2 decimals, like the app stores) Athens-cluster coordinates, so
// every seed is within the ±0.05 area gate of the others and of an owner who
// picked any central-Athens area.
const AREAS = [
  { label: "Zografou, Athens", lat: 37.97, lng: 23.78 },
  { label: "Koukaki, Athens", lat: 37.97, lng: 23.73 },
  { label: "Exarcheia, Athens", lat: 37.98, lng: 23.73 },
  { label: "Ampelokipi, Athens", lat: 37.98, lng: 23.76 },
  { label: "Patisia, Athens", lat: 38.0, lng: 23.74 },
];

const QUESTION_IDS = [
  "social-gatherings",
  "social-weeknights",
  "clean-tidy",
  "clean-shared",
  "kitchen-cooking",
  "kitchen-sharing",
  "quiet-schedule",
  "quiet-noise",
  "guests-overnight",
  "guests-partner",
];

// Twelve hand-authored personas covering all five archetypes. The expected
// archetype per persona is hand-verified against deriveLifestyleArchetype
// (packages/shared/src/lifestyle.ts): night-owl-haven needs quiet-schedule 2
// with a social score ≤ 2; quiet-mornings needs social ≤ 1 with schedule 0;
// calm-sanctuary social ≤ 1 with schedule 1; steady-rhythm social exactly 2
// and schedule ≠ 2 (schedule 2 with social 2 is intercepted by night-owl);
// open-door social ≥ 3.
const PERSONAS = [
  {
    slug: "nikos-a",
    displayName: "Nikos A.",
    area: AREAS[0],
    campusId: "campus-ntua",
    lifeStage: "student",
    language: "el",
    bio: "Master's student at NTUA. I keep a small desk lamp on late and cook proper meals on Sundays. Looking for a calm place in Zografou with a balcony for my plants.",
    answers: {
      "social-gatherings": 0,
      "social-weeknights": 1,
      "clean-tidy": 0,
      "clean-shared": 1,
      "kitchen-cooking": 0,
      "kitchen-sharing": 2,
      "quiet-schedule": 2,
      "quiet-noise": 2,
      "guests-overnight": 1,
      "guests-partner": 1,
    },
    expectedArchetype: "night-owl-haven",
  },
  {
    slug: "maria-k",
    displayName: "Μαρία Κ.",
    area: AREAS[1],
    campusId: null,
    lifeStage: "independent",
    language: "el",
    bio: "I work remotely in design and start my day with coffee at seven. Tidy by habit, quiet by nature, and I like coming home to a peaceful flat after a long week.",
    answers: {
      "social-gatherings": 1,
      "social-weeknights": 1,
      "clean-tidy": 0,
      "clean-shared": 1,
      "kitchen-cooking": 1,
      "kitchen-sharing": 1,
      "quiet-schedule": 2,
      "quiet-noise": 1,
      "guests-overnight": 1,
      "guests-partner": 0,
    },
    expectedArchetype: "night-owl-haven",
  },
  {
    slug: "eleni-p",
    displayName: "Ελένη Π.",
    area: AREAS[2],
    campusId: null,
    lifeStage: "independent",
    language: "el",
    bio: "Postgraduate at NKUA, literature department. Weekdays are for the library; weekends are for long walks and film photography. I clean as I go and respect shared spaces.",
    answers: {
      "social-gatherings": 0,
      "social-weeknights": 0,
      "clean-tidy": 0,
      "clean-shared": 0,
      "kitchen-cooking": 1,
      "kitchen-sharing": 1,
      "quiet-schedule": 0,
      "quiet-noise": 0,
      "guests-overnight": 0,
      "guests-partner": 0,
    },
    expectedArchetype: "quiet-mornings",
  },
  {
    slug: "dimitris-v",
    displayName: "Δημήτρης Β.",
    area: AREAS[0],
    campusId: "campus-ntua",
    lifeStage: "student",
    language: "el",
    bio: "Fourth-year civil engineering student. My schedule flips between early lectures and late lab nights. Easy-going, communicative, and I never leave dishes for the morning.",
    answers: {
      "social-gatherings": 0,
      "social-weeknights": 1,
      "clean-tidy": 1,
      "clean-shared": 0,
      "kitchen-cooking": 2,
      "kitchen-sharing": 1,
      "quiet-schedule": 0,
      "quiet-noise": 1,
      "guests-overnight": 1,
      "guests-partner": 1,
    },
    expectedArchetype: "quiet-mornings",
  },
  {
    slug: "sofia-r",
    displayName: "Sofia R.",
    area: AREAS[3],
    campusId: null,
    lifeStage: "first-time-mover",
    language: "el",
    bio: "Musician and part-time barista. I practice with headphones after nine, host friends maybe twice a month, and believe the kitchen should always smell like something good.",
    answers: {
      "social-gatherings": 0,
      "social-weeknights": 1,
      "clean-tidy": 1,
      "clean-shared": 1,
      "kitchen-cooking": 0,
      "kitchen-sharing": 1,
      "quiet-schedule": 1,
      "quiet-noise": 1,
      "guests-overnight": 1,
      "guests-partner": 1,
    },
    expectedArchetype: "calm-sanctuary",
  },
  {
    slug: "alex-kim",
    displayName: "Alex Kim",
    area: AREAS[1],
    campusId: null,
    lifeStage: "independent",
    language: "en",
    bio: "Data analyst, new to Athens. Gym in the mornings, cooking in the evenings. I value a quiet home base but I am happy to share a meal and a story now and then.",
    answers: {
      "social-gatherings": 0,
      "social-weeknights": 0,
      "clean-tidy": 2,
      "clean-shared": 1,
      "kitchen-cooking": 0,
      "kitchen-sharing": 2,
      "quiet-schedule": 1,
      "quiet-noise": 0,
      "guests-overnight": 0,
      "guests-partner": 1,
    },
    expectedArchetype: "calm-sanctuary",
  },
  {
    slug: "giannis-s",
    displayName: "Γιάννης Σ.",
    area: AREAS[2],
    campusId: null,
    lifeStage: "first-time-mover",
    language: "el",
    bio: "Erasmus student from Italy, six months in Athens. I am curious, tidy enough, and I bring dessert. Looking for friendly flatmates near the centre or the campus.",
    answers: {
      "social-gatherings": 1,
      "social-weeknights": 0,
      "clean-tidy": 1,
      "clean-shared": 2,
      "kitchen-cooking": 2,
      "kitchen-sharing": 0,
      "quiet-schedule": 1,
      "quiet-noise": 2,
      "guests-overnight": 2,
      "guests-partner": 1,
    },
    expectedArchetype: "calm-sanctuary",
  },
  {
    slug: "mara-p",
    displayName: "Mara P.",
    area: AREAS[0],
    campusId: "campus-ntua",
    lifeStage: "student",
    language: "el",
    bio: "PhD candidate in biology. Early riser, weekend hiker, plant collector. I keep common areas spotless and my noise level library-appropriate after ten at night.",
    answers: {
      "social-gatherings": 1,
      "social-weeknights": 1,
      "clean-tidy": 0,
      "clean-shared": 0,
      "kitchen-cooking": 1,
      "kitchen-sharing": 1,
      "quiet-schedule": 0,
      "quiet-noise": 0,
      "guests-overnight": 0,
      "guests-partner": 0,
    },
    expectedArchetype: "steady-rhythm",
  },
  {
    slug: "kostas-l",
    displayName: "Κώστας Λ.",
    area: AREAS[4],
    campusId: null,
    lifeStage: "independent",
    language: "el",
    bio: "Front-end developer, fully remote. Night owl with headphones always on. I cook big pots of food, share them happily, and tidy the kitchen right after dinner.",
    answers: {
      "social-gatherings": 1,
      "social-weeknights": 1,
      "clean-tidy": 1,
      "clean-shared": 1,
      "kitchen-cooking": 0,
      "kitchen-sharing": 2,
      "quiet-schedule": 1,
      "quiet-noise": 1,
      "guests-overnight": 1,
      "guests-partner": 2,
    },
    expectedArchetype: "steady-rhythm",
  },
  {
    slug: "iris-d",
    displayName: "Iris D.",
    area: AREAS[3],
    campusId: null,
    lifeStage: "first-time-mover",
    language: "en",
    bio: "Marketing graduate, first flat away from home. Still learning the cooking part, already good at the cleaning part. Cheerful, respectful, always up for a board game.",
    answers: {
      "social-gatherings": 0,
      "social-weeknights": 2,
      "clean-tidy": 0,
      "clean-shared": 1,
      "kitchen-cooking": 2,
      "kitchen-sharing": 1,
      "quiet-schedule": 1,
      "quiet-noise": 1,
      "guests-overnight": 1,
      "guests-partner": 0,
    },
    expectedArchetype: "steady-rhythm",
  },
  {
    slug: "thanos-m",
    displayName: "Θάνος Μ.",
    area: AREAS[1],
    campusId: null,
    lifeStage: "independent",
    language: "el",
    bio: "Architect working at a small studio in Koukaki. I love hosting a Sunday brunch but keep weeknights quiet and slow. Organisation is my love language at home.",
    answers: {
      "social-gatherings": 2,
      "social-weeknights": 2,
      "clean-tidy": 0,
      "clean-shared": 1,
      "kitchen-cooking": 0,
      "kitchen-sharing": 0,
      "quiet-schedule": 1,
      "quiet-noise": 1,
      "guests-overnight": 2,
      "guests-partner": 2,
    },
    expectedArchetype: "open-door",
  },
  {
    slug: "lena-f",
    displayName: "Lena F.",
    area: AREAS[2],
    campusId: "campus-aueb",
    lifeStage: "student",
    language: "el",
    bio: "Undergraduate at AUEB, part-time tutor. Balanced week: lectures, gym, two nights out at most. I wash up immediately and I expect the same courtesy back.",
    answers: {
      "social-gatherings": 2,
      "social-weeknights": 1,
      "clean-tidy": 0,
      "clean-shared": 0,
      "kitchen-cooking": 1,
      "kitchen-sharing": 1,
      "quiet-schedule": 0,
      "quiet-noise": 1,
      "guests-overnight": 1,
      "guests-partner": 1,
    },
    expectedArchetype: "open-door",
  },
];

function isoDateAfter(days) {
  const today = new Date();
  const base = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return new Date(base + days * 86_400_000).toISOString().slice(0, 10);
}

function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function buildMembers() {
  const members = [];

  for (let index = 0; index < count; index += 1) {
    const base = PERSONAS[index % PERSONAS.length];
    const extra = index >= PERSONAS.length;

    // Extras (count > 12) perturb one answer of a cloned persona so the
    // archetype spread still starts from the hand-verified sets.
    const answers = { ...base.answers };
    if (extra) {
      const questionId = QUESTION_IDS[Math.floor(random() * QUESTION_IDS.length)];
      const shifted = answers[questionId] + (random() < 0.5 ? -1 : 1);
      answers[questionId] = Math.min(2, Math.max(0, shifted));
    }

    const budgetMin = 250 + 50 * Math.floor(random() * 5);
    const budgetMax = budgetMin + 50 * (1 + Math.floor(random() * 4));
    const moveInFromDays = Math.floor(random() * 45);
    const moveInToDays = moveInFromDays + 90 + Math.floor(random() * 120);
    const seeking = random() < 0.8 ? "roommate" : "either";

    members.push({
      id: `seed_${base.slug}${extra ? `-${index}` : ""}`,
      email: `${base.slug}${extra ? `.${index}` : ""}@seed.hearth.test`,
      displayName: extra ? `${base.displayName} ${index}` : base.displayName,
      areaLabel: base.area.label,
      areaLat: base.area.lat,
      areaLng: base.area.lng,
      campusId: base.campusId,
      lifeStage: base.lifeStage,
      language: base.language,
      bio: base.bio,
      seeking,
      budgetMin,
      budgetMax,
      moveInFrom: isoDateAfter(moveInFromDays),
      moveInTo: isoDateAfter(moveInToDays),
      answers,
      expectedArchetype: base.expectedArchetype,
    });
  }

  return members;
}

function validate(members) {
  const failures = [];

  for (const member of members) {
    if (member.displayName.length < 2 || member.displayName.length > 50) {
      failures.push(`${member.id}: display name length`);
    }
    if (member.bio.length < 120 || member.bio.length > 300) {
      failures.push(`${member.id}: bio length ${member.bio.length}`);
    }
    if (member.budgetMin > member.budgetMax || member.budgetMax > 700) {
      failures.push(`${member.id}: budget range`);
    }
    if (member.moveInFrom >= member.moveInTo) {
      failures.push(`${member.id}: move-in window`);
    }
    for (const questionId of QUESTION_IDS) {
      const level = member.answers[questionId];
      if (level !== 0 && level !== 1 && level !== 2) {
        failures.push(`${member.id}: answer ${questionId}=${level}`);
      }
    }
  }

  if (members.length >= PERSONAS.length) {
    const archetypes = new Set(members.slice(0, PERSONAS.length).map((m) => m.expectedArchetype));
    if (archetypes.size !== 5) {
      failures.push(`persona archetype coverage: ${archetypes.size}/5`);
    }
  }

  return failures;
}

function buildSql(members, nowSeconds) {
  const lines = [
    "-- Hearth M3 seed members — STAGING ONLY, synthetic data.",
    `-- generated by scripts/seed-matches.mjs --count ${count} --seed ${seed}`,
    "-- cleanup: DELETE FROM users WHERE id LIKE 'seed_%';",
    "",
  ];

  for (const member of members) {
    // photo_key sentinel: completeness requires a photo, but M3 shows initials
    // avatars only and nothing ever fetches seed photos.
    lines.push(
      `INSERT OR REPLACE INTO \`users\` (\`id\`, \`email\`, \`name\`, \`email_verified\`, \`created_at\`, \`updated_at\`) VALUES (${sqlString(member.id)}, ${sqlString(member.email)}, ${sqlString(member.displayName)}, 1, ${nowSeconds}, ${nowSeconds});`,
      `INSERT OR REPLACE INTO \`profiles\` (\`user_id\`, \`display_name\`, \`photo_key\`, \`area_label\`, \`area_lat\`, \`area_lng\`, \`move_in_from\`, \`move_in_to\`, \`budget_min\`, \`budget_max\`, \`seeking\`, \`life_stage\`, \`campus_id\`, \`language\`, \`bio\`, \`lifestyle_json\`, \`age_confirmed\`, \`onboarding_completed_at\`, \`created_at\`, \`updated_at\`) VALUES (${sqlString(member.id)}, ${sqlString(member.displayName)}, ${sqlString("seed-matches/placeholder.svg")}, ${sqlString(member.areaLabel)}, ${member.areaLat}, ${member.areaLng}, ${sqlString(member.moveInFrom)}, ${sqlString(member.moveInTo)}, ${member.budgetMin}, ${member.budgetMax}, ${sqlString(member.seeking)}, ${sqlString(member.lifeStage)}, ${member.campusId ? sqlString(member.campusId) : "NULL"}, ${sqlString(member.language)}, ${sqlString(member.bio)}, ${sqlString(JSON.stringify({ version: 1, answers: member.answers }))}, 1, ${nowSeconds}, ${nowSeconds}, ${nowSeconds});`,
      "",
    );
  }

  return `${lines.join("\n")}\n`;
}

const members = buildMembers();
const failures = validate(members);

if (failures.length > 0) {
  console.error("Seed validation failed:");
  for (const failure of failures) {
    console.error(`  - ${failure}`);
  }
  process.exit(1);
}

const nowSeconds = Math.floor(Date.now() / 1000);
const sql = buildSql(members, nowSeconds);

if (values["dry-run"]) {
  process.stdout.write(sql);
  console.error(`dry run: ${members.length} seed members (seed ${seed}), nothing executed.`);
  process.exit(0);
}

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const tempDir = mkdtempSync(join(tmpdir(), "hearth-seed-"));
const sqlFile = join(tempDir, "seed-matches.sql");

writeFileSync(sqlFile, sql);

console.log(`Seeding ${members.length} members into hearth-db-staging (remote)…`);

const result = spawnSync(
  "corepack",
  [
    "pnpm",
    "exec",
    "wrangler",
    "d1",
    "execute",
    "hearth-db-staging",
    "--remote",
    "--env",
    "staging",
    "--config",
    "wrangler.jsonc",
    "--file",
    sqlFile,
  ],
  { stdio: "inherit", cwd: repoRoot },
);

rmSync(tempDir, { recursive: true, force: true });

if (result.status !== 0) {
  console.error("Seed execution failed.");
  process.exit(result.status ?? 1);
}

const archetypeCounts = new Map();
for (const member of members.slice(0, PERSONAS.length)) {
  archetypeCounts.set(
    member.expectedArchetype,
    (archetypeCounts.get(member.expectedArchetype) ?? 0) + 1,
  );
}

console.log(
  `Done. Persona archetype coverage: ${[...archetypeCounts].map(([k, v]) => `${k}×${v}`).join(", ")}`,
);
console.log("Cleanup any time with: DELETE FROM users WHERE id LIKE 'seed_%';");
