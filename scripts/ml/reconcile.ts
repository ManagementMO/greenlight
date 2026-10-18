import { resolve } from "node:path";
import { args, loadProjectEnv, ledger, saveJson, publicError } from "./shared";
import { VeriClient } from "../../lib/providers/veri";
import { usdToCentsCeil } from "../../lib/budget/ledger";
async function main() {
  const env = loadProjectEnv(),
    a = args(),
    client = new VeriClient({ apiKey: env.VERI_API_KEY ?? "" }),
    budget = ledger(),
    snapshot = await budget.snapshot();
  const [jobs, deps, balance, burn] = await Promise.all([
    client.request<{ data: unknown[] }>("/v1/training_jobs?limit=100"),
    client.request<{ data: unknown[] }>("/v1/deployments?limit=100"),
    client.balance(),
    client.request<unknown>("/v1/billing/burn_rate"),
  ]);
  const result = {
    budget: snapshot,
    veri: {
      jobs: jobs.data,
      deployments: deps.data,
      balanceUsd: balance.balance_usd,
      burn,
    },
    verifiedAt: new Date().toISOString(),
  };
  await saveJson(resolve("work/ml/reconciliation.json"), result);
  if (a.settle) {
    const id = String(a.settle),
      kind = String(a.kind),
      resource = String(a.resource);
    if (!resource || !["training", "deployment"].includes(kind))
      throw new Error(
        "Settlement requires --resource ID --kind training|deployment",
      );
    const state =
      kind === "training"
        ? await client.job(resource)
        : await client.deployment(resource);
    if (!["completed", "failed", "cancelled", "stopped"].includes(state.status))
      throw new Error("Resource not terminal; reservation retained");
    const cost = Number(
      kind === "training" ? state.cost_usd : state.total_cost_usd,
    );
    if (!Number.isFinite(cost) || cost <= 0)
      throw new Error(
        "No positive final cost evidence yet; reservation retained",
      );
    await budget.settle(
      id,
      usdToCentsCeil(cost),
      "Reconciled Veri terminal resource " + resource,
    );
  }
  // Never print unfiltered API responses containing signed download URLs or private logs.
  const final = await budget.snapshot();
  console.log(
    JSON.stringify(
      {
        balanceUsd: balance.balance_usd,
        budget: {
          capUsd: final.capUsd,
          spentUsd: final.spentUsd,
          reservedUsd: final.reservedUsd,
          availableUsd: final.availableCents / 100,
          entryCount: final.entries.length,
          states: final.entries.reduce(
            (out, entry) => {
              out[entry.state] = (out[entry.state] ?? 0) + 1;
              return out;
            },
            {} as Record<string, number>,
          ),
        },
        recordPath: "work/ml/reconciliation.json",
      },
      null,
      2,
    ),
  );
}
main().catch((error) => {
  console.error(publicError(error));
  process.exitCode = 1;
});
