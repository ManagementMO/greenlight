import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { buildC120Showcase } from "../../lib/providers/showcase";
import { scoreExtraction } from "../../lib/providers/evaluation";
describe("actual C120 source showcase", () => {
  it("binds an exact phase-clause excerpt to the full immutable source hash", () => {
    const example = buildC120Showcase();
    expect(example.fullSourceText).toContain(example.sourceText);
    expect(example.sourceSha256).toBe(
      createHash("sha256").update(example.fullSourceText).digest("hex"),
    );
    expect(example.context.amountRefs[0]).toEqual({
      id: "phase_receipt",
      cents: 3000000,
      currency: "USD",
    });
    expect(example.expected.due).toEqual({
      kind: "CALENDAR_DAYS_AFTER_INVOICE_ISSUED",
      days: 14,
      invoiceSubject: "phase_one",
    });
  });
  it("rejects the tempting eligibility-date substitution as a material error", () => {
    const example = buildC120Showcase();
    const incorrect = {
      ...example.expected,
      due: { kind: "CALENDAR_DAYS_AFTER_TRIGGER", days: 14 },
    };
    expect(
      scoreExtraction(
        JSON.stringify(incorrect),
        example.context,
        example.expected,
      ).materialExact,
    ).toBe(false);
  });
});
