import {
  applyProposal,
  evaluateDecision,
  getScenario,
  validateDecisionInput,
  type DecisionInput,
  type DecisionResult,
} from "@/lib/domain";
import { buildLandingCashStory } from "@/lib/landing-cash-story";

export function getJourneyCase(id = "ductline-phase-delay") {
  const parsed = validateDecisionInput(getScenario(id));
  if (!parsed.success)
    throw new Error("The guided case needs a valid decision snapshot.");
  const input: DecisionInput = parsed.data;
  const result = evaluateDecision(input);
  const proposedInput =
    result.proposal?.status === "AVAILABLE"
      ? applyProposal(input, result.proposal)
      : null;
  return {
    input,
    result,
    proposedInput,
    proposedResult: proposedInput ? evaluateDecision(proposedInput) : null,
    story: buildLandingCashStory(input),
    jobCostsCents: input.job.events
      .filter((event) => event.direction === "outflow")
      .reduce((sum, event) => sum + (event.amountCents ?? 0), 0),
  };
}

/** An input hash alone does not prove that the server returned the same verdict. */
export function decisionResultsMatch(
  local: DecisionResult,
  value: unknown,
): boolean {
  if (!value || typeof value !== "object") return false;
  const server = value as Partial<DecisionResult>;
  return (
    server.inputHash === local.inputHash &&
    server.status === local.status &&
    server.coverageComplete === local.coverageComplete &&
    server.scenarioCount === local.scenarioCount &&
    server.passingScenarioCount === local.passingScenarioCount &&
    server.reserveGapCents === local.reserveGapCents &&
    server.minimumCashRange?.worstCents === local.minimumCashRange.worstCents &&
    server.minimumCashRange?.bestCents === local.minimumCashRange.bestCents &&
    server.withJob?.minimumCents === local.withJob.minimumCents &&
    server.withJob?.endingCashCents === local.withJob.endingCashCents &&
    server.withJob?.minimumDate === local.withJob.minimumDate &&
    Array.isArray(server.withJob?.timeline) &&
    server.withJob.timeline.length === local.withJob.timeline.length &&
    server.withJob.timeline.every(
      (point, index) =>
        point?.eventId === local.withJob.timeline[index].eventId &&
        point?.date === local.withJob.timeline[index].date &&
        point?.cashCents === local.withJob.timeline[index].cashCents,
    )
  );
}

export function demoMoney(cents: number, compact = false) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: compact ? 1 : cents % 100 === 0 ? 0 : 2,
    ...(compact ? { notation: "compact" as const } : {}),
  }).format(cents / 100);
}
