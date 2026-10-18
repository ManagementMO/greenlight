import intuit from "../../data/scenarios/intuit-source.json";
import type { CashEvent, ScenarioFixture, SourceEvidence } from "./types";

const source = (
  value: Omit<SourceEvidence, "provenance" | "observedDate" | "effectiveDate">,
): SourceEvidence => ({
  ...value,
  provenance: "constructed_fixture",
  observedDate: "2026-10-06",
  effectiveDate: "2026-10-06",
});
const cash = (
  id: string,
  label: string,
  date: string,
  amountCents: number,
  direction: "inflow" | "outflow",
  scope: "baseline" | "job",
  category: CashEvent["category"],
  sourceId: string,
): CashEvent => ({
  id,
  label,
  date,
  amountCents,
  direction,
  scope,
  category,
  sourceIds: [sourceId],
  settlement: direction === "inflow" ? "assumed" : "committed",
});

const phaseDelay: ScenarioFixture = {
  id: "ductline-phase-delay",
  version: 1,
  name: "Ductline · the $120k decision",
  description:
    "A profitable HVAC retrofit depends on when phase-one money actually reaches the bank.",
  narrative:
    "Can Ductline take a $120,000 clinic retrofit without borrowing or missing payroll? Inspection can make an invoice eligible, but the customer has two possible settlement windows. The difference creates a $23,000 reserve gap.",
  company: {
    id: intuit.companyId,
    name: intuit.companyName,
    industry: "Commercial HVAC installation",
  },
  currency: "USD",
  snapshotDate: intuit.snapshotDate,
  horizonDate: "2026-11-25",
  calendarCoverageEnd: "2026-11-25",
  forwardCalendarConfirmed: true,
  openingCashCents: intuit.bankBalanceCents,
  reserveCents: 1_000_000,
  commitments: [
    cash(
      "existing-rent",
      "Existing shop rent and overhead",
      "2026-10-07",
      800_000,
      "outflow",
      "baseline",
      "overhead",
      "forward-calendar",
    ),
    cash(
      "existing-payroll",
      "Existing business payroll",
      "2026-10-09",
      1_800_000,
      "outflow",
      "baseline",
      "payroll",
      "forward-calendar",
    ),
    cash(
      "legacy-supplier",
      "Previously committed supplier settlement",
      "2026-10-10",
      2_388_238,
      "outflow",
      "baseline",
      "supplier",
      "forward-calendar",
    ),
  ],
  job: {
    id: "clinic-retrofit-120",
    name: "Northstar Clinic HVAC retrofit",
    customer: "Northstar Clinic · fictional customer",
    priceCents: 12_000_000,
    events: [
      cash(
        "job-deposit",
        "35% deposit collected",
        "2026-10-07",
        4_200_000,
        "inflow",
        "job",
        "deposit",
        "signed-contract",
      ),
      cash(
        "materials-one",
        "Air handlers · first delivery",
        "2026-10-12",
        2_500_000,
        "outflow",
        "job",
        "supplier",
        "job-budget",
      ),
      cash(
        "job-labor-one",
        "Installation crew · first payroll",
        "2026-10-17",
        1_500_000,
        "outflow",
        "job",
        "labor",
        "job-budget",
      ),
      cash(
        "phase-receipt",
        "Phase-one payment collected",
        "2026-10-24",
        3_000_000,
        "inflow",
        "job",
        "collection",
        "customer-email",
      ),
      cash(
        "job-labor-two",
        "Commissioning crew · second payroll",
        "2026-10-31",
        1_500_000,
        "outflow",
        "job",
        "labor",
        "job-budget",
      ),
      cash(
        "materials-two",
        "Controls and ductwork · final delivery",
        "2026-11-04",
        2_500_000,
        "outflow",
        "job",
        "supplier",
        "job-budget",
      ),
      cash(
        "final-receipt",
        "Final contract payment collected",
        "2026-11-20",
        4_800_000,
        "inflow",
        "job",
        "collection",
        "signed-contract",
      ),
    ],
    milestones: [
      {
        id: "deposit",
        label: "Deposit",
        eventId: "job-deposit",
        amountCents: 4_200_000,
        condition: "Signed contract and agreed pre-mobilization deposit",
        judgment: "EXPECTED",
        assumedCollectionDate: "2026-10-07",
        sourceIds: ["signed-contract"],
      },
      {
        id: "phase-one",
        label: "Phase one",
        eventId: "phase-receipt",
        amountCents: 3_000_000,
        condition:
          "Inspection passes AND customer receives insurance certificate; invoice eligibility alone does not establish settlement",
        judgment: "EXPECTED",
        conditionDate: "2026-10-20",
        invoiceEligibleDate: "2026-10-20",
        invoiceIssuedDate: "2026-10-20",
        dueDate: "2026-11-03",
        dueRule: {
          kind: "CALENDAR_DAYS_AFTER_INVOICE_ISSUED",
          days: 14,
          invoiceSubject: "phase_1",
        },
        assumedCollectionDate: "2026-10-24",
        sourceIds: ["signed-contract", "customer-email", "inspection-plan"],
      },
      {
        id: "final",
        label: "Final payment",
        eventId: "final-receipt",
        amountCents: 4_800_000,
        condition:
          "Final commissioning accepted; fixed bounded collection assumption",
        judgment: "EXPECTED",
        conditionDate: "2026-11-05",
        assumedCollectionDate: "2026-11-20",
        sourceIds: ["signed-contract"],
      },
    ],
    negotiation: {
      depositEventId: "job-deposit",
      offsetReceiptEventId: "final-receipt",
      maxAdditionalCents: 4_800_000,
      allowedCollectionDates: ["2026-10-07"],
      sourceIds: ["negotiation-bounds"],
    },
  },
  evidence: [
    {
      id: "intuit-bank",
      title: "Intuit company-047 · ending bank ledger",
      kind: "dataset",
      text: "bank-002419 · 2026-10-06 · amount 232.96 · running_balance_amount 74882.38. This is synthetic sponsor accounting data. It establishes the bank ledger balance, not future spend or unrestricted availability.",
      observedDate: "2026-10-06",
      effectiveDate: "2026-10-06",
      provenance: "sponsor_dataset",
      url: intuit.datasetUrl,
      sha256: intuit.bankTransactionsSha256,
      spanId: "bank-002419",
    },
    source({
      id: "forward-calendar",
      title: "Constructed forward business calendar",
      kind: "calendar",
      text: "DEMO ADDITION. Treat the full $74,882.38 bank balance as available; restricted funds are $0 under an explicit fixture assumption. Remaining non-job obligations through November 25: $8,000 overhead Oct 7, $18,000 payroll Oct 9, $23,882.38 supplier settlement Oct 10. Later modeled crew wages appear once in the job budget. No other obligations or inflows are asserted within this constructed coverage window.",
    }),
    source({
      id: "signed-contract",
      title: "C-120 · clinic retrofit contract",
      kind: "contract",
      spanId: "C-120:s8",
      text: "DEMO ADDITION. Total contract: USD 120,000. Deposit USD 42,000 before mobilization. USD 30,000 becomes invoice-eligible after BOTH phase-one inspection has passed and the customer's project manager has received the insurance certificate. Payment terms: fourteen calendar days after invoice issuance. Final USD 48,000 after commissioning acceptance. Invoice eligibility, contractual due date, and bank settlement are distinct.",
    }),
    source({
      id: "customer-email",
      title: "Customer accounts-payable settlement windows",
      kind: "email",
      text: "DEMO ADDITION. If the phase invoice is approved for our expedited run, we expect $30,000 to settle October 24. Otherwise our next run will settle November 20. This is a bounded forecast assumption, not an observed bank payment or a signed replacement of the contract's due date.",
    }),
    source({
      id: "inspection-plan",
      title: "Phase-one inspection and certificate plan",
      kind: "inspection",
      text: "DEMO ADDITION. Inspection and customer certificate receipt are expected October 20. Neither is observed at the October 6 snapshot. A future expected condition is explicitly assumed; it is not represented as an already passed inspection.",
    }),
    source({
      id: "job-budget",
      title: "Constructed supplier and crew budget",
      kind: "calendar",
      text: "DEMO ADDITION. First air-handler delivery $25,000 October 12; installation crew $15,000 October 17; commissioning crew $15,000 October 31; controls/ductwork delivery $25,000 November 4. Total job outflows $80,000. These are future fixture commitments, not extracted historic Intuit transactions.",
    }),
    source({
      id: "negotiation-bounds",
      title: "Allowed negotiation · revenue advance only",
      kind: "assumption",
      text: "DEMO ADDITION. Customer may consider advancing up to the full $48,000 final receipt into the October 7 deposit. Every additional deposit cent reduces the final receipt by one cent. This is permission to explore a proposal, not an executed agreement. Supplier dates and job start are fixed.",
    }),
  ],
  assumptions: [
    "Dataset clock is October 6, 2026; it is not the current wall-clock date.",
    "Only bank balance and company identity are source-backed Intuit fields; all forward plans and documents are constructed additions.",
    "Opening available cash equals the $74,882.38 ledger balance only under the fixture's explicit zero-restricted-funds assumption.",
    "The supplied forward calendar is treated as complete through November 25 for this demonstration; a real owner must confirm it.",
    "Phase conditions are expected October 20; the two AP settlement windows form the declared uncertainty family.",
  ],
  unresolvedTerms: [],
  uncertainties: [
    {
      id: "phase-collection",
      question:
        "Will the $30,000 phase payment reach the bank October 24 or November 20?",
      owner: "Northstar accounts payable",
      requiredBy: "2026-10-12",
      sourceIds: ["customer-email"],
      options: [
        {
          id: "expedited",
          label: "October 24 · expedited",
          explanation:
            "Customer confirms the expedited bank settlement window.",
          patches: [{ eventId: "phase-receipt", date: "2026-10-24" }],
        },
        {
          id: "standard",
          label: "November 20 · standard",
          explanation:
            "Invoice permission is established, but collection waits for the standard run.",
          patches: [{ eventId: "phase-receipt", date: "2026-11-20" }],
        },
      ],
    },
  ],
  provenance: {
    label: "Intuit synthetic books + disclosed Headroom scenario additions",
    datasetUrl: intuit.datasetUrl,
    accountingSource: "company-047 / bank-002419 / 2026-10-06 / $74,882.38",
    additions: [
      "Zero restricted funds and reserve policy",
      "Complete future business calendar",
      "$120,000 candidate job and cost schedule",
      "Contract, email and inspection text",
      "Settlement uncertainty and negotiation limits",
    ],
    synthetic: true,
  },
};

const jointStress: ScenarioFixture = structuredClone(phaseDelay);
jointStress.id = "ductline-joint-stress";
jointStress.name = "Ductline · two small risks";
jointStress.description =
  "Two $4,000 supplier overruns are safe individually and breach the reserve together.";
jointStress.narrative =
  "The expedited phase payment is now the fixed assumption. Air handlers and controls each have a possible $4,000 surcharge. Looking at each risk alone misses the joint $1,000 reserve gap.";
jointStress.uncertainties = ["materials-one", "materials-two"].map(
  (eventId, index) => ({
    id: `supplier-${index + 1}`,
    question: `Will ${index === 0 ? "the air-handler" : "the controls"} supplier honor its $25,000 quote?`,
    owner: index === 0 ? "Air-handler supplier" : "Controls supplier",
    requiredBy: index === 0 ? "2026-10-11" : "2026-10-30",
    sourceIds: ["supplier-stress"],
    options: [
      {
        id: "quoted",
        label: "$25,000 · quote honored",
        explanation: "Quoted amount remains valid.",
        patches: [{ eventId, amountCents: 2_500_000 }],
      },
      {
        id: "surcharge",
        label: "$29,000 · surcharge",
        explanation: "Bounded $4,000 surcharge is applied.",
        patches: [{ eventId, amountCents: 2_900_000 }],
      },
    ],
  }),
);
jointStress.evidence.push(
  source({
    id: "supplier-stress",
    title: "Constructed supplier uncertainty bounds",
    kind: "assumption",
    text: "DEMO ADDITION. Each of the two deliveries may cost either $25,000 or $29,000. Both surcharges may occur together; they are not mutually exclusive. The expedited October 24 phase collection is fixed for this scenario family.",
  }),
);
jointStress.assumptions.push(
  "The expedited October 24 collection is fixed here; both supplier surcharges may jointly occur.",
);

const incomplete: ScenarioFixture = structuredClone(phaseDelay);
incomplete.id = "ductline-missing-evidence";
incomplete.name = "Ductline · evidence gap";
incomplete.description =
  "A reassuring email and gross-only payroll figures cannot establish cash coverage.";
incomplete.narrative =
  "A message says 'approved to bill,' while inspection acceptance is disputed and a payroll-tax amount is missing. Headroom keeps partial cash paths visible and withholds a supported verdict until material facts are resolved.";
incomplete.unresolvedTerms = [
  "Phase acceptance conflicts with the customer's unresolved punch-list message.",
  "Gross-only payroll history does not establish employer taxes; the future payroll-tax amount needs confirmation.",
];
incomplete.job.milestones[1].judgment = "CONFLICTING";
incomplete.commitments.push({
  ...cash(
    "unknown-payroll-tax",
    "Employer payroll taxes · amount unconfirmed",
    "2026-11-10",
    0,
    "outflow",
    "baseline",
    "tax",
    "payroll-gap",
  ),
  amountCents: null,
});
incomplete.evidence.push(
  source({
    id: "payroll-gap",
    title: "Constructed missing payroll and acceptance evidence",
    kind: "email",
    text: "DEMO ADDITION. Our customer contact said 'approved to bill,' but the authorized project manager still lists inspection punch items as unresolved. Payroll numbers are gross-only and employer tax liabilities for November 10 have not been supplied. Unknown amounts must remain unknown.",
  }),
);
incomplete.assumptions.push(
  "Partial plotted paths omit the unquantified tax movement; no positive conclusion may be drawn from them.",
);

const fixtures = [phaseDelay, jointStress, incomplete];
export function listScenarios(): ScenarioFixture[] {
  return structuredClone(fixtures);
}
export function getScenario(id: string): ScenarioFixture | undefined {
  const found = fixtures.find((fixture) => fixture.id === id);
  return found ? structuredClone(found) : undefined;
}
