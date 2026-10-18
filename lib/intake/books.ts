// Fixed code that reads a QuickBooks-shaped company export (greenlight_company_upload_v1).
// No model is involved: every figure here is exact cents arithmetic over the uploaded records.

import { decimalToCents } from "@/lib/domain/intuit";

export const BOOKS_FORMAT = "greenlight_company_upload_v1";

type Rec = Record<string, unknown>;
const arr = (v: unknown): Rec[] => (Array.isArray(v) ? (v as Rec[]) : []);
const str = (v: unknown) => (typeof v === "string" ? v : "");
const money = (v: unknown) => {
  try { return typeof v === "string" && v ? decimalToCents(v) : 0; } catch { return 0; }
};

export const addDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
export const daysBetween = (a: string, b: string) =>
  Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

export interface OpenBill { id: string; doc: string; vendor: string; category: string; projectId: string | null; dueDate: string; cents: number }
export interface Receivable { id: string; doc: string; customer: string; dueDate: string; openCents: number; retainageCents: number }
export interface TemplateLine { dayOffset: number; fraction: number; label: string }
export interface JobTemplate {
  projectId: string;
  projectName: string;
  kind: string;
  contractCents: number;
  startDate: string;
  receipts: TemplateLine[];
  costs: TemplateLine[];
  depositFraction: number;
  costRatio: number;
  /** Median days between an invoice's due date and the customer's payment. */
  paymentLagDays: number;
}
export interface Books {
  companyName: string;
  industry: string;
  asOf: string;
  openingCashCents: number;
  openingSource: { id: string; date: string; memo: string };
  openBills: OpenBill[];
  payroll: { weeklyCents: number; runIds: string[]; lastRunDate: string; grossOnly: boolean };
  operating: { weeklyCents: number; fromDate: string; toDate: string; billCount: number };
  receivables: Receivable[];
  projects: { id: string; name: string; customer: string; kind: string; status: string; contractCents: number; start: string; finish: string | null }[];
  pendingEstimates: { id: string; amountCents: number; kind: string; date: string; customer: string | null }[];
  templates: Record<string, JobTemplate>;
  recordCount: number;
}

export function isBooksUpload(value: unknown): value is Rec {
  return !!value && typeof value === "object" && (value as Rec).format === BOOKS_FORMAT;
}

function median(xs: number[]) {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

function applied(payments: Rec[]) {
  const out = new Map<string, number>();
  for (const p of payments)
    for (const a of arr(p.applications)) out.set(str(a.document_id), (out.get(str(a.document_id)) ?? 0) + money(a.amount));
  return out;
}

/** History of one completed project, expressed relative to its start and contract amount. */
function templateFor(project: Rec, r: Rec): JobTemplate | null {
  const id = str(project.id);
  const start = str(project.started_date);
  const contract = money(project.contract_amount);
  if (!start || contract <= 0) return null;
  const invoices = arr(r.invoices).filter((i) => i.project_id === id);
  const depositCents = invoices.reduce((s, i) => s + money(i.deposit_applied_amount), 0);
  const deposits = arr(r.bank_transactions).filter((t) => t.kind === "deposit_receipt");
  const deposit = deposits
    .filter((t) => Math.abs(daysBetween(start, str(t.date))) <= 45)
    .sort((a, b) => Math.abs(money(a.amount) - depositCents) - Math.abs(money(b.amount) - depositCents))[0];
  const receipts: TemplateLine[] = [];
  if (depositCents > 0)
    receipts.push({ dayOffset: Math.max(0, deposit ? daysBetween(start, str(deposit.date)) : 0), fraction: depositCents / contract, label: "Deposit" });
  const payments = arr(r.customer_payments).filter((p) => p.project_id === id);
  let stage = 0;
  for (const p of payments) {
    const retainage = p.settles === "retainage";
    receipts.push({ dayOffset: daysBetween(start, str(p.txn_date)), fraction: money(p.amount) / contract, label: retainage ? "Retainage release" : `Progress payment ${++stage}` });
  }
  const received = receipts.reduce((s, x) => s + x.fraction, 0);
  if (received < 0.999) {
    const last = Math.max(0, ...receipts.map((x) => x.dayOffset));
    receipts.push({ dayOffset: last + 30, fraction: 1 - received, label: "Remaining balance and retainage" });
  }
  // Customer payment lag: invoice due date to settlement.
  const dueById = new Map(invoices.map((i) => [str(i.id), str(i.due_date)]));
  const lags = payments.flatMap((p) => arr(p.applications).map((a) => dueById.get(str(a.document_id))).filter(Boolean).map((due) => daysBetween(due!, str(p.txn_date))));
  // Costs grouped by week of due date.
  const weeks = new Map<number, number>();
  for (const b of arr(r.bills).filter((b) => b.project_id === id)) {
    const w = Math.max(0, Math.floor(daysBetween(start, str(b.due_date)) / 7));
    weeks.set(w, (weeks.get(w) ?? 0) + money(b.total_amount));
  }
  const costs = [...weeks.entries()].sort((a, b) => a[0] - b[0]).map(([w, c]) => ({ dayOffset: w * 7 + 4, fraction: c / contract, label: "Subcontractors and materials" }));
  return {
    projectId: id,
    projectName: str(project.name),
    kind: str(project.project_kind),
    contractCents: contract,
    startDate: start,
    receipts: receipts.sort((a, b) => a.dayOffset - b.dayOffset),
    costs,
    depositFraction: depositCents / contract,
    costRatio: costs.reduce((s, x) => s + x.fraction, 0),
    paymentLagDays: median(lags.filter((x) => x > 0)),
  };
}

export function readBooks(upload: Rec): Books {
  const r = (upload.records ?? {}) as Rec;
  const asOf = str(upload.as_of_date);
  const company = arr(r.company)[0] ?? {};

  const bank = arr(r.bank_transactions).filter((t) => str(t.date) <= asOf).sort((a, b) => str(a.date).localeCompare(str(b.date)) || str(a.id).localeCompare(str(b.id)));
  const last = bank.at(-1);
  if (!last) throw new Error("The books have no bank transactions on or before the as-of date.");

  const billPaid = applied(arr(r.bill_payments));
  const openBills: OpenBill[] = arr(r.bills).flatMap((b) => {
    const open = money(b.total_amount) - (billPaid.get(str(b.id)) ?? 0);
    return open > 0
      ? [{ id: str(b.id), doc: str(b.doc_number), vendor: str(b.vendor_name), category: str(b.cost_category), projectId: (b.project_id as string) ?? null, dueDate: str(b.due_date), cents: open }]
      : [];
  });

  // Payroll: average weekly total over the last four full weeks of runs.
  const runs = arr(r.payroll_runs).filter((p) => str(p.date) <= asOf).sort((a, b) => str(a.date).localeCompare(str(b.date)));
  const cutoff = addDays(asOf, -28);
  const recent = runs.filter((p) => str(p.date) > cutoff);
  const weeklyPayroll = Math.round(recent.reduce((s, p) => s + money(p.total_amount), 0) / 4);

  // Recurring operating costs: non-project bills over the last 13 weeks, excluding one-off income tax.
  const opFrom = addDays(asOf, -91);
  const opBills = arr(r.bills).filter((b) => !b.project_id && b.cost_category !== "income_tax" && str(b.txn_date) > opFrom && str(b.txn_date) <= asOf);
  const operatingWeekly = Math.round(opBills.reduce((s, b) => s + money(b.total_amount), 0) / 13);

  const received = applied(arr(r.customer_payments));
  const receivables: Receivable[] = arr(r.invoices).flatMap((i) => {
    const owed = money(i.total_amount) - money(i.deposit_applied_amount) - (received.get(str(i.id)) ?? 0);
    if (owed <= 0) return [];
    const retainage = Math.min(owed, money(i.retainage_amount));
    return [{ id: str(i.id), doc: str(i.doc_number), customer: str(i.customer_name), dueDate: str(i.due_date), openCents: owed - retainage, retainageCents: retainage }];
  });

  const projects = arr(r.projects).map((p) => ({
    id: str(p.id), name: str(p.name), customer: str(p.customer_name), kind: str(p.project_kind), status: str(p.status),
    contractCents: money(p.contract_amount), start: str(p.started_date), finish: (p.completed_date as string) ?? null,
  }));
  const templates: Record<string, JobTemplate> = {};
  for (const p of arr(r.projects).filter((p) => p.status === "completed").sort((a, b) => str(a.started_date).localeCompare(str(b.started_date)))) {
    const t = templateFor(p, r);
    if (t) templates[t.kind] = t; // latest completed project of each kind wins
  }

  const recordCount = Object.values(r).reduce<number>((s, v) => s + arr(v).length, 0);
  return {
    companyName: str(company.trade_name) || str(company.legal_name) || "Uploaded company",
    industry: str(company.industry_title),
    asOf,
    openingCashCents: money(last.running_balance_amount),
    openingSource: { id: str(last.id), date: str(last.date), memo: str(last.memo) },
    openBills,
    payroll: { weeklyCents: weeklyPayroll, runIds: recent.map((p) => str(p.id)), lastRunDate: str(runs.at(-1)?.date), grossOnly: recent.some((p) => p.gross_only === true) },
    operating: { weeklyCents: operatingWeekly, fromDate: opFrom, toDate: asOf, billCount: opBills.length },
    receivables,
    projects,
    pendingEstimates: arr(r.estimates).filter((e) => e.status === "pending").map((e) => ({
      id: str(e.id), amountCents: money(e.amount), kind: str(e.project_kind), date: str(e.date), customer: (e.customer_name as string) ?? null,
    })),
    templates,
    recordCount,
  };
}

/** A compact, model-readable digest. The raw books never go to the model. */
export function booksDigest(b: Books) {
  const usd = (c: number) => `$${(c / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return {
    company: b.companyName,
    industry: b.industry,
    asOf: b.asOf,
    cashOnHand: usd(b.openingCashCents),
    unpaidBillsTotal: usd(b.openBills.reduce((s, x) => s + x.cents, 0)),
    weeklyPayroll: usd(b.payroll.weeklyCents),
    weeklyOperatingCosts: usd(b.operating.weeklyCents),
    pastDueReceivables: b.receivables.filter((x) => x.openCents > 0).map((x) => ({ invoice: x.doc, customer: x.customer, due: x.dueDate, open: usd(x.openCents) })),
    projects: b.projects.map((p) => ({ id: p.id, name: p.name, kind: p.kind, status: p.status, contract: usd(p.contractCents), start: p.start })),
    pendingEstimates: b.pendingEstimates.map((e) => ({ id: e.id, kind: e.kind, amount: usd(e.amountCents), date: e.date, customer: e.customer })),
    historyTemplates: Object.values(b.templates).map((t) => ({
      kind: t.kind, basedOn: t.projectName, depositPercent: +(t.depositFraction * 100).toFixed(1),
      costPercentOfPrice: +(t.costRatio * 100).toFixed(1), customerPaysDaysAfterDue: t.paymentLagDays,
      lastReceiptDay: Math.max(...t.receipts.map((x) => x.dayOffset)),
    })),
  };
}
