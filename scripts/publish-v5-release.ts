import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { SpendLedger, type BudgetSnapshot } from "../lib/budget/ledger";
import { validPublicV5Evaluation, type PublicV5Evaluation } from "../lib/public-extraction-evaluation";
import { assertReviewedV5Evaluation, V5_GATE, v5PromptHash } from "../lib/providers/evaluation-v5";
import { args, loadProjectEnv, saveJson } from "./ml/shared";
import { assertPublishedV5Showcase } from "../lib/providers/showcase-v5";

type RecordData = Record<string, any>;
type ReleaseInput = {
  current: RecordData;
  training: RecordData;
  trainingManifest: RecordData;
  tokenizerAudit: RecordData;
  tokenizerAuditSha256: string;
  trainingEvidence: RecordData;
  publication: RecordData;
  development?: unknown;
  final?: unknown;
  showcase?: RecordData;
  developmentManifest: RecordData;
  finalManifest: RecordData;
  budget: BudgetSnapshot;
  generatedAt: string;
};
const sha = (text: string) => createHash("sha256").update(text).digest("hex");
const date = (value: unknown) => typeof value === "string" && !Number.isNaN(Date.parse(value));
const hash = (value: unknown) => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
function pick<T extends RecordData>(record: T, keys: readonly string[]): RecordData {
  return Object.fromEntries(keys.filter(key => record[key] !== undefined).map(key => [key, record[key]]));
}

/** Explicit projections prevent private paths, raw responses or future fields leaking into the app. */
export function compactV5Evaluation(value: PublicV5Evaluation): PublicV5Evaluation {
  const run = (entry: PublicV5Evaluation["base"]) => ({
    artifact: {repo: entry.artifact.repo, revision: entry.artifact.revision},
    completedAt: entry.completedAt, stopVerified: entry.stopVerified, costSettled: entry.costSettled,
    summary: {
      ...pick(entry.summary, ["count", "valid", "materialExact", "statusCorrect", "proposed", "unsafeProposed", "expectedProposed", "correctSupportedProposals", "validityRate", "materialExactRate", "rawProposalRate", "correctSupportedProposalRate", "proposedPrecision"]),
      byExpectedStatus: Object.fromEntries(["PROPOSED", "AMBIGUOUS", "UNSUPPORTED"].map(status => [status,
        pick(entry.summary.byExpectedStatus[status as keyof typeof entry.summary.byExpectedStatus], ["count", "valid", "statusCorrect", "materialExact", "proposed", "unsafeProposed", "statusAccuracy", "materialExactRate"])])),
    },
  });
  return {
    schemaVersion: 1, origin: "recorded", dataClassification: "PUBLIC_SYNTHETIC",
    purpose: value.purpose, caseCount: value.caseCount, evaluationSha256: value.evaluationSha256,
    promptProfile: "reference-contract-v5", promptContractSha256: value.promptContractSha256,
    base: run(value.base), tuned: run(value.tuned),
    comparison: pick(value.comparison, ["status", "promoted", "gateVersion", "gate", "absoluteGatePassed", "qualityImprovementMeasured", "methodology", "detail"]),
  } as PublicV5Evaluation;
}

function bindEvaluation(value: unknown, manifest: RecordData, input: ReleaseInput, purpose: PublicV5Evaluation["purpose"]) {
  if (value === undefined) return undefined;
  assertReviewedV5Evaluation(manifest, purpose);
  if (!validPublicV5Evaluation(value, purpose) || value.caseCount !== manifest.evaluationCount ||
      value.evaluationSha256 !== manifest.hashes["evaluation.frozen.jsonl"] ||
      value.promptContractSha256 !== v5PromptHash() ||
      value.base.artifact.repo !== input.training.baseModel ||
      value.base.artifact.revision !== input.tokenizerAudit.baseRevisionObserved ||
      value.tuned.artifact.repo !== input.publication.repo ||
      value.tuned.artifact.revision !== input.publication.revision)
    throw new Error("Published V5 evaluation does not match its reviewed split, prompt and trained model export.");
  if (purpose === "final-evaluation") {
    if (value.comparison.gateVersion !== V5_GATE.version || !isDeepStrictEqual(manifest.gate, V5_GATE))
      throw new Error("Final evaluation uses a different release gate.");
  }
  if (manifest.statusCounts || purpose === "final-evaluation") {
    for (const status of ["PROPOSED", "AMBIGUOUS", "UNSUPPORTED"] as const) {
      const expected = manifest.statusCounts?.[status];
      if (!Number.isSafeInteger(expected) || expected < 1 ||
          value.base.summary.byExpectedStatus[status].count !== expected ||
          value.tuned.summary.byExpectedStatus[status].count !== expected)
        throw new Error("Evaluation class counts differ from the frozen manifest strata.");
    }
  }
  if (purpose === "final-evaluation") {
    const s = value.tuned.summary;
    const absolute = s.correctSupportedProposals / s.expectedProposed >= V5_GATE.minimumSupportedCoverage &&
      s.valid / s.count >= V5_GATE.minimumValidity &&
      s.byExpectedStatus.AMBIGUOUS.statusCorrect / s.byExpectedStatus.AMBIGUOUS.count >= V5_GATE.minimumUncertaintyStatusAccuracy &&
      s.byExpectedStatus.UNSUPPORTED.statusCorrect / s.byExpectedStatus.UNSUPPORTED.count >= V5_GATE.minimumUncertaintyStatusAccuracy &&
      s.unsafeProposed === V5_GATE.maximumIncorrectValidatedProposals;
    const b = value.base.summary;
    const noRegression = s.materialExact >= b.materialExact && s.valid >= b.valid &&
      s.correctSupportedProposals >= b.correctSupportedProposals && s.unsafeProposed <= b.unsafeProposed;
    const improved = s.materialExact > b.materialExact;
    const relative = improved && noRegression;
    const relativeStatus = noRegression ? improved ? "quality-improved" : "quality-tied" : "rejected-regression";
    const status = absolute ? relativeStatus : "rejected-usefulness-or-safety";
    if (value.comparison.absoluteGatePassed !== absolute ||
        value.comparison.qualityImprovementMeasured !== relative ||
        value.comparison.promoted !== (absolute && relative) ||
        value.comparison.status !== status)
      throw new Error("Final evaluation verdict contradicts its measured outcomes.");
  }
  return compactV5Evaluation(value);
}

/** No held-out labels are read here: publish-v5-evaluations verifies raw predictions first. */
export function buildV5Release(input: ReleaseInput) {
  const {training: t, trainingManifest: m, tokenizerAudit: a, trainingEvidence: e, publication: p} = input;
  if (input.current.schemaVersion !== 1 || !date(input.generatedAt) ||
      t.mode !== "real-veri-sft" || t.state !== "completed" || t.cleanupVerified !== true ||
      t.promptProfile !== "reference-contract-v5" || m.promptProfile !== t.promptProfile ||
      m.promptContractSha256 !== v5PromptHash() || m.dataClassification !== "PUBLIC_SYNTHETIC" ||
      t.dataVersion !== m.version || t.datasetSha256 !== m.hashes?.["train.jsonl"] ||
      !hash(t.datasetSha256) || t.datasetSha256 !== a.trainingSha256 ||
      t.tokenizerAuditSha256 !== input.tokenizerAuditSha256 || t.rows !== m.trainingCount ||
      !Number.isSafeInteger(t.rows) || t.rows < 1 || t.baseModel !== a.baseModel ||
      a.dataVersion !== t.dataVersion || a.promptProfile !== t.promptProfile || a.examples !== t.rows ||
      a.maxSeqLength !== t.maxSeqLength || a.truncatedExamplesAtMaxSeqLength !== 0 ||
      a.allPromptTokenPrefixesMatch !== true || !Number.isSafeInteger(a.maxTokens) || a.maxTokens > t.maxSeqLength ||
      !Number.isSafeInteger(t.maxSteps) || t.maxSteps < 1 || !date(t.completedAt) ||
      e.jobId !== t.jobId || e.source !== "provider-worker-log" || !hash(e.logSha256) ||
      e.finalCheckpointStep !== t.maxSteps || !date(e.checkedAt) ||
      p.repo !== t.repo || !/^[\w.-]+\/[\w.-]+$/.test(p.repo) || !/^[a-f0-9]{40}$/.test(p.revision) ||
      p.public !== true || p.anonymousConfigHttp !== 200 || !date(p.verifiedAt) ||
      t.exportUrl !== `https://huggingface.co/${p.repo}`)
    throw new Error("Release requires the completed, checkpoint-verified V5 training run, exact tokenizer audit and public model export.");
  const charge = input.budget.entries.find(entry => entry.id === t.reservationId);
  if (!charge || charge.provider !== "veri" || charge.state !== "settled" ||
      !Number.isSafeInteger(charge.actualCents) || charge.actualCents! < 0 || !date(charge.settledAt))
    throw new Error("Training cost must be reconciled in the budget ledger before publication.");
  const development = bindEvaluation(input.development, input.developmentManifest, input, "development-only");
  const final = bindEvaluation(input.final, input.finalManifest, input, "final-evaluation");
  if (final && !development) throw new Error("Publish the development record before the final release result.");
  if ((input.current.extractionV5Development && !development) || (input.current.extractionV5Final && !final))
    throw new Error("Refusing to erase a published V5 result because its source artifact is missing.");
  const serving = final?.tuned ?? development?.tuned;
  const training = {
    status: "completed", baseModel: t.baseModel, jobId: t.jobId, modelRepo: p.repo, modelRevision: p.revision,
    detail: `${t.rows} examples, ${e.finalCheckpointStep} optimizer steps. V5 reference-contract extraction; training completion is separate from evaluation and deployment.`,
    stages: [
      {name: "V5 dataset", status: "verified", detail: `${t.rows} synthetic examples; SHA-256 ${t.datasetSha256}. Developer-reviewed labels, not customer adjudication.`},
      {name: "V5 fine-tuning", status: "completed", detail: `${e.finalCheckpointStep} of ${t.maxSteps} steps verified in the provider worker checkpoint log. Completion-only loss is intended; the remote effective loss mask is not attested.`},
      {name: "V5 merged export", status: "verified", detail: "Public Hugging Face configuration verified. Observed repository revision identifies the export, not the provider's effective loaded weights."},
      {name: "V5 serving inference", status: serving ? "verified" : "pending", detail: serving ? "Recorded model responses returned; serving resources stopped and final costs settled. This is evaluation serving, not a public live endpoint." : "Awaiting a complete, validated public serving evaluation with resource cleanup and settled costs."},
      {name: "V5 development", status: development ? "completed" : "pending", detail: development ? `${development.caseCount} frozen development cases compared. Development cannot authorize promotion.` : "Development comparison is not yet published."},
      {name: "V5 final gate", status: final ? final.comparison.promoted ? "passed" : "blocked" : "pending", detail: final ? `${final.caseCount} frozen final cases. ${final.comparison.promoted ? "Predeclared gate passed; owner review remains mandatory and public live inference stays off." : "Candidate not promoted. Relative improvement does not override the usefulness and safety gate."}` : "Final evaluation and gate result are not yet published."},
    ],
  };
  const budget = {capUsd: input.budget.capUsd, spentUsd: input.budget.spentUsd, reservedUsd: input.budget.reservedUsd,
    detail: "Budget ledger snapshot; reconciled charges are conservatively rounded per call. Reservations stay held while final charges are uncertain."};
  const publicTraining = {
    schemaVersion: 1, origin: "recorded", dataClassification: "PUBLIC_SYNTHETIC", publishedAt: input.generatedAt,
    status: "completed", dataVersion: t.dataVersion, promptProfile: t.promptProfile, promptContractSha256: v5PromptHash(),
    datasetSha256: t.datasetSha256, rows: t.rows, baseModel: t.baseModel, baseRevisionObserved: a.baseRevisionObserved,
    modelRepo: p.repo, modelRevision: p.revision, jobId: t.jobId, maxSteps: t.maxSteps, finalCheckpointStep: e.finalCheckpointStep,
    maxSeqLength: t.maxSeqLength, maxTrainingTokens: a.maxTokens, truncatedExamples: a.truncatedExamplesAtMaxSeqLength,
    tokenizerAuditSha256: input.tokenizerAuditSha256, workerLogSha256: e.logSha256,
    checkpointCheckedAt: e.checkedAt, completedAt: t.completedAt, exportVerifiedAt: p.verifiedAt,
    cleanupVerified: true, costUsd: charge.actualCents! / 100, costSettled: true, costSettledAt: charge.settledAt,
    costSource: "reconciled project budget ledger", publicLiveInference: false,
    remoteEffectiveLossMaskAttested: false, servingVerified: Boolean(serving),
    developmentPublished: Boolean(development), finalPublished: Boolean(final), promoted: final?.comparison.promoted ?? false,
    servingBoundary: "Recorded evaluation only. Public decisions use fixed code and saved evidence; every proposed term requires owner review.",
  };
  const current: RecordData = {...input.current, generatedAt: input.generatedAt, training, budget};
  if (input.current.training?.modelRepo && input.current.training.modelRepo !== p.repo) {
    const history = Array.isArray(input.current.trainingHistory) ? [...input.current.trainingHistory] : [];
    if (!history.some(item => item.modelRepo === input.current.training.modelRepo && item.jobId === input.current.training.jobId))
      history.push(input.current.training);
    current.trainingHistory = history;
  }
  delete current.extractionV5Development;
  delete current.extractionV5Final;
  if (development) current.extractionV5Development = development;
  if (final) current.extractionV5Final = final;
  if (input.showcase) {
    if (!final) throw new Error("V5 showcase cannot be released without a final evaluation.");
    assertPublishedV5Showcase(input.showcase, final);
    current.extractionDemo = input.showcase;
  }
  return {current, publicTraining};
}

async function readJson(path: string, optional = false) {
  try { return JSON.parse(await readFile(resolve(path), "utf8")); }
  catch (error) { if (optional && (error as NodeJS.ErrnoException).code === "ENOENT") return undefined; throw error; }
}
async function main() {
  const options = args();
  if (typeof options["training-run"] !== "string") throw new Error("Provide --training-run work/ml/ACTUAL_V5_TRAINING_RECORD.json");
  const env = loadProjectEnv();
  const training = await readJson(options["training-run"]);
  if (typeof training.jobId !== "string" || !/^[a-zA-Z0-9_-]+$/.test(training.jobId) || typeof training.repo !== "string")
    throw new Error("Training identity is missing or malformed.");
  const auditBytes = await readFile("data/training/v5-reference-contract/tokenizer-audit.json", "utf8");
  const input: ReleaseInput = {
    current: await readJson("data/artifacts/current.json"), training,
    trainingManifest: await readJson("data/training/v5-reference-contract/manifest.json"),
    tokenizerAudit: JSON.parse(auditBytes), tokenizerAuditSha256: sha(auditBytes),
    trainingEvidence: await readJson(`work/ml/${training.jobId}.training-evidence.json`),
    publication: await readJson(`work/ml/published-${basename(training.repo)}.json`),
    development: await readJson("data/artifacts/extraction-v5-development.json", true),
    final: await readJson("data/artifacts/extraction-v5-evaluation.json", true),
    showcase: await readJson("data/artifacts/extraction-v5-demo.json", true),
    developmentManifest: await readJson("data/evaluation/v5-development/manifest.json"),
    finalManifest: await readJson("data/evaluation/v5-final/manifest.json"),
    budget: await new SpendLedger(resolve("work/budget/ledger.json")).snapshot(), generatedAt: new Date().toISOString(),
  };
  const result = buildV5Release(input), serialized = JSON.stringify(result);
  for (const [name, value] of Object.entries(env)) if (value && value.length > 12 &&
      /API_KEY|AUTH_TOKEN|HF_TOKEN|OIDC_TOKEN|SECRET/.test(name) && serialized.includes(value))
    throw new Error("Credential match prevents release publication.");
  if (!options["dry-run"]) {
    await saveJson("data/artifacts/training-v5.json", result.publicTraining);
    await saveJson("data/artifacts/current.json", result.current);
  }
  console.log(JSON.stringify({dryRun: Boolean(options["dry-run"]), published: options["dry-run"] ? [] : ["data/artifacts/training-v5.json", "data/artifacts/current.json"],
    training: result.publicTraining.status, developmentPublished: result.publicTraining.developmentPublished,
    finalPublished: result.publicTraining.finalPublished, promoted: result.publicTraining.promoted, budget: result.current.budget}));
}
if (process.argv[1]?.endsWith("publish-v5-release.ts")) main().catch(error => {
  console.error(error instanceof Error ? error.message : "V5 release publication failed"); process.exitCode = 1;
});
