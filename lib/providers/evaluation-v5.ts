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

/** A filename is not evidence that a run evaluated the intended model or corpus. */
export function assertV5RunIdentity(run: {
  label?: unknown; mode?: unknown; dataVersion?: unknown; purpose?: unknown;
  corpusPurpose?: unknown; frozenCaseCount?: unknown; exampleCount?: unknown;
  artifact?: {repo?: unknown; revision?: unknown};
}, expected: {
  label: string; dataVersion: string; count: number;
  corpusPurpose: "development-only" | "final-evaluation";
  artifact: {repo: string; revision: string};
}) {
  const purpose = expected.corpusPurpose === "development-only"
    ? "development-evaluation" : "frozen-heldout-evaluation";
  if (run.label !== expected.label || run.mode !== "real-veri-serving" ||
      run.dataVersion !== expected.dataVersion || run.purpose !== purpose ||
      run.corpusPurpose !== expected.corpusPurpose ||
      run.frozenCaseCount !== expected.count || run.exampleCount !== expected.count ||
      !/^[a-f0-9]{40}$/.test(expected.artifact.revision) ||
      run.artifact?.repo !== expected.artifact.repo || run.artifact?.revision !== expected.artifact.revision)
    throw new Error("V5 run identity does not match the pinned model, split and complete case count.");
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
