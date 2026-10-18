/** Score every arm on the given splits and write bench/results/REPORT.md. Usage: npx tsx bench/report.ts dev [test heldout] */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { ARMS, ArmId, RawRecord, answerFor } from "./arms";
import { loadCases, resultsPath } from "./run";

const pct = (a: number, b: number) => (b ? `${((100 * a) / b).toFixed(0)}% (${a}/${b})` : "n/a");
const q = (xs: number[], p: number) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.round((p / 100) * (s.length - 1)))] : NaN; };

function load(arm: ArmId, split: string): Map<string, RawRecord> | null {
  const p = resultsPath(arm, split);
  if (!existsSync(p)) return null;
  return new Map(readFileSync(p, "utf8").trim().split("\n").filter(Boolean).map((l) => { const r = JSON.parse(l) as RawRecord; return [r.caseId, r]; }));
}

function score(arm: ArmId, split: string) {
  const cases = loadCases(split);
  const recs = arm === "gold-engine" ? new Map<string, RawRecord>() : load(arm, split);
  if (!recs) return null;
  let n = 0, valid = 0, statusOk = 0, falseSafe = 0, notSafe = 0, falseResolved = 0, needs = 0, minOk = 0, crit = 0;
  const byStatus: Record<string, [number, number]> = {};
  const lat: number[] = []; let cost = 0, tokensIn = 0, tokensOut = 0;
  for (const c of cases) {
    const rec = recs.get(c.id);
    if (arm !== "gold-engine" && !rec) continue;
    n++;
    const { answer, extraMs } = answerFor(arm, c, rec?.raw);
    if (rec) { lat.push(rec.latencyMs + extraMs); cost += rec.costUsd; tokensIn += rec.inputTokens; tokensOut += rec.outputTokens; } else lat.push(extraMs);
    const exp = c.expected;
    const slot = (byStatus[exp.status] ??= [0, 0]); slot[1]++;
    if (exp.status !== "SUPPORTED") notSafe++;
    if (exp.status === "NEEDS_INPUT") needs++;
    if (!answer) continue; // invalid output counts as wrong everywhere
    valid++;
    if (answer.status === exp.status) { statusOk++; slot[0]++; }
    if (answer.status === "SUPPORTED" && exp.status !== "SUPPORTED") falseSafe++;
    if (exp.status === "NEEDS_INPUT" && (answer.status === "SUPPORTED" || answer.status === "SHORTFALL")) falseResolved++;
    if (exp.worstMinCash !== null) { if (answer.worstMinCash !== null && Math.abs(answer.worstMinCash - exp.worstMinCash) < 0.5) minOk++; }
    if (exp.status === "CONDITIONAL" || exp.status === "NEEDS_INPUT") { if (exp.criticalItems.length ? exp.criticalItems.includes(answer.criticalItem) : answer.criticalItem === "none") crit++; }
  }
  // minDen / critDen are over ALL expected cases, so invalid outputs count as misses.
  const seen = cases.filter((c) => arm === "gold-engine" || recs.has(c.id));
  const denMin = seen.filter((c) => c.expected.worstMinCash !== null).length;
  const denCrit = seen.filter((c) => c.expected.status === "CONDITIONAL" || c.expected.status === "NEEDS_INPUT").length;
  return { n, valid, statusOk, falseSafe, notSafe, falseResolved, needs, minOk, denMin, crit, denCrit, byStatus, p50: q(lat, 50), p95: q(lat, 95), cost, perCase: n ? cost / n : 0, tokensIn, tokensOut };
}

const splits = process.argv.slice(2).length ? process.argv.slice(2) : ["dev"];
const out: string[] = [`# Greenlight benchmark report\n\nConstructed cases. Ground truth is an independent oracle (bench/core.ts), checked against the engine by bench/check-oracle.ts. Invalid or missing output counts as wrong.\n`];
for (const split of splits) {
  out.push(`## ${split}\n`, "| Arm | Valid output | Status correct | False-safe | Verdict on NEEDS_INPUT case | Min-cash exact | Critical item | p50 / p95 latency | Cost / case |", "|---|---|---|---|---|---|---|---|---|");
  for (const arm of Object.keys(ARMS) as ArmId[]) {
    const s = score(arm, split);
    if (!s) { out.push(`| ${ARMS[arm]} | not run | | | | | | | |`); continue; }
    out.push(`| ${ARMS[arm]} | ${pct(s.valid, s.n)} | ${pct(s.statusOk, s.n)} | ${pct(s.falseSafe, s.notSafe)} | ${pct(s.falseResolved, s.needs)} | ${pct(s.minOk, s.denMin)} | ${pct(s.crit, s.denCrit)} | ${(s.p50 / 1000).toFixed(2)}s / ${(s.p95 / 1000).toFixed(2)}s | ${s.perCase ? "$" + s.perCase.toFixed(4) : "$0"} |`);
  }
  out.push("", "Columns: false-safe = said SUPPORTED when the truth was not, out of all not-SUPPORTED cases. Verdict on NEEDS_INPUT = gave a definite SUPPORTED/SHORTFALL verdict when evidence was missing. Min-cash exact is over cases with a computable minimum.", "");
}
out.push("## Speed and cost: Claude vs Claude + Jev (all splits)\n");
{
  const rows: { a: RawRecord; e: RawRecord }[] = [];
  for (const split of splits) {
    const a = load("claude-direct", split), e = load("claude-jev", split);
    if (a && e) for (const [id, ar] of a) { const er = e.get(id); if (er && !ar.error && !er.error) rows.push({ a: ar, e: er }); }
  }
  if (rows.length) {
    const mean = (xs: number[]) => xs.reduce((x, y) => x + y, 0) / xs.length;
    const aL = rows.map((r) => r.a.latencyMs), eL = rows.map((r) => r.e.latencyMs);
    const jL = rows.map((r) => r.e.latencyMs - r.a.latencyMs), jC = rows.map((r) => r.e.costUsd - r.a.costUsd);
    const aC = rows.map((r) => r.a.costUsd), eC = rows.map((r) => r.e.costUsd);
    out.push(`n = ${rows.length} cases. Accuracy of both is identical (Jev's judgments are attached, Claude's answer is unchanged).\n`,
      "| Pipeline | p50 latency | p95 latency | mean latency | cost / case | cost / 1,000 cases |", "|---|---|---|---|---|---|",
      `| Claude alone | ${(q(aL, 50) / 1000).toFixed(2)}s | ${(q(aL, 95) / 1000).toFixed(2)}s | ${(mean(aL) / 1000).toFixed(2)}s | $${mean(aC).toFixed(5)} | $${(mean(aC) * 1000).toFixed(2)} |`,
      `| Claude + Jev | ${(q(eL, 50) / 1000).toFixed(2)}s | ${(q(eL, 95) / 1000).toFixed(2)}s | ${(mean(eL) / 1000).toFixed(2)}s | $${mean(eC).toFixed(5)} | $${(mean(eC) * 1000).toFixed(2)} |`,
      `| Jev alone (the added step) | ${(q(jL, 50) / 1000).toFixed(3)}s | ${(q(jL, 95) / 1000).toFixed(3)}s | ${(mean(jL) / 1000).toFixed(3)}s | $${mean(jC).toFixed(6)} | $${(mean(jC) * 1000).toFixed(3)} |`,
      "", `Jev adds ${((100 * mean(jL)) / mean(aL)).toFixed(1)}% latency and ${((100 * mean(jC)) / mean(aC)).toFixed(2)}% cost on top of Claude. A Jev call is ${(mean(aL) / mean(jL)).toFixed(0)}x faster and ${(mean(aC) / mean(jC)).toFixed(0)}x cheaper than one Claude reasoning call, but it answers a different, narrower question (one proposition against evidence), so this is not an accuracy-equal substitute.`, "");
  } else out.push("Run `npx tsx bench/run-jev.ts <split>` first.", "");
}
const text = out.join("\n");
writeFileSync(resolve("bench/results/REPORT.md"), text + "\n");
console.log(text);
