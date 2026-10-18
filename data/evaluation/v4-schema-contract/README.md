# Protected v4 schema-contract final evaluation

This is a **new final set**, authored before v4 final predictions to evaluate the unchanged extraction vocabulary with the explicit `json-schema-v4` prompt contract. It is separate from all training/proof files and the already exposed v3 final set. This directory must never be uploaded as training data.

The set contains **40 individually written fictional clauses**: **24 `PROPOSED`, eight `AMBIGUOUS`, and eight `UNSUPPORTED`**. Twenty-one labels preserve an independently stated invoice-issuance clock. Every case has a source identity, company identity, subject namespace and explicit typed expected interpretation; these namespaces are disjoint from existing training and v3 final data. All content is `PUBLIC_SYNTHETIC`, with no private customer documents, books, credentials or production traces.

The corpus bytes are sealed for independent pre-query review. SHA-256:

```text
a9311adc810cf45729b3d091445ff0e141490a4e66295b1d74d54630b928e13a
```

The manifest's review status is authoritative. Inference must not start until an independent reviewer has audited all 40 source/target pairs and the manifest records `independently-audited-before-query`, the auditor, timestamp and this exact evaluation hash. A schema-valid label is not automatically a semantically correct label.

The independent pre-query audit identified one prose clarification in case 16: “First/Then” could imply temporal ordering, although the intended label is an unordered conjunction. The text now explicitly states that completion order is unrestricted. Its expected label is unchanged. The original author-draft bytes and matching manifest are preserved under [`review/author-draft-9df4c484/`](review/author-draft-9df4c484/), with original SHA-256 `9df4c4842b0340ebacab4bd98ea7d191f197526299214683b096dd1fd57e73e9`. This correction occurred before any final inference. Final freeze/signoff follows the reviewer's recheck of the corrected exact bytes.

## What is new

The 24 supported clauses comprise twelve new Boolean-composition families with two independently worded cases per family. These are not legacy renderer families with renamed IDs. The operator/predicate combinations differ from both existing training and v3 final targets. Cases also distinguish a previously accepted invoice from the current invoice that starts a new payment clock, introduce separate work-phase bindings, and include irrelevant neighboring amounts or accounts where explicitly identified.

The shorthand below uses `S` = agreement signed for this job; `D` = delivery of the air-work subject confirmed; `I` = inspection of that subject passed; `A` = controls-phase accepted by the customer; `C` = customer receipt of this job's insurance certificate; and `V` = customer acceptance of a **prior** invoice. The current payment invoice is a separate subject. `&` and `|` mean `ALL` and `ANY`, respectively.

| Cases | Family | Required Boolean composition |
| --- | --- | --- |
| 01–02 | `parallel_complete_routes` | `(I & C) | (A & D)` |
| 03–04 | `two_separate_alternative_gates` | `(D | I) & (C | A)` |
| 05–06 | `prior_invoice_certificate_or_acceptance` | `(V & C) | A` |
| 07–08 | `signature_with_compound_or_prior_invoice` | `S & ((I & D) | V)` |
| 09–10 | `signed_prior_invoice_or_inspected_acceptance` | `(S & V) | (I & A)` |
| 11–12 | `two_independent_credit_gates` | `(S | C) & (V | D)` |
| 13–14 | `delivery_certificate_or_acceptance_invoice` | `(D & C) | (A & V)` |
| 15–16 | `inspection_and_two_complete_document_routes` | `I & ((S & C) | (A & V))` |
| 17–18 | `customer_certificate_or_three_part_route` | `C | (S & D & V)` |
| 19–20 | `three_gates_with_two_alternatives` | `(I | V) & (S | A) & C` |
| 21–22 | `signed_inspected_certificate_or_delivered_invoice` | `(S & I & C) | (D & V)` |
| 23–24 | `acceptance_with_two_complete_clearance_routes` | `((S & D) | (I & V)) & A` |

Every proposed trigger stays within the existing six atomic conditions, two-to-four children per `ALL`/`ANY` node and maximum depth three. Branch grouping is explicit in the operative prose. A complete pair or route is not interchangeable with one item drawn from each route.

## Uncertainty and unsupported behavior

Cases 25–32 preserve missing material information rather than guessing: unselected price schedules, an unbound invoice identity, unsettled Boolean attachment, an ambiguous physical-unit reference, an unconfirmed liaison's receipt authority, competing signed attachments without priority, an ambiguous certificate project, and an unselected delay inside a range. Independent amount, trigger or due fields remain populated when the source establishes them.

Cases 33–40 use unsupported operators or predicates: elapsed-hour deadlines, a recurring-weekday due rule, an external-index percentage amount, exclusive-either with entitlement lapse, a required event order plus an hourly window, a bank-performance-guarantee prerequisite, an explicitly noncustomer independent escrow recipient, and a mixed calendar/business-day clock. An unsupported component is not approximated using a superficially similar supported atom or calendar rule.

Recipient cases distinguish **unknown authorization** from **explicitly excluded customer authority**. A named liaison whose employer/authority is missing is ambiguous. An escrow agent expressly not acting for the customer is an unsupported recipient. Neither is silently converted into `CUSTOMER_CERTIFICATE_RECEIVED`.

For `CALENDAR_DAYS_AFTER_INVOICE_ISSUED`, the current invoice subject is explicit and separate from any accepted prior invoice. Eligibility does not imply issuance. No label asserts a collection date or observed settlement. Fixed dates and trigger-relative clocks are retained where the clause actually selects them.

## Execution and freeze policy

Model requests may contain only each row's **`context`**. Do not include `expected`, `labelRationale`, class counts, family names or this README. The fixed evaluator owns those fields. Base and tuned models must receive the same actual JSON Schema prompt profile, source contexts, decoding settings, case order and frozen bytes. The gate reports material correctness, schema validity, safe handling and correct supported-proposal coverage; raw proposal volume remains owner review burden, not automatic activation.

Keep earlier v3 predictions and protocol failures as historical runs. Do not merge them into these final metrics or tune the model/prompt against these new final labels. Once final predictions are exposed, do not regenerate or edit the corpus. Any later discovered labeling defect requires a new version retaining the old file, old hash and correction rationale.

Focused local verification:

```sh
npx vitest run tests/providers/v4-final-corpus.test.ts
```

The tests validate all expected clauses with the real `validateExtraction` boundary, enforce counts/statuses, check identity and composition separation from existing training/final data, validate the frozen hash, inspect hand-checked Boolean counterexamples and exercise invoice-anchor semantics. These are dataset/schema checks, not model-quality results.

## Label authority and limits

The clauses and typed targets were explicitly authored and developer-reviewed without using any evaluated-model prediction as ground truth. A separate pre-query reviewer must audit the prose/target meaning. This is **not independent human adjudication or real customer truth**. Cases within a composition family are related examples; forty rows do not establish broad population accuracy or statistical significance. New combinations test compositional generalization within a deliberately small vocabulary, not arbitrary contract understanding. `PUBLIC_SYNTHETIC` classifies fictional data; experimental protection is an access policy, not a claim of cryptographic secrecy after public publication.
