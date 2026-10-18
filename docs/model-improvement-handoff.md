# Improving the extractor after the v4 experiment

The current v4 data, prompt and gates are frozen. This note is for a later model version; it does not change the running experiment or claim an unmeasured gain.

## What is being trained

Qwen learns a narrow conversion: source clause plus visible IDs → a proposed typed payment rule or an explicit ambiguous/unsupported result. Its examples are fictional clauses with reviewed targets, not historical bank balances. Jev remains a separately pinned evidence classifier. Cash arithmetic and invoice-date resolution remain deterministic TypeScript.

V4 uses 276 unchanged training labels across 23 families, one configured pass expressed as138 optimizer steps with micro-batch1/gradient-accumulation2, rank8 QLoRA, learning rate0.0001 and sequence limit1536. Its actual token audit proves no supervised row is truncated. The completed export is a standalone quantized merged model; training completion and training loss do not establish task accuracy.

## Highest-value next work

1. **Create a development set before revising anything.** Keep a reviewed split of realistic clauses separate from future final data. Once the v4 final predictions are exposed, v4 is historical evaluation evidence; use a new protected final set for a new release claim. Do not optimize a prompt/model against public final answers and call the next run a clean test.

2. **Improve labels before increasing row counts.** Add source/target pairs that make recipient authority, invoice identity, eligibility versus issuance, partial clauses, contradictory attachments and unsupported calendars explicit. Start with an underlying typed scenario, independently review that its prose expresses the target, and retain the rationale. A successful agent trace or two agreeing models is not a truth label.

3. **Vary the business context without leaking labels.** Use different jobs, parties, amounts, document styles, neighboring irrelevant clauses and independent renderer families. Keep company/source/subject identities disjoint across splits. Inspect the actual invoice/payment/payroll tables before using their fields; the current preserved book adapter does not support every manifest entity. A real customer's documents need a separate privacy/serving plan before any upload.

4. **Audit format and loss boundaries on every corpus.** Run the exact tokenizer and template, prove prompt-prefix alignment and complete answer tokens, bind the audit to the file SHA/model/count, then select a sufficient sequence limit. Preserve the old audit. Completion-only training is intended in the TRL prompt-completion path; remote effective label tensors are not directly attested. Do not infer the mask from a low reported loss.

5. **Separate fine-tuning from export effects when that is the research question.** The current comparison is original base versus the trained/merged artifact pipeline. Weight quantization and possibly runtime dtype differ. A later controlled ablation should compare matched quantization/runtime/template/tokenizer settings and document actual loaded precision when observable. Keep the useful end-to-end artifact comparison too, but name its scope correctly.

6. **Evaluate useful work and remaining errors.** Preserve validity, exact material matches, correct supported proposals, unsafe proposals and performance by expected class. Raw `PROPOSED` volume is review burden, not useful coverage. A candidate cannot win by refusing every supported clause. A tie or a regression retains the base. Keep owner review separate from model selection.

## Precision of the current material metric

The fixed evaluator compares material fields after sorting trigger children and normalizing the associativity of matching `ALL`/`ANY` operators. It does not prove arbitrary Boolean equivalence through distribution or factoring, and it ignores free-form issue wording. Report this as the declared structured material-match metric. Inspect any apparent failure before calling it a semantically wrong financial interpretation.

For a later evaluator version, independently test exact Boolean equivalence over the bounded atom/subject vocabulary, including equivalent factorizations and nearby inequivalent counterexamples. Bound computation for adversarial trees. Freeze that evaluator before looking at a new final set; do not loosen the current score after seeing outputs.

## A practical next experiment

Create a new reviewed development corpus of recipient/clock/Boolean failures, choose candidate prompts and a modest SFT schedule using that development set, then freeze one candidate. Author and audit a fresh final set with new companies and renderer families. Run matched base/candidate artifacts once, publish actual per-case predictions and the fixed gate, and retain the baseline if the useful-work tradeoff does not improve.

The existing owner tools handle budget reservations, exactly-once resource creation, recovery guards and permanent GPU stopping. Coordinate before paid work; the authorized total remains$20 and no concurrent owner GPU runs are permitted during the current sequence. Frontend and research work need no provider keys.
