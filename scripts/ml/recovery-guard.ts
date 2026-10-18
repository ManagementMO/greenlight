import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import {
  SubmissionIdentity,
  RecoveryRecord,
} from "../../lib/providers/lifecycle";
import { pause, saveJson } from "./shared";
/** Start and positively acknowledge the detached recovery process BEFORE create. */
export async function startRecoveryGuard(
  path: string,
  identity: SubmissionIdentity,
) {
  await saveJson(path, {
    ...identity,
    state: "prepared",
    updatedAt: new Date().toISOString(),
  } satisfies RecoveryRecord);
  const child = spawn(
    process.execPath,
    [
      "--import",
      "tsx",
      resolve("scripts/ml/resource-watchdog.ts"),
      "--submission",
      path,
    ],
    { cwd: process.cwd(), env: process.env, stdio: "ignore", detached: true },
  );
  const ready = path + ".ready.json";
  let spawnError = false;
  child.once("error", () => {
    spawnError = true;
  });
  child.unref();
  for (let attempt = 0; attempt < 75; attempt++) {
    if (spawnError)
      throw new Error("Recovery guard failed to start; paid creation refused");
    try {
      const ack = JSON.parse(await readFile(ready, "utf8"));
      if (ack.submissionId === identity.submissionId && ack.guardPid > 0)
        return;
    } catch {
      /* wait for child readiness */
    }
    await pause(100);
  }
  throw new Error("Recovery guard readiness unverified; paid creation refused");
}
export function persistRecovery(path: string, record: RecoveryRecord) {
  return saveJson(path, record);
}
export async function finishRecovery(
  path: string,
  identity: SubmissionIdentity,
  resourceId: string,
  status: string,
) {
  await saveJson(path, {
    ...identity,
    state: "terminal",
    resourceId,
    verifiedStatus: status,
    updatedAt: new Date().toISOString(),
  } satisfies RecoveryRecord);
}
