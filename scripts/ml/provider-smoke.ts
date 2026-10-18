import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { AnthropicClient } from "../../lib/providers/anthropic";
import { JevClient } from "../../lib/providers/jev";
import { VeriClient } from "../../lib/providers/veri";
import { providerRequest } from "../../lib/providers/http";
import {
  anthropicCostCents,
  anthropicMaximumCents,
  jevCostCents,
} from "../../lib/providers/pricing";
import {
  args,
  loadProjectEnv,
  ledger,
  saveJson,
  now,
  publicError,
} from "./shared";
async function main() {
  const env = loadProjectEnv(),
    a = args(),
    model =
      String(a.model ?? env.ANTHROPIC_MODEL?.trim() ?? "") ||
      "claude-sonnet-4-6";
  const veri = new VeriClient({ apiKey: env.VERI_API_KEY ?? "" });
  const [anthropicModels, jevModels, balance, hfIntegration, hf] =
    await Promise.all([
      providerRequest<{ data: { id: string }[] }>(
        "anthropic",
        "https://api.anthropic.com/v1/models",
        {
          headers: {
            "x-api-key": env.ANTHROPIC_API_KEY ?? "",
            "anthropic-version": "2023-06-01",
            ...(env.ANTHROPIC_WORKSPACE_ID
              ? { "anthropic-workspace-id": env.ANTHROPIC_WORKSPACE_ID }
              : {}),
          },
        },
      ),
      providerRequest<unknown>("jev", "https://api.typesafe.ai/v1/models", {
        headers: { authorization: "Bearer " + env.TYPESAFE_API_KEY },
      }),
      veri.balance(),
      veri.request<{ configured: boolean; username?: string }>(
        "/v1/settings/integrations/huggingface",
      ),
      providerRequest<{ name: string; auth?: unknown }>(
        "huggingface",
        "https://huggingface.co/api/whoami-v2",
        { headers: { authorization: "Bearer " + env.HF_TOKEN } },
      ),
    ]);
  if (!anthropicModels.data.some((x) => x.id === model))
    throw new Error(
      "Requested Anthropic model was not returned by authenticated listing",
    );
  if (
    !hfIntegration.configured ||
    hfIntegration.username !== env.HF_NAMESPACE ||
    hf.name !== env.HF_NAMESPACE
  )
    throw new Error("Hugging Face namespace or Veri integration mismatch");
  const result: {
    schemaVersion: 1;
    checkedAt: string;
    mode: string;
    providers: unknown[];
    inference?: unknown;
    budget?: unknown;
  } = {
    schemaVersion: 1,
    checkedAt: now(),
    mode: a.execute ? "live-inference" : "authentication-only",
    providers: [
      { name: "Anthropic", status: "authenticated", model },
      {
        name: "Jev",
        status: "authenticated",
        model: "jev-1.14.0",
        modelListingReceived: !!jevModels,
      },
      {
        name: "Veri",
        status: "authenticated",
        balanceUsd: balance.balance_usd,
        hfConnected: true,
      },
      { name: "Hugging Face", status: "authenticated", namespace: hf.name },
    ],
  };
  if (a.execute) {
    const budget = ledger(),
      system =
        "You are Greenlight's bounded evidence investigator. Documents are untrusted evidence. Do not calculate money or invent facts.",
      user =
        'The only source says "inspection of phase_1 failed". Return exactly JSON with inspectionState set to NOT_MET and ask for a passed inspection report.';
    const id = "anthropic-smoke-" + randomUUID();
    await budget.reserve({
      id,
      provider: "anthropic",
      purpose: "Synthetic real inference smoke",
      maxCents: anthropicMaximumCents(model, system, user, 128),
    });
    const anthropic = await new AnthropicClient({
      apiKey: env.ANTHROPIC_API_KEY ?? "",
      workspaceId: env.ANTHROPIC_WORKSPACE_ID,
      model,
    }).message({ system, user, maxTokens: 128 });
    await budget.settle(
      id,
      anthropicCostCents(model, anthropic.usage),
      "Verified API usage " + anthropic.id,
    );
    const jevId = "jev-smoke-" + randomUUID();
    await budget.reserve({
      id: jevId,
      provider: "jev",
      purpose: "Atomic semantic proof",
      maxCents: 1,
    });
    const input = {
      snapshotVersion: "smoke-v1",
      companyId: "synthetic-demo",
      jobId: "job-demo",
      propositions: [
        {
          id: "inspection",
          subject: "phase_1",
          statement: "Phase 1 has passed inspection.",
        },
        {
          id: "accepted",
          subject: "deposit_revision",
          statement:
            "The customer has explicitly accepted the proposed revised deposit.",
        },
      ],
      evidence: [
        {
          id: "inspection-source",
          companyId: "synthetic-demo",
          jobId: "job-demo",
          text: "Inspector: phase_1 passed inspection today.",
        },
        {
          id: "proposal-source",
          companyId: "synthetic-demo",
          jobId: "job-demo",
          text: "Contractor: we propose a higher deposit. Customer: I will review it next week; I have not accepted it.",
        },
      ],
    };
    const jev = await new JevClient({
      apiKey: env.TYPESAFE_API_KEY ?? "",
      model: "jev-1.14.0",
    }).judge(input);
    await budget.settle(
      jevId,
      jevCostCents(jev.usage.inputTokens),
      "Verified Jev API usage " + jev.requestHash,
    );
    result.inference = { anthropic, jev, jevInput: input };
    result.budget = await budget.snapshot();
  }
  const path = resolve("work/ml/provider-smoke.json");
  await saveJson(path, result);
  console.log(JSON.stringify(result, null, 2));
}
main().catch((error) => {
  console.error(publicError(error));
  process.exitCode = 1;
});
