import { readFile } from "node:fs/promises";
import { resolve, dirname, basename } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import {
  VeriClient,
  VeriJob,
  boundedTrainingRequest,
  DEFAULT_BASE_MODEL,
} from "../../lib/providers/veri";
import { usdToCentsCeil } from "../../lib/budget/ledger";
import {
  args,
  intArg,
  loadProjectEnv,
  ledger,
  saveJson,
  pause,
  now,
  publicError,
} from "./shared";
import {
  SubmissionIdentity,
  submitExactlyOnce,
  stopAndVerify,
  isTerminal,
} from "../../lib/providers/lifecycle";
import {
  startRecoveryGuard,
  persistRecovery,
  finishRecovery,
} from "./recovery-guard";
export async function train() {
  const env = loadProjectEnv(),
    a = args(),
    client = new VeriClient({ apiKey: env.VERI_API_KEY ?? "" }),
    budget = ledger();
  const timeoutSeconds = intArg(a, "timeout-seconds", 1800, 300, 3600),
    maxCents = intArg(a, "max-cents", 600, 50, 600),
    maxSteps = intArg(a, "max-steps", 4, 1, 300);
  const datasetFile = resolve(String(a.data ?? "data/training/proof.jsonl")),
    data = await readFile(datasetFile, "utf8");
  const digest = createHash("sha256").update(data).digest("hex");
  if (!["train.jsonl", "proof.jsonl"].includes(basename(datasetFile)))
    throw new Error(
      "Only manifest-reviewed train/proof files may be uploaded; final evaluation is protected",
    );
  const dataManifest = JSON.parse(
    await readFile(resolve(dirname(datasetFile), "manifest.json"), "utf8"),
  );
  if (dataManifest.hashes[basename(datasetFile)] !== digest)
    throw new Error(
      "Supervised dataset hash differs from its reviewed manifest",
    );
  const [catalog, balance, burn] = await Promise.all([
    client.catalog(),
    client.balance(),
    client.request<{ active_jobs: unknown[]; active_deployments: unknown[] }>(
      "/v1/billing/burn_rate",
    ),
  ]);
  if (burn.active_jobs.length || burn.active_deployments.length)
    throw new Error(
      "Reconcile active Veri resources before another paid operation",
    );
  const gpu = catalog.catalog.find(
    (x) =>
      x.provider === "aws" &&
      x.workload === "training" &&
      x.gpu_type === "L4-24GB" &&
      x.node_counts.includes(1) &&
      x.status === "available",
  );
  if (!gpu?.usd_per_gpu_hr || gpu.usd_per_gpu_hr <= 0)
    throw new Error("No verified available single L4 training price");
  // Includes heartbeat grace/cleanup and a conservative storage allowance above the documented ~$0.24.
  const estimatedMaximum = usdToCentsCeil(
    (gpu.usd_per_gpu_hr * (timeoutSeconds + 600)) / 3600 + 0.3,
  );
  if (estimatedMaximum > maxCents)
    throw new Error("GPU lifetime plus storage exceeds requested reservation");
  if (balance.balance_usd < maxCents / 100)
    throw new Error("Insufficient Veri credit for conservative reservation");
  const namespace = env.HF_NAMESPACE?.trim();
  if (!namespace) throw new Error("Missing HF_NAMESPACE");
  const suffix =
    String(a.name ?? "proof") +
    "-" +
    digest.slice(0, 8) +
    "-" +
    randomUUID().slice(0, 12);
  const repo = String(a.repo ?? namespace + "/greenlight-extractor-" + suffix);
  const request = boundedTrainingRequest({
    datasetId: "assigned-after-upload",
    repo,
    maxSteps,
    baseModel: String(a.model ?? DEFAULT_BASE_MODEL),
    outputName: "greenlight-" + suffix,
  });
  const plan = {
    schemaVersion: 1,
    mode: "real-veri-sft",
    datasetFile,
    datasetSha256: digest,
    rows: data.trim().split("\n").length,
    baseModel: request.base_model,
    repo,
    submissionName: request.output_name,
    maxSteps,
    timeoutSeconds,
    maxCents,
    verifiedRateUsdPerGpuHour: gpu.usd_per_gpu_hr,
    estimatedMaximumUsd: estimatedMaximum / 100,
    storageAllowanceUsd: 0.3,
    safety:
      "Pre-create acknowledged detached recovery guard; persistent unique submission identity; immediate heartbeat; GET-verified terminal cleanup; fail-closed reservation. Paid creation is never retried.",
  };
  if (!a.execute) {
    console.log(JSON.stringify({ ...plan, execute: false }, null, 2));
    return;
  }
  const reservationId = "veri-training-" + suffix;
  await budget.reserve({
    id: reservationId,
    provider: "veri",
    purpose: "True SFT LoRA+merged export " + repo,
    maxCents,
  });
  const recordPath = resolve("work/ml", reservationId + ".json");
  let job: VeriJob | undefined,
    heartbeat: NodeJS.Timeout | undefined,
    cleanupVerified = false;
  const deadline = Date.now() + timeoutSeconds * 1000;
  const identity: SubmissionIdentity = {
    schemaVersion: 1,
    submissionId: reservationId,
    kind: "training",
    uniqueName: request.output_name,
    expectedModel: request.base_model,
    deadlineMs: deadline,
    createdAt: now(),
    ownerPid: process.pid,
  };
  const recoveryPath = resolve("work/ml/recovery", reservationId + ".json");
  await saveJson(recordPath, {
    ...plan,
    reservationId,
    state: "reserved",
    startedAt: now(),
  });
  try {
    const dataset = await client.uploadDataset("greenlight-" + suffix, data);
    request.dataset_id = dataset.id + "@snap-1";
    await saveJson(recordPath, {
      ...plan,
      reservationId,
      state: "dataset-uploaded",
      datasetId: request.dataset_id,
      startedAt: now(),
    });
    await startRecoveryGuard(recoveryPath, identity);
    job = (await submitExactlyOnce({
      client,
      identity,
      persist: (r) => persistRecovery(recoveryPath, r),
      create: () => client.createTraining(request),
    })) as VeriJob;
    await client.heartbeat(job.id); // establishes provider's 300-second loss-of-client stop rule
    heartbeat = setInterval(() => {
      void client.heartbeat(job!.id).catch(() => {});
    }, 30000);
    await saveJson(recordPath, {
      ...plan,
      reservationId,
      jobId: job.id,
      datasetId: request.dataset_id,
      state: job.status,
      startedAt: now(),
    });
    console.log(
      JSON.stringify({
        event: "training-submitted",
        jobId: job.id,
        repo,
        reservationId,
        maxCents,
      }),
    );
    while (!["completed", "failed", "cancelled"].includes(job.status)) {
      if (Date.now() >= deadline)
        throw new Error("Training lifetime bound reached");
      await pause(10000);
      job = await client.job(job.id);
      await saveJson(recordPath, {
        ...plan,
        reservationId,
        jobId: job.id,
        datasetId: request.dataset_id,
        state: job.status,
        currentStep: job.current_step,
        totalSteps: job.total_steps,
        loss: job.current_loss,
        verifiedAt: now(),
      });
      console.log(
        JSON.stringify({
          event: "training-status",
          jobId: job.id,
          status: job.status,
          step: job.current_step,
          loss: job.current_loss,
        }),
      );
    }
    job = await client.job(job.id);
    if (!isTerminal("training", job.status))
      throw new Error("Training terminal state not verified by GET");
    cleanupVerified = true;
    await finishRecovery(recoveryPath, identity, job.id, job.status);
    const after = await client.balance();
    const actual = usdToCentsCeil(
      Math.max(job.cost_usd ?? 0, balance.balance_usd - after.balance_usd),
    );
    // A zero/absent cost is not proof of a free completed GPU job; keep the reservation.
    if (actual > 0)
      await budget.settle(
        reservationId,
        actual,
        "Veri terminal job cost / isolated balance delta; job " + job.id,
      );
    await saveJson(recordPath, {
      ...plan,
      reservationId,
      jobId: job.id,
      datasetId: request.dataset_id,
      state: job.status,
      costUsd: actual / 100,
      costSettled: actual > 0,
      exportUrl: job.hf_repo_url ?? null,
      currentStep: job.current_step,
      loss: job.current_loss,
      completedAt: now(),
      cleanupVerified,
    });
    console.log(
      JSON.stringify({
        event: "training-terminal",
        jobId: job.id,
        status: job.status,
        repoUrl: job.hf_repo_url,
        costUsd: actual / 100,
        costSettled: actual > 0,
        recordPath,
      }),
    );
    if (job.status !== "completed")
      throw new Error(
        "Veri training did not complete; inspect private run record and provider dashboard",
      );
    if (!job.hf_repo_url)
      throw new Error("Training completed but merged export is not verified");
  } catch (error) {
    if (job) {
      try {
        job = (await stopAndVerify(client, "training", job.id)) as VeriJob;
        cleanupVerified = true;
        await finishRecovery(recoveryPath, identity, job.id, job.status);
      } catch {
        /* keep reservation; acknowledged recovery guard still owns cleanup */
      }
    }
    await saveJson(recordPath, {
      ...plan,
      reservationId,
      jobId: job?.id ?? null,
      state: job?.status ?? "creation-outcome-unknown",
      error: publicError(error),
      cleanupVerified,
      needsCostReconciliation: true,
      verifiedAt: now(),
    });
    throw error;
  } finally {
    if (heartbeat) clearInterval(heartbeat);
  }
}
if (process.argv[1]?.endsWith("train-veri.ts"))
  train().catch((error) => {
    console.error(publicError(error));
    process.exitCode = 1;
  });
