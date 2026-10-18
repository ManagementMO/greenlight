import type { VeriClient, VeriJob, VeriDeployment } from "./veri";
export type ResourceKind = "training" | "deployment";
export type ManagedResource = VeriJob | VeriDeployment;
export interface SubmissionIdentity {
  schemaVersion: 1;
  submissionId: string;
  kind: ResourceKind;
  uniqueName: string;
  expectedModel: string;
  deadlineMs: number;
  createdAt: string;
  ownerPid?: number;
}
export interface RecoveryRecord extends SubmissionIdentity {
  state: "prepared" | "submitting" | "known" | "ambiguous" | "terminal";
  resourceId?: string;
  verifiedStatus?: string;
  recoveredFromAmbiguousCreate?: boolean;
  needsCostReconciliation?: boolean;
  updatedAt?: string;
}
type Client = Pick<
  VeriClient,
  "request" | "job" | "deployment" | "cancel" | "stop"
>;
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
export const isTerminal = (kind: ResourceKind, status: string) =>
  kind === "training"
    ? ["completed", "failed", "cancelled"].includes(status)
    : ["stopped", "failed"].includes(status);
/** Read-only discovery. Uniqueness is generated before the original paid create. */
export async function recoverSubmission(
  client: Client,
  identity: SubmissionIdentity,
  deadlineMs = Date.now() + 60_000,
): Promise<ManagedResource | null> {
  let after: string | undefined;
  const matches: ManagedResource[] = [];
  for (let page = 0; page < 20; page++) {
    if (Date.now() >= deadlineMs)
      throw new Error(
        "Resource discovery deadline reached; outcome remains unknown",
      );
    const prefix =
      identity.kind === "training" ? "/v1/training_jobs" : "/v1/deployments";
    const result = await client.request<{
      data: ManagedResource[];
      has_more?: boolean;
    }>(
      prefix +
        "?limit=100" +
        (after ? "&after=" + encodeURIComponent(after) : ""),
    );
    if (!Array.isArray(result.data))
      throw new Error("Resource discovery returned invalid data");
    for (const resource of result.data) {
      const name =
        identity.kind === "training" ? resource.output_name : resource.name;
      if (name !== identity.uniqueName) continue;
      const model =
        identity.kind === "training" ? resource.base_model : resource.model;
      if (model !== identity.expectedModel)
        throw new Error(
          "Submission identity collision: name matches a different model",
        );
      matches.push(resource);
    }
    if (!result.has_more) break;
    after = result.data.at(-1)?.id;
    if (!after || page === 19)
      throw new Error("Resource discovery pagination incomplete");
  }
  if (matches.length > 1)
    throw new Error(
      "Submission identity collision: multiple resources matched",
    );
  return matches[0] ?? null;
}
/** A timeout may have committed. Persist identity first; never retry paid create. */
export async function submitExactlyOnce(input: {
  client: Client;
  identity: SubmissionIdentity;
  persist: (record: RecoveryRecord) => Promise<void>;
  create: () => Promise<ManagedResource>;
  recoveryAttempts?: number;
  recoveryDelayMs?: number;
}): Promise<ManagedResource> {
  const write = (record: Partial<RecoveryRecord>) =>
    input.persist({
      ...input.identity,
      state: "submitting",
      ...record,
      updatedAt: new Date().toISOString(),
    });
  await write({ state: "submitting" });
  try {
    const resource = await input.create();
    if (!resource.id) throw new Error("Create returned no resource id");
    await write({ state: "known", resourceId: resource.id });
    return resource;
  } catch {
    for (let attempt = 0; attempt < (input.recoveryAttempts ?? 4); attempt++) {
      try {
        const resource = await recoverSubmission(input.client, input.identity);
        if (resource) {
          await write({
            state: "known",
            resourceId: resource.id,
            recoveredFromAmbiguousCreate: true,
          });
          return resource;
        }
      } catch {
        /* Ambiguity is retained; the independent recovery guard still owns cleanup. */
      }
      if (attempt + 1 < (input.recoveryAttempts ?? 4))
        await pause(input.recoveryDelayMs ?? 2000);
    }
    await write({ state: "ambiguous", needsCostReconciliation: true });
    throw new Error(
      "Paid creation outcome unknown; no retry was attempted. Recovery guard retains the reservation.",
    );
  }
}
/** Stop/cancel acknowledgement is insufficient: verify the terminal state with GET. */
export async function stopAndVerify(
  client: Client,
  kind: ResourceKind,
  id: string,
  options: { attempts?: number; delayMs?: number; deadlineMs?: number } = {},
): Promise<ManagedResource> {
  let last: ManagedResource | undefined;
  for (let attempt = 0; attempt < (options.attempts ?? 12); attempt++) {
    if (options.deadlineMs !== undefined && Date.now() >= options.deadlineMs)
      break;
    try {
      last =
        kind === "training"
          ? await client.job(id)
          : await client.deployment(id);
      if (isTerminal(kind, last.status)) return last;
    } catch {
      /* retry read/cleanup; never infer terminal state from an unavailable API */
    }
    if (attempt === 0 || attempt % 3 === 0) {
      try {
        if (kind === "training") await client.cancel(id);
        else await client.stop(id);
      } catch {
        /* may already be terminal; only a subsequent GET proves it */
      }
    }
    if (attempt + 1 < (options.attempts ?? 12))
      await pause(options.delayMs ?? 1500);
  }
  throw new Error(
    "GPU terminal state not verified; reservation must remain held",
  );
}
