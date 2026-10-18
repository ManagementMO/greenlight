import { describe,it,expect } from "vitest";
import { assertReviewedV5Evaluation, v5PromptHash } from "../../lib/providers/evaluation-v5";
import { summarizeExtraction, type ExtractionScore } from "../../lib/providers/evaluation";
import { compareV5Evaluations } from "../../scripts/ml/compare-v5-evaluations";

type Outcome="exact"|"invalid"|"abstain"|"wrong-status"|"unsafe";
function run(overrides: Record<number,Outcome>={}, allInvalid=false) {
  const rows=Array.from({length:40},(_,i)=>{
    const expectedStatus: ExtractionScore["expectedStatus"]=i<24?"PROPOSED":i<32?"AMBIGUOUS":"UNSUPPORTED";
    const kind=overrides[i]??(allInvalid?"invalid":"exact");
    const valid=kind!=="invalid", materialExact=kind==="exact";
    const proposed=valid&&(kind==="unsafe"||(materialExact&&expectedStatus==="PROPOSED"));
    const score: ExtractionScore={expectedStatus,valid,materialExact,proposed,unsafeProposed:proposed&&!materialExact,statusCorrect:materialExact||(kind==="unsafe"&&expectedStatus==="PROPOSED")};
    return {id:"case-"+i,promptSha256:"a".repeat(64),latencyMs:1,score};
  });
  return {status:"completed",corpusPurpose:"final-evaluation",purpose:"frozen-heldout-evaluation",evaluationSha256:"b".repeat(64),exampleCount:40,frozenCaseCount:40,
    decode:{temperature:0,maxTokens:768},launch:{engine:"vllm"},promptProfile:"reference-contract-v5",promptContractSha256:v5PromptHash(),rows,summary:summarizeExtraction(rows.map(row=>row.score)),
    artifact:{repo:"test/model",revision:"frozen"},stopVerified:true,costUsd:.1,provisioningMs:1};
}
const base=()=>run({},true);
const overrides=(indices:number[],value:Outcome):Record<number,Outcome>=>Object.fromEntries(indices.map(i=>[i,value]));

describe("v5 useful-coverage release gate",()=>{
  it("requires an absolute supported floor, not just improvement from zero",()=>{
    expect(compareV5Evaluations(base(),run(overrides([0,1,2,3],"abstain"))).promoted).toBe(true);
    expect(compareV5Evaluations(base(),run(overrides([0,1,2,3,4],"abstain"))).promoted).toBe(false);
  });
  it("requires90% validity independently of coverage and uncertainty",()=>{
    expect(compareV5Evaluations(base(),run(overrides([0,1,2,24],"invalid"))).promoted).toBe(true);
    expect(compareV5Evaluations(base(),run(overrides([0,1,2,24,32],"invalid"))).promoted).toBe(false);
  });
  it("requires80% status accuracy in each uncertainty class",()=>{
    for(const start of [24,32]){
      expect(compareV5Evaluations(base(),run(overrides([start],"wrong-status"))).promoted).toBe(true);
      expect(compareV5Evaluations(base(),run(overrides([start,start+1],"wrong-status"))).promoted).toBe(false);
    }
  });
  it("rejects any incorrect validated proposal and preserves ties",()=>{
    expect(compareV5Evaluations(run({0:"unsafe",1:"unsafe"}),run({0:"unsafe"})).promoted).toBe(false);
    expect(compareV5Evaluations(run(),run()).promoted).toBe(false);
    expect(compareV5Evaluations(run(),run({0:"abstain"})).promoted).toBe(false);
  });
  it("refuses development, stale prompts, partial/duplicate cases and forged summaries",()=>{
    expect(()=>compareV5Evaluations({...base(),corpusPurpose:"development-only"},run())).toThrow("Development");
    expect(()=>compareV5Evaluations({...base(),promptContractSha256:"stale"},{...run(),promptContractSha256:"stale"})).toThrow("prompt contract");
    expect(()=>compareV5Evaluations(base(),{...run(),rows:run().rows.slice(1)})).toThrow("Full");
    const dup=run();dup.rows[1].id=dup.rows[0].id;
    expect(()=>compareV5Evaluations(base(),dup)).toThrow();
    const forged=run();forged.summary.valid=0;
    expect(()=>compareV5Evaluations(base(),forged)).toThrow("aggregates");
  });
});

describe("v5 pre-query manifest binding",()=>{
  const good=()=>({promptProfile:"reference-contract-v5",promptContractSha256:v5PromptHash(),dataClassification:"PUBLIC_SYNTHETIC",purpose:"development-only",frozen:true,
    reviewStatus:"independently-audited-before-query",independentAudit:{evaluationSha256:"a".repeat(64)},hashes:{"evaluation.frozen.jsonl":"a".repeat(64)}});
  it("requires exact reviewed hashes and directory purpose",()=>{
    expect(()=>assertReviewedV5Evaluation(good(),"development-only")).not.toThrow();
    expect(()=>assertReviewedV5Evaluation(good(),"final-evaluation")).toThrow();
    for(const change of [{frozen:false},{reviewStatus:"pending-review"},{promptContractSha256:"stale"},{hashes:undefined,independentAudit:undefined},{hashes:{"evaluation.frozen.jsonl":"bad"}},{independentAudit:{evaluationSha256:"b".repeat(64)}}])
      expect(()=>assertReviewedV5Evaluation({...good(),...change},"development-only")).toThrow();
  });
});
