# Greenlight implementation contract

The accepted specification is `docs/Greenlight-revised-plan.md`. Preserve its invariants and evidence boundaries. This file defines the build interfaces.

## Implementation decisions

- Use one Next.js 16 application with TypeScript domain services and server routes, deployed to Vercel. Python is used for ML/data tooling only when needed. This avoids a second application host while preserving the specification's service boundaries.
- Financial calculation is pure TypeScript, uses safe integer cents and ISO dates, and needs no network or model.
- Public demo operates on disclosed synthetic accounting/scenario fixtures, with browser-local edits and stateless calculations. Provider inference runs under the budgeted local CLI and produces versioned replay artifacts. Any live paid API route must require an admin credential and a persistent budget authority; public unauthenticated routes must never incur model/GPU spending.
- Training runs, deployment lifetimes, model usage, failed runs, and fixed storage charges count toward the $20 overall cap. Existing Veri balance is not assumed additional sponsor credit. Reserve conservative maximum cost before paid actions; release or settle reservations afterward. Do not start a resource whose cost/lifetime cannot be bounded.
- No provider may silently fall back to fabricated or replayed output. UI labels live, deterministic, and recorded provider results explicitly.

## Module ownership

1. Domain: `lib/domain/**`, `data/scenarios/**`, `tests/domain/**`. Own the financial types, fixtures, solver, proposals, sensitivities, invariants, and data provenance adapter. Export from `lib/domain/index.ts`.
2. Providers and ML: `lib/providers/**`, `lib/budget/**`, `scripts/ml/**`, `data/training/**`, `tests/providers/**`, `tests/budget/**`. Own real provider integrations, costs, extraction/Jev contracts, training/export/serving scripts, evaluation results. No paid jobs without parent coordination.
3. Interface: `app/page.tsx`, `app/globals.css`, `components/**`. Own responsive decision/evidence/lab interface. Use the domain module and artifact data; do not duplicate financial arithmetic or invent metrics.
4. Parent: package/config, app layout, API routes, Sentry, Paper design, pipeline execution, external accounts, tests/integration, deployment, docs, evidence and release.

## Domain interface

Domain agent publishes the exact types promptly. Expose `listScenarios(): ScenarioFixture[]`, `getScenario(id: string): ScenarioFixture | undefined`, and `evaluateDecision(input: DecisionInput): DecisionResult` as the UI/route entry points. Also expose typed helpers for proposals and event/evidence edits as needed. Stable UI fields should include id/name/company/job, currency, opening cash, reserve, snapshot/horizon, commitments, milestones, evidence and assumptions. Results must expose status/reasons, baseline and with-job cash timeline, minimums/reserve gap, scenario count/coverage, proposal with conserved revenue and required agreements, next questions, and evidence references. Never label a proposal as an executed agreement.

The UI can initially wait for the domain types and use a small loading shell. All mutations of confirmed terms must update a version/hash or create a new input snapshot; source evidence remains immutable.

## Verification and completion

- Meaningful domain tests cover the ten audit probes plus unknown/conflicting inputs, exact enumeration bounds, and proposal conservation.
- Model/cost tests cover schema validation, error/timeout handling, secret redaction, budget reservation and refusal.
- Freeze independent evaluation labels before experiments. Report raw base/tuned results and failed candidate experiments.
- Verify a genuine SFT artifact, merged export, actual serving inference, and pinned artifact identity before claiming the training path complete.
- Verify browser flows at desktop and mobile, production build, public deployed health and key behavior, Sentry error + traces + logs, and source maps.
- The public README distinguishes implemented, measured, live, recorded, and unresolved evidence.
