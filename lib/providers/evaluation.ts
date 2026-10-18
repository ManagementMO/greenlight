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
  const count = (key: Exclude<keyof ExtractionScore, "error" | "parsed">) =>
    scores.filter((x) => x[key]).length;
  const proposed = count("proposed");
  return {
    count: n,
    valid: count("valid"),
    materialExact: count("materialExact"),
    statusCorrect: count("statusCorrect"),
    proposed,
    unsafeProposed: count("unsafeProposed"),
    validityRate: count("valid") / n,
    materialExactRate: count("materialExact") / n,
    automaticCoverage: proposed / n,
    proposedPrecision: proposed
      ? scores.filter((x) => x.proposed && x.materialExact).length / proposed
      : null,
  };
}
