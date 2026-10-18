import { createHash } from 'node:crypto';
import { z } from 'zod';

export const candidateSchema = z.object({
  schemaVersion: z.literal(1), name: z.string().min(3).max(80),
  cacheScope: z.enum(['snapshot', 'dependency']),
  batchQuestions: z.boolean(),
  scopedEvidence: z.boolean(),
  confidenceThreshold: z.number().min(0.8).max(0.98),
}).strict();
export type HarnessManifest = z.infer<typeof candidateSchema>;
export const baselineManifest: HarnessManifest = { schemaVersion: 1, name: 'Full job recheck', cacheScope: 'snapshot', batchQuestions: false, scopedEvidence: false, confidenceThreshold: 0.8 };
export interface WorkflowEvidence { id: string; companyId: string; jobId: string; subject: string; text: string; superseded?: boolean; }
export interface WorkflowQuestion { id: string; subject: string; statement: string; }
export const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function evidenceFor(evidence: WorkflowEvidence[], subject: string) { return evidence.filter(e => !e.superseded && (e.subject === subject || e.subject === '*')); }
export function conditionKey(model: string, companyId: string, jobId: string, question: WorkflowQuestion, evidence: WorkflowEvidence[]) {
  return hash({ model, companyId, jobId, question, evidence: [...evidence].sort((a,b) => a.id.localeCompare(b.id)) });
}
export interface GateMetrics { correct: number; total: number; decisive: number; falseSatisfied: number; modelCalls: number; }
/** The experiment author cannot replace this evaluator or weaken its fixed gates. */
export function promoteCandidate(baseline: GateMetrics, candidate: GateMetrics) {
  const reasons: string[] = [];
  if (candidate.total !== baseline.total || !candidate.total) reasons.push('Same nonempty evaluation workload required.');
  if (candidate.falseSatisfied !== 0) reasons.push('False satisfied conditions are forbidden.');
  if (candidate.correct < baseline.correct) reasons.push('Quality must not regress.');
  if (candidate.decisive < baseline.decisive) reasons.push('Coverage must not regress.');
  if (candidate.modelCalls >= baseline.modelCalls && candidate.correct <= baseline.correct) reasons.push('No measured improvement in quality or model calls.');
  return { promoted: reasons.length === 0, reasons };
}
