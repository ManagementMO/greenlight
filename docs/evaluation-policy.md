# Extractor evaluation policy

## V4 protocol frozen before final queries

The v3 protocol below is preserved as historical evidence. Its completed base run returned zero valid answers under a compact format example that represented enum choices as an array. This ambiguity is a comparison limitation; its causal contribution to every failure is unproven. [Actual outputs](../data/artifacts/legacy-v3-baseline.json) are retained. No tuned-v3 final run was used to claim an improvement against that ambiguous baseline. This explanatory clarification does not change the frozen v4 data, prompts or gates below.

V4 uses the validator's actual strict JSON Schema for both base and tuned prompts, profile `json-schema-v4`. Its 276 training contexts and labels are unchanged from v3; training SHA256 is `2ae2030efebbd20ab9adbe4ff92f4c187d71c8e1da0480c6652b9010cc187571`. The actual tokenizer audit found maximum 1,330 supervised tokens, minimum 54 completion tokens, exact prompt prefixes and no truncation at 1,536. A matching audit is required before upload/allocation.

The fresh [v4 final set](../data/evaluation/v4-schema-contract/manifest.json) contains 40 cases: 24 supported, eight ambiguous and eight unsupported, with twelve new supported Boolean-composition families and disjoint namespaces. Independent coding-agent review checked all 40 pairs before inference. A possible order-of-events ambiguity in case 16 was clarified before queries; its expected label was unchanged, and the author draft is archived. Final SHA256: `a9311adc810cf45729b3d091445ff0e141490a4e66295b1d74d54630b928e13a`. Final freeze and audit: **2026-10-18 01:33:48 UTC**. These are synthetic developer-reviewed expectations, not independent human/customer adjudication.

The same `extractor-gates-v2` promotion thresholds apply. Both runs must match frozen bytes, case order, expected labels, per-case prompt hashes, prompt profile, prompt-contract hash, decoding and launch settings. The same artifact-pipeline precision caveat below applies. No prompt, training label or threshold may be adjusted after these final predictions and reuse this set for a fresh quality claim. The C120 illustration is separate from all 40-case metrics.

## Historical v3 protocol

Policy frozen **2026-10-18 00:58 UTC**, before querying any v3 final evaluation cases. Gate version: **`extractor-gates-v2`**.

The training corpus is `greenlight-clauses-v3`: 276 training examples and a separate 40-case final set. The final set has 24 expected `PROPOSED`, 8 `AMBIGUOUS` and 8 `UNSUPPORTED` cases. Its SHA-256 is `c3eb6159c750732260662dd04912c4c15152108ed4af04fd6034b689c4c819eb`. Semantic renderer families and company namespaces are disjoint from training. Labels are developer/template-reviewed synthetic expectations, not independently adjudicated customer evidence.

The already-completed four-step technical serving proof queried one training canary only. No final cases or C120 showcase were queried in that proof. A canary that serves successfully can still be schema-invalid; it does not establish extraction quality.

## Fixed comparison

- Use `Qwen/Qwen3-4B-Instruct-2507` and the unique merged v3 training export.
- Use the exact same full 40 cases, case order, expected classes and decoding: temperature 0, maximum 768 output tokens. Invalid output remains in the full denominator.
- Give the model the source context and allowed references only. Expected terms and correctness labels stay with the local evaluator.
- Require completed inference and GET-verified permanent GPU stop for both experiments.
- Verify the repository's observed SHA before and after the run, disable deployment model caching, and record returned model identity. The provider API does not attest the precise loaded commit.
- Run the C120 source illustration separately after the final cases. It is excluded from all final-set metrics.

Precision scope recorded before final queries: this compares the original released base artifact against the trained/merged export artifact. The base declares BF16 without a quantization configuration; the technical export declares BitsAndBytes NF4 with double quantization and BF16 quantization compute, with a top-level FP32 dtype. The substantive export will be inspected independently. Serving may infer different activation dtypes from those configs. Both runs record pinned config hashes, allowlisted precision/quantization fields and the same launch arguments. Effective loaded dtype is unverified unless provider logs establish it. Results measure the combined training/export/runtime pipeline and do not isolate the causal effect of LoRA alone; latency has the same limitation.

## Promotion rule

The tuned candidate must strictly improve material-exact count with no regression in fully validated count, correct supported proposals, or unsafe-proposal count. `valid` includes structural schema, supplied references, trigger bounds/duplicates, completeness and explicit uncertainty requirements. A tie retains the base. Summaries are recomputed from validated per-case scores; inconsistent aggregates, duplicate or incomplete cases, differing labels, differing frozen hashes and differing decoding are refused. This explains the existing implementation without changing the frozen rule.

**Correct supported proposals** are material-exact `PROPOSED` outputs on expected-`PROPOSED` cases. Their denominator is the fixed 24 supported cases. The coverage check prevents a candidate from losing supported answers that the base got right. It is a relative nonregression requirement, not an absolute usefulness floor: if the base gets zero supported cases right, this gate does not itself require positive supported coverage. A passing comparison must therefore be interpreted alongside the actual supported-case count, and cannot alone establish a useful extractor. This clarification describes the existing frozen rule; it does not change its thresholds.

The legacy field named **`rawProposalRate`** counts fully validated `PROPOSED` answers over all 40 cases, including materially wrong proposals. Outputs rejected by validation remain in the denominator but do not increment `proposed` or `unsafeProposed`; the post-run diagnostic reports their declared statuses separately. This field is neither useful coverage nor the volume of all proposed-looking JSON. Full validation, material accuracy, incorrect validated proposals, proposed precision and expected-class performance are reported separately. No metric authorizes automatic activation of a financial term.

The earlier v1 gate compared raw proposal counts for its coverage check. Before final queries, adversarial synthetic testing showed that it could reject a safer model solely because that model stopped making wrong proposals. V2 corrects that metric; no corpus labels changed in this gate correction. Regression tests reject always-abstaining candidates that lose positive base supported coverage, supported-case losses hidden by better uncertainty handling, new unsafe proposals, forged aggregates and validity regressions.

## Interpretation and future work

This is a small synthetic experiment, not a statistical estimate of performance on arbitrary contracts. Sequential warm latencies are descriptive and provisioning time is separate. The reported unsafe proposals are candidates requiring review; the product does not execute them.

Publish ties and regressions. Do not alter thresholds, prompts or training after inspecting this final set and then reuse it for a new release claim. Further model selection needs separate development cases and a new protected final set. A correct C120 showcase is a useful source-linked illustration, not an additional independent test result.
