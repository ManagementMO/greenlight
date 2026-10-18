import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { basename } from "node:path";
import { args, loadProjectEnv, saveJson } from "./ml/shared";
import { extractionPromptV5 } from "../lib/providers/extraction-v5";
import { assertReviewedV5Evaluation, assertV5RunIdentity, v5PromptHash } from "../lib/providers/evaluation-v5";
import { scoreExtraction, summarizeExtraction } from "../lib/providers/evaluation";
import { compareV5Evaluations } from "./ml/compare-v5-evaluations";
import type { LabeledExample } from "./ml/generate-data";
import { readV5FinalSelection, assertV5FinalRunSelection } from "../lib/providers/final-selection-v5";
import { veriRecoveryRecordPath, verifyVeriServingRecordIdentity } from "../lib/providers/veri-response-identity";
import { readVerifiedV5TrainingRecord } from "../lib/providers/v5-training-record";

const sha=(text:string)=>createHash("sha256").update(text).digest("hex");
async function main(){
  const a=args(),env=loadProjectEnv();
  const split=String(a.split??"final");if(!["dev","final"].includes(split))throw new Error("Choose --split dev|final");
  if (!a["training-run"]) throw new Error("Provide --training-run work/ml/ACTUAL_V5_TRAINING_RECORD.json");
  const training=await readVerifiedV5TrainingRecord(String(a["training-run"]));
  const trainingManifest=JSON.parse(await readFile("data/training/v5-reference-contract/manifest.json","utf8"));
  const audit=JSON.parse(await readFile("data/training/v5-reference-contract/tokenizer-audit.json","utf8"));
  if(training.postTrainingExport&&training.postTrainingExport.baseRevision!==audit.baseRevisionObserved)throw new Error("Repaired export base differs from the audited training base revision.");
  if (training.mode!=="real-veri-sft"||training.state!=="completed"||!training.cleanupVerified||
      training.datasetSha256!==trainingManifest.hashes["train.jsonl"]||training.datasetSha256!==audit.trainingSha256||
      training.dataVersion!==trainingManifest.version||training.promptProfile!=="reference-contract-v5"||
      training.baseModel!==audit.baseModel||training.rows!==trainingManifest.trainingCount)
    throw new Error("Candidate must be the completed export of the exact reviewed V5 training corpus.");
  const publication=JSON.parse(await readFile(`work/ml/published-${basename(training.repo)}.json`,"utf8"));
  if(publication.repo!==training.repo||publication.public!==true||publication.anonymousConfigHttp!==200)
    throw new Error("Candidate must have a revision-bound verified public export.");
  const identities={base:{repo:audit.baseModel,revision:audit.baseRevisionObserved},tuned:{repo:publication.repo,revision:publication.revision}};
  const dir="data/evaluation/v5-"+(split==="dev"?"development":"final");
  const manifest=JSON.parse(await readFile(dir+"/manifest.json","utf8"));
  assertReviewedV5Evaluation(manifest,split==="dev"?"development-only":"final-evaluation");
  const selection=split==="final"?await readV5FinalSelection():null;
  const bytes=await readFile(dir+"/evaluation.frozen.jsonl","utf8");
  if(sha(bytes)!==manifest.hashes["evaluation.frozen.jsonl"])throw new Error("Frozen case bytes differ");
  const cases=new Map<string,LabeledExample>(bytes.trim().split("\n").map(line=>{const row=JSON.parse(line);return [row.id,row];}));
  const runs=[];
  for(const label of ["base","tuned"] as const){
    const raw=JSON.parse(await readFile(`work/ml/evaluation-v5-${label}-${split}.json`,"utf8"));
    const recovery=JSON.parse(await readFile(veriRecoveryRecordPath(raw.reservationId),"utf8"));
    const responseModelIdentity=verifyVeriServingRecordIdentity(raw,recovery);
    if(selection)assertV5FinalRunSelection(selection,raw);
    assertV5RunIdentity(raw,{label:`v5-${label}-${split}`,dataVersion:manifest.version,count:cases.size,corpusPurpose:manifest.purpose,artifact:identities[label]});
    if(raw.status!=="completed"||!raw.stopVerified||!raw.costSettled||raw.promptProfile!=="reference-contract-v5"||raw.promptContractSha256!==v5PromptHash()||
       raw.evaluationSha256!==sha(bytes)||raw.corpusPurpose!==manifest.purpose||raw.rows.length!==cases.size||new Set(raw.rows.map((r:{id:string})=>r.id)).size!==cases.size)
      throw new Error("Incomplete or mismatched V5 run");
    const rows=raw.rows.map((r:{id:string;text:string;expected:unknown;score:unknown;promptSha256:string;latencyMs:number;finishReason:unknown;returnedModel?:string})=>{
      const example=cases.get(r.id);if(!example||typeof r.text!=="string"||r.text.length>32768)throw new Error("Unknown case or unbounded output");
      if(!isDeepStrictEqual(r.expected,example.expected)||r.promptSha256!==sha(extractionPromptV5(example.context)))throw new Error("Prediction label/prompt binding differs");
      const score=scoreExtraction(r.text,example.context,example.expected);if(!isDeepStrictEqual(score,r.score))throw new Error("Actual response disagrees with recorded score");
      return {id:r.id,family:example.family,promptSha256:r.promptSha256,output:r.text,outputSha256:sha(r.text),expected:example.expected,score,latencyMs:r.latencyMs,finishReason:r.finishReason,returnedModel:r.returnedModel};
    });
    const summary=summarizeExtraction(rows.map((r:{score:ReturnType<typeof scoreExtraction>})=>r.score));
    if(!isDeepStrictEqual(summary,raw.summary))throw new Error("Summary differs from actual predictions");
    // Training canaries remain private diagnostics, never held-out evidence.
    runs.push({raw:{...raw,rows,summary},published:{label,artifact:raw.artifact,decode:raw.decode,launch:raw.launch,comparisonScope:raw.comparisonScope,identityBoundary:raw.identityBoundary,responseModelIdentity,finalSelectionSha256:raw.finalSelectionSha256,completedAt:raw.completedAt,stopVerified:raw.stopVerified,costSettled:raw.costSettled,summary,rows}});
  }
  const [base,tuned]=runs;
  if(!isDeepStrictEqual(base.raw.decode,tuned.raw.decode)||!isDeepStrictEqual(base.raw.launch,tuned.raw.launch)||!isDeepStrictEqual(base.raw.rows.map((r:{id:string})=>r.id),tuned.raw.rows.map((r:{id:string})=>r.id)))throw new Error("Runs use different decoding, launch or case order");
  const comparison=split==="final"?compareV5Evaluations(base.raw,tuned.raw):{status:"development-only",promoted:false,detail:"Development guides candidate selection; it cannot authorize promotion."};
  const artifact={schemaVersion:1,origin:"recorded",dataClassification:"PUBLIC_SYNTHETIC",dataVersion:manifest.version,purpose:manifest.purpose,evaluationSha256:sha(bytes),promptProfile:"reference-contract-v5",promptContractSha256:v5PromptHash(),caseCount:cases.size,base:base.published,tuned:tuned.published,comparison,...(selection?{finalSelection:selection.selection,finalSelectionSha256:selection.sha256}:{})};
  const serialized=JSON.stringify(artifact,null,2)+"\n";
  for(const [name,value]of Object.entries(env))if(value&&value.length>12&&/API_KEY|AUTH_TOKEN|HF_TOKEN|OIDC_TOKEN|SECRET/.test(name)&&serialized.includes(value))throw new Error("Credential match prevents publication");
  const target=`data/artifacts/extraction-v5-${split==="dev"?"development":"evaluation"}.json`;
  await writeFile(target,serialized);
  if(split==="final")await saveJson("work/ml/v5-base-tuned-comparison.json",comparison);
  console.log(JSON.stringify({published:target,base:base.published.summary,tuned:tuned.published.summary,comparison}));
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
