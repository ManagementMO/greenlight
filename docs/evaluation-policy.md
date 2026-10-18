# Extractor evaluation policy

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

## Promotion rule

The tuned candidate must strictly improve material-exact count with no regression in schema-valid count, correct supported proposals, or unsafe-proposal count. A tie retains the base. Summaries are recomputed from validated per-case scores; inconsistent aggregates, duplicate or incomplete cases, differing labels, differing frozen hashes and differing decoding are refused.

**Correct supported proposals** are material-exact `PROPOSED` outputs on expected-`PROPOSED` cases. Their denominator is the fixed 24 supported cases. This prevents an all-abstaining model from passing by correctly withholding unsupported answers while losing useful supported answers.

**Raw proposal rate** counts every `PROPOSED` answer over all 40 cases. It describes review volume, including mistakes. An unsupported guess must not count as useful coverage. Schema validity, material accuracy, unsafe proposals, proposed precision and expected-class performance are reported separately. No metric authorizes automatic activation of a financial term.

The earlier v1 gate compared raw proposal counts for its coverage check. Before final queries, adversarial synthetic testing showed that it could reject a safer model solely because that model stopped making wrong proposals. V2 corrects that metric; no corpus labels changed in this gate correction. Regression tests also reject always-abstaining candidates, supported-case losses hidden by better uncertainty handling, new unsafe proposals, forged aggregates and validity regressions.

## Interpretation and future work

This is a small synthetic experiment, not a statistical estimate of performance on arbitrary contracts. Sequential warm latencies are descriptive and provisioning time is separate. The reported unsafe proposals are candidates requiring review; the product does not execute them.

Publish ties and regressions. Do not alter thresholds, prompts or training after inspecting this final set and then reuse it for a new release claim. Further model selection needs separate development cases and a new protected final set. A correct C120 showcase is a useful source-linked illustration, not an additional independent test result.
