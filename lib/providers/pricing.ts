import { usdToCentsCeil } from "../budget/ledger";
export const PRICING_VERIFIED_AT = "2026-10-17";
export const ANTHROPIC_RATES: Record<
  string,
  { inputPerMillionUsd: number; outputPerMillionUsd: number }
> = {
  "claude-sonnet-4-6": { inputPerMillionUsd: 3, outputPerMillionUsd: 15 },
  "claude-haiku-4-5": { inputPerMillionUsd: 1, outputPerMillionUsd: 5 },
  "claude-haiku-4-5-20251001": {
    inputPerMillionUsd: 1,
    outputPerMillionUsd: 5,
  },
};
export const JEV_INPUT_PER_MILLION_USD = 0.042;
export const PRICING_SOURCES = {
  anthropic: "https://platform.claude.com/docs/en/about-claude/pricing",
  jev: "https://docs.typesafe.ai/models",
  veri: "https://docs.veri.studio/billing",
};
export function anthropicCostCents(
  model: string,
  usage: { inputTokens: number; outputTokens: number },
) {
  const rates = ANTHROPIC_RATES[model];
  if (!rates)
    throw new Error("Unverified Anthropic pricing; paid call refused");
  return usdToCentsCeil(
    (usage.inputTokens * rates.inputPerMillionUsd +
      usage.outputTokens * rates.outputPerMillionUsd) /
      1e6,
  );
}
/** Exact cost in dollars (not rounded up to a cent), for showing on the page. Budgets use anthropicCostCents. */
export function anthropicCostUsd(model: string, usage: { inputTokens: number; outputTokens: number }) {
  const rates = ANTHROPIC_RATES[model];
  if (!rates) throw new Error("Unverified Anthropic pricing; paid call refused");
  return (usage.inputTokens * rates.inputPerMillionUsd + usage.outputTokens * rates.outputPerMillionUsd) / 1e6;
}
export function anthropicMaximumCents(
  model: string,
  system: string,
  user: string,
  maxTokens: number,
) {
  // Byte count safely bounds tokenized text plus a conservative message-envelope allowance.
  return Math.max(
    1,
    anthropicCostCents(model, {
      inputTokens: Buffer.byteLength(system + user, "utf8") + 1024,
      outputTokens: maxTokens,
    }),
  );
}
export function jevCostCents(inputTokens: number) {
  return usdToCentsCeil((inputTokens * JEV_INPUT_PER_MILLION_USD) / 1e6);
}
