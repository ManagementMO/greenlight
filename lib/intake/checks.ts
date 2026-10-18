// The Jev check catalog: every yes/no judgment a cash decision needs, asked of Jev instead of the LLM.
// The LLM only copies money lines out of documents; each judgment here is one Jev proposition with a
// fixed effect on the forecast (applied in buildSnapshot). Jev never extracts numbers or does arithmetic.

import type { Books } from "./books";
import type { JobPlan } from "./plan";

export type CheckKind = "pay_if_paid" | "business_days" | "late" | "deposit_received" | "ar_promised" | "ar_disputed";

export interface JevCheck {
  id: string;
  kind: CheckKind;
  /** Plain-English question shown on the answer page. */
  question: string;
  /** What Jev is asked to judge against the uploaded documents. */
  statement: string;
  subject: string;
  /** Which receipt (index into plan.jobReceipts), receivable (invoice id) or day threshold this check is about. */
  receipt?: number;
  invoice?: string;
  days?: number;
  state: "MET" | "NOT_MET" | "UNKNOWN" | "CONFLICTING" | "UNCHECKED";
  confidence: number | null;
}

/** Day thresholds asked about customer lateness; the forecast uses the largest one Jev finds MET. */
export const LATE_BUCKETS = [14, 30, 45, 60];

/** Build the questions. Only asked when there are documents to judge against. */
export function checkCatalog(plan: JobPlan, books: Books | null, hasDocs: boolean): Omit<JevCheck, "state" | "confidence">[] {
  if (!hasDocs) return [];
  const job = plan.job.name;
  const customer = plan.job.customer;
  const out: Omit<JevCheck, "state" | "confidence">[] = [];

  // Timing type of each payment after the deposit: supported calendar timing, or not.
  plan.jobReceipts.slice(1, 5).forEach((l, k) => {
    const i = k + 1;
    out.push({
      id: `pip-${i}`, kind: "pay_if_paid", receipt: i, subject: `${job} · ${l.label}`,
      question: `Is the ${l.label} owed only if someone else pays first?`,
      statement: `The ${l.label} for ${job} is owed only if and when a third party, such as the owner's lender, pays first (pay-if-paid or pay-when-paid).`,
    });
    out.push({
      id: `bdays-${i}`, kind: "business_days", receipt: i, subject: `${job} · ${l.label}`,
      question: `Is the ${l.label} deadline counted in business days?`,
      statement: `The deadline for the ${l.label} for ${job} is counted in business days, not calendar days or a stated calendar date.`,
    });
  });

  // How late the customer says it will pay. (Jev answers the "told the contractor to expect" phrasing
  // reliably; "has said ... at least N days" came back UNKNOWN on the same email.)
  for (const days of LATE_BUCKETS)
    out.push({
      id: `late-${days}`, kind: "late", days, subject: `${customer} payment timing`,
      question: `Has ${customer} said it will pay ${days}+ days late?`,
      statement: `${customer} has told the contractor to expect its payments for ${job} to arrive about ${days} days or more after the contract dates.`,
    });

  // Whether the deposit is already in the bank (then the books' balance already includes it).
  if (plan.jobReceipts.length && books)
    out.push({
      id: "deposit-paid", kind: "deposit_received", receipt: 0, subject: `${job} · deposit`,
      question: `Has ${customer} already paid the deposit?`,
      statement: `${customer} has sent the deposit payment for ${job}.`,
    });

  // Past-due invoices already on the books: promised or disputed?
  for (const r of (books?.receivables ?? []).filter((x) => x.openCents > 0).slice(0, 3)) {
    out.push({
      id: `ar-promise-${r.id}`, kind: "ar_promised", invoice: r.id, subject: `${r.customer} · ${r.doc}`,
      question: `Has ${r.customer} promised to pay ${r.doc}?`,
      statement: `${r.customer} has committed to paying invoice ${r.doc} by a specific date.`,
    });
    out.push({
      id: `ar-dispute-${r.id}`, kind: "ar_disputed", invoice: r.id, subject: `${r.customer} · ${r.doc}`,
      question: `Is ${r.customer} disputing ${r.doc}?`,
      statement: `${r.customer} disputes invoice ${r.doc} or has refused to pay it.`,
    });
  }
  return out;
}

/** Split propositions into Jev-sized requests (Jev accepts at most 16 questions per call). */
export function batches<T>(items: T[], size = 16): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
