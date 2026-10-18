import { readFile } from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";
import { compareV5Evaluations } from "./ml/compare-v5-evaluations";
import { buildV5Showcase } from "../lib/providers/showcase-v5";
import { assertV5RunIdentity } from "../lib/providers/evaluation-v5";
import { readV5FinalSelection, assertV5FinalRunSelection } from "../lib/providers/final-selection-v5";
import { veriRecoveryRecordPath, verifyVeriServingRecordIdentity } from "../lib/providers/veri-response-identity";
import { args, loadProjectEnv, saveJson } from "./ml/shared";

/** This runs only after final publication. It never requests inference or repairs a response. */
async function main() {
  const env = loadProjectEnv(), options = args();
  const read = async (path: string) => JSON.parse(await readFile(path, "utf8"));
  const final = await read("data/artifacts/extraction-v5-evaluation.json");
  const manifest = await read("data/evaluation/v5-final/manifest.json");
  const selection = await readV5FinalSelection();
  const base = await read("work/ml/evaluation-v5-base-final.json"), tuned = await read("work/ml/evaluation-v5-tuned-final.json");
  for (const [label, run] of [["base", base], ["tuned", tuned]] as const) {
    assertV5FinalRunSelection(selection, run);
    assertV5RunIdentity(run, {label: `v5-${label}-final`, dataVersion: manifest.version, count: manifest.evaluationCount,
      corpusPurpose: "final-evaluation", artifact: final[label].artifact});
    const recovery = await read(veriRecoveryRecordPath(run.reservationId));
    const identity = verifyVeriServingRecordIdentity(run, recovery);
    if (!isDeepStrictEqual(identity, final[label].responseModelIdentity) || !isDeepStrictEqual(run.summary, final[label].summary) ||
        run.completedAt !== final[label].completedAt || run.rows.length !== final[label].rows.length ||
        run.rows.some((row: {id: string; text: string; score: unknown}, index: number) => {
          const published = final[label].rows[index];
          return row.id !== published.id || row.text !== published.output || !isDeepStrictEqual(row.score, published.score);
        }))
      throw new Error("Private final run differs from its verified published inference evidence.");
  }
  const comparison = compareV5Evaluations(base, tuned);
  const {verifiedAt: _publishedAt, ...publishedGate} = final.comparison;
  const {verifiedAt: _recheckedAt, ...recheckedGate} = comparison;
  if (!isDeepStrictEqual(publishedGate, recheckedGate))
    throw new Error("Published final comparison differs from the recomputed gate.");
  const result = buildV5Showcase(final, comparison.promoted ? tuned : base, await read("data/artifacts/evidence-judgments.json"));
  const serialized = JSON.stringify(result);
  for (const [name, value] of Object.entries(env)) if (value && value.length > 12 &&
      /API_KEY|AUTH_TOKEN|HF_TOKEN|OIDC_TOKEN|SECRET/.test(name) && serialized.includes(value))
    throw new Error("Credential match prevents showcase publication.");
  if (!options["dry-run"]) await saveJson("data/artifacts/extraction-v5-demo.json", result);
  console.log(JSON.stringify({dryRun: Boolean(options["dry-run"]), selected: result.selectedByGate,
    materialExact: result.materialExact, published: options["dry-run"] ? null : "data/artifacts/extraction-v5-demo.json"}));
}
if (process.argv[1]?.endsWith("publish-v5-showcase.ts")) main().catch(error => {
  console.error(error instanceof Error ? error.message : "V5 showcase publication failed"); process.exitCode = 1;
});
