export type DecisionStatus =
  | "NEEDS_INPUT"
  | "SHORTFALL"
  | "CONDITIONAL"
  | "SUPPORTED_IN_TESTED_SCENARIOS";
export type ISODate = string;
export type MoneyCents = number;
export type PaymentDueRule =
  | { kind: "CALENDAR_DAYS_AFTER_TRIGGER"; days: number }
  | {
      kind: "CALENDAR_DAYS_AFTER_INVOICE_ISSUED";
      days: number;
      invoiceSubject: string;
    }
  | { kind: "ON_DATE"; date: ISODate };
export interface SourceEvidence {
  id: string;
  title: string;
  kind:
    | "dataset"
    | "contract"
    | "amendment"
    | "email"
    | "inspection"
    | "calendar"
    | "assumption";
  text: string;
  observedDate: ISODate;
  effectiveDate: ISODate;
  provenance: "sponsor_dataset" | "constructed_fixture";
  url?: string;
  sha256?: string;
  spanId?: string;
  supersedes?: string;
}
export interface CashEvent {
  id: string;
  label: string;
  date: ISODate | null;
  amountCents: MoneyCents | null;
  direction: "inflow" | "outflow";
  scope: "baseline" | "job";
  category:
    | "payroll"
    | "supplier"
    | "overhead"
    | "tax"
    | "collection"
    | "deposit"
    | "labor"
    | "other";
  sourceIds: string[];
  settlement: "observed" | "assumed" | "committed";
  /** When every event on a day has a known order, respect it. Otherwise outflows precede inflows. */
  intradayOrder?: number;
  includedInOpeningCash?: boolean;
  supersedes?: string;
}
export interface Milestone {
  id: string;
  label: string;
  amountCents: MoneyCents;
  eventId: string;
  condition: string;
  judgment: "MET" | "NOT_MET" | "EXPECTED" | "UNKNOWN" | "CONFLICTING";
  conditionDate?: ISODate;
  invoiceEligibleDate?: ISODate;
  invoiceIssuedDate?: ISODate;
  dueDate?: ISODate;
  /** Manually reviewed contract clock. Its due date is never an assumed bank settlement. */
  dueRule?: PaymentDueRule;
  assumedCollectionDate: ISODate | null;
  sourceIds: string[];
}
export interface EventPatch {
  eventId: string;
  date?: ISODate | null;
  amountCents?: MoneyCents | null;
  excluded?: boolean;
}
export interface UncertaintyOption {
  id: string;
  label: string;
  explanation: string;
  patches: EventPatch[];
  requires?: Record<string, string>;
}
export interface DecisionUncertainty {
  id: string;
  question: string;
  owner: string;
  requiredBy: ISODate;
  sourceIds: string[];
  options: UncertaintyOption[];
}
export interface DepositNegotiation {
  depositEventId: string;
  offsetReceiptEventId: string;
  maxAdditionalCents: MoneyCents;
  allowedCollectionDates: ISODate[];
  sourceIds: string[];
}
export interface DecisionInput {
  id: string;
  version: number;
  company: { id: string; name: string; industry: string };
  currency: "USD";
  snapshotDate: ISODate;
  horizonDate: ISODate;
  calendarCoverageEnd: ISODate;
  forwardCalendarConfirmed: boolean;
  openingCashCents: MoneyCents | null;
  reserveCents: MoneyCents | null;
  commitments: CashEvent[];
  job: {
    id: string;
    name: string;
    customer: string;
    priceCents: MoneyCents;
    events: CashEvent[];
    milestones: Milestone[];
    negotiation?: DepositNegotiation;
  };
  evidence: SourceEvidence[];
  assumptions: string[];
  unresolvedTerms: string[];
  uncertainties: DecisionUncertainty[];
  answers?: Record<string, string>;
}
export interface ScenarioFixture extends DecisionInput {
  name: string;
  description: string;
  narrative: string;
  provenance: {
    label: string;
    datasetUrl: string;
    accountingSource: string;
    additions: string[];
    synthetic: true;
  };
}
export interface TimelinePoint {
  eventId: string;
  date: ISODate;
  label: string;
  deltaCents: MoneyCents;
  cashCents: MoneyCents;
  scope: "baseline" | "job" | "snapshot";
  sourceIds: string[];
  assumed: boolean;
}
export interface CashPath {
  timeline: TimelinePoint[];
  minimumCents: MoneyCents;
  minimumDate: ISODate;
  endingCashCents: MoneyCents;
  reserveGapCents: MoneyCents;
}
export interface ScenarioOutcome {
  id: string;
  answers: Record<string, string>;
  labels: string[];
  baseline: CashPath;
  withJob: CashPath;
  passes: boolean;
}
export interface DecisionReason {
  code: string;
  message: string;
  sourceIds: string[];
}
export interface Proposal {
  /** Snapshot identity prevents applying a proposal generated against stale evidence or inputs. */
  inputHash?: string;
  kind: "deposit_advance";
  status: "AVAILABLE" | "NOT_NEEDED" | "UNAVAILABLE";
  label: string;
  additionalDepositCents: MoneyCents;
  originalDepositCents: MoneyCents;
  proposedDepositCents: MoneyCents;
  originalFinalReceiptCents: MoneyCents;
  proposedFinalReceiptCents: MoneyCents;
  originalCollectionDate: ISODate;
  proposedCollectionDate: ISODate;
  totalRevenueCents: MoneyCents;
  minimumCashCents: MoneyCents;
  reserveGapCents: MoneyCents;
  requiredAgreements: string[];
  sourceIds: string[];
  limitation: string;
}
export interface QuestionBranch {
  optionId: string;
  label: string;
  scenarioCount: number;
  passingCount: number;
  worstReserveGapCents: MoneyCents;
  witnessScenarioId: string | null;
}
export interface NextQuestion {
  id: string;
  question: string;
  owner: string;
  requiredBy: ISODate;
  sourceIds: string[];
  distinguishesFeasibility: boolean;
  reserveGapImpactCents: MoneyCents;
  earliestAffectedDate: ISODate;
  branches: QuestionBranch[];
}
export interface DecisionResult {
  inputId: string;
  inputVersion: number;
  inputHash: string;
  status: DecisionStatus;
  statusLabel: string;
  reasons: DecisionReason[];
  baseline: CashPath;
  withJob: CashPath;
  scenarioCount: number;
  possibleScenarioCount: number;
  passingScenarioCount: number;
  coverageComplete: boolean;
  scenarioLimit: number;
  outcomes: ScenarioOutcome[];
  minimumCashRange: { worstCents: MoneyCents; bestCents: MoneyCents };
  reserveGapCents: MoneyCents;
  incrementalReserveGapCents: MoneyCents;
  proposal: Proposal | null;
  nextQuestions: NextQuestion[];
  evidenceIds: string[];
  assumptions: string[];
}
