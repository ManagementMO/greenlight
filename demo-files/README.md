# Headroom demo inputs

Small, realistic files for testing Headroom end to end. All are fictional. They describe one job, the
pending **$97,200 renovation (estimate est-00129)** in the Birchfield Custom Homes books, now written up
as a contract with **Harbor Lane Dental**.

## How to test

**Quickest:** open http://localhost:3000/app, pick a case from the **demo case** dropdown at the bottom
of the page (it attaches the books, that case's files and its question), then press **Check it**.
The dropdown has three groups: Happy path, Tough call and Edge case. They're listed in `lib/demo-cases.ts`.
Maple Street garage and the business-day contract are no longer in the dropdown; attach them by hand.

To attach the files by hand instead:

1. Run the app (`npm run dev`) and open http://localhost:3000/app.
2. Attach the books: `demo-files/Birchfield_Custom_Homes_Greenlight_Upload.json` (the bank balance, bills, payroll and invoices). **Every case needs this file.**
3. Attach the file(s) for one case below.
4. Ask: **"Can we take the Harbor Lane Dental renovation and still keep $20,000 in the bank?"**
5. Click **Check it**. Each run makes one Claude call that only copies money lines (about $0.025, 12–14 s) and
   sends every yes/no judgment to Jev: about 18 questions in 2 batched calls, about 0.2 s, $0.0003 in total.
   **How it was answered** (bottom tab on the answer page) lists every Jev question, its verdict and its confidence.


## Happy path (use these for the demo video)

`happy-path/` contracts write every payment clause in the **same patterns the fine-tuned model was trained on**
(`work_` / `stage_` IDs; a single condition, "all of … AND …", "at least one of … OR …", and
"Once eligible, the contractual due date is …"), with fixed calendar dates so nothing is ambiguous.
Each run uses all three parts of the pipeline live: fixed code reads the books, Claude reads the contract,
and Jev checks each payment condition.

| Attach (plus the books) | Prompt | Expected answer |
|---|---|---|
| `happy-path/1-harbor-lane-renovation.txt` | Can we take the Harbor Lane Dental renovation and still keep $20,000 in the bank? | **Yes, you can take it.** All 32 cases pass. Lowest cash $26,285 on Apr 23, 2027. |
| `happy-path/2-maple-street-garage.txt` | Can we build the Maple Street garage and still keep $10,000 in the bank? | **Yes, you can take it.** All 16 cases pass. Lowest cash $14,385 on Apr 23, 2027. |
| `happy-path/1-harbor-lane-renovation.txt` + `3-harbor-lane-email.eml` + `4-novotny-email.eml` | Can we take the Harbor Lane Dental renovation and still keep $20,000 in the bank? | **Yes, you can take it.** All 32 cases pass. Lowest cash is today's $85,228: the deposit is already in, and Novotny's $66,434 (INV-1018) is promised, so only Delacroix's $19,248 stays a what-if. |

## Tough calls (dropdown: "Tough call")

Two more jobs from the same books where the answer isn't a clean yes. Recorded 2026-10-18.

| Attach (plus the books) | Prompt | Expected answer |
|---|---|---|
| `happy-path/5-cedar-court-kitchen.txt` ($120,000) | Can we take the Cedar Court kitchen remodel and still keep $10,000 in the bank? | **Yes, if the timing works out** (8 of 16 cases). It depends on the past-due customers paying. **Smallest fix:** ask for about $19,083 more upfront. |
| `happy-path/6-elm-ridge-custom-home.txt` ($150,000) | Can we take the Elm Ridge custom home and still keep $10,000 in the bank? | **Not on these terms.** Short of the reserve in all 32 cases, and no deposit change fixes it. |

### What the fine-tuned Qwen V5 reads (recorded 2026-10-18, deployment live)

Claude copies each payment clause word for word; Qwen V5 then reads every clause after the deposit
into typed conditions and a due date (2.7–3.7 s per clause, in parallel). Its verdicts on the demo files:

| Files | Qwen V5 on the clauses after the deposit |
|---|---|
| Happy path 1, edge case 1, edge case 5 | Proposed ×3 (e.g. "the inspection passes and the customer receives the certificate", due 2026-11-30) |
| Happy path 2 | Proposed ×2 |
| Edge 2 (pay-if-paid) | **Unsupported** "Lender draw receipt is outside the supported predicate", then Proposed ×2 |
| Edge 3 (business days) | **Unsupported** "Business-day calendars are unsupported", then Proposed ×2 |
| Edge 4 (no deadline) | **Ambiguous** "The payment deadline is not specified", then Proposed ×2 |

Jev then checks each of Qwen's conditions part by part. The deployment scales to zero after 5 idle
minutes; the first run after that waits on a cold GPU, and Qwen falls back to Claude's reading for that run.

### What Jev checks (recorded 2026-10-18)

Every run asks Jev about 18 yes/no questions. Claude makes no judgments at all.

| Question | Contract only | Contract + both emails | Effect on the forecast |
|---|---|---|---|
| Has each payment condition happened yet? (3) | Unknown | Unknown | Each becomes a "what if it's late" case |
| Is each later payment pay-if-paid? (3) | Not met | Not met | If met: no date, ask the user |
| Is each deadline in business days? (3) | Not met | Not met | If met: no date, ask the user |
| Has the customer said it will pay 14+ / 30+ / 45+ / 60+ days late? | Unknown ×4 | Met, Met, Not met, Not met | The late what-if uses 30 days instead of 14 from history |
| Has the customer already paid the deposit? | Unknown | Met | Deposit counted as cash now |
| Has Novotny promised to pay INV-1018? / Is it disputing it? | Unknown | Met / Not met | Promised invoices leave the "will they pay?" question |
| Has Delacroix promised / disputed INV-1019? | Unknown | Unknown | Still asked as a what-if |

One LLM doing all of it (same files, same questions, one Claude call) was measured once with
`npx tsx scripts/llm-only-baseline.ts <saved response>`: **$0.0354 and 19.5 s**, against
**$0.0285 and 14.2 s** for Headroom's split. Both gave the same 18 answers. The saving is in the
judgments: Jev answered them for $0.0003 in 0.2 s, where Claude spent about $0.007 and 5.5 s extra.

## Edge cases and what Headroom should say

These contracts are identical except clause **4(b)**, the first $29,160 progress payment.

Results below were re-recorded on 2026-10-18 with `claude-sonnet-4-6` (extract only) and Jev. Model wording varies run to run;
the verdict and numbers should not.

| # | Attach (plus the books) | What's tricky | Expected answer |
|---|---|---|---|
| 1 | `1-clean-contract.txt` | Nothing. All four payments have calendar dates. | **Yes, you can take it.** Supported in all 32 cases. Lowest cash $26,285 on Apr 23, 2027. |
| 2 | `2-pay-if-paid-contract.txt` | 4(b) is **pay-if-paid**: paid only if the owner's lender funds a draw. | **Not enough to answer yet.** Jev answers Met to "owed only if someone else pays first?", so the $29,160 payment gets no date. Enter an expected date on the answer screen (e.g. Dec 15) → **Yes**, 16/16 cases. |
| 3 | `3-business-days-contract.txt` | 4(b) is due **10 business days** after an inspection "expected mid-November". | **Not enough to answer yet.** Jev answers Met to "counted in business days?", and business days aren't turned into a date. Enter a date → **Yes**. |
| 4 | `4-missing-deadline-contract.txt` | 4(b) is "payable upon rough-in inspection", with **no deadline**. | **Not enough to answer yet.** Claude finds no date to copy, so the payment is undated. Enter a date → **Yes**. |
| 5 | `1-clean-contract.txt` + `5-customer-email.eml` | The customer's AP says payments will arrive **~45 days late**. | **Yes, you can take it.** Jev answers Met to 14+, 30+ and 45+ days late, so the late-payment what-if uses 45 days instead of 14 from history. It still clears $20,000. |

### Stricter reserve

Ask the same question with **$40,000** instead of $20,000 (case 1 or 5):

- **Yes, if the timing works out** (Conditional; some cases fall short).
- The deciding question is **not** the new job. It's whether the past-due customers (Novotny and
  Delacroix) pay the **$85,682** they already owe. If they don't, cash falls $13,715 short of $40,000.
- The new customer paying 45 days late doesn't change the answer. The low point is April 2027,
  driven by the business's existing costs.
- With the happy-path emails attached (`happy-path/1` + `3` + `4`) the same $40,000 question becomes
  **Yes, you can take it** (32/32): Jev finds Novotny has promised its $66,434, so that money is no longer a what-if.
  This is the best single demo of Jev changing the answer.

## What each file tests

- **Books (.json)**: fixed code reads 3,500 records: cash $85,227.62, 41 unpaid bills, payroll and
  operating pace, past-due invoices, the active Bellrock job, and payment patterns from past renovations.
- **Contracts (.txt)**: Claude reads the payment schedule and costs, copying amounts and dates as
  written. Fixed code computes "15% of the price" ($14,580) and every date.
- **Cases 2–4**: the same hard cases the fine-tuned V5 model was trained to refuse
  (pay-if-paid, business days, missing deadline), written as a real contract. Headroom must not
  guess a date for them.
- **Email (.eml)**: a fact from outside the contract (late payment) changes a what-if, not the
  contract dates.
