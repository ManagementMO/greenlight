import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";
import { scoreExtraction } from "../lib/providers/evaluation";
import { buildC120Showcase } from "../lib/providers/showcase";
import { compareEvaluations, EXTRACTOR_GATE_VERSION } from "./ml/compare-evaluations";
import { getScenario } from "../lib/domain";
import { loadProjectEnv } from "./ml/shared";

/** Publish the source-bound illustration from the gate-selected run, never a hand-written answer. */
async function main() {
  const env = loadProjectEnv();
  const savedComparison = JSON.parse(await readFile("work/ml/base-tuned-comparison.json", "utf8"));
  const [base, tuned] = await Promise.all(["base", "tuned"].map(async (label) =>
    JSON.parse(await readFile(`work/ml/evaluation-${label}.json`, "utf8"))));
  const comparison = compareEvaluations(base, tuned);
  const { verifiedAt: _savedAt, ...savedDeterministic } = savedComparison;
  const { verifiedAt: _freshAt, ...freshDeterministic } = comparison;
  if (!isDeepStrictEqual(savedDeterministic, freshDeterministic))
    throw new Error("The saved model selection differs from the recomputed fixed gate.");
  if (comparison.gateVersion !== EXTRACTOR_GATE_VERSION || comparison.promptProfile !== "json-schema-v4")
    throw new Error("A completed v4 comparison is required before selecting a showcase model.");
  const label = comparison.promoted ? "tuned" : "base";
  const run = label === "tuned" ? tuned : base;
  const selectedArtifact = comparison.promoted ? comparison.tunedArtifact : comparison.baseArtifact;
  if (run.status !== "completed" || !run.stopVerified ||
      run.evaluationSha256 !== comparison.evaluationSha256 ||
      run.promptContractSha256 !== comparison.promptContractSha256 ||
      !isDeepStrictEqual(run.artifact, selectedArtifact))
    throw new Error("Selected illustration does not belong to the completed, gate-selected experiment.");
  const source = buildC120Showcase();
  const actual = run.showcase;
  if (!actual || actual.sourceSha256 !== source.sourceSha256 ||
      actual.sourceId !== source.sourceId || actual.fullSourceText !== source.fullSourceText ||
      actual.sourceText !== source.sourceText || !isDeepStrictEqual(actual.context, source.context) ||
      actual.modelRevision !== run.artifact.revision || actual.includedInEvaluationMetrics !== false)
    throw new Error("The recorded model illustration is not bound to the exact current source excerpt.");
  if (typeof actual.modelOutput !== "string" || actual.modelOutput.length > 32768)
    throw new Error("The recorded illustration output must be a bounded string.");
  const score = scoreExtraction(actual.modelOutput, source.context, source.expected);
  if (!isDeepStrictEqual(score, actual.score))
    throw new Error("The recorded illustration disagrees with a fresh material-field check.");
  const evidence = JSON.parse(await readFile("data/artifacts/evidence-judgments.json", "utf8"));
  const fixture = getScenario("ductline-phase-delay")!;
  const currentEvidence = fixture.evidence.filter((source) =>
    ["signed-contract", "inspection-plan", "customer-email"].includes(source.id)
  ).map((source) => ({ id: source.id, companyId: fixture.company.id, jobId: fixture.job.id, text: source.text }));
  const currentEvidenceSha = createHash("sha256").update(JSON.stringify(currentEvidence)).digest("hex");
  if (evidence.origin !== "recorded" || evidence.jobId !== fixture.job.id ||
      evidence.companyId !== fixture.company.id || evidence.snapshotDate !== fixture.snapshotDate ||
      evidence.evidenceSha256 !== currentEvidenceSha)
    throw new Error("Recorded evidence suggestions are not from the expected disclosed job.");
  const artifact = {
    schemaVersion: 1,
    origin: "recorded",
    sourceId: source.sourceId,
    sourceSha256: source.sourceSha256,
    excerptSha256: createHash("sha256").update(source.sourceText).digest("hex"),
    modelRepo: run.artifact.repo,
    modelRevision: run.artifact.revision,
    generatedAt: run.completedAt,
    selectedByGate: label,
    gateVersion: comparison.gateVersion,
    candidate: score.parsed ?? null,
    materialExact: score.materialExact,
    rawOutput: actual.modelOutput,
    validationError: score.error ?? null,
    outputSha256: createHash("sha256").update(actual.modelOutput).digest("hex"),
    includedInEvaluationMetrics: false,
    detail: `Actual recorded output from the gate-selected ${label} artifact on this exact phase-clause excerpt. The C120 illustration is excluded from the protected 40-case metrics.`,
    judgmentModel: evidence.model,
    judgmentRunId: evidence.runId,
    judgmentEvidenceSha256: evidence.evidenceSha256,
    judgmentBoundary: "Model suggestions requiring owner review; not adjudicated factual truth or measured accuracy. They never activate a financial condition or receipt.",
    judgments: evidence.judgments.map((judgment: { predicate: string; verdict: string; confidence: number }) => ({
      predicate: judgment.predicate, verdict: judgment.verdict, confidence: judgment.confidence,
    })),
  };
  const serialized = JSON.stringify(artifact, null, 2) + "\n";
  for (const [name, value] of Object.entries(env))
    if (value && value.length > 12 && /API_KEY|AUTH_TOKEN|HF_TOKEN|OIDC_TOKEN|SECRET/.test(name) && serialized.includes(value))
      throw new Error("A credential match prevents showcase publication.");
  await writeFile("data/artifacts/extraction-demo.json", serialized);
  console.log(JSON.stringify({ published: "data/artifacts/extraction-demo.json", selected: label, materialExact: score.materialExact }));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Showcase publication failed");
  process.exitCode = 1;
});
