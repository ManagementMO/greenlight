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
    expect(train).toHaveLength(276);
    expect(evaluation).toHaveLength(40);
    expect(
      train.filter(
        (x) => x.expected.due?.kind === "CALENDAR_DAYS_AFTER_INVOICE_ISSUED",
      ),
    ).toHaveLength(84);
    expect(
      evaluation.filter(
        (x) => x.expected.due?.kind === "CALENDAR_DAYS_AFTER_INVOICE_ISSUED",
      ),
    ).toHaveLength(16);
    expect(read("train-labels.jsonl")).not.toContain(
      '"condition":"CERTIFICATE_RECEIVED"',
    );
    expect(read("evaluation.frozen.jsonl")).not.toContain(
      '"condition":"CERTIFICATE_RECEIVED"',
    );
    const recipientNegatives = evaluation.filter(
      (x) =>
        x.family.includes("noncustomer_receipt") ||
        x.family.includes("undisclosed_receipt"),
    );
    expect(recipientNegatives).toHaveLength(8);
    expect(
      recipientNegatives.every(
        (x) => x.expected.trigger === null && x.expected.status !== "PROPOSED",
      ),
    ).toBe(true);
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
    expect(summary.rawProposalRate).toBe(0);
    expect(summary.correctSupportedProposals).toBe(0);
    expect(summary.correctSupportedProposalRate).toBe(0);
    expect(summary.proposedPrecision).toBeNull();
  });
  it("separates raw review volume from correctly supported proposals and retains invalid cases in class denominators", () => {
    const supported = evaluation.find((x) => x.expected.status === "PROPOSED");
    const ambiguous = evaluation.find((x) => x.expected.status === "AMBIGUOUS");
    const unsupported = evaluation.find(
      (x) => x.expected.status === "UNSUPPORTED",
    );
    const wrongTerms = structuredClone(supported.expected);
    wrongTerms.due.days++;
    const wrongStatus = { ...unsupported.expected, status: "AMBIGUOUS" };
    const invalid = scoreExtraction(
      "invalid JSON",
      supported.context,
      supported.expected,
    );
    expect(invalid.expectedStatus).toBe("PROPOSED");
    const summary = summarizeExtraction([
      scoreExtraction(
        JSON.stringify(supported.expected),
        supported.context,
        supported.expected,
      ),
      scoreExtraction(
        JSON.stringify(wrongTerms),
        supported.context,
        supported.expected,
      ),
      invalid,
      scoreExtraction(
        JSON.stringify(ambiguous.expected),
        ambiguous.context,
        ambiguous.expected,
      ),
      scoreExtraction(
        JSON.stringify(wrongStatus),
        unsupported.context,
        unsupported.expected,
      ),
    ]);
    expect(summary.expectedProposed).toBe(3);
    expect(summary.correctSupportedProposals).toBe(1);
    expect(summary.correctSupportedProposalRate).toBe(1 / 3);
    expect(summary.rawProposalRate).toBe(2 / 5);
    expect(summary.proposedPrecision).toBe(1 / 2);
    expect(summary.unsafeProposed).toBe(1);
    expect(summary.byExpectedStatus.PROPOSED).toMatchObject({
      count: 3,
      valid: 2,
      materialExact: 1,
      statusAccuracy: 2 / 3,
    });
    expect(summary.byExpectedStatus.AMBIGUOUS.statusAccuracy).toBe(1);
    expect(summary.byExpectedStatus.UNSUPPORTED.statusAccuracy).toBe(0);
    expect(summary).not.toHaveProperty("automaticCoverage");
  });
});
