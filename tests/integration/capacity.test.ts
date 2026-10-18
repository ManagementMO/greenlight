import { describe, expect, it } from 'vitest';
import { getScenario } from '@/lib/domain';
import { POST } from '@/app/api/decision/route';

describe('public solver capacity', () => {
  it('does not expand a small request into unbounded per-case timeline output', async () => {
    const input = getScenario('ductline-phase-delay')!;
    input.job.milestones = []; delete input.job.negotiation;
    const sourceIds = [input.evidence[0].id];
    const common = { date: '2026-10-08', label: 'cash '.repeat(140), sourceIds, settlement: 'assumed' as const, category: 'other' as const };
    input.commitments = Array.from({ length: 128 }, (_, i) => ({ ...common, id: 'b' + i, direction: 'outflow' as const, scope: 'baseline' as const, amountCents: 0 }));
    input.job.events = Array.from({ length: 128 }, (_, i) => ({ ...common, id: 'j' + i, direction: 'inflow' as const, scope: 'job' as const, amountCents: i === 0 ? input.job.priceCents : 0 }));
    input.uncertainties = Array.from({ length: 8 }, (_, i) => ({ id: 'u' + i, question: 'Which bound applies?', owner: 'Owner', requiredBy: '2026-10-07', sourceIds, options: [{ id: 'a', label: 'A', explanation: 'A', patches: [] }, { id: 'b', label: 'B', explanation: 'B', patches: [] }] }));
    const res = await POST(new Request('http://localhost/api/decision', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) }));
    const body = await res.text();
    expect(res.status).toBe(200);
    expect(Buffer.byteLength(body)).toBeLessThan(2_097_152);
    const compact = JSON.parse(body);
    expect(compact.representation).toBe('compact-v1');
    expect(compact.scenarioCount).toBe(256);
    expect(compact.outcomes[0].withJob).not.toHaveProperty('timeline');
    expect(compact.withJob.timeline.length).toBeGreaterThan(0);
  });
  it('counts UTF-8 bytes before parsing rather than JavaScript characters', async () => {
    const res = await POST(new Request('http://localhost/api/decision', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: 'é'.repeat(140_000) }));
    expect(res.status).toBe(413);
  });
  it('rejects excessive deposit search before expensive scenario calculation', async () => {
    const input = getScenario('ductline-phase-delay')!;
    input.job.negotiation!.maxAdditionalCents = Number.MAX_SAFE_INTEGER;
    input.job.negotiation!.allowedCollectionDates = Array(8).fill('2026-10-07');
    input.commitments = Array.from({ length: 128 }, (_, i) => ({ ...input.commitments[0], id: 'b' + i, amountCents: 0 }));
    input.uncertainties = Array.from({ length: 8 }, (_, i) => ({ ...input.uncertainties[0], id: 'u' + i }));
    const res = await POST(new Request('http://localhost/api/decision', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) }));
    expect(res.status).toBe(422);
    expect((await res.json()).code).toBe('CALCULATION_CAPACITY');
  });
});
