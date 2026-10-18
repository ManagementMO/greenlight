import { describe, expect, it } from "vitest";
import { buildV5Release } from "../../scripts/publish-v5-release";
import { V5_GATE, v5PromptHash } from "../../lib/providers/evaluation-v5";
import { summarizeExtraction, type ExtractionScore } from "../../lib/providers/evaluation";

type Input = Parameters<typeof buildV5Release>[0];
const digest = "d".repeat(64), revision = "a".repeat(40), timestamp = "2026-10-18T03:30:00Z";
function manifest(purpose: "development-only" | "final-evaluation") {
  return {version: purpose, promptProfile: "reference-contract-v5", promptContractSha256: v5PromptHash(),
    dataClassification: "PUBLIC_SYNTHETIC", purpose, evaluationCount: purpose === "development-only" ? 24 : 48,
    frozen: true, reviewStatus: "independently-audited-before-query", hashes: {"evaluation.frozen.jsonl": digest},
    independentAudit: {evaluationSha256: digest}, gate: V5_GATE,
    ...(purpose === "final-evaluation" ? {statusCounts: {PROPOSED: 32, AMBIGUOUS: 8, UNSUPPORTED: 8}} : {})};
}
function fixture(): Input {
  return {
    current: {schemaVersion: 1, training: {modelRepo: "owner/v4", jobId: "v4", detail: "Historical V4."}, extractionComparison: {status: "v4-rejected"}, evaluations: [{id: "v4"}], providers: [], experiments: []},
    training: {mode: "real-veri-sft", state: "completed", cleanupVerified: true, promptProfile: "reference-contract-v5", dataVersion: "v5", datasetSha256: digest,
      tokenizerAuditSha256: digest, rows: 336, baseModel: "owner/base", maxSeqLength: 2048, maxSteps: 300, completedAt: timestamp, jobId: "train-v5",
      repo: "owner/v5", exportUrl: "https://huggingface.co/owner/v5", reservationId: "v5-cost", costUsd: 0, costSettled: false, datasetFile: "/private/path", privateCanary: "private canary"},
    trainingManifest: {promptProfile: "reference-contract-v5", promptContractSha256: v5PromptHash(), dataClassification: "PUBLIC_SYNTHETIC", version: "v5", hashes: {"train.jsonl": digest}, trainingCount: 336},
    tokenizerAudit: {trainingSha256: digest, baseModel: "owner/base", baseRevisionObserved: revision, dataVersion: "v5", promptProfile: "reference-contract-v5", examples: 336,
      maxSeqLength: 2048, truncatedExamplesAtMaxSeqLength: 0, allPromptTokenPrefixesMatch: true, maxTokens: 1631}, tokenizerAuditSha256: digest,
    trainingEvidence: {jobId: "train-v5", source: "provider-worker-log", logSha256: digest, finalCheckpointStep: 300, checkedAt: timestamp},
    publication: {repo: "owner/v5", revision, public: true, anonymousConfigHttp: 200, verifiedAt: timestamp},
    developmentManifest: manifest("development-only"), finalManifest: manifest("final-evaluation"), generatedAt: timestamp,
    budget: {schemaVersion: 1, capCents: 2000, spentCents: 71, reservedCents: 0, availableCents: 1929, capUsd: 20, spentUsd: .71, reservedUsd: 0,
      entries: [{id: "v5-cost", provider: "veri", purpose: "train", state: "settled", maxCents: 200, actualCents: 71, createdAt: timestamp, settledAt: timestamp, evidence: "terminal charge"}]},
  };
}
function evaluation(purpose: "development-only" | "final-evaluation") {
  const count = purpose === "development-only" ? 24 : 48;
  const scores: ExtractionScore[] = Array.from({length: count}, (_, i) => {
    const status = i < count * 2 / 3 ? "PROPOSED" : i < count * 5 / 6 ? "AMBIGUOUS" : "UNSUPPORTED";
    return {expectedStatus: status, valid: true, materialExact: true, proposed: status === "PROPOSED", unsafeProposed: false, statusCorrect: true};
  });
  const run = (repo: string, tuned: boolean) => ({artifact: {repo, revision}, completedAt: timestamp, stopVerified: true, costSettled: true,
    summary: summarizeExtraction(tuned ? scores : scores.map(s => ({...s, valid: false, materialExact: false, proposed: false, statusCorrect: false}))),
    rows: [{privateCanary: "must not enter compact manifest"}], privatePath: "/private/run"});
  return {schemaVersion: 1, origin: "recorded", dataClassification: "PUBLIC_SYNTHETIC", purpose, caseCount: count, evaluationSha256: digest,
    promptProfile: "reference-contract-v5", promptContractSha256: v5PromptHash(), base: run("owner/base", false), tuned: run("owner/v5", true),
    comparison: purpose === "development-only" ? {status: "development-only", promoted: false, detail: "Development only."} :
      {status: "quality-improved", promoted: true, gateVersion: V5_GATE.version, gate: "The fixed gate.", absoluteGatePassed: true, qualityImprovementMeasured: true},
    debugPrivate: "never copy"};
}

describe("V5 public release publication", () => {
  it("publishes actual checkpoint and reconciled cost without private run fields or an evaluation claim", () => {
    const {current, publicTraining} = buildV5Release(fixture());
    expect(publicTraining.costUsd).toBe(.71);
    expect(publicTraining.finalCheckpointStep).toBe(300);
    expect(publicTraining.servingVerified).toBe(false);
    expect(publicTraining.finalPublished).toBe(false);
    expect(publicTraining.promoted).toBe(false);
    expect(current.training.stages.find((s: {name: string}) => s.name === "V5 serving inference").status).toBe("pending");
    expect(JSON.stringify(publicTraining)).not.toMatch(/private\/path|privateCanary|datasetFile/);
  });
  it("preserves V4 comparison, evaluations and training history across repeat publication", () => {
    const input = fixture(), first = buildV5Release(input);
    expect(first.current.extractionComparison).toEqual(input.current.extractionComparison);
    expect(first.current.evaluations).toEqual(input.current.evaluations);
    expect(first.current.trainingHistory).toEqual([input.current.training]);
    expect(buildV5Release({...input, current: first.current}).current.trainingHistory).toEqual([input.current.training]);
  });
  it("rejects incomplete checkpoints, mismatched audits/exports and unsettled training costs", () => {
    const changes: ((input: Input) => void)[] = [
      i => {i.trainingEvidence.finalCheckpointStep = 299;},
      i => {i.training.state = "running";},
      i => {i.tokenizerAuditSha256 = "e".repeat(64);},
      i => {i.tokenizerAudit.truncatedExamplesAtMaxSeqLength = 1;},
      i => {i.publication.repo = "owner/different";},
      i => {i.budget.entries[0].state = "reserved";},
    ];
    for (const change of changes) {const input = fixture(); change(input); expect(() => buildV5Release(input)).toThrow();}
  });
  it("binds evaluations to the trained export and excludes raw rows and extra fields from compact output", () => {
    const input = fixture(); input.development = evaluation("development-only"); input.final = evaluation("final-evaluation");
    const result = buildV5Release(input);
    expect(result.publicTraining.promoted).toBe(true);
    expect(result.current.extractionV5Final.comparison.promoted).toBe(true);
    expect(JSON.stringify(result)).not.toMatch(/privateCanary|privatePath|debugPrivate|must not enter/);
    const wrong = evaluation("final-evaluation"); wrong.tuned.artifact.revision = "b".repeat(40); input.final = wrong;
    expect(() => buildV5Release(input)).toThrow("does not match");
  });
  it("refuses contradictory promotion and missing development evidence", () => {
    const input = fixture(), final = evaluation("final-evaluation"); input.final = final;
    expect(() => buildV5Release(input)).toThrow("development record");
    input.development = evaluation("development-only"); final.comparison.promoted = false;
    expect(() => buildV5Release(input)).toThrow("contradicts");
  });
  it("derives the exact final status rather than trusting a success label", () => {
    const input = fixture(), final = evaluation("final-evaluation");
    input.development = evaluation("development-only"); input.final = final;
    final.tuned.summary = structuredClone(final.base.summary);
    Object.assign(final.comparison, {promoted: false, absoluteGatePassed: false, qualityImprovementMeasured: false});
    expect(() => buildV5Release(input)).toThrow("contradicts");
    final.comparison.status = "rejected-usefulness-or-safety";
    expect(buildV5Release(input).publicTraining.promoted).toBe(false);
    const perfect = evaluation("final-evaluation");
    final.base.summary = structuredClone(perfect.tuned.summary);
    final.tuned.summary = structuredClone(perfect.tuned.summary);
    Object.assign(final.comparison, {absoluteGatePassed: true, status: "quality-tied"});
    expect(buildV5Release(input).current.extractionV5Final.comparison.status).toBe("quality-tied");
    final.tuned.summary.materialExact -= 1;
    expect(() => buildV5Release(input)).toThrow("contradicts");
    final.comparison.status = "rejected-regression";
    expect(buildV5Release(input).current.extractionV5Final.comparison.status).toBe("rejected-regression");
  });
  it("binds both base and tuned class denominators to the manifest", () => {
    for (const label of ["base", "tuned"] as const) {
      const input = fixture(), final = evaluation("final-evaluation");
      input.development = evaluation("development-only"); input.final = final;
      const s = final[label].summary;
      s.expectedProposed += 1;
      s.byExpectedStatus.PROPOSED.count += 1;
      s.byExpectedStatus.AMBIGUOUS.count -= 1;
      s.byExpectedStatus.AMBIGUOUS.statusCorrect = Math.min(s.byExpectedStatus.AMBIGUOUS.statusCorrect, 7);
      expect(() => buildV5Release(input)).toThrow("strata");
    }
  });
  it("does not silently erase a previously published result", () => {
    const input = fixture(); input.current.extractionV5Development = evaluation("development-only");
    expect(() => buildV5Release(input)).toThrow("Refusing to erase");
  });
});
