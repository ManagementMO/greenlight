# Greenlight setup

Project folder: `/Users/mo/Downloads/greenlight`

Fill the private `.env` in this folder. It is ignored by Git and has owner-only permissions. `.env.example` contains blank shareable fields. Never put credentials in chat or commit them.

The public GitHub repository is [ManagementMO/greenlight](https://github.com/ManagementMO/greenlight). The product name is Greenlight. The initial out-of-pocket cap is $20, with sponsor credits verified separately. Replay/evaluation runs locally.

## Model keys

- `ANTHROPIC_API_KEY`: the chosen general-model provider. `ANTHROPIC_MODEL` is optional.
- `ANTHROPIC_WORKSPACE_ID`: saved and verified together with the current API key. The application must pass the configured value in the `anthropic-workspace-id` request header.
- `TYPESAFE_API_KEY`: Jev.
- `VERI_API_KEY`: genuine fine-tuning and trained-model serving.

Readiness checks on October 17, 2026:

| Service | Verified result |
| --- | --- |
| Hugging Face | Token authenticates, `HF_NAMESPACE` matches its user, and the fine-grained token grants repository write permission in that namespace. |
| Veri | Identity and balance endpoints succeed. Current workspace balance is $20; its funding source was not verified. Hugging Face integration was connected and read back successfully with the matching username. |
| Jev | Authenticated models endpoint succeeds. |
| Sentry | Agent MCP responds and finds `greenlight-full`; the auth token was rechecked and the saved DSN matches an active project client key. |
| GitHub | Public `ManagementMO/greenlight` repository is accessible with admin permission. |
| Vercel | CLI remains authenticated as `managementmo`. |
| Anthropic | New API key and workspace ID pass the authenticated models request together (HTTP 200). Available model IDs were returned successfully. |

All required credential fields are now populated. Anthropic, Jev, Hugging Face, Veri, and Sentry access checks pass; GitHub and Vercel authentication were rechecked. No additional credential is needed to start implementation. [Anthropic documents the workspace header here](https://platform.claude.com/docs/en/api/models/list).

These checks did not generate model output or start GPU/training jobs. Authenticated control-plane access does not establish inference billing readiness or successful training, export, and serving. The overall out-of-pocket cap remains $20; the existing Veri balance is not assumed to be extra sponsor credit.

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

The application source has not been implemented yet. During the build, the planned Next.js and Python SDKs will share this project's DSN and tag telemetry by component. Error reporting, Tracing, Logs, Session Replay, release/source-map upload, and a real application error must still be implemented and verified. Provisioning and successful API authentication do not establish telemetry ingestion or source-map upload success. No notification rules were created during provisioning.

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

The model repository will be created during implementation. The Veri-to-Hugging-Face account connection is already configured; actual weight upload and subsequent serving must still be tested. No separate organization, paid HF subscription, or manual model upload is required for the planned basic export workflow.

[Hugging Face token documentation](https://huggingface.co/docs/hub/security-tokens), [Veri export integration](https://docs.veri.studio/training/huggingface).

## Later deployment/design setup

GitHub and Vercel authentication were rechecked successfully. Backend hosting can use Railway browser CLI login, a project-scoped token, or another suitable existing host. Leave the Railway fields blank until that choice is configured. Storage/worker setup is handled during implementation.

For Paper design work, sign into Paper Desktop, open a Greenlight file, and connect Codex through its MCP panel. This is separate from model credentials.

Save the Anthropic workspace ID or workspace-scoped replacement key in `.env`. Repository visibility, deployment intent, and the $20 cap are already settled.

Credential setup is ready for implementation. Repository visibility, deployment intent, and the $20 cap are already settled. Live inference, fine-tuning, model serving, SDK telemetry, and deployment remain implementation checks.
