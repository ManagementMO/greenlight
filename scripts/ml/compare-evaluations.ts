import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";
import {
  summarizeExtraction,
  type ExtractionScore,
  type ExtractionSummary,
} from "../../lib/providers/evaluation";
import { args, saveJson, publicError } from "./shared";
type Row = {
  id: string;
  promptSha256?: string;
  latencyMs: number;
  usage?: { prompt_tokens: number; completion_tokens: number };
  score: ExtractionScore;
};
type Experiment = {
  status: string;
  evaluationSha256: string;
  exampleCount: number;
  frozenCaseCount?: number;
  decode: unknown;
  launch?: unknown;
  promptProfile?: string;
  promptContractSha256?: string;
  rows: Row[];
  summary: ExtractionSummary;
  artifact: { repo: string; revision: string };
  stopVerified: boolean;
  costUsd: number;
  provisioningMs: number;
};
function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b),
    n = sorted.length;
  return n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
}
export const EXTRACTOR_GATE_VERSION = "extractor-gates-v2";
function verifiedSummary(experiment: Experiment): ExtractionSummary {
  const summary = summarizeExtraction(experiment.rows.map((row) => row.score));
  if (!isDeepStrictEqual(experiment.summary, summary))
    throw new Error(
      "Experiment summary aggregates differ from its per-case scores",
    );
  return summary;
}
export function compareEvaluations(base: Experiment, tuned: Experiment) {
  if (
    base.status !== "completed" ||
    tuned.status !== "completed" ||
    !base.stopVerified ||
    !tuned.stopVerified
  )
    throw new Error(
      "Both experiments must complete and stop their GPU resources",
    );
  if (
    base.evaluationSha256 !== tuned.evaluationSha256 ||
    JSON.stringify(base.decode) !== JSON.stringify(tuned.decode) ||
    !isDeepStrictEqual(base.launch, tuned.launch)
  )
    throw new Error("Experiments differ in evaluation data, decoding or launch settings");
  if (base.promptProfile !== tuned.promptProfile || base.promptContractSha256 !== tuned.promptContractSha256)
    throw new Error("Experiments differ in prompt profile or prompt contract");
  const expectedCount = base.frozenCaseCount ?? 24;
  if (
    expectedCount < 24 ||
    (tuned.frozenCaseCount ?? 24) !== expectedCount ||
    base.exampleCount !== expectedCount ||
    tuned.exampleCount !== expectedCount ||
    base.rows.length !== expectedCount ||
    tuned.rows.length !== expectedCount ||
    base.summary?.count !== expectedCount ||
    tuned.summary?.count !== expectedCount
  )
    throw new Error(
      `Full ${expectedCount}-case independent holdout required; spot checks cannot promote`,
    );
  if (base.rows.some((r, i) => r.id !== tuned.rows[i]?.id))
    throw new Error("Experiments evaluated different case identities/order");
  if (
    base.rows.some((row, i) => row.promptSha256 !== tuned.rows[i].promptSha256) ||
    (base.promptProfile === "json-schema-v4" &&
      base.rows.some((row) => !/^[a-f0-9]{64}$/.test(row.promptSha256 ?? "")))
  )
    throw new Error("Experiments must use identical verified per-case prompts");
  if (
    new Set(base.rows.map((row) => row.id)).size !== expectedCount ||
    base.rows.some((row) => !row.id)
  )
    throw new Error("Evaluation case identities must be nonempty and unique");
  if (
    base.rows.some(
      (row, i) =>
        row.score.expectedStatus !== tuned.rows[i].score.expectedStatus,
    )
  )
    throw new Error("Experiments differ in expected case labels");
  const baseSummary = verifiedSummary(base),
    tunedSummary = verifiedSummary(tuned);
  // Incorrect PROPOSED guesses never count as useful supported-case coverage.
  // Correctly retaining uncertainty may reduce raw review volume without a regression.
  const matchedCoverage =
    tunedSummary.correctSupportedProposals >=
    baseSummary.correctSupportedProposals;
  const noRegression =
    tunedSummary.materialExact >= baseSummary.materialExact &&
    tunedSummary.valid >= baseSummary.valid &&
    tunedSummary.unsafeProposed <= baseSummary.unsafeProposed &&
    matchedCoverage;
  const improved = tunedSummary.materialExact > baseSummary.materialExact;
  return {
    schemaVersion: 1,
    gateVersion: EXTRACTOR_GATE_VERSION,
    status: noRegression
      ? improved
        ? "quality-improved"
        : "quality-tied"
      : "rejected-regression",
    promoted: noRegression && improved,
    qualityImprovementMeasured: improved && noRegression,
    methodology:
      "Matched frozen cases, prompts, schema and decoding compare the original base artifact pipeline with the trained/merged export pipeline. Weight quantization and possibly runtime dtype differ; the result does not isolate LoRA's causal effect. Repository configuration is observed, effective loaded precision is not attested.",
    baseArtifact: base.artifact,
    tunedArtifact: tuned.artifact,
    evaluationSha256: base.evaluationSha256,
    promptProfile: base.promptProfile,
    promptContractSha256: base.promptContractSha256,
    caseCount: expectedCount,
    base: baseSummary,
    tuned: tunedSummary,
    deltas: {
      materialExact: tunedSummary.materialExact - baseSummary.materialExact,
      valid: tunedSummary.valid - baseSummary.valid,
      proposed: tunedSummary.proposed - baseSummary.proposed,
      unsafeProposed: tunedSummary.unsafeProposed - baseSummary.unsafeProposed,
      correctSupportedProposals:
        tunedSummary.correctSupportedProposals -
        baseSummary.correctSupportedProposals,
    },
    latency: {
      baseWarmMedianMs: median(base.rows.map((r) => r.latencyMs)),
      tunedWarmMedianMs: median(tuned.rows.map((r) => r.latencyMs)),
      baseProvisioningMs: base.provisioningMs,
      tunedProvisioningMs: tuned.provisioningMs,
      limit: `Sequential ${expectedCount}-case descriptive timings, not a controlled significance test. Provisioning reported separately.`,
    },
    correctSupportedCoverageMatchedOrHigher: matchedCoverage,
    coverageMetric:
      "Material-exact PROPOSED outputs on expected-PROPOSED cases; raw proposals are review volume, including unsafe guesses.",
    gate: "Improve material accuracy with no regression in schema validity, unsafe proposals, or correctly supported proposals; exact same full frozen cases, expected classes and decoding. Summaries are recomputed and checked against per-case scores. Raw proposal rate and class-specific accuracy are reported separately. All material proposals require owner review. A tie retains the base extractor.",
    verifiedAt: new Date().toISOString(),
  };
}
async function main() {
  const a = args(),
    base = JSON.parse(
      await readFile(
        resolve(String(a.base ?? "work/ml/evaluation-base.json")),
        "utf8",
      ),
    ),
    tuned = JSON.parse(
      await readFile(
        resolve(String(a.tuned ?? "work/ml/evaluation-tuned.json")),
        "utf8",
      ),
    );
  const result = compareEvaluations(base, tuned);
  await saveJson(resolve("work/ml/base-tuned-comparison.json"), result);
  console.log(JSON.stringify(result, null, 2));
}
if (process.argv[1]?.endsWith("compare-evaluations.ts"))
  main().catch((error) => {
    console.error(publicError(error));
    process.exitCode = 1;
  });
