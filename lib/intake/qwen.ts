// Live use of the fine-tuned extractor (Qwen3-4B, V5, served on Veri) inside the intake.
// Claude reads the whole document set into a JobPlan; Qwen then reads each payment clause after the deposit
// into typed conditions (the six CONDITIONS, joined by ALL/ANY) that Jev checks one by one.
// Every Qwen output is validated; anything invalid falls back to Claude's reading of that clause.
// V5 did not pass its release gate (14 confidently wrong of 48 held-out clauses), so the UI labels it as such.

import { CONDITIONS, parseExtraction, type ExtractionContext, type Trigger } from "@/lib/providers/extraction";
import { extractionPromptV5 } from "@/lib/providers/extraction-v5";
import { VeriClient } from "@/lib/providers/veri";
import type { JobPlan } from "./plan";

export const QWEN_REPO = "machinelearningmo/headroom-extractor-v5-bf16-42d582a35d2f";
type Condition = (typeof CONDITIONS)[number];

export const CONDITION_TEXT: Record<Condition, string> = {
  AGREEMENT_SIGNED: "the agreement is signed",
  DELIVERY_CONFIRMED: "delivery is confirmed",
  PHASE_ACCEPTED: "the customer accepts the work phase",
  INSPECTION_PASSED: "the inspection passes",
  CUSTOMER_CERTIFICATE_RECEIVED: "the customer receives the certificate",
  INVOICE_ACCEPTED: "the customer accepts the invoice",
};

export interface QwenClause {
  receipt: number;
  label: string;
  status: "PROPOSED" | "AMBIGUOUS" | "UNSUPPORTED" | "INVALID";
  trigger: Trigger | null;
  /** Plain-words summary of the trigger, e.g. "the inspection passes and the customer receives the certificate". */
  condition: string | null;
  due: string | null;
  issues: string[];
  ms: number;
}

export function describeTrigger(t: Trigger): string {
  if (t.op === "ATOM") return CONDITION_TEXT[t.condition];
  return t.children.map(describeTrigger).join(t.op === "ALL" ? " and " : " or ");
}

export function atoms(t: Trigger): Extract<Trigger, { op: "ATOM" }>[] {
  return t.op === "ATOM" ? [t] : t.children.flatMap(atoms);
}

type State = "MET" | "NOT_MET" | "UNKNOWN" | "CONFLICTING";
/** Combine per-atom Jev states through the trigger's ALL/ANY structure. */
export function combine(t: Trigger, stateOf: (a: Extract<Trigger, { op: "ATOM" }>) => State): State {
  if (t.op === "ATOM") return stateOf(t);
  const s = t.children.map((c) => combine(c, stateOf));
  if (t.op === "ALL") return s.every((x) => x === "MET") ? "MET" : s.includes("NOT_MET") ? "NOT_MET" : s.includes("CONFLICTING") ? "CONFLICTING" : "UNKNOWN";
  return s.includes("MET") ? "MET" : s.every((x) => x === "NOT_MET") ? "NOT_MET" : s.includes("CONFLICTING") ? "CONFLICTING" : "UNKNOWN";
}

function dueText(d: NonNullable<ReturnType<typeof parseExtraction>["due"]>) {
  if (d.kind === "ON_DATE") return `due ${d.date}`;
  if (d.kind === "CALENDAR_DAYS_AFTER_TRIGGER") return `due ${d.days} days after the condition`;
  return `due ${d.days} days after the invoice is issued`;
}

/** The receipts Qwen reads: every payment after the deposit that has a quoted clause (at most 4). */
export function clausesToRead(plan: JobPlan) {
  return plan.jobReceipts
    .map((l, i) => ({ l, i }))
    .filter(({ l, i }) => i > 0 && l.quote.trim())
    .slice(0, 4);
}

export async function readClauses(plan: JobPlan, apiKey: string, deploymentId: string, docId: (file: string | null) => string): Promise<QwenClause[]> {
  const client = new VeriClient({ apiKey, timeoutMs: 45_000 });
  return Promise.all(
    clausesToRead(plan).map(async ({ l, i }): Promise<QwenClause> => {
      const context: ExtractionContext = {
        sourceId: docId(l.sourceFile),
        text: l.quote,
        amountRefs: l.amountCents != null ? [{ id: "this_payment", cents: l.amountCents, currency: "USD" }] : [],
        // Work IDs written in the clause (the trained format, e.g. stage_roughin); otherwise one generic subject.
        subjects: [...new Set(l.quote.match(/\b(?:work|stage|phase|job)_[a-z0-9_]+\b/gi) ?? [])].concat("this_job"),
      };
      const t0 = Date.now();
      try {
        const res = await client.chat(deploymentId, QWEN_REPO, [{ role: "user", content: extractionPromptV5(context) }], 768);
        const text = res.text.slice(res.text.indexOf("{"), res.text.lastIndexOf("}") + 1);
        const out = parseExtraction(text, context);
        return { receipt: i, label: l.label, status: out.status, trigger: out.trigger, condition: out.trigger ? describeTrigger(out.trigger) : null, due: out.due ? dueText(out.due) : null, issues: out.issues, ms: Date.now() - t0 };
      } catch (e) {
        return { receipt: i, label: l.label, status: "INVALID", trigger: null, condition: null, due: null, issues: [e instanceof Error ? e.message.slice(0, 200) : "Invalid output"], ms: Date.now() - t0 };
      }
    }),
  );
}
