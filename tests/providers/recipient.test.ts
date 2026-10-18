import { describe, it, expect } from "vitest";
import {
  CONDITIONS,
  validateExtraction,
  EXTRACTION_SYSTEM,
} from "../../lib/providers/extraction";
import { scoreExtraction } from "../../lib/providers/evaluation";
import {
  customerCertificateReceiptProposition,
  buildJevRequest,
} from "../../lib/providers/jev";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
const context = {
  sourceId: "C:s1",
  text: "The customer receives the insurance certificate for phase_one. Payment is due14 calendar days after this receipt.",
  amountRefs: [{ id: "a", cents: 3000000, currency: "USD" as const }],
  subjects: ["phase_one"],
};
const customer = {
  schemaVersion: 1 as const,
  amountRef: "a",
  trigger: {
    op: "ATOM" as const,
    condition: "CUSTOMER_CERTIFICATE_RECEIVED" as const,
    subject: "phase_one",
  },
  due: { kind: "CALENDAR_DAYS_AFTER_TRIGGER" as const, days: 14 },
  sourceIds: ["C:s1"],
  status: "PROPOSED" as const,
  issues: [],
};
describe("customer certificate recipient semantics", () => {
  it("preserves the v1 and v2 archives byte-for-byte against their original manifests", () => {
    for (const dir of ["v1-technical-proof", "v2-invoice-clock-archive"]) {
      const root = "data/training/" + dir + "/",
        manifest = JSON.parse(readFileSync(root + "manifest.json", "utf8"));
      for (const [name, hash] of Object.entries(manifest.hashes))
        expect(
          createHash("sha256")
            .update(readFileSync(root + name))
            .digest("hex"),
        ).toBe(hash);
    }
  });
  it("uses an explicit customer atom and rejects the old recipient-free atom", () => {
    expect(CONDITIONS).toContain("CUSTOMER_CERTIFICATE_RECEIVED");
    expect(
      (CONDITIONS as readonly string[]).includes("CERTIFICATE_RECEIVED"),
    ).toBe(false);
    expect(validateExtraction(customer, context).trigger).toEqual(
      customer.trigger,
    );
    expect(() =>
      validateExtraction(
        {
          ...customer,
          trigger: { ...customer.trigger, condition: "CERTIFICATE_RECEIVED" },
        },
        context,
      ),
    ).toThrow();
    expect(EXTRACTION_SYSTEM).toContain("customer");
  });
  it("scores contractor receipt and an unidentified 'we' as different from customer receipt", () => {
    const supplier = {
      ...context,
      text: "We, the contractor, must receive the certificate before this payment becomes eligible. Pay14 calendar days after our receipt.",
    };
    const supplierExpected = {
      ...customer,
      trigger: null,
      status: "UNSUPPORTED" as const,
      issues: ["Only contractor receipt is specified."],
    };
    const unbound = {
      ...context,
      text: "After we receive the certificate for phase_one, pay the amount14 calendar days later. No party identity is supplied for 'we'.",
    };
    const unboundExpected = {
      ...customer,
      trigger: null,
      status: "AMBIGUOUS" as const,
      issues: ["Certificate recipient is not identified."],
    };
    for (const [input, target] of [
      [supplier, supplierExpected],
      [unbound, unboundExpected],
    ] as const) {
      const score = scoreExtraction(JSON.stringify(customer), input, target);
      expect(score.valid).toBe(true);
      expect(score.materialExact).toBe(false);
      expect(score.unsafeProposed).toBe(true);
      expect(
        scoreExtraction(JSON.stringify(target), input, target).materialExact,
      ).toBe(true);
    }
  });
  it("scopes Jev's customer predicate without converting a supplier receipt event into customer evidence", () => {
    const proposition = customerCertificateReceiptProposition(
      "certificate",
      "phase_one",
    );
    const request = buildJevRequest({
      snapshotVersion: "v",
      companyId: "c",
      jobId: "j",
      propositions: [proposition],
      evidence: [
        {
          id: "supplier-email",
          companyId: "c",
          jobId: "j",
          text: "Supplier: we received the certificate; the customer has not received it.",
        },
      ],
    });
    expect(proposition.condition).toBe("CUSTOMER_CERTIFICATE_RECEIVED");
    expect(proposition.statement).toContain("customer");
    const question = request.questions.certificate.instructions as Record<
      string,
      unknown
    >;
    expect(question.proposition).toContain("customer");
    expect(question.task).toContain("contractor or supplier");
    expect(request.state.evidence[0].text).toContain(
      "customer has not received",
    );
  });
});
