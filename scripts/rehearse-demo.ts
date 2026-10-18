import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { evaluateDecision, listScenarios, getScenario, applyProposal, validateDecisionInput, type DecisionResult } from "../lib/domain";
import { validPublicV5Evaluation } from "../lib/public-extraction-evaluation";

/** Public deterministic rehearsal: no credentials, model calls or mutation endpoints. */
async function main(){
  const base=new URL(process.argv[2]??"http://localhost:3000");
  assert.ok(["http:","https:"].includes(base.protocol),"Use an HTTP(S) demo URL");
  assert.ok(!base.username&&!base.password,"Do not put credentials in the demo URL");
  const request=(path:string,body?:unknown)=>fetch(new URL(path,base),{signal:AbortSignal.timeout(30000),...(body===undefined?{}:{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)})});
  const healthResponse=await request("/api/health");assert.equal(healthResponse.status,200);
  const health=await healthResponse.json();assert.equal(health.status,"ok");assert.equal(health.paidPublicInference,false);
  if(process.argv[3])assert.equal(health.sourceRevision,process.argv[3],"Deployed revision differs from the requested commit");
  const comparable=(r:DecisionResult)=>({status:r.status,scenarioCount:r.scenarioCount,passingScenarioCount:r.passingScenarioCount,coverageComplete:r.coverageComplete,minimumCashRange:r.minimumCashRange,reserveGapCents:r.reserveGapCents,proposal:r.proposal});
  for(const scenario of listScenarios()){
    const parsed=validateDecisionInput(scenario);assert.ok(parsed.success);
    const response=await request("/api/decision",{scenarioId:scenario.id});assert.equal(response.status,200);
    const text=await response.text();assert.ok(Buffer.byteLength(text)<2*1024*1024);
    assert.deepEqual(comparable(JSON.parse(text)),comparable(evaluateDecision(parsed.data)));
    console.log("PASS · "+scenario.name);
  }
  const original=validateDecisionInput(getScenario("ductline-phase-delay"));assert.ok(original.success);
  const proposal=evaluateDecision(original.data).proposal;assert.ok(proposal);
  const revised=applyProposal(original.data,proposal), response=await request("/api/decision",revised);
  assert.equal(response.status,200);const result=await response.json();
  assert.deepEqual(comparable(result),comparable(evaluateDecision(revised)));
  assert.equal(result.minimumCashRange.worstCents,1_000_000);assert.equal(result.passingScenarioCount,2);
  console.log("PASS · conserved proposal restores $10,000 across 2/2 declared paths");
  const replayResponse=await request("/api/experiments/replay",{});assert.equal(replayResponse.status,200);
  const replay=await replayResponse.json();assert.equal(replay.gate.promoted,true);
  console.log("PASS · recorded MetaHarness gate replay");
  const localArtifacts=JSON.parse(await readFile(new URL("../data/artifacts/current.json",import.meta.url),"utf8"));
  if(localArtifacts.extractionV5Development||localArtifacts.extractionV5Final){
    const artifactsResponse=await request("/api/artifacts");assert.equal(artifactsResponse.status,200);
    const artifacts=await artifactsResponse.json();
    for(const [key,purpose]of [["extractionV5Development","development-only"],["extractionV5Final","final-evaluation"]]as const){
      if(!localArtifacts[key])continue;
      assert.ok(validPublicV5Evaluation(artifacts[key],purpose),"Live V5 artifact is incomplete or contradictory");
      assert.deepEqual(artifacts[key],localArtifacts[key],"Live V5 scores, models or verdict differ from the published release");
      console.log(`PASS · V5 ${purpose} · ${artifacts[key].caseCount} cases · ${artifacts[key].comparison.status}`);
    }
    assert.deepEqual(artifacts.training,localArtifacts.training,"Live V5 training evidence differs");
    if(localArtifacts.extractionDemo?.promptProfile==="reference-contract-v5")
      assert.deepEqual(artifacts.extractionDemo,localArtifacts.extractionDemo,"Live source illustration differs from the evaluated model output");
  }
  console.log(JSON.stringify({ready:true,sourceRevision:health.sourceRevision,paidCalls:0,checkedAt:new Date().toISOString()}));
}
main().catch(error=>{console.error("Demo rehearsal failed: "+error.message);process.exitCode=1;});
