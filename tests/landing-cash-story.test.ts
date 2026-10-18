import { describe, expect, it } from "vitest";
import { applyProposal, evaluateDecision, getScenario } from "@/lib/domain";
import { buildLandingCashStory, getLandingCashStory } from "@/lib/landing-cash-story";

describe("landing cash story", () => {
  it("shows the workspace engine's exact worst paths, including ordered same-day events", () => {
    const input = getScenario("ductline-phase-delay")!;
    const before = evaluateDecision(input);
    const after = evaluateDecision(applyProposal(input, before.proposal!));
    const story = getLandingCashStory()!;
    for (const [view, result] of [[story.current, before], [story.proposed, after]] as const) {
      expect(view.points.map(p => [p.eventId, p.date, p.cashCents])).toEqual(result.withJob.timeline.map(p => [p.eventId, p.date, p.cashCents]));
      expect(Math.min(...view.points.map(p => p.cashCents))).toBe(view.minimumCents);
      expect(view.passing).toBe(result.passingScenarioCount);
    }
    expect(story.current.minimumCents).toBe(-1_300_000);
    expect(story.proposed.minimumCents).toBe(1_000_000);
  });

  it("moves revenue earlier without inventing extra revenue or ending cash", () => {
    const story = getLandingCashStory()!;
    for (const view of [story.current, story.proposed]) {
      expect(view.depositCents + story.phaseCents + view.finalCents).toBe(story.contractCents);
    }
    expect(story.proposed.depositCents - story.current.depositCents).toBe(story.advanceCents);
    expect(story.current.finalCents - story.proposed.finalCents).toBe(story.advanceCents);
    expect(story.current.endingCents).toBe(story.proposed.endingCents);
    expect(story.proposed.passing).toBe(story.proposed.total);
  });

  it("withholds the comparison if material inputs or a supported proposal are missing", () => {
    const input = getScenario("ductline-phase-delay")!;
    input.reserveCents = null;
    expect(buildLandingCashStory(input)).toBeNull();
    expect(buildLandingCashStory(getScenario("ductline-missing-evidence")!)).toBeNull();
  });
});
