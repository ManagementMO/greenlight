# Greenlight provider and model pipeline

Run from the repository root. Node 22 and the checked-in npm lock are required. Local credentials are loaded from the ignored `.env`; no command prints credentials. The CLI is the paid execution boundary. The public app performs no paid provider work.

## Commands

```sh
# No inference/GPU charge: authenticated listings and integration checks.
npx tsx scripts/ml/provider-smoke.ts

# Real Anthropic and Jev inference on disclosed synthetic evidence.
npx tsx scripts/ml/provider-smoke.ts --execute

# Recreate the deterministic dataset ONLY before freezing an experiment.
npx tsx scripts/ml/generate-data.ts

# Free local exact Qwen tokenizer and prompt/completion-prefix audit.
uv run --no-project --with tokenizers==0.22.2 --with jinja2==3.1.6 scripts/ml/tokenizer-audit.py

# Read-only live GPU price, credit, active-resource and dataset preflight.
npx tsx scripts/ml/train-veri.ts --max-steps 4 --max-cents 600 --timeout-seconds 1800

# Genuine tiny SFT/QLoRA -> public merged HF export of reviewed synthetic data.
npx tsx scripts/ml/train-veri.ts --max-steps 4 --max-cents 600 --timeout-seconds 1800 --execute

# First verify the tiny exported artifact with one canary and no final test cases.
# Substitute the unique public synthetic HF repo emitted by the training command.
npx tsx scripts/ml/serve-evaluate.ts --repo NAMESPACE/UNIQUE_REPO --label proof --canary-only --max-cents 200 --timeout-seconds 1800 --execute

# After the tiny path works, substantive training reuses the same base model.
npx tsx scripts/ml/train-veri.ts --data data/training/train.jsonl --name sft-v3 --max-steps 138 --max-cents 600 --timeout-seconds 3600 --execute

# Run the frozen heldout set with identical decoding, first base then tuned.
npx tsx scripts/ml/serve-evaluate.ts --repo Qwen/Qwen3-4B-Instruct-2507 --label base --limit 40 --max-cents 200 --timeout-seconds 1800 --execute
npx tsx scripts/ml/serve-evaluate.ts --repo NAMESPACE/UNIQUE_TUNED_REPO --label tuned --limit 40 --max-cents 200 --timeout-seconds 1800 --execute

# No paid requests: compare exact frozen cases, retain the base model on regression/tie.
npx tsx scripts/ml/compare-evaluations.ts

# Read-only account/resource reconciliation. Does not stop or create anything.
npx tsx scripts/ml/reconcile.ts

# Final cost settlement only after terminal provider state supplies positive cost.
npx tsx scripts/ml/reconcile.ts --settle RESERVATION_ID --kind training --resource JOB_ID
npx tsx scripts/ml/reconcile.ts --settle RESERVATION_ID --kind deployment --resource DEPLOYMENT_ID
```

Every training/serving invocation first checks for active Veri resources so balance deltas remain attributable. Run jobs sequentially. A reservation is a conservative authority to spend; it is not a bill. Reservation maxima across the entire project cannot exceed $20. Existing Veri credits count toward that cap. A settled cost above its reservation is recorded as an overrun and blocks further reservations until reviewed; it is never hidden. Timeouts and unknown create outcomes retain reservations. Inspect private records under `work/ml/` and provider state before reconciling.

## What is measured

The active v3 corpus contains 276 supervised clause examples across 23 renderer families and a separate 40-example holdout across ten independently authored semantic families. This includes 84 training and 16 final cases with an invoice-issuance clock, including unsupported/ambiguous recipient clauses whose independent clock is preserved. There are 36 training and eight final recipient-negative cases: an explicit contractor/supplier receipt prerequisite is UNSUPPORTED in this narrow vocabulary; an unidentified recipient or unbound “we” is AMBIGUOUS. All positive certificate clauses explicitly require customer receipt. The original 192-row v1 data used by the four-step technical proof is preserved under `data/training/v1-technical-proof/`; the pre-recipient v2 corpus remains unchanged under `data/training/v2-invoice-clock-archive/`. Companies are split by namespace. Amounts, phase IDs, delays, conjunctions, alternatives, missing information, contradictory deadlines, negation and unsupported business-day/statutory rules are labeled by explicit typed scenario construction. The template logic was reviewed; this is synthetic developer-reviewed data, not independent customer/human ground truth. The manifest hashes all JSONL files. Regeneration refuses changes to an already frozen version. The training CLI accepts only hash-matched train/proof files explicitly classified PUBLIC_SYNTHETIC and never uploads final labels; model evaluation receives source contexts only. The evaluator refuses a changed frozen holdout and retains invalid JSON and errors in the denominator.

The model predicts source/amount references, bounded trigger trees, calendar-day or fixed-date due rules, and a proposed/ambiguous/unsupported interpretation. `CUSTOMER_CERTIFICATE_RECEIVED` requires receipt by the customer or an explicitly authorized customer representative for the named subject. Receipt by a contractor/supplier is a different event; it never silently satisfies that atom. An explicit customer-receipt contract followed by a supplier-only receipt event still extracts the customer prerequisite: its current truth is a separate Jev question. The optional typed `customerCertificateReceiptProposition` helper carries that recipient rule into Jev without changing the existing untyped MetaHarness questions. `CALENDAR_DAYS_AFTER_INVOICE_ISSUED` carries days and a validated invoice subject; its prerequisite trigger remains separate. Invoice eligibility never substitutes for actual issuance, a due date, or settled cash. The model never predicts a bank balance or approves new contract terms. JSON schema and reference validation are necessary checks; semantic fidelity is measured against heldout labels. Material comparison normalizes the order and associativity of AND/OR trees and ignores free-form explanation wording. It counts unsafe proposed terms, automatic coverage, valid JSON, exact material interpretation and status accuracy. An always-abstaining model receives zero exact accuracy on supported cases.

Training uses conversational `prompt` + `completion` rows, `use_unsloth:false`, and Veri's vanilla TRL SFT path. In the inspected runner, rows in that format are passed to SFTTrainer without conversion to full text. TRL's completion-only objective for prompt-completion rows is the intended loss mask. We do not claim we inspected the effective remote token-level loss mask unless a real run exposes it. `max_seq_length:1536` caps memory; record truncation evidence if the runner provides it.

The local audit uses the actual Qwen tokenizer for every active v3 training example. All 276 examples fit within 662 tokens, with at least 54 completion tokens, exact prompt-token prefixes and no truncation at 1536. Results remain in `work/ml/tokenizer-audit.json` and bind to the training SHA256. The audit pins downloaded tokenizer files to the observed HF base revision and records their SHA256 hashes. This proves local format/mask compatibility; it does not inspect the remote worker's label tensors.

Merged export is requested via `hf_push.artifact:"merged", private:false`. This public artifact workflow is limited to the checked-in fictional training clauses: no private customer data, accounting books, credentials or production traces are included. The CLI refuses private/unclassified manifests, even if their hashes match. The first private-export serving attempt failed because the connected HF training/export token was not propagated into the current vLLM serving process. Public synthetic weights avoid that observed authentication gap; production private-data serving would require a separately verified authentication path. Training completion alone does not prove export success: the run must return an HF URL, and artifact validation must find standalone weights, config and tokenizer. Serving uses a unique repository with caching disabled and checks its SHA before and after inference. The provider response's model identity and the HF commit are recorded. Veri's deployment API does not expose a cryptographically attested loaded SHA; this evidence boundary is explicit in every evaluation artifact. Model cards must be authored from reviewed public provenance fields, never by dumping environment variables or private run responses.

Raw base/tuned responses, errors, latencies and scores stay in private `work/ml/evaluation-*.json`. A tiny four-step proof is an integration test of real weight updates and serving. It cannot establish a quality gain. A substantive experiment may improve, regress, or tie; publish the measured outcome.

After the frozen cases, full evaluations also run one C120 showcase extraction using only the exact USD30k phase clause excerpt. Its hash binds the excerpt to the full scenario source. The known expected label stays with the local evaluator. The showcase result records candidate, material score, raw output, returned model, observed revision and latency separately, and never contributes to final test metrics. Technical `--canary-only` runs skip both the final cases and this showcase.

## Cost and lifecycle controls

The durable ledger at `work/budget/ledger.json` uses an exclusive directory lock, atomic rename, fsync, integer cents, and mode-0600 files. It never expires a reservation merely because a process stopped. It is a local CLI authority and is deliberately not imported by public routes.

Live GPU catalog prices are required before allocation. Training reservation estimates include boot/training/merge time, 600 seconds of cleanup/heartbeat margin and $0.30 checkpoint storage allowance (the current documented charge is about $0.24). The documented GPU price card is rounded; the script's extra safety allowance and reservation leave margin above the live rounded calculation.

Before paid creation, the CLI persists a UUID-bearing submission identity and starts a detached recovery process whose readiness must be positively acknowledged. Only then does the single create request run. A lost response triggers read-only discovery by the unique output/deployment name and expected model, never a second create. The recovery process can discover a server-side success even when the parent died before persisting its resource id. It establishes the first training heartbeat when needed, detects a dead parent, and performs bounded cleanup on ambiguity or at deadline. Training sends a heartbeat immediately after creation, then every 30 seconds; the API's 300-second no-heartbeat rule applies after the first heartbeat. Serving starts with minimum zero, maximum one replica, 300-second idle parking, self-healing disabled, no model caching and no paid request-body traces. Both the main process and independent guard require a GET-observed terminal state after stop/cancel. An acknowledgement or idle parking is insufficient. These are process and provider safeguards, not an invented server-side hard TTL: the current create schemas contain no hard wall-clock budget field. The prepaid provider balance is an additional account-level bound. Unknown creation, resource termination or charges retain the full reservation and require inspection.

## Primary references verified October 17, 2026

- [Veri SFT](https://docs.veri.studio/training/sft)
- [Training API](https://docs.veri.studio/training/api)
- [Merged HF export](https://docs.veri.studio/training/huggingface)
- [Deployments API and replica bounds](https://docs.veri.studio/deployments/api)
- [GPU and flat checkpoint billing](https://docs.veri.studio/billing)
- [Serving billing and scale-to-zero](https://docs.veri.studio/deployments/cost)
- [Inspected runner revision](https://github.com/Veri-Studios/veri-runner/blob/7b876fcf3a511bfb5eca037eeb4860f39e633973/veri_runner/training_runtime.py)
- [Jev request/response schema](https://docs.typesafe.ai/api)
- [Jev version and pricing](https://docs.typesafe.ai/models)
- [Anthropic model pricing](https://platform.claude.com/docs/en/about-claude/pricing)
