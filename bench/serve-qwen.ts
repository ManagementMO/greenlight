/**
 * Arm B: run base Qwen3-4B-Instruct-2507 on the benchmark prompts through a Veri vLLM deployment.
 * Reuses the repo's budget ledger, exactly-once submission, recovery guard and verified stop.
 * Dry run by default (no spend). Usage:
 *   npx tsx bench/serve-qwen.ts --splits dev,test,heldout [--limit N] [--max-cents 200] [--execute]
 */
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { VeriClient, VeriDeployment, boundedDeploymentRequest, DEFAULT_BASE_MODEL } from "../lib/providers/veri";
import { SubmissionIdentity, submitExactlyOnce, stopAndVerify } from "../lib/providers/lifecycle";
import { usdToCentsCeil } from "../lib/budget/ledger";
import { args, intArg, loadProjectEnv, ledger, pause, now, publicError } from "../scripts/ml/shared";
import { startRecoveryGuard, persistRecovery, finishRecovery } from "../scripts/ml/recovery-guard";
import { loadCases, resultsPath } from "./run";
import { SYSTEM, directPrompt } from "./prompts";
import type { RawRecord } from "./arms";

async function main() {
  const env = loadProjectEnv(), a = args();
  const splits = String(a.splits ?? "dev").split(",");
  const limit = intArg(a, "limit", 1000, 1, 1000);
  const maxCents = intArg(a, "max-cents", 200, 25, 400), timeoutSeconds = intArg(a, "timeout-seconds", 2400, 300, 3600);
  const maxTokens = 1200;
  const client = new VeriClient({ apiKey: env.VERI_API_KEY ?? "", timeoutMs: 120000 }), budget = ledger();
  // Resume: keep earlier error-free answers, only run what is missing or failed.
  const prior = new Map<string, RawRecord>();
  for (const s of splits) {
    const p = resultsPath("qwen-direct", s);
    if (existsSync(p)) for (const l of readFileSync(p, "utf8").trim().split("\n").filter(Boolean)) { const r = JSON.parse(l) as RawRecord; if (!r.error && r.raw) prior.set(r.caseId, r); }
  }
  const work = splits.flatMap((s) => loadCases(s).slice(0, limit)).filter((c) => !prior.has(c.id));
  const [catalog, balance, burn] = await Promise.all([
    client.catalog(), client.balance(),
    client.request<{ active_jobs: unknown[]; active_deployments: unknown[] }>("/v1/billing/burn_rate"),
  ]);
  if (burn.active_jobs.length || burn.active_deployments.length) throw new Error("Reconcile active Veri resources before paid serving");
  const gpu = catalog.catalog.find((x) => x.provider === "aws" && x.workload === "serving" && x.gpu_type === "L4-24GB" && x.node_counts.includes(1) && x.status === "available");
  if (!gpu?.usd_per_gpu_hr) throw new Error("No verified serving rate");
  const estimatedMaximum = usdToCentsCeil((gpu.usd_per_gpu_hr * (timeoutSeconds + 600)) / 3600);
  if (estimatedMaximum > maxCents || balance.balance_usd < maxCents / 100) throw new Error(`Serving bound ${estimatedMaximum}c exceeds --max-cents ${maxCents} or credit`);
  const request = boundedDeploymentRequest(DEFAULT_BASE_MODEL, "greenlight-bench-" + randomUUID());
  const plan = { model: DEFAULT_BASE_MODEL, cases: work.length, splits, decode: { temperature: 0, maxTokens }, gpuUsdPerHour: gpu.usd_per_gpu_hr, worstCaseCostUsd: estimatedMaximum / 100, creditUsd: balance.balance_usd };
  if (!a.execute) { console.log(JSON.stringify({ ...plan, execute: false }, null, 2)); return; }

  const id = "bench-qwen-" + randomUUID(), deadline = Date.now() + timeoutSeconds * 1000;
  const identity: SubmissionIdentity = { schemaVersion: 1, submissionId: id, kind: "deployment", uniqueName: request.name, expectedModel: DEFAULT_BASE_MODEL, deadlineMs: deadline, createdAt: now(), ownerPid: process.pid };
  const recoveryPath = resolve("work/ml/recovery", id + ".json");
  await budget.reserve({ id, provider: "veri", purpose: "Benchmark base Qwen direct answers", maxCents });
  mkdirSync(resolve("bench/results"), { recursive: true });
  let dep: VeriDeployment | undefined, stopVerified = false;
  const t0 = Date.now();
  try {
    await startRecoveryGuard(recoveryPath, identity);
    dep = (await submitExactlyOnce({ client, identity, persist: (r) => persistRecovery(recoveryPath, r), create: () => client.createDeployment(request) })) as VeriDeployment;
    console.log(JSON.stringify({ event: "deployment-submitted", deploymentId: dep.id }));
    while (dep.status !== "serving") {
      if (["failed", "stopped"].includes(dep.status)) throw new Error("Deployment failed to reach serving");
      if (Date.now() >= deadline) throw new Error("Serving provisioning deadline reached");
      await pause(10000);
      dep = await client.deployment(dep.id);
      console.log(JSON.stringify({ event: "status", status: dep.status }));
    }
    const provisioningMs = Date.now() - t0;
    const rows: RawRecord[] = [];
    let consecutiveErrors = 0;
    for (const c of work) {
      if (Date.now() + 90000 >= deadline) throw new Error("Remaining cases would exceed GPU lifetime");
      const t = performance.now();
      let rec: RawRecord;
      try {
        // The chat endpoint takes plain messages; the system text is prepended to the user turn for parity with Claude.
        const r = await client.chat(dep.id, DEFAULT_BASE_MODEL, [{ role: "system", content: SYSTEM }, { role: "user", content: directPrompt(c) }], maxTokens);
        rec = { caseId: c.id, arm: "qwen-direct", raw: r.text, latencyMs: performance.now() - t, inputTokens: r.usage?.prompt_tokens ?? 0, outputTokens: r.usage?.completion_tokens ?? 0, costUsd: 0, model: r.model };
      } catch (e) {
        rec = { caseId: c.id, arm: "qwen-direct", raw: "", latencyMs: performance.now() - t, inputTokens: 0, outputTokens: 0, costUsd: 0, model: DEFAULT_BASE_MODEL, error: publicError(e) };
      }
      rows.push(rec);
      consecutiveErrors = rec.error ? consecutiveErrors + 1 : 0;
      if (consecutiveErrors >= 5) { console.log(JSON.stringify({ event: "aborting", reason: "5 consecutive request errors; stopping the GPU" })); break; }
      console.log(JSON.stringify({ event: "case", id: c.id, ms: Math.round(rec.latencyMs), error: rec.error ?? null }));
    }
    dep = (await stopAndVerify(client, "deployment", dep.id)) as VeriDeployment;
    stopVerified = true;
    await finishRecovery(recoveryPath, identity, dep.id, dep.status);
    const after = await client.balance();
    const actual = usdToCentsCeil(Math.max(dep.total_cost_usd ?? 0, balance.balance_usd - after.balance_usd));
    if (actual > 0) await budget.settle(id, actual, "Veri stopped deployment final cost " + dep.id);
    // Amortize the whole GPU bill (including provisioning) over the cases; the split is recorded in the meta file.
    const perCase = actual / 100 / Math.max(1, rows.length);
    for (const s of splits) {
      const path = resultsPath("qwen-direct", s);
      const merged = new Map<string, RawRecord>();
      for (const r of prior.values()) if (r.caseId.startsWith(s + "-")) merged.set(r.caseId, r);
      for (const r of rows) if (r.caseId.startsWith(s + "-") && (!r.error || !merged.has(r.caseId))) merged.set(r.caseId, r.error ? r : { ...r, costUsd: perCase });
      writeFileSync(path, [...merged.values()].map((r) => JSON.stringify(r)).join("\n") + "\n");
    }
    writeFileSync(resolve("bench/results/qwen-direct.meta.json"), JSON.stringify({ ...plan, deploymentId: dep.id, completedAt: now(), stopVerified, provisioningMs, totalCostUsd: actual / 100, costPerCaseUsd: perCase, cases: rows.length, note: "per-case cost for answers from this run amortizes provisioning + serving over the cases this run answered; earlier answers keep the cost of their own run" }, null, 2));
    console.log(JSON.stringify({ event: "completed", costUsd: actual / 100, stopVerified, cases: rows.length }));
  } finally {
    if (dep && !stopVerified) { try { await stopAndVerify(client, "deployment", dep.id); } catch { /* guard + reservation remain */ } }
  }
}
main().catch((e) => { console.error(publicError(e)); process.exitCode = 1; });
