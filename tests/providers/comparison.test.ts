import { describe, it, expect } from "vitest";
import { compareEvaluations } from "../../scripts/ml/compare-evaluations";
function experiment(exact: number, unsafe = 0, proposed = 16) {
  return {
    status: "completed",
    evaluationSha256: "fixed",
    exampleCount: 24,
    decode: { temperature: 0, maxTokens: 768 },
    rows: Array.from({ length: 24 }, (_, i) => ({
      id: String(i),
      latencyMs: 100 + i,
      score: {
        materialExact: i < exact,
        valid: true,
        proposed: i < proposed,
        unsafeProposed: i < unsafe,
      },
    })),
    summary: {
      count: 24,
      valid: 24,
      materialExact: exact,
      proposed,
      unsafeProposed: unsafe,
    },
    artifact: { repo: "me/model", revision: "commit" },
    stopVerified: true,
    costUsd: 0.3,
    provisioningMs: 300000,
  };
}
describe("fine-tuned extractor promotion gate", () => {
  it("reports a tie and retains the base instead of fabricating an improvement", () => {
    const result = compareEvaluations(experiment(20), experiment(20));
    expect(result.status).toBe("quality-tied");
    expect(result.promoted).toBe(false);
  });
  it("rejects quality gains achieved by lowering coverage or making unsafe proposals", () => {
    expect(
      compareEvaluations(experiment(20), experiment(21, 0, 14)).promoted,
    ).toBe(false);
    expect(compareEvaluations(experiment(20), experiment(21, 1)).promoted).toBe(
      false,
    );
    expect(compareEvaluations(experiment(20), experiment(21)).promoted).toBe(
      true,
    );
  });
  it("refuses mismatched identities and incomplete spot checks", () => {
    const subset = experiment(20);
    subset.rows.pop();
    expect(() => compareEvaluations(experiment(20), subset)).toThrow(/24/);
    const changed = experiment(21);
    changed.rows[0].id = "different";
    expect(() => compareEvaluations(experiment(20), changed)).toThrow(
      /identities/,
    );
  });
});
