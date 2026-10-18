import { ANTHROPIC_RATES } from "../lib/providers/pricing";

export interface LlmResult { text: string; latencyMs: number; inputTokens: number; outputTokens: number; costUsd: number; model: string }
export const claudeModel = () => process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";

/** One Anthropic call at temperature 0. No retries on paid failures except one for 429/5xx. */
export async function claude(system: string, user: string, maxTokens = 1500): Promise<LlmResult> {
  const model = claudeModel();
  const rates = ANTHROPIC_RATES[model];
  if (!rates) throw new Error(`No verified pricing for ${model}`);
  const body = JSON.stringify({ model, max_tokens: maxTokens, temperature: 0, system, messages: [{ role: "user", content: user }] });
  for (let attempt = 0; ; attempt++) {
    const t = performance.now();
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
        "anthropic-version": "2023-06-01",
        ...(process.env.ANTHROPIC_WORKSPACE_ID ? { "anthropic-workspace-id": process.env.ANTHROPIC_WORKSPACE_ID } : {}),
      },
      body,
      signal: AbortSignal.timeout(120_000),
    });
    if (!res.ok) {
      if (attempt === 0 && (res.status === 429 || res.status >= 500)) { await new Promise((r) => setTimeout(r, 3000)); continue; }
      throw new Error(`Anthropic HTTP ${res.status}`);
    }
    const j = (await res.json()) as { content: { type: string; text?: string }[]; usage: { input_tokens: number; output_tokens: number } };
    const latencyMs = performance.now() - t;
    return {
      text: j.content.filter((c) => c.type === "text").map((c) => c.text).join(""),
      latencyMs, model,
      inputTokens: j.usage.input_tokens, outputTokens: j.usage.output_tokens,
      costUsd: (j.usage.input_tokens * rates.inputPerMillionUsd + j.usage.output_tokens * rates.outputPerMillionUsd) / 1e6,
    };
  }
}

/** First balanced JSON object in a string, or null. */
export function firstJson(text: string): unknown | null {
  const start = text.indexOf("{");
  if (start < 0) return null;
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inStr) { if (esc) esc = false; else if (ch === "\\") esc = true; else if (ch === '"') inStr = false; continue; }
    if (ch === '"') inStr = true;
    else if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) { try { return JSON.parse(text.slice(start, i + 1)); } catch { return null; } }
  }
  return null;
}
