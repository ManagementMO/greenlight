import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { scoreExtraction } from "../lib/providers/evaluation";
import { loadProjectEnv, saveJson } from "./ml/shared";
import type { LabeledExample } from "./ml/generate-data";

/** Training diagnostics remain separate from all development/final denominators. */
async function main(){
  const env=loadProjectEnv(), read=async(path:string)=>JSON.parse(await readFile(path,"utf8"));
  const initial=await read("work/ml/evaluation-v5-initial-tuned-dev.json");
  const local=await read("work/ml/v5-precision-repair/local-canaries.json") as {id:string;text:string;device:string}[];
  const lineage=await read("data/artifacts/v5-export-lineage.json");
  const parity=await read("work/ml/v5-precision-repair/tokenizer-parity.json");
  const trainBytes=await readFile("data/training/v5-reference-contract/train-labels.jsonl","utf8");
  const manifest=await read("data/training/v5-reference-contract/manifest.json");
  if(createHash("sha256").update(trainBytes).digest("hex")!==manifest.hashes["train-labels.jsonl"]||
      lineage.trainingSha256!==manifest.hashes["train.jsonl"]||initial.status!=="completed"||!initial.stopVerified||!initial.costSettled||
      initial.promptProfile!=="reference-contract-v5"||initial.artifact.repo!==lineage.sourceTrainingRepo||initial.trainingCanaries.length!==6||local.length!==6||
      new Set(local.map(row=>row.id)).size!==6||parity.promptCount!==6||parity.tokenizationMatches!==true||parity.chatTemplateMatches!==true)
    throw new Error("Export diagnostic requires complete original inference, reviewed training data, six actual local outputs and tokenizer parity.");
  if(!Array.isArray(parity.promptIds)||new Set(parity.promptIds).size!==6||local.some(row=>!parity.promptIds.includes(row.id)))throw new Error("Tokenizer parity is not bound to these six training canaries.");
  const cases=new Map<string,LabeledExample>(trainBytes.trim().split("\n").map(line=>{const value=JSON.parse(line);return[value.id,value];}));
  const rows=(values:{id:string;text:string;score?:unknown}[],recorded:boolean)=>values.map(row=>{
    const example=cases.get(row.id);
    if(!example||typeof row.text!=="string"||row.text.length>32768||!initial.trainingCanaries.some((item:{id:string})=>item.id===row.id))throw new Error("Unknown or invalid training canary response");
    const score=scoreExtraction(row.text,example.context,example.expected);
    if(recorded&&!isDeepStrictEqual(score,row.score))throw new Error("Original training canary score differs from actual output.");
    return{id:row.id,output:row.text,outputSha256:createHash("sha256").update(row.text).digest("hex"),score};
  });
  const old=rows(initial.trainingCanaries,true), repaired=rows(local,false);
  const summary=(values:typeof old)=>({count:values.length,valid:values.filter(row=>row.score.valid).length,materialExact:values.filter(row=>row.score.materialExact).length});
  let providerRepair;
  try {
    const current=await read("work/ml/evaluation-v5-tuned-dev.json");
    if(current.status==="completed"&&current.stopVerified&&current.costSettled&&current.artifact?.repo===lineage.repo&&current.artifact?.revision===lineage.revision){
      if(current.trainingCanaries?.length!==6)throw new Error("Incomplete repaired provider canaries");
      const providerRows=rows(current.trainingCanaries,true);
      providerRepair={artifact:{repo:current.artifact.repo,revision:current.artifact.revision},runtime:"Veri / vLLM",summary:summary(providerRows),rows:providerRows};
    }
  }catch(error){if((error as NodeJS.ErrnoException).code!=="ENOENT")throw error;}
  const artifact={schemaVersion:1,origin:"recorded",dataClassification:"PUBLIC_SYNTHETIC",purpose:"training-canary-export-diagnostic",includedInHeldOutMetrics:false,
    trainingSha256:lineage.trainingSha256,adapterSha256:lineage.adapterSha256,
    initial:{artifact:{repo:initial.artifact.repo,revision:initial.artifact.revision},runtime:"Veri / vLLM",summary:summary(old),rows:old},
    repaired:{artifact:{repo:lineage.repo,revision:lineage.revision},runtime:"Local MPS / Transformers 5.20.1",summary:summary(repaired),rows:repaired},
    ...(providerRepair?{repairedProvider:providerRepair}:{}),
    tokenizerParity:parity,
    boundary:"All six examples were already in training. Runtime and materialization differ; this is a diagnostic, not a controlled benchmark or evidence of held-out generalization. The matched Veri development and final evaluations determine quality and promotion."};
  const serialized=JSON.stringify(artifact);
  for(const[name,value]of Object.entries(env))if(value&&value.length>12&&/API_KEY|AUTH_TOKEN|HF_TOKEN|OIDC_TOKEN|SECRET/.test(name)&&serialized.includes(value))throw new Error("Credential match prevents diagnostic publication.");
  await saveJson("data/artifacts/v5-export-diagnostic.json",artifact);
  console.log(JSON.stringify({published:"data/artifacts/v5-export-diagnostic.json",initial:summary(old),repaired:summary(repaired),heldOutMetricContribution:0}));
}
main().catch(error=>{console.error(error instanceof Error?error.message:"Export diagnostic failed");process.exitCode=1;});
