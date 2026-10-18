import { applyProposal, evaluateDecision, getScenario, type DecisionInput, type DecisionResult } from "@/lib/domain";

/** A small, public projection of the same engine results used by the workspace. */
export function buildLandingCashStory(input: DecisionInput) {
  const current = evaluateDecision(input);
  const proposal = current.proposal;
  if (!current.coverageComplete || input.reserveCents === null || proposal?.status !== "AVAILABLE") return null;
  const proposed = evaluateDecision(applyProposal(input, proposal));
  if (!proposed.coverageComplete || proposed.status !== "SUPPORTED_IN_TESTED_SCENARIOS") return null;

  const project = (result: DecisionResult) => ({
    minimumCents: result.withJob.minimumCents,
    minimumDate: result.withJob.minimumDate,
    endingCents: result.withJob.endingCashCents,
    passing: result.passingScenarioCount,
    total: result.scenarioCount,
    points: result.withJob.timeline.map(({ date, cashCents, eventId, label }) => ({ date, cashCents, eventId, label })),
  });
  return {
    reserveCents: input.reserveCents,
    contractCents: proposal.totalRevenueCents,
    advanceCents: proposal.additionalDepositCents,
    current: { ...project(current), depositCents: proposal.originalDepositCents, finalCents: proposal.originalFinalReceiptCents },
    proposed: { ...project(proposed), depositCents: proposal.proposedDepositCents, finalCents: proposal.proposedFinalReceiptCents },
    phaseCents: proposal.totalRevenueCents - proposal.originalDepositCents - proposal.originalFinalReceiptCents,
  };
}

export function getLandingCashStory() {
  const input = getScenario("ductline-phase-delay");
  return input ? buildLandingCashStory(input) : null;
}

export type LandingCashStory = NonNullable<ReturnType<typeof buildLandingCashStory>>;
