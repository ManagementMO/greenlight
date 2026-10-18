/** Converts a compact CaseSpec into the engine's DecisionInput and runs the real Greenlight engine. */
import { evaluateDecision, getScenario } from "../lib/domain";
import type { CashEvent, DecisionInput } from "../lib/domain/types";
import type { CaseSpec, Status } from "./core";

const cents = (usd: number) => Math.round(usd * 100);
const STATUS_MAP: Record<string, Status> = {
  SUPPORTED_IN_TESTED_SCENARIOS: "SUPPORTED",
  SHORTFALL: "SHORTFALL",
  CONDITIONAL: "CONDITIONAL",
  NEEDS_INPUT: "NEEDS_INPUT",
};
const SOURCE: Record<string, string> = {
  "existing-rent": "forward-calendar", "existing-payroll": "forward-calendar", "legacy-supplier": "forward-calendar",
  "job-deposit": "signed-contract", "materials-one": "job-budget", "job-labor-one": "job-budget",
  "phase-receipt": "customer-email", "job-labor-two": "job-budget", "materials-two": "job-budget", "final-receipt": "signed-contract",
};

export function toDecisionInput(spec: CaseSpec): DecisionInput {
  const base = getScenario("ductline-phase-delay")!;
  const input: DecisionInput = structuredClone(base);
  input.id = "bench-case";
  input.openingCashCents = cents(spec.opening);
  input.reserveCents = cents(spec.reserve);
  const toEvent = (e: CaseSpec["events"][number]): CashEvent => ({
    id: e.id, label: e.label, date: e.date, amountCents: cents(e.amount), direction: e.direction,
    scope: e.scope, category: base.commitments.concat(base.job.events).find((x) => x.id === e.id)?.category ?? "other",
    sourceIds: [SOURCE[e.id] ?? "forward-calendar"], settlement: e.direction === "inflow" ? "assumed" : "committed",
  });
  input.commitments = spec.events.filter((e) => e.scope === "baseline").map(toEvent);
  input.job.events = spec.events.filter((e) => e.scope === "job").map(toEvent);
  const get = (id: string) => spec.events.find((e) => e.id === id);
  for (const m of input.job.milestones) {
    const e = get(m.eventId);
    if (e) { m.amountCents = cents(e.amount); m.assumedCollectionDate = e.date; }
  }
  input.job.priceCents = cents(spec.events.filter((e) => e.scope === "job" && e.direction === "inflow").reduce((n, e) => n + e.amount, 0));
  input.job.negotiation = undefined;
  input.uncertainties = spec.uncertainties.map((u) => ({
    id: u.id, question: u.question, owner: "counterparty", requiredBy: "2026-10-12", sourceIds: ["customer-email"],
    options: u.options.map((o) => ({
      id: o.id, label: o.label, explanation: o.label,
      patches: [{ eventId: u.eventId, ...(o.date ? { date: o.date } : {}), ...(o.amount !== undefined ? { amountCents: cents(o.amount) } : {}) }],
    })),
  }));
  input.unresolvedTerms = spec.blockers.map((b) => `${b.id}: ${b.question}`);
  return input;
}

export interface EngineAnswer { status: Status; worstMinCash: number | null; criticalItem: string }
export function runEngine(spec: CaseSpec): EngineAnswer {
  const r = evaluateDecision(toDecisionInput(spec));
  const status = STATUS_MAP[r.status];
  const first = r.nextQuestions.find((q) => q.distinguishesFeasibility);
  return {
    status,
    worstMinCash: status === "NEEDS_INPUT" ? null : r.minimumCashRange.worstCents / 100,
    criticalItem: status === "NEEDS_INPUT" ? (spec.blockers[0]?.id ?? "none") : status === "CONDITIONAL" ? (first?.id ?? "none") : "none",
  };
}
