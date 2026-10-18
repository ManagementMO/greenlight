# Greenlight supervised extraction data, v4

This version changes the shared model prompt to an actual JSON Schema. It preserves all **276 training contexts and expected labels** from v3 and the same **23 proof selections**. It creates no evaluation examples. The separate fresh final set is in `data/evaluation/v4-schema-contract/`.

Each `train.jsonl` row contains a user-message `prompt` and assistant-message `completion`. The prompt supplies the fixed extraction instructions, strict schema and fictional source context. The completion is the typed interpretation: amount reference, bounded trigger tree, due rule, source reference, status and issues. Training updates the Qwen extractor's adapter weights; it does not train Jev or learn a bank balance.

The unchanged labels cover the six supported conditions, conjunctions/alternatives, calendar and invoice-issuance clocks, missing information, unsupported terms, and who received an insurance certificate. They are synthetic developer-reviewed labels, not independently adjudicated customer truth. Public export is authorized only for these fictional `PUBLIC_SYNTHETIC` rows.

## Freeze and audit

Training SHA256: `2ae2030efebbd20ab9adbe4ff92f4c187d71c8e1da0480c6652b9010cc187571`. The manifest binds every data file and the prompt schema. The generator refuses silent changes to an existing version. Do not edit these files during the current experiment.

The actual Qwen tokenizer checks every row: maximum **1,330 total tokens**, minimum **54 answer tokens**, exact prompt-token prefixes, zero truncation at **1,536**. The paid v4 training CLI requires a matching audit bound to data SHA, base model and row count before upload or GPU allocation. The local audit verifies serialization and intended completion boundaries; remote effective loss tensors are not directly attested.

```sh
uv run --no-project --with tokenizers==0.22.2 --with jinja2==3.1.6 \
  scripts/ml/tokenizer-audit.py \
  --training-dir data/training/v4-schema-contract \
  --max-seq-length 1536 \
  --output work/ml/tokenizer-audit-v4-reproduction.json
```

Use a new audit output path to preserve the artifact bound to an existing run. This command performs local tokenization, not model inference.

## Later improvements

Create a new corpus version for new labels. Keep realistic source review, difficult recipient/clock distinctions and appropriate abstention; do not label raw successful agent traces as ground truth. Develop with a separate development set. Once a final set's predictions have been inspected, it becomes exposed evidence and cannot serve as a fresh protected test for a revised model or prompt. A later release needs a new protected final set and predeclared gates.

The current comparison uses the original base artifact and the trained/merged quantized artifact pipeline. It does not isolate the causal effect of LoRA from export/runtime precision differences. Report actual validity, material accuracy, correct supported coverage, unsafe proposals and the fixed gate; training loss alone is not a product-quality result.
