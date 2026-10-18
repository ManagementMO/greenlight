# Greenlight demonstration guide

This is a short operator run-of-show for the implemented application. Use the local app at [http://localhost:3000](http://localhost:3000), or the production address from the verified release. Begin with the first scenario selected and no what-if edits active. Provider keys and paid jobs are not required for the public demonstration.

## Before presenting

Run `npm ci --legacy-peer-deps` on Node 22, preserve any existing `.env`, and start `npm run dev`. Confirm the Decision, Evidence and Improvement lab views load. The scenario clock is October 6, 2026. Open the lab once beforehand to see which training/evaluation artifacts have actually been published; a pending stage is part of the report, not a reason to invent a result.

The public lab's Replay action rechecks the gates against a recorded genuine model experiment. It never starts new inference or training. Live paid runs belong to the private owner CLI described in the [README](../README.md#owner-cli-and-spending-boundary) and [ML runbook](../scripts/ml/README.md).

## 0:00 — The decision an owner actually faces

**Operator:** Show **Decision** with **Ductline · the $120k decision** selected. Point at the job amount, lowest cash and reserve gap.

**Say:** “Ductline has an opportunity to take a $120,000 HVAC retrofit. It is profitable on paper. The real question is whether they can take it without borrowing or missing payroll.”

**Say:** “We model the company's existing obligations alongside this job. One possible collection window preserves the reserve; the other takes cash to negative $13,000. The missing liquidity is $23,000.”

**Operator:** Point at the cash bridge and its reserve line. The default current plan is conditional because the two declared settlement paths differ.

## 0:30 — Show what changes the answer

**Operator:** Use the phase-collection hypothesis control. Select **October 24 · expedited**, then **November 20 · standard**.

**Say:** “An inspection can make an invoice eligible. That is not the same event as money reaching the bank. If the phase payment arrives October 24, the lowest cash is $17,000. If it waits until November 20, the minimum is negative $13,000.”

**Say:** “The next question goes to the customer's accounts-payable team. We rank it by its effect on this decision while preserving the other scenarios, rather than pretending we know a probability of payment.”

**Operator:** Click **Keep both possibilities**, or reselect the initial scenario. This avoids narrowing the family before showing the proposal.

## 1:00 — A precise, conserved path to yes

**Operator:** Point to the proposed $65,000 deposit and the $25,000 final installment. Click **Compare proposed terms**.

**Say:** “Greenlight searches for the smallest integer-cent adjustment in the allowed payment family and rechecks every scenario. Moving $23,000 from the final payment into the deposit restores a $10,000 worst-case minimum.”

**Say:** “The customer still pays $120,000: $65,000 upfront, $30,000 at phase one, and $25,000 at the end. We have changed timing, not invented revenue. One cent less would miss the modeled reserve.”

**Operator:** Click **Prepare payment request**. Show the draft, required agreements, and settlement assumption. Close it without sending anything.

**Say:** “This is a proposal requiring agreement and actual collection. The application prepares the conversation; it does not silently rewrite a contract or move money.”

## 1:35 — Trace the source and show a refusal

**Operator:** Open **Evidence**, select the Intuit bank source, then the constructed contract or customer email.

**Say:** “We reconciled 2,419 rows from Intuit's synthetic company ledger to $74,882.38. Using the full balance as available cash is an explicit zero-restricted-funds assumption. These future commitments, the new job, and its documents are clearly labeled additions.”

**Operator:** Return to Decision and select **Ductline · evidence gap**.

**Say:** “Now acceptance evidence conflicts, and an employer-tax amount is missing. A partial chart can still be drawn, but it cannot establish feasibility. The system says Needs input. Unknown is not zero.”

**Optional operator cue:** Select **Ductline · two small risks** to show three of four paths preserving the reserve.

**Optional say:** “Either $4,000 supplier surcharge is individually safe. Together they leave $9,000. This is why we test joint scenarios instead of checking each risk in isolation.”

## 2:05 — Explain the learning loop with measured evidence

**Operator:** Open **Improvement lab**, find **Dependency-aware evidence updates**, and click **Replay experiment**.

**Say:** “The financial engine stays fixed. Anthropic can propose a small declarative change to how the evidence workflow caches, scopes and batches work. It cannot change the ground truth, tools, evaluator or cash arithmetic.”

**Say:** “We ran the same pinned Jev model on 21 judgments across seven synthetic evidence updates. Both versions got 20 of 21 correct, made 15 decisive judgments, and produced zero false Met judgments. The candidate needed six Jev requests instead of eighteen.”

**Operator:** Point at the baseline/candidate rows and the recorded-origin label.

**Say:** “Both versions already cache. The useful change is tracking which evidence dependency actually changed. This is a localized synthetic workload, so we report that improvement precisely rather than claiming a general production speedup. The remaining error is visible too.”

**If asked about the replay:** “Those were genuine provider calls saved with manifests, request hashes and labels. This button re-applies the frozen gates to the saved result. It does not charge for another run.”

## 2:45 — Locate fine-tuning and observability honestly

**Operator:** Show the training stages and published model-evaluation records that are actually present.

**Say:** “The trained model has a different job from Jev. We fine-tune Qwen to turn clauses into proposed typed obligations. Jev handles repeated atomic evidence judgments; ordinary code handles money.”

**Say:** “A real four-step proof trained on sixteen examples and returned a merged Hugging Face export. That proves training and export, not a quality improvement. The substantive release is checked separately for invoice-issuance semantics, real serving, and a matched base-versus-tuned comparison.”

**Conditional cue — only when final published evidence exists:** Read the actual case count, model revision, schema version, quality/coverage figures and serving result shown in the lab. If the result ties or regresses, say so and explain that the release gate retains the base model.

**If final evaluation is still pending:** “The integration proof completed; the final model comparison is still pending. The application keeps that boundary visible.”

**Operator:** If verified Sentry evidence is available in the release, show the actual decision/workflow trace and corresponding structured log. Use an actual captured issue and fix if one has been recorded.

**Say:** “Snapshot and experiment IDs link the application to Sentry traces and logs. They help explain failures in the running system. A trace is operational evidence; it is not a financial truth label.”

## 3:20 — Close on the product

**Operator:** Return to the default Decision and its proposed cash bridge.

**Say:** “Greenlight gives an owner a decision they can examine: what breaks, which evidence matters, and the smallest supported payment change. The learning loop earns its place through measured workflow improvements, while the cash rules stay accountable.”

## Questions to answer precisely

| Question | Answer |
| --- | --- |
| Is this live QuickBooks? | No. It uses Intuit's synthetic release with pinned source provenance and disclosed constructed future scenarios. |
| Does Jev approve the job? | No. It interprets bounded semantic propositions. The reviewed inputs and deterministic engine determine the modeled cash result. |
| Does Jev get fine-tuned? | No. Qwen is the fine-tuned extractor; Jev uses the pinned evaluated model and supplied context. |
| Is the proposal globally optimal? | It is the minimum within the declared conserved deposit/date family, not every imaginable financing or scheduling arrangement. |
| Can a model quietly promote itself? | The author outputs a restricted manifest. Fixed external gates check quality, coverage, false Met judgments and actual improvement. |
| Is the measured 18-to-6 reduction universal? | No. It is one recorded, predeclared synthetic localized-update experiment. |
| Does a completed training job prove better quality or deployed inference? | No. Export, actual serving, pinned artifact identity and matched evaluation are separate gates. |
| Can the public demo spend the owner's budget? | No. Public decisions are deterministic, and model experiments are recorded. Paid operations run through the private CLI's durable $20 budget authority. |

When a provider or network is unavailable, keep the deterministic demonstration running and identify any model result by its recorded origin. Never substitute invented model output, hide a failed experiment, or present a planned artifact as verified.
