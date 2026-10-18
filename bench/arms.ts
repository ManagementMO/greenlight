import type { BenchCase, CaseSpec, EventSpec, Status } from "./core";
import { STATUSES } from "./core";
import { firstJson } from "./llm";
import { runEngine, type EngineAnswer } from "./bridge";

export type ArmId = "claude-direct" | "claude-jev" | "jev-direct" | "qwen-local-direct" | "qwen-local-jev" | "qwen-direct" | "claude-extract-engine" | "gold-engine";
export const ARMS: Record<ArmId, string> = {
  "claude-direct": "A. Base Claude, direct answer",
  "qwen-direct": "B. Base Qwen3-4B on Veri GPU (serving failed; not usable)",
  "qwen-local-direct": "G. Base Qwen3-4B (local), Qwen answers",
  "qwen-local-jev": "H. Base Qwen3-4B (local) reads, Jev answers",
  "claude-jev": "E. Claude + Jev (Claude answers, Jev attached)",
  "jev-direct": "F. Jev answers directly",
  "claude-extract-engine": "C. Claude extracts, Greenlight engine decides",
  "gold-engine": "D. Gold structure + Greenlight engine (ceiling)",
};
export interface RawRecord {
  caseId: string; arm: ArmId; raw: string; latencyMs: number;
  inputTokens: number; outputTokens: number; costUsd: number; model: string; error?: string;
}

/** Parse a direct-answer reply. null = invalid output. */
export function parseDirect(raw: string): EngineAnswer | null {
  const j = firstJson(raw) as Record<string, unknown> | null;
  if (!j || typeof j.status !== "string") return null;
  const status = j.status.toUpperCase().trim() as Status;
  if (!STATUSES.includes(status)) return null;
  const m = j.worstCaseMinimumCashUsd;
  const worst = typeof m === "number" && Number.isFinite(m) ? m : typeof m === "string" && m.trim() !== "" && Number.isFinite(Number(m.replace(/[$,\s]/g, ""))) ? Number(m.replace(/[$,\s]/g, "")) : null;
  return { status, worstMinCash: worst, criticalItem: typeof j.criticalItem === "string" ? j.criticalItem.trim() : "none" };
}

const SLOT_META: Record<string, Pick<EventSpec, "scope" | "direction" | "label">> = {
  "existing-rent": { scope: "baseline", direction: "outflow", label: "shop rent and overhead" },
  "existing-payroll": { scope: "baseline", direction: "outflow", label: "existing business payroll" },
  "legacy-supplier": { scope: "baseline", direction: "outflow", label: "previously committed supplier settlement" },
  "job-deposit": { scope: "job", direction: "inflow", label: "deposit" },
  "materials-one": { scope: "job", direction: "outflow", label: "air-handler delivery" },
  "job-labor-one": { scope: "job", direction: "outflow", label: "installation crew payroll" },
  "phase-receipt": { scope: "job", direction: "inflow", label: "phase-one payment" },
  "job-labor-two": { scope: "job", direction: "outflow", label: "commissioning crew payroll" },
  "materials-two": { scope: "job", direction: "outflow", label: "controls and ductwork delivery" },
  "final-receipt": { scope: "job", direction: "inflow", label: "final contract payment" },
};
const isDate = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
const isNum = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);

/** Turn the extraction reply into a CaseSpec, or null when it is malformed. The engine does the rest. */
export function specFromExtraction(raw: string, c: BenchCase): CaseSpec | null {
  const j = firstJson(raw) as any;
  if (!j || !isNum(j.opening) || !isNum(j.reserve) || !Array.isArray(j.events)) return null;
  const events: EventSpec[] = [];
  for (const slot of Object.keys(SLOT_META)) {
    const e = j.events.find((x: any) => x?.id === slot);
    if (!e || !isDate(e.date) || !isNum(e.amount)) return null;
    events.push({ id: slot, ...SLOT_META[slot], date: e.date, amount: e.amount });
  }
  const itemIds = new Set(c.items.map((i) => i.id));
  const uncertainties = [];
  for (const u of Array.isArray(j.uncertainties) ? j.uncertainties : []) {
    if (!itemIds.has(u?.id) || !SLOT_META[u?.eventId] || !Array.isArray(u.options) || !u.options.length) return null;
    const options = u.options.map((o: any, i: number) => ({
      id: String(o?.id ?? i), label: String(o?.id ?? i),
      ...(isDate(o?.date) ? { date: o.date } : {}), ...(isNum(o?.amount) ? { amount: o.amount } : {}),
    }));
    uncertainties.push({ id: u.id, question: c.items.find((i) => i.id === u.id)!.question, eventId: u.eventId, options });
  }
  const blockers = (Array.isArray(j.blockers) ? j.blockers : [])
    .filter((id: unknown) => typeof id === "string" && itemIds.has(id))
    .map((id: string) => ({ id, question: c.items.find((i) => i.id === id)!.question, kind: id === "payroll-tax" ? "unknown_amount" as const : "conflict" as const }));
  return { opening: j.opening, reserve: j.reserve, events, uncertainties, blockers };
}

export function answerFor(arm: ArmId, c: BenchCase, raw?: string): { answer: EngineAnswer | null; extraMs: number } {
  if (arm === "gold-engine") {
    const t = performance.now();
    const answer = runEngine(c.spec);
    return { answer, extraMs: performance.now() - t };
  }
  if (arm === "claude-direct" || arm === "qwen-direct" || arm === "claude-jev" || arm === "jev-direct" || arm === "qwen-local-direct" || arm === "qwen-local-jev") return { answer: raw === undefined ? null : parseDirect(raw), extraMs: 0 };
  const spec = raw === undefined ? null : specFromExtraction(raw, c);
  if (!spec) return { answer: null, extraMs: 0 };
  const t = performance.now();
  try { return { answer: runEngine(spec), extraMs: performance.now() - t }; } catch { return { answer: null, extraMs: performance.now() - t }; }
}
