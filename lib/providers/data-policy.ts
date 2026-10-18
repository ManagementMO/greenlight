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
