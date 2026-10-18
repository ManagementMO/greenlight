# Greenlight team handoff

This is a runnable shared checkpoint. The decision workspace, evidence view, what-if controls, conserved payment proposal, recorded MetaHarness replay and Sentry instrumentation are implemented. The public demo runs without provider credentials. Real v4 training and evaluation are complete: the tuned extractor was rejected by the frozen gate. [Actual results and next ML experiment](extractor-v4-results.md).

## Start working

```sh
git clone https://github.com/ManagementMO/greenlight.git
cd greenlight
npm ci --legacy-peer-deps
npm run dev
```

Use Node 22. Open http://localhost:3000. If you already cloned the repository, preserve your changes and bring your branch up to date with `main` before starting. Create a separate feature branch for your work; do not share a working branch with another teammate.

```sh
git switch -c YOUR_FEATURE_BRANCH
npm test
npm run typecheck
```

The hosted checkpoint is https://greenlight-two-psi.vercel.app. The demo's clock is October 6, 2026, and its data is synthetic accounting plus explicitly disclosed future scenarios.

The [Paper design and launch-storyboard handoff](design/README.md) is separate from frontend code. It includes 11 authored artboards, source-derived chart geometry, mobile direction, tokens and JSX references. Frontend owners can use it without waiting for model evaluation.

## Suggested parallel ownership

| Workstream | Starting points | Coordination boundary |
| --- | --- | --- |
| Design and frontend | `components/`, `app/globals.css` | Agree which components/styles each person owns before overlapping edits. Preserve source and review notices and keyboard/mobile behavior. |
| Small-business and QuickBooks product research | `docs/`, `data/scenarios/README.md` | Record source links and distinguish sponsor books from new assumptions. Propose use cases before changing financial inputs. |
| California knowledge/RAG preparation | Existing `research/california/` pack on a dedicated branch | Use the source registry, jurisdiction tags and dataset-backed backlog. Keep retrieval answers separate from contractual facts and the cents engine. A larger crawler/RAG feature is follow-up work, not shipped in P0. |
| Model improvements | `scripts/ml/`, `lib/providers/`, `docs/extractor-v4-results.md` | V4 is complete and exposed; preserve its frozen data, prompt and gate. New model selection needs development data and a fresh protected final set. Coordinate paid work with the owner ledger. |

## What is working now

The repository contains a [33-source California research pack](../research/california/README.md) and [six prioritized dataset-backed tasks](../research/california/backlog.md). They are preparation for later RAG work, with jurisdiction, vintage and actual-data-presence boundaries. Company-047 is in Albany, NY; a California job/workforce/tax context is unconfirmed.

- Default $120,000 job: late phase collection reaches negative $13,000; advancing $23,000 from the final installment to the deposit restores the $10,000 modeled reserve without changing total revenue.
- Joint supplier-risk and missing-evidence scenarios exercise failure cases, not just the happy path.
- Genuine Anthropic/Jev MetaHarness result: 18 to 6 Jev requests, unchanged 20/21 correct and 15/21 decisive judgments, zero false `MET` judgments on the recorded synthetic workload.
- Real SFT/export/serving integration is verified. V4 completed all 138 steps and both matched inference runs. Tuned JSON syntax improved from 20/40 to 40/40, but full validation was 4/40, correct supported proposals stayed 0/24 and three validated proposals changed the trigger incorrectly. The gate rejected it. The cash demo uses reviewed fixtures, and its unsuccessful source-bound extraction preview is withheld.
- Sentry has a real captured defect, readable source maps, related traces/logs, verified masked replay, and a production capacity regression.

## Keep the experiment and credentials safe

No provider key is needed for frontend work. Never commit `.env`, `.env.local`, `auth/`, `.vercel/` or `work/`. Each developer should use their own local environment; do not paste keys into issues or pull requests.

Do not regenerate or edit the completed experiment's frozen data, prompt or gates. Its exposed final labels cannot become a new release's clean test. The owner CLI is the paid execution boundary and the authorized total remains $20. The final v4 ledger has $2.79 spent, $0 reserved and all 37 entries settled; both evaluation deployments are permanently stopped. Reconcile current owner state and coordinate before any later paid work.

Public model suggestions require owner review. Eligibility, invoice issuance, due date and bank settlement remain separate events. The cash engine and fixed evaluation gates retain authority.
