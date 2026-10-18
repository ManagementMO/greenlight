import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename, resolve, sep } from "node:path";
import { isDeepStrictEqual } from "node:util";

type RecordData = Record<string, any>;
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const hash = (value: unknown) => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const originalTraining = (value: RecordData) => Object.fromEntries(Object.entries(value)
  .filter(([key]) => !["repo", "exportUrl", "postTrainingExport"].includes(key)));

/** A repaired materialization may change the export, never the completed training evidence. */
export function assertV5TrainingRecordLineage(derived: RecordData, source: RecordData, sourceSha256: string,
  merge: RecordData, mergeSha256: string, publication: RecordData) {
  const p = derived.postTrainingExport;
  if (!p || source.postTrainingExport || source.mode !== "real-veri-sft" || source.state !== "completed" || !source.cleanupVerified ||
      !isDeepStrictEqual(originalTraining(derived), originalTraining(source)) ||
      !isDeepStrictEqual(Object.fromEntries(Object.entries(p).filter(([key]) => !["sourceTrainingRecord", "mergeEvidencePath"].includes(key))), publication.postTrainingExport) ||
      p.schemaVersion !== 1 || p.dataClassification !== "PUBLIC_SYNTHETIC" || p.noRetraining !== true ||
      p.method !== "saved-v5-adapter-on-pinned-bfloat16-base" || p.dtype !== "bfloat16" ||
      p.sourceTrainingJobId !== source.jobId || p.sourceTrainingRepo !== source.repo || p.trainingSha256 !== source.datasetSha256 ||
      p.sourceTrainingRecordSha256 !== sourceSha256 || !hash(sourceSha256) || p.mergeEvidenceSha256 !== mergeSha256 || !hash(mergeSha256) ||
      p.baseModel !== source.baseModel || !/^[a-f0-9]{40}$/.test(p.baseRevision) ||
      derived.repo !== `${source.repo.split("/")[0]}/headroom-extractor-v5-bf16-${source.jobId}` ||
      derived.exportUrl !== `https://huggingface.co/${derived.repo}` || publication.repo !== derived.repo ||
      publication.public !== true || publication.anonymousConfigHttp !== 200 || !/^[a-f0-9]{40}$/.test(publication.revision) ||
      merge.method !== p.method || merge.safeMerge !== true || merge.noRetraining !== true || merge.dtype !== p.dtype ||
      merge.baseRevision !== p.baseRevision || merge.source?.jobId !== source.jobId || merge.source?.checkpointStep !== source.maxSteps ||
      merge.source?.sourceRepo !== source.repo || merge.source?.trainingSha256 !== source.datasetSha256 ||
      merge.source?.files?.find((file: RecordData) => file.path === "adapter_model.safetensors")?.sha256 !== p.adapterSha256 ||
      !hash(p.adapterSha256) || !isDeepStrictEqual(merge.files, p.files) ||
      !Array.isArray(p.files) || !p.files.some((file: RecordData) => file.path.endsWith(".safetensors")) ||
      p.files.some((file: RecordData) => !hash(file.sha256) || !Number.isSafeInteger(file.bytes) || file.bytes < 1 || !/^[\w.-]+$/.test(file.path)))
    throw new Error("V5 repaired export does not preserve the original completed training, adapter and verified merge lineage.");
}

function privateEvidencePath(path: unknown) {
  if (typeof path !== "string" || !resolve(path).startsWith(resolve("work/ml") + sep))
    throw new Error("Derived V5 export requires a private local evidence record.");
  return resolve(path);
}

export async function readVerifiedV5TrainingRecord(path: string) {
  const training = JSON.parse(await readFile(resolve(path), "utf8"));
  if (!training.postTrainingExport) return training;
  const sourceBytes = await readFile(privateEvidencePath(training.postTrainingExport.sourceTrainingRecord), "utf8");
  const mergeBytes = await readFile(privateEvidencePath(training.postTrainingExport.mergeEvidencePath), "utf8");
  const publication = JSON.parse(await readFile(`work/ml/published-${basename(training.repo)}.json`, "utf8"));
  assertV5TrainingRecordLineage(training, JSON.parse(sourceBytes), sha(sourceBytes), JSON.parse(mergeBytes), sha(mergeBytes), publication);
  return training;
}
