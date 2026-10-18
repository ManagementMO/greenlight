# Greenlight setup

Project folder: `/Users/mo/Downloads/greenlight`

Fill the private `.env` in this folder. It is ignored by Git and has owner-only permissions. `.env.example` contains blank shareable fields. Never put credentials in chat or commit them.

The public GitHub repository is [ManagementMO/greenlight](https://github.com/ManagementMO/greenlight), and the application is deployed at [greenlight-two-psi.vercel.app](https://greenlight-two-psi.vercel.app). The product name is Greenlight. The total authorized project spending cap is $20; the original Veri balance does not create additional authorization. Paid experiments run through the local owner CLI, while the public application runs deterministic calculations and recorded-result replay.

## Current execution checkpoint

- The decision, source-evidence and improvement interfaces are implemented and deployed. Model keys are not needed to open the public demonstration.
- Anthropic and Jev performed genuine inference. The recorded MetaHarness experiment used 18 versus 6 Jev requests while both versions retained 20/21 correct judgments, 15/21 decisive judgments and zero false `MET` judgments on the disclosed synthetic workload.
- The historical four-step, 16-row Qwen proof trained, exported public synthetic merged weights, and served a real canary. Its output was schema-invalid, so it proves the technical path without establishing useful model quality. No final holdout cases were queried in that proof.
- The active v3 corpus has 276 training rows, a 23-row proof subset and 40 frozen final cases. Substantive job `95e43036a0b9` is running with 138 configured optimizer steps. Full base/tuned evaluation is pending and has not been queried at this checkpoint.
- Sentry captured the real oversized-response defect and has recorded production decision and AI evidence traces. Paper was connected and a fresh design canvas started; further Paper MCP work hit the account's weekly quota.

No additional credential is required for the current workflow. Final model quality, artifact revision and release SHA must be taken from the completed release evidence. Use `npx tsx scripts/ml/reconcile.ts` for current owner resource/budget state rather than treating the historical account checks below as current balances.

## Model keys

- `ANTHROPIC_API_KEY`: the chosen general-model provider. `ANTHROPIC_MODEL` is optional.
- `ANTHROPIC_WORKSPACE_ID`: saved and verified together with the current API key. The application must pass the configured value in the `anthropic-workspace-id` request header.
- `TYPESAFE_API_KEY`: Jev.
- `VERI_API_KEY`: genuine fine-tuning and trained-model serving.

Initial credential-readiness checks on October 17, 2026, retained as setup history:

| Service | Verified result |
| --- | --- |
| Hugging Face | Token authenticates, `HF_NAMESPACE` matches its user, and the fine-grained token grants repository write permission in that namespace. |
| Veri | Identity and balance endpoints succeeded; the initial observed workspace balance was $20 and its funding source was not verified. Hugging Face integration was connected and read back successfully with the matching username. This is not the current remaining balance. |
| Jev | Authenticated models endpoint succeeds. |
| Sentry | Agent MCP responds and finds `greenlight-full`; the auth token was rechecked and the saved DSN matches an active project client key. |
| GitHub | Public `ManagementMO/greenlight` repository is accessible with admin permission. |
| Vercel | CLI remains authenticated as `managementmo`. |
| Anthropic | New API key and workspace ID pass the authenticated models request together (HTTP 200). Available model IDs were returned successfully. |

All required credential fields were populated and verified; subsequent model/training/deployment operations are described above. No additional credential is needed for the current implementation. [Anthropic documents the workspace header here](https://platform.claude.com/docs/en/api/models/list).

Those initial authentication checks did not themselves generate model output or start GPU jobs. Later genuine inference and training consumed the same overall $20 authorization. The durable local budget ledger retains reservations while creation, termination or final charges remain uncertain.

## One Sentry organization and one project

Sentry provisioning was completed on October 17, 2026:

- Organization: `greenlight-full`.
- Team: `greenlight`.
- Project: **Greenlight**, slug `greenlight-full`, platform `javascript-nextjs`.
- Project ID: `4512274224840704`.
- [Sentry project settings](https://sentry.io/settings/greenlight-full/projects/greenlight-full/).
- `SENTRY_ORG`, `SENTRY_PROJECT`, and the active project `SENTRY_DSN` are saved in the private `.env`.
- The supplied `SENTRY_AUTH_TOKEN` successfully authenticated with Sentry and accessed the organization, projects, teams, and client keys.
- Sentry plugin version `1.4.5` was installed and OAuth authentication completed for both Codex and Claude Code using the official agent-plugin installer. Codex's Sentry MCP is now available and was verified with a successful project lookup.

No further Sentry credentials are currently needed. The local `.env` has owner-only permissions and is ignored by Git. The public `.env.example` contains no credentials.

The implemented Next.js application shares this DSN across its server and browser instrumentation, tagging telemetry by component and snapshot/experiment identity. Python is auxiliary tokenizer tooling, not a second application backend. Sentry captured the [oversized-response issue](https://greenlight-full.sentry.io/issues/GREENLIGHT-FULL-2) with a readable first-party frame, trace and log. The [production decision trace](https://greenlight-full.sentry.io/explore/traces/trace/cce2ff36a49a4f0ab0e87750fdf31dcd) and [AI evidence trace](https://greenlight-full.sentry.io/explore/traces/trace/3d6174d05a49436c8534598d38fae12b) are recorded operational proof. Masked Session Replay and source-map upload are configured; this statement does not claim a verified replay session or every client source map. No notification rules were created during provisioning.

The DSN routes telemetry to the project. The auth token stays in backend/development/build configuration and supports telemetry inspection and release operations; only the DSN is appropriate for the browser. The documented minimum scopes for the planned combined personal token are `org:read`, `project:read`, `event:read`, and `project:releases`.

Sources: [Sentry DSN explanation](https://docs.sentry.io/concepts/key-terms/dsn-explainer/), [auth token types](https://docs.sentry.io/account/auth-tokens/), [permissions](https://docs.sentry.io/api/permissions/).

## Hugging Face

`HF_TOKEN` and `HF_NAMESPACE` are now saved and validated. The supplied fine-grained token has write permission for the matching personal namespace, and Veri accepted it for the Hugging Face integration. No token replacement is needed.

The steps below are retained as a reference for replacing credentials later:

1. Sign into [Hugging Face](https://huggingface.co/) and open [Settings → Access Tokens](https://huggingface.co/settings/tokens).
2. Choose **Create new token** / **New token**.
3. Select the **Write** role and name it `greenlight-veri`. Veri's documented export integration requires write access. An organization that enforces fine-grained tokens instead requires an appropriately scoped write token approved for that organization.
4. Generate the token and save it in `HF_TOKEN`.
5. Set `HF_NAMESPACE` to your Hugging Face username, or a writable organization. Your personal username is the simplest option; it is not the account display name or email address.

The technical proof has a [public synthetic merged repository](https://huggingface.co/machinelearningmo/greenlight-extractor-proof-931b140b-mvd2mcyp) and verified real serving, with a schema-invalid canary. The current substantive job targets `machinelearningmo/greenlight-extractor-sft-v3-0b2aade3-dae6e098-ba7`; its export and final evaluation are pending. Public export is authorized only for the fictional corpus classified `PUBLIC_SYNTHETIC`. No private customer data, accounting books, credentials or production traces are included. The first private-export serving attempt exposed a token-propagation gap, so a production private-data serving path remains unverified. No separate HF organization or paid subscription is required for this public synthetic workflow.

[Hugging Face token documentation](https://huggingface.co/docs/hub/security-tokens), [Veri export integration](https://docs.veri.studio/training/huggingface).

## Deployment and design

Greenlight uses one Next.js application on Vercel, not a separate Railway backend. Railway fields in the template are unused optional legacy setup fields. Provider/GPU operations remain in the local budgeted CLI; the public application does not expose paid inference endpoints.

Paper MCP was connected and a new [Greenlight canvas](https://app.paper.design/file/01M5653KWM6RPTEPWYPP37FKZX) received the initial layout. Further MCP work was limited by the account's weekly quota. The responsive interface is implemented in code; the Paper contribution is recorded as partial rather than presented as a fully authored Paper project.

Preserve the working Anthropic workspace ID and credentials in the ignored `.env`; no replacement is needed. Follow the [owner ML runbook](../scripts/ml/README.md) for current v3 data, exact recipient/invoice-clock semantics, resource cleanup and the pending `extractor-gates-v2` comparison. Do not infer quality or automatic activation from training completion, a serving canary, or a high raw proposal count.
