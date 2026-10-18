import * as Sentry from '@sentry/nextjs';
import { evaluateDecision, getScenario, validateDecisionInput } from '@/lib/domain';
import { compactDecisionResult, estimatedDecisionWork, MAX_RESPONSE_BYTES, MAX_WORK_UNITS, readBoundedBody } from '@/lib/api/decision-capacity';

export const runtime = 'nodejs';
export async function POST(request: Request) {
  if (!request.headers.get('content-type')?.includes('application/json')) return Response.json({ error: 'Send application/json.', code: 'CONTENT_TYPE' }, { status: 415 });
  const body = await readBoundedBody(request);
  if (body === null) return Response.json({ error: 'Snapshot exceeds 256 KiB.', code: 'TOO_LARGE' }, { status: 413 });
  let value: unknown;
  try { value = JSON.parse(body); } catch { return Response.json({ error: 'Invalid JSON.', code: 'INVALID_JSON' }, { status: 400 }); }
  if (value && typeof value === 'object' && 'scenarioId' in value) {
    const id = (value as { scenarioId: unknown }).scenarioId;
    if (typeof id !== 'string') return Response.json({ error: 'scenarioId must be a string.', code: 'INVALID_INPUT' }, { status: 400 });
    value = getScenario(id);
    if (!value) return Response.json({ error: 'Scenario not found.', code: 'NOT_FOUND' }, { status: 404 });
  }
  const parsed = validateDecisionInput(value);
  if (!parsed.success) return Response.json({ error: 'The snapshot contains invalid fields.', code: 'INVALID_INPUT', fields: parsed.error.issues.map(i => ({ path: i.path.join('.'), message: i.message })).slice(0, 20) }, { status: 400 });
  const workUnits = estimatedDecisionWork(parsed.data);
  if (workUnits > MAX_WORK_UNITS) return Response.json({ error: 'This snapshot exceeds the public calculation capacity. Reduce events, unresolved branches, or negotiation dates.', code: 'CALCULATION_CAPACITY' }, { status: 422 });
  return Sentry.startSpan({ name: 'decision.evaluate', op: 'finance.scenarios', attributes: { 'snapshot.id': parsed.data.id, 'snapshot.version': parsed.data.version } }, async span => {
    const result = evaluateDecision(parsed.data);
    span.setAttributes({ 'decision.status': result.status, 'decision.scenario_count': result.scenarioCount, 'decision.coverage_complete': result.coverageComplete });
    Sentry.logger.info('Funding decision evaluated', { snapshotId: result.inputId, snapshotVersion: result.inputVersion, snapshotHash: result.inputHash, status: result.status, scenarios: result.scenarioCount, coverageComplete: result.coverageComplete });
    const serialized = JSON.stringify(compactDecisionResult(result));
    const outputBytes = Buffer.byteLength(serialized);
    if (outputBytes > MAX_RESPONSE_BYTES) {
      Sentry.captureException(new Error('Headroom decision response exceeded 2 MiB'), { tags: { component: 'decision-capacity', snapshot: result.inputId }, extra: { inputBytes: Buffer.byteLength(body), outputBytes, scenarioCount: result.scenarioCount } });
      await Sentry.flush(2000);
      return Response.json({ error: 'This snapshot exceeds the public response capacity.', code: 'RESPONSE_CAPACITY' }, { status: 422 });
    }
    return new Response(serialized, { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  });
}
