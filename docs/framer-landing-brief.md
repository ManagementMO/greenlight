# Greenlight: landing page brief (for Framer AI)

Paste the "Prompt" section into Framer AI. The rest is reference you can paste after it if Framer asks for more detail.

## Prompt

Design a single-page landing page for **Greenlight**, a web tool that tells a small contractor whether they can accept a big job without borrowing money or missing payroll.

**Tagline:** Take the job. Protect payroll.

**One-line description:** Greenlight turns "Can we take this $120,000 job?" into an inspectable cash decision: where cash runs short, what evidence could change the answer, and the smallest payment adjustment that fixes it.

**Audience:** Owners and finance leads of small contracting businesses (HVAC, construction, trades), plus hackathon judges and sponsors evaluating a working demo.

**Tone:** Calm, precise, trustworthy. Finance-grade, not hype. Plain language, no jargon in headlines. Confident but never overclaiming.

**Primary call to action:** "Open the live demo" linking to https://greenlight-two-psi.vercel.app
**Secondary call to action:** "See how it works" (scrolls to the how-it-works section).

### Sections, in order

1. **Hero.** Headline "Take the job. Protect payroll." Subhead: "A profitable job can still sink a small contractor when suppliers and payroll are due before the customer pays. Greenlight shows you the gap before you sign." Two buttons. Beside it, a product visual of the cash bridge chart (see Visuals).
2. **The problem.** A profitable job on paper can still empty the bank account. Suppliers and payroll come first, customer money arrives later. Many AI finance tools give a plausible answer without checking which payment conditions are actually met, when an invoice clock starts, or when the money reaches the bank.
3. **The example decision.** A concrete walk-through with three numbers:
   - Ductline Mechanical & Supply is considering a $120,000 clinic HVAC retrofit.
   - If the $30,000 phase payment arrives October 24, the lowest cash balance is $17,000.
   - If it waits until November 20, cash drops to negative $13,000, breaching the $10,000 reserve by $23,000.
   - Greenlight's proposal: move $23,000 from the final installment into the deposit ($65,000 deposit, $30,000 phase, $25,000 final). Total revenue stays $120,000 and the worst-case low point rises to $10,000.
4. **How it works** (four short steps with icons):
   - Read the evidence: contracts, emails, inspection records, and the bank ledger, each linked to its source.
   - Test every case: enumerate each possible payment timing and supplier cost together, not one risk at a time.
   - Show the bottleneck: a cash bridge chart against the reserve line.
   - Suggest the smallest fix: a conserved payment adjustment, clearly labeled as conditional on the customer agreeing.
5. **What makes it trustworthy.** Three points:
   - Fixed code does the money math; AI is used only for reading documents, and every number traces to a source.
   - It says "need more input" instead of guessing when evidence conflicts or an amount is unknown.
   - Invoice eligibility, invoice date, due date and actual bank receipt are treated as separate events.
6. **Inside the product.** Three cards: Decision workspace (cash bridge, reserve, proposal compare), Evidence panel (source text, dates, hashes), Improvement lab (recorded experiments on how the AI parts are measured).
7. **Built with** (small logo row, text labels are fine): Intuit synthetic books, Veri, TypeSafe Jev, Anthropic, Sentry, Paper.
8. **Final call to action.** "See the $23,000 gap for yourself." Button to the live demo.
9. **Footer.** Link to source on GitHub (https://github.com/ManagementMO/greenlight) and a short disclaimer (see Honesty rules).

### Visuals

- Use a cash-bridge line/step chart as the signature graphic: a cash balance line over October to November, a dashed horizontal reserve line at $10,000, a dip below it to -$13,000, then a second line showing the repaired path staying at or above $10,000.
- A real screenshot of the product is at `docs/assets/decision-workspace.png` in the repo. Upload it as an image if Framer allows.
- Style direction: a restrained finance palette (deep navy or ink, warm off-white, one green for "safe", one amber or red for "shortfall"), generous whitespace, clean sans-serif, tabular figures for money. Layouts for desktop and mobile are also designed in Paper: https://app.paper.design/file/01M56AKCMG8WN1327280QA4TJK

### Honesty rules (must appear or be respected)

- All scenarios are **constructed demonstrations** built on synthetic sponsor accounting data, not real customer books. Put this in the footer: "Demonstration scenarios use synthetic data. Greenlight does not send messages, execute agreements, or move funds."
- Do not claim it is connected to QuickBooks or any live account.
- Do not claim guaranteed outcomes, probabilities of payment, or production customer results.
- Do not call the proposal an agreement. It is a suggestion that depends on the customer agreeing.
- Do not present AI fine-tuning as a headline feature. The fine-tuned document reader was tested and not adopted, so describe AI as "helps read documents; fixed code makes the financial decision."

---

## Reference: what Greenlight is

**Product:** A decision tool for one question: can this contractor accept this job without borrowing or missing payroll?

**What it does:** Given a company's bank ledger, upcoming obligations, and a candidate job (contract, costs, payment schedule), it builds a cash timeline, tests every combination of declared uncertainties (for example, when the customer pays, whether suppliers add surcharges), and reports one of four outcomes:

- Supported in tested scenarios (every tested path keeps the reserve)
- Conditional (some paths keep the reserve, others breach it)
- Shortfall (no tested path keeps the reserve)
- Needs input (a needed amount or condition is unknown or disputed, so no verdict is given)

It also ranks the next question worth asking (for example, "Will the phase payment reach the bank October 24 or November 20?") and proposes the smallest permitted payment change that restores the reserve.

**Three demo scenarios:**

| Scenario | What it shows |
| --- | --- |
| The $120k decision | Invoice eligibility and actual collection are different. One of two collection paths preserves the reserve. |
| Two small risks | Two $4,000 supplier overruns are safe individually, but together leave $9,000 and breach the reserve by $1,000. |
| Evidence gap | Conflicting acceptance and an unknown payroll-tax amount produce "Needs input" even when a partial chart looks reassuring. |

**Key interactions:** Compare proposed terms (overlay the proposal on the chart), what-if controls (create a new versioned input without altering the original evidence), Prepare payment request (creates a draft only), and downloadable decision snapshots.

**Where AI is used:**
- A fine-tuned Qwen model (via Veri) proposes structured payment rules from contract clauses. In the recorded frozen test it did not beat the base model, so it was rejected and the base was kept.
- Jev (TypeSafe) judges small evidence questions such as "has the customer received the insurance certificate?"
- Anthropic proposes workflow improvements. In one recorded experiment the improved workflow cut Jev requests from 18 to 6 with the same accuracy (20 of 21 correct, no false "met" judgments). This is a synthetic, narrow test, not a general speed claim.
- Sentry provides error tracking and tracing.

**Data:** Company identity and a bank ledger of 2,419 rows ($74,882.38 ending balance on 2026-10-06) come from the Intuit QuickBooks hackathon synthetic dataset. The $120,000 Northstar Clinic job, future calendar, reserve policy, supplier costs and settlement windows are authored additions and are labeled as such.

**Links:**
- Live demo: https://greenlight-two-psi.vercel.app
- Source: https://github.com/ManagementMO/greenlight
- Design file (Paper): https://app.paper.design/file/01M56AKCMG8WN1327280QA4TJK
- Demo run-of-show: `docs/demo-guide.md`
