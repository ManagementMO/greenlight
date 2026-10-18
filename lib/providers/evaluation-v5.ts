import { createHash } from "node:crypto";
import { extractionPromptV5 } from "./extraction-v5";

export const V5_GATE = Object.freeze({
  version: "extractor-gates-v3-useful-coverage",
  minimumSupportedCoverage: 0.8,
  minimumValidity: 0.9,
  minimumUncertaintyStatusAccuracy: 0.8,
  maximumIncorrectValidatedProposals: 0,
});
export function v5PromptHash() {
  return createHash("sha256").update(extractionPromptV5({sourceId:"PROMPT_CONTRACT",text:"",amountRefs:[],subjects:[]})).digest("hex");
}
export function assertReviewedV5Evaluation(manifest: {
  promptProfile?: unknown; promptContractSha256?: unknown; dataClassification?: unknown;
  purpose?: unknown; frozen?: unknown; reviewStatus?: unknown;
  independentAudit?: {evaluationSha256?: unknown}; hashes?: Record<string,string>;
}, expectedPurpose: "development-only" | "final-evaluation") {
  if (manifest.dataClassification !== "PUBLIC_SYNTHETIC" || manifest.promptProfile !== "reference-contract-v5" ||
      manifest.promptContractSha256 !== v5PromptHash() || manifest.reviewStatus !== "independently-audited-before-query" ||
      !/^[a-f0-9]{64}$/.test(manifest.hashes?.["evaluation.frozen.jsonl"] ?? "") ||
      manifest.independentAudit?.evaluationSha256 !== manifest.hashes?.["evaluation.frozen.jsonl"] ||
      manifest.purpose !== expectedPurpose || manifest.frozen !== true)
    throw new Error("V5 evaluation requires the exact reviewed, frozen case and prompt hashes.");
}
