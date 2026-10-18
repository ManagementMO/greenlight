import { describe, it, expect } from "vitest";
import { buildV5Training } from "../../scripts/ml/generate-v5-training";
import { validateExtraction, type Trigger } from "../../lib/providers/extraction";
import { extractionPromptV5 } from "../../lib/providers/extraction-v5";
const { labels, manifest } = buildV5Training();
const nested = (node: Trigger | null) => !!node && node.op !== "ATOM" && node.children.some(child => child.op !== "ATOM");

describe("v5 training removes the observed shortcuts", () => {
  it("teaches nested logic, all statuses, multiple clocks, and nonconstant references", () => {
    expect(labels).toHaveLength(336);
    expect(manifest.statusCounts).toEqual({ PROPOSED: 240, AMBIGUOUS: 48, UNSUPPORTED: 48 });
    expect(labels.filter(row => nested(row.expected.trigger)).length).toBeGreaterThan(100);
    expect(new Set(labels.map(row => row.expected.amountRef)).size).toBeGreaterThan(300);
    for (const row of labels) {
      expect(validateExtraction(row.expected, row.context)).toEqual(row.expected);
      expect(row.context.amountRefs).toHaveLength(3);
      expect(row.context.subjects).toHaveLength(5);
      expect(row.context.sourceId).toMatch(/^doc_[a-f0-9]{12}$/);
      expect(row.context.sourceId).not.toContain(row.family);
    }
    expect(new Set(labels.filter(row => row.expected.amountRef).map(row => row.context.amountRefs.findIndex(a => a.id === row.expected.amountRef)))).toEqual(new Set([0,1,2]));
    expect(new Set(labels.filter(row => row.expected.amountRef).map(row => [...row.context.amountRefs].sort((a,b) => a.cents-b.cents).findIndex(a => a.id === row.expected.amountRef)))).toEqual(new Set([0,1,2]));
    for (const status of ["AMBIGUOUS", "UNSUPPORTED"]) expect(labels.some(row => row.expected.status === status && nested(row.expected.trigger))).toBe(true);
    const invoiceRows = labels.filter(row => row.expected.due?.kind === "CALENDAR_DAYS_AFTER_INVOICE_ISSUED");
    expect(invoiceRows.some(row => row.expected.due?.kind === "CALENDAR_DAYS_AFTER_INVOICE_ISSUED" && row.expected.due.invoiceSubject.startsWith("bill_"))).toBe(true);
  });
  it("makes completeness explicit without weakening validation", () => {
    const row = labels.find(row => row.expected.status === "PROPOSED")!;
    expect(extractionPromptV5(row.context)).toContain("issues MUST be []");
    expect(() => validateExtraction({ ...row.expected, issues: ["Looks good"] }, row.context)).toThrow("incomplete");
    expect(() => validateExtraction({ ...row.expected, amountRef: "payment_amount" }, row.context)).toThrow("Unknown amount");
    expect(() => validateExtraction({ ...row.expected, trigger: { op:"ATOM", condition:"INSPECTION_PASSED", subject:"invoice" } }, row.context)).toThrow("Unknown subject");
  });
});
