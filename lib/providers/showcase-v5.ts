import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { getScenario } from "../domain";
import { validPublicV5Evaluation, type PublicV5Evaluation } from "../public-extraction-evaluation";
import { scoreExtraction } from "./evaluation";
import { v5PromptHash, V5_GATE } from "./evaluation-v5";
import { buildC120Showcase } from "./showcase";

type RecordData = Record<string, any>;
const sha = (text: string) => createHash("sha256").update(text).digest("hex");

/** Select by the final gate, not by whichever single showcase response looks best. */
export function buildV5Showcase(final: PublicV5Evaluation, run: RecordData, evidence: RecordData) {
  if (!validPublicV5Evaluation(final, "final-evaluation") || final.comparison.gateVersion !== V5_GATE.version)
    throw new Error("A complete V5 final evaluation is required before selecting a showcase model.");
  const label = final.comparison.promoted ? "tuned" : "base", selected = final[label];
  if (run.label !== `v5-${label}-final` || run.status !== "completed" || run.stopVerified !== true || run.costSettled !== true ||
      run.artifact?.repo !== selected.artifact.repo || run.artifact?.revision !== selected.artifact.revision ||
      run.evaluationSha256 !== final.evaluationSha256 || run.promptContractSha256 !== v5PromptHash() ||
      run.promptProfile !== "reference-contract-v5" || run.completedAt !== selected.completedAt ||
      run.showcase?.modelRevision !== selected.artifact.revision)
    throw new Error("Showcase must come from the completed, settled V5 final gate-selected run.");
  const source = buildC120Showcase(), actual = run.showcase;
  if (!actual || actual.sourceId !== source.sourceId || actual.sourceSha256 !== source.sourceSha256 ||
      actual.fullSourceText !== source.fullSourceText || actual.sourceText !== source.sourceText ||
      !isDeepStrictEqual(actual.context, source.context) || actual.includedInEvaluationMetrics !== false ||
      typeof actual.modelOutput !== "string" || actual.modelOutput.length > 32768)
    throw new Error("Recorded showcase does not match the exact current source and bounded actual output.");
  const score = scoreExtraction(actual.modelOutput, source.context, source.expected);
  if (!isDeepStrictEqual(actual.score, score))
    throw new Error("Showcase material check differs from its actual recorded response.");
  const fixture = getScenario("ductline-phase-delay")!;
  const currentEvidence = fixture.evidence.filter(item => ["signed-contract", "inspection-plan", "customer-email"].includes(item.id))
    .map(item => ({id: item.id, companyId: fixture.company.id, jobId: fixture.job.id, text: item.text}));
  if (evidence.origin !== "recorded" || evidence.jobId !== fixture.job.id || evidence.companyId !== fixture.company.id ||
      evidence.snapshotDate !== fixture.snapshotDate || evidence.evidenceSha256 !== sha(JSON.stringify(currentEvidence)) ||
      !Array.isArray(evidence.judgments) || evidence.judgments.some((judgment: RecordData) =>
        typeof judgment.predicate !== "string" || !["MET", "NOT_MET", "UNKNOWN", "CONFLICTING"].includes(judgment.verdict) ||
        typeof judgment.confidence !== "number" || judgment.confidence < 0 || judgment.confidence > 1))
    throw new Error("Recorded Jev suggestions do not match the current disclosed job evidence.");
  return {
    schemaVersion: 1, origin: "recorded", dataClassification: "PUBLIC_SYNTHETIC", promptProfile: "reference-contract-v5",
    sourceId: source.sourceId, sourceSha256: source.sourceSha256, excerptSha256: sha(source.sourceText),
    modelRepo: selected.artifact.repo, modelRevision: selected.artifact.revision, generatedAt: run.completedAt,
    selectedByGate: label, gateVersion: final.comparison.gateVersion, finalEvaluationSha256: final.evaluationSha256,
    promptContractSha256: final.promptContractSha256, candidate: score.parsed ?? null, materialExact: score.materialExact,
    rawOutput: actual.modelOutput, outputSha256: sha(actual.modelOutput), validationError: score.error ?? null,
    includedInEvaluationMetrics: false,
    detail: `Actual V5-prompt output from the final gate-selected ${label} artifact on this exact phase clause. This C120 illustration is excluded from the ${final.caseCount} final cases and cannot override the release gate.`,
    judgmentModel: evidence.model, judgmentRunId: evidence.runId, judgmentEvidenceSha256: evidence.evidenceSha256,
    judgmentBoundary: "Model suggestions requiring owner review; not adjudicated factual truth or measured accuracy. They never activate a financial condition or receipt.",
    judgments: evidence.judgments.map((judgment: RecordData) => ({predicate: judgment.predicate, verdict: judgment.verdict, confidence: judgment.confidence})),
  };
}

/** Recheck the app-facing artifact without reading held-out labels or changing raw output. */
export function assertPublishedV5Showcase(value: RecordData, final: PublicV5Evaluation) {
  const selected = final.comparison.promoted ? "tuned" : "base", source = buildC120Showcase();
  if (!validPublicV5Evaluation(final, "final-evaluation") || value.schemaVersion !== 1 || value.origin !== "recorded" ||
      value.promptProfile !== "reference-contract-v5" || value.promptContractSha256 !== v5PromptHash() ||
      value.selectedByGate !== selected || value.gateVersion !== V5_GATE.version || value.finalEvaluationSha256 !== final.evaluationSha256 ||
      value.modelRepo !== final[selected].artifact.repo || value.modelRevision !== final[selected].artifact.revision ||
      value.generatedAt !== final[selected].completedAt || value.sourceId !== source.sourceId || value.sourceSha256 !== source.sourceSha256 ||
      value.excerptSha256 !== sha(source.sourceText) || value.includedInEvaluationMetrics !== false ||
      typeof value.rawOutput !== "string" || value.rawOutput.length > 32768 || value.outputSha256 !== sha(value.rawOutput))
    throw new Error("V5 source illustration is not bound to the current final selection, source and actual output.");
  const score = scoreExtraction(value.rawOutput, source.context, source.expected);
  if (!isDeepStrictEqual(value.candidate, score.parsed ?? null) || value.materialExact !== score.materialExact || value.validationError !== (score.error ?? null))
    throw new Error("V5 source illustration candidate was changed or repaired after inference.");
}
