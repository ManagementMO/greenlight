# Headroom extractor V5: training and evaluation

**Status: final evaluation is complete. The repaired V5 export improves material exactness from 13/48 to 28/48, but fails the predeclared usefulness and safety gate and is not promoted.** Correct supported proposals rise from 9/32 to 19/32; 14 incorrect validated proposals remain. Ambiguous-status accuracy declines from 7/8 to 6/8. The financial demo retains reviewed inputs. A completed training job and low training loss establish that training ran; they do not establish that new contract clauses are interpreted correctly.

## What the model learns

The extractor turns one payment clause into a typed proposal: a supplied amount reference, a nested `ALL`/`ANY` eligibility rule, a separately anchored payment deadline, source references, and `PROPOSED`, `AMBIGUOUS`, or `UNSUPPORTED` status. For example, permission to invoice after inspection and customer receipt of a certificate does not establish that the invoice was issued or that money reached the bank.

The model does not calculate cash balances, execute payments, approve terms, or modify the financial engine. Schema and reference validation run after generation; an owner must review material terms before they can become financial inputs.

## Training evidence

| Item | Recorded evidence |
| --- | --- |
| Base model | `Qwen/Qwen3-4B-Instruct-2507` |
| Candidate | [`machinelearningmo/headroom-extractor-v5-bf16-42d582a35d2f`](https://huggingface.co/machinelearningmo/headroom-extractor-v5-bf16-42d582a35d2f) |
| Candidate revision observed after publication | `51fcc48bf3ae0753d9633ea6566575585c347271` |
| Original export, preserved | [`machinelearningmo/greenlight-extractor-sft-v5-ed827924-74462f5d-33d`](https://huggingface.co/machinelearningmo/greenlight-extractor-sft-v5-ed827924-74462f5d-33d/tree/f774455e2c98b46ccfe261bd71718587bf17653e) |
| Provider / method | Veri; supervised fine-tuning with a 4-bit base and LoRA adapters, followed by a standalone export |
| Dataset | 336 public synthetic prompt/completion pairs: 240 proposed, 48 ambiguous, 48 unsupported |
| Coverage | 20 composition families and 12 uncertainty families; opaque references, shuffled reference tables, distractors, and distinct eligibility and invoice clocks |
| Training configuration | LoRA rank 8, alpha 16; learning rate 0.0001; microbatch 1, gradient accumulation 2; 300 optimizer steps |
| Worker evidence | Job `42d582a35d2f`; final checkpoint 300; approximately 1,200.7 training seconds; trainer loss 0.0122 |
| Token audit | 2,048-token window; measured maximum 1,631 tokens; zero truncated examples; all prompt prefixes match |
| Mask boundary | Completion-only loss is intended by the prompt/completion format; the effective remote loss mask is not directly attested |

The labels are developer-reviewed synthetic examples, not customer-adjudicated contracts. [Training manifest](../data/training/v5-reference-contract/manifest.json), [training generator](../scripts/ml/generate-v5-training.ts), and [tokenizer audit](../data/training/v5-reference-contract/tokenizer-audit.json) are available for inspection. The training corpus SHA-256 is `ed827924d7ba4118fa15c5ef71fb211c557c3390d87384f21af4eb86ae59d051`.

## Evaluation protocol

1. Compare the released base and the exported candidate on the same **24-case development set**: 16 supported, 4 ambiguous, and 4 unsupported cases. Development informs candidate selection; it cannot authorize promotion.
2. Freeze the candidate before querying the separate **48-case final set**: 32 supported, 8 ambiguous, and 8 unsupported cases. Both corpora were independently reviewed and hash-frozen before model queries. Changing a candidate after inspecting final outputs requires a new untouched final set.
3. Use identical per-case prompts, `reference-contract-v5`, temperature 0, a 768-token output cap, launch settings, schema, and scoring. Six V5 training canaries diagnose technical or memorization problems; they are excluded from held-out scores.
4. Preserve each actual response and rescore it from the frozen label and context before publishing. A run must be complete, use the intended model and split, and have verified GPU cleanup and settled billing before publication.

**Material exactness** checks status, amount reference, trigger logic, due-date anchor and interval, and source identity. Equivalent child ordering and same-operator grouping are normalized; free-form issue wording is not compared. **Fully valid** means schema, references, and completeness checks pass. A fully valid output can still be semantically wrong. **Correct supported coverage** counts only material-exact proposals on expected-supported cases. Raw proposal volume also includes mistakes and is not a success metric.

## Results

| Metric | Base | V5 |
| --- | --- | --- |
| Initial development material-exact outputs / 24 | 9 | 7 |
| Initial development fully valid outputs / 24 | 22 | 18 |
| Initial development correct supported proposals / 16 | 4 | 2 |
| Initial development incorrect fully validated proposals | 10 | 10 |
| Repaired development material-exact outputs / 24 | 9 | 15 |
| Repaired development fully valid outputs / 24 | 22 | 24 |
| Repaired development correct supported proposals / 16 | 4 | 8 |
| Repaired development correct ambiguous status / 4 | 4 | 4 |
| Repaired development correct unsupported status / 4 | 3 | 3 |
| Repaired development incorrect fully validated proposals | 10 | 8 |
| Final material-exact outputs / 48 | 13 | 28 |
| Final fully valid outputs / 48 | 41 | 45 |
| Final correct supported proposals / 32 | 9 | 19 |
| Final correct ambiguous status / 8 | 7 | 6 |
| Final correct unsupported status / 8 | 2 | 5 |
| Final incorrect fully validated proposals | 21 | 14 |

**Final verdict: relative quality improvement measured; absolute usefulness and safety gate failed; not promoted.** Material exactness rises from 27.1% to 58.3%, a 31.25 percentage-point gain on this fixed synthetic test. Full validity passes the 44/48 floor, but supported coverage is below 26/32, both uncertainty classes miss 7/8, and incorrect validated proposals exceed zero. Ambiguous-status accuracy regresses by one case even though aggregate exactness improves. This is not uniform improvement or approval for unattended use.

The [initial 48 development responses](../data/artifacts/extraction-v5-initial-development.json), [repaired matched 48 development responses](../data/artifacts/extraction-v5-development.json), and [all 96 final responses](../data/artifacts/extraction-v5-evaluation.json) remain public. The development base run is reused because its prompt, model identity and settings are unchanged. Final uses two fresh sequential deployments. All completed deployments were permanently stopped and charges settled. Training loss is not a substitute for any result in this table.

The final gate selects the base for the separate [source-bound C120 illustration](../data/artifacts/extraction-v5-demo.json). Its actual output is material-exact and may show the reviewed invoice-date preview. It is excluded from final metrics and cannot override the rejection. Retaining the baseline does not authorize unattended extraction; financial decisions still use reviewed fixtures.

### Remaining errors

Three tuned outputs are invalid: two malformed JSON responses and one unsupported condition in a nested rule. Among the 17 valid but nonexact outputs, overlapping mismatches affect 13 trigger fields, five statuses, two amount references and two due rules. Eleven trigger mismatches where both trees are present are Boolean-inequivalent under a bounded truth-table diagnostic; none is merely reordered or factored equivalently. This diagnostic explains errors and does not change the frozen scorer or result.

### Export diagnostic prompted by development

Each model matched three of six V5 training canaries. These are diagnostic examples already present in training, excluded from development and final scores. The tuned export also produced malformed nested JSON and treated a business-day rule as a supported calendar-day rule. The saved adapter contains nonzero learned LoRA weights, while the worker log warns that merging into 4-bit linear layers can alter generations through rounding. These observations justify checking materialization before purchasing another training run; they do not prove that rounding caused every error.

A BF16 materialization reuses the exact saved adapter and pinned base revision, using PEFT's safe merge. It changes no training labels, prompt, scorer or gate and purchases no new training run. The six training canaries rose from 3/6 exact to 6/6 exact locally and in the repaired Veri run; they remain excluded from held-out metrics. The repaired provider development run produced the 15/24 result above. This is an exported-pipeline comparison, not proof that rounding caused every earlier error. [Adapter and export lineage](../data/artifacts/v5-export-lineage.json) and [actual canary outputs](../data/artifacts/v5-export-diagnostic.json) are public.

The [candidate selection](../data/artifacts/v5-final-selection.json) was written at `2026-10-18T04:47:16.336Z`, before final model queries. It binds the base and repaired export revisions, prompt, decoding, development evidence and final corpus hash. No new candidate will be selected from final results.

### Cost and lifecycle

The final base and tuned serving runs cost $0.30 and $0.31 in their recorded provider results. The reconciled project ledger totals **$5.24 of the $20 cap**, with **$0 reserved and all 45 entries settled** at publication. Charges are conservatively rounded per entry. Both final deployments are permanently stopped; no public click starts paid inference. [Published training evidence](../data/artifacts/training-v5.json) records the reconciled training charge separately.

## What earns promotion

V5 must strictly improve material-exact accuracy over the matched base without reducing full validity or correct supported coverage, or increasing incorrect fully validated proposals. It must also pass every predeclared absolute threshold:

| Requirement on the final set | Minimum result |
| --- | --- |
| At least 80% correct supported coverage | **26 / 32** correct supported proposals |
| At least 90% fully valid outputs | **44 / 48** fully valid outputs |
| At least 80% correct ambiguous status | **7 / 8** ambiguous cases |
| At least 80% correct unsupported status | **7 / 8** unsupported cases |
| No incorrect fully validated proposals | **0** |

An improvement may be measurable while the release gate still rejects the model. A tie does not promote it. Even a passing result authorizes only an extractor candidate for owner-reviewed terms, not autonomous financial decisions. [Gate definition](../lib/providers/evaluation-v5.ts) and [comparison implementation](../scripts/ml/compare-v5-evaluations.ts) are public.

## Limits and improvement direction

- **Training-template confound:** the generator chooses explicit invoice-ID versus work-ID anchoring using `index % 2`, while each repeat contains 20 composition families. Each family therefore always receives the same invoice-binding style. This is a plausible shortcut, not a demonstrated failure. If development exposes this issue, a new training version should independently cross composition, invoice identity, clock, and wording. Frozen V5 data and evaluation labels must remain unchanged.
- **Synthetic scope:** separately authored evaluation prose tests generalization beyond the training wording, but uses a small, declared domain vocabulary. It does not establish accuracy on arbitrary contracts, unseen industries, or customer documents.
- **Combined pipeline comparison:** both selected repository configurations declare BF16 without a quantization configuration. Effective serving precision and loaded weight bytes are not directly attested. Matched results measure the entire trained and materialized export pipeline; they do not isolate the causal effect of LoRA alone. Observed repository revisions and response deployment identities are recorded. The original quantized export remains a separate archived diagnostic.
- **No safety guarantee from zero observed mistakes:** zero incorrect proposals on 48 synthetic cases is a release requirement, not proof that future mistakes are impossible. Source inspection, validation, explicit uncertainty, and owner review remain necessary.

For judging, distinguish **training completed**, **quality improved**, and **release gate passed**. They are separate claims, each requiring its own evidence.
