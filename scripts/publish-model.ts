import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { createHash } from "node:crypto";
import { args, loadProjectEnv, saveJson } from "./ml/shared";
import { providerRequest } from "../lib/providers/http";

/** Publish only a completed, manifest-bound synthetic Greenlight model, with provenance. */
async function main() {
  const env = loadProjectEnv();
  const input = args();
  if (!input.run)
    throw new Error("Provide --run work/ml/VERIFIED_TRAINING_RECORD.json");
  const run = JSON.parse(await readFile(resolve(String(input.run)), "utf8"));
  if (
    run.mode !== "real-veri-sft" ||
    run.state !== "completed" ||
    !run.cleanupVerified
  )
    throw new Error(
      "A completed, terminal-verified training record is required.",
    );
  if (!run.repo?.startsWith(env.HF_NAMESPACE + "/greenlight-extractor-"))
    throw new Error(
      "Only this owner’s Greenlight output repositories are allowed.",
    );
  let matchedCorpus = "";
  for (const root of [
    "data/training",
    "data/training/v4-schema-contract",
    "data/training/v5-reference-contract",
    "data/training/v1-technical-proof",
    "data/training/v2-invoice-clock-archive",
  ]) {
    const path = resolve(root, basename(run.datasetFile));
    try {
      const bytes = await readFile(path);
      if (
        createHash("sha256").update(bytes).digest("hex") !== run.datasetSha256
      )
        continue;
      for (const name of [
        "ANTHROPIC_API_KEY",
        "TYPESAFE_API_KEY",
        "VERI_API_KEY",
        "HF_TOKEN",
        "SENTRY_AUTH_TOKEN",
      ]) {
        const value = env[name];
        if (value && value.length > 12 && bytes.includes(Buffer.from(value)))
          throw new Error("Credential found in corpus; publication refused.");
      }
      matchedCorpus = path;
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  if (!matchedCorpus)
    throw new Error(
      "Training data does not match a reviewed public synthetic corpus.",
    );
  const repo = String(run.repo);
  const headers = { authorization: "Bearer " + env.HF_TOKEN };
  const metadata = await providerRequest<{ id: string; sha: string }>(
    "huggingface",
    "https://huggingface.co/api/models/" + repo,
    { headers },
  );
  const card = `---
license: apache-2.0
base_model: ${run.baseModel}
pipeline_tag: text-generation
tags:
  - headroom
  - sft
  - qlora
  - synthetic-data
---

# Headroom payment-clause extractor

This is a merged QLoRA derivative of [${run.baseModel}](https://huggingface.co/${run.baseModel}), published for [Headroom](https://github.com/ManagementMO/headroom), developed under the working name Greenlight. The original model identifier is retained for reproducibility.

Training used **${run.rows} synthetic examples and ${run.maxSteps} configured optimizer steps** through Veri. Dataset SHA-256: \`${run.datasetSha256}\`. Training job: \`${run.jobId}\`. Rank 8, 4-bit loading, learning rate 0.0001, sequence limit ${run.maxSeqLength ?? 1536}, micro-batch 1, gradient accumulation 2. Prompt profile: \`${run.promptProfile ?? "legacy-v3"}\`.

${run.maxSteps <= 4 ? "**Technical integration proof only.** Four steps demonstrate training, merge and export; they do not establish useful extraction quality." : "This model proposes bounded structured payment terms. Consult the repository’s matched frozen base/tuned evaluation before making any quality claim."}

The corpus contains generated clause text and developer-reviewed labels. No credentials or private customer records were used. Final labels are not uploaded to the trainer. Local tokenization validates the intended completion-only objective; remote effective label tensors were not directly inspected.

Outputs need source validation and owner review. Invoice eligibility, invoice issuance, contractual due date and actual bank settlement are distinct. Financial calculations remain in Headroom’s deterministic cents engine. This model does not establish cash availability, authenticate documents or authorize payments.

The base model is licensed Apache 2.0. Headroom’s modifications are the QLoRA fine-tune described above. Quantized merge can change generations; merged weights require their own serving and quality verification. See the source repository for corpus hashes, evaluation boundaries and reproducible owner tooling.
`;
  const license = await fetch(
    "https://www.apache.org/licenses/LICENSE-2.0.txt",
  ).then((response) => {
    if (!response.ok) throw new Error("License retrieval failed");
    return response.text();
  });
  if (!license.includes("Apache License") || !license.includes("Version 2.0"))
    throw new Error("License text validation failed.");
  if (!input.execute) {
    console.log(
      JSON.stringify({
        repo,
        matchedCorpus,
        rows: run.rows,
        maxSteps: run.maxSteps,
        publishPublic: true,
        execute: false,
      }),
    );
    return;
  }
  const payload =
    [
      {
        key: "header",
        value: {
          summary:
            "Document Headroom synthetic training provenance and limitations",
          parentCommit: metadata.sha,
        },
      },
      ...[
        { path: "README.md", content: card },
        { path: "LICENSE", content: license },
      ].map((file) => ({
        key: "file",
        value: {
          path: file.path,
          content: Buffer.from(file.content).toString("base64"),
          encoding: "base64",
        },
      })),
    ]
      .map((value) => JSON.stringify(value))
      .join("\n") + "\n";
  await providerRequest(
    "huggingface",
    "https://huggingface.co/api/models/" + repo + "/commit/main",
    {
      method: "POST",
      headers: { ...headers, "content-type": "application/x-ndjson" },
      body: payload,
    },
  );
  await providerRequest(
    "huggingface",
    "https://huggingface.co/api/models/" + repo + "/settings",
    {
      method: "PUT",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ visibility: "public" }),
    },
  );
  const publicMetadata = await providerRequest<{
    id: string;
    private: boolean;
    sha: string;
  }>("huggingface", "https://huggingface.co/api/models/" + repo, {});
  const config = await fetch(
    "https://huggingface.co/" +
      repo +
      "/resolve/" +
      publicMetadata.sha +
      "/config.json",
  );
  if (publicMetadata.private || !config.ok)
    throw new Error(
      "Anonymous access to the published model was not verified.",
    );
  await saveJson(resolve("work/ml/published-" + basename(repo) + ".json"), {
    repo,
    revision: publicMetadata.sha,
    public: true,
    anonymousConfigHttp: config.status,
    verifiedAt: new Date().toISOString(),
  });
  console.log(
    JSON.stringify({
      repo,
      revision: publicMetadata.sha,
      public: true,
      anonymousConfigHttp: config.status,
    }),
  );
}
main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Model publication failed",
  );
  process.exitCode = 1;
});
