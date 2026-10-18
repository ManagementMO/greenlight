import { describe, it, expect } from "vitest";
import {
  validateExtraction,
  extractionPrompt,
} from "../../lib/providers/extraction";
const context = {
  sourceId: "C1:s1",
  text: "$30,000 is due fourteen calendar days after phase_1 inspection passes.",
  amountRefs: [{ id: "amount_1", cents: 3000000, currency: "USD" as const }],
  subjects: ["phase_1"],
};
const valid = {
  schemaVersion: 1,
  amountRef: "amount_1",
  trigger: { op: "ATOM", condition: "INSPECTION_PASSED", subject: "phase_1" },
  due: { kind: "CALENDAR_DAYS_AFTER_TRIGGER", days: 14 },
  sourceIds: ["C1:s1"],
  status: "PROPOSED",
  issues: [],
};
describe("grounded clause contracts", () => {
  it("accepts supported proposed terms but never silently activates them", () => {
    expect(validateExtraction(valid, context).status).toBe("PROPOSED");
  });
  it("rejects invented amounts, subjects, source ids, business days, and absent material fields", () => {
    for (const patch of [
      { amountRef: "invented" },
      { sourceIds: ["fake"] },
      {
        trigger: {
          op: "ATOM",
          condition: "INSPECTION_PASSED",
          subject: "other_job",
        },
      },
      { due: { kind: "BUSINESS_DAYS", days: 14 } },
      { amountRef: null },
      { issues: ["unknown"], status: "PROPOSED" },
    ])
      expect(() =>
        validateExtraction({ ...valid, ...patch }, context),
      ).toThrow();
  });
  it("retains explicit uncertainty", () => {
    expect(
      validateExtraction(
        {
          ...valid,
          amountRef: null,
          status: "AMBIGUOUS",
          issues: ["Amount missing"],
        },
        context,
      ).amountRef,
    ).toBeNull();
    expect(extractionPrompt(context)).toContain("document content");
  });
  it("keeps invoice eligibility separate from an issuance-anchored payment clock", () => {
    const c = {
      ...context,
      text: "$30,000 becomes invoice-eligible after inspection passes and a certificate is received. Payment is due14 calendar days after invoice issuance.",
      subjects: ["phase_1"],
    };
    const clause = {
      ...valid,
      trigger: {
        op: "ALL",
        children: [
          { op: "ATOM", condition: "INSPECTION_PASSED", subject: "phase_1" },
          { op: "ATOM", condition: "CERTIFICATE_RECEIVED", subject: "phase_1" },
        ],
      },
      due: {
        kind: "CALENDAR_DAYS_AFTER_INVOICE_ISSUED",
        days: 14,
        invoiceSubject: "phase_1",
      },
    };
    expect(validateExtraction(clause, c).due).toEqual(clause.due);
    expect(() =>
      validateExtraction(
        { ...clause, due: { ...clause.due, invoiceSubject: "another_job" } },
        c,
      ),
    ).toThrow(/invoice/i);
    expect(extractionPrompt(c)).toContain(
      "eligibility does not establish invoice issuance",
    );
  });
});
