import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  EXTRACTION_JSON_SCHEMA_V4,
  EXTRACTION_PROMPT_PROFILE_V4,
  extractionPromptV4,
  validateExtraction,
} from "../../lib/providers/extraction";
import type { LabeledExample } from "./generate-data";

interface SourceManifest {
  version: string;
  dataClassification: string;
  publicationPolicy: string;
  trainingCount: number;
  trainFamilies: string[];
  hashes: Record<string, string>;
}
const sha256 = (content: string) =>
  createHash("sha256").update(content).digest("hex");

/** Derive new prompts from approved training records only; never read final labels. */
export function buildV4TrainingArtifacts(
  source: SourceManifest,
  sourceLabels: string,
) {
  if (
    source.version !== "greenlight-clauses-v3" ||
    source.dataClassification !== "PUBLIC_SYNTHETIC"
  )
    throw new Error(
      "v4 prompts require the frozen PUBLIC_SYNTHETIC v3 training source",
    );
  if (sha256(sourceLabels) !== source.hashes["train-labels.jsonl"])
    throw new Error("Frozen v3 training-label hash differs from its manifest");
  const labels = sourceLabels
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as LabeledExample);
  if (
    labels.length !== 276 ||
    source.trainingCount !== labels.length ||
    new Set(labels.map((row) => row.id)).size !== labels.length
  )
    throw new Error("Expected all 276 unique approved v3 training records");
  for (const row of labels) validateExtraction(row.expected, row.context);
  const rows = labels.map((row) => ({
    prompt: [{ role: "user", content: extractionPromptV4(row.context) }],
    completion: [{ role: "assistant", content: JSON.stringify(row.expected) }],
  }));
  // Preserve the original one-example-per-renderer proof selection.
  const proof = rows.filter((_, index) => index % 12 === 0);
  const jsonl = (values: unknown[]) =>
    values.map((value) => JSON.stringify(value)).join("\n") + "\n";
  const files = {
    "train.jsonl": jsonl(rows),
    "proof.jsonl": jsonl(proof),
    "train-labels.jsonl": sourceLabels,
  };
  const manifest = {
    schemaVersion: 1,
    version: "greenlight-clauses-v4-schema-contract",
    promptProfile: EXTRACTION_PROMPT_PROFILE_V4,
    promptSchemaSha256: sha256(JSON.stringify(EXTRACTION_JSON_SCHEMA_V4)),
    sourceDataVersion: source.version,
    sourceTrainingLabelsSha256: source.hashes["train-labels.jsonl"],
    dataClassification: "PUBLIC_SYNTHETIC",
    publicationPolicy: source.publicationPolicy,
    trainingCount: rows.length,
    proofCount: proof.length,
    trainFamilies: source.trainFamilies,
    labelAuthority:
      "Exact unchanged v3 developer-reviewed synthetic training contexts and labels. Only the shared output-format prompt contract changes.",
    evaluationAccess:
      "This generator reads training records only and creates no evaluation examples. A fresh separately authored final set is required for the v4 comparison.",
    comparisonPolicy:
      "Base and tuned models receive the identical json-schema-v4 prompt profile; legacy-v3 output-format failures are not evidence of an isolated SFT gain.",
    lossMask:
      "Conversational prompt+completion; verify local tokenizer prefixes/truncation and the remote completion-only training objective independently.",
    hashes: Object.fromEntries(
      Object.entries(files).map(([name, content]) => [name, sha256(content)]),
    ),
  };
  return { files, manifest };
}

export async function generateV4Training() {
  const sourceDir = resolve("data/training"),
    targetDir = resolve(sourceDir, "v4-schema-contract");
  const source = JSON.parse(
    await readFile(resolve(sourceDir, "manifest.json"), "utf8"),
  ) as SourceManifest;
  const labels = await readFile(
    resolve(sourceDir, "train-labels.jsonl"),
    "utf8",
  );
  const { files, manifest } = buildV4TrainingArtifacts(source, labels);
  let prior: typeof manifest | undefined;
  try {
    prior = JSON.parse(
      await readFile(resolve(targetDir, "manifest.json"), "utf8"),
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  if (prior && JSON.stringify(prior) !== JSON.stringify(manifest))
    throw new Error(
      "Frozen v4 training manifest changed; use a new version instead of overwriting it",
    );
  await mkdir(targetDir, { recursive: true });
  for (const [name, content] of Object.entries(files))
    await writeFile(resolve(targetDir, name), content);
  await writeFile(
    resolve(targetDir, "manifest.json"),
    JSON.stringify(manifest, null, 2) + "\n",
  );
  console.log(
    JSON.stringify({
      version: manifest.version,
      promptProfile: manifest.promptProfile,
      trainingCount: manifest.trainingCount,
      proofCount: manifest.proofCount,
      hashes: manifest.hashes,
    }),
  );
}
if (process.argv[1]?.endsWith("generate-v4-training.ts"))
  generateV4Training().catch((error) => {
    console.error(
      error instanceof Error ? error.message : "Training generation failed",
    );
    process.exitCode = 1;
  });
