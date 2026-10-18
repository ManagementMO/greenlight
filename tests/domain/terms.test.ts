import { describe, expect, it } from "vitest";
import {
  evaluateDecision,
  getScenario,
  listScenarios,
  resolvePaymentClock,
  validateDecisionInput,
} from "../../lib/domain";
import type { PaymentDueRule } from "../../lib/domain";

const invoiceRule: PaymentDueRule = {
  kind: "CALENDAR_DAYS_AFTER_INVOICE_ISSUED",
  days: 14,
  invoiceSubject: "phase_1",
};

describe("reviewed payment clock", () => {
  it("anchors fourteen calendar days to actual invoice issuance, not earlier eligibility", () => {
    const result = resolvePaymentClock(invoiceRule, {
      eligibilityDate: "2026-10-20",
      invoiceIssuedDate: "2026-10-22",
    });
    expect(result).toEqual({
      dueDate: "2026-11-05",
      anchorDate: "2026-10-22",
      missing: [],
      diagnostics: [],
    });
  });
  it("holds the invoice-clock due date while issuance is unknown rather than using eligibility", () => {
    const result = resolvePaymentClock(invoiceRule, {
      eligibilityDate: "2026-10-20",
    });
    expect(result.dueDate).toBeNull();
    expect(result.anchorDate).toBeNull();
    expect(result.missing).toContain("invoiceIssuedDate");
    expect(result.diagnostics.some((d) => d.code === "MISSING_ANCHOR")).toBe(
      true,
    );
  });
  it("withholds due when a supplied invoice predates its eligibility", () => {
    const result = resolvePaymentClock(invoiceRule, {
      eligibilityDate: "2026-10-20",
      invoiceIssuedDate: "2026-10-18",
    });
    expect(result.dueDate).toBeNull();
    expect(result.anchorDate).toBe("2026-10-18");
    expect(
      result.diagnostics.some((d) => d.code === "INVOICE_BEFORE_ELIGIBILITY"),
    ).toBe(true);
  });
  it("uses only eligibility for a trigger clock and keeps a fixed date independent of either anchor", () => {
    const trigger = resolvePaymentClock(
      { kind: "CALENDAR_DAYS_AFTER_TRIGGER", days: 14 },
      { eligibilityDate: "2026-10-20", invoiceIssuedDate: "2026-10-22" },
    );
    expect(trigger.dueDate).toBe("2026-11-03");
    expect(trigger.anchorDate).toBe("2026-10-20");
    expect(
      resolvePaymentClock(
        { kind: "CALENDAR_DAYS_AFTER_TRIGGER", days: 14 },
        { invoiceIssuedDate: "2026-10-22" },
      ).missing,
    ).toContain("eligibilityDate");
    const fixed = resolvePaymentClock(
      { kind: "ON_DATE", date: "2026-12-01" },
      {},
    );
    expect(fixed.dueDate).toBe("2026-12-01");
    expect(fixed.anchorDate).toBeNull();
  });
  it("handles zero days, leap dates and year rollover in UTC calendar days", () => {
    expect(
      resolvePaymentClock(
        { kind: "CALENDAR_DAYS_AFTER_TRIGGER", days: 0 },
        { eligibilityDate: "2026-10-20" },
      ).dueDate,
    ).toBe("2026-10-20");
    expect(
      resolvePaymentClock(
        { kind: "CALENDAR_DAYS_AFTER_TRIGGER", days: 1 },
        { eligibilityDate: "2028-02-28" },
      ).dueDate,
    ).toBe("2028-02-29");
    expect(
      resolvePaymentClock(
        { kind: "CALENDAR_DAYS_AFTER_TRIGGER", days: 14 },
        { eligibilityDate: "2026-12-25" },
      ).dueDate,
    ).toBe("2027-01-08");
    expect(
      resolvePaymentClock(
        { kind: "CALENDAR_DAYS_AFTER_TRIGGER", days: 365 },
        { eligibilityDate: "2026-01-01" },
      ).dueDate,
    ).toBe("2027-01-01");
  });
  it("reports bounded diagnostics for invalid dates, fractional/negative/large delays and missing invoice subjects", () => {
    for (const days of [-1, 0.5, 366, NaN, Infinity]) {
      const result = resolvePaymentClock(
        { kind: "CALENDAR_DAYS_AFTER_TRIGGER", days },
        { eligibilityDate: "2026-10-20" },
      );
      expect(result.dueDate).toBeNull();
      expect(result.diagnostics.some((d) => d.code === "INVALID_DAYS")).toBe(
        true,
      );
    }
    expect(
      resolvePaymentClock(
        { kind: "ON_DATE", date: "2026-02-30" },
        {},
      ).diagnostics.some((d) => d.code === "INVALID_DATE"),
    ).toBe(true);
    expect(
      resolvePaymentClock(invoiceRule, {
        invoiceIssuedDate: "2026-10-22T00:00:00Z",
      }).diagnostics.some((d) => d.code === "INVALID_DATE"),
    ).toBe(true);
    expect(
      resolvePaymentClock(
        { ...invoiceRule, invoiceSubject: "" },
        { invoiceIssuedDate: "2026-10-22" },
      ).diagnostics.some((d) => d.code === "INVALID_INVOICE_SUBJECT"),
    ).toBe(true);
    expect(
      resolvePaymentClock(
        { kind: "CALENDAR_DAYS_AFTER_TRIGGER", days: 1 },
        { eligibilityDate: "9999-12-31" },
      ).diagnostics.some((d) => d.code === "DATE_RANGE"),
    ).toBe(true);
  });
  it("does not mutate context or invent an invoice/collection while resolving the contractual date", () => {
    const context = {
      eligibilityDate: "2026-10-20",
      invoiceIssuedDate: "2026-10-22",
    };
    const before = structuredClone(context);
    const result = resolvePaymentClock(invoiceRule, context);
    expect(context).toEqual(before);
    expect(result).not.toHaveProperty("collectionDate");
    expect(Object.keys(result).sort()).toEqual([
      "anchorDate",
      "diagnostics",
      "dueDate",
      "missing",
    ]);
  });
});

describe("manually reviewed C-120 clock integration", () => {
  it("rejects a stale stored due date when actual issuance moves two days later", () => {
    const input = getScenario("ductline-phase-delay")!;
    const milestone = input.job.milestones.find((m) => m.id === "phase-one")!;
    milestone.dueRule = invoiceRule;
    milestone.invoiceIssuedDate = "2026-10-22";
    const stale = evaluateDecision(input);
    expect(stale.status).toBe("NEEDS_INPUT");
    expect(
      stale.reasons.some((reason) => reason.code === "STALE_DUE_DATE"),
    ).toBe(true);
    milestone.dueDate = "2026-11-05";
    const reviewed = evaluateDecision(input);
    expect(reviewed.status).toBe("CONDITIONAL");
    expect(reviewed.withJob.minimumCents).toBe(-1_300_000);
    expect(
      input.job.events.find((event) => event.id === "phase-receipt")!.date,
    ).toBe("2026-10-24");
  });
  it("keeps unknown issuance unresolved even if a due date was manually left behind", () => {
    const input = getScenario("ductline-phase-delay")!;
    const milestone = input.job.milestones.find((m) => m.id === "phase-one")!;
    milestone.dueRule = invoiceRule;
    delete milestone.invoiceIssuedDate;
    expect(evaluateDecision(input).status).toBe("NEEDS_INPUT");
  });
  it("preserves the reviewed due rule through validation and retains all three original cash outcomes", () => {
    const fixtures = listScenarios();
    const parsed = validateDecisionInput(fixtures[0]);
    expect(parsed.success).toBe(true);
    if (parsed.success)
      expect(
        parsed.data.job.milestones.find((m) => m.id === "phase-one")!.dueRule,
      ).toEqual(invoiceRule);
    const results = fixtures.map(evaluateDecision);
    expect(results.map((result) => result.status)).toEqual([
      "CONDITIONAL",
      "CONDITIONAL",
      "NEEDS_INPUT",
    ]);
    expect(results.map((result) => result.withJob.minimumCents)).toEqual([
      -1_300_000, 900_000, -1_300_000,
    ]);
    expect(results[0].proposal!.additionalDepositCents).toBe(2_300_000);
  });
});
