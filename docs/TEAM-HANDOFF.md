# Greenlight P0 team handoff

This is a runnable shared checkpoint. The decision workspace, evidence view, what-if controls, conserved payment proposal, recorded MetaHarness replay and Sentry instrumentation are implemented. The public demo runs without provider credentials. The substantive v4 model evaluation is still in progress and must not be presented as a completed quality improvement.

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

## Suggested parallel ownership

| Workstream | Starting points | Coordination boundary |
| --- | --- | --- |
| Design and frontend | `components/`, `app/globals.css` | Agree which components/styles each person owns before overlapping edits. Preserve source and review notices and keyboard/mobile behavior. |
| Small-business and QuickBooks product research | `docs/`, `data/scenarios/README.md` | Record source links and distinguish sponsor books from new assumptions. Propose use cases before changing financial inputs. |
| California knowledge/RAG preparation | New `research/california/` or a dedicated branch | Collect authoritative source metadata and small reviewed extracts first. Keep retrieval answers separate from contractual facts and the cents engine. A larger crawler/RAG feature is follow-up work, not shipped in P0. |
| Model and evaluation completion | `scripts/ml/`, `lib/providers/`, frozen `data/training/` and `data/evaluation/` | Codex is finishing the current real training and matched evaluation on a separate branch. Coordinate before changing these contracts or corpora. |

## What is working now

- Default $120,000 job: late phase collection reaches negative $13,000; advancing $23,000 from the final installment to the deposit restores the $10,000 modeled reserve without changing total revenue.
- Joint supplier-risk and missing-evidence scenarios exercise failure cases, not just the happy path.
- Genuine Anthropic/Jev MetaHarness result: 18 to 6 Jev requests, unchanged 20/21 correct and 15/21 decisive judgments, zero false `MET` judgments on the recorded synthetic workload.
- Real SFT/export/serving integration exists. The initial ambiguous-prompt baseline is preserved as a failure diagnostic. Corrected v4 training and its fresh protected final evaluation are pending at this checkpoint.
- Sentry has a real captured defect, readable source maps, related traces/logs, verified masked replay, and a production capacity regression.

## Keep the experiment and credentials safe

No provider key is needed for frontend work. Never commit `.env`, `.env.local`, `auth/`, `.vercel/` or `work/`. Each developer should use their own local environment; do not paste keys into issues or pull requests.

Do not regenerate or edit frozen model training/evaluation files during the current experiment. Final labels must not enter model prompts or training. The owner CLI is the paid execution boundary and the total authorized build budget remains $20. Do not start extra training/serving jobs while the current owner run is active.

Public model suggestions require owner review. Eligibility, invoice issuance, due date and bank settlement remain separate events. The cash engine and fixed evaluation gates retain authority.
