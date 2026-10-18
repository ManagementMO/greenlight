import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { extractionPromptV4 } from "../../lib/providers/extraction";
import { scoreExtraction, summarizeExtraction } from "../../lib/providers/evaluation";
import { buildC120Showcase } from "../../lib/providers/showcase";
import type { LabeledExample } from "../../scripts/ml/generate-data";

const read = (path: string) => readFileSync(path, "utf8");
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const evidence = JSON.parse(read("data/artifacts/extraction-evaluation.json"));
const source = read("data/evaluation/v4-schema-contract/evaluation.frozen.jsonl");
const cases = new Map<string, LabeledExample>(source.trim().split("\n").map(line => {
  const row = JSON.parse(line) as LabeledExample;
  return [row.id, row];
}));

describe("published recorded extraction evidence", () => {
  it("binds every actual public prediction and score to the frozen source and prompt", () => {
    expect(sha(source)).toBe(evidence.evaluationSha256);
    expect(evidence.dataClassification).toBe("PUBLIC_SYNTHETIC");
    expect(cases.size).toBe(evidence.caseCount);
    for (const label of ["base", "tuned"]) {
      const run = evidence[label];
      expect(run.rows).toHaveLength(cases.size);
      expect(new Set(run.rows.map((row: {id: string}) => row.id)).size).toBe(cases.size);
      const scores = run.rows.map((row: {id: string; output: string; outputSha256: string; promptSha256: string; expected: unknown; score: unknown}) => {
        const original = cases.get(row.id)!;
        expect(original).toBeDefined();
        expect(row.expected).toEqual(original.expected);
        expect(sha(extractionPromptV4(original.context))).toBe(row.promptSha256);
        expect(sha(row.output)).toBe(row.outputSha256);
        const score = scoreExtraction(row.output, original.context, original.expected);
        expect(row.score).toEqual(score);
        return score;
      });
      expect(summarizeExtraction(scores)).toEqual(run.summary);
      expect(run.stopVerified).toBe(true);
    }
  });

  it("publishes the exact source-bound response and its validation failure without activating it", () => {
    const demo = JSON.parse(read("data/artifacts/extraction-demo.json"));
    const illustration = buildC120Showcase();
    expect(demo.sourceId).toBe(illustration.sourceId);
    expect(demo.sourceSha256).toBe(illustration.sourceSha256);
    expect(demo.excerptSha256).toBe(sha(illustration.sourceText));
    expect(typeof demo.rawOutput).toBe("string");
    expect(demo.rawOutput.length).toBeLessThanOrEqual(32768);
    expect(sha(demo.rawOutput)).toBe(demo.outputSha256);
    const score = scoreExtraction(demo.rawOutput, illustration.context, illustration.expected);
    expect(demo.candidate).toEqual(score.parsed ?? null);
    expect(demo.materialExact).toBe(score.materialExact);
    expect(demo.validationError).toBe(score.error ?? null);
    expect(demo.includedInEvaluationMetrics).toBe(false);
    const selected = evidence.comparison.promoted ? "tuned" : "base";
    expect(demo.selectedByGate).toBe(selected);
    expect(demo.modelRepo).toBe(evidence[selected].artifact.repo);
    expect(demo.modelRevision).toBe(evidence[selected].artifact.revision);
  });
});
