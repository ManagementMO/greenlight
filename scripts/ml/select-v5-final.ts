import { readdir, readFile } from "node:fs/promises";
import { createV5FinalSelection, writeV5FinalSelection, V5_FINAL_SELECTION_PATH } from "../../lib/providers/final-selection-v5";
import { args } from "./shared";

async function main() {
  const a = args();
  if (typeof a.rationale !== "string") throw new Error("Provide --rationale describing the selection from development results only.");
  // Refuse a new selection after any final deployment attempt, including interrupted runs.
  for (const name of await readdir("work/ml")) {
    if (!/^(evaluation-v5-.*-final|veri-serving-v5-.*-final-.*)\.json$/.test(name)) continue;
    const run = JSON.parse(await readFile("work/ml/" + name, "utf8"));
    if (run.corpusPurpose === "final-evaluation")
      throw new Error("Final serving already has a record. Preserve the original selection; do not select from final feedback.");
  }
  const selection = await createV5FinalSelection(a.rationale);
  await writeV5FinalSelection(selection);
  console.log(JSON.stringify({ written: V5_FINAL_SELECTION_PATH, base: selection.base, tuned: selection.tuned, selectedAt: selection.selectedAt }));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
