/**
 * Base Qwen3-4B-Instruct-2507 (no fine-tune) run locally through Ollama. Nothing is deployed anywhere.
 *   qwen-local-direct : Qwen reads the documents and answers (same prompt as the Claude arm A).
 *   qwen-local-jev    : Qwen reads the documents and writes a short numeric note; Jev outputs the verdict
 *                       (and the critical item) from the documents plus that note.
 * Sequential on purpose, so latency is per case. Usage: npx tsx bench/local-qwen.ts <direct|jev> <split> [--limit N]
 * Local cost is $0 marginal (electricity not counted); latency is specific to this machine and 4-bit weights.
 */
import { existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvFile } from "node:process";
import { loadCases, resultsPath } from "./run";
import { SYSTEM, directPrompt } from "./prompts";
import { JEV_INPUT_PER_MILLION_USD } from "../lib/providers/pricing";
import { VERDICT_CRITERIA } from "./jev-direct";
import { firstJson } from "./llm";
import type { BenchCase } from "./core";
import type { RawRecord } from "./arms";
if (existsSync(resolve(".env"))) loadEnvFile(resolve(".env"));

export const OLLAMA_MODEL = process.env.QWEN_LOCAL_MODEL ?? "qwen3:4b-instruct-2507-q4_K_M";

export async function qwen(user: string, numPredict: number, system = SYSTEM) {
  const t = performance.now();
  const res = await fetch("http://127.0.0.1:11434/api/chat", {
    method: "POST",
    body: JSON.stringify({ model: OLLAMA_MODEL, stream: false, keep_alive: "30m", options: { temperature: 0, num_ctx: 4096, num_predict: numPredict },
      messages: [{ role: "system", content: system }, { role: "user", content: user }] }),
    signal: AbortSignal.timeout(300_000),
  });
  if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`);
  const j = (await res.json()) as { message: { content: string }; prompt_eval_count?: number; eval_count?: number };
  return { text: j.message.content, ms: performance.now() - t, inTok: j.prompt_eval_count ?? 0, outTok: j.eval_count ?? 0 };
}

export function notePrompt(c: BenchCase) {
  return `Read the documents and report numbers only. Do not give a verdict.

DOCUMENTS
${c.documents}

OPEN ITEMS
${c.items.map((i) => `- ${i.id}: ${i.question}`).join("\n") || "- (none)"}

Method: start from the settled cash balance. Apply every dated cash movement in date order (payments out before payments in on the same date). Each open item with stated possibilities can resolve any of those ways. Minimum cash is the lowest balance reached, including the starting balance.

Return JSON only: {"reserveUsd": <number>, "worstCaseMinimumCashUsd": <lowest minimum cash over all combinations>, "bestCaseMinimumCashUsd": <highest minimum cash over all combinations>, "unknownItems": [<ids of open items with NO stated possibilities: unknown amount or disputed fact>]}`;
}

async function jevVerdict(c: BenchCase, note: string) {
  const evidence = [...c.documents.split("\n"), `ANALYST NOTE (numbers computed from the documents): ${note}`].map((text, i) => ({ id: `doc-${i + 1}`, text }));
  const ids = c.items.map((i) => i.id);
  const body = {
    model: "jev-1.14.0",
    state: { jobId: c.id, evidence },
    questions: {
      verdict: {
        type: "choice",
        instructions: { task: "Use the ANALYST NOTE. NEEDS_INPUT if it lists any unknown item. Otherwise SUPPORTED if the worst-case minimum cash is at least the reserve; SHORTFALL if even the best-case minimum cash is below the reserve; CONDITIONAL if the worst case is below the reserve and the best case is at or above it.", proposition: "Which verdict applies to taking this job without cash falling below the reserve?" },
        criteria: VERDICT_CRITERIA,
      },
      critical: {
        type: "choice",
        instructions: { task: "Pick the open item whose answer would decide whether the reserve holds, or the unknown item that blocks a verdict. Pick none when no single open item decides it.", proposition: "Which open item is critical?" },
        criteria: { none: "No single open item decides the outcome.", ...Object.fromEntries(c.items.map((i) => [i.id, i.question])) },
      },
    },
  };
  void ids;
  const t = performance.now();
  const res = await fetch("https://api.typesafe.ai/v1/systemone", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + process.env.TYPESAFE_API_KEY }, body: JSON.stringify(body), signal: AbortSignal.timeout(60000) });
  const text = await res.text();
  if (!res.ok) throw new Error(`Jev HTTP ${res.status}: ${text.slice(0, 160)}`);
  const j = JSON.parse(text);
  return { status: j.answers.verdict.choice as string, critical: j.answers.critical.choice as string, ms: performance.now() - t, inTok: j.usage.input_tokens as number, outTok: j.usage.output_tokens as number };
}

async function main() {
  const [mode, split, ...rest] = process.argv.slice(2);
  if (!["direct", "jev"].includes(mode) || !split) throw new Error("usage: local-qwen.ts <direct|jev> <split> [--limit N]");
  const limit = rest[0] === "--limit" ? Number(rest[1]) : Infinity;
  const arm = mode === "direct" ? "qwen-local-direct" : "qwen-local-jev";
  const path = resultsPath(arm, split);
  const done = new Map<string, RawRecord>(existsSync(path) ? readFileSync(path, "utf8").trim().split("\n").filter(Boolean).map((l) => { const r = JSON.parse(l) as RawRecord; return [r.caseId, r]; }) : []);
  mkdirSync(resolve("bench/results"), { recursive: true });
  for (const c of loadCases(split).slice(0, limit)) {
    if (done.has(c.id) && !done.get(c.id)!.error) continue;
    let rec: RawRecord;
    try {
      if (mode === "direct") {
        const q = await qwen(directPrompt(c), 1200);
        rec = { caseId: c.id, arm: arm as any, raw: q.text, latencyMs: q.ms, inputTokens: q.inTok, outputTokens: q.outTok, costUsd: 0, model: OLLAMA_MODEL };
      } else {
        const q = await qwen(notePrompt(c), 400);
        const note = JSON.stringify(firstJson(q.text) ?? { unparsed: q.text.slice(0, 200) });
        const v = await jevVerdict(c, note);
        const parsed = firstJson(q.text) as { worstCaseMinimumCashUsd?: unknown } | null;
        const worst = typeof parsed?.worstCaseMinimumCashUsd === "number" ? parsed.worstCaseMinimumCashUsd : null;
        rec = { caseId: c.id, arm: arm as any, raw: JSON.stringify({ status: v.status, worstCaseMinimumCashUsd: v.status === "NEEDS_INPUT" ? null : worst, criticalItem: v.critical, note }),
          latencyMs: q.ms + v.ms, inputTokens: q.inTok + v.inTok, outputTokens: q.outTok + v.outTok, costUsd: (v.inTok * JEV_INPUT_PER_MILLION_USD) / 1e6, model: `${OLLAMA_MODEL}+jev-1.14.0` };
      }
    } catch (e) {
      rec = { caseId: c.id, arm: arm as any, raw: "", latencyMs: 0, inputTokens: 0, outputTokens: 0, costUsd: 0, model: OLLAMA_MODEL, error: (e as Error).message };
    }
    done.set(c.id, rec);
    writeFileSync(path, [...done.values()].map((r) => JSON.stringify(r)).join("\n") + "\n");
    console.log(`${arm}/${c.id} ${rec.error ?? "ok"} ${(rec.latencyMs / 1000).toFixed(1)}s`);
  }
}
if (process.argv[1]?.endsWith("local-qwen.ts")) main().catch((e) => { console.error(e.message); process.exitCode = 1; });
