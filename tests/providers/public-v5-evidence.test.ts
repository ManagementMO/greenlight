import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { publicEvaluationRunCount, validPublicV5Evaluation, type PublicV5Evaluation } from "../../lib/public-extraction-evaluation";
import { summarizeExtraction, type ExtractionScore } from "../../lib/providers/evaluation";
import { ExtractionV5ComparisonPanel } from "../../components/extraction-v5-comparison";

function fixture(purpose: PublicV5Evaluation["purpose"] = "development-only"): PublicV5Evaluation {
  const score = (expectedStatus: ExtractionScore["expectedStatus"]): ExtractionScore => ({
    expectedStatus, valid: true, materialExact: true, proposed: expectedStatus === "PROPOSED",
    unsafeProposed: false, statusCorrect: true,
  });
  const summary = summarizeExtraction([score("PROPOSED"), score("PROPOSED"), score("AMBIGUOUS"), score("UNSUPPORTED")]);
  const run = {artifact: {repo: "owner/model", revision: "a".repeat(40)}, summary,
    completedAt: "2026-10-18T03:00:00Z", stopVerified: true, costSettled: true};
  return {
    schemaVersion: 1, origin: "recorded", dataClassification: "PUBLIC_SYNTHETIC", purpose, caseCount: 4,
    evaluationSha256: "a".repeat(64), promptContractSha256: "b".repeat(64), promptProfile: "reference-contract-v5",
    base: structuredClone(run), tuned: structuredClone(run),
    comparison: purpose === "development-only" ? {status: "development-only", promoted: false, detail: "Development only."} :
      {status: "rejected-usefulness-or-safety", promoted: false, gateVersion: "fixed-v5", gate: "Usefulness and safety checks.", absoluteGatePassed: false, qualityImprovementMeasured: true},
  };
}

describe("public V5 evaluation display boundary", () => {
  it("counts both provider runs in each valid development and final comparison", () => {
    const value = {evaluations: [{id: "historical"}], extractionV5Development: fixture(), extractionV5Final: fixture("final-evaluation")};
    expect(publicEvaluationRunCount({evaluations: value.evaluations})).toBe(1);
    expect(publicEvaluationRunCount({...value, extractionV5Final: undefined})).toBe(3);
    expect(publicEvaluationRunCount(value)).toBe(5);
    value.extractionV5Final.tuned.stopVerified = false;
    expect(publicEvaluationRunCount(value)).toBe(3);
  });
  it("accepts complete optional artifacts and rejects absent, wrong-split and unfinished records", () => {
    expect(validPublicV5Evaluation(undefined, "development-only")).toBe(false);
    expect(validPublicV5Evaluation(fixture(), "development-only")).toBe(true);
    expect(validPublicV5Evaluation(fixture(), "final-evaluation")).toBe(false);
    for (const key of ["stopVerified", "costSettled"] as const) {
      const value = fixture(); value.tuned[key] = false;
      expect(validPublicV5Evaluation(value, "development-only")).toBe(false);
    }
  });
  it("does not display promotion from development or contradictory final evidence", () => {
    const dev = fixture(); dev.comparison.promoted = true;
    expect(validPublicV5Evaluation(dev, "development-only")).toBe(false);
    const final = fixture("final-evaluation"); final.comparison.promoted = true;
    expect(validPublicV5Evaluation(final, "final-evaluation")).toBe(false);
    final.comparison.absoluteGatePassed = true;
    expect(validPublicV5Evaluation(final, "final-evaluation")).toBe(true);
  });
  it("rejects impossible denominators, missing strata and unbound identities", () => {
    const value = fixture(); value.tuned.summary.correctSupportedProposals = 3;
    expect(validPublicV5Evaluation(value, "development-only")).toBe(false);
    const incomplete = fixture(); incomplete.tuned.summary.byExpectedStatus.AMBIGUOUS.count = 0;
    expect(validPublicV5Evaluation(incomplete, "development-only")).toBe(false);
    const unbound = fixture(); unbound.tuned.artifact.revision = "latest";
    expect(validPublicV5Evaluation(unbound, "development-only")).toBe(false);
  });
  it("labels development as diagnostic and displays supported and uncertainty denominators", () => {
    const html = renderToStaticMarkup(createElement(ExtractionV5ComparisonPanel, {value: fixture()}));
    expect(html).toContain("Development only · no promotion");
    expect(html).toContain("2 / 2");
    expect(html).toContain("1 / 1");
    expect(html).toContain("extraction-v5-development.json");
    expect(html).toContain("not a live extractor deployment");
  });
  it("separates measured improvement from a failed final release gate", () => {
    const html = renderToStaticMarkup(createElement(ExtractionV5ComparisonPanel, {value: fixture("final-evaluation")}));
    expect(html).toContain("V5 candidate not promoted");
    expect(html).toContain("Improvement over the base was measured");
    expect(html).toContain("did not pass the full release gate");
    expect(html).toContain("extraction-v5-evaluation.json");
    expect(html).not.toContain("Final gate passed");
  });
});
