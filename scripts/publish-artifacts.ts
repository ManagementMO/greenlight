import { readFile, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { SpendLedger } from "../lib/budget/ledger";

// Private run records never get copied wholesale. This is the public allowlist.
type RecordData = Record<string, any>;
async function readJson(path: string): Promise<RecordData | null> {
  try {
    return JSON.parse(await readFile(resolve(path), "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}
async function main() {
  const current = (await readJson("data/artifacts/current.json"))!;
  const smoke = await readJson("work/ml/provider-smoke.json");
  const telemetry = await readJson("work/observability/evidence.json");
  const names = await readdir(resolve("work/ml")).catch(() => [] as string[]);
  const runs = (
    await Promise.all(
      names
        .filter((name) => /^veri-training-.*\.json$/.test(name))
        .map((name) => readJson("work/ml/" + name)),
    )
  )
    .filter((run): run is RecordData => run?.mode === "real-veri-sft")
    .sort((a, b) =>
      String(b.completedAt ?? b.verifiedAt ?? b.startedAt ?? "").localeCompare(
        String(a.completedAt ?? a.verifiedAt ?? a.startedAt ?? ""),
      ),
    );
  const training = runs[0];
  const evaluations = (
    await Promise.all(
      ["proof", "base", "tuned"].map((label) =>
        readJson("work/ml/evaluation-" + label + ".json"),
      ),
    )
  ).filter(Boolean) as RecordData[];
  const serving = evaluations.find(
    (run) =>
      run.artifact?.repo === training?.repo &&
      run.stopVerified &&
      run.status === "completed",
  );
  const comparison = await readJson("work/ml/base-tuned-comparison.json");
  const budget = await new SpendLedger(
    resolve("work/budget/ledger.json"),
  ).snapshot();
  const verifiedAt = smoke?.checkedAt;
  current.generatedAt = new Date().toISOString();
  current.providers = [
    {
      provider: "Anthropic",
      status: smoke?.inference?.anthropic ? "verified" : "pending",
      origin: "recorded",
      model: smoke?.inference?.anthropic?.model,
      checkedAt: verifiedAt,
      detail:
        "Real inference and bounded MetaHarness configuration author. Experiment results are saved; opening this page makes no paid calls.",
    },
    {
      provider: "TypeSafe / Jev",
      status: smoke?.inference?.jev ? "verified" : "pending",
      origin: "recorded",
      model: smoke?.inference?.jev?.model,
      checkedAt: verifiedAt,
      detail:
        "Real atomic evidence judgments and the matched baseline/candidate experiment. Same model, propositions, evidence, accuracy and coverage on the recorded workload.",
    },
    {
      provider: "Veri",
      status: training?.state === "completed" ? "verified" : "pending",
      origin: "recorded",
      checkedAt: training?.completedAt,
      detail:
        "Real SFT job, adapter checkpoint and standalone merged Hugging Face export. Serving and quality are separate checks below.",
    },
    {
      provider: "Hugging Face",
      status: training?.exportUrl ? "verified" : "pending",
      origin: "recorded",
      checkedAt: training?.completedAt,
      detail:
        "Export is in the owner namespace. Repository revision is recorded when serving is verified; a repository SHA is not a provider attestation of loaded weights.",
    },
    {
      provider: "Sentry",
      status: telemetry ? "verified" : "pending",
      origin: "recorded",
      checkedAt: telemetry?.verifiedAt,
      detail: telemetry
        ? "Actual oversized-response defect captured with a readable TypeScript frame, trace and log. Regression now bounds public input, calculation and output."
        : "Errors, traces, logs and masked replay configured; ingestion verification pending.",
    },
  ];
  if (training) {
    const proof = training.maxSteps <= 4;
    current.training = {
      status:
        training.state === "completed"
          ? serving
            ? "completed"
            : "running"
          : training.state === "failed"
            ? "failed"
            : "running",
      baseModel: training.baseModel,
      jobId: training.jobId,
      modelRepo: training.repo,
      modelRevision: serving?.artifact?.revision,
      detail: `${training.rows} examples, ${training.maxSteps} optimizer steps. ${proof ? "Technical path proof only; this tiny run is not evidence of improved extraction quality." : "Supervised payment-clause extraction; quality is assessed by a separate frozen base/tuned comparison."}`,
      stages: [
        {
          name: "Dataset",
          status: "verified",
          detail: `${training.rows} examples; SHA-256 ${training.datasetSha256}. Template-reviewed synthetic labels, not independent human adjudication.`,
        },
        {
          name: "Fine-tuning",
          status:
            training.state === "completed"
              ? "completed"
              : training.state === "failed" || training.state === "cancelled"
                ? "failed"
                : "running",
          detail: `${training.currentStep ?? 0} of ${training.maxSteps} steps recorded. Completion-only training intended; the remote effective loss mask is not directly attested.`,
        },
        {
          name: "Merged export",
          status: training.exportUrl ? "verified" : "pending",
          detail: training.exportUrl
            ? "Standalone merged model exported; serving script checks config, tokenizer and weights."
            : "Waiting for completed merged export.",
        },
        {
          name: "Serving canary",
          status: serving ? "verified" : "pending",
          detail: serving
            ? `Real inference returned; GPU stop verified. ${serving.canary?.score?.materialExact ? "Training canary matched." : "Training canary quality is shown separately; serving alone does not establish correctness."}`
            : "Awaiting real deployment inference and permanent stop verification.",
        },
      ],
    };
  }
  current.evaluations = evaluations.map((run) => ({
    id: run.reservationId,
    name:
      run.label === "proof"
        ? "Merged model serving proof — training canary only"
        : `${run.label} · frozen extraction evaluation`,
    origin: "recorded",
    model: run.artifact?.repo,
    sampleCount: run.rows?.length ?? 0,
    metrics: run.summary
      ? Object.fromEntries(
          Object.entries(run.summary).filter(
            ([, value]) => typeof value === "number" && Number.isFinite(value),
          ),
        )
      : {
          canaryValid: Number(Boolean(run.canary?.score?.valid)),
          canaryExact: Number(Boolean(run.canary?.score?.materialExact)),
        },
    detail: `${run.status}. ${run.stopVerified ? "GPU permanently stopped and read back." : "GPU cleanup verification incomplete."} ${run.label === "proof" ? "No frozen test cases queried in this technical proof." : "Same immutable evaluation examples and decoding are required for a promotion comparison."}`,
  }));
  if (comparison)
    current.extractionComparison = {
      status: comparison.status,
      promoted: comparison.promoted,
      caseCount: comparison.caseCount,
      gateVersion: comparison.gateVersion,
      base: comparison.base,
      tuned: comparison.tuned,
      deltas: comparison.deltas,
      gate: comparison.gate,
      verifiedAt: comparison.verifiedAt,
      origin: "recorded",
      methodology: comparison.methodology,
      baseArtifact: comparison.baseArtifact,
      tunedArtifact: comparison.tunedArtifact,
      latency: comparison.latency,
      detail:
        "Genuine sequential inference on the same frozen synthetic clauses compares the original base and trained/exported artifact pipelines. Quantization and possibly serving precision differ, so the comparison does not isolate fine-tuning alone. Proposals require owner review and do not activate financial terms.",
      evaluationSha256: comparison.evaluationSha256,
    };
  current.budget = {
    capUsd: budget.capUsd,
    spentUsd: budget.spentUsd,
    reservedUsd: budget.reservedUsd,
    detail:
      "Booked model costs are conservatively rounded per call. GPU reservations remain held while final provider charges are uncertain.",
  };
  if (telemetry)
    current.observability = {
      issueUrl: telemetry.issueUrl,
      traceUrl: telemetry.traceUrl,
      productionTraceUrl: telemetry.productionTraceUrl,
      evidenceTraceUrl: telemetry.evidenceTraceUrl,
      replayUrl: telemetry.replayUrl,
      firstPartyFrame: telemetry.firstPartyFrame,
      verifiedAt: telemetry.verifiedAt,
      environment: telemetry.environment,
    };
  const extractionDemo = await readJson("data/artifacts/extraction-demo.json");
  if (extractionDemo) current.extractionDemo = extractionDemo;
  await writeFile(
    resolve("data/artifacts/current.json"),
    JSON.stringify(current, null, 2) + "\n",
  );
  console.log(
    JSON.stringify({
      published: "data/artifacts/current.json",
      training: current.training.status,
      evaluationRuns: evaluations.length,
      spentUsd: budget.spentUsd,
      reservedUsd: budget.reservedUsd,
    }),
  );
}
main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Artifact publication failed",
  );
  process.exitCode = 1;
});
