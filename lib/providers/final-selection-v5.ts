import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { assertReviewedV5Evaluation, assertV5RunIdentity, v5PromptHash } from "./evaluation-v5";
import { scoreExtraction, summarizeExtraction } from "./evaluation";
import { extractionPromptV5 } from "./extraction-v5";
import type { LabeledExample } from "../../scripts/ml/generate-data";

export const V5_FINAL_SELECTION_PATH = "data/artifacts/v5-final-selection.json";
const developmentPath = "data/artifacts/extraction-v5-development.json";
const runPaths = { base: "work/ml/evaluation-v5-base-dev.json", tuned: "work/ml/evaluation-v5-tuned-dev.json" } as const;
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const hashSchema = z.string().regex(/^[a-f0-9]{64}$/);
const identitySchema = z.object({ repo: z.string().min(1), revision: z.string().regex(/^[a-f0-9]{40}$/) }).strict();
const selectionSchema = z.object({
  schemaVersion: z.literal(1), purpose: z.literal("candidate-frozen-before-final"),
  selectedAt: z.string().datetime(), rationale: z.string().min(20).max(2000),
  base: identitySchema, tuned: identitySchema,
  trainingSha256: hashSchema, developmentSha256: hashSchema, finalEvaluationSha256: hashSchema,
  promptContractSha256: hashSchema, developmentArtifactSha256: hashSchema,
  developmentRunSha256: z.object({ base: hashSchema, tuned: hashSchema }).strict(),
  decode: z.object({ temperature: z.literal(0), maxTokens: z.literal(768) }).strict(),
  launch: z.object({ engine: z.literal("vllm"), gpu: z.object({ gpu_type: z.string(), gpu_count: z.literal(1) }).strict(), vllmExtraArgs: z.array(z.string()) }).strict(),
  boundary: z.literal("Candidate chosen using development only. Final predictions cannot change this selection; owner review remains mandatory."),
}).strict();
export type V5FinalSelection = z.infer<typeof selectionSchema>;
export type LoadedV5FinalSelection = { selection: V5FinalSelection; sha256: string };

/** This verifies development evidence only; it never opens final case text or labels. */
export async function createV5FinalSelection(rationale: string): Promise<V5FinalSelection> {
  const developmentBytes = await readFile(developmentPath, "utf8");
  const development = JSON.parse(developmentBytes);
  const trainingManifest = JSON.parse(await readFile("data/training/v5-reference-contract/manifest.json", "utf8"));
  const trainBytes = await readFile("data/training/v5-reference-contract/train.jsonl", "utf8");
  const devManifest = JSON.parse(await readFile("data/evaluation/v5-development/manifest.json", "utf8"));
  const finalManifest = JSON.parse(await readFile("data/evaluation/v5-final/manifest.json", "utf8"));
  assertReviewedV5Evaluation(devManifest, "development-only");
  assertReviewedV5Evaluation(finalManifest, "final-evaluation");
  const devBytes = await readFile("data/evaluation/v5-development/evaluation.frozen.jsonl", "utf8");
  const cases = new Map<string, LabeledExample>(devBytes.trim().split("\n").map(line => { const row = JSON.parse(line); return [row.id, row]; }));
  if (sha(trainBytes) !== trainingManifest.hashes["train.jsonl"] ||
      sha(devBytes) !== devManifest.hashes["evaluation.frozen.jsonl"] || cases.size !== devManifest.evaluationCount ||
      development.origin !== "recorded" || development.purpose !== "development-only" || development.caseCount !== cases.size ||
      development.evaluationSha256 !== sha(devBytes) || development.promptContractSha256 !== v5PromptHash() ||
      development.comparison?.promoted !== false)
    throw new Error("Selection requires the published complete V5 development evidence and unchanged reviewed corpora.");
  const runHashes = {} as Record<"base" | "tuned", string>;
  for (const role of ["base", "tuned"] as const) {
    const runBytes = await readFile(runPaths[role], "utf8"), run = JSON.parse(runBytes);
    const published = development[role];
    assertV5RunIdentity(run, { label: `v5-${role}-dev`, dataVersion: devManifest.version, count: cases.size,
      corpusPurpose: "development-only", artifact: published.artifact });
    if (run.status !== "completed" || !run.stopVerified || !run.costSettled || run.evaluationSha256 !== sha(devBytes) ||
        run.promptContractSha256 !== v5PromptHash() || run.promptProfile !== "reference-contract-v5" ||
        !isDeepStrictEqual(run.decode, published.decode) || !isDeepStrictEqual(run.launch, published.launch) ||
        run.rows.length !== cases.size || new Set(run.rows.map((row: { id: string }) => row.id)).size !== cases.size ||
        published.rows.length !== cases.size)
      throw new Error("Selection requires complete, settled development runs with identical published settings.");
    const scores = run.rows.map((row: { id: string; text: string; expected: unknown; promptSha256: string; score: unknown }, index: number) => {
      const example = cases.get(row.id), publicRow = published.rows[index];
      if (!example || typeof row.text !== "string" || row.text.length > 32768 ||
          !isDeepStrictEqual(row.expected, example.expected) || row.promptSha256 !== sha(extractionPromptV5(example.context)) ||
          publicRow.id !== row.id || publicRow.output !== row.text || publicRow.outputSha256 !== sha(row.text))
        throw new Error("Selection development response, prompt or label binding differs.");
      const score = scoreExtraction(row.text, example.context, example.expected);
      if (!isDeepStrictEqual(score, row.score) || !isDeepStrictEqual(score, publicRow.score))
        throw new Error("Selection development scores must match actual raw responses.");
      return score;
    });
    const summary = summarizeExtraction(scores);
    if (!isDeepStrictEqual(summary, run.summary) || !isDeepStrictEqual(summary, published.summary))
      throw new Error("Selection development summary differs from all raw predictions.");
    runHashes[role] = sha(runBytes);
  }
  if (!isDeepStrictEqual(development.base.decode, development.tuned.decode) ||
      !isDeepStrictEqual(development.base.launch, development.tuned.launch) ||
      !isDeepStrictEqual(development.base.rows.map((row: { id: string }) => row.id), development.tuned.rows.map((row: { id: string }) => row.id)))
    throw new Error("Selection development runs must match decoding, launch and case order.");
  return selectionSchema.parse({
    schemaVersion: 1, purpose: "candidate-frozen-before-final", selectedAt: new Date().toISOString(), rationale,
    base: { repo: development.base.artifact.repo, revision: development.base.artifact.revision },
    tuned: { repo: development.tuned.artifact.repo, revision: development.tuned.artifact.revision },
    trainingSha256: sha(trainBytes), developmentSha256: sha(devBytes),
    finalEvaluationSha256: finalManifest.hashes["evaluation.frozen.jsonl"], promptContractSha256: v5PromptHash(),
    developmentArtifactSha256: sha(developmentBytes), developmentRunSha256: runHashes,
    decode: development.base.decode, launch: development.base.launch,
    boundary: "Candidate chosen using development only. Final predictions cannot change this selection; owner review remains mandatory.",
  });
}

export async function writeV5FinalSelection(selection: V5FinalSelection, path = V5_FINAL_SELECTION_PATH) {
  // Exclusive creation: final feedback cannot overwrite an earlier candidate selection.
  await writeFile(path, JSON.stringify(selectionSchema.parse(selection), null, 2) + "\n", { flag: "wx" });
}

export async function readV5FinalSelection(path = V5_FINAL_SELECTION_PATH): Promise<LoadedV5FinalSelection> {
  const bytes = await readFile(path, "utf8"), selection = selectionSchema.parse(JSON.parse(bytes));
  const current = await createV5FinalSelection(selection.rationale);
  if (!isDeepStrictEqual({ ...current, selectedAt: selection.selectedAt }, selection))
    throw new Error("Frozen V5 selection no longer matches development, models, settings or corpus hashes.");
  return { selection, sha256: sha(bytes) };
}

/** Apply before allocating final inference, and again when publishing its result. */
export function assertV5FinalRunSelection(loaded: LoadedV5FinalSelection, run: {
  label?: unknown; artifact?: unknown; decode?: unknown; launch?: unknown;
  evaluationSha256?: unknown; promptContractSha256?: unknown; finalSelectionSha256?: unknown;
}) {
  const role = run.label === "v5-base-final" ? "base" : run.label === "v5-tuned-final" ? "tuned" : null;
  const artifact = run.artifact as { repo?: unknown; revision?: unknown } | undefined;
  if (!role || !isDeepStrictEqual({ repo: artifact?.repo, revision: artifact?.revision }, loaded.selection[role]) ||
      !isDeepStrictEqual(run.decode, loaded.selection.decode) || !isDeepStrictEqual(run.launch, loaded.selection.launch) ||
      run.evaluationSha256 !== loaded.selection.finalEvaluationSha256 ||
      run.promptContractSha256 !== loaded.selection.promptContractSha256 || run.finalSelectionSha256 !== loaded.sha256)
    throw new Error("Final inference differs from the candidate and experiment frozen before final predictions.");
}
