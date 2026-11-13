import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const languages = ["en", "el"];
const localeDirectory = resolve(process.cwd(), "apps/web/src/locales");

function flattenKeys(value, prefix = "", keys = []) {
  for (const [key, child] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;

    if (child && typeof child === "object" && !Array.isArray(child)) {
      flattenKeys(child, path, keys);
    } else {
      keys.push({ path, value: child });
    }
  }

  return keys;
}

function placeholders(value) {
  if (typeof value !== "string") {
    return [];
  }

  return [...value.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)]
    .map((match) => match[1])
    .filter((name) => name !== undefined)
    .sort();
}

const locales = new Map();

for (const language of languages) {
  const file = resolve(localeDirectory, `${language}.json`);
  const contents = JSON.parse(await readFile(file, "utf8"));
  const entries = flattenKeys(contents);
  locales.set(language, new Map(entries.map((entry) => [entry.path, entry.value])));
}

const allKeys = new Set();
for (const entries of locales.values()) {
  for (const key of entries.keys()) {
    allKeys.add(key);
  }
}

const problems = [];

for (const key of [...allKeys].sort()) {
  const present = languages.filter((language) => locales.get(language)?.has(key));

  if (present.length !== languages.length) {
    const missingFrom = languages.filter((language) => !present.includes(language));
    problems.push(`${key}: missing from ${missingFrom.join(", ")}`);
    continue;
  }

  const placeholderSets = languages.map((language) => ({
    language,
    values: placeholders(locales.get(language)?.get(key)),
  }));
  const expected = placeholderSets[0]?.values.join("|") ?? "";

  for (const entry of placeholderSets.slice(1)) {
    if (entry.values.join("|") !== expected) {
      problems.push(`${key}: interpolation placeholders differ in ${entry.language}`);
    }
  }
}

if (problems.length > 0) {
  console.error("Locale parity check failed:\n");
  for (const problem of problems) {
    console.error(`- ${problem}`);
  }
  process.exitCode = 1;
} else {
  console.log(`Locale parity check passed: ${allKeys.size} keys in ${languages.join(" and ")}.`);
}
