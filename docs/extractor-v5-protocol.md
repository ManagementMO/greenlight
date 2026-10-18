# V5: useful clause extraction, measured separately from V4

This version addresses the observed V4 failures without changing V4's source, prompts, labels, scores or rejection. Training completion is not a quality result. The public financial engine continues to use reviewed structured inputs.

## Why a new corpus

Read-only diagnosis found that none of V4's training examples contained nested `ALL`/`ANY`, while all 24 supported final cases required it. Every non-null training amount used `payment_amount`; model-visible source IDs revealed categories such as `missing_amount`. Clearing explanatory `issues` alone would still leave zero supported cases correct. The new design targets interpretation and reference selection, not just JSON formatting.

## Candidate frozen before training

- Base: `Qwen/Qwen3-4B-Instruct-2507`.
- New prompt profile: `reference-contract-v5`; full extraction schema and material scorer unchanged.
- **336 public synthetic pairs:** 240 proposed, 48 ambiguous, 48 unsupported; 20 positive logic families and 12 uncertainty families.
- **164 nested examples:** 144 supported, 12 ambiguous, eight unsupported. Independently grounded nested conditions survive a missing deadline or unsupported calendar.
- Opaque source IDs; three competing amount references in varying order and numerical rank; five supplied subjects, including separately named current/prior invoices; independently varied work roles and day offsets.
- Explicit examples and instructions for complete proposals (`issues: []`), uncertainty, copied IDs, invoice identity and whole-field nulls.
- Schedule: **300 optimizer steps**, rank 8 / alpha 16, learning rate 0.0001, micro-batch 1, accumulation 2, four-bit base loading, non-Unsloth TRL path. This corresponds to about 1.79 corpus passes; `max_steps` controls the actual stop.
- Sequence limit **2,048**. Actual tokenizer audit: maximum 1,631 tokens, positive completions, exact prompt boundaries, zero truncation. Fifty-four rows would truncate at the old 1,536 limit.

Training SHA-256: `ed827924d7ba4118fa15c5ef71fb211c557c3390d87384f21af4eb86ae59d051`.

Prompt-contract SHA-256: `278f24bbfc5add26e4ff248b0e8dc3112ce36a2223ba5eaaffbc4bd5d4a7c9c9`.

An independent coding-agent review checked corpus semantics, amount/reference shortcuts, prompt/validator agreement, file hashes and token-audit binding before paid training. Labels remain developer-reviewed synthetic expectations, not independently adjudicated customer contracts.

## Development before final

The separately authored **24-case development set** contains 16 supported clauses, four ambiguous and four unsupported. Full-clause wording differs from the training renderer. Six training canaries exercise atomic/nested conditions, uncertainty and unsupported cases; canaries are excluded from generalization metrics.

Development is for diagnosis and candidate selection. A final claim requires a separately authored, reviewed and frozen final set, no reuse of exposed V4 answers, and identical per-case prompts/decoding for the base and candidate. A failed development candidate must be revised under a new version; it cannot silently rewrite this training artifact.

## Release gate declared before final predictions

`extractor-gates-v3-useful-coverage` retains V2's matched-run checks and nonregression requirements, then adds an absolute usefulness floor:

1. Strictly improve exact material interpretations with no reduction in full validation, correct supported proposals or safe handling relative to the base.
2. At least **80% correct supported coverage** and **90% full validation**.
3. At least **80% correct status in each uncertainty class**.
4. **Zero incorrect fully validated proposals** in the final set.
5. At least 24 supported and eight cases in each uncertainty class; every error remains in the denominator.

The gate never activates a financial term. All terms still need source inspection and owner review. Material equality uses the existing bounded structural canonicalizer, not arbitrary Boolean equivalence; separate diagnostics may explain an error without revising the frozen score.

## Reproducibility and limits

```sh
npx tsx scripts/ml/generate-v5-training.ts
npx vitest run tests/providers/v5-training.test.ts
uv run --no-project --with tokenizers==0.22.2 --with jinja2==3.1.6 \
  scripts/ml/tokenizer-audit.py --training-dir data/training/v5-reference-contract \
  --max-seq-length 2048 --output work/ml/tokenizer-audit-v5.json
```

The owner [runbook](../scripts/ml/README.md) governs paid execution and cleanup. Training uses conversational prompt/completion rows; [TRL documents completion-only loss as the default for that format](https://huggingface.co/docs/trl/sft_trainer#train-on-completion-only). Effective remote loss tensors remain unobserved. Quantized merging can affect generation, so a base-versus-export result measures the complete artifact pipeline, not an isolated causal LoRA effect. No general production accuracy or latency claim follows from this small synthetic study.
