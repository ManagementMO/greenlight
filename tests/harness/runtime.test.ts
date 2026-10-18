import { describe, expect, it } from 'vitest';
import { baselineManifest, candidateSchema, conditionKey, evidenceFor, promoteCandidate } from '@/lib/harness/runtime';

const event = { id: 'i1', companyId: 'c1', jobId: 'j1', subject: 'phase-1', text: 'Inspection passed.' };
const question = { id: 'inspection', subject: 'phase-1', statement: 'The phase-1 inspection passed.' };
describe('bounded workflow evolution', () => {
  it('rejects candidates that change tools, labels, evaluator, or executable code', () => {
    expect(candidateSchema.safeParse({ ...baselineManifest, evaluator: 'always pass' }).success).toBe(false);
    expect(candidateSchema.safeParse({ ...baselineManifest, confidenceThreshold: 0.2 }).success).toBe(false);
  });
  it('invalidates a cached judgment when evidence text, company, term, or model changes', () => {
    const key = conditionKey('jev-1.14.0', 'c1', 'j1', question, [event]);
    expect(conditionKey('jev-1.14.0', 'c2', 'j1', question, [event])).not.toBe(key);
    expect(conditionKey('jev-1.14.0', 'c1', 'j1', question, [{ ...event, text: 'Inspection failed.' }])).not.toBe(key);
    expect(conditionKey('jev-1.14.0', 'c1', 'j1', { ...question, statement: 'Inspection failed.' }, [event])).not.toBe(key);
    expect(conditionKey('jev-1.13.0', 'c1', 'j1', question, [event])).not.toBe(key);
  });
  it('scopes evidence without treating absence as a negative', () => {
    expect(evidenceFor([event], 'phase-2')).toEqual([]);
    expect(evidenceFor([event, { ...event, id: 'i2', subject: '*' }], 'phase-1')).toHaveLength(2);
  });
  it('rejects an apparent quality gain bought by refusing more cases', () => {
    expect(promoteCandidate({ correct: 8, total: 10, decisive: 9, falseSatisfied: 0, modelCalls: 10 }, { correct: 9, total: 10, decisive: 7, falseSatisfied: 0, modelCalls: 3 }).promoted).toBe(false);
  });
  it('promotes equal quality and coverage only when the measured workflow improves', () => {
    expect(promoteCandidate({ correct: 9, total: 10, decisive: 8, falseSatisfied: 0, modelCalls: 10 }, { correct: 9, total: 10, decisive: 8, falseSatisfied: 0, modelCalls: 5 }).promoted).toBe(true);
    expect(promoteCandidate({ correct: 9, total: 10, decisive: 8, falseSatisfied: 0, modelCalls: 10 }, { correct: 10, total: 10, decisive: 9, falseSatisfied: 1, modelCalls: 5 }).promoted).toBe(false);
  });
});
