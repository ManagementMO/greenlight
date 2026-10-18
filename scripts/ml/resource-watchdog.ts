import { readFile } from "node:fs/promises";
import { args, loadProjectEnv, pause, saveJson, publicError } from "./shared";
import { VeriClient } from "../../lib/providers/veri";
import {
  RecoveryRecord,
  recoverSubmission,
  stopAndVerify,
  isTerminal,
} from "../../lib/providers/lifecycle";
import { resolve } from "node:path";
function ownerAlive(pid: number | undefined) {
  if (!pid) return true;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
async function recoverGuard(path: string, client: VeriClient) {
  let record = JSON.parse(await readFile(path, "utf8")) as RecoveryRecord;
  await saveJson(path + ".ready.json", {
    submissionId: record.submissionId,
    guardPid: process.pid,
    readyAt: new Date().toISOString(),
  });
  let establishedHeartbeat = false,
    discoveredId: string | undefined,
    lastDiscovery = 0;
  while (true) {
    record = JSON.parse(await readFile(path, "utf8")) as RecoveryRecord;
    if (record.state === "terminal" && record.resourceId) {
      const resource =
        record.kind === "training"
          ? await client.job(record.resourceId)
          : await client.deployment(record.resourceId);
      if (isTerminal(record.kind, resource.status)) {
        await saveJson(path + ".result.json", {
          submissionId: record.submissionId,
          resourceId: resource.id,
          verifiedStatus: resource.status,
          cleanupVerified: true,
          verifiedAt: new Date().toISOString(),
        });
        return;
      }
    }
    const shouldCleanup =
      record.state === "ambiguous" ||
      Date.now() >= record.deadlineMs ||
      !ownerAlive(record.ownerPid);
    if (record.resourceId) discoveredId = record.resourceId;
    if (
      !discoveredId &&
      record.state !== "prepared" &&
      Date.now() - lastDiscovery > 5000
    ) {
      lastDiscovery = Date.now();
      try {
        discoveredId = (await recoverSubmission(client, record))?.id;
      } catch {
        /* keep reservation; retry bounded cleanup below */
      }
    }
    if (
      discoveredId &&
      record.kind === "training" &&
      !establishedHeartbeat &&
      !shouldCleanup
    ) {
      try {
        await client.heartbeat(discoveredId);
        establishedHeartbeat = true;
      } catch {
        /* no acknowledgement never proves absence */
      }
    }
    if (shouldCleanup) {
      const recoveryDeadline = Math.min(
        record.deadlineMs + 540000,
        Date.now() + 540000,
      );
      for (
        let attempt = 1;
        attempt <= 18 && Date.now() < recoveryDeadline;
        attempt++
      ) {
        try {
          const resourceId =
            discoveredId ??
            record.resourceId ??
            (await recoverSubmission(client, record, recoveryDeadline))?.id;
          if (resourceId) {
            const final = await stopAndVerify(client, record.kind, resourceId, {
              deadlineMs: recoveryDeadline,
            });
            await saveJson(path + ".result.json", {
              submissionId: record.submissionId,
              resourceId,
              verifiedStatus: final.status,
              cleanupVerified: true,
              needsCostReconciliation: true,
              verifiedAt: new Date().toISOString(),
            });
            return;
          }
        } catch {
          /* bounded retries keep the reservation intact */
        }
        await saveJson(path + ".result.json", {
          submissionId: record.submissionId,
          resourceId: discoveredId ?? null,
          cleanupVerified: false,
          needsCostReconciliation: true,
          attempt,
          verifiedAt: new Date().toISOString(),
        });
        if (attempt < 18) await pause(10000);
      }
      throw new Error(
        "Recovery remains ambiguous after bounded cleanup; keep reservation and inspect provider resources",
      );
    }
    await pause(1000);
  }
}
async function main() {
  const env = loadProjectEnv(),
    a = args(),
    client = new VeriClient({
      apiKey: env.VERI_API_KEY ?? "",
      timeoutMs: 20000,
    });
  if (a.submission) {
    await recoverGuard(resolve(String(a.submission)), client);
    return;
  }
  const id = String(a.id ?? ""),
    kind = String(a.kind ?? ""),
    deadline = Number(a.deadline);
  if (
    !id ||
    !["training", "deployment"].includes(kind) ||
    !Number.isFinite(deadline)
  )
    throw new Error("Watchdog requires resource identity and deadline");
  await pause(Math.max(0, deadline - Date.now()));
  const final = await stopAndVerify(
    client,
    kind as "training" | "deployment",
    id,
  );
  await saveJson(resolve("work/ml", id + ".watchdog.json"), {
    id,
    kind,
    status: final.status,
    cleanupVerified: true,
    verifiedAt: new Date().toISOString(),
  });
}
main().catch((error) => {
  console.error(publicError(error));
  process.exitCode = 1;
});
