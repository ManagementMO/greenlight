import { compareEvaluations } from "./compare-evaluations";
import { V5_GATE, v5PromptHash } from "../../lib/providers/evaluation-v5";
import { readFile } from "node:fs/promises";
import { args, saveJson } from "./shared";

type V5Run = Parameters<typeof compareEvaluations>[0] & { corpusPurpose?: string; purpose?: string };

export function compareV5Evaluations(base: V5Run, tuned: V5Run) {
  if ([base,tuned].some(run => run.corpusPurpose !== "final-evaluation" || run.purpose !== "frozen-heldout-evaluation")) throw new Error("Development results cannot authorize V5 promotion; final-evaluation provenance is required.");
  if (base.promptProfile !== "reference-contract-v5" || tuned.promptProfile !== "reference-contract-v5") throw new Error("V5 gate requires V5 prompts.");
  if ([base,tuned].some(run => run.promptContractSha256 !== v5PromptHash())) throw new Error("V5 comparison requires the exact current frozen prompt contract.");
  if (base.rows.some(row => !/^[a-f0-9]{64}$/.test(row.promptSha256 ?? ""))) throw new Error("Every V5 prompt must be hash-bound.");
  const result=compareEvaluations(base,tuned), s=result.tuned;
  if (s.expectedProposed < 24 || s.byExpectedStatus.AMBIGUOUS.count < 8 || s.byExpectedStatus.UNSUPPORTED.count < 8) throw new Error("V5 release requires adequate supported and uncertainty strata.");
  const usefulness = s.correctSupportedProposalRate! >= V5_GATE.minimumSupportedCoverage && s.validityRate >= V5_GATE.minimumValidity;
  const uncertainty = (s.byExpectedStatus.AMBIGUOUS.statusAccuracy ?? 0) >= V5_GATE.minimumUncertaintyStatusAccuracy && (s.byExpectedStatus.UNSUPPORTED.statusAccuracy ?? 0) >= V5_GATE.minimumUncertaintyStatusAccuracy;
  const noIncorrectProposal=s.unsafeProposed===V5_GATE.maximumIncorrectValidatedProposals;
  const absoluteGatePassed=usefulness&&uncertainty&&noIncorrectProposal;
  return {...result, gateVersion:V5_GATE.version,thresholds:V5_GATE,relativeComparisonStatus:result.status,
    methodology:"Matched frozen cases, prompts, schema, decoding and launch configuration compare the base artifact with the trained, materialized export. This measures the exported-model pipeline and does not isolate LoRA from materialization or effective runtime precision. Repository configuration and revisions are observed; loaded weight bytes and runtime precision are not attested.",
    absoluteGatePassed, promoted:result.promoted&&absoluteGatePassed,
    qualityImprovementMeasured:result.qualityImprovementMeasured,
    status:!absoluteGatePassed?"rejected-usefulness-or-safety":result.status,
    gate:"Strictly improve material accuracy without relative regression; at least 80% correct supported coverage, 90% fully valid outputs, 80% correct status for each uncertainty class, and zero incorrect fully validated proposals. Owner review remains mandatory.",
  };
}

async function main() {
  const a=args();
  const base=JSON.parse(await readFile(String(a.base??"work/ml/evaluation-v5-base-final.json"),"utf8"));
  const tuned=JSON.parse(await readFile(String(a.tuned??"work/ml/evaluation-v5-tuned-final.json"),"utf8"));
  const result=compareV5Evaluations(base,tuned);
  await saveJson("work/ml/v5-base-tuned-comparison.json",result);
  console.log(JSON.stringify(result,null,2));
}
if(process.argv[1]?.endsWith("compare-v5-evaluations.ts")) main().catch(error=>{console.error(error.message);process.exitCode=1;});
