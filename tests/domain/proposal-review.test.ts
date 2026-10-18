import { describe, expect, it } from 'vitest';
import { getScenario, evaluateDecision, applyProposal } from '@/lib/domain';

describe('independent review: proposal preconditions', () => {
  it('does not propose collection before the deposit condition can be met', () => {
    const input = getScenario('ductline-phase-delay')!;
    const deposit = input.job.events.find(e => e.id === input.job.negotiation!.depositEventId)!;
    deposit.date = '2026-10-18';
    const milestone = input.job.milestones.find(m => m.eventId === deposit.id)!;
    milestone.conditionDate = '2026-10-18';
    milestone.assumedCollectionDate = '2026-10-18';
    const decision = evaluateDecision(input);
    expect(decision.proposal?.status).not.toBe('AVAILABLE');
    if (decision.proposal?.status === 'AVAILABLE') expect(evaluateDecision(applyProposal(input, decision.proposal)).status).not.toBe('NEEDS_INPUT');
  });
  it('keeps invoice eligibility as a material precondition in candidate trials', () => {
    const input = getScenario('ductline-phase-delay')!;
    const deposit = input.job.events.find(e => e.id === input.job.negotiation!.depositEventId)!;
    deposit.date = '2026-10-18';
    const milestone = input.job.milestones.find(m => m.eventId === deposit.id)!;
    milestone.invoiceEligibleDate = '2026-10-18';
    milestone.assumedCollectionDate = '2026-10-18';
    expect(evaluateDecision(input).proposal?.status).not.toBe('AVAILABLE');
  });
  it('skips an invalid early date and finds a fully valid alternative in the allowed family', () => {
    const input = getScenario('ductline-phase-delay')!;
    const deposit = input.job.events.find(e => e.id === input.job.negotiation!.depositEventId)!;
    deposit.date = '2026-10-18';
    const milestone = input.job.milestones.find(m => m.eventId === deposit.id)!;
    milestone.conditionDate = '2026-10-08';
    milestone.assumedCollectionDate = '2026-10-18';
    input.job.negotiation!.allowedCollectionDates = ['2026-10-07', '2026-10-08'];
    const proposal = evaluateDecision(input).proposal!;
    expect(proposal.status).toBe('AVAILABLE');
    expect(proposal.proposedCollectionDate).toBe('2026-10-08');
    expect(proposal.additionalDepositCents).toBe(2_300_000);
    const candidate = applyProposal(input, proposal);
    const candidateResult = evaluateDecision(candidate);
    expect(candidateResult.status).toBe('SUPPORTED_IN_TESTED_SCENARIOS');
    expect(candidateResult.coverageComplete).toBe(true);
    expect(candidateResult.withJob.minimumCents).toBe(1_000_000);
  });
});
