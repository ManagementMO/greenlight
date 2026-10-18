/**
 * Collect raw model outputs. Resumable: finished cases are skipped.
 * Usage: npx tsx bench/run.ts <claude-direct|claude-extract-engine> <split> [--limit N]
 * (qwen-direct is collected by bench/serve-qwen.ts; gold-engine needs no model call.)
 */
import { existsSync, mkdirSync, readFileSync, appendFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvFile } from "node:process";
import type { BenchCase } from "./core";
import { claude, claudeModel } from "./llm";
import { SYSTEM, directPrompt, extractPrompt } from "./prompts";
import type { ArmId, RawRecord } from "./arms";

if (existsSync(resolve(".env"))) loadEnvFile(resolve(".env"));
export const loadCases = (split: string): BenchCase[] =>
  readFileSync(resolve("bench/data", `${split}.jsonl`), "utf8").trim().split("\n").map((l) => JSON.parse(l));
export const resultsPath = (arm: string, split: string) => resolve("bench/results", `${arm}.${split}.jsonl`);

async function main() {
  const [arm, split, ...rest] = process.argv.slice(2) as [ArmId, string, ...string[]];
  if (!["claude-direct", "claude-extract-engine"].includes(arm) || !split) throw new Error("usage: run.ts <claude-direct|claude-extract-engine> <split> [--limit N]");
  const limit = rest[0] === "--limit" ? Number(rest[1]) : Infinity;
  mkdirSync(resolve("bench/results"), { recursive: true });
  const path = resultsPath(arm, split);
  const done = new Set(existsSync(path) ? readFileSync(path, "utf8").trim().split("\n").filter(Boolean).map((l) => (JSON.parse(l) as RawRecord).caseId) : []);
  const todo = loadCases(split).filter((c) => !done.has(c.id)).slice(0, limit);
  console.log(`${arm}/${split}: ${todo.length} to run (model ${claudeModel()})`);
  let next = 0, spent = 0;
  const worker = async () => {
    while (next < todo.length) {
      const c = todo[next++];
      let rec: RawRecord;
      try {
        const out = await claude(SYSTEM, arm === "claude-direct" ? directPrompt(c) : extractPrompt(c), arm === "claude-direct" ? 1500 : 1800);
        rec = { caseId: c.id, arm, raw: out.text, latencyMs: out.latencyMs, inputTokens: out.inputTokens, outputTokens: out.outputTokens, costUsd: out.costUsd, model: out.model };
        spent += out.costUsd;
      } catch (e) {
        rec = { caseId: c.id, arm, raw: "", latencyMs: 0, inputTokens: 0, outputTokens: 0, costUsd: 0, model: claudeModel(), error: (e as Error).message };
      }
      appendFileSync(path, JSON.stringify(rec) + "\n");
      console.log(`  ${c.id} ${rec.error ?? "ok"} ${rec.latencyMs.toFixed(0)}ms $${spent.toFixed(3)} total`);
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
}
if (process.argv[1]?.endsWith("run.ts")) main();
