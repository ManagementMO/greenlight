import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { describe,it,expect } from "vitest";
import { validateExtraction, type Trigger } from "../../lib/providers/extraction";
import { assertReviewedV5Evaluation, V5_GATE } from "../../lib/providers/evaluation-v5";
import type { LabeledExample } from "../../scripts/ml/generate-data";
const read=(path:string)=>readFileSync(path,"utf8");
const rows=(path:string):LabeledExample[]=>read(path).trim().split("\n").map(line=>JSON.parse(line));
const train=rows("data/training/v5-reference-contract/train-labels.jsonl");
const dev=rows("data/evaluation/v5-development/evaluation.frozen.jsonl");
const final=rows("data/evaluation/v5-final/evaluation.frozen.jsonl");
function satisfies(t:Trigger,atoms:string[]):boolean{return t.op==="ATOM"?atoms.includes(t.condition+":"+t.subject):t.op==="ALL"?t.children.every(c=>satisfies(c,atoms)):t.children.some(c=>satisfies(c,atoms));}
describe("v5 reviewed independent prose corpora",()=>{
  it("binds both reviewed splits to the exact bytes and purpose",()=>{
    for(const [dir,purpose,count] of [["v5-development","development-only",24],["v5-final","final-evaluation",48]] as const){
      const path="data/evaluation/"+dir;
      const manifest=JSON.parse(read(path+"/manifest.json"));
      expect(()=>assertReviewedV5Evaluation(manifest,purpose)).not.toThrow();
      expect(rows(path+"/evaluation.frozen.jsonl")).toHaveLength(count);
      expect(createHash("sha256").update(read(path+"/evaluation.frozen.jsonl")).digest("hex")).toBe(manifest.hashes["evaluation.frozen.jsonl"]);
      if(purpose==="final-evaluation")expect(manifest.gate).toEqual(V5_GATE);
    }
  });
  it("preserves32/8/8 final classes and validates all grounded fields",()=>{
    expect(["PROPOSED","AMBIGUOUS","UNSUPPORTED"].map(s=>final.filter(row=>row.expected.status===s).length)).toEqual([32,8,8]);
    for(const row of [...dev,...final]) expect(validateExtraction(row.expected,row.context)).toEqual(row.expected);
  });
  it("has no exact identities or text leaking between train, dev and final",()=>{
    const legacy=rows("data/evaluation/v4-schema-contract/evaluation.frozen.jsonl");
    const prior=[...train,...dev,...legacy];
    for(const select of [(r:LabeledExample)=>r.id,(r:LabeledExample)=>r.companyId,(r:LabeledExample)=>r.context.sourceId,(r:LabeledExample)=>r.context.text]){
      const previous=new Set(prior.map(select));
      expect(new Set(final.map(select)).size).toBe(48);
      for(const row of final)expect(previous.has(select(row))).toBe(false);
    }
    for(const select of [(r:LabeledExample)=>r.context.subjects,(r:LabeledExample)=>r.context.amountRefs.map(a=>a.id)]){
      const previous=new Set(prior.flatMap(select));
      for(const value of final.flatMap(select))expect(previous.has(value)).toBe(false);
    }
  });
  it("keeps complete alternative routes and shared prerequisites distinct",()=>{
    const pair=final.find(row=>row.id==="v5-final-10")!;
    const node=pair.expected.trigger!;
    if(node.op!=="ANY"||node.children[0].op!=="ALL")throw new Error("Wrong reviewed case");
    const atoms=(t:Trigger):string[]=>t.op==="ATOM"?[t.condition+":"+t.subject]:t.children.flatMap(atoms);
    const left=atoms(node.children[0]),right=atoms(node.children[1]);
    expect(satisfies(node,left)).toBe(true);expect(satisfies(node,right)).toBe(true);
    expect(satisfies(node,[left[0],right[0]])).toBe(false);
    const mandatory=final.find(row=>row.id==="v5-final-09")!.expected.trigger!;
    if(mandatory.op!=="ALL")throw new Error("Wrong reviewed case");
    expect(satisfies(mandatory,atoms(mandatory.children[1]))).toBe(false);
  });
});
