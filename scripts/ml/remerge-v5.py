"""Reproduce the V5 BF16 export diagnostic from the saved adapter and pinned base.

Run from the repo root with the ignored owner evidence under
work/ml/v5-precision-repair/. This materializes weights and runs six training
canaries locally; it does not allocate a provider GPU, retrain, or publish.
The implementation and package versions are bound by merge-evidence.json.
"""
import gc, hashlib, json, time
from pathlib import Path
from datetime import datetime, timezone
from dotenv import load_dotenv
load_dotenv('.env')
import torch, transformers, peft
from transformers import AutoModelForCausalLM, AutoTokenizer
from peft import PeftModel
from safetensors.torch import load_file

root=Path('work/ml/v5-precision-repair')
audit=json.loads(Path('data/training/v5-reference-contract/tokenizer-audit.json').read_text())
provenance=json.loads((root/'adapter-provenance.json').read_text())
weights=load_file(str(root/'adapter/adapter_model.safetensors'))
bs=[value.float() for name,value in weights.items() if 'lora_B' in name]
if not bs or not any(torch.count_nonzero(value).item() for value in bs):
    raise ValueError('Saved adapter contains no learned nonzero LoRA B weights')
print(json.dumps({'event':'adapter-nonzero','tensorCount':len(weights),'bTensorCount':len(bs),'maximumBAbs':max(value.abs().max().item() for value in bs)}),flush=True)
del weights,bs;gc.collect()
base=AutoModelForCausalLM.from_pretrained(audit['baseModel'],revision=audit['baseRevisionObserved'],dtype=torch.bfloat16,device_map='cpu',trust_remote_code=False)
model=PeftModel.from_pretrained(base,str(root/'adapter')).merge_and_unload(safe_merge=True)
if getattr(model,'is_quantized',False) or getattr(model.config,'quantization_config',None):
    raise ValueError('Repair must materialize a nonquantized base plus the actual trained adapter')
tokenizer=AutoTokenizer.from_pretrained(str(root/'adapter'),trust_remote_code=False)
model.save_pretrained(str(root/'merged'),safe_serialization=True,max_shard_size='2GB')
tokenizer.save_pretrained(str(root/'merged'))
files=[]
for path in sorted((root/'merged').iterdir()):
    if path.is_file():
        h=hashlib.sha256()
        with path.open('rb') as stream:
            for block in iter(lambda:stream.read(8*1024*1024),b''):h.update(block)
        files.append({'path':path.name,'bytes':path.stat().st_size,'sha256':h.hexdigest()})
report={'schemaVersion':1,'method':'saved-v5-adapter-on-pinned-bfloat16-base','source':provenance,'baseRevision':audit['baseRevisionObserved'],'dtype':'bfloat16','safeMerge':True,'files':files,'packages':{'torch':torch.__version__,'transformers':transformers.__version__,'peft':peft.__version__},'mergedAt':datetime.now(timezone.utc).isoformat(),'noRetraining':True}
(root/'merge-evidence.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({'event':'merge-complete','fileCount':len(files),'totalBytes':sum(f['bytes'] for f in files)}),flush=True)
device='mps' if torch.backends.mps.is_available() else 'cpu'
model=model.to(device).eval()
rows=json.loads((root/'canary-prompts.json').read_text())
outputs=[]
for row in rows:
    inputs=tokenizer.apply_chat_template([{'role':'user','content':row['prompt']}],tokenize=True,add_generation_prompt=True,return_tensors='pt',return_dict=True).to(device)
    started=time.time()
    with torch.inference_mode():
        output=model.generate(**inputs,max_new_tokens=768,do_sample=False,pad_token_id=tokenizer.eos_token_id)
    text=tokenizer.decode(output[0,inputs['input_ids'].shape[1]:],skip_special_tokens=True)
    outputs.append({'id':row['id'],'text':text,'elapsedSeconds':time.time()-started,'device':device})
    (root/'local-canaries.json').write_text(json.dumps(outputs,indent=2)+'\n')
    print(json.dumps({'event':'local-canary','id':row['id'],'seconds':round(time.time()-started,2)}),flush=True)
