import type { ISODate, PaymentDueRule } from "./types";
export type { PaymentDueRule } from "./types";
export interface PaymentClockContext {
  eligibilityDate?: ISODate;
  invoiceIssuedDate?: ISODate;
}
export interface PaymentClockDiagnostic {
  code: string;
  message: string;
}
export interface PaymentClockResult {
  dueDate: ISODate | null;
  anchorDate: ISODate | null;
  missing: string[];
  diagnostics: PaymentClockDiagnostic[];
}
function isoDate(value: unknown): value is ISODate {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}
function held(
  code: string,
  message: string,
  missing: string[] = [],
  anchorDate: ISODate | null = null,
): PaymentClockResult {
  return {
    dueDate: null,
    anchorDate,
    missing,
    diagnostics: [{ code, message }],
  };
}
/**
 * Resolve only the reviewed contractual clock. This pure function never creates an invoice,
 * activates extracted terms, or converts the due date into expected/observed bank settlement.
 * Optional eligibility is a consistency check for an invoice clock, not a substitute anchor.
 */
export function resolvePaymentClock(
  rule: PaymentDueRule,
  context: PaymentClockContext = {},
): PaymentClockResult {
  if (!rule || typeof rule !== "object")
    return held(
      "UNSUPPORTED_DUE_RULE",
      "Supply one supported reviewed payment clock.",
      ["dueRule"],
    );
  if (rule.kind === "ON_DATE") {
    if (!isoDate(rule.date))
      return held(
        "INVALID_DATE",
        "The fixed due date must be a real ISO calendar date.",
        ["rule.date"],
      );
    return {
      dueDate: rule.date,
      anchorDate: null,
      missing: [],
      diagnostics: [],
    };
  }
  if (
    rule.kind !== "CALENDAR_DAYS_AFTER_TRIGGER" &&
    rule.kind !== "CALENDAR_DAYS_AFTER_INVOICE_ISSUED"
  )
    return held(
      "UNSUPPORTED_DUE_RULE",
      "Only trigger, invoice-issuance, and fixed-date clocks are supported.",
      ["dueRule"],
    );
  if (!Number.isInteger(rule.days) || rule.days < 0 || rule.days > 365)
    return held(
      "INVALID_DAYS",
      "Calendar-day delay must be an integer from 0 through 365.",
      ["rule.days"],
    );
  const invoiceClock = rule.kind === "CALENDAR_DAYS_AFTER_INVOICE_ISSUED";
  if (
    invoiceClock &&
    (typeof rule.invoiceSubject !== "string" ||
      !/^[a-zA-Z0-9_.:-]{1,160}$/.test(rule.invoiceSubject))
  )
    return held(
      "INVALID_INVOICE_SUBJECT",
      "An invoice-issuance clock needs a bounded reviewed invoice subject identifier.",
      ["rule.invoiceSubject"],
    );
  const field = invoiceClock ? "invoiceIssuedDate" : "eligibilityDate";
  const anchor = context[field];
  if (anchor === undefined || anchor === "")
    return held(
      "MISSING_ANCHOR",
      invoiceClock
        ? "Invoice issuance is unknown; eligibility cannot start an invoice-issuance clock."
        : "The condition/eligibility date is unknown; the trigger clock has not started.",
      [field],
    );
  if (!isoDate(anchor))
    return held(
      "INVALID_DATE",
      `The supplied ${field} must be a real ISO calendar date.`,
      [field],
    );
  if (invoiceClock && context.eligibilityDate !== undefined) {
    if (!isoDate(context.eligibilityDate))
      return held(
        "INVALID_DATE",
        "The supplied eligibilityDate must be a real ISO calendar date.",
        ["eligibilityDate"],
        anchor,
      );
    if (anchor < context.eligibilityDate)
      return held(
        "INVOICE_BEFORE_ELIGIBILITY",
        "Invoice issuance precedes its required eligibility date. Resolve that inconsistency before deriving a due date.",
        [],
        anchor,
      );
  }
  const date = new Date(
    new Date(`${anchor}T00:00:00.000Z`).getTime() + rule.days * 86_400_000,
  );
  const dueDate = date.toISOString().slice(0, 10);
  if (!isoDate(dueDate))
    return held(
      "DATE_RANGE",
      "The derived due date is outside the supported four-digit ISO calendar range.",
      [],
      anchor,
    );
  return { dueDate, anchorDate: anchor, missing: [], diagnostics: [] };
}
