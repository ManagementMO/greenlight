import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { assertBoundTokenizerAudit, assertPublicSyntheticTrainingData } from "../../lib/providers/data-policy";
const content =
  '{"prompt":"fictional clause","completion":"fictional target"}\n';
const manifest = {
  version: "test",
  dataClassification: "PUBLIC_SYNTHETIC",
  hashes: {
    "train.jsonl": createHash("sha256").update(content).digest("hex"),
    "evaluation.frozen.jsonl": createHash("sha256")
      .update(content)
      .digest("hex"),
  },
};
describe("public synthetic model export policy", () => {
  it("accepts the explicitly public synthetic, reviewed training file", () =>
    expect(
      assertPublicSyntheticTrainingData(manifest, "train.jsonl", content)
        .dataClassification,
    ).toBe("PUBLIC_SYNTHETIC"));
  it("refuses private/unclassified data even when its hash matches", () => {
    for (const classification of ["PRIVATE_CUSTOMER_DATA", undefined])
      expect(() =>
        assertPublicSyntheticTrainingData(
          { ...manifest, dataClassification: classification },
          "train.jsonl",
          content,
        ),
      ).toThrow(/PUBLIC_SYNTHETIC/);
  });
  it("refuses final labels and any unreviewed content", () => {
    expect(() =>
      assertPublicSyntheticTrainingData(
        manifest,
        "evaluation.frozen.jsonl",
        content,
      ),
    ).toThrow(/protected/);
    expect(() =>
      assertPublicSyntheticTrainingData(
        manifest,
        "train.jsonl",
        content + "extra",
      ),
    ).toThrow(/hash/);
  });
});

describe("paid training tokenizer audit gate", () => {
  const expected = { sha: "reviewed-data", baseModel: "Qwen/base", rows: 276, maxSeqLength: 1536 };
  const audit = { trainingSha256: expected.sha, baseModel: expected.baseModel, examples: 276,
    maxTokens: 1330, minCompletionTokens: 54, allPromptTokenPrefixesMatch: true };
  it("accepts complete matching supervised examples at the selected sequence limit", () => {
    expect(assertBoundTokenizerAudit(audit, expected).maxTokens).toBe(1330);
  });
  it("refuses a stale audit, wrong model, or incomplete dataset", () => {
    for (const changed of [{ trainingSha256: "old-data" }, { baseModel: "other" }, { examples: 23 }])
      expect(() => assertBoundTokenizerAudit({ ...audit, ...changed }, expected)).toThrow(/match/);
  });
  it("refuses prefix errors, absent completions and truncation", () => {
    for (const changed of [{ allPromptTokenPrefixesMatch: false }, { minCompletionTokens: 0 }, { maxTokens: 1537 }, { maxTokens: undefined }])
      expect(() => assertBoundTokenizerAudit({ ...audit, ...changed }, expected)).toThrow(/prefix|completion|truncate/);
  });
});
