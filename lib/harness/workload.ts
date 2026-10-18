import type { WorkflowEvidence, WorkflowQuestion } from './runtime';
import type { JudgmentState } from '@/lib/providers/jev';

export const workloadVersion = 'evidence-update-v1';
export const questions: WorkflowQuestion[] = [
  { id: 'inspection', subject: 'phase_1', statement: 'Phase 1 has passed its applicable current inspection.' },
  { id: 'certificate', subject: 'job_certificate', statement: 'The customer has received the insurance certificate for this job.' },
  { id: 'settlement', subject: 'phase_payment', statement: 'The phase-one payment has already settled in the contractor’s bank account.' },
];
const source = (id: string, subject: string, text: string): WorkflowEvidence => ({ id, subject, text, companyId: 'evaluation-contractor', jobId: 'evaluation-job' });
const passed = source('report-pass', 'phase_1', 'Signed inspection record: Phase 1 PASS, current inspection. Phase 2 has not been inspected.');
const certificate = source('certificate-receipt', 'job_certificate', 'Customer document officer: I acknowledge receipt of the insurance certificate for this job.');
const eligible = source('invoice-accepted', 'phase_payment', 'The phase-one invoice is approved for billing. No payment has been sent or settled yet. Collection is planned in fourteen calendar days.');
const settled = source('bank-settlement', 'phase_payment', 'Observed bank settlement for this job: the phase-one payment was credited and is available. This replaces the earlier unpaid status.');
const failed = source('reinspection', 'phase_1', 'Authoritative current reinspection of Phase 1: FAILED. This report explicitly supersedes the prior passing inspection.');
const conflict = source('conflicting-report', 'phase_1', 'A second purported current Phase 1 report says PASS. Its authority is unverified; neither conflicting current report supersedes the other.');
export interface FrozenUpdate { id: string; name: string; evidence: WorkflowEvidence[]; expected: Record<string, JudgmentState> }
/** Independently authored before the experiment author is invoked. Labels never enter its prompt. */
export const frozenWorkload: FrozenUpdate[] = [
  { id: 'u1', name: 'Inspection arrives; other facts absent', evidence: [passed], expected: { inspection: 'MET', certificate: 'UNKNOWN', settlement: 'UNKNOWN' } },
  { id: 'u2', name: 'Identical redelivery', evidence: [passed], expected: { inspection: 'MET', certificate: 'UNKNOWN', settlement: 'UNKNOWN' } },
  { id: 'u3', name: 'Certificate received', evidence: [passed, certificate], expected: { inspection: 'MET', certificate: 'MET', settlement: 'UNKNOWN' } },
  { id: 'u4', name: 'Invoice accepted, cash not received', evidence: [passed, certificate, eligible], expected: { inspection: 'MET', certificate: 'MET', settlement: 'NOT_MET' } },
  { id: 'u5', name: 'Bank settlement replaces unpaid status', evidence: [passed, certificate, settled], expected: { inspection: 'MET', certificate: 'MET', settlement: 'MET' } },
  { id: 'u6', name: 'Reinspection supersedes pass', evidence: [{ ...passed, superseded: true }, failed, certificate, settled], expected: { inspection: 'NOT_MET', certificate: 'MET', settlement: 'MET' } },
  { id: 'u7', name: 'Unresolved contradictory current records', evidence: [failed, conflict, certificate, settled], expected: { inspection: 'CONFLICTING', certificate: 'MET', settlement: 'MET' } },
];
