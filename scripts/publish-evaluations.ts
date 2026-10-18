import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";
import {
  scoreExtraction,
  summarizeExtraction,
} from "../lib/providers/evaluation";
import {
  compareEvaluations,
  EXTRACTOR_GATE_VERSION,
} from "./ml/compare-evaluations";
import { loadProjectEnv } from "./ml/shared";
import { extractionPromptV4 } from "../lib/providers/extraction";
import type { LabeledExample } from "./ml/generate-data";

type Experiment = Parameters<typeof compareEvaluations>[0];

/** Publish reviewable synthetic predictions, never entire private provider responses. */
async function main() {
  const env = loadProjectEnv();
  const evaluationDir = "data/evaluation/v4-schema-contract";
  const manifest = JSON.parse(
    await readFile(evaluationDir + "/manifest.json", "utf8"),
  );
  if (manifest.dataClassification !== "PUBLIC_SYNTHETIC" || manifest.promptProfile !== "json-schema-v4")
    throw new Error(
      "Only the reviewed public synthetic evaluation may be published.",
    );
  const data = await readFile(evaluationDir + "/evaluation.frozen.jsonl", "utf8");
  const sha = createHash("sha256").update(data).digest("hex");
  const promptContractSha256 = createHash("sha256").update(extractionPromptV4({
    sourceId: "PROMPT_CONTRACT", text: "", amountRefs: [], subjects: [],
  })).digest("hex");
  if (sha !== manifest.hashes["evaluation.frozen.jsonl"])
    throw new Error("Frozen evaluation hash changed.");
  const labels = new Map<string, LabeledExample>(
    data
      .trim()
      .split("\n")
      .map((line) => {
        const row = JSON.parse(line) as LabeledExample;
        return [row.id, row];
      }),
  );
  const runs = await Promise.all(
    ["base", "tuned"].map(async (label) => {
      const raw = JSON.parse(
        await readFile(`work/ml/evaluation-${label}.json`, "utf8"),
      );
      if (raw.evaluationSha256 !== sha || raw.rows.length !== labels.size ||
          raw.promptProfile !== "json-schema-v4" || raw.promptContractSha256 !== promptContractSha256)
        throw new Error("Experiment does not contain the full frozen dataset.");
      const rows = raw.rows.map(
        (row: {
          id: string;
          text: string;
          score: unknown;
          latencyMs: number;
          promptSha256: string;
        }) => {
          const expected = labels.get(row.id);
          if (
            !expected ||
            typeof row.text !== "string" ||
            row.text.length > 32768
          )
            throw new Error(
              "Unknown case or unbounded prediction in private record.",
            );
          const expectedPromptSha256 = createHash("sha256").update(extractionPromptV4(expected.context)).digest("hex");
          if (row.promptSha256 !== expectedPromptSha256)
            throw new Error("A per-case prompt differs from the frozen shared prompt contract.");
          const score = scoreExtraction(
            row.text,
            expected.context,
            expected.expected,
          );
          if (!isDeepStrictEqual(score, row.score))
            throw new Error(
              "Recorded score disagrees with a fresh evaluation of the actual response.",
            );
          return {
            id: row.id,
            promptSha256: row.promptSha256,
            family: expected.family,
            latencyMs: row.latencyMs,
            output: row.text,
            outputSha256: createHash("sha256").update(row.text).digest("hex"),
            expected: expected.expected,
            score,
          };
        },
      );
      const summary = summarizeExtraction(
        rows.map(
          (row: { score: ReturnType<typeof scoreExtraction> }) => row.score,
        ),
      );
      if (!isDeepStrictEqual(summary, raw.summary))
        throw new Error(
          "Fresh prediction scores disagree with recorded summary.",
        );
      return {
        gateInput: { ...raw, rows, summary } as Experiment,
        published: {
          label,
          artifact: raw.artifact,
          decode: raw.decode,
          launch: raw.launch,
          comparisonScope: raw.comparisonScope,
          stopVerified: raw.stopVerified,
          completedAt: raw.completedAt,
          summary,
          rows,
        },
      };
    }),
  );
  const comparison = compareEvaluations(runs[0].gateInput, runs[1].gateInput);
  const saved = JSON.parse(
    await readFile("work/ml/base-tuned-comparison.json", "utf8"),
  );
  const { verifiedAt: _savedAt, ...savedDeterministic } = saved;
  const { verifiedAt: _freshAt, ...freshDeterministic } = comparison;
  if (
    !isDeepStrictEqual(savedDeterministic, freshDeterministic)
  )
    throw new Error(
      "Published comparison must match the recomputed fixed gate.",
    );
  const publicRecord = {
    schemaVersion: 1,
    origin: "recorded",
    dataClassification: "PUBLIC_SYNTHETIC",
    dataVersion: manifest.version,
    evaluationSha256: sha,
    promptProfile: "json-schema-v4",
    promptContractSha256,
    caseCount: labels.size,
    gateVersion: EXTRACTOR_GATE_VERSION,
    comparison,
    base: runs[0].published,
    tuned: runs[1].published,
    publicationBoundary:
      "Allowlisted actual synthetic predictions, re-scored before publication. No credentials, account responses, signed URLs or private documents. C120 showcase and training canary are excluded from these 40-case metrics.",
    generatedAt: new Date().toISOString(),
  };
  const serialized = JSON.stringify(publicRecord, null, 2) + "\n";
  for (const [name, value] of Object.entries(env)) {
    if (
      value &&
      value.length > 12 &&
      /API_KEY|AUTH_TOKEN|HF_TOKEN|OIDC_TOKEN|SECRET/.test(name) &&
      serialized.includes(value)
    )
      throw new Error("A credential match prevents artifact publication.");
  }
  const path = "data/artifacts/extraction-evaluation.json";
  await writeFile(path, serialized);
  console.log(
    JSON.stringify({
      published: path,
      cases: labels.size,
      gate: comparison.status,
      promoted: comparison.promoted,
    }),
  );
}

main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Evaluation publication failed.",
  );
  process.exitCode = 1;
});
