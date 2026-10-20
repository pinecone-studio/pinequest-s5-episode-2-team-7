/**
 * Validate case JSON files against the canonical schema.
 *   npm run cases:validate                 # all files in data/cases
 *   npm run cases:validate -- path/a.json  # specific files
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { validateCase } from "../src/lib/cases/schema";

const args = process.argv.slice(2);
const files = args.length > 0 ? args : readdirSync("data/cases").filter((f) => f.endsWith(".json")).map((f) => join("data/cases", f));

let failed = 0;
for (const file of files) {
  let json: unknown;
  try {
    json = JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    failed++;
    console.error(`✗ ${file}: invalid JSON — ${(error as Error).message}`);
    continue;
  }
  const result = validateCase(json);
  if (result.ok) {
    const c = result.case;
    console.log(`✓ ${file}  (${c.id}: ${c.hidden.facts.length} facts, ${c.rubric.items.length} rubric items)`);
  } else {
    failed++;
    console.error(`✗ ${file}`);
    for (const issue of result.issues) console.error(`    ${issue.path}: ${issue.message}`);
  }
}
if (failed > 0) {
  console.error(`\n${failed} file(s) failed validation.`);
  process.exit(1);
}
