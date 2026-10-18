import { z } from "zod";
import type { DecisionInput } from "./types";

const id = z
  .string()
  .min(1)
  .max(160)
  .regex(/^[a-zA-Z0-9_.:-]+$/);
const text = z.string().max(20_000);
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return (
      Number.isFinite(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === value
    );
  }, "Use a real ISO calendar date");
const cents = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const sources = z.array(id).min(1).max(32);
export const paymentDueRuleSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("CALENDAR_DAYS_AFTER_TRIGGER"),
      days: z.number().int().min(0).max(365),
    })
    .strict(),
  z
    .object({
      kind: z.literal("CALENDAR_DAYS_AFTER_INVOICE_ISSUED"),
      days: z.number().int().min(0).max(365),
      invoiceSubject: id,
    })
    .strict(),
  z.object({ kind: z.literal("ON_DATE"), date }).strict(),
]);
const cashEvent = z.object({
  id,
  label: text,
  date: date.nullable(),
  amountCents: cents.nullable(),
  direction: z.enum(["inflow", "outflow"]),
  scope: z.enum(["baseline", "job"]),
  category: z.enum([
    "payroll",
    "supplier",
    "overhead",
    "tax",
    "collection",
    "deposit",
    "labor",
    "other",
  ]),
  sourceIds: sources,
  settlement: z.enum(["observed", "assumed", "committed"]),
  intradayOrder: z.number().int().min(0).max(10_000).optional(),
  includedInOpeningCash: z.boolean().optional(),
  supersedes: id.optional(),
});
const patch = z.object({
  eventId: id,
  date: date.nullable().optional(),
  amountCents: cents.nullable().optional(),
  excluded: z.boolean().optional(),
});
/** Structural validation at the network boundary. Material unknowns are valid input and become NEEDS_INPUT. */
export const decisionInputSchema = z.object({
  id,
  version: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
  company: z.object({ id, name: text, industry: text }),
  currency: z.literal("USD"),
  snapshotDate: date,
  horizonDate: date,
  calendarCoverageEnd: date,
  forwardCalendarConfirmed: z.boolean(),
  openingCashCents: cents.nullable(),
  reserveCents: cents.nullable(),
  commitments: z.array(cashEvent).max(128),
  job: z.object({
    id,
    name: text,
    customer: text,
    priceCents: cents,
    events: z.array(cashEvent).max(128),
    milestones: z
      .array(
        z.object({
          id,
          label: text,
          amountCents: cents,
          eventId: id,
          condition: text,
          judgment: z.enum([
            "MET",
            "NOT_MET",
            "EXPECTED",
            "UNKNOWN",
            "CONFLICTING",
          ]),
          conditionDate: date.optional(),
          invoiceEligibleDate: date.optional(),
          invoiceIssuedDate: date.optional(),
          dueDate: date.optional(),
          dueRule: paymentDueRuleSchema.optional(),
          assumedCollectionDate: date.nullable(),
          sourceIds: sources,
        }),
      )
      .max(32),
    negotiation: z
      .object({
        depositEventId: id,
        offsetReceiptEventId: id,
        maxAdditionalCents: cents,
        allowedCollectionDates: z.array(date).min(1).max(8),
        sourceIds: sources,
      })
      .optional(),
  }),
  evidence: z
    .array(
      z.object({
        id,
        title: text,
        kind: z.enum([
          "dataset",
          "contract",
          "amendment",
          "email",
          "inspection",
          "calendar",
          "assumption",
        ]),
        text,
        observedDate: date,
        effectiveDate: date,
        provenance: z.enum(["sponsor_dataset", "constructed_fixture"]),
        url: z.string().url().max(2048).optional(),
        sha256: z
          .string()
          .regex(/^[a-f0-9]{64}$/)
          .optional(),
        spanId: id.optional(),
        supersedes: id.optional(),
      }),
    )
    .max(128),
  assumptions: z.array(text).max(64),
  unresolvedTerms: z.array(text).max(64),
  uncertainties: z
    .array(
      z.object({
        id,
        question: text,
        owner: text,
        requiredBy: date,
        sourceIds: sources,
        options: z
          .array(
            z.object({
              id,
              label: text,
              explanation: text,
              patches: z.array(patch).max(32),
              requires: z.record(id, id).optional(),
            }),
          )
          .min(1)
          .max(16),
      }),
    )
    .max(16),
  answers: z.record(id, id).optional(),
});

export const validateDecisionInput = (value: unknown) =>
  decisionInputSchema.safeParse(value);
export const assertDecisionInput = (value: unknown): DecisionInput =>
  decisionInputSchema.parse(value) as DecisionInput;
