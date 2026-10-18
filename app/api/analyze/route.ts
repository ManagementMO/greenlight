// Real intake: question + uploaded files → DecisionInput.
// Books are read by fixed code; the model reads the question and documents and returns quoted terms;
// the fine-tuned Qwen extractor (V5, on Veri) reads each later payment clause into typed conditions;
// Jev answers yes/no on whether each of those conditions has already happened in the documents;
// fixed code assembles the snapshot. The browser runs the engine on the returned input.
// Send `stream=1` in the form to get NDJSON progress events (AnalyzeEvent) as each stage finishes;
// the Thinking view draws them. Without it, the response is the final JSON as before.

import { AnthropicClient } from "@/lib/providers/anthropic";
import { anthropicCostUsd, JEV_INPUT_PER_MILLION_USD } from "@/lib/providers/pricing";
import { JevClient } from "@/lib/providers/jev";
import { atoms, combine, CONDITION_TEXT, clausesToRead, QWEN_REPO, readClauses, type QwenClause } from "@/lib/intake/qwen";
import { validateDecisionInput, type DecisionInput } from "@/lib/domain";
import { booksDigest, isBooksUpload, readBooks, type Books } from "@/lib/intake/books";
import { batches, checkCatalog, type JevCheck } from "@/lib/intake/checks";
import { buildSnapshot, conditionalReceipts, fallbackPlan, parsePlan, PLAN_SYSTEM, planPrompt, type ConditionCheck, type DocText, type JobPlan } from "@/lib/intake/plan";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_BYTES = 12 * 1024 * 1024;
const TEXT_LIMIT = 40_000;
const TEXT_EXT = /\.(txt|md|csv|tsv|eml|json|html?|xml|log)$/i;
const DEFAULT_MODEL = "claude-sonnet-4-6";

export type FileRoute = { name: string; route: "code" | "llm" | "skipped"; detail: string };
export type Routing = {
  files: FileRoute[];
  code: { records: number; detail: string } | null;
  llm: { model: string; inputTokens: number; outputTokens: number; costUsd: number; ms: number } | null;
  /** checks: payment conditions; catalog: every other judgment Jev made. calls: batched requests (16 questions each). */
  jev: { model: string; checks: ConditionCheck[]; catalog: JevCheck[]; questions: number; calls: number; inputTokens: number; costUsd: number; ms: number } | null;
  qwen: { model: string; clauses: QwenClause[]; ms: number } | null;
};

/** Progress events, in order. A later `file` event for the same name replaces the earlier one. */
export type AnalyzeEvent =
  | { type: "file"; file: FileRoute }
  | { type: "model_start"; model: string; documents: number }
  | { type: "model_done"; llm: NonNullable<Routing["llm"]>; plan: JobPlan }
  | { type: "model_skipped"; plan: JobPlan }
  | { type: "qwen_start"; model: string; clauses: { receipt: number; label: string }[] }
  | { type: "qwen_done"; qwen: NonNullable<Routing["qwen"]> }
  | { type: "qwen_skipped"; reason: string }
  | { type: "jev_start"; checks: { id: string; label: string; condition: string }[] }
  | { type: "jev_done"; jev: NonNullable<Routing["jev"]> }
  | { type: "jev_skipped"; reason: string }
  | { type: "built"; notes: string[]; events: number }
  | { type: "done"; input: DecisionInput; plan: JobPlan; routing: Routing }
  | { type: "error"; error: string; fields?: string[]; status: number };

type Final = Extract<AnalyzeEvent, { type: "done" | "error" }>;

async function analyze(question: string, files: File[], emit: (e: AnalyzeEvent) => void): Promise<Final> {
  const routes: FileRoute[] = [];
  const docs: DocText[] = [];
  const pdfs: string[] = [];
  let books: Books | null = null;
  const route = (r: FileRoute) => { routes.push(r); emit({ type: "file", file: r }); };

  for (const [i, f] of files.entries()) {
    const id = `doc-${i + 1}`;
    try {
      if (/\.json$/i.test(f.name)) {
        const text = await f.text();
        const value: unknown = JSON.parse(text);
        if (isBooksUpload(value)) {
          books = readBooks(value);
          route({ name: f.name, route: "code", detail: `Accounting books · ${books.recordCount.toLocaleString()} records read by fixed code` });
          continue;
        }
        docs.push({ id, name: f.name, text: text.slice(0, TEXT_LIMIT) });
        route({ name: f.name, route: "llm", detail: text.length > TEXT_LIMIT ? "JSON · first 40k characters read by the model" : "JSON · read by the model" });
      } else if (/\.pdf$/i.test(f.name) || f.type === "application/pdf") {
        pdfs.push(Buffer.from(await f.arrayBuffer()).toString("base64"));
        docs.push({ id, name: f.name, text: "", pdf: true });
        route({ name: f.name, route: "llm", detail: "PDF · read by the model" });
      } else if (TEXT_EXT.test(f.name) || f.type.startsWith("text/")) {
        const text = await f.text();
        docs.push({ id, name: f.name, text: text.slice(0, TEXT_LIMIT) });
        route({ name: f.name, route: "llm", detail: `${f.name.split(".").pop()?.toUpperCase()} · read by the model` });
      } else {
        route({ name: f.name, route: "skipped", detail: "This file type can't be read yet. Export it as PDF, CSV or text." });
      }
    } catch (e) {
      route({ name: f.name, route: "skipped", detail: e instanceof Error ? e.message : "Could not read this file." });
    }
  }

  // The model reads the question and documents. Without a key, a simple pattern match stands in.
  let plan: JobPlan;
  let llm: Routing["llm"] = null;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (apiKey) {
    const model = process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;
    const client = new AnthropicClient({ apiKey, workspaceId: process.env.ANTHROPIC_WORKSPACE_ID || undefined, model, timeoutMs: 90_000 });
    emit({ type: "model_start", model, documents: docs.length });
    const t0 = Date.now();
    try {
      const res = await client.message({ system: PLAN_SYSTEM, user: planPrompt(question, books ? booksDigest(books) : null, docs), maxTokens: 2048, pdfs });
      plan = parsePlan(res.text);
      llm = { model: res.model, inputTokens: res.usage.inputTokens, outputTokens: res.usage.outputTokens, costUsd: anthropicCostUsd(model, res.usage), ms: Date.now() - t0 };
      emit({ type: "model_done", llm, plan });
    } catch (e) {
      return { type: "error", error: `The model couldn't read your request: ${e instanceof Error ? e.message : "unknown error"}`, status: 502 };
    }
  } else {
    plan = fallbackPlan(question, books);
    routes.filter((r) => r.route === "llm").forEach((r) => {
      r.route = "skipped";
      r.detail = "No ANTHROPIC_API_KEY configured, so documents weren't read.";
      emit({ type: "file", file: r });
    });
    emit({ type: "model_skipped", plan });
  }

  // Qwen (our fine-tuned extractor) reads each later payment clause into typed conditions.
  const docId = (file: string | null) => docs.find((d) => d.name === file)?.id ?? docs[0]?.id ?? "question";
  let qwen: Routing["qwen"] = null;
  const toRead = clausesToRead(plan);
  const veriKey = process.env.VERI_API_KEY;
  const qwenDeployment = process.env.QWEN_DEPLOYMENT_ID;
  if (!toRead.length) emit({ type: "qwen_skipped", reason: "No payment clauses after the deposit to read" });
  else if (!veriKey || !qwenDeployment) emit({ type: "qwen_skipped", reason: "The fine-tuned Qwen extractor isn't deployed (no QWEN_DEPLOYMENT_ID), so Claude's reading of each clause is used" });
  else {
    emit({ type: "qwen_start", model: QWEN_REPO, clauses: toRead.map(({ l, i }) => ({ receipt: i, label: l.label })) });
    const t0 = Date.now();
    const clauses = await readClauses(plan, veriKey, qwenDeployment, docId);
    qwen = { model: QWEN_REPO, clauses, ms: Date.now() - t0 };
    emit({ type: "qwen_done", qwen });
  }

  // Jev checks each condition against the uploaded text: every typed condition Qwen found, or Claude's quoted
  // condition where Qwen couldn't read the clause. Conditions not found MET become cases where that payment is late.
  const conditions = conditionalReceipts(plan, qwen?.clauses ?? []);
  let checks: ConditionCheck[] = conditions.map((c) => ({ ...c, state: "UNCHECKED", confidence: null }));
  let jev: Routing["jev"] = null;
  const evidence = docs.filter((d) => d.text).map((d) => ({ id: d.id, companyId: "upload", jobId: "candidate-job", text: d.text.slice(0, 12_000) }));
  const triggerOf = (receipt: number) => qwen?.clauses.find((q) => q.receipt === receipt)?.trigger ?? null;
  const propositions = conditions.flatMap((c) => {
    const t = c.source === "qwen" ? triggerOf(c.receipt) : null;
    return t
      ? atoms(t).map((a, k) => ({ id: `${c.id}-${k}`, subject: `${plan.job.name} · ${c.label}`, statement: `This has already happened for ${plan.job.name}: ${CONDITION_TEXT[a.condition]}.` }))
      : [{ id: c.id, subject: `${plan.job.name} · ${c.label}`, statement: `This condition for the ${c.label} has already happened: ${c.condition}.` }];
  });
  // Every other judgment the decision needs (timing type, lateness, deposit, past-due invoices) also goes to Jev.
  const catalog = checkCatalog(plan, books, evidence.length > 0);
  let catalogChecks: JevCheck[] = catalog.map((c) => ({ ...c, state: "UNCHECKED", confidence: null }));
  const allPropositions = [...propositions, ...catalog.map(({ id, subject, statement }) => ({ id, subject, statement }))];
  const jevKey = process.env.TYPESAFE_API_KEY;
  if (!allPropositions.length) emit({ type: "jev_skipped", reason: "No documents to check against" });
  else if (!jevKey) emit({ type: "jev_skipped", reason: "No TYPESAFE_API_KEY configured, so nothing was checked" });
  else {
    emit({ type: "jev_start", checks: [
      ...conditions.map(({ id, label, condition }) => ({ id, label, condition })),
      ...catalog.map((c) => ({ id: c.id, label: c.question, condition: c.statement })),
    ] });
    const t0 = Date.now();
    try {
      const client = new JevClient({ apiKey: jevKey, timeoutMs: 30_000 });
      const results = await Promise.all(batches(allPropositions).map((b) =>
        client.judge({ snapshotVersion: "upload-1", companyId: "upload", jobId: "candidate-job", propositions: b, evidence })));
      const judgments = results.flatMap((r) => r.judgments);
      const answer = (id: string) => judgments.find((x) => x.propositionId === id);
      checks = conditions.map((c) => {
        const t = c.source === "qwen" ? triggerOf(c.receipt) : null;
        if (!t) {
          const j = answer(c.id);
          return { ...c, state: j?.state ?? "UNCHECKED", confidence: j?.confidence ?? null };
        }
        const list = atoms(t);
        const parts = list.map((a, k) => {
          const j = answer(`${c.id}-${k}`);
          return { condition: CONDITION_TEXT[a.condition], state: j?.state ?? "UNKNOWN", confidence: j?.confidence ?? null };
        });
        const state = combine(t, (a) => (parts[list.indexOf(a)]?.state ?? "UNKNOWN") as "MET" | "NOT_MET" | "UNKNOWN" | "CONFLICTING");
        const confs = parts.map((p) => p.confidence).filter((x): x is number => x != null);
        return { ...c, state, confidence: confs.length ? Math.min(...confs) : null, parts };
      });
      catalogChecks = catalog.map((c) => {
        const j = answer(c.id);
        return { ...c, state: j?.state ?? "UNCHECKED", confidence: j?.confidence ?? null };
      });
      const inputTokens = results.reduce((s, r) => s + r.usage.inputTokens, 0);
      jev = { model: results[0].model, checks, catalog: catalogChecks, questions: allPropositions.length, calls: results.length, inputTokens, costUsd: (inputTokens * JEV_INPUT_PER_MILLION_USD) / 1e6, ms: Date.now() - t0 };
      emit({ type: "jev_done", jev });
    } catch (e) {
      emit({ type: "jev_skipped", reason: `Jev call failed (${e instanceof Error ? e.message : "unknown error"}), so nothing was checked` });
    }
  }

  try {
    const { input, notes } = buildSnapshot({ question, books, docs, plan, checks, catalog: catalogChecks, today: new Date().toISOString().slice(0, 10) });
    const parsed = validateDecisionInput(input);
    if (!parsed.success)
      return { type: "error", error: "The assembled snapshot is invalid.", fields: parsed.error.issues.slice(0, 10).map((i) => `${i.path.join(".")}: ${i.message}`), status: 422 };
    emit({ type: "built", notes, events: parsed.data.commitments.length + parsed.data.job.events.length });
    const routing: Routing = {
      files: routes,
      code: books ? { records: books.recordCount, detail: `${books.openBills.length} unpaid bills, payroll and operating pace, ${books.receivables.length} open invoices, ${Object.keys(books.templates).length} past projects` } : null,
      llm,
      jev,
      qwen,
    };
    return { type: "done", input: parsed.data, plan, routing };
  } catch (e) {
    return { type: "error", error: e instanceof Error ? e.message : "Could not build the snapshot.", status: 422 };
  }
}

export async function POST(request: Request) {
  let form: FormData;
  try { form = await request.formData(); } catch { return Response.json({ error: "Send the question and files as a form upload." }, { status: 400 }); }
  const question = String(form.get("question") ?? "").trim().slice(0, 2000);
  if (!question) return Response.json({ error: "Ask a question first." }, { status: 400 });
  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (files.reduce((s, f) => s + f.size, 0) > MAX_BYTES) return Response.json({ error: "Uploads are limited to 12 MB in total." }, { status: 413 });

  if (form.get("stream") === "1") {
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (e: AnalyzeEvent) => controller.enqueue(encoder.encode(`${JSON.stringify(e)}\n`));
        try {
          send(await analyze(question, files, send));
        } catch (e) {
          send({ type: "error", error: e instanceof Error ? e.message : "Something went wrong reading your files.", status: 500 });
        }
        controller.close();
      },
    });
    return new Response(body, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" } });
  }

  const final = await analyze(question, files, () => {});
  if (final.type === "error") return Response.json({ error: final.error, ...(final.fields ? { fields: final.fields } : {}) }, { status: final.status });
  return Response.json({ input: final.input, plan: final.plan, routing: final.routing });
}
