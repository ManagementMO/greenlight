import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  CONDITIONS,
  EXTRACTION_JSON_SCHEMA_V4,
  EXTRACTION_PROMPT_PROFILE_V4,
  extractionPrompt,
  extractionPromptV4,
  extractionSchema,
} from "../../lib/providers/extraction";
import { buildV4TrainingArtifacts } from "../../scripts/ml/generate-v4-training";
import type { LabeledExample } from "../../scripts/ml/generate-data";

const read = (file: string) => readFileSync("data/training/" + file, "utf8");
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const sourceManifest = JSON.parse(read("manifest.json"));
const sourceLabels = read("train-labels.jsonl");
const labels = sourceLabels
  .trim()
  .split("\n")
  .map((line) => JSON.parse(line) as LabeledExample);
const context = labels[0].context;
type Schema = {
  [key: string]: unknown;
  properties?: Record<string, Schema>;
  anyOf?: Schema[];
  required?: string[];
  $ref?: string;
  type?: string;
};
const schema = EXTRACTION_JSON_SCHEMA_V4 as Schema;
function resolveReference(ref: string): Schema {
  expect(
    ref.startsWith("#/"),
    "Only local schema references may reach the prompt",
  ).toBe(true);
  return ref
    .slice(2)
    .split("/")
    .reduce<unknown>(
      (value, part) =>
        (value as Record<string, unknown>)[
          part.replace(/~1/g, "/").replace(/~0/g, "~")
        ],
      schema,
    ) as Schema;
}

describe("versioned v4 output-format contract", () => {
  it("provides a real recursive schema with a scalar condition enum and separate composite nodes", () => {
    const triggerRef = schema.properties!.trigger.anyOf!.find(
      (node) => node.$ref,
    )!.$ref!;
    const trigger = resolveReference(triggerRef);
    const atom = trigger.anyOf!.find(
      (node) => node.properties?.op.const === "ATOM",
    )!;
    const composite = trigger.anyOf!.find((node) => node.properties?.children)!;
    expect(atom.properties!.condition.type).toBe("string");
    expect(atom.properties!.condition.enum).toEqual([...CONDITIONS]);
    expect(atom.required).toEqual(["op", "condition", "subject"]);
    expect(atom.additionalProperties).toBe(false);
    expect(composite.required).toEqual(["op", "children"]);
    expect(composite.properties).not.toHaveProperty("condition");
    expect((composite.properties!.children.items as Schema).$ref).toBe(
      triggerRef,
    );
    expect(composite.additionalProperties).toBe(false);
    function visit(value: unknown) {
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === "object") {
        const node = value as Record<string, unknown>;
        if (typeof node.$ref === "string")
          expect(resolveReference(node.$ref)).toBeDefined();
        Object.values(node).forEach(visit);
      }
    }
    visit(schema);
    expect(extractionSchema.safeParse(labels[0].expected).success).toBe(true);
    expect(
      extractionSchema.safeParse({
        ...labels[0].expected,
        trigger: {
          op: "ATOM",
          condition: ["AGREEMENT_SIGNED"],
          subject: context.subjects[0],
        },
      }).success,
    ).toBe(false);
  });
  it("uses identical substantive evidence rules, explicit scalar guidance, schema and untouched context", () => {
    const prompt = extractionPromptV4(context);
    expect(EXTRACTION_PROMPT_PROFILE_V4).toBe("json-schema-v4");
    expect(prompt).toContain("condition is exactly ONE STRING");
    expect(prompt).toContain(
      "Invoice eligibility does not establish invoice issuance",
    );
    expect(prompt).toContain(
      "customer or an explicitly authorized customer representative",
    );
    expect(prompt).toContain(
      "New material terms are PROPOSED for owner review",
    );
    expect(prompt).toContain('"condition":{"type":"string","enum":');
    expect(prompt).not.toContain('"condition":["AGREEMENT_SIGNED"');
    const embeddedSchema = prompt
      .split("JSON Schema:\n")[1]
      .split("\nSource context:\n")[0];
    expect(JSON.parse(embeddedSchema)).toEqual(EXTRACTION_JSON_SCHEMA_V4);
    expect(JSON.parse(prompt.split("\nSource context:\n")[1])).toEqual(context);
  });
  it("keeps every legacy v3 training byte and legacy prompt reproducible", () => {
    const frozen = {
      "train.jsonl":
        "0b2aade3cb4a4724ede90442943f63919e1ca832c83555aa415bd39f8ddc79f3",
      "proof.jsonl":
        "a31e2f0b1472e18694efa37f8cfd01b8d78b77a5d971a788a97566908a8c14bc",
      "train-labels.jsonl":
        "d201271fd688557d4d9cc0366a21e9c0ff187df0e95af558c60003de4dd974f3",
    };
    for (const [name, hash] of Object.entries(frozen)) {
      expect(sourceManifest.hashes[name]).toBe(hash);
      expect(sha(read(name))).toBe(hash);
    }
    const originalRows = read("train.jsonl")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    for (const [index, row] of originalRows.entries()) {
      expect(row.prompt[0].content).toBe(
        extractionPrompt(labels[index].context),
      );
      expect(JSON.parse(row.completion[0].content)).toEqual(
        labels[index].expected,
      );
    }
  });
  it("changes only the format prompt for all276 training records and the23 original proof selections", () => {
    const generated = buildV4TrainingArtifacts(sourceManifest, sourceLabels);
    const manifest = JSON.parse(read("v4-schema-contract/manifest.json"));
    expect(manifest).toEqual(generated.manifest);
    expect(manifest).toMatchObject({
      dataClassification: "PUBLIC_SYNTHETIC",
      promptProfile: "json-schema-v4",
      trainingCount: 276,
      proofCount: 23,
    });
    expect(generated.files["train-labels.jsonl"]).toBe(sourceLabels);
    for (const [name, content] of Object.entries(generated.files)) {
      expect(read("v4-schema-contract/" + name)).toBe(content);
      expect(sha(content)).toBe(manifest.hashes[name]);
    }
    const trainingRows = generated.files["train.jsonl"]
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    for (const [index, row] of trainingRows.entries()) {
      expect(row.prompt).toEqual([
        { role: "user", content: extractionPromptV4(labels[index].context) },
      ]);
      expect(row.completion).toEqual([
        { role: "assistant", content: JSON.stringify(labels[index].expected) },
      ]);
    }
    const proofRows = generated.files["proof.jsonl"]
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(proofRows).toEqual(
      trainingRows.filter((_, index) => index % 12 === 0),
    );
    expect(readdirSync("data/training/v4-schema-contract")).not.toContain(
      "evaluation.frozen.jsonl",
    );
    expect(() =>
      buildV4TrainingArtifacts(sourceManifest, sourceLabels + " "),
    ).toThrow(/hash/i);
  });
});
