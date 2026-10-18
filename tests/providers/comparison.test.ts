import { describe, it, expect } from "vitest";
import { compareEvaluations } from "../../scripts/ml/compare-evaluations";
import {
  summarizeExtraction,
  type ExtractionScore,
} from "../../lib/providers/evaluation";
import type { ExtractedClause } from "../../lib/providers/extraction";

type Prediction = "correct" | "unsafe" | "abstain" | "invalid";
const expectedStatuses: ExtractedClause["status"][] = Array.from(
  { length: 24 },
  (_, i) => (i < 12 ? "PROPOSED" : i < 18 ? "AMBIGUOUS" : "UNSUPPORTED"),
);
function score(
  prediction: Prediction,
  expectedStatus: ExtractedClause["status"],
): ExtractionScore {
  const valid = prediction !== "invalid";
  const proposed =
    prediction === "unsafe" ||
    (prediction === "correct" && expectedStatus === "PROPOSED");
  const materialExact = prediction === "correct";
  return {
    expectedStatus,
    valid,
    materialExact,
    proposed,
    unsafeProposed: proposed && !materialExact,
    statusCorrect:
      valid &&
      (prediction === "correct" ||
        (prediction === "unsafe" && expectedStatus === "PROPOSED") ||
        (prediction === "abstain" && expectedStatus === "AMBIGUOUS")),
  };
}
function experiment(predictions: Prediction[] = Array(24).fill("correct")) {
  const rows = predictions.map((prediction, i) => ({
    id: String(i),
    latencyMs: 100 + i,
    score: score(prediction, expectedStatuses[i]),
  }));
  return {
    status: "completed",
    evaluationSha256: "fixed",
    exampleCount: 24,
    frozenCaseCount: 24,
    decode: { temperature: 0, maxTokens: 768 },
    rows,
    summary: summarizeExtraction(rows.map((row) => row.score)),
    artifact: { repo: "me/model", revision: "commit" },
    stopVerified: true,
    costUsd: 0.3,
    provisioningMs: 300000,
  };
}
const overconfidentBase = () =>
  experiment(
    Array.from({ length: 24 }, (_, i) => (i < 8 ? "correct" : "unsafe")),
  );
const saferCandidate = () =>
  experiment(
    Array.from({ length: 24 }, (_, i) =>
      i < 10 || i >= 12 ? "correct" : "abstain",
    ),
  );

describe("fine-tuned extractor promotion gate", () => {
  it("refuses different prompt contracts and individual case prompts", () => {
    const base = { ...experiment(), promptProfile: "json-schema-v4", promptContractSha256: "contract",
      rows: experiment().rows.map((row) => ({ ...row, promptSha256: "a".repeat(64) })) };
    const candidate = structuredClone(base);
    expect(compareEvaluations(base, candidate).status).toBe("quality-tied");
    expect(() => compareEvaluations(base, { ...candidate, promptProfile: "legacy-v3" })).toThrow(/prompt/);
    expect(() => compareEvaluations(base, { ...candidate, promptContractSha256: "changed" })).toThrow(/prompt/);
    candidate.rows[0].promptSha256 = "b".repeat(64);
    expect(() => compareEvaluations(base, candidate)).toThrow(/per-case prompts/);
    expect(() => compareEvaluations({ ...base, rows: experiment().rows }, { ...base, rows: experiment().rows })).toThrow(/per-case prompts/);
  });
  it("reports a versioned tie and retains the base extractor", () => {
    const result = compareEvaluations(experiment(), experiment());
    expect(result.gateVersion).toBe("extractor-gates-v2");
    expect(result.status).toBe("quality-tied");
    expect(result.promoted).toBe(false);
    expect(result.gate).not.toContain("automatic");
  });
  it("accepts fewer raw proposals when unsafe guesses become correct uncertainty and supported yield improves", () => {
    const result = compareEvaluations(overconfidentBase(), saferCandidate());
    expect(result.base.proposed).toBe(24);
    expect(result.tuned.proposed).toBe(10);
    expect(result.base.correctSupportedProposals).toBe(8);
    expect(result.tuned.correctSupportedProposals).toBe(10);
    expect(result.base.materialExact).toBe(8);
    expect(result.tuned.materialExact).toBe(22);
    expect(result.tuned.unsafeProposed).toBe(0);
    expect(result.correctSupportedCoverageMatchedOrHigher).toBe(true);
    expect(result.tuned.rawProposalRate).toBe(10 / 24);
    expect(result.promoted).toBe(true);
  });
  it("rejects an always-abstaining candidate even when uncertainty accuracy raises total accuracy", () => {
    const candidate = experiment(
      Array.from({ length: 24 }, (_, i) => (i < 12 ? "abstain" : "correct")),
    );
    const result = compareEvaluations(overconfidentBase(), candidate);
    expect(result.tuned.materialExact).toBeGreaterThan(
      result.base.materialExact,
    );
    expect(result.tuned.correctSupportedProposals).toBe(0);
    expect(result.promoted).toBe(false);
  });
  it("rejects supported-case loss hidden by a greater gain on ambiguous and unsupported cases", () => {
    const base = experiment(
      Array.from({ length: 24 }, (_, i) => (i < 10 ? "correct" : "unsafe")),
    );
    const candidate = experiment(
      Array.from({ length: 24 }, (_, i) =>
        i < 9 || i >= 12 ? "correct" : "abstain",
      ),
    );
    const result = compareEvaluations(base, candidate);
    expect(result.tuned.materialExact).toBeGreaterThan(
      result.base.materialExact,
    );
    expect(result.tuned.correctSupportedProposals).toBe(9);
    expect(result.promoted).toBe(false);
  });
  it("retains unsafe-proposal and validity nonregression gates", () => {
    const safeBase = experiment(
      Array.from({ length: 24 }, (_, i) =>
        i === 10 || i === 11 ? "abstain" : "correct",
      ),
    );
    const unsafeCandidate = experiment(
      Array.from({ length: 24 }, (_, i) => (i === 11 ? "unsafe" : "correct")),
    );
    expect(compareEvaluations(safeBase, unsafeCandidate).promoted).toBe(false);
    const validBase = experiment(
      Array.from({ length: 24 }, (_, i) =>
        i < 8 ? "correct" : i < 12 ? "unsafe" : "abstain",
      ),
    );
    const invalidCandidate = experiment(
      Array.from({ length: 24 }, (_, i) => (i === 23 ? "invalid" : "correct")),
    );
    expect(compareEvaluations(validBase, invalidCandidate).promoted).toBe(
      false,
    );
  });
  it("rejects forged aggregates and internally impossible per-case scores", () => {
    const forged = saferCandidate();
    forged.summary.materialExact++;
    expect(() => compareEvaluations(overconfidentBase(), forged)).toThrow(
      /summary|aggregate/i,
    );
    const inconsistent = saferCandidate();
    inconsistent.rows[0].score.unsafeProposed = true;
    expect(() => compareEvaluations(overconfidentBase(), inconsistent)).toThrow(
      /score|inconsistent/i,
    );
  });
  it("requires full unique equal case identities, expected classes, hashes and decoding", () => {
    const subset = experiment();
    subset.rows.pop();
    expect(() => compareEvaluations(experiment(), subset)).toThrow(/24/);
    const changed = experiment();
    changed.rows[0].id = "different";
    expect(() => compareEvaluations(experiment(), changed)).toThrow(
      /identities/,
    );
    const duplicateBase = experiment(),
      duplicateCandidate = experiment();
    duplicateBase.rows[1].id = "0";
    duplicateCandidate.rows[1].id = "0";
    expect(() => compareEvaluations(duplicateBase, duplicateCandidate)).toThrow(
      /unique|duplicate/i,
    );
    const relabeled = experiment();
    relabeled.rows[12].score.expectedStatus = "UNSUPPORTED";
    relabeled.summary = summarizeExtraction(
      relabeled.rows.map((row) => row.score),
    );
    expect(() => compareEvaluations(experiment(), relabeled)).toThrow(
      /expected|label/i,
    );
    expect(() =>
      compareEvaluations(experiment(), {
        ...experiment(),
        evaluationSha256: "different",
      }),
    ).toThrow(/data|decoding/i);
    expect(() =>
      compareEvaluations(experiment(), {
        ...experiment(),
        decode: { temperature: 1 },
      }),
    ).toThrow(/data|decoding/i);
    expect(() => compareEvaluations(
      { ...experiment(), launch: { maxModelLen: 4096 } },
      { ...experiment(), launch: { maxModelLen: 2048 } },
    )).toThrow(/launch/);
    expect(() =>
      compareEvaluations(experiment(), { ...experiment(), exampleCount: 23 }),
    ).toThrow(/24|full/i);
  });
});
