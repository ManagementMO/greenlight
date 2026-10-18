import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { buildV5Showcase, assertPublishedV5Showcase } from "../../lib/providers/showcase-v5";
import { buildC120Showcase } from "../../lib/providers/showcase";
import { scoreExtraction, summarizeExtraction } from "../../lib/providers/evaluation";
import { V5_GATE, v5PromptHash } from "../../lib/providers/evaluation-v5";
import type { PublicV5Evaluation } from "../../lib/public-extraction-evaluation";

function fixture(promoted = false) {
  const source = buildC120Showcase(), text = JSON.stringify(source.expected);
  const summary = summarizeExtraction([scoreExtraction(text, source.context, source.expected)]);
  const stamp = "2026-10-18T04:00:00Z", revision = "a".repeat(40);
  const run = (repo: string) => ({artifact: {repo, revision}, completedAt: stamp, summary, stopVerified: true, costSettled: true});
  const final: PublicV5Evaluation = {
    schemaVersion: 1, origin: "recorded", dataClassification: "PUBLIC_SYNTHETIC", purpose: "final-evaluation", caseCount: 1,
    evaluationSha256: "d".repeat(64), promptProfile: "reference-contract-v5", promptContractSha256: v5PromptHash(),
    base: run("owner/base"), tuned: run("owner/tuned"),
    comparison: {status: promoted ? "quality-improved" : "rejected-usefulness-or-safety", promoted,
      gateVersion: V5_GATE.version, gate: "fixed gate", absoluteGatePassed: promoted, qualityImprovementMeasured: promoted},
  };
  const selected = promoted ? "tuned" : "base";
  const raw = {...final[selected], label: `v5-${selected}-final`, status: "completed", evaluationSha256: final.evaluationSha256,
    promptProfile: "reference-contract-v5", promptContractSha256: v5PromptHash(), showcase: {...source,
      modelRevision: revision, includedInEvaluationMetrics: false, modelOutput: text,
      score: scoreExtraction(text, source.context, source.expected)}};
  const evidence = JSON.parse(readFileSync("data/artifacts/evidence-judgments.json", "utf8"));
  return {final, raw, evidence};
}

describe("V5 source illustration authority", () => {
  it("uses the gate-selected artifact and preserves the actual output", () => {
    for (const promoted of [false, true]) {
      const f = fixture(promoted), result = buildV5Showcase(f.final, f.raw, f.evidence);
      expect(result.selectedByGate).toBe(promoted ? "tuned" : "base");
      expect(result.rawOutput).toBe(f.raw.showcase.modelOutput);
      expect(result.includedInEvaluationMetrics).toBe(false);
      expect(() => assertPublishedV5Showcase(result, f.final)).not.toThrow();
    }
  });
  it("rejects a better-looking output from the model that the gate did not select", () => {
    const f = fixture(); f.raw.artifact = f.final.tuned.artifact;
    expect(() => buildV5Showcase(f.final, f.raw, f.evidence)).toThrow("gate-selected");
  });
  it("rejects changed source, score, revision and unsettled runs", () => {
    const changes = [
      (f: ReturnType<typeof fixture>) => {f.raw.showcase.sourceText += " changed";},
      (f: ReturnType<typeof fixture>) => {f.raw.showcase.score.materialExact = false;},
      (f: ReturnType<typeof fixture>) => {f.raw.showcase.modelRevision = "b".repeat(40);},
      (f: ReturnType<typeof fixture>) => {f.raw.costSettled = false;},
      (f: ReturnType<typeof fixture>) => {f.evidence.evidenceSha256 = "b".repeat(64);},
    ];
    for (const change of changes) {const f = fixture(); change(f); expect(() => buildV5Showcase(f.final, f.raw, f.evidence)).toThrow();}
  });
  it("refuses repaired candidates or rewritten output during app publication", () => {
    const f = fixture(), result = buildV5Showcase(f.final, f.raw, f.evidence);
    result.candidate = {...result.candidate!, status: "UNSUPPORTED"};
    expect(() => assertPublishedV5Showcase(result, f.final)).toThrow("changed or repaired");
    const other = buildV5Showcase(f.final, f.raw, f.evidence); other.rawOutput += "x";
    expect(() => assertPublishedV5Showcase(other, f.final)).toThrow("actual output");
  });
});
