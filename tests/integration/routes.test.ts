import { describe, expect, it } from 'vitest';
import { GET as health } from '@/app/api/health/route';
import { GET as artifacts } from '@/app/api/artifacts/route';
import { POST as decision } from '@/app/api/decision/route';

describe('public API contract', () => {
  it('exposes a health response with no paid public model path', async () => {
    const res = await health();
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.paidPublicInference).toBe(false);
    expect(JSON.stringify(data)).not.toMatch(/sk-ant-|hf_[a-zA-Z0-9]{10}/);
  });
  it('returns the sanitized public experiment manifest', async () => {
    const data = await (await artifacts()).json();
    expect(data.schemaVersion).toBe(1);
    expect(data.budget.capUsd).toBe(20);
    expect(data).not.toHaveProperty('credentials');
  });
  it('rejects a non-JSON request', async () => {
    const res = await decision(new Request('http://localhost/api/decision', { method: 'POST', body: '{}' }));
    expect(res.status).toBe(415);
  });
  it('rejects invalid JSON and unknown scenarios with distinct errors', async () => {
    const request = (body: string) => new Request('http://localhost/api/decision', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
    expect((await decision(request('{'))).status).toBe(400);
    expect((await decision(request('{"scenarioId":"does-not-exist"}'))).status).toBe(404);
    expect((await decision(request('null'))).status).toBe(400);
  });
  it('limits snapshot payload size before JSON parsing', async () => {
    const res = await decision(new Request('http://localhost/api/decision', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: 'x'.repeat(262145) }));
    expect(res.status).toBe(413);
  });
});
