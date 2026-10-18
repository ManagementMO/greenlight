import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { extractionPromptV5 } from "../../lib/providers/extraction-v5";
import { scoreExtraction, summarizeExtraction } from "../../lib/providers/evaluation";
import { v5PromptHash } from "../../lib/providers/evaluation-v5";
import { assertV5FinalRunSelection, createV5FinalSelection, readV5FinalSelection, writeV5FinalSelection, V5_FINAL_SELECTION_PATH } from "../../lib/providers/final-selection-v5";

const { files, writes } = vi.hoisted(() => ({ files: new Map<string, string>(), writes: vi.fn() }));
vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(async (path: string) => {
    if (!files.has(path)) throw Object.assign(new Error("ENOENT: " + path), { code: "ENOENT" });
    return files.get(path)!;
  }),
  writeFile: writes.mockImplementation(async (path: string, value: string, options: { flag: string }) => {
    if (options.flag === "wx" && files.has(path)) throw Object.assign(new Error("EEXIST"), { code: "EEXIST" });
    files.set(path, value);
  }),
}));
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const put = (path: string, value: unknown) => files.set(path, JSON.stringify(value));
const change = (path: string, mutate: (value: any) => void) => { // Test corruptions deliberately exercise untrusted JSON.
  const value = JSON.parse(files.get(path)!); mutate(value); put(path, value);
};
const rationale = "Development supports freezing this exact candidate before any final inference.";

function fixture() {
  const examples = Array.from({ length: 24 }, (_, index) => {
    const context = { sourceId: "source-" + index, text: "The $10 installment is payable after inspection passes for phase_b, due on 2026-12-03.",
      amountRefs: [{ id: "installment", cents: 1000, currency: "USD" as const }], subjects: ["phase_b"] };
    const expected = { schemaVersion: 1 as const, amountRef: "installment", trigger: { op: "ATOM" as const, condition: "INSPECTION_PASSED" as const, subject: "phase_b" },
      due: { kind: "ON_DATE" as const, date: "2026-12-03" }, sourceIds: [context.sourceId], status: "PROPOSED" as const, issues: [] };
    return { id: "dev-" + index, context, expected };
  });
  const devBytes = examples.map(example => JSON.stringify(example)).join("\n") + "\n";
  files.set("data/evaluation/v5-development/evaluation.frozen.jsonl", devBytes);
  files.set("data/training/v5-reference-contract/train.jsonl", "training-only\n");
  put("data/training/v5-reference-contract/manifest.json", { hashes: { "train.jsonl": hash("training-only\n") } });
  for (const split of ["development", "final"] as const) {
    const corpusHash = split === "development" ? hash(devBytes) : "f".repeat(64);
    put(`data/evaluation/v5-${split}/manifest.json`, { version: "v5-" + split, dataClassification: "PUBLIC_SYNTHETIC", promptProfile: "reference-contract-v5",
      promptContractSha256: v5PromptHash(), purpose: split === "development" ? "development-only" : "final-evaluation",
      evaluationCount: split === "development" ? 24 : 48, frozen: true, reviewStatus: "independently-audited-before-query",
      hashes: { "evaluation.frozen.jsonl": corpusHash }, independentAudit: { evaluationSha256: corpusHash } });
  }
  const decode = { temperature: 0, maxTokens: 768 }, launch = { engine: "vllm", gpu: { gpu_type: "L4-24GB", gpu_count: 1 }, vllmExtraArgs: ["--max-model-len", "4096"] };
  const published: Record<string, any> = { origin: "recorded", purpose: "development-only", caseCount: 24,
    evaluationSha256: hash(devBytes), promptContractSha256: v5PromptHash(), comparison: { promoted: false } };
  for (const role of ["base", "tuned"] as const) {
    const rows = examples.map(example => {
      const text = JSON.stringify(example.expected), score = scoreExtraction(text, example.context, example.expected);
      return { id: example.id, text, expected: example.expected, score, promptSha256: hash(extractionPromptV5(example.context)) };
    });
    const run = { label: `v5-${role}-dev`, mode: "real-veri-serving", dataVersion: "v5-development", purpose: "development-evaluation", corpusPurpose: "development-only",
      frozenCaseCount: 24, exampleCount: 24, artifact: { repo: "owner/" + role, revision: (role === "base" ? "a" : "b").repeat(40) },
      status: "completed", stopVerified: true, costSettled: true, evaluationSha256: hash(devBytes), promptContractSha256: v5PromptHash(), promptProfile: "reference-contract-v5",
      decode, launch, rows, summary: summarizeExtraction(rows.map(row => row.score)) };
    put(`work/ml/evaluation-v5-${role}-dev.json`, run);
    published[role] = { artifact: run.artifact, decode, launch, summary: run.summary, rows: rows.map(row => ({ ...row, output: row.text, outputSha256: hash(row.text) })) };
  }
  put("data/artifacts/extraction-v5-development.json", published);
}

beforeEach(() => { files.clear(); writes.mockClear(); fixture(); });

describe("V5 final candidate selection", () => {
  it("requires completed development, never opens final cases, and writes once", async () => {
    const selection = await createV5FinalSelection(rationale);
    expect(selection.finalEvaluationSha256).toBe("f".repeat(64));
    expect(files.has("data/evaluation/v5-final/evaluation.frozen.jsonl")).toBe(false);
    await writeV5FinalSelection(selection);
    expect(writes).toHaveBeenCalledWith(V5_FINAL_SELECTION_PATH, expect.any(String), { flag: "wx" });
    await expect(writeV5FinalSelection(selection)).rejects.toThrow("EEXIST");
    expect((await readV5FinalSelection()).selection).toEqual(selection);
  });

  it.each(["status", "stopVerified", "costSettled", "exampleCount"])("rejects incomplete development %s", async (field) => {
    change("work/ml/evaluation-v5-tuned-dev.json", run => { run[field] = field === "status" ? "evaluating" : field === "exampleCount" ? 23 : false; });
    await expect(createV5FinalSelection(rationale)).rejects.toThrow();
  });

  it("re-scores responses, so a forged summary cannot freeze a candidate", async () => {
    change("work/ml/evaluation-v5-tuned-dev.json", run => { run.rows[0].text = "{}"; });
    await expect(createV5FinalSelection(rationale)).rejects.toThrow("binding");
  });

  it("rejects changed development evidence after selection", async () => {
    await writeV5FinalSelection(await createV5FinalSelection(rationale));
    change("work/ml/evaluation-v5-tuned-dev.json", run => { run.diagnostic = "new run, same summary"; });
    await expect(readV5FinalSelection()).rejects.toThrow("no longer matches");
  });

  it("refuses final queries without a selection record", async () => {
    await expect(readV5FinalSelection()).rejects.toThrow("ENOENT");
  });

  it("binds final runs to model revision, prompt, corpus, decoding, launch and selection bytes", async () => {
    await writeV5FinalSelection(await createV5FinalSelection(rationale));
    const loaded = await readV5FinalSelection();
    const run = { label: "v5-tuned-final", artifact: loaded.selection.tuned, decode: loaded.selection.decode, launch: loaded.selection.launch,
      evaluationSha256: loaded.selection.finalEvaluationSha256, promptContractSha256: loaded.selection.promptContractSha256, finalSelectionSha256: loaded.sha256 };
    expect(() => assertV5FinalRunSelection(loaded, run)).not.toThrow();
    for (const delta of [
      { label: "v5-tuned-dev" }, { artifact: { ...run.artifact, revision: "c".repeat(40) } },
      { artifact: { ...run.artifact, repo: "owner/different" } }, { decode: { ...run.decode, temperature: 0.1 } },
      { launch: { ...run.launch, vllmExtraArgs: [] } }, { evaluationSha256: "a".repeat(64) },
      { promptContractSha256: "b".repeat(64) }, { finalSelectionSha256: "c".repeat(64) },
    ]) expect(() => assertV5FinalRunSelection(loaded, { ...run, ...delta })).toThrow("frozen before final");
  });
});
