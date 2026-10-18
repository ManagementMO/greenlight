import { isDeepStrictEqual } from "node:util";

/** Veri's observed vLLM response model is its unique deployment name, not the HF repo. */
export function assertVeriResponseModel(returnedModel: unknown, expectedDeploymentName: string) {
  if (!expectedDeploymentName || returnedModel !== expectedDeploymentName)
    throw new Error("Veri response model does not match the exact submitted deployment identity.");
}

export function veriRecoveryRecordPath(reservationId: unknown) {
  if (typeof reservationId !== "string" || !/^veri-serving-[a-z0-9-]+$/.test(reservationId))
    throw new Error("Invalid Veri serving reservation identity.");
  return "work/ml/recovery/" + reservationId + ".json";
}

export function veriResponseModelIdentity(expectedDeploymentName: string, requestedRepository: string) {
  return {
    kind: "deployment-name" as const,
    expectedResponseModel: expectedDeploymentName,
    requestedRepository,
    boundary: "Every scored response identifies the exact submitted deployment name. The deployment request names this HF repository; the provider does not attest the loaded commit SHA.",
  };
}

/** Bind an older or current raw run to the persisted, terminal submission record. */
export function verifyVeriServingRecordIdentity(run: {
  reservationId?: unknown; deploymentId?: unknown; artifact?: { repo?: unknown };
  responseModelIdentity?: unknown; rows?: Array<{ returnedModel?: unknown }>;
  canary?: { returnedModel?: unknown }; showcase?: { returnedModel?: unknown } | null;
}, recovery: {
  kind?: unknown; state?: unknown; verifiedStatus?: unknown; submissionId?: unknown;
  resourceId?: unknown; expectedModel?: unknown; uniqueName?: unknown;
}) {
  veriRecoveryRecordPath(run.reservationId);
  if (recovery.kind !== "deployment" || recovery.state !== "terminal" || recovery.verifiedStatus !== "stopped" ||
      recovery.submissionId !== run.reservationId || typeof run.deploymentId !== "string" || !run.deploymentId ||
      recovery.resourceId !== run.deploymentId || typeof run.artifact?.repo !== "string" ||
      recovery.expectedModel !== run.artifact.repo || typeof recovery.uniqueName !== "string" || !recovery.uniqueName ||
      !Array.isArray(run.rows) || run.rows.length === 0)
    throw new Error("Veri response identity is not bound to the completed deployment and requested repository.");
  const identity = veriResponseModelIdentity(recovery.uniqueName, run.artifact.repo);
  if (run.responseModelIdentity !== undefined && !isDeepStrictEqual(run.responseModelIdentity, identity))
    throw new Error("Recorded Veri response identity differs from its deployment submission.");
  assertVeriResponseModel(run.canary?.returnedModel, recovery.uniqueName);
  for (const row of run.rows) assertVeriResponseModel(row.returnedModel, recovery.uniqueName);
  if (run.showcase) assertVeriResponseModel(run.showcase.returnedModel, recovery.uniqueName);
  return identity;
}
