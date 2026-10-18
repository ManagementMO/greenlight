import { describe, expect, it } from 'vitest';
import { POST } from '@/app/api/experiments/replay/route';

describe('verified provider replay', () => {
  it('recomputes frozen promotion gates and exposes recorded origin', async () => {
    const response = await POST();
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.origin).toBe('recorded');
    expect(data.evaluator.independentOfAuthor).toBe(true);
    expect(data.candidate.total).toBe(data.baseline.total);
    expect(data.candidate.falseSatisfied).toBe(0);
    expect(data.candidate.modelCalls).toBeLessThan(data.baseline.modelCalls);
  });
});
