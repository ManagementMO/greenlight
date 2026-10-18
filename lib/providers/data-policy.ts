import { createHash } from "node:crypto";
export interface TrainingManifest {
  dataClassification?: string;
  hashes: Record<string, string>;
  version: string;
}
export function assertPublicSyntheticTrainingData(
  manifest: TrainingManifest,
  fileName: string,
  content: string,
) {
  if (manifest.dataClassification !== "PUBLIC_SYNTHETIC")
    throw new Error(
      "Public model export requires a reviewed PUBLIC_SYNTHETIC dataset; private or unclassified data is refused",
    );
  if (!["train.jsonl", "proof.jsonl"].includes(fileName))
    throw new Error(
      "Only reviewed train/proof files may be uploaded; final evaluation is protected",
    );
  const sha = createHash("sha256").update(content).digest("hex");
  if (manifest.hashes[fileName] !== sha)
    throw new Error(
      "Supervised dataset hash differs from its reviewed manifest",
    );
  return {
    sha,
    version: manifest.version,
    dataClassification: "PUBLIC_SYNTHETIC" as const,
  };
}

/** Refuse a paid run if its token audit is stale or any supervised answer is truncated. */
export function assertBoundTokenizerAudit(
  audit: {
    trainingSha256?: unknown;
    baseModel?: unknown;
    examples?: unknown;
    maxTokens?: unknown;
    minCompletionTokens?: unknown;
    allPromptTokenPrefixesMatch?: unknown;
  },
  expected: { sha: string; baseModel: string; rows: number; maxSeqLength: number },
) {
  if (
    audit.trainingSha256 !== expected.sha ||
    audit.baseModel !== expected.baseModel ||
    audit.examples !== expected.rows
  )
    throw new Error("Tokenizer audit does not match the exact training data, model and row count");
  if (
    audit.allPromptTokenPrefixesMatch !== true ||
    !Number.isSafeInteger(audit.minCompletionTokens) ||
    Number(audit.minCompletionTokens) <= 0
  )
    throw new Error("Tokenizer audit must verify every prompt prefix and positive completion tokens");
  if (
    !Number.isSafeInteger(audit.maxTokens) ||
    Number(audit.maxTokens) <= 0 ||
    Number(audit.maxTokens) > expected.maxSeqLength
  )
    throw new Error("Selected sequence limit would truncate the audited training data");
  return { maxTokens: Number(audit.maxTokens), examples: expected.rows };
}
