# Greenlight

**Take the job. Protect payroll.**

[Open the working demo](https://greenlight-two-psi.vercel.app) · [Source and reproducible tooling](https://github.com/ManagementMO/greenlight) · [Presentation guide](demo-guide.md)

## The problem

A profitable job can still bankrupt a small contractor when suppliers and payroll come before customer collections. Financial agents often give a plausible answer without establishing which payment conditions are satisfied, when the invoice clock begins, or when money actually reaches the bank.

Greenlight turns “Can we take this $120,000 job?” into an inspectable decision. It shows the cash bottleneck, the source or assumption behind it, the question that would change the answer, and the smallest permitted payment adjustment. In the default scenario, advancing $23,000 from the final installment into the deposit restores the $10,000 reserve across both declared collection paths. Total contract revenue stays $120,000.

## The technical idea

Use learning for repeated interpretation and fixed code for financial authority. A Qwen model is fine-tuned through Veri to propose typed payment rules from source clauses, including uncertainty. Jev evaluates atomic evidence questions. An invoice-issuance rule runs in deterministic code: eligibility on October 20 and issuance on October 22 gives a November 5 due date under a fourteen-calendar-day term. That calculation does not imply a settled bank receipt.

The MetaHarness uses Anthropic to propose a bounded workflow configuration, then tests it against a separate frozen workload. It can improve evidence scoping, batching and dependency-aware caching. It cannot change the evaluator, financial arithmetic, source documents or contract total. In the recorded genuine Jev experiment, requests fell from 18 to 6 with the same 20/21 correct judgments, 15 decisive judgments and zero false `MET` judgments. These measurements describe this synthetic localized-update workload.

The extractor has its own frozen base/tuned evaluation and versioned gate. Useful coverage means correct supported proposals; wrong proposals do not count as coverage. The base remains selected on a tie or regression. Material terms always require owner review.

## Sponsor demonstrations

| Sponsor | Concrete use and what to show |
| --- | --- |
| Intuit | Original company-047 synthetic books reconstruct 2,419 ledger rows to $74,882.38. Show the source trail, the disclosed future calendar, the joint-risk case, and the conserved payment proposal. This is a decision workflow built around the supplied data, with additions clearly identified. |
| Veri | Genuine QLoRA/SFT, merged standalone Hugging Face exports, actual Veri inference, and a matched frozen extraction experiment. Show the completed training and serving artifacts and the measured gate result in the Improvement lab; do not equate training completion with better quality. |
| Sentry | Real errors, readable source-mapped frames, tracing, logs and AI spans. Show the oversized-response defect, its related trace/log and the capacity regression that followed. Separate production decision and Jev traces are linked in the lab. Session Replay ingestion is verified separately from configuration. |
| Paper | A fresh Greenlight canvas established the design direction. The shipped interface has a responsive cash bridge, source navigation, explicit uncertainty and payment comparisons. Further Paper MCP editing hit the account's weekly quota; the canvas is partial. |

## A strong demonstration sequence

1. Show the default conditional decision and the negative $13,000 worst-case cash point.
2. Compare the $65,000 / $30,000 / $25,000 proposal and its $10,000 modeled minimum.
3. Open the source contract. Distinguish eligibility, invoice issuance, due date and collection. Show the recorded extraction only when the exact source hash matches.
4. Show the joint-risk or missing-evidence case so the system has to preserve uncertainty.
5. Replay the saved MetaHarness experiment and inspect the separate extractor evaluation gate.
6. Open the genuine Sentry defect and trace to explain how observability changed the implementation.

The public demo uses deterministic calculations and recorded genuine experiments. Public clicks cannot allocate a GPU or spend model credits. Private owner tooling enforces the project's $20 spending cap. No live QuickBooks account, actual contract, payment execution or production customer outcome is represented.
