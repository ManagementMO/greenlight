import {describe,it,expect} from "vitest";
import {assertV5TrainingRecordLineage} from "../../lib/providers/v5-training-record";

function fixture(){
  const h="a".repeat(64), revision="b".repeat(40);
  const source={mode:"real-veri-sft",state:"completed",cleanupVerified:true,repo:"owner/original",exportUrl:"https://huggingface.co/owner/original",jobId:"job300",maxSteps:300,baseModel:"owner/base",datasetSha256:h,rows:336};
  const files=[{path:"model.safetensors",bytes:100,sha256:h}];
  const p={schemaVersion:1,dataClassification:"PUBLIC_SYNTHETIC",noRetraining:true,method:"saved-v5-adapter-on-pinned-bfloat16-base",dtype:"bfloat16",sourceTrainingJobId:source.jobId,sourceTrainingRepo:source.repo,trainingSha256:h,sourceTrainingRecordSha256:h,mergeEvidenceSha256:h,baseModel:source.baseModel,baseRevision:revision,adapterSha256:h,files};
  const derived={...source,repo:"owner/headroom-extractor-v5-bf16-job300",exportUrl:"https://huggingface.co/owner/headroom-extractor-v5-bf16-job300",postTrainingExport:{...p,sourceTrainingRecord:"work/ml/source.json",mergeEvidencePath:"work/ml/merge.json"}};
  const merge={method:p.method,safeMerge:true,noRetraining:true,dtype:p.dtype,baseRevision:revision,source:{jobId:source.jobId,checkpointStep:300,sourceRepo:source.repo,trainingSha256:h,files:[{path:"adapter_model.safetensors",sha256:h}]},files};
  const publication={repo:derived.repo,revision,public:true,anonymousConfigHttp:200,postTrainingExport:p};
  return{h,source,derived,merge,publication};
}
const check=(f:ReturnType<typeof fixture>)=>assertV5TrainingRecordLineage(f.derived,f.source,f.h,f.merge,f.h,f.publication);
describe("V5 post-training export lineage",()=>{
  it("allows a distinct materialization of the exact completed training and saved adapter",()=>{expect(()=>check(fixture())).not.toThrow();});
  it("does not let export repair rewrite training data, step count, original identity or hashes",()=>{
    for(const change of [(f:ReturnType<typeof fixture>)=>{f.derived.maxSteps=400;},(f:ReturnType<typeof fixture>)=>{f.derived.datasetSha256="d".repeat(64);},(f:ReturnType<typeof fixture>)=>{f.derived.postTrainingExport.sourceTrainingRepo="owner/other";},(f:ReturnType<typeof fixture>)=>{f.derived.postTrainingExport.sourceTrainingRecordSha256="d".repeat(64);}]){const f=fixture();change(f);expect(()=>check(f)).toThrow();}
  });
  it("binds the adapter, checkpoint, safe merge, file hashes and verified public export",()=>{
    const changes=[(f:ReturnType<typeof fixture>)=>{f.merge.safeMerge=false;},(f:ReturnType<typeof fixture>)=>{f.merge.source.checkpointStep=299;},(f:ReturnType<typeof fixture>)=>{f.merge.source.files[0].sha256="d".repeat(64);},(f:ReturnType<typeof fixture>)=>{f.publication.public=false;},(f:ReturnType<typeof fixture>)=>{f.derived.postTrainingExport.files=[{path:"../../bad",bytes:1,sha256:f.h}];}];
    for(const change of changes){const f=fixture();change(f);expect(()=>check(f)).toThrow();}
  });
});
