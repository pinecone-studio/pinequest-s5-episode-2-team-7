/**
 * Export the canonical case schema and the topic taxonomy for the Python ML
 * pipeline, so both sides validate against the same definitions.
 */
import { writeFileSync } from "node:fs";
import { z } from "zod";
import { PatientCase } from "../src/lib/cases/schema";
import { TOPICS } from "../src/lib/patient/topics";

const schema = z.toJSONSchema(PatientCase, { io: "input", unrepresentable: "any" });
writeFileSync("data/schema/case.schema.json", JSON.stringify(schema, null, 2) + "\n");

const topics = TOPICS.map((t) => ({
  id: t.id,
  kind: t.kind,
  label: t.label,
  defaultNegative: "defaultNegative" in t ? t.defaultNegative : undefined,
}));
writeFileSync("data/schema/topics.json", JSON.stringify(topics, null, 2) + "\n");
console.log("Wrote data/schema/case.schema.json and data/schema/topics.json");
