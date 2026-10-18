import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { assertPublicSyntheticTrainingData } from "../../lib/providers/data-policy";
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
