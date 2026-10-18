/** Jev as the answerer: one 4-way choice question (the verdict) over the documents. Usage: npx tsx bench/jev-direct.ts <split> [--limit N] */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvFile } from "node:process";
import { loadCases, resultsPath } from "./run";
import { JEV_INPUT_PER_MILLION_USD } from "../lib/providers/pricing";
import type { RawRecord } from "./arms";
if (existsSync(resolve(".env"))) loadEnvFile(resolve(".env"));

export const VERDICT_CRITERIA = {
  SUPPORTED: "Every combination of the stated possibilities keeps minimum cash at or above the reserve.",
  SHORTFALL: "No combination of the stated possibilities keeps minimum cash at or above the reserve.",
  CONDITIONAL: "Some combinations keep minimum cash at or above the reserve and others do not.",
  NEEDS_INPUT: "A needed amount or condition is unknown, disputed or unconfirmed, so no verdict can be given.",
};
export function jevBody(documents: string, caseId: string, model = "jev-1.14.0") {
  return {
    model,
    state: { jobId: caseId, evidence: documents.split("\n").map((text, i) => ({ id: `doc-${i + 1}`, text })) },
    questions: {
      verdict: {
        type: "choice",
        instructions: {
          task: "Starting from the settled cash balance, apply every dated cash movement in date order (payments out before payments in on the same date). Each uncertain item can resolve any of its stated ways. Decide which verdict applies to whether the company can take this job without cash falling below the reserve.",
          proposition: "Can the company take this job without cash falling below the reserve?",
        },
        criteria: VERDICT_CRITERIA,
      },
    },
  };
}
async function main() {
  const split = process.argv[2], limit = process.argv[3] === "--limit" ? Number(process.argv[4]) : Infinity;
  const cases = loadCases(split).slice(0, limit);
  const out: RawRecord[] = [];
  let next = 0;
  const worker = async () => {
    while (next < cases.length) {
      const c = cases[next++], t = performance.now();
      try {
        const res = await fetch("https://api.typesafe.ai/v1/systemone", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + process.env.TYPESAFE_API_KEY }, body: JSON.stringify(jevBody(c.documents, c.id)), signal: AbortSignal.timeout(60000) });
        const text = await res.text();
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
        const j = JSON.parse(text);
        const a = j.answers.verdict;
        out.push({ caseId: c.id, arm: "jev-direct" as any, raw: JSON.stringify({ status: a.choice, worstCaseMinimumCashUsd: null, criticalItem: "none", confidence: a.confidence }), latencyMs: performance.now() - t, inputTokens: j.usage.input_tokens, outputTokens: j.usage.output_tokens, costUsd: (j.usage.input_tokens * JEV_INPUT_PER_MILLION_USD) / 1e6, model: j.model });
      } catch (e) {
        out.push({ caseId: c.id, arm: "jev-direct" as any, raw: "", latencyMs: performance.now() - t, inputTokens: 0, outputTokens: 0, costUsd: 0, model: "jev-1.14.0", error: (e as Error).message });
      }
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
  out.sort((x, y) => x.caseId.localeCompare(y.caseId));
  mkdirSync(resolve("bench/results"), { recursive: true });
  writeFileSync(resultsPath("jev-direct", split), out.map((r) => JSON.stringify(r)).join("\n") + "\n");
  const errs = out.filter((r) => r.error);
  console.log(`${split}: ${out.length} cases, ${errs.length} errors`, errs[0]?.error ?? "");
}
if (process.argv[1]?.endsWith("jev-direct.ts")) main();
