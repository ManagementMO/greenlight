# V4 extractor result and next experiment

The completed v4 candidate **did not earn promotion**. It learned more reliable output formatting, but did not produce a correct supported payment rule on the protected final set. The fixed `extractor-gates-v2` rule returned `rejected-regression`: three fully validated proposals had materially wrong trigger logic, versus zero for the base.

The public cash workspace uses reviewed structured fixtures. Neither model result activates a payment rule, changes a forecast or authorizes a financial action. Retaining the base is a selection outcome under this experiment, not a claim that the base is useful enough for unattended extraction.

## What actually ran

- **Training:** Qwen3-4B-Instruct-2507, 276 synthetic source/target pairs, 138 committed optimizer steps, rank-8 QLoRA, learning rate 0.0001, micro-batch 1 / accumulation 2, 1,536-token limit. The worker's reported average training loss was 0.0389; loss is not held-out accuracy.
- **Artifact:** [public merged model](https://huggingface.co/machinelearningmo/greenlight-extractor-sft-v4-2ae2030e-fed7b381-770), evaluated observed revision `3a022584c5d287a5d5c70ba64f65394765c01260`. [Training/export/tokenizer proof](../data/artifacts/training-v4.json).
- **Base:** `Qwen/Qwen3-4B-Instruct-2507`, observed revision `cdbee75f17c01a7cc42f958dc650907174af0554`.
- **Final set:** 40 independently authored and coding-agent-reviewed synthetic cases, frozen before inference: 24 supported, eight ambiguous, eight unsupported. SHA-256 `a9311adc810cf45729b3d091445ff0e141490a4e66295b1d74d54630b928e13a`. Labels are not independent human/customer adjudication.
- **Matched contract:** identical per-case prompts, actual JSON Schema, temperature 0, 768 output-token cap and launch arguments. Expected labels were held locally, outside inference and training.
- **Lifecycle:** both full runs completed, both deployments have GET-verified permanent stops, and each serving run settled at a conservatively booked $0.28. At this checkpoint the complete project ledger records **$2.79 spent, $0 reserved**, within its $20 cap.

The [published record](../data/artifacts/extraction-evaluation.json) contains every actual response, its output/prompt hash, expected label, fresh score, class breakdown and recomputed gate. The [nonbinding diagnostic](../data/artifacts/extraction-diagnostics.json) gives the additional breakdown below. It does not revise any frozen score or threshold.

## Read the validation layers separately

| Measurement | Base | Tuned |
| --- | ---: | ---: |
| JSON syntax parses | 20 / 40 | 40 / 40 |
| Structural JSON Schema passes | 20 / 40 | 39 / 40 |
| Full validation passes | 2 / 40 | 4 / 40 |
| Exact material interpretation | 0 / 40 | 1 / 40 |
| Correct supported proposal | 0 / 24 | 0 / 24 |
| Fully validated but materially incorrect proposal | 0 | 3 |

`score.valid` means the complete validator passed: JSON syntax, structural schema, supplied references, trigger bounds/duplicates and status/completeness rules. Calling its 2/4 counts merely “schema-valid” would hide the distinction. The tuned model's one material match is an `UNSUPPORTED` case; supported-case yield remains zero.

The frozen `proposed` / `unsafeProposed` fields count only fully validated outputs. Separately, parseable base responses declared `PROPOSED` 16 times; parseable tuned responses declared it 38 times. Rejected attempts remain in the full 40-case denominator and cannot enter the financial engine. More declared proposals do not mean more useful work.

## What failed

The base has 20 malformed JSON responses. Among its remaining validation failures, seven use unknown subjects and eleven fail the proposed-clause completeness check. Its two fully valid answers still differ materially from their labels.

The tuned outputs all parse as JSON. Their 36 full-validation rejections comprise:

- **28 proposed-clause completeness failures.** This is the first failed business check, not proof that every output omitted a field. All 28 contain nonempty `issues`; four also have a null due rule and one has a null amount reference, with overlap possible. A model often placed explanatory commentary in `issues` while declaring `PROPOSED`. The current contract requires complete, issue-free proposals; unresolved issues belong with uncertainty. The validator remains unchanged.
- **Seven unknown-subject failures.** The model invented IDs outside the supplied `subjects`, including certificate/invoice-like names. Reference identity must be copied from the visible table.
- **One structural failure.** Its composite trigger exceeds the allowed child count.

The three fully validated incorrect proposals are cases **10, 22 and 11**. Each changes the trigger logic. A separate bounded truth-table diagnostic found all three inequivalent to the expected Boolean rule; these are not merely different factorizations of the same rule. They are over-restrictive: respectively 12, seven and seven assignments satisfy the expected trigger but fail the model's trigger, with zero assignments in the opposite direction. The frozen field still calls these `unsafeProposed: 3`; this does not mean these three outputs granted premature eligibility. The diagnostic enumerates independent atom assignments and is explanatory only. The frozen metric still compares normalized structured material fields.

Both runs also attempted the separate C120 illustration. Both invented subjects outside its visible `phase_one` reference and failed validation. The gate-selected base illustration therefore has `candidate: null` and `materialExact: false`. Its invoice-clock preview is withheld. The deterministic, owner-reviewed payment-clock resolver remains implemented and tested; no successful generated C120 interpretation is claimed.

## What the result establishes

There is genuine training, a committed checkpoint, a merged standalone export and real serving. The export's complete `tokenizer.json` is byte-identical to the pinned base file; the chat template is byte-identical and the EOS token matches. The local token audit found no truncation of any supervised row.

The comparison covers the **whole base versus trained/exported pipeline**. The base declares BF16; the export declares BitsAndBytes NF4 with BF16 compute and top-level FP32. Effective loaded precision, effective remote loss-label tensors and the exact loaded weight commit are not provider-attested. The result does not isolate LoRA alone. Warm median times of 5,163.5 ms versus 4,266.5 ms are descriptive sequential observations, not a controlled speedup estimate; cold provisioning was about 800 seconds for each.

The relative coverage gate has no absolute usefulness floor when the base gets zero supported cases right. This candidate fails anyway because incorrect validated proposals increased. A future gate should predeclare a useful supported-case requirement using development evidence before a fresh final set is exposed.

## Where the ML team should start

1. **Create a separate development set and a new future final set.** V4 is now exposed historical evidence. Keep its files, prompts, scores and gate intact; do not train against these final answers and reuse them as a clean release test.
2. **Make the output contract explicit on development data.** Distinguish unresolved blockers from explanations, require issue-free complete `PROPOSED` outputs, and bind every ID to the supplied reference table. If constrained decoding is considered, verify actual provider support and measure it separately; valid syntax cannot establish correct meaning.
3. **Exercise status decisions and Boolean composition.** Use independently reviewed combinations, recipient authority, invoice identity and clock anchors. Include matched near-counterexamples in which changing `ALL` to `ANY`, changing the recipient, or omitting invoice issuance changes the answer. Balance useful supported work with correct uncertainty.
4. **Check the training/export control before scaling epochs.** Compare representative training and development outputs, inspect effective completion-only loss masks when observable, and use a matched-precision untrained export control if attributing effects to fine-tuning. The observed tokenizer match rules out one byte-level mismatch; it does not explain all failures.
5. **Freeze one candidate, then run the new final once.** Report syntax, structural schema, full validation, material match, supported coverage, incorrect validated proposals and declared status volume. Keep all errors in the denominator and owner review in the product.

The [ML handoff](model-improvement-handoff.md), [frozen evaluation policy](evaluation-policy.md) and [owner runbook](../scripts/ml/README.md) contain the contracts, commands, budget and cleanup requirements. Frontend work can continue without provider keys or another GPU allocation.
