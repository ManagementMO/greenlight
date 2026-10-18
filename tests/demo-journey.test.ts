import { describe, expect, it } from "vitest";
import { decisionResultsMatch, getJourneyCase } from "@/lib/demo-journey";
import { compactDecisionResult } from "@/lib/api/decision-capacity";

describe("guided decision demo", () => {
  it("uses validated engine inputs and a real, revenue-conserving proposal", () => {
    const {
      input,
      result,
      proposedInput,
      proposedResult,
      story,
      jobCostsCents,
    } = getJourneyCase();
    expect(result.withJob.minimumCents).toBe(-1_300_000);
    expect(proposedResult?.withJob.minimumCents).toBe(1_000_000);
    expect(story?.advanceCents).toBe(2_300_000);
    expect(jobCostsCents).toBe(8_000_000);
    for (const snapshot of [input, proposedInput!]) {
      expect(
        snapshot.job.events
          .filter((event) => event.direction === "inflow")
          .reduce((sum, event) => sum + event.amountCents!, 0),
      ).toBe(input.job.priceCents);
    }
  });

  it("exposes the combined risk and refuses a supported answer when evidence is missing", () => {
    const stress = getJourneyCase("ductline-joint-stress");
    expect(stress.result.scenarioCount).toBe(4);
    expect(stress.result.passingScenarioCount).toBe(3);
    expect(stress.result.withJob.minimumCents).toBe(900_000);
    const missing = getJourneyCase("ductline-missing-evidence");
    expect(missing.result.status).toBe("NEEDS_INPUT");
    expect(missing.story).toBeNull();
    expect(missing.proposedInput).toBeNull();
  });

  it("verifies the returned calculation as well as the snapshot identity", () => {
    const { result } = getJourneyCase();
    const compact = compactDecisionResult(result);
    expect(decisionResultsMatch(result, compact)).toBe(true);
    expect(
      decisionResultsMatch(result, { ...compact, inputHash: "stale" }),
    ).toBe(false);
    expect(
      decisionResultsMatch(result, { ...compact, passingScenarioCount: 2 }),
    ).toBe(false);
    expect(
      decisionResultsMatch(result, {
        ...compact,
        withJob: { ...compact.withJob, minimumCents: 0 },
      }),
    ).toBe(false);
    expect(
      decisionResultsMatch(result, {
        ...compact,
        withJob: { ...compact.withJob, timeline: [] },
      }),
    ).toBe(false);
    expect(decisionResultsMatch(result, { inputHash: result.inputHash })).toBe(
      false,
    );
    expect(decisionResultsMatch(result, null)).toBe(false);
  });
});
