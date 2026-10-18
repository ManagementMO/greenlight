"""Local tokenizer/mask preflight; never performs inference or starts GPU work.

uv run --no-project --with tokenizers==0.22.2 --with jinja2==3.1.6 \
  scripts/ml/tokenizer-audit.py
"""
import hashlib
import json
import subprocess
from pathlib import Path
from tokenizers import Tokenizer
from jinja2 import Environment

root = Path(__file__).resolve().parents[2]
scratch = root / "work/ml/provider-docs"
scratch.mkdir(parents=True, exist_ok=True)
metadata = json.loads(subprocess.run([
    "curl", "-fsSL", "--max-time", "30",
    "https://huggingface.co/api/models/Qwen/Qwen3-4B-Instruct-2507",
], check=True, capture_output=True, text=True, timeout=35).stdout)
revision = metadata["sha"]
for name in ["tokenizer.json", "tokenizer_config.json"]:
    target = scratch / (revision + "-" + name)
    if not target.exists():
        subprocess.run([
            "curl", "-fsSL", "--max-time", "60",
            "https://huggingface.co/Qwen/Qwen3-4B-Instruct-2507/resolve/" + revision + "/" + name,
            "-o", str(target),
        ], check=True, capture_output=True, timeout=65)
config_path = scratch / (revision + "-tokenizer_config.json")
tokenizer_path = scratch / (revision + "-tokenizer.json")
config = json.loads(config_path.read_text())
tokenizer = Tokenizer.from_file(str(tokenizer_path))
# The supported rows use only user/assistant roles and textual content.
environment = Environment()
environment.globals["raise_exception"] = lambda msg: (_ for _ in ()).throw(ValueError(msg))
template = environment.from_string(config["chat_template"])
manifest = json.loads((root / "data/training/manifest.json").read_text())
training_bytes = (root / "data/training/train.jsonl").read_bytes()
training_sha256 = hashlib.sha256(training_bytes).hexdigest()
if training_sha256 != manifest["hashes"]["train.jsonl"]:
    raise SystemExit("Training corpus differs from the frozen manifest")
rows = [json.loads(line) for line in training_bytes.decode().splitlines()]
report = []
for index, row in enumerate(rows):
    prompt = template.render(messages=row["prompt"], add_generation_prompt=True)
    combined = template.render(messages=row["prompt"] + row["completion"], add_generation_prompt=False)
    prompt_ids = tokenizer.encode(prompt, add_special_tokens=False).ids
    all_ids = tokenizer.encode(combined, add_special_tokens=False).ids
    completion_tokens = len(all_ids) - len(prompt_ids)
    report.append({"index": index, "tokens": len(all_ids), "promptTokens": len(prompt_ids),
                   "completionTokens": completion_tokens,
                   "tokenPrefixMatches": all_ids[:len(prompt_ids)] == prompt_ids,
                   "wouldTruncate1536": len(all_ids) > 1536})
result = {
    "schemaVersion": 1,
    "baseModel": "Qwen/Qwen3-4B-Instruct-2507",
    "dataVersion": manifest["version"], "trainingSha256": training_sha256,
    "baseRevisionObserved": revision,
    "tokenizerSha256": hashlib.sha256(tokenizer_path.read_bytes()).hexdigest(),
    "chatTemplateSha256": hashlib.sha256(config["chat_template"].encode()).hexdigest(),
    "tokenizerClass": config["tokenizer_class"], "eosToken": config["eos_token"],
    "examples": len(report), "maxTokens": max(r["tokens"] for r in report),
    "invoiceIssuanceClockExamples": sum(
        (json.loads(row["completion"][0]["content"]).get("due") or {}).get("kind")
        == "CALENDAR_DAYS_AFTER_INVOICE_ISSUED" for row in rows
    ),
    "minCompletionTokens": min(r["completionTokens"] for r in report),
    "allPromptTokenPrefixesMatch": all(r["tokenPrefixMatches"] for r in report),
    "truncatedExamplesAt1536": sum(r["wouldTruncate1536"] for r in report),
    "intendedLossMask": "completion-only from TRL prompt-completion format default",
    "remoteEffectiveMaskVerified": False,
    "boundary": "Local tokenization and intended mask validation; does not inspect tensors on the remote worker.",
    "rows": report,
}
dest = root / "work/ml/tokenizer-audit.json"
dest.write_text(json.dumps(result, indent=2) + "\n")
print(json.dumps({key: value for key, value in result.items() if key != "rows"}, indent=2))
if not result["allPromptTokenPrefixesMatch"] or result["truncatedExamplesAt1536"]:
    raise SystemExit("Tokenizer/mask preflight failed")
