// Hearth M5 seed room listings — STAGING ONLY, synthetic data.
//
// Four fixed listings attached to four DIFFERENT seed personas from
// scripts/seed-matches.mjs (the lister rows must already exist: run
// `pnpm seed:matches` first). One active listing per lister mirrors the
// route-level rule the real app enforces. No photos (photo_count 0) — the
// UI renders placeholder panels. Coordinates are NULL: listings inherit
// no geocoding from the lister form (see M5.md, nullable-coords amendment).
//
// Cleanup: DELETE FROM rooms WHERE id LIKE 'seed_%';

import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    ["dry-run"]: { type: "boolean" },
  },
  allowPositionals: false,
});

function isoDateAfter(days) {
  const date = new Date(Date.now() + days * 86_400_000);
  return date.toISOString().slice(0, 10);
}

// Four listings spanning areas, archetypes, rent levels, and bills — the
// lister slugs reference PERSONAS in seed-matches.mjs; keep them in sync.
const LISTINGS = [
  {
    id: "seed_room_nikos-a",
    listerId: "seed_nikos-a",
    title: "Sunny Zografou room next to NTUA",
    description:
      "Second room in our two-bedroom Zografou flat, five minutes from the NTUA gate. The room has a proper desk, a tall window and a small balcony shelf for plants. I keep late hours (master's thesis life) but headphones after midnight are house policy. Kitchen is for real cooking — Sunday meals are a thing here. Looking for a calm, tidy housemate for the academic year.",
    areaLabel: "Zografou, Athens",
    rentEur: 340,
    billsIncluded: true,
    availableFromDays: 10,
  },
  {
    id: "seed_room_eleni-p",
    listerId: "seed_eleni-p",
    title: "Quiet Exarcheia room, early-riser flat",
    description:
      "A bright inner room in a renovated Exarcheia apartment, on a quiet street off the square. We are early risers — quiet by 23:00, coffee and slow mornings on weekends. Shared spaces stay tidy; the kitchen is used mostly for simple meals. Ideal for a student who wants a peaceful base within walking distance of EKPA. Rent excludes electricity and internet.",
    areaLabel: "Exarcheia, Athens",
    rentEur: 380,
    billsIncluded: false,
    availableFromDays: 25,
  },
  {
    id: "seed_room_sofia-r",
    listerId: "seed_sofia-r",
    title: "Calm Ampelokipi apartment, one room free",
    description:
      "One bedroom opening in a calm third-floor Ampelokipi apartment, two minutes from the metro. The flat gets morning light and the living room stays a quiet zone — we read, we cook, we host a friend now and then, nothing louder. Building is residential and the neighbours are lovely, so we keep it that way. Perfect for someone who wants their home to actually feel like one.",
    areaLabel: "Ampelokipi, Athens",
    rentEur: 420,
    billsIncluded: true,
    availableFromDays: 40,
  },
  {
    id: "seed_room_thanos-m",
    listerId: "seed_thanos-m",
    title: "Lively Koukaki flat by the metro",
    description:
      "Room in a roomy Koukaki flat, right between the metro and the Acropolis walk. We are a social household — friends over most weekends, board games, music with the balcony door open. If you like people flowing through and the kitchen being the heart of the home, you will fit right in. Smoking only on the balcony. Available from next month, flexible on exact date.",
    areaLabel: "Koukaki, Athens",
    rentEur: 450,
    billsIncluded: false,
    availableFromDays: 60,
  },
];

function validate(listings) {
  const failures = [];

  for (const listing of listings) {
    if (!listing.id.startsWith("seed_")) {
      failures.push(`${listing.id}: id must start with seed_`);
    }
    if (listing.title.length < 5 || listing.title.length > 80) {
      failures.push(`${listing.id}: title length ${listing.title.length}`);
    }
    if (listing.description.length < 120 || listing.description.length > 2000) {
      failures.push(`${listing.id}: description length ${listing.description.length}`);
    }
    if (listing.rentEur < 50 || listing.rentEur > 5000) {
      failures.push(`${listing.id}: rent ${listing.rentEur}`);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(listing.availableFrom)) {
      failures.push(`${listing.id}: available_from ${listing.availableFrom}`);
    }
    if (listing.areaLabel.length === 0) {
      failures.push(`${listing.id}: empty area label`);
    }
  }

  const listers = new Set(listings.map((listing) => listing.listerId));
  if (listers.size !== listings.length) {
    failures.push("one active listing per lister: duplicate lister found");
  }

  return failures;
}

function sqlString(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

function buildSql(listings, nowSeconds) {
  const lines = [
    "-- Hearth M5 seed room listings — STAGING ONLY, synthetic data.",
    "-- generated by scripts/seed-rooms.mjs",
    "-- prerequisite: pnpm seed:matches (lister users/profiles must exist).",
    "-- cleanup: DELETE FROM rooms WHERE id LIKE 'seed_%';",
    "",
  ];

  for (const listing of listings) {
    lines.push(
      `INSERT OR REPLACE INTO \`rooms\` (\`id\`, \`lister_id\`, \`title\`, \`description\`, \`area_label\`, \`area_lat\`, \`area_lng\`, \`rent_eur\`, \`bills_included\`, \`available_from\`, \`photo_count\`, \`status\`, \`created_at\`, \`updated_at\`) VALUES (${sqlString(listing.id)}, ${sqlString(listing.listerId)}, ${sqlString(listing.title)}, ${sqlString(listing.description)}, ${sqlString(listing.areaLabel)}, NULL, NULL, ${listing.rentEur}, ${listing.billsIncluded ? 1 : 0}, ${sqlString(listing.availableFrom)}, 0, 'active', ${nowSeconds}, ${nowSeconds});`,
      "",
    );
  }

  return `${lines.join("\n")}\n`;
}

const listings = LISTINGS.map((listing) => ({
  ...listing,
  availableFrom: isoDateAfter(listing.availableFromDays),
}));

const failures = validate(listings);

if (failures.length > 0) {
  console.error("Seed validation failed:");
  for (const failure of failures) {
    console.error(`  - ${failure}`);
  }
  process.exit(1);
}

const nowSeconds = Math.floor(Date.now() / 1000);
const sql = buildSql(listings, nowSeconds);

if (values["dry-run"]) {
  process.stdout.write(sql);
  console.error(`dry run: ${listings.length} seed listings, nothing executed.`);
  process.exit(0);
}

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const tempDir = mkdtempSync(join(tmpdir(), "hearth-seed-"));
const sqlFile = join(tempDir, "seed-rooms.sql");

writeFileSync(sqlFile, sql);

console.log(`Seeding ${listings.length} room listings into hearth-db-staging (remote)…`);

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

console.log(
  `Done. Listings: ${listings.map((listing) => `${listing.listerId} (${listing.rentEur}€, ${listing.areaLabel})`).join(", ")}`,
);
console.log("Cleanup with: DELETE FROM rooms WHERE id LIKE 'seed_%';");
