import experiment from '@/data/artifacts/harness-experiment.json';
import current from '@/data/artifacts/current.json';
import { frozenWorkload } from '@/lib/harness/workload';

/** Build on the server: send only the published measures, never the full run records. */
export function getLandingEvidence() {
  const measures = (metrics: typeof experiment.baseline.metrics) => ({
    requests: metrics.modelCalls,
    inputTokens: metrics.inputTokens,
    correct: metrics.correct,
    total: metrics.total,
    falseMet: metrics.falseSatisfied,
  });
  return {
    baseline: measures(experiment.baseline.metrics),
    candidate: measures(experiment.candidate.metrics),
    updates: frozenWorkload.length,
    workflowPromoted: experiment.gate.promoted,
    v5: {
      count: current.extractionV5Final.caseCount,
      baseExact: current.extractionV5Final.base.summary.materialExact,
      tunedExact: current.extractionV5Final.tuned.summary.materialExact,
      incorrectProposals: current.extractionV5Final.tuned.summary.unsafeProposed,
      promoted: current.extractionV5Final.comparison.promoted,
    },
  };
}

export type LandingEvidence = ReturnType<typeof getLandingEvidence>;
