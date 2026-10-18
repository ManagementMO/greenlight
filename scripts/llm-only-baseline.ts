// One LLM doing everything: the same extraction call Headroom makes, plus the same yes/no questions Jev
// answered, in a single Claude call. Records tokens, time, cost and agreement with Jev so the answer page can
// compare against a measured number instead of a guess.
//
//   npx tsx scripts/llm-only-baseline.ts <saved /api/analyze response.json>
//
// Reads the demo files below, writes data/artifacts/llm-only-baseline.json. Makes one paid Claude call (~$0.03).

import { readFileSync, writeFileSync } from "node:fs";
import { AnthropicClient } from "../lib/providers/anthropic";
import { anthropicCostUsd } from "../lib/providers/pricing";
import { booksDigest, readBooks } from "../lib/intake/books";
import { PLAN_SYSTEM, planPrompt, type DocText } from "../lib/intake/plan";

const QUESTION = "Can we take the Harbor Lane Dental renovation and still keep $20,000 in the bank?";
const FILES = ["happy-path/1-harbor-lane-renovation.txt", "happy-path/3-harbor-lane-email.eml", "happy-path/4-novotny-email.eml"];
const BOOKS = "demo-files/Birchfield_Custom_Homes_Greenlight_Upload.json";
const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";

type Q = { id: string; statement: string; jev: string };

async function main() {
  const saved = JSON.parse(readFileSync(process.argv[2], "utf8"));
  const jev = saved.routing.jev;
  const questions: Q[] = [
    ...jev.checks.map((c: { id: string; condition: string; state: string }) => ({ id: c.id, statement: `This condition has already happened: ${c.condition}.`, jev: c.state })),
    ...jev.catalog.map((c: { id: string; statement: string; state: string }) => ({ id: c.id, statement: c.statement, jev: c.state })),
  ];
  const docs: DocText[] = FILES.map((f, i) => ({ id: `doc-${i + 1}`, name: f.split("/").pop()!, text: readFileSync(`demo-files/${f}`, "utf8") }));
  const books = readBooks(JSON.parse(readFileSync(BOOKS, "utf8")));

  const user = `${planPrompt(QUESTION, booksDigest(books), docs)}

Also judge each statement below against the documents. Add a "judgments" array to the same JSON object:
[{ "id": "<id>", "state": "MET" | "NOT_MET" | "UNKNOWN" | "CONFLICTING" }]. UNKNOWN when the documents don't say.
${questions.map((q) => `- ${q.id}: ${q.statement}`).join("\n")}`;

  const client = new AnthropicClient({ apiKey: process.env.ANTHROPIC_API_KEY!, model: MODEL, timeoutMs: 120_000 });
  const t0 = Date.now();
  const res = await client.message({ system: PLAN_SYSTEM, user, maxTokens: 4096 });
  const ms = Date.now() - t0;
  const body = res.text.slice(res.text.indexOf("{"), res.text.lastIndexOf("}") + 1);
  const judgments: { id: string; state: string }[] = JSON.parse(body).judgments ?? [];
  const rows = questions.map((q) => ({ id: q.id, jev: q.jev, llm: judgments.find((j) => j.id === q.id)?.state ?? "MISSING" }));
  const agree = rows.filter((r) => r.jev === r.llm).length;

  const out = {
    generatedAt: new Date().toISOString(),
    model: res.model,
    question: QUESTION,
    files: [BOOKS.split("/").pop(), ...FILES],
    questions: questions.length,
    inputTokens: res.usage.inputTokens,
    outputTokens: res.usage.outputTokens,
    costUsd: anthropicCostUsd(MODEL, res.usage),
    ms,
    agreeWithJev: agree,
    rows,
    headroom: { llm: saved.routing.llm, jev: { questions: jev.questions, calls: jev.calls, costUsd: jev.costUsd, ms: jev.ms } },
    note: "One measured run on the happy-path demo files, not a benchmark. Same documents, same questions, same extraction prompt.",
  };
  writeFileSync("data/artifacts/llm-only-baseline.json", JSON.stringify(out, null, 2) + "\n");
  console.log(`LLM only: ${out.inputTokens} in / ${out.outputTokens} out · $${out.costUsd.toFixed(4)} · ${ms} ms · agrees with Jev on ${agree}/${questions.length}`);
  for (const r of rows.filter((r) => r.jev !== r.llm)) console.log(`  differs: ${r.id} jev=${r.jev} llm=${r.llm}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
