# Headroom: the pitch in plain English

**Headroom helps a small business decide whether it can afford its next job, and which payment terms would make the job work.**

The owner gets a practical decision. The technical contribution is a measured improvement loop that reduces repeated AI evidence work while keeping the financial calculation in ordinary code.

## The four jobs inside the product

| Part | Plain-English job | Example |
| --- | --- | --- |
| **Qwen reader** | Proposes structured terms from a contract. Source validation and owner review come before activation. | “The phase invoice requires inspection approval AND customer receipt of the insurance certificate.” |
| **Jev evidence checker** | Checks a narrow statement against the supplied evidence: met, not met, unknown or conflicting. | “Has the customer actually received the certificate?” An invoice approval does not prove a bank payment. |
| **TypeScript cash engine** | Calculates money in integer cents, tests the declared scenarios, and searches the allowed payment adjustments. | “If the customer pays late, cash falls to −$13k. A $23k earlier deposit preserves a $10k reserve.” |
| **Meta-harness** | A larger model proposes a better plan for scoping, batching and reusing Jev checks. Fixed tests decide whether to keep it. | A new certificate email triggers the certificate check; unchanged inspection and settlement checks can be reused. |

The meta-harness improves the **workflow around Jev**. It does not train Jev or replace the entire financial decision with a model prediction. If relevant evidence changes, its dependent check must be invalidated and recomputed.

## A short pitch you can say verbatim

“A profitable job can still make a small business miss payroll. Headroom answers: can we afford our next job, and what payment terms would make it work?

“We bring together the books, contract conditions and upcoming commitments. AI helps interpret the documents; ordinary code calculates the cash. In our demo, a $120,000 job takes cash to negative $13,000 if the customer pays late. Moving $23,000 from the final payment into the deposit keeps $10,000 in reserve, with the same total contract value.

“Our meta-harness also improves the evidence workflow. On a fixed recorded test, it reduced Jev requests from eighteen to six while preserving twenty correct judgments out of twenty-one. The owner gets an explainable plan, and the system does less repeated AI work.”

## Operate the guided demo

Use the guided presentation on the review branch, or the root page after it is merged. Enter presentation mode with the expand icon and use the arrow keys. For a short pitch, jump between these chapters:

1. **Opportunity:** “Can we take this $120,000 job and still make payroll?”
2. **Cash path:** Point at −$13,000. “The job has a positive modeled surplus, but the payment can arrive after the costs.”
3. **Better terms:** Click **Apply the what-if**. “Advance $23,000 into the deposit. Both declared paths now preserve the $10,000 reserve.”
4. **Learning:** Point at **18 → 6**. “We improved which evidence gets checked and reused, with unchanged measured correctness on this workload.”
5. **Trust:** Select **Missing evidence**. “When material facts are missing, we withhold a supported answer.”

If a judge asks how the documents work, open **Conditions**, then a source. If they want to inspect the implementation evidence, open the workspace or the full experiments.

## Where fine-tuning fits

We fine-tuned **Qwen**, the contract reader, using 336 synthetic clause examples. It learns to produce typed terms: the amount, the relevant parties, the conditions, and the correct invoice clock. Jev is a separate evidence checker.

On 48 untouched final cases, exact outputs improved from **13 to 28**. The candidate still had **14 incorrect validated proposals**, so it failed the promotion gate. The public cash demo uses reviewed structured inputs. This is a measured learning result with a working review boundary, not autonomous financial authority.

## Keep the claims precise

- **Intuit:** We use its synthetic dataset, plus disclosed future commitments and contract fixtures. We are not showing a live QuickBooks account connection.
- **Savings:** We measured **67% fewer Jev requests** and about **68% fewer input tokens** on seven synthetic updates, with **20/21 correct in both workflows**. We did not establish an equivalent percentage reduction in dollar cost or latency.
- **Payment plan:** The $23k advance is the minimum within the allowed deposit/date adjustment family. The customer must agree and the deposit must actually settle. It is not a guarantee across unmodeled futures.
- **Demo:** Cash calculations run live. Model experiments are genuine recorded runs. Replay rechecks their saved results against fixed gates.
- **Sentry:** It provides operational traces, errors and logs. It helped diagnose and fix the oversized-response issue; it does not certify a financial conclusion.

The product message is **better growth decisions with a visible path to payroll coverage**. The engineering message is **less repeated model work, measurable learning, and fixed financial rules**.
