import { describe, expect, it } from "vitest";
import { isBooksUpload, readBooks } from "@/lib/intake/books";
import { buildSnapshot, fallbackPlan, parsePlan } from "@/lib/intake/plan";
import { evaluateDecision, validateDecisionInput } from "@/lib/domain";

import { upload } from "./upload-fixture";

describe("books intake", () => {
  it("recognizes and reads the company export with exact cents", () => {
    expect(isBooksUpload(upload)).toBe(true);
    const books = readBooks(upload);
    expect(books.openingCashCents).toBe(6_000_000);
    expect(books.openBills.map((b) => b.cents)).toEqual([100_000]); // the paid bill is excluded
    expect(books.payroll.weeklyCents).toBe(150_000);
    expect(books.pendingEstimates[0]).toMatchObject({ id: "est-9", amountCents: 4_000_000 });
    expect(books.templates.renovation.depositFraction).toBeCloseTo(0.1);
  });

  it("builds a valid snapshot whose job receipts conserve the price", () => {
    const books = readBooks(upload);
    const q = "Can I take the renovation and keep $20k?";
    const { input } = buildSnapshot({ question: q, books, docs: [], plan: fallbackPlan(q, books), today: "2026-10-06" });
    expect(validateDecisionInput(input).success).toBe(true);
    expect(input.reserveCents).toBe(2_000_000);
    const receipts = input.job.events.filter((e) => e.direction === "inflow").reduce((s, e) => s + (e.amountCents ?? 0), 0);
    expect(receipts).toBe(4_000_000);
    expect(evaluateDecision(input).reasons.some((r) => r.code === "REVENUE_MISMATCH")).toBe(false);
  });

  it("uses document payment terms over history, and flags a schedule that doesn't sum to the price", () => {
    const books = readBooks(upload);
    const plan = parsePlan(JSON.stringify({
      ...fallbackPlan("", books),
      job: { name: "Kitchen", customer: "New Client", priceCents: 4_000_000, estimateId: null, kind: "renovation", startDate: null },
      jobReceipts: [
        { label: "Deposit", amountCents: null, percentOfPrice: 25, date: null, dayOffset: 0, quote: "25% on signing", sourceFile: "contract.txt" },
        { label: "Final", amountCents: null, percentOfPrice: 70, date: null, dayOffset: 60, quote: "70% at completion", sourceFile: "contract.txt" },
      ],
    }));
    const { input } = buildSnapshot({ question: "q", books, docs: [{ id: "doc-1", name: "contract.txt", text: "…" }], plan, today: "2026-10-06" });
    expect(input.job.events.filter((e) => e.direction === "inflow").map((e) => e.amountCents)).toEqual([1_000_000, 2_800_000]);
    expect(input.unresolvedTerms[0]).toMatch(/totals \$38,000\.00/);
  });
});
