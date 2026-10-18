# Greenlight

An evidence-driven job-funding decision system with a tested workflow-improvement loop and a fine-tuned obligation extractor.

**Current status:** provider credential checks, repository setup, and Sentry project provisioning are complete. Sentry agent plugins are installed and authenticated for Codex and Claude Code. Application implementation and SDK telemetry verification are pending.

## Set up credentials

Fill the existing private `.env` in this folder. It is ignored by Git. `.env.example` is the blank shareable reference.

Anthropic, TypeSafe/Jev, Veri, Hugging Face, and Sentry credentials are saved and pass their setup checks. The new Anthropic key and workspace ID work together. The Sentry organization and project both use the slug `greenlight-full`; the project DSN is saved locally. Hugging Face credentials are validated and connected to Veri. GitHub and Vercel authentication are verified. No further credential is needed to start implementation. Backend hosting credentials are optional when using an authenticated CLI. No hosted sandbox account is needed; workflow evaluation runs locally.

- [Setup checklist](docs/Greenlight-setup-checklist.md)
- [Accepted technical plan and feasibility audit](docs/Greenlight-revised-plan.md)

The approved initial out-of-pocket budget is **$20**. Sponsor credit balances must be verified before paid experiments. The budget setting in `.env` records this constraint; runtime spending enforcement has not yet been implemented.

Never commit `.env`, provider tokens, or private training/evaluation artifacts. The public demonstration will use synthetic data and disclose added scenarios.
