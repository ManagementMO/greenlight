import * as Sentry from '@sentry/nextjs';
import experiment from '@/data/artifacts/harness-experiment.json';
import { promoteCandidate } from '@/lib/harness/runtime';

export async function POST() {
  return Sentry.startSpan({ name: 'metaharness.replay_verified_experiment', op: 'experiment.replay' }, async () => {
    const gate = promoteCandidate(experiment.baseline.metrics, experiment.candidate.metrics);
    Sentry.logger.info('Verified experiment replayed', { experimentId: experiment.id, promoted: gate.promoted, origin: 'recorded', sampleCount: experiment.evaluator.sampleCount });
    return Response.json({ id: experiment.id, origin: 'recorded', replayedAt: new Date().toISOString(), evaluator: experiment.evaluator, baseline: experiment.baseline.metrics, candidate: experiment.candidate.metrics, gate, detail: 'Re-evaluated frozen gates against the saved genuine provider run. No new inference or training was invoked.' }, { headers: { 'Cache-Control': 'no-store' } });
  });
}
