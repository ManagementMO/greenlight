import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import * as Sentry from "@sentry/node";
import { AnthropicClient } from "../../lib/providers/anthropic";
import { JevClient, type JudgmentState } from "../../lib/providers/jev";
import {
  anthropicMaximumCents,
  anthropicCostCents,
  jevCostCents,
} from "../../lib/providers/pricing";
import {
  baselineManifest,
  candidateSchema,
  conditionKey,
  evidenceFor,
  hash,
  promoteCandidate,
  type HarnessManifest,
  type GateMetrics,
} from "../../lib/harness/runtime";
import {
  frozenWorkload,
  questions,
  workloadVersion,
} from "../../lib/harness/workload";
import { loadProjectEnv, ledger, saveJson, now } from "../ml/shared";

interface RunResult {
  manifest: HarnessManifest;
  metrics: GateMetrics & {
    accuracy: number;
    coverage: number;
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
    latencyMs: number;
    cacheHits: number;
  };
  predictions: unknown[];
  calls: unknown[];
}
const parseJson = (text: string) =>
  JSON.parse(
    text
      .trim()
      .replace(/^```(?:json)?\s*/, "")
      .replace(/\s*```$/, ""),
  );

async function main() {
  const env = loadProjectEnv(),
    budget = ledger(),
    model = "claude-sonnet-4-6",
    jevModel = "jev-1.14.0";
  const runId = "metaharness-" + Date.now().toString(36),
    frozenHash = hash(frozenWorkload);
  Sentry.init({
    dsn: env.SENTRY_DSN,
    release: "greenlight@0.1.0",
    environment: "experiment",
    tracesSampleRate: 1,
    initialScope: { tags: { component: "metaharness", runId } },
  });
  // This development-only profile describes work shape, not final examples or labels.
  const system =
    "You author a bounded declarative workflow configuration for Greenlight. You cannot modify the evaluator, money engine, ground truth, model, tools, or permissions. Return one JSON object only.";
  const user =
    "Current workflow: " +
    JSON.stringify(baselineManifest) +
    '\nDevelopment profile: stable approved payment terms; updates change one evidence dependency at a time; identical redeliveries occur. Existing caching is enabled but keys on the whole job snapshot. Each condition is currently requested separately. Evidence has validated company/job/subject identities. Propose a more efficient configuration preserving exact judgment semantics and at least 0.8 confidence. Allowed keys only: schemaVersion:1, name:string, cacheScope:"snapshot"|"dependency", batchQuestions:boolean, scopedEvidence:boolean, confidenceThreshold:0.8..0.98. Use no code or labels. Preserve coverage; do not increase threshold without evidence.';
  const authorReservation = runId + "-author";
  await budget.reserve({
    id: authorReservation,
    provider: "anthropic",
    purpose: "Bounded MetaHarness configuration author",
    maxCents: anthropicMaximumCents(model, system, user, 500),
  });
  const authored = await Sentry.startSpan(
    { name: "metaharness.author_candidate", op: "gen_ai.invoke_agent" },
    () =>
      new AnthropicClient({
        apiKey: env.ANTHROPIC_API_KEY || "",
        workspaceId: env.ANTHROPIC_WORKSPACE_ID,
        model,
      }).message({ system, user, maxTokens: 500 }),
  );
  await budget.settle(
    authorReservation,
    anthropicCostCents(model, authored.usage),
    "Verified author token usage " + authored.id,
  );
  const candidate = candidateSchema.parse(parseJson(authored.text));
  if (hash(frozenWorkload) !== frozenHash)
    throw new Error("Frozen evaluator workload changed.");
  async function run(manifest: HarnessManifest): Promise<RunResult> {
    const start = performance.now(),
      cache = new Map<string, { state: JudgmentState; confidence: number }>(),
      client = new JevClient({
        apiKey: env.TYPESAFE_API_KEY || "",
        model: jevModel,
        confidenceThreshold: manifest.confidenceThreshold,
      });
    const predictions: unknown[] = [],
      calls: unknown[] = [];
    let correct = 0,
      decisive = 0,
      falseSatisfied = 0,
      modelCalls = 0,
      inputTokens = 0,
      outputTokens = 0,
      costCents = 0,
      cacheHits = 0;
    for (const update of frozenWorkload) {
      const snapshotEvidence = update.evidence.filter(
        (e) =>
          !e.superseded &&
          e.companyId === "evaluation-contractor" &&
          e.jobId === "evaluation-job",
      );
      const states: Record<
        string,
        { state: JudgmentState; confidence: number }
      > = {};
      const pending: {
        question: (typeof questions)[number];
        key: string;
        evidence: typeof snapshotEvidence;
      }[] = [];
      for (const question of questions) {
        const relevant = manifest.scopedEvidence
          ? evidenceFor(snapshotEvidence, question.subject)
          : snapshotEvidence;
        const key = conditionKey(
          jevModel,
          "evaluation-contractor",
          "evaluation-job",
          question,
          manifest.cacheScope === "dependency" ? relevant : snapshotEvidence,
        );
        const hit = cache.get(key);
        if (hit) {
          states[question.id] = hit;
          cacheHits++;
        } else pending.push({ question, key, evidence: relevant });
      }
      const groups =
        manifest.batchQuestions && pending.length
          ? [pending]
          : pending.map((p) => [p]);
      for (const group of groups) {
        const evidence = [
          ...new Map(
            group.flatMap((p) => p.evidence).map((e) => [e.id, e]),
          ).values(),
        ];
        const id = runId + "-" + manifest.cacheScope + "-" + randomUUID();
        const maxTokens =
          Buffer.byteLength(JSON.stringify(evidence)) +
          group.length * 2500 +
          2048;
        await budget.reserve({
          id,
          provider: "jev",
          purpose: "Frozen workflow replay " + update.id,
          maxCents: Math.max(1, jevCostCents(maxTokens)),
        });
        const callStart = performance.now();
        const response = await Sentry.startSpan(
          {
            name: "metaharness.judge_conditions",
            op: "gen_ai.chat",
            attributes: {
              "gen_ai.request.model": jevModel,
              "workflow.variant": manifest.cacheScope,
              "workflow.questions": group.length,
            },
          },
          () =>
            client.judge({
              snapshotVersion: update.id,
              companyId: "evaluation-contractor",
              jobId: "evaluation-job",
              propositions: group.map((p) => p.question),
              evidence,
            }),
        );
        const latencyMs = Math.round(performance.now() - callStart),
          charged = jevCostCents(response.usage.inputTokens);
        await budget.settle(
          id,
          charged,
          "Verified Jev token usage " + response.requestHash,
        );
        costCents += charged;
        inputTokens += response.usage.inputTokens;
        outputTokens += response.usage.outputTokens;
        modelCalls++;
        calls.push({
          updateId: update.id,
          model: response.model,
          questions: group.map((p) => p.question.id),
          requestHash: response.requestHash,
          latencyMs,
          usage: response.usage,
        });
        for (const judgment of response.judgments) {
          const item = group.find(
            (p) => p.question.id === judgment.propositionId,
          )!;
          const answer = {
            state: judgment.state,
            confidence: judgment.confidence,
          };
          states[judgment.propositionId] = answer;
          cache.set(item.key, answer);
        }
      }
      for (const question of questions) {
        const predicted = states[question.id],
          expected = update.expected[question.id];
        if (predicted.state === expected) correct++;
        if (predicted.state !== "UNKNOWN") decisive++;
        if (predicted.state === "MET" && expected !== "MET") falseSatisfied++;
        predictions.push({
          updateId: update.id,
          questionId: question.id,
          expected,
          ...predicted,
        });
      }
    }
    const total = frozenWorkload.length * questions.length;
    return {
      manifest,
      metrics: {
        correct,
        total,
        decisive,
        falseSatisfied,
        modelCalls,
        accuracy: correct / total,
        coverage: decisive / total,
        inputTokens,
        outputTokens,
        costUsd: costCents / 100,
        latencyMs: Math.round(performance.now() - start),
        cacheHits,
      },
      predictions,
      calls,
    };
  }
  const baseline = await run(baselineManifest),
    improved = await run(candidate),
    gate = promoteCandidate(baseline.metrics, improved.metrics);
  const result = {
    schemaVersion: 1,
    id: runId,
    name: "Dependency-aware evidence updates",
    origin: "live",
    generatedAt: now(),
    author: {
      provider: "Anthropic",
      model: authored.model,
      requestId: authored.id,
    },
    evaluator: {
      version: "fixed-gates-v1",
      workloadVersion,
      frozenHash,
      sampleCount: frozenWorkload.length * questions.length,
      independentOfAuthor: true,
    },
    baseline,
    candidate: improved,
    gate,
    detail:
      "Both workflows cache stable work and use the same pinned Jev model, propositions and available evidence. Synthetic, predeclared localized-update workload; no general production speedup claim. Cost is conservatively rounded up per call, not the exact provider invoice.",
    budget: await budget.snapshot(),
  };
  await saveJson(resolve("work/harness", runId + ".json"), result);
  await mkdir("data/artifacts", { recursive: true });
  await writeFile(
    "data/artifacts/harness-experiment.json",
    JSON.stringify(result, null, 2) + "\n",
  );
  const manifestPath = "data/artifacts/current.json",
    publicManifest = JSON.parse(await readFile(manifestPath, "utf8"));
  publicManifest.generatedAt = now();
  publicManifest.budget = {
    capUsd: 20,
    spentUsd: result.budget.spentUsd,
    reservedUsd: result.budget.reservedUsd,
  };
  publicManifest.experiments = [
    {
      id: runId,
      name: result.name,
      status: gate.promoted ? "promoted" : "rejected",
      origin: "recorded",
      sampleCount: result.evaluator.sampleCount,
      baseline: baseline.metrics,
      candidate: improved.metrics,
      metrics: {
        baselineAccuracy: baseline.metrics.accuracy,
        candidateAccuracy: improved.metrics.accuracy,
        baselineCalls: baseline.metrics.modelCalls,
        candidateCalls: improved.metrics.modelCalls,
        baselineLatencyMs: baseline.metrics.latencyMs,
        candidateLatencyMs: improved.metrics.latencyMs,
      },
      detail:
        result.detail +
        " Gate: " +
        (gate.promoted ? "passed." : gate.reasons.join(" ")),
    },
  ];
  await writeFile(manifestPath, JSON.stringify(publicManifest, null, 2) + "\n");
  Sentry.logger.info("MetaHarness experiment evaluated", {
    runId,
    promoted: gate.promoted,
    baselineCalls: baseline.metrics.modelCalls,
    candidateCalls: improved.metrics.modelCalls,
    workloadHash: frozenHash,
  });
  await Sentry.flush(5000);
  console.log(
    JSON.stringify(
      {
        id: runId,
        baseline: baseline.metrics,
        candidate: improved.metrics,
        gate,
        spentUsd: result.budget.spentUsd,
        reservedUsd: result.budget.reservedUsd,
      },
      null,
      2,
    ),
  );
}
main().catch(async (error) => {
  Sentry.captureException(error);
  await Sentry.flush(3000);
  console.error(error instanceof Error ? error.message : "Experiment failed");
  process.exitCode = 1;
});
