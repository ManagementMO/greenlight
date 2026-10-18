import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { args, loadProjectEnv, saveJson, publicError } from "./shared";
import { VeriClient } from "../../lib/providers/veri";
async function main() {
  const env = loadProjectEnv(),
    a = args(),
    id = String(a.id ?? "");
  if (!id) throw new Error("--id is required");
  const client = new VeriClient({ apiKey: env.VERI_API_KEY ?? "" });
  const [job, metrics, events] = await Promise.all([
    client.job(id),
    client.request<unknown>("/v1/training_jobs/" + id + "/metrics"),
    client.request<unknown>("/v1/training_jobs/" + id + "/events?limit=100"),
  ]);
  const response = await fetch(
    "https://api.veri.studio/v1/training_jobs/" +
      encodeURIComponent(id) +
      "/logs/full",
    {
      headers: { authorization: "Bearer " + env.VERI_API_KEY },
      signal: AbortSignal.timeout(30000),
    },
  );
  let log = await response.text();
  const raw = {
    job,
    metrics,
    events,
    log,
    logHttpStatus: response.status,
    checkedAt: new Date().toISOString(),
  };
  await saveJson(resolve("work/ml", id + ".inspection.private.json"), raw);
  const checkpointSteps = [
    ...log.matchAll(/Committed checkpoint [^\n]* at step (\d+)/g),
  ].map((match) => Number(match[1]));
  const completed = log.match(
    /Training completed in ([\d.]+)s, loss=([\d.eE+-]+)/,
  );
  await saveJson(resolve("work/ml", id + ".training-evidence.json"), {
    jobId: id,
    source: "provider-worker-log",
    logSha256: createHash("sha256").update(log).digest("hex"),
    finalCheckpointStep: checkpointSteps.length
      ? Math.max(...checkpointSteps)
      : null,
    trainerDurationSeconds: completed ? Number(completed[1]) : null,
    trainerLoss: completed ? Number(completed[2]) : null,
    lastApiReportedStep: job.current_step ?? null,
    checkedAt: raw.checkedAt,
  });
  // Redact keys and signed URL query strings before any terminal output.
  for (const [key, value] of Object.entries(env))
    if (value && value.length > 5 && /KEY|TOKEN|DSN|SECRET/.test(key))
      log = log.split(value).join("[REDACTED]");
  log = log
    .replace(/(?:sk-ant-|hf_|vk_)[A-Za-z0-9_-]{8,}/g, "[REDACTED]")
    .replace(/https?:\/\/[^\s]+\?[^\s]+/g, "[SIGNED_URL_REDACTED]");
  const selected = log
    .split("\n")
    .filter((line) =>
      /loss|train|step|download|fetch|token|SFT|TRL|complet|gradient|merge|error|warning|format|dataset|\%/i.test(
        line,
      ),
    )
    .slice(-75);
  console.log(
    JSON.stringify(
      {
        id,
        status: job.status,
        currentStep: job.current_step,
        totalSteps: job.total_steps,
        currentLoss: job.current_loss,
        baseModel: job.base_model,
        method: job.method,
        hyperparameters: job.hyperparameters,
        logHttpStatus: response.status,
        selectedLogLines: selected,
        lossMaskDirectlyVerified:
          /completion_only_loss\s*[:=]\s*(?:True|true)/.test(log),
      },
      null,
      2,
    ),
  );
}
main().catch((error) => {
  console.error(publicError(error));
  process.exitCode = 1;
});
