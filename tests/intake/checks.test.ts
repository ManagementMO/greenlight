import { describe, expect, it } from "vitest";
import { readBooks } from "@/lib/intake/books";
import { batches, checkCatalog, type JevCheck } from "@/lib/intake/checks";
import { buildSnapshot, parsePlan } from "@/lib/intake/plan";
import { upload } from "./upload-fixture";

// The fixture plus one past-due invoice still open, so the receivable checks have something to ask about.
const withAr = {
  ...upload,
  records: {
    ...upload.records,
    invoices: [...upload.records.invoices, { id: "i2", doc_number: "INV-2", customer_name: "Slow Client", project_id: "p1", due_date: "2026-09-01", total_amount: "8000.00", deposit_applied_amount: "0.00", retainage_amount: "0.00" }],
  },
};
const books = readBooks(withAr);
const plan = parsePlan(JSON.stringify({
  job: { name: "Dental office", customer: "Smile Co", priceCents: 4_000_000, estimateId: "est-9", kind: "renovation", startDate: "2026-10-20" },
  reserveCents: 1_000_000,
  jobReceipts: [
    { label: "Deposit", amountCents: 400_000, date: "2026-10-20", quote: "10% on signing", sourceFile: "c.txt" },
    { label: "Progress payment", amountCents: 1_600_000, date: "2026-11-30", quote: "40% at rough-in", sourceFile: "c.txt" },
    { label: "Final payment", amountCents: 2_000_000, date: "2026-12-31", quote: "50% on completion", sourceFile: "c.txt" },
  ],
  jobCosts: [{ label: "Materials", amountCents: 1_500_000, date: "2026-10-25", quote: "materials", sourceFile: "c.txt" }],
}));
const docs = [{ id: "doc-1", name: "c.txt", text: "contract" }];
const answered = (states: Record<string, JevCheck["state"]>) =>
  checkCatalog(plan, books, true).map((c) => ({ ...c, state: states[c.id] ?? "UNKNOWN", confidence: 0.95 }));
const snapshot = (states: Record<string, JevCheck["state"]>) =>
  buildSnapshot({ question: "q", books, docs, plan, today: "2026-10-06", catalog: answered(states) });

describe("Jev check catalog", () => {
  it("asks timing, lateness, deposit and receivable questions, and nothing without documents", () => {
    const ids = checkCatalog(plan, books, true).map((c) => c.id);
    expect(ids).toEqual(["pip-1", "bdays-1", "pip-2", "bdays-2", "late-14", "late-30", "late-45", "late-60", "deposit-paid", "ar-promise-i2", "ar-dispute-i2"]);
    expect(checkCatalog(plan, books, false)).toEqual([]);
  });

  it("splits questions into requests of at most 16", () => {
    expect(batches(Array.from({ length: 33 }, (_, i) => i)).map((b) => b.length)).toEqual([16, 16, 1]);
  });

  it("uses the largest lateness Jev found and counts a paid deposit as cash now", () => {
    const { input } = snapshot({ "late-14": "MET", "late-30": "MET", "late-45": "NOT_MET", "deposit-paid": "MET" });
    expect(input.uncertainties.find((u) => u.id === "job-late")?.question).toContain("30 days late");
    expect(input.job.events.find((e) => e.label === "Deposit")?.date).toBe(books.asOf);
  });

  it("drops a disputed invoice and stops asking about a promised one", () => {
    const disputed = snapshot({ "ar-dispute-i2": "MET" }).input;
    const promised = snapshot({ "ar-promise-i2": "MET" }).input;
    const open = snapshot({}).input;
    expect(open.uncertainties.some((u) => u.id === "past-due-ar")).toBe(true);
    expect(promised.uncertainties.some((u) => u.id === "past-due-ar")).toBe(false);
    expect(disputed.uncertainties.some((u) => u.id === "past-due-ar")).toBe(false);
    const arCents = (i: typeof open) => i.commitments.filter((e) => /INV-2/.test(e.label)).reduce((s, e) => s + (e.amountCents ?? 0), 0);
    expect(arCents(disputed)).toBe(0);
    expect(arCents(promised)).toBe(800_000);
  });

  it("leaves a payment without a date when Jev finds it is pay-if-paid", () => {
    const { input } = snapshot({ "pip-1": "MET" });
    expect(input.job.events.find((e) => e.label === "Progress payment")?.date).toBeNull();
  });
});
