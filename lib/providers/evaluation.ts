import {
  ExtractedClause,
  ExtractionContext,
  Trigger,
  parseExtraction,
} from "./extraction";
function canonicalTrigger(trigger: Trigger | null): unknown {
  if (!trigger) return null;
  if (trigger.op === "ATOM") return trigger;
  const children: unknown[] = [];
  for (const child of trigger.children) {
    const canon = canonicalTrigger(child) as {
      op: string;
      children?: unknown[];
    };
    if (canon.op === trigger.op && canon.children)
      children.push(...canon.children);
    else children.push(canon);
  }
  return {
    op: trigger.op,
    children: children.sort((a, b) =>
      JSON.stringify(a).localeCompare(JSON.stringify(b)),
    ),
  };
}
export function materialKey(value: ExtractedClause) {
  return JSON.stringify({
    status: value.status,
    amountRef: value.amountRef,
    trigger: canonicalTrigger(value.trigger),
    due: value.due,
    sourceIds: [...value.sourceIds].sort(),
  });
}
export interface ExtractionScore {
  expectedStatus: ExtractedClause["status"];
  valid: boolean;
  materialExact: boolean;
  proposed: boolean;
  unsafeProposed: boolean;
  statusCorrect: boolean;
  error?: string;
  parsed?: ExtractedClause;
}
export function scoreExtraction(
  text: string,
  context: ExtractionContext,
  expected: ExtractedClause,
): ExtractionScore {
  try {
    const out = parseExtraction(text, context);
    return {
      expectedStatus: expected.status,
      valid: true,
      materialExact: materialKey(out) === materialKey(expected),
      proposed: out.status === "PROPOSED",
      unsafeProposed:
        out.status === "PROPOSED" && materialKey(out) !== materialKey(expected),
      statusCorrect: out.status === expected.status,
      parsed: out,
    };
  } catch (error) {
    return {
      expectedStatus: expected.status,
      valid: false,
      materialExact: false,
      proposed: false,
      unsafeProposed: false,
      statusCorrect: false,
      error: error instanceof Error ? error.message : "Invalid extraction",
    };
  }
}
export function summarizeExtraction(scores: ExtractionScore[]) {
  const n = scores.length;
  if (n === 0) throw new Error("Cannot score an empty evaluation");
  const flags = [
    "valid",
    "materialExact",
    "proposed",
    "unsafeProposed",
    "statusCorrect",
  ] as const;
  for (const score of scores) {
    if (
      !["PROPOSED", "AMBIGUOUS", "UNSUPPORTED"].includes(
        score.expectedStatus,
      ) ||
      flags.some((key) => typeof score[key] !== "boolean")
    )
      throw new Error("Invalid extraction score or missing expected class");
    if (
      (!score.valid && flags.some((key) => key !== "valid" && score[key])) ||
      score.unsafeProposed !== (score.proposed && !score.materialExact) ||
      (score.materialExact &&
        (!score.statusCorrect ||
          score.proposed !== (score.expectedStatus === "PROPOSED"))) ||
      (score.statusCorrect &&
        score.proposed !== (score.expectedStatus === "PROPOSED")) ||
      (score.parsed &&
        (!score.valid ||
          score.proposed !== (score.parsed.status === "PROPOSED")))
    )
      throw new Error("Internally inconsistent extraction score");
  }
  const count = (key: (typeof flags)[number]) =>
    scores.filter((x) => x[key]).length;
  const proposed = count("proposed");
  const expectedProposed = scores.filter(
    (score) => score.expectedStatus === "PROPOSED",
  ).length;
  const correctSupportedProposals = scores.filter(
    (score) =>
      score.expectedStatus === "PROPOSED" &&
      score.proposed &&
      score.materialExact,
  ).length;
  const breakdown = (status: ExtractedClause["status"]) => {
    const matching = scores.filter((score) => score.expectedStatus === status);
    const statusCorrect = matching.filter(
      (score) => score.statusCorrect,
    ).length;
    const materialExact = matching.filter(
      (score) => score.materialExact,
    ).length;
    return {
      count: matching.length,
      valid: matching.filter((score) => score.valid).length,
      statusCorrect,
      materialExact,
      proposed: matching.filter((score) => score.proposed).length,
      unsafeProposed: matching.filter((score) => score.unsafeProposed).length,
      statusAccuracy: matching.length ? statusCorrect / matching.length : null,
      materialExactRate: matching.length
        ? materialExact / matching.length
        : null,
    };
  };
  return {
    count: n,
    valid: count("valid"),
    materialExact: count("materialExact"),
    statusCorrect: count("statusCorrect"),
    proposed,
    unsafeProposed: count("unsafeProposed"),
    expectedProposed,
    correctSupportedProposals,
    validityRate: count("valid") / n,
    materialExactRate: count("materialExact") / n,
    // Every proposal still needs owner review. Raw proposal volume includes mistakes.
    rawProposalRate: proposed / n,
    correctSupportedProposalRate: expectedProposed
      ? correctSupportedProposals / expectedProposed
      : null,
    proposedPrecision: proposed ? correctSupportedProposals / proposed : null,
    byExpectedStatus: {
      PROPOSED: breakdown("PROPOSED"),
      AMBIGUOUS: breakdown("AMBIGUOUS"),
      UNSUPPORTED: breakdown("UNSUPPORTED"),
    },
  };
}
export type ExtractionSummary = ReturnType<typeof summarizeExtraction>;
