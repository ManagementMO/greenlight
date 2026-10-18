# Headroom team handoff

The public project and GitHub repository are now **Headroom**. For an existing checkout, run `git remote set-url origin https://github.com/ManagementMO/headroom.git`. The original local directory, provider projects, frozen data and model identifiers may still say Greenlight; do not rewrite historical experiment evidence. Use [the new brand assets](brand/README.md) for future UI, deck and film work.

This is a runnable shared checkpoint. The decision workspace, evidence view, what-if controls, conserved payment proposal, recorded MetaHarness replay and Sentry instrumentation are implemented. The public demo runs without provider credentials. V5 completed real 300-step training on 336 synthetic examples. Its repaired export improves final material exactness **13/48 → 28/48** and correct supported proposals **9/32 → 19/32**, but fails the absolute release gate and is not promoted. [Current V5 results](extractor-v5-results.md) distinguish measured improvement from release approval. The rejected [V4 result](extractor-v4-results.md) stays archived.

## Start working

```sh
git clone https://github.com/ManagementMO/headroom.git
cd headroom
npm ci --legacy-peer-deps
npm run dev
```

Use Node 22. Open http://localhost:3000. If you already cloned the repository, preserve your changes and bring your branch up to date with `main` before starting. Create a separate feature branch for your work; do not share a working branch with another teammate.

```sh
git switch -c YOUR_FEATURE_BRANCH
npm test
npm run typecheck
```

The hosted checkpoint is https://headroom-lahacks.vercel.app. The demo's clock is October 6, 2026, and its data is synthetic accounting plus explicitly disclosed future scenarios.

The [Paper design and launch-storyboard handoff](design/README.md) is separate from frontend code. It includes 11 authored artboards, source-derived chart geometry, mobile direction, tokens and JSX references. Frontend owners can use it without waiting for model evaluation.

## Suggested parallel ownership

| Workstream | Starting points | Coordination boundary |
| --- | --- | --- |
| Design and frontend | `components/`, `app/globals.css` | Agree which components/styles each person owns before overlapping edits. Preserve source and review notices and keyboard/mobile behavior. |
| Small-business and QuickBooks product research | `docs/`, `data/scenarios/README.md` | Record source links and distinguish sponsor books from new assumptions. Propose use cases before changing financial inputs. |
| California knowledge/RAG preparation | Existing `research/california/` pack on a dedicated branch | Use the source registry, jurisdiction tags and dataset-backed backlog. Keep retrieval answers separate from contractual facts and the cents engine. A larger crawler/RAG feature is follow-up work, not shipped in P0. |
| Model improvements | `scripts/ml/`, `lib/providers/`, `docs/extractor-v5-results.md` | V5 is complete and its final labels are exposed. Preserve its data, prompt, scorer, gate and model identity. A future candidate needs development-guided changes and a fresh untouched final set. Coordinate paid work with the owner ledger. |

## What is working now

The repository contains a [33-source California research pack](../research/california/README.md) and [six prioritized dataset-backed tasks](../research/california/backlog.md). They are preparation for later RAG work, with jurisdiction, vintage and actual-data-presence boundaries. Company-047 is in Albany, NY; a California job/workforce/tax context is unconfirmed.

- Default $120,000 job: late phase collection reaches negative $13,000; advancing $23,000 from the final installment to the deposit restores the $10,000 modeled reserve without changing total revenue.
- Joint supplier-risk and missing-evidence scenarios exercise failure cases, not just the happy path.
- Genuine Anthropic/Jev MetaHarness result: 18 to 6 Jev requests, unchanged 20/21 correct and 15/21 decisive judgments, zero false `MET` judgments on the recorded synthetic workload.
- Real SFT/export/serving integration is verified. V5 completed all 300 steps on 336 synthetic examples. Its repaired export improves final material accuracy 13/48 → 28/48, full validation 41/48 → 45/48, and correct supported coverage 9/32 → 19/32. Fourteen incorrect validated proposals remain; ambiguous-status accuracy drops 7/8 → 6/8, so the absolute gate rejects promotion. All 96 actual final responses are public. The gate-selected baseline's separate C120 source illustration is material-exact and can show the invoice-clock preview. The cash demo uses reviewed fixtures regardless of model quality.
- Sentry has a real captured defect, readable source maps, related traces/logs, verified masked replay, and a production capacity regression.

## Keep the experiment and credentials safe

No provider key is needed for frontend work. Never commit `.env`, `.env.local`, `auth/`, `.vercel/` or `work/`. Each developer should use their own local environment; do not paste keys into issues or pull requests.

Do not regenerate or edit the experiment's frozen data, prompt or gates. Exposed final labels cannot become a new release's clean test. The owner CLI is the paid execution boundary and the authorized total remains $20. The release ledger has **$5.24 spent, $0 reserved, and all 45 entries settled**. Final deployments are permanently stopped; reconciliation reports zero burn and no active jobs or deployments. Use `npx tsx scripts/ml/reconcile.ts` to refresh that publication-time snapshot before later paid work.

Public model suggestions require owner review. Eligibility, invoice issuance, due date and bank settlement remain separate events. The cash engine and fixed evaluation gates retain authority.
