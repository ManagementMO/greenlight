# Headroom extractor V5: training and evaluation

**Status: training completed; matched development and final evaluation results are pending. V5 has not earned promotion.** A completed training job and low training loss establish that training ran; they do not establish that new contract clauses are interpreted correctly.

## What the model learns

The extractor turns one payment clause into a typed proposal: a supplied amount reference, a nested `ALL`/`ANY` eligibility rule, a separately anchored payment deadline, source references, and `PROPOSED`, `AMBIGUOUS`, or `UNSUPPORTED` status. For example, permission to invoice after inspection and customer receipt of a certificate does not establish that the invoice was issued or that money reached the bank.

The model does not calculate cash balances, execute payments, approve terms, or modify the financial engine. Schema and reference validation run after generation; an owner must review material terms before they can become financial inputs.

## Training evidence

| Item | Recorded evidence |
| --- | --- |
| Base model | `Qwen/Qwen3-4B-Instruct-2507` |
| Candidate | [`machinelearningmo/greenlight-extractor-sft-v5-ed827924-74462f5d-33d`](https://huggingface.co/machinelearningmo/greenlight-extractor-sft-v5-ed827924-74462f5d-33d) |
| Candidate revision observed after publication | `f774455e2c98b46ccfe261bd71718587bf17653e` |
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
| Development material-exact outputs / 24 | Pending | Pending |
| Development correct supported proposals / 16 | Pending | Pending |
| Final material-exact outputs / 48 | Pending | Pending |
| Final fully valid outputs / 48 | Pending | Pending |
| Final correct supported proposals / 32 | Pending | Pending |
| Final correct ambiguous status / 8 | Pending | Pending |
| Final correct unsupported status / 8 | Pending | Pending |
| Final incorrect fully validated proposals | Pending | Pending |

**Current verdict: evaluation pending; not promoted.** Training loss is not a substitute for any result in this table.

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
- **Combined pipeline comparison:** the base artifact and trained export can differ in quantization and serving precision. Matched results measure the entire exported-model pipeline; they do not isolate the causal effect of LoRA alone. Observed repository revisions and response model identities are recorded; exact loaded commit SHA and effective runtime precision are not directly attested.
- **No safety guarantee from zero observed mistakes:** zero incorrect proposals on 48 synthetic cases is a release requirement, not proof that future mistakes are impossible. Source inspection, validation, explicit uncertainty, and owner review remain necessary.

For judging, distinguish **training completed**, **quality improved**, and **release gate passed**. They are separate claims, each requiring its own evidence.
