import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { args, saveJson, publicError } from "./shared";
type Row = {
  id: string;
  latencyMs: number;
  usage?: { prompt_tokens: number; completion_tokens: number };
  score: {
    materialExact: boolean;
    valid: boolean;
    proposed: boolean;
    unsafeProposed: boolean;
  };
};
type Experiment = {
  status: string;
  evaluationSha256: string;
  exampleCount: number;
  frozenCaseCount?: number;
  decode: unknown;
  rows: Row[];
  summary: {
    count: number;
    valid: number;
    materialExact: number;
    proposed: number;
    unsafeProposed: number;
  };
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
    JSON.stringify(base.decode) !== JSON.stringify(tuned.decode)
  )
    throw new Error("Experiments differ in evaluation data or decoding");
  const expectedCount = base.frozenCaseCount ?? 24;
  if (
    expectedCount < 24 ||
    (tuned.frozenCaseCount ?? 24) !== expectedCount ||
    base.rows.length !== expectedCount ||
    tuned.rows.length !== expectedCount ||
    base.summary?.count !== expectedCount ||
    tuned.summary?.count !== expectedCount
  )
    throw new Error(
      `Full${expectedCount}-case independent holdout required; spot checks cannot promote`,
    );
  if (base.rows.some((r, i) => r.id !== tuned.rows[i]?.id))
    throw new Error("Experiments evaluated different case identities/order");
  const matchedCoverage = tuned.summary.proposed >= base.summary.proposed;
  const noRegression =
    tuned.summary.materialExact >= base.summary.materialExact &&
    tuned.summary.valid >= base.summary.valid &&
    tuned.summary.unsafeProposed <= base.summary.unsafeProposed &&
    matchedCoverage;
  const improved = tuned.summary.materialExact > base.summary.materialExact;
  return {
    schemaVersion: 1,
    status: noRegression
      ? improved
        ? "quality-improved"
        : "quality-tied"
      : "rejected-regression",
    promoted: noRegression && improved,
    qualityImprovementMeasured: improved && noRegression,
    baseArtifact: base.artifact,
    tunedArtifact: tuned.artifact,
    evaluationSha256: base.evaluationSha256,
    caseCount: expectedCount,
    base: base.summary,
    tuned: tuned.summary,
    deltas: {
      materialExact: tuned.summary.materialExact - base.summary.materialExact,
      valid: tuned.summary.valid - base.summary.valid,
      proposed: tuned.summary.proposed - base.summary.proposed,
      unsafeProposed:
        tuned.summary.unsafeProposed - base.summary.unsafeProposed,
    },
    latency: {
      baseWarmMedianMs: median(base.rows.map((r) => r.latencyMs)),
      tunedWarmMedianMs: median(tuned.rows.map((r) => r.latencyMs)),
      baseProvisioningMs: base.provisioningMs,
      tunedProvisioningMs: tuned.provisioningMs,
      limit: `Sequential${expectedCount}-case descriptive timings, not a controlled significance test. Provisioning reported separately.`,
    },
    coverageMatchedOrHigher: matchedCoverage,
    gate: "Improve material accuracy with no regression in schema validity, unsafe proposals, or automatic coverage; exact same frozen cases/decoding. A tie is reported and retains the base extractor.",
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
