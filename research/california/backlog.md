# Greenlight follow-up map: evidence before payroll risk

**Recommended product direction:** keep the consequential question—“Can we accept this job without borrowing or missing payroll?”—and add a cited missing-facts assistant around the existing cash engine. Retrieval should make the next evidence request better. It must not manufacture a tax payment, license, contract term, invoice, settlement or green verdict.

This is a preparation handoff, not implemented RAG. No frontend, cash-engine behavior, model prompt, training row or frozen final evaluation was changed for this research.

## What was actually inspected

The preserved Intuit source is synthetic **company-047, Ductline Mechanical & Supply LLC**, NAICS **238220** (plumbing, heating and air-conditioning contractors). Its source address is **Albany, New York**. A California job, workforce or tax nexus is **not established** by the company record. The California corpus is useful for a later California job/business scenario only after those facts are supplied; it must not be silently attached to the present company as applicable law.

The existing narrow bank adapter reconstructs **2,419** visible rows through **2026-10-06** to **$74,882.38**. That ledger amount is not proof of unrestricted or reconciled spendable funds. The implemented adapter deliberately returns unknown available cash until restricted funds are supplied. The public demo adds a disclosed zero-restricted-funds assumption and constructs the future $120,000 job and forward calendar.

Locally inspected bank fields: `id`, `sim_day`, `date`, signed decimal `amount`, `direction`, `running_balance_amount`, `source_document_id`, `memo`, `kind`, `sim_event_ids`. Cash signs come from signed amounts, not the debit/credit word. Observed bank kinds: 1 opening contribution, 4 deposit receipts, 516 bill payments, 182 wage payments, 1,703 customer payments, 1 owner distribution and 12 journal entries. The absence of a tax-specific `kind` does **not** prove no taxes exist; journal entries, bills and payroll could contain relevant information.

The preserved **manifest**, not independently read row tables, reports:

| Entity | Count in company manifest | Evidence boundary |
| --- | ---: | --- |
| `company` | 1 | Full row preserved and inspected. Address NY; no California nexus inferred. |
| `bank_transactions` | 2,419 | Full table preserved; row count, kinds, hashes and final row checked. |
| `invoices` | 863 | Manifest-only presence; invoice fields, statuses and join quality not audited here. |
| `customer_payments` | 1,703 | Manifest-only presence; bank rows also reference payment source IDs, but joins were not validated. |
| `bills` / `bill_payments` | 549 / 516 | Manifest-only tables; bank bill-payment count also 516. Count difference does not equal number of unpaid bills. |
| `payroll_runs` / `employees` | 182 / 7 | Manifest-only tables. Gross/net amounts, employee scope, withholdings and taxes not audited. |
| `projects` | 5 | Manifest-only presence; no project-contract or milestone semantics assumed. |
| `estimates` | **0** | Progress-invoice work must not pretend existing estimate records are present. |
| `accounts` / `journal_entries` | 38 / 1,533 | Manifest-only presence; a future adapter must review chart/account and entry semantics. |
| `customers` / `items` | 37 / 8 | Manifest-only presence. No vendor table is listed in this manifest. |
| `management_decisions` / `market_context` | 65 / 52 | Synthetic simulation context, not documentary proof of a real business's plans. |

Provenance: [pinned sponsor archive](https://huggingface.co/datasets/CL251215/QuickBooks-Hackathon-2026/resolve/dc68d478a190c879f26fd94b764298c2c6308fa7/hackathon-100-participant.tar.gz). Local preserved files: `data/scenarios/source/{company,bank_transactions,manifest}.yaml`; archive and source hashes are in `data/scenarios/intuit-source.json`. `dataset-evidence.json` records the local source-byte hashes and bank counts checked during this preparation. No full archive was newly downloaded for this task.

## Prioritized work that fits Greenlight

### 1. Payroll completeness gate — P1

**Problem:** a job may look affordable because payroll is modeled as an observed wage transfer while withholding, employer tax, benefits or a future remittance is missing. A plausible-looking historical recurrence is not a confirmed forward payroll plan.

**Present entities:** 182 observed `wage_payment` bank rows; manifest reports 182 `payroll_runs` and 7 `employees`. Use those as the next adapter targets; do not claim their unseen fields are already supported.

**Missing facts:** employees/locations, actual pay periods/paydays, gross and net wages, withheld versus employer-paid amounts, already remitted liabilities, filing/deposit schedule, benefits, future staffing and restricted funds. The selected company is NY. California EDD/DIR guidance is inactive unless California applicability is established.

**Retrieval helps:** cite the appropriate official checklist/calendar after the owner identifies jurisdiction and employer/deposit facts. Show why a question is being asked and which source supports it. Do not synthesize a precise tax rate or payment date from bank history. Source seeds: `edd-calendar`, `edd-filings`, `edd-resources`, `dir-paydays`; federal/NY payroll coverage remains missing from this seed set.

**Why it belongs:** this directly strengthens Greenlight's promise to protect payroll; the existing missing-evidence fixture already demonstrates why an unknown payroll-tax amount prevents a supported result.

**Acceptance:** a synthetic gross-only payroll case stays `NEEDS_INPUT`; a NY-only case does not present a CA due date as applicable; adding a reviewed tax amount and confirmed date creates exactly one future liability; an already-remitted amount is not counted twice. A calendar citation alone cannot clear any of these gates.

### 2. Invoice → payment → bank evidence bridge — P1

**Problem:** contract value, invoice amount, recorded payment and spendable bank money are different states. Counting two of them as cash can create a false “yes” immediately before payroll.

**Present entities:** 863 invoices and 1,703 customer payments are reported in the manifest; 1,703 bank customer-payment rows are preserved with `source_document_id` references. Full invoice/payment rows and their joins still need inspection. Five projects are reported; zero estimates are reported.

**Missing facts:** invoice issue/due dates, remaining balances, allocations/partial payments, payment status, undeposited funds, fees, reversals, bank settlement and restrictions. Counts do not establish one-to-one correspondence or a payment-delay distribution.

**Retrieval helps:** provide product-specific explanations for the accounting stages and reconciliation steps; highlight the missing evidence needed to cross each stage. Relevant Intuit US help: `intuit-record-payments`, `intuit-reconcile`, `intuit-progress`. Product help does not establish contractual rights or actual settlement. A real QuickBooks connection is future work.

**Why it belongs:** turns the cash number into an inspectable chain and helps an owner choose the next useful action: reconcile a receipt, confirm an issue date or ask AP for a settlement window.

**Acceptance:** partial payments allocate without inflating total revenue; a payment already inside the opening ledger is not added as a future receipt; an unmatched/undeposited payment is not labeled settled bank cash; a missing join produces a specific question, not a guessed match. Record evidence IDs from source through the engine input.

### 3. Contract payment-clock consistency check — P1

**Problem:** eligibility to invoice can be mistaken for invoice issuance, and a contractual due date can be mistaken for a collection date. Editing issuance can leave a stale due date behind.

**Present entities:** project and invoice presence is manifest-backed; the current $120,000 job, contract and correspondence are **constructed fixtures**, not sponsor contract records. The app already has a reviewed `PaymentDueRule` and pure `resolvePaymentClock` resolver. This follow-up should reuse that authority.

**Missing facts:** reviewed term, correct invoice subject/customer recipient, actual issuance evidence, satisfied milestone conditions and a separate settlement forecast or observation.

**Retrieval helps:** explain the product's date fields or direct the owner to the relevant source setting (`intuit-due-dates`); retrieve company-approved accounting SOPs later. Public help articles must never replace a signed payment clause or confirm an invoice was sent.

**Why it belongs:** this is a narrow, visible detail with a large cash-timing effect. It connects the extractor to a reviewed schedule without delegating money authority to prose retrieval.

**Acceptance:** for a reviewed 14-day invoice-issuance rule, eligibility **Oct 20** plus issuance **Oct 22** yields due **Nov 5**; no issuance yields an unknown due date; issuance before required eligibility is held for review. Nov 5 remains a contractual due date, with bank collection separately unknown. A help-page prompt injection cannot activate a rule or edit the calendar.

### 4. Supplier bill and materials exposure review — P1 after full-table adapter

**Problem:** accepting a job can commit cash to materials before the customer pays. Already-paid bills, deposits, unrecorded tax treatment and partial supplier settlements can distort the exposure.

**Present entities:** manifest reports 549 bills, 516 bill payments and 8 items; 516 bank bill-payment rows are preserved. Do not infer that 33 bills are unpaid: partial payments and allocations can change that interpretation. A vendor table is not listed in the manifest.

**Missing facts:** actual bill status/due date, project allocation, committed purchase orders, deposits, payment allocations, materials/fixtures/equipment classification, location and tax treatment. Construction simulation settings are not signed supplier commitments.

**Retrieval helps:** ask targeted contractor-tax and records questions using `cdtfa-contractors`, `cdtfa-start`, `cdtfa-payments`. Owner or qualified reviewer supplies the applicable tax amount/treatment. Retrieval never adds a generic percentage to all materials.

**Why it belongs:** exposes missing or double-counted costs before the proposed job consumes the payroll cushion.

**Acceptance:** a bank-paid bill is excluded from remaining future AP; partial payment leaves only supported remaining exposure; a material tax-treatment gap remains explicit; adding a confirmed supplier invoice creates an idempotent cash event. Tax uncertainty cannot be hidden by an optimistic zero.

### 5. Job jurisdiction and contract-type gate — P1 prerequisite for California retrieval

**Problem:** an apparently helpful citation can be materially wrong when applied to another state, a different trade or a commercial job instead of a home-improvement contract.

**Present entities:** company row gives NY location and HVAC-related NAICS. Neither fact proves the worksite, tax nexus, license, public/private funding or residential/commercial classification. The clinic job in the public demo is an authored future scenario.

**Missing facts:** worksite city/state, employer/employee locations and nexus, customer type, job scope, formation/tax status, funding classification, license number/classification, permits and actual contract.

**Retrieval helps:** filter first, then cite CSLB/CalOSBA/SOS resources for the appropriate CA branch. `cslb-contracts` and `cslb-home-improvement` are explicitly residential/consumer guidance; `dir-public-works` is public-works guidance; neither is a general commercial-clinic rule. `cslb-c20` helps ask about trade scope but cannot verify an actual license. Company legal name does not establish tax election.

**Why it belongs:** protects every later recommendation from the “right source, wrong business” failure while generating useful questions before a large job is accepted.

**Acceptance:** NY-only input yields “California applicability unconfirmed”; commercial private work never silently receives a home-improvement deposit rule; public-works classification activates a review checklist only after confirmation; unknown license/permit facts remain unknown. No filing, lookup claim or government submission is invented.

### 6. Missing job-readiness cost checklist — P2, after core cash proof

**Problem:** a forward calendar can omit a permit, coverage premium, certification or safety resource that must be resolved before work can proceed. A generic chatbot tends to produce an unprioritized checklist unrelated to the cash decision.

**Present entities:** company industry plus manifest projects/employees. The preserved files do not establish actual licenses, insurance policies, worksite hazards, inspections or permits.

**Missing facts:** trade/worksite scope, labor allocation, coverage, specific tasks, safety plan and which costs/dates are material to this job. Do not infer that a missing record means the business is noncompliant.

**Retrieval helps:** retrieve only the 1–3 relevant official sources after scope questions: `dir-workers-comp`, `dir-construction-safety`, `dir-heat`, `dir-iipp`, `calosba-permits`, `cslb-c20`. Turn them into evidence requests, with applicability and materiality labels. Avoid a complete-compliance or safety-certification claim.

**Why it belongs:** gives the owner a short prioritized path to remove a material “unknown” from the job decision.

**Acceptance:** an unrelated hazard does not produce a new modeled cost; missing insurance proof produces a request rather than a zero premium or accusation; only an owner-reviewed monetary commitment enters the engine once; critical unresolved readiness facts remain visible even if cash math passes.

## Suggested sequence and division of work

1. **Data adapter owner:** inspect the pinned invoice/payment/bill/payroll tables, publish field and join examples, handle partials/reversals, and retain as-of visibility. Reconcile against preserved bank rows. This can start independently of frontend work.
2. **Retrieval owner:** start with the public source registry and jurisdiction tags. Establish refresh/rights procedures before ingestion. Prototype cited missing-fact cards with a small approved set; no model or page text can mutate engine inputs.
3. **Domain owner:** translate only reviewed amounts, dates and supported terms into versioned engine inputs. Preserve unknowns and the deterministic acceptance gate. Use the existing integer-cents adapter and payment-clock resolver.
4. **Evaluation owner:** author and review a **new protected** retrieval/application final set before tuning or comparing future models. Include wrong-state, wrong-contract-type, dated-calendar, missing-issued-date, source-injection, partial-payment and double-counting cases. The current v4 training/final are frozen and must not be recycled as a clean final for later iterations.

Recommended first demonstrable slice: a missing-payroll-tax card plus an invoice-to-bank evidence card, both with scope-aware source links and deterministic blocking until reviewed facts arrive. Defer broad regulatory Q&A, universal compliance scoring, automated filings and new financial calculations until the narrow evidence chain is sound.

## Trust contract for any later integration

Public web text is untrusted context. It can suggest questions and supply citations; it cannot authenticate a business fact, override the system prompt, execute code, activate extracted terms or set event money/dates. Keep source topic/jurisdiction/vintage, retrieval time and content hash with every excerpt. Preserve a distinction between: source quotation, original summary, applicability hypothesis, owner-confirmed fact, reviewed structured term and actual bank evidence.

A source's retrieval date is not its effective date, and an HTTP 200 is not a correctness or rights guarantee. Calendar calculations require an applicable program/year/schedule and review of exceptions/relief. This seed collection is not legal, tax, financial or workplace-safety advice, nor a complete corpus.
