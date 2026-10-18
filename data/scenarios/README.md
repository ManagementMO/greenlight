# Scenario provenance and domain proof

The scenario clock is **2026-10-06**, the last day represented in the selected company ledger. These are disclosed demonstration scenarios, not current customer books.

## Sponsor source, pinned and preserved

- Dataset: `CL251215/QuickBooks-Hackathon-2026`.
- Dataset revision: `dc68d478a190c879f26fd94b764298c2c6308fa7`.
- [Pinned public archive](https://huggingface.co/datasets/CL251215/QuickBooks-Hackathon-2026/resolve/dc68d478a190c879f26fd94b764298c2c6308fa7/hackathon-100-participant.tar.gz).
- Company: `company-047`, world `world-a5dd7673241855be`, Ductline Mechanical & Supply LLC.
- The original `company.yaml`, `bank_transactions.yaml`, and `manifest.yaml` are preserved in `source/`.
- `intuit-source.json` records source/archive hashes and the selected original row.

The ledger adapter parses signed decimal amounts into exact integer cents. The provider's debit/credit labels are deliberately not used as cash signs. It checks every consecutive visible balance link, rejects conflicting event identities, and selects only rows visible by the requested snapshot. All **2,419** visible rows reconcile to **$74,882.38** at `bank-002419` on October 6. The first source row establishes the opening bank contribution; a later snapshot cannot include later rows.

A recorded bank balance does not prove unrestricted available funds. `reconcileIntuitSnapshot` returns `availableCashCents: null` until restricted/unavailable funds are explicitly supplied. The demo's assumption of zero restricted funds is a constructed addition.

## Constructed additions

Only company identity, industry context, ledger snapshot and source metadata derive from the sponsor dataset. The new $120,000 Northstar Clinic job, future company calendar, reserve policy, supplier costs, crew schedule, contract, emails, inspection plans, settlement bounds and deposit negotiation are authored Greenlight fixtures. They are labeled `constructed_fixture` in every source record. Historical payroll is not silently treated as a complete forward plan.

The constructed non-job obligations total $49,882.38, leaving a baseline minimum of $25,000. No future movement already included in the bank snapshot is counted again. All supplied scenario paths include the existing company commitments.

| Scenario | Declared family | Independently checked consequence |
| --- | --- | --- |
| `ductline-phase-delay` | Phase receipt October 24 or November 20 | One of two paths preserves the $10,000 reserve. Worst cash is −$13,000. Advancing exactly $23,000 from final payment into the deposit repairs both paths. |
| `ductline-joint-stress` | Two independently possible $4,000 supplier surcharges | Three of four paths preserve the reserve. Both surcharges together produce $9,000 minimum cash, repaired by a $1,000 conserved advance. |
| `ductline-missing-evidence` | Same collection family plus conflicting acceptance and unknown payroll tax | `NEEDS_INPUT` takes precedence. Partial cash paths cannot establish feasibility while a material amount or condition is unresolved. |

## Implemented limits

The engine consumes reviewed structured inputs; it does not itself authenticate source documents or interpret arbitrary legal clauses. An `EXPECTED` condition is a disclosed forecast assumption, not an observed event. A null amount/date, unsupported term, conflicting condition, insufficient horizon, or incomplete enumeration prevents a supported verdict.

Joint enumeration is exact up to 256 admissible cases and has a separate traversal guard. Larger families show partial paths and `NEEDS_INPUT`. No probabilities, expected monetary values, or exhaustive claims are inferred from samples.

Proposal search is cent-exact only within the declared family: advance existing final revenue into an allowed earlier deposit collection date. It conserves revenue, respects negotiation bounds, re-runs every admissible joint case, and cannot repair a deficit after the offsetting final receipt. Supplier rescheduling and job-start changes require a reviewed dependency schedule; the simple edit helper rejects these unsupported shifts.

What-if helpers clone inputs and increment their version. Original fixture evidence remains unchanged. Proposals carry the originating snapshot identity and are revalidated before simulation. A simulated proposal is never an executed customer agreement.

## Verification history

The tests use hand-calculated outcomes and real source data. Initial engine stubs produced 21 failing behavioral tests before implementation. The first implementation made those 21 pass. Subsequent adversarial tests were observed failing before fixes for retroactive cost hiding, scenario overflow, scope changes, tied intraday order, correction cycles/competition, future evidence leakage, stale proposals, invalid ledger dates, horizon rendering, premature collection, and unsupported supplier rescheduling.

Current domain tests: `npx vitest run tests/domain` (43 tests), including independent proposal-precondition review. Proposal trials revalidate the full candidate input and all material diagnostics; a cash-only pass cannot override unmet collection conditions. The global TypeScript check also passed after these changes. Full-project integration and deployment verification, provider inference, ML quality, real-customer validation and operational telemetry are separate evidence maintained by their respective modules.
