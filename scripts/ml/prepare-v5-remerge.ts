import { createHash } from "node:crypto";
import { resolve, sep } from "node:path";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { extractionPromptV5 } from "../../lib/providers/extraction-v5";
import { scoreExtraction } from "../../lib/providers/evaluation";
import { args, saveJson } from "./shared";
import type { LabeledExample } from "./generate-data";

/** Reproduce from public synthetic artifacts; no owner credential or paid API is used. */
async function main() {
  const options = args(), root = String(options.output ?? "work/ml/v5-precision-repair");
  if (!resolve(root).startsWith(resolve("work/ml") + sep)) throw new Error("Use an ignored work/ml output directory.");
  const lineage = JSON.parse(await readFile("data/artifacts/v5-export-lineage.json", "utf8"));
  const initial = JSON.parse(await readFile("data/artifacts/extraction-v5-initial-development.json", "utf8"));
  const bytes = await readFile("data/training/v5-reference-contract/train-labels.jsonl", "utf8");
  const train = bytes.trim().split("\n").map(line => JSON.parse(line) as LabeledExample);
  const manifest = JSON.parse(await readFile("data/training/v5-reference-contract/manifest.json", "utf8"));
  if (lineage.dataClassification !== "PUBLIC_SYNTHETIC" || lineage.noRetraining !== true ||
      lineage.sourceTrainingRepo !== initial.tuned.artifact.repo || lineage.trainingSha256 !== manifest.hashes["train.jsonl"] ||
      createHash("sha256").update(bytes).digest("hex") !== manifest.hashes["train-labels.jsonl"])
    throw new Error("The public lineage and reviewed V5 training source differ.");
  const ids = ["v5-train-p-84", "v5-train-p-155", "v5-train-p-71", "v5-train-n-61", "v5-train-n-42", "v5-train-n-93"];
  const examples = ids.map(id => {const row = train.find(example => example.id === id); if (!row) throw new Error("Missing declared training canary"); return row;});
  if (options.score) {
    const outputs = JSON.parse(await readFile(`${root}/local-canaries.json`, "utf8")) as {id: string; text: string}[];
    if (outputs.length !== ids.length || new Set(outputs.map(row => row.id)).size !== ids.length || outputs.some(row => !ids.includes(row.id)))
      throw new Error("All six local training canaries are required.");
    const scores = outputs.map(row => {const example = examples.find(value => value.id === row.id)!; return {id: row.id, ...scoreExtraction(row.text, example.context, example.expected)};});
    await saveJson(`${root}/local-canary-scores.json`, scores);
    console.log(JSON.stringify({purpose: "local-training-canaries-only", count: scores.length, valid: scores.filter(row => row.valid).length, materialExact: scores.filter(row => row.materialExact).length, includedInHeldOutMetrics: false}));
    return;
  }
  await mkdir(`${root}/adapter`, {recursive: true, mode: 0o700});
  const sources = [
    ...["adapter_config.json", "adapter_model.safetensors"].map(path => ({path, repo: lineage.repo, revision: lineage.revision, remote: `training-adapter/${path}`})),
    ...["tokenizer.json", "tokenizer_config.json", "chat_template.jinja", "merges.txt", "vocab.json", "added_tokens.json", "special_tokens_map.json"].map(path => ({path, repo: initial.tuned.artifact.repo, revision: initial.tuned.artifact.revision, remote: path})),
  ];
  const files = [];
  for (const source of sources) {
    const url = `https://huggingface.co/${source.repo}/resolve/${source.revision}/${source.remote}`;
    const response = await fetch(url, {signal: AbortSignal.timeout(120000)});
    if (!response.ok) throw new Error(`Public reproduction file ${source.path} returned HTTP ${response.status}`);
    const data = Buffer.from(await response.arrayBuffer());
    if (data.length > 200_000_000) throw new Error("Unexpected reproduction file size");
    const digest = createHash("sha256").update(data).digest("hex");
    if (source.path === "adapter_model.safetensors" && digest !== lineage.adapterSha256)
      throw new Error("Public trained adapter hash differs from recorded training lineage.");
    await writeFile(`${root}/adapter/${source.path}`, data, {mode: 0o600});
    files.push({path: source.path, bytes: data.length, sha256: digest});
  }
  const config = JSON.parse(await readFile(`${root}/adapter/adapter_config.json`, "utf8"));
  if (config.r !== 8 || config.lora_alpha !== 16 || config.base_model_name_or_path !== lineage.baseModel)
    throw new Error("Public adapter parameters differ from the completed V5 training.");
  await saveJson(`${root}/adapter-provenance.json`, {jobId: lineage.sourceTrainingJobId, checkpointStep: 300,
    trainingSha256: lineage.trainingSha256, sourceRepo: lineage.sourceTrainingRepo, baseModel: lineage.baseModel, downloadedAt: new Date().toISOString(), files});
  await saveJson(`${root}/canary-prompts.json`, examples.map(example => ({id: example.id, prompt: extractionPromptV5(example.context)})));
  console.log(JSON.stringify({prepared: root, publicFiles: files.length, adapterHashVerified: true, canaries: examples.length, paidCalls: 0}));
}
main().catch(error => {console.error(error instanceof Error ? error.message : "V5 reproduction failed"); process.exitCode = 1;});
