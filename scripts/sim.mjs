import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    users: { type: "string", default: "200" },
    seed: { type: "string", default: "42" },
  },
  allowPositionals: false,
});

const userCount = Number.parseInt(values.users, 10);
const seed = Number.parseInt(values.seed, 10);

if (!Number.isInteger(userCount) || userCount < 1) {
  console.error("--users must be a positive integer.");
  process.exit(1);
}

if (!Number.isInteger(seed)) {
  console.error("--seed must be an integer.");
  process.exit(1);
}

const archetypes = [
  "night-owl",
  "early-bird",
  "tidy",
  "relaxed",
  "social",
  "private",
  "first-time-mover",
];

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
const counts = new Map(archetypes.map((archetype) => [archetype, 0]));

for (let index = 0; index < userCount; index += 1) {
  const archetype = archetypes[Math.floor(random() * archetypes.length)];
  counts.set(archetype, (counts.get(archetype) ?? 0) + 1);
}

const householdCount = Math.floor(userCount * 0.15);
const groupCount = Math.floor(userCount * 0.1);

console.log("Hearth simulation harness — M0 foundation");
console.log(`seed: ${seed}`);
console.log(`synthetic users: ${userCount}`);
console.log(`synthetic households: ${householdCount}`);
console.log(`synthetic groups: ${groupCount}`);
console.log("archetype mix:");

for (const [archetype, count] of counts) {
  console.log(`  ${archetype.padEnd(18)} ${count}`);
}

console.log(
  "\nThe deterministic matching engine, score distribution and dealbreaker statistics arrive in milestone 3.",
);
