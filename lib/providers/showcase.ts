import { createHash } from "node:crypto";
import { getScenario } from "../domain";
import {
  ExtractedClause,
  ExtractionContext,
  validateExtraction,
} from "./extraction";
export function buildC120Showcase() {
  const source = getScenario("ductline-phase-delay")?.evidence.find(
    (e) => e.id === "signed-contract",
  );
  if (!source) throw new Error("C120 signed contract source unavailable");
  const fullSourceText = source.text;
  const sourceText = fullSourceText.match(
    /USD 30,000 becomes invoice-eligible[\s\S]*?Payment terms: fourteen calendar days after invoice issuance\./,
  )?.[0];
  if (!sourceText)
    throw new Error(
      "The exact C120 phase clause changed; review showcase binding before inference",
    );
  const context: ExtractionContext = {
    sourceId: source.id,
    text: sourceText,
    amountRefs: [{ id: "phase_receipt", cents: 3_000_000, currency: "USD" }],
    subjects: ["phase_one"],
  };
  const expected: ExtractedClause = {
    schemaVersion: 1,
    amountRef: "phase_receipt",
    trigger: {
      op: "ALL",
      children: [
        { op: "ATOM", condition: "INSPECTION_PASSED", subject: "phase_one" },
        {
          op: "ATOM",
          condition: "CUSTOMER_CERTIFICATE_RECEIVED",
          subject: "phase_one",
        },
      ],
    },
    due: {
      kind: "CALENDAR_DAYS_AFTER_INVOICE_ISSUED",
      days: 14,
      invoiceSubject: "phase_one",
    },
    sourceIds: [source.id],
    status: "PROPOSED",
    issues: [],
  };
  validateExtraction(expected, context);
  return {
    sourceId: source.id,
    sourceSha256: createHash("sha256").update(fullSourceText).digest("hex"),
    sourceText,
    fullSourceText,
    context,
    expected,
  };
}
