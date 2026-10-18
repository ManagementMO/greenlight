import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { validateExtraction } from "../../lib/providers/extraction";
import {
  scoreExtraction,
  summarizeExtraction,
} from "../../lib/providers/evaluation";
const read = (path: string) => readFileSync("data/training/" + path, "utf8");
const evaluation = read("evaluation.frozen.jsonl")
  .trim()
  .split("\n")
  .map((x) => JSON.parse(x));
describe("independent extraction evaluator", () => {
  it("freezes semantic holdout families and independently validates every label", () => {
    const manifest = JSON.parse(read("manifest.json"));
    expect(
      createHash("sha256")
        .update(read("evaluation.frozen.jsonl"))
        .digest("hex"),
    ).toBe(manifest.hashes["evaluation.frozen.jsonl"]);
    const train = read("train-labels.jsonl")
      .trim()
      .split("\n")
      .map((x) => JSON.parse(x));
    expect(train).toHaveLength(240);
    expect(evaluation).toHaveLength(32);
    expect(
      train.filter(
        (x) => x.expected.due?.kind === "CALENDAR_DAYS_AFTER_INVOICE_ISSUED",
      ),
    ).toHaveLength(48);
    expect(
      evaluation.filter(
        (x) => x.expected.due?.kind === "CALENDAR_DAYS_AFTER_INVOICE_ISSUED",
      ),
    ).toHaveLength(8);
    const families = new Set(train.map((x) => x.family)),
      companies = new Set(train.map((x) => x.companyId));
    for (const row of evaluation) {
      expect(families.has(row.family)).toBe(false);
      expect(companies.has(row.companyId)).toBe(false);
      expect(validateExtraction(row.expected, row.context)).toEqual(
        row.expected,
      );
    }
    for (const row of train)
      expect(validateExtraction(row.expected, row.context)).toEqual(
        row.expected,
      );
  });
  it("scores commutative semantic trees equally without accepting unsupported completion", () => {
    const example = evaluation.find((x) => x.expected.trigger?.op === "ALL");
    const target = structuredClone(example.expected);
    target.trigger.children.reverse();
    expect(
      scoreExtraction(JSON.stringify(target), example.context, example.expected)
        .materialExact,
    ).toBe(true);
    target.due.days += 1;
    expect(
      scoreExtraction(JSON.stringify(target), example.context, example.expected)
        .unsafeProposed,
    ).toBe(true);
  });
  it("counts invalid JSON and abstention instead of rewarding every fallback", () => {
    const example = evaluation[0];
    const invalid = scoreExtraction(
      "I am done",
      example.context,
      example.expected,
    );
    const abstain = scoreExtraction(
      JSON.stringify({
        ...example.expected,
        status: "AMBIGUOUS",
        trigger: null,
        due: null,
        issues: ["unsure"],
      }),
      example.context,
      example.expected,
    );
    const summary = summarizeExtraction([invalid, abstain]);
    expect(summary.count).toBe(2);
    expect(summary.valid).toBe(1);
    expect(summary.materialExact).toBe(0);
    expect(summary.automaticCoverage).toBe(0);
    expect(summary.proposedPrecision).toBeNull();
  });
});
