/**
 * Arm E: Claude + Jev, measured as a stacked pipeline. Jev judges every open item (one uniform proposition,
 * judgments attached for audit) and Claude's arm-A answer is returned unchanged, so accuracy equals arm A and
 * this arm isolates Jev's speed and cost overhead. Claude's time and cost are reused from the recorded arm-A call.
 *
 * A gate that skips the LLM when Jev reports an unresolved item was tried on dev and abandoned: with a generic,
 * label-free proposition Jev flagged 38 of 40 cases (only 10 are blocked). Enable it with JEV_GATE=1 to reproduce.
 * Usage: npx tsx bench/run-jev.ts <split>    (needs claude-direct.<split>.jsonl first)
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvFile } from "node:process";
import { JevClient } from "../lib/providers/jev";
import { JEV_INPUT_PER_MILLION_USD } from "../lib/providers/pricing";
import { loadCases, resultsPath } from "./run";
import type { RawRecord } from "./arms";

if (existsSync(resolve(".env"))) loadEnvFile(resolve(".env"));
export const JEV_MODEL = "jev-1.14.0";
const BLOCKING = new Set(["UNKNOWN", "CONFLICTING", "NOT_MET"]);

async function main() {
  const split = process.argv[2];
  if (!split) throw new Error("usage: run-jev.ts <split>");
  const aPath = resultsPath("claude-direct", split);
  if (!existsSync(aPath)) throw new Error("run claude-direct first");
  const a = new Map(readFileSync(aPath, "utf8").trim().split("\n").map((l) => { const r = JSON.parse(l) as RawRecord; return [r.caseId, r]; }));
  const jev = new JevClient({ apiKey: process.env.TYPESAFE_API_KEY ?? "", model: JEV_MODEL, timeoutMs: 60000 });
  const cases = loadCases(split);
  const out: RawRecord[] = [];
  let next = 0, spent = 0, gated = 0;
  const worker = async () => {
    while (next < cases.length) {
      const c = cases[next++], base = a.get(c.id);
      const evidence = c.documents.split("\n").map((text, i) => ({ id: `doc-${i + 1}`, companyId: "bench", jobId: c.id, text }));
      const propositions = c.items.map((i) => ({
        id: i.id, subject: i.id,
        statement: `The evidence states a definite, undisputed value, or an explicit finite set of alternatives, for this question: ${i.question}`,
      }));
      const t = performance.now();
      let rec: RawRecord;
      try {
        if (!propositions.length) throw new Error("no open items");
        const j = await jev.judge({ snapshotVersion: "bench-v1", companyId: "bench", jobId: c.id, propositions, evidence });
        const jevMs = performance.now() - t, jevCost = (j.usage.inputTokens * JEV_INPUT_PER_MILLION_USD) / 1e6;
        const blocked = process.env.JEV_GATE === "1" ? j.judgments.find((x) => BLOCKING.has(x.state)) : undefined;
        spent += jevCost;
        if (blocked) {
          gated++;
          rec = { caseId: c.id, arm: "claude-jev" as any, latencyMs: jevMs, inputTokens: j.usage.inputTokens, outputTokens: j.usage.outputTokens, costUsd: jevCost, model: j.model,
            raw: JSON.stringify({ reasoning: `Jev: ${blocked.propositionId} is ${blocked.state}`, status: "NEEDS_INPUT", worstCaseMinimumCashUsd: null, criticalItem: blocked.propositionId }) };
        } else if (base && !base.error) {
          rec = { ...base, arm: "claude-jev" as any, latencyMs: jevMs + base.latencyMs, inputTokens: base.inputTokens + j.usage.inputTokens, outputTokens: base.outputTokens + j.usage.outputTokens, costUsd: base.costUsd + jevCost, model: `${j.model}+${base.model}` };
        } else throw new Error("no arm-A reply to reuse");
      } catch (e) {
        // A Jev failure must not look like a free answer: fall back to the full arm-A path, charging the time spent.
        const ms = performance.now() - t;
        rec = base && !base.error
          ? { ...base, arm: "claude-jev" as any, latencyMs: ms + base.latencyMs, model: `jev-failed+${base.model}`, error: undefined }
          : { caseId: c.id, arm: "claude-jev" as any, raw: "", latencyMs: ms, inputTokens: 0, outputTokens: 0, costUsd: 0, model: JEV_MODEL, error: (e as Error).message };
      }
      out.push(rec);
      console.log(`  ${c.id} ${rec.model.startsWith("jev-1") && !rec.model.includes("+") ? "GATED" : "llm"} ${rec.latencyMs.toFixed(0)}ms`);
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
  out.sort((x, y) => x.caseId.localeCompare(y.caseId));
  mkdirSync(resolve("bench/results"), { recursive: true });
  writeFileSync(resultsPath("claude-jev", split), out.map((r) => JSON.stringify(r)).join("\n") + "\n");
  console.log(`${split}: ${gated}/${cases.length} gated by Jev (gate off unless JEV_GATE=1), Jev spend $${spent.toFixed(5)}`);
}
main().catch((e) => { console.error(e.message); process.exitCode = 1; });
