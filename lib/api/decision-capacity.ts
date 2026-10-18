import type { CashPath, DecisionInput, DecisionResult } from '@/lib/domain';

export const MAX_INPUT_BYTES = 262_144;
export const MAX_RESPONSE_BYTES = 2_097_152;
export const MAX_WORK_UNITS = 2_000_000;

/** Conservative public admission bound, including every deposit-search trial. */
export function estimatedDecisionWork(input: DecisionInput): number {
  const events = input.commitments.length + input.job.events.length;
  const cases = input.uncertainties.reduce((count, item) => Math.min(256, count * (input.answers?.[item.id] ? 1 : item.options.length)), 1);
  const negotiation = input.job.negotiation;
  const trials = negotiation ? negotiation.allowedCollectionDates.length * (2 + Math.ceil(Math.log2(negotiation.maxAdditionalCents + 1))) : 0;
  return Math.max(1, events) * cases * (1 + trials) + events * events * (1 + trials);
}

function pathSummary({ timeline: _timeline, ...metrics }: CashPath) { return metrics; }

/** Full timelines appear once for the worst baseline/job witnesses, never once per case. */
export function compactDecisionResult(result: DecisionResult) {
  return {
    ...result,
    representation: 'compact-v1' as const,
    outcomeTimelines: 'Worst witness timelines are in top-level baseline and withJob.' as const,
    outcomes: result.outcomes.map(outcome => ({
      ...outcome,
      baseline: pathSummary(outcome.baseline),
      withJob: pathSummary(outcome.withJob),
    })),
  };
}

/** Stop reading on the byte limit, including chunked bodies and multi-byte UTF-8. */
export async function readBoundedBody(request: Request): Promise<string | null> {
  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_INPUT_BYTES) { await reader.cancel(); return null; }
      chunks.push(value);
    }
    return Buffer.concat(chunks, size).toString('utf8');
  } finally { reader.releaseLock(); }
}
