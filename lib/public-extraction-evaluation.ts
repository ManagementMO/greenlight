import type { ExtractionSummary } from "./providers/evaluation";

/** Compact, public projection of a verified V5 artifact; raw predictions stay in Git. */
export type PublicV5Evaluation = {
  schemaVersion: 1;
  origin: "recorded";
  dataClassification: "PUBLIC_SYNTHETIC";
  purpose: "development-only" | "final-evaluation";
  caseCount: number;
  evaluationSha256: string;
  promptProfile: "reference-contract-v5";
  promptContractSha256: string;
  base: PublicV5Run;
  tuned: PublicV5Run;
  comparison: {
    status: string;
    promoted: boolean;
    gateVersion?: string;
    gate?: string;
    absoluteGatePassed?: boolean;
    qualityImprovementMeasured?: boolean;
    methodology?: string;
    detail?: string;
  };
};
type PublicV5Run = {
  artifact: { repo: string; revision: string };
  summary: ExtractionSummary;
  completedAt: string;
  stopVerified: boolean;
  costSettled: boolean;
};
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const countWithin = (value: unknown, total: number): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= total;
const hash = (value: unknown) => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);

/** Malformed, partial or mislabeled results must not become a success badge. */
export function validPublicV5Evaluation(
  value: unknown,
  purpose: PublicV5Evaluation["purpose"],
): value is PublicV5Evaluation {
  if (!isRecord(value) || value.schemaVersion !== 1 || value.origin !== "recorded" ||
      value.dataClassification !== "PUBLIC_SYNTHETIC" || value.purpose !== purpose ||
      value.promptProfile !== "reference-contract-v5" || !hash(value.evaluationSha256) ||
      !hash(value.promptContractSha256) || typeof value.caseCount !== "number" ||
      !Number.isSafeInteger(value.caseCount) || value.caseCount < 1 ||
      !isRecord(value.comparison) || typeof value.comparison.promoted !== "boolean" ||
      typeof value.comparison.status !== "string") return false;
  if (purpose === "development-only" &&
      (value.comparison.status !== "development-only" || value.comparison.promoted)) return false;
  if (purpose === "final-evaluation" &&
      (typeof value.comparison.gateVersion !== "string" || !value.comparison.gateVersion ||
       typeof value.comparison.gate !== "string" || !value.comparison.gate ||
       typeof value.comparison.absoluteGatePassed !== "boolean" ||
       (value.comparison.promoted && (!value.comparison.absoluteGatePassed ||
         value.comparison.qualityImprovementMeasured !== true)))) return false;
  return [value.base, value.tuned].every((run) => {
    if (!isRecord(run) || !isRecord(run.artifact) ||
        typeof run.artifact.repo !== "string" || !/^[\w.-]+\/[\w.-]+$/.test(run.artifact.repo) ||
        typeof run.artifact.revision !== "string" || !/^[a-f0-9]{40}$/.test(run.artifact.revision) ||
        typeof run.completedAt !== "string" || Number.isNaN(Date.parse(run.completedAt)) ||
        run.stopVerified !== true || run.costSettled !== true || !isRecord(run.summary)) return false;
    const s = run.summary, count = value.caseCount as number;
    if (s.count !== count || !["valid", "materialExact", "correctSupportedProposals", "unsafeProposed", "expectedProposed"]
      .every((key) => countWithin(s[key], count)) || !isRecord(s.byExpectedStatus)) return false;
    let strataCount = 0;
    for (const status of ["PROPOSED", "AMBIGUOUS", "UNSUPPORTED"]) {
      const stratum = s.byExpectedStatus[status];
      if (!isRecord(stratum) || !countWithin(stratum.count, count) ||
          !countWithin(stratum.statusCorrect, stratum.count)) return false;
      strataCount += stratum.count;
    }
    return strataCount === count &&
      (s.byExpectedStatus.PROPOSED as Record<string, unknown>).count === s.expectedProposed &&
      (s.correctSupportedProposals as number) <= (s.expectedProposed as number) &&
      (s.materialExact as number) <= (s.valid as number) &&
      (s.unsafeProposed as number) <= (s.valid as number);
  });
}

/** Each complete comparison contains one base run and one tuned run. */
export function publicEvaluationRunCount(value: {
  evaluations: readonly unknown[];
  extractionV5Development?: unknown;
  extractionV5Final?: unknown;
}) {
  return value.evaluations.length +
    (validPublicV5Evaluation(value.extractionV5Development, "development-only") ? 2 : 0) +
    (validPublicV5Evaluation(value.extractionV5Final, "final-evaluation") ? 2 : 0);
}
