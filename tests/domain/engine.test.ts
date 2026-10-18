import { describe, expect, it } from "vitest";
import type { CashEvent, DecisionInput } from "../../lib/domain/types";
import { applyProposal, evaluateDecision, reviseDeposit, reviseEvent, withScenarioAnswer } from "../../lib/domain/engine";

function event(id: string, date: string, amountCents: number, direction: "inflow" | "outflow", scope: "baseline" | "job" = "job"): CashEvent {
  return { id, date, amountCents, direction, scope, label: id, category: direction === "inflow" ? "collection" : "supplier", sourceIds: ["source"], settlement: "assumed" };
}
function input(): DecisionInput {
  return {
    id: "test", version: 1, company: { id: "test-company", name: "Test", industry: "HVAC" }, currency: "USD",
    snapshotDate: "2026-10-06", horizonDate: "2026-11-30", calendarCoverageEnd: "2026-11-30", forwardCalendarConfirmed: true,
    openingCashCents: 2_500_000, reserveCents: 1_000_000, commitments: [], uncertainties: [], unresolvedTerms: [], assumptions: [],
    evidence: [{ id: "source", title: "Fixture", kind: "contract", text: "Constructed example", observedDate: "2026-10-06", effectiveDate: "2026-10-06", provenance: "constructed_fixture" }],
    job: { id: "job", name: "Job", customer: "Customer", priceCents: 12_000_000, milestones: [], events: [
      event("materials", "2026-10-08", 5_000_000, "outflow"),
      event("labor-1", "2026-10-13", 1_500_000, "outflow"),
      event("labor-2", "2026-10-27", 1_500_000, "outflow"),
      event("deposit", "2026-10-07", 0, "inflow"),
      event("phase", "2026-10-20", 0, "inflow"),
      event("final", "2026-11-20", 12_000_000, "inflow"),
    ], negotiation: { depositEventId: "deposit", offsetReceiptEventId: "final", maxAdditionalCents: 8_000_000, allowedCollectionDates: ["2026-10-07"], sourceIds: ["source"] } },
  };
}
function revised(): DecisionInput {
  const x = input();
  x.job.events = [
    event("deposit", "2026-10-07", 4_200_000, "inflow"), event("materials", "2026-10-08", 2_500_000, "outflow"),
    event("labor-1", "2026-10-13", 1_500_000, "outflow"), event("phase", "2026-10-20", 3_000_000, "inflow"),
    event("labor-2", "2026-10-27", 1_500_000, "outflow"), event("materials-2", "2026-10-31", 2_500_000, "outflow"),
    event("final", "2026-11-20", 4_800_000, "inflow"),
  ];
  x.job.negotiation!.maxAdditionalCents = 4_800_000;
  return x;
}

describe("cash timing and provenance", () => {
  it("catches a profitable job paid late rather than using final profit", () => {
    const r = evaluateDecision(input());
    expect(r.withJob.minimumCents).toBe(-5_500_000);
    expect(r.withJob.endingCashCents).toBe(6_500_000);
    expect(r.status).toBe("SHORTFALL");
    expect(r.baseline.minimumCents).toBe(2_500_000);
  });
  it("supports the independently calculated early-collection plan", () => {
    const r = evaluateDecision(revised());
    expect(r.withJob.minimumCents).toBe(1_700_000);
    expect(r.status).toBe("SUPPORTED_IN_TESTED_SCENARIOS");
  });
  it("draws both cash paths through the declared covered horizon even when the last receipt is earlier", () => {
    const result = evaluateDecision(revised());
    expect(result.withJob.timeline.at(-1)!.date).toBe("2026-11-30");
    expect(result.baseline.timeline.at(-1)!.date).toBe("2026-11-30");
  });
  it("keeps permission to invoice separate from an assumed late collection", () => {
    const x = revised();
    x.job.events.find(e => e.id === "phase")!.date = "2026-11-20";
    const r = evaluateDecision(x);
    expect(r.withJob.minimumCents).toBe(-1_300_000);
    expect(r.reserveGapCents).toBe(2_300_000);
  });
  it("orders unknown same-day outflows before receipts, exposing intraday payroll failure", () => {
    const x = input();
    x.openingCashCents = 1_000_000; x.reserveCents = 0; x.job.priceCents = 1_500_000;
    x.job.events = [event("receipt", "2026-10-08", 1_500_000, "inflow"), event("payroll", "2026-10-08", 1_500_000, "outflow")];
    expect(evaluateDecision(x).withJob.minimumCents).toBe(-500_000);
    expect(evaluateDecision(x).withJob.endingCashCents).toBe(1_000_000);
  });
  it("respects explicitly known intraday order only when every event that day supplies it", () => {
    const x = input(); x.openingCashCents = 1_000_000; x.reserveCents = 0; x.job.priceCents = 1_500_000;
    x.job.events = [{ ...event("receipt", "2026-10-08", 1_500_000, "inflow"), intradayOrder: 1 }, { ...event("payroll", "2026-10-08", 1_500_000, "outflow"), intradayOrder: 2 }];
    expect(evaluateDecision(x).withJob.minimumCents).toBe(1_000_000);
  });
  it("includes other company payroll and diagnoses baseline exposure separately", () => {
    const x = revised(); x.commitments = [event("other-payroll", "2026-10-31", 1_200_000, "outflow", "baseline")];
    expect(evaluateDecision(x).withJob.minimumCents).toBe(500_000);
    x.commitments[0].amountCents = 2_000_000;
    const r = evaluateDecision(x);
    expect(r.baseline.reserveGapCents).toBe(500_000);
    expect(r.reasons.some(v => v.code === "BASELINE_SHORTFALL")).toBe(true);
  });
  it("applies the same identity idempotently and blocks conflicting duplicate deliveries", () => {
    const x = revised(); x.job.events.push(structuredClone(x.job.events[1]));
    expect(evaluateDecision(x).withJob.minimumCents).toBe(1_700_000);
    x.job.events.at(-1)!.amountCents = 2_600_000;
    expect(evaluateDecision(x).status).toBe("NEEDS_INPUT");
    expect(evaluateDecision(x).reasons.some(v => v.code === "CONFLICTING_EVENT")).toBe(true);
  });
  it("excludes already-settled opening-balance movements", () => {
    const x = revised(); x.commitments.push({ ...event("settled", "2026-10-05", 900_000, "outflow", "baseline"), settlement: "observed", includedInOpeningCash: true });
    expect(evaluateDecision(x).withJob.minimumCents).toBe(1_700_000);
  });
  it("does not hide known costs beyond the selected horizon", () => {
    const x = revised(); x.job.events.push(event("late-bill", "2026-12-02", 8_000_000, "outflow"));
    const r = evaluateDecision(x);
    expect(r.status).toBe("NEEDS_INPUT");
    expect(r.coverageComplete).toBe(false);
    expect(r.withJob.minimumCents).toBe(-1_500_000);
  });
  it("blocks unknown, fractional cents, unsupported clauses, unconfirmed calendars, and missing evidence", () => {
    for (const mutate of [
      (x: DecisionInput) => { x.openingCashCents = null; },
      (x: DecisionInput) => { x.job.events[0].amountCents = 1.5; },
      (x: DecisionInput) => { x.unresolvedTerms.push("Business-day calendar unknown"); },
      (x: DecisionInput) => { x.forwardCalendarConfirmed = false; },
      (x: DecisionInput) => { x.job.events[0].sourceIds = ["missing"]; },
    ]) { const x = revised(); mutate(x); expect(evaluateDecision(x).status).toBe("NEEDS_INPUT"); }
  });
  it("rejects unsafe aggregate arithmetic before giving any supported verdict", () => {
    const x = revised(); x.openingCashCents = Number.MAX_SAFE_INTEGER;
    expect(evaluateDecision(x).status).toBe("NEEDS_INPUT");
  });
  it("treats unknown milestone semantics as needs input even when arithmetic passes", () => {
    const x = revised(); x.job.milestones = [{ id: "phase", label: "Phase", amountCents: 3_000_000, eventId: "phase", condition: "Inspection passed", judgment: "UNKNOWN", assumedCollectionDate: "2026-10-20", sourceIds: ["source"] }];
    expect(evaluateDecision(x).status).toBe("NEEDS_INPUT");
  });
});

describe("joint scenarios and question sensitivity", () => {
  function stresses() {
    const x = revised();
    x.uncertainties = ["materials", "materials-2"].map((eventId, i) => ({ id: "stress-" + i, question: "Will supplier " + i + " honor its quote?", owner: "Supplier", requiredBy: "2026-10-07", sourceIds: ["source"], options: [
      { id: "quoted", label: "Quote honored", explanation: "Quoted amount", patches: [{ eventId, amountCents: 2_500_000 }] },
      { id: "overrun", label: "$4,000 overrun", explanation: "Bounded supply stress", patches: [{ eventId, amountCents: 2_900_000 }] },
    ] }));
    return x;
  }
  it("evaluates two individually safe stresses together", () => {
    const r = evaluateDecision(stresses());
    expect(r.scenarioCount).toBe(4); expect(r.passingScenarioCount).toBe(3);
    expect(r.withJob.minimumCents).toBe(900_000); expect(r.status).toBe("CONDITIONAL");
  });
  it("preserves other uncertainties when asking each question and retains witnesses", () => {
    const r = evaluateDecision(stresses()); const q = r.nextQuestions[0];
    expect(q.branches.map(b => b.scenarioCount)).toEqual([2, 2]);
    expect(q.distinguishesFeasibility).toBe(true);
    expect(q.reserveGapImpactCents).toBe(100_000);
    expect(q.branches.every(b => b.witnessScenarioId)).toBe(true);
  });
  it("respects mutually dependent admissible answers", () => {
    const x = stresses(); x.uncertainties[1].options[1].requires = { "stress-0": "overrun" };
    expect(evaluateDecision(x).scenarioCount).toBe(3);
  });
  it("runs exactly 256 joint scenarios and refuses to call a sampled 512 exhaustive", () => {
    const x = revised();
    x.uncertainties = Array.from({ length: 8 }, (_, i) => ({ id: "u" + i, question: "Q", owner: "Owner", requiredBy: "2026-10-07", sourceIds: ["source"], options: [{ id: "a", label: "A", explanation: "A", patches: [] }, { id: "b", label: "B", explanation: "B", patches: [] }] }));
    expect(evaluateDecision(x).coverageComplete).toBe(true); expect(evaluateDecision(x).scenarioCount).toBe(256);
    x.uncertainties.push({ ...x.uncertainties[0], id: "u8" });
    const r = evaluateDecision(x); expect(r.scenarioCount).toBe(256); expect(r.coverageComplete).toBe(false); expect(r.status).toBe("NEEDS_INPUT");
  });
  it("uses needs-input precedence over an otherwise all-failing or passing calculation", () => {
    const x = stresses(); x.calendarCoverageEnd = "2026-10-10";
    expect(evaluateDecision(x).status).toBe("NEEDS_INPUT");
  });
  it("changes hypotheses immutably and changes the input identity", () => {
    const x = stresses(); const y = withScenarioAnswer(x, "stress-0", "quoted");
    expect(x.answers).toBeUndefined(); expect(y.version).toBe(x.version + 1);
    expect(evaluateDecision(y).scenarioCount).toBe(2);
    expect(evaluateDecision(y).inputHash).not.toBe(evaluateDecision(x).inputHash);
    expect(() => withScenarioAnswer(x, "stress-0", "invented")).toThrow();
  });
});

describe("conserved, bounded funding proposals", () => {
  it("finds the smallest cent advance, conserves revenue, and leaves current status alone", () => {
    const x = revised(); x.job.events.find(e => e.id === "phase")!.date = "2026-11-20";
    const r = evaluateDecision(x); const p = r.proposal!;
    expect(r.status).toBe("SHORTFALL"); expect(p.status).toBe("AVAILABLE");
    expect(p.additionalDepositCents).toBe(2_300_000); expect(p.proposedDepositCents).toBe(6_500_000);
    expect(p.proposedFinalReceiptCents).toBe(2_500_000); expect(p.totalRevenueCents).toBe(12_000_000);
    expect(p.minimumCashCents).toBe(1_000_000);
    const candidate = reviseDeposit(x, { depositCents: p.proposedDepositCents, collectionDate: p.proposedCollectionDate });
    expect(evaluateDecision(candidate).status).toBe("SUPPORTED_IN_TESTED_SCENARIOS");
    const less = reviseDeposit(x, { depositCents: p.proposedDepositCents - 1 });
    expect(evaluateDecision(less).reserveGapCents).toBe(1);
  });
  it("does not claim a deposit can fix a deficit after the offsetting final receipt", () => {
    const x = revised(); x.job.events.push(event("late-cost", "2026-11-25", 7_000_000, "outflow"));
    const p = evaluateDecision(x).proposal!;
    expect(p.status).toBe("UNAVAILABLE"); expect(p.additionalDepositCents).toBe(0);
  });
  it("obeys deposit bounds and rejects unsupported edits", () => {
    const x = revised(); x.job.negotiation!.maxAdditionalCents = 1_000_000; x.job.events.find(e => e.id === "phase")!.date = "2026-11-20";
    expect(evaluateDecision(x).proposal!.status).toBe("UNAVAILABLE");
    expect(() => reviseDeposit(x, { depositCents: 5_200_001 })).toThrow();
    expect(() => reviseEvent(x, "missing", { date: "2026-10-10" })).toThrow();
  });
});

describe("adversarial input and correction boundaries", () => {
  it("blocks a scenario that tries to move an unpaid cost into the past", () => {
    const x = revised();
    x.uncertainties = [{ id: "past-cost", question: "Q", owner: "Owner", requiredBy: "2026-10-07", sourceIds: ["source"], options: [{ id: "past", label: "Past", explanation: "Invalid retroactive move", patches: [{ eventId: "materials", date: "2026-10-01" }] }] }];
    expect(evaluateDecision(x).status).toBe("NEEDS_INPUT");
  });
  it("blocks aggregate overflow introduced only by a scenario patch", () => {
    const x = revised();
    x.uncertainties = [{ id: "huge", question: "Q", owner: "Owner", requiredBy: "2026-10-07", sourceIds: ["source"], options: [{ id: "huge", label: "Huge", explanation: "Unsupported numeric range", patches: [{ eventId: "materials", amountCents: Number.MAX_SAFE_INTEGER }] }] }];
    const result = evaluateDecision(x);
    expect(result.status).toBe("NEEDS_INPUT");
    expect(result.reasons.some(reason => reason.code === "ARITHMETIC_OVERFLOW")).toBe(true);
  });
  it("cannot hide existing obligations from the baseline by relabeling their scope", () => {
    const x = revised(); x.commitments.push(event("baseline-payroll", "2026-10-10", 500_000, "outflow", "job"));
    expect(evaluateDecision(x).status).toBe("NEEDS_INPUT");
  });
  it("treats tied declared intraday orders as outflows first", () => {
    const x = input(); x.openingCashCents = 1_000_000; x.reserveCents = 0; x.job.priceCents = 1_500_000;
    x.job.events = [{ ...event("a-receipt", "2026-10-08", 1_500_000, "inflow"), intradayOrder: 1 }, { ...event("z-payroll", "2026-10-08", 1_500_000, "outflow"), intradayOrder: 1 }];
    expect(evaluateDecision(x).withJob.minimumCents).toBe(-500_000);
  });
  it("rejects correction cycles longer than two records", () => {
    const x = revised();
    x.job.events = x.job.events.filter(e => e.direction === "inflow");
    x.job.events.push({ ...event("cost-a", "2026-10-10", 100_000, "outflow"), supersedes: "cost-c" }, { ...event("cost-b", "2026-10-10", 100_000, "outflow"), supersedes: "cost-a" }, { ...event("cost-c", "2026-10-10", 100_000, "outflow"), supersedes: "cost-b" });
    expect(evaluateDecision(x).status).toBe("NEEDS_INPUT");
  });
  it("requires adjudication when two corrections supersede the same obligation", () => {
    const x = revised();
    x.job.events.push({ ...event("fix-a", "2026-10-08", 2_400_000, "outflow"), supersedes: "materials" }, { ...event("fix-b", "2026-10-08", 2_300_000, "outflow"), supersedes: "materials" });
    expect(evaluateDecision(x).status).toBe("NEEDS_INPUT");
  });
  it("rejects source observations that would leak future information into an earlier snapshot", () => {
    const x = revised(); x.evidence[0].observedDate = "2026-10-20";
    expect(evaluateDecision(x).status).toBe("NEEDS_INPUT");
  });
  it("cannot ratchet the maximum deposit through sequential what-if edits", () => {
    const x = revised(); x.job.negotiation!.maxAdditionalCents = 1_000_000;
    const changed = reviseDeposit(x, { depositCents: 5_000_000 });
    expect(() => reviseDeposit(changed, { depositCents: 5_300_000 })).toThrow();
    expect(evaluateDecision(changed).inputVersion).toBe(2);
    expect(x.job.events[0].amountCents).toBe(4_200_000);
  });
  it("rejects a proposal after the snapshot changes even when its monetary result happens to match", () => {
    const x = revised(); x.job.events.find(e => e.id === "phase")!.date = "2026-11-20";
    const proposal = evaluateDecision(x).proposal!;
    const updated = structuredClone(x); updated.version++; updated.assumptions.push("Reviewed the supplier source again");
    expect(() => applyProposal(updated, proposal)).toThrow(/stale/i);
  });
  it("does not model a milestone collection before its required condition date", () => {
    const x = revised(); x.job.milestones = [{ id: "phase", label: "Phase", amountCents: 3_000_000, eventId: "phase", condition: "Inspection passed", judgment: "EXPECTED", conditionDate: "2026-10-25", assumedCollectionDate: "2026-10-20", sourceIds: ["source"] }];
    expect(evaluateDecision(x).status).toBe("NEEDS_INPUT");
  });
  it("does not silently shift a supplier payment without a supported downstream dependency schedule", () => {
    expect(() => reviseEvent(revised(), "materials", { date: "2026-10-30" })).toThrow(/schedule/i);
  });
  it("never manufactures future cash by rewriting a deposit already contained in the opening balance", () => {
    const x = revised(); const deposit = x.job.events.find(e => e.id === "deposit")!;
    deposit.date = "2026-10-06"; deposit.settlement = "observed"; deposit.includedInOpeningCash = true;
    expect(() => reviseDeposit(x, { depositCents: 3_000_000 })).toThrow(/settled/i);
    expect(() => reviseEvent(x, "deposit", { date: "2026-10-07" })).toThrow(/settled/i);
  });
});
