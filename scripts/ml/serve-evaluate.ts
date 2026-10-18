import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import {
  VeriClient,
  VeriDeployment,
  boundedDeploymentRequest,
  DEFAULT_BASE_MODEL,
} from "../../lib/providers/veri";
import { extractionPrompt, extractionPromptV4 } from "../../lib/providers/extraction";
import { extractionPromptV5 } from "../../lib/providers/extraction-v5";
import { assertReviewedV5Evaluation } from "../../lib/providers/evaluation-v5";
import { readV5FinalSelection, assertV5FinalRunSelection } from "../../lib/providers/final-selection-v5";
import { assertVeriResponseModel, veriResponseModelIdentity } from "../../lib/providers/veri-response-identity";
import {
  scoreExtraction,
  summarizeExtraction,
} from "../../lib/providers/evaluation";
import { buildC120Showcase } from "../../lib/providers/showcase";
import {
  initOwnerTelemetry,
  traceExtraction,
  recordExtractionScore,
  flushOwnerTelemetry,
  reportOwnerFailure,
} from "./telemetry";
import { providerRequest } from "../../lib/providers/http";
import { usdToCentsCeil } from "../../lib/budget/ledger";
import type { LabeledExample } from "./generate-data";
import {
  args,
  intArg,
  loadProjectEnv,
  ledger,
  saveJson,
  pause,
  now,
  publicError,
} from "./shared";
import {
  SubmissionIdentity,
  submitExactlyOnce,
  stopAndVerify,
} from "../../lib/providers/lifecycle";
import {
  startRecoveryGuard,
  persistRecovery,
  finishRecovery,
} from "./recovery-guard";
interface HfModel {
  id: string;
  sha: string;
  private: boolean;
  siblings: { rfilename: string }[];
}
async function hfMetadata(repo: string, token: string) {
  const result = await providerRequest<HfModel>(
    "huggingface",
    "https://huggingface.co/api/models/" + repo,
    { headers: { authorization: "Bearer " + token } },
  );
  if (!result.sha || !result.id || !Array.isArray(result.siblings))
    throw new Error("HF artifact metadata is incomplete");
  const files = result.siblings.map((x) => x.rfilename);
  if (
    !files.includes("config.json") ||
    !files.some((x) => x.includes("tokenizer")) ||
    !files.some((x) => /\.safetensors$/.test(x) && !x.startsWith("adapter_"))
  )
    throw new Error(
      "HF artifact lacks standalone weights, config, or tokenizer",
    );
  if (files.includes("adapter_config.json"))
    throw new Error(
      "Artifact still contains standalone-adapter metadata; merged export needs verification",
    );
  const configResponse = await fetch(
    `https://huggingface.co/${repo}/resolve/${result.sha}/config.json`,
    {
      headers: { authorization: "Bearer " + token },
      signal: AbortSignal.timeout(30000),
    },
  );
  if (!configResponse.ok)
    throw new Error(
      `HF config retrieval failed with HTTP ${configResponse.status}`,
    );
  const configText = await configResponse.text();
  if (configText.length > 1_000_000)
    throw new Error("HF model config exceeds inspection bound");
  const config = JSON.parse(configText);
  const quantization = Object.fromEntries(
    [
      "quant_method",
      "load_in_4bit",
      "load_in_8bit",
      "bnb_4bit_quant_type",
      "bnb_4bit_use_double_quant",
      "bnb_4bit_compute_dtype",
    ]
      .filter((key) => config.quantization_config?.[key] !== undefined)
      .map((key) => [key, config.quantization_config[key]]),
  );
  return {
    repo: result.id,
    revision: result.sha,
    private: result.private,
    files,
    configuration: {
      configSha256: createHash("sha256").update(configText).digest("hex"),
      modelType: config.model_type,
      architectures: config.architectures,
      declaredDtype: config.dtype ?? config.torch_dtype ?? null,
      quantization,
      runtimeDtype:
        "Not directly attested; model config is repository evidence only.",
    },
  };
}
async function main() {
  const env = loadProjectEnv(),
    a = args(),
    repo = String(a.repo ?? DEFAULT_BASE_MODEL),
    label = String(a.label ?? "base");
  const evaluationDir = resolve(String(a["evaluation-dir"] ?? "data/evaluation/v4-schema-contract"));
  if (![resolve("data/training"), resolve("data/evaluation/v4-schema-contract"), resolve("data/evaluation/v5-development"), resolve("data/evaluation/v5-final")].includes(evaluationDir))
    throw new Error("Choose a reviewed frozen evaluation directory.");
  const promptProfile = String(a["prompt-profile"] ?? "json-schema-v4");
  if (!["legacy-v3", "json-schema-v4", "reference-contract-v5"].includes(promptProfile))
    throw new Error("Unknown extraction prompt contract.");
  const prompt = promptProfile === "legacy-v3" ? extractionPrompt : promptProfile === "reference-contract-v5" ? extractionPromptV5 : extractionPromptV4;
  const promptContractSha256 = createHash("sha256").update(prompt({sourceId:"PROMPT_CONTRACT",text:"",amountRefs:[],subjects:[]})).digest("hex");
  const maxCents = intArg(a, "max-cents", 200, 25, 400),
    timeoutSeconds = intArg(a, "timeout-seconds", 1800, 300, 3600);
  const client = new VeriClient({
      apiKey: env.VERI_API_KEY ?? "",
      timeoutMs: 60000,
    }),
    budget = ledger();
  const manifest = JSON.parse(
    await readFile(resolve(evaluationDir, "manifest.json"), "utf8"),
  );
  if (manifest.dataClassification !== "PUBLIC_SYNTHETIC")
    throw new Error("Only reviewed public synthetic evaluation data may reach the model.");
  const isV5 = evaluationDir === resolve("data/evaluation/v5-development") || evaluationDir === resolve("data/evaluation/v5-final");
  if (isV5) {
    if (promptProfile !== "reference-contract-v5") throw new Error("V5 requires its reviewed prompt profile.");
    assertReviewedV5Evaluation(manifest, evaluationDir === resolve("data/evaluation/v5-final") ? "final-evaluation" : "development-only");
  } else if (promptProfile === "reference-contract-v5") throw new Error("V5 may not reuse a historical final set.");
  if (evaluationDir === resolve("data/evaluation/v4-schema-contract") &&
      (promptProfile !== "json-schema-v4" || manifest.promptProfile !== promptProfile ||
       manifest.frozen !== true ||
       manifest.reviewStatus !== "independently-audited-before-query" ||
       manifest.independentAudit?.evaluationSha256 !== manifest.hashes?.["evaluation.frozen.jsonl"]))
    throw new Error("V4 final queries require the matching prompt and independently audited frozen case hash.");
  if (
    !Number.isInteger(manifest.evaluationCount) ||
    manifest.evaluationCount < 1 ||
    manifest.evaluationCount > 1000
  )
    throw new Error("Frozen manifest evaluation count invalid");
  const limit = intArg(
    a,
    "limit",
    manifest.evaluationCount,
    1,
    manifest.evaluationCount,
  );
  if (isV5 && manifest.purpose === "final-evaluation" && (limit !== manifest.evaluationCount || a["canary-only"]))
    throw new Error("The V5 final must run in full after development; use the development directory for canaries.");
  // Selection must exist and match completed development before opening any final cases.
  const finalSelection = isV5 && manifest.purpose === "final-evaluation"
    ? await readV5FinalSelection() : null;
  const raw = await readFile(
      resolve(evaluationDir, "evaluation.frozen.jsonl"),
      "utf8",
    ),
    hash = createHash("sha256").update(raw).digest("hex");
  if (hash !== manifest.hashes["evaluation.frozen.jsonl"])
    throw new Error("Frozen evaluation hash changed; experiment refused");
  const all = raw
    .trim()
    .split("\n")
    .map((x) => JSON.parse(x) as LabeledExample);
  if (all.length !== manifest.evaluationCount || new Set(all.map(row => row.id)).size !== all.length || all.some(row => typeof row.id !== "string" || !row.id.trim()))
    throw new Error("Evaluation manifest count or unique case identities are invalid; allocation refused.");
  // Round-robin semantic families for shortened spot checks, deterministic and identical for base/tuned.
  const examples = a["canary-only"]
    ? []
    : Array.from({ length: 4 }, (_, i) =>
        all.filter((_, index) => index % 4 === i),
      )
        .flat()
        .slice(0, limit);
  const [artifact, catalog, balance, burn] = await Promise.all([
    hfMetadata(repo, env.HF_TOKEN ?? ""),
    client.catalog(),
    client.balance(),
    client.request<{ active_jobs: unknown[]; active_deployments: unknown[] }>(
      "/v1/billing/burn_rate",
    ),
  ]);
  if (burn.active_jobs.length || burn.active_deployments.length)
    throw new Error("Reconcile active Veri resources before paid serving");
  const gpu = catalog.catalog.find(
    (x) =>
      x.provider === "aws" &&
      x.workload === "serving" &&
      x.gpu_type === "L4-24GB" &&
      x.node_counts.includes(1) &&
      x.status === "available",
  );
  if (!gpu?.usd_per_gpu_hr) throw new Error("No verified serving rate");
  const estimatedMaximum = usdToCentsCeil(
    (gpu.usd_per_gpu_hr * (timeoutSeconds + 600)) / 3600,
  );
  if (estimatedMaximum > maxCents || balance.balance_usd < maxCents / 100)
    throw new Error("Serving bound exceeds reserved budget/credit");
  const request = boundedDeploymentRequest(
    repo,
    "greenlight-" + label + "-" + randomUUID(),
  );
  const plan = {
    schemaVersion: 1,
    label,
    mode: "real-veri-serving",
    purpose: a["canary-only"]
      ? "technical-path-proof-only"
      : manifest.purpose === "development-only" ? "development-evaluation" : "frozen-heldout-evaluation",
    artifact,
    dataVersion: manifest.version,
    ...(isV5 ? { corpusPurpose: manifest.purpose } : {}),
    evaluationDir,
    promptProfile,
    promptContractSha256,
    evaluationSha256: hash,
    frozenCaseCount: all.length,
    exampleCount: examples.length,
    decode: { temperature: 0, maxTokens: 768 },
    launch: {
      engine: request.engine,
      gpu: request.gpu,
      vllmExtraArgs: request.vllm_extra_args,
    },
    comparisonScope:
      "Same frozen cases, prompts, schema and decoding compare the original released base against the trained/exported artifact. Weight quantization and potentially serving dtype differ. This measures the combined artifact pipeline, not the causal effect of fine-tuning alone.",
    maxCents,
    timeoutSeconds,
    verifiedRateUsdPerGpuHour: gpu.usd_per_gpu_hr,
    estimatedMaximumUsd: estimatedMaximum / 100,
    identityBoundary:
      "Unique HF repository, observed SHA before and after, cache disabled, returned model identity. Provider API does not attest exact loaded commit SHA.",
    responseModelIdentity: veriResponseModelIdentity(request.name, repo),
    ...(finalSelection ? { finalSelectionSha256: finalSelection.sha256 } : {}),
  };
  if (finalSelection) assertV5FinalRunSelection(finalSelection, plan);
  if (!a.execute) {
    console.log(JSON.stringify({ ...plan, execute: false }, null, 2));
    return;
  }
  const id = "veri-serving-" + label + "-" + randomUUID(),
    record = resolve("work/ml", id + ".json"),
    deadline = Date.now() + timeoutSeconds * 1000;
  initOwnerTelemetry("extractor-evaluation", id);
  const identity: SubmissionIdentity = {
    schemaVersion: 1,
    submissionId: id,
    kind: "deployment",
    uniqueName: request.name,
    expectedModel: repo,
    deadlineMs: deadline,
    createdAt: now(),
    ownerPid: process.pid,
  };
  const recoveryPath = resolve("work/ml/recovery", id + ".json");
  await budget.reserve({
    id,
    provider: "veri",
    purpose: "Base/tuned frozen extraction evaluation " + repo,
    maxCents,
  });
  let dep: VeriDeployment | undefined,
    stopVerified = false;
  const rows: unknown[] = [],
    scores: ReturnType<typeof scoreExtraction>[] = [];
  let showcase: Record<string, unknown> | undefined;
  try {
    await saveJson(record, {
      ...plan,
      reservationId: id,
      submissionName: identity.uniqueName,
      status: "prepared",
      rows,
    });
    await startRecoveryGuard(recoveryPath, identity);
    dep = (await submitExactlyOnce({
      client,
      identity,
      persist: (r) => persistRecovery(recoveryPath, r),
      create: () => client.createDeployment(request),
    })) as VeriDeployment;
    const start = Date.now();
    await saveJson(record, {
      ...plan,
      reservationId: id,
      deploymentId: dep.id,
      status: dep.status,
      rows,
    });
    console.log(
      JSON.stringify({
        event: "deployment-submitted",
        deploymentId: dep.id,
        label,
        record,
      }),
    );
    while (dep.status !== "serving") {
      if (["failed", "stopped"].includes(dep.status))
        throw new Error("Deployment failed to reach serving");
      if (Date.now() >= deadline)
        throw new Error("Serving provisioning deadline reached");
      await pause(10000);
      dep = await client.deployment(dep.id);
      console.log(
        JSON.stringify({
          event: "deployment-status",
          deploymentId: dep.id,
          status: dep.status,
        }),
      );
    }
    const provisioningMs = Date.now() - start;
    const servingDeploymentId = dep.id;
    // Canary is a real inference on an already-trained tiny proof example; separate from evaluation metrics.
    const canary = JSON.parse(
      (
        await readFile(resolve("data/training/train-labels.jsonl"), "utf8")
      ).split("\n")[0],
    ) as LabeledExample;
    const canaryStart = Date.now();
    const canaryResponse = await traceExtraction(
      repo,
      id,
      "training_canary",
      () =>
        client.chat(
          servingDeploymentId,
          repo,
          [{ role: "user", content: prompt(canary.context) }],
          768,
        ),
    );
    const canaryRecord = {
      id: canary.id,
      returnedModel: canaryResponse.model,
      latencyMs: Date.now() - canaryStart,
      text: canaryResponse.text,
      score: scoreExtraction(
        canaryResponse.text,
        canary.context,
        canary.expected,
      ),
    };
    assertVeriResponseModel(canaryResponse.model, request.name);
    recordExtractionScore(id, canary.id, canaryRecord.score);
    const trainingCanaries: unknown[] = [];
    if (isV5) {
      const training = (await readFile(resolve("data/training/v5-reference-contract/train-labels.jsonl"), "utf8")).trim().split("\n").map(line => JSON.parse(line) as LabeledExample);
      const picks = [
        training.find(row => row.expected.status === "PROPOSED" && row.expected.trigger?.op === "ATOM"),
        training.find(row => row.expected.status === "PROPOSED" && row.expected.trigger?.op === "ALL" && row.expected.trigger.children.some(n => n.op !== "ATOM")),
        training.find(row => row.expected.status === "PROPOSED" && row.expected.trigger?.op === "ANY"),
        training.find(row => row.expected.status === "AMBIGUOUS" && row.expected.trigger?.op === "ALL"),
        training.find(row => row.expected.status === "UNSUPPORTED" && row.expected.trigger?.op === "ALL"),
        training.find(row => row.expected.status === "UNSUPPORTED" && row.expected.trigger === null && row.expected.due !== null),
      ];
      for (const example of picks) {
        if (!example) throw new Error("V5 diagnostic canary coverage is incomplete.");
        if (Date.now() + 60000 >= deadline) throw new Error("Canary would exceed remaining GPU lifetime");
        const t = Date.now();
        const response = await traceExtraction(repo,id,"training_canary",()=>client.chat(servingDeploymentId,repo,[{role:"user",content:prompt(example.context)}],768));
        assertVeriResponseModel(response.model, request.name);
        const score=scoreExtraction(response.text,example.context,example.expected);
        trainingCanaries.push({id:example.id,returnedModel:response.model,text:response.text,expected:example.expected,score,latencyMs:Date.now()-t,includedInEvaluationMetrics:false});
      }
    }
    for (const example of examples) {
      if (Date.now() + 60000 >= deadline)
        throw new Error("Evaluation would exceed remaining GPU lifetime");
      const t = Date.now(),
        response = await traceExtraction(repo, id, "frozen_case", () =>
          client.chat(
            servingDeploymentId,
            repo,
            [{ role: "user", content: prompt(example.context) }],
            768,
          ),
        );
      assertVeriResponseModel(response.model, request.name);
      const score = scoreExtraction(
        response.text,
        example.context,
        example.expected,
      );
      scores.push(score);
      recordExtractionScore(id, example.id, score);
      rows.push({
        id: example.id,
        promptSha256: createHash("sha256").update(prompt(example.context)).digest("hex"),
        family: example.family,
        returnedModel: response.model,
        latencyMs: Date.now() - t,
        finishReason: response.finishReason,
        usage: response.usage,
        text: response.text,
        expected: example.expected,
        score,
      });
      await saveJson(record, {
        ...plan,
        reservationId: id,
        deploymentId: dep.id,
        status: "evaluating",
        provisioningMs,
        canary: canaryRecord,
        trainingCanaries,
        rows,
        summary: summarizeExtraction(scores),
      });
      console.log(
        JSON.stringify({
          event: "evaluation-item",
          label,
          count: rows.length,
          valid: score.valid,
          materialExact: score.materialExact,
        }),
      );
    }
    if (!a["canary-only"] && manifest.purpose !== "development-only") {
      if (Date.now() + 60000 >= deadline)
        throw new Error("C120 showcase would exceed remaining GPU lifetime");
      const source = buildC120Showcase(),
        t = Date.now();
      // Only the source excerpt and visible references reach the model. Expected labels stay local.
      const prediction = await traceExtraction(repo, id, "c120_showcase", () =>
        client.chat(
          servingDeploymentId,
          repo,
            [{ role: "user", content: prompt(source.context) }],
          768,
        ),
      );
      assertVeriResponseModel(prediction.model, request.name);
      const score = scoreExtraction(
        prediction.text,
        source.context,
        source.expected,
      );
      recordExtractionScore(
        id,
        "C120-showcase-excluded-from-test-metrics",
        score,
      );
      showcase = {
        sourceId: source.sourceId,
        sourceSha256: source.sourceSha256,
        sourceText: source.sourceText,
        fullSourceText: source.fullSourceText,
        context: source.context,
        candidate: score.parsed ?? null,
        materialExact: score.materialExact,
        score,
        modelOutput: prediction.text,
        returnedModel: prediction.model,
        modelRevision: artifact.revision,
        latencyMs: Date.now() - t,
        expected: source.expected,
        includedInEvaluationMetrics: false,
      };
    }
    const afterArtifact = await hfMetadata(repo, env.HF_TOKEN ?? "");
    if (afterArtifact.revision !== artifact.revision)
      throw new Error(
        "HF repository changed during evaluation; result invalid",
      );
    dep = (await stopAndVerify(client, "deployment", dep.id)) as VeriDeployment;
    stopVerified = true;
    await finishRecovery(recoveryPath, identity, dep.id, dep.status);
    const after = await client.balance();
    const actual = usdToCentsCeil(
      Math.max(
        dep.total_cost_usd ?? 0,
        balance.balance_usd - after.balance_usd,
      ),
    );
    if (actual > 0)
      await budget.settle(
        id,
        actual,
        "Veri stopped deployment final cost / isolated balance delta " + dep.id,
      );
    const result = {
      ...plan,
      reservationId: id,
      deploymentId: dep.id,
      status: "completed",
      stopVerified,
      costUsd: actual / 100,
      costSettled: actual > 0,
      provisioningMs,
      canary: canaryRecord,
      trainingCanaries,
      rows,
      showcase: showcase ?? null,
      summary: scores.length ? summarizeExtraction(scores) : null,
      completedAt: now(),
    };
    await saveJson(record, result);
    await saveJson(resolve("work/ml/evaluation-" + label + ".json"), result);
    await flushOwnerTelemetry();
    console.log(
      JSON.stringify({
        event: "evaluation-completed",
        label,
        deploymentId: dep.id,
        summary: result.summary,
        costUsd: actual / 100,
        stopVerified,
        record,
      }),
    );
  } catch (error) {
    if (dep) {
      try {
        dep = (await stopAndVerify(
          client,
          "deployment",
          dep.id,
        )) as VeriDeployment;
        stopVerified = true;
        await finishRecovery(recoveryPath, identity, dep.id, dep.status);
      } catch {
        /* acknowledged guard owns cleanup; reservation retained */
      }
    }
    await saveJson(record, {
      ...plan,
      reservationId: id,
      deploymentId: dep?.id ?? null,
      status: "failed",
      error: publicError(error),
      stopVerified,
      needsCostReconciliation: true,
      rows,
      showcase: showcase ?? null,
      summary: scores.length ? summarizeExtraction(scores) : null,
      verifiedAt: now(),
    });
    throw error;
  } finally {
    if (dep && !stopVerified) {
      try {
        await stopAndVerify(client, "deployment", dep.id);
      } catch {
        /* reservation remains */
      }
    }
  }
}
main().catch(async (error) => {
  await reportOwnerFailure(error);
  console.error(publicError(error));
  process.exitCode = 1;
});
