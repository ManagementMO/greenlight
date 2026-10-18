# Greenlight benchmark: base LLMs vs the Greenlight engine

Question: on the same documents and the same definitions, does Greenlight give better funding verdicts than a plain LLM, and at what speed and cost?

All cases are **constructed** (Ductline-style job, disclosed in `data/scenarios/README.md`). They are not customer data.

## Task
Given documents (ledger, calendar, contract, budget, emails, notes) and a list of open items, return:
`status` (SUPPORTED / SHORTFALL / CONDITIONAL / NEEDS_INPUT), `worstCaseMinimumCashUsd`, and `criticalItem`.

## Contestants
| Arm | What it is |
|---|---|
| A `claude-direct` | Plain Claude (`claude-sonnet-4-6`, temp 0): reads the documents, answers directly. |
| B `qwen-direct` | Plain base Qwen3-4B-Instruct-2507 on Veri (temp 0): same prompt as A. |
| C `claude-extract-engine` | Claude only extracts structured facts (fixed event slots); the real Greenlight engine (`lib/domain`) computes the verdict. |
| D `gold-engine` | Engine on the correct structure. Ceiling; shows what extraction errors cost C. |

Limits to disclose: C uses Claude as the extractor with a fixed slot template. It does not use the fine-tuned Qwen extractor, which targets payment-term clauses, not cash events. D is not a fair contestant, only an upper bound.

## Ground truth
`bench/core.ts` `oracle()` is an independent brute-force simulation (it never imports `lib/domain`). `bench/check-oracle.ts` confirms the real engine agrees with it on every case (90/90). Labels are never taken from a model.

## Splits (wording families differ)
dev = 40 (families A, B) | test = 30 (family C) | heldout = 20 (family D, new money/date formats and phrasing). SHA-256 of each file is in `bench/data/manifest.json`. Statuses are balanced (a quarter each).

## Rules (fixed before test/heldout were run)
1. Prompts were adjusted on **dev only**. Two harness defects were fixed after the first dev run (negative-amount ambiguity; a missing final-settlement date in the documents). Test and heldout had not been run by any model.
2. Run test and heldout once, after the Qwen smoke test passes. Do not change prompts, thresholds or cases afterward.
3. Invalid or missing output counts as wrong.
4. Report counts with denominators; with 30 and 20 cases, gaps of a few points are noise.
5. Cost: Claude from measured tokens at list price; Qwen from the Veri deployment bill, amortized over cases (includes provisioning).
6. Latency is end-to-end per case (C adds the engine time). Qwen runs sequentially.

## Claims allowed
- "On N constructed cases, arm X scored a/b" with denominators.
- "False-safe" = said SUPPORTED when truth was not. It is the headline error.
- No claim about real contracts or production.

## Commands
```
npx tsx bench/generate.ts            # cases + hashes
npx tsx bench/check-oracle.ts        # oracle vs engine
npx tsx bench/run.ts claude-direct dev
npx tsx bench/run.ts claude-extract-engine dev
npx tsx bench/serve-qwen.ts --splits dev --limit 3            # dry run, no spend
npx tsx bench/serve-qwen.ts --splits dev,test,heldout --execute
npx tsx bench/report.ts dev test heldout   # writes bench/results/REPORT.md
```
