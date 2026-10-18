import { randomUUID, createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { getScenario } from "../lib/domain";
import {
  JevClient,
  buildJevRequest,
  customerCertificateReceiptProposition,
} from "../lib/providers/jev";
import { jevCostCents } from "../lib/providers/pricing";
import { args, loadProjectEnv, ledger, saveJson } from "./ml/shared";
import {
  initOwnerTelemetry,
  flushOwnerTelemetry,
  reportOwnerFailure,
} from "./ml/telemetry";
import * as Sentry from "@sentry/node";

async function main() {
  const env = loadProjectEnv();
  const fixture = getScenario("ductline-phase-delay")!;
  const sources = fixture.evidence.filter((source) =>
    ["signed-contract", "inspection-plan", "customer-email"].includes(
      source.id,
    ),
  );
  const propositions = [
    {
      id: "inspection",
      subject: "phase_one",
      statement: `As of ${fixture.snapshotDate}, the phase-one inspection has actually passed; a future plan alone does not establish this.`,
    },
    {
      ...customerCertificateReceiptProposition("certificate", "phase_one"),
      statement: `As of ${fixture.snapshotDate}, the customer or its explicitly authorized project manager has actually received the phase-one insurance certificate. A future expected receipt is not observed receipt.`,
    },
    {
      id: "settlement",
      subject: "phase_one",
      statement: `As of ${fixture.snapshotDate}, the USD30,000 phase payment has actually reached settled bank funds. Invoice eligibility, a due date and forecast collection windows do not establish settlement.`,
    },
  ];
  const input = {
    snapshotVersion: `${fixture.id}:${fixture.snapshotDate}:v${fixture.version}`,
    companyId: fixture.company.id,
    jobId: fixture.job.id,
    propositions,
    evidence: sources.map((source) => ({
      id: source.id,
      companyId: fixture.company.id,
      jobId: fixture.job.id,
      text: source.text,
    })),
  };
  const maxCents = Math.max(
    1,
    jevCostCents(
      Buffer.byteLength(JSON.stringify(buildJevRequest(input))) + 1024,
    ),
  );
  if (!args().execute) {
    console.log(
      JSON.stringify({
        purpose:
          "Current C120 evidence judgments; separate from future planning assumptions",
        questions: propositions.length,
        maxCents,
        execute: false,
      }),
    );
    return;
  }
  const runId = "jev-c120-" + randomUUID();
  const budget = ledger();
  await budget.reserve({
    id: runId,
    provider: "jev",
    purpose: "C120 current-snapshot scoped evidence judgments",
    maxCents,
  });
  initOwnerTelemetry("evidence-judgments", runId);
  const started = Date.now();
  const response = await Sentry.startSpan(
    {
      name: "evidence.judge_current_conditions",
      op: "gen_ai.decide",
      attributes: {
        "gen_ai.operation.name": "decide",
        "gen_ai.provider.name": "typesafe",
        "gen_ai.request.model": "jev-1.14.0",
        "greenlight.snapshot": input.snapshotVersion,
      },
    },
    async (span) => {
      const result = await new JevClient({
        apiKey: env.TYPESAFE_API_KEY || "",
      }).judge(input);
      span.setAttributes({
        "gen_ai.response.model": result.model,
        "gen_ai.usage.input_tokens": result.usage.inputTokens,
        "gen_ai.usage.output_tokens": result.usage.outputTokens,
      });
      return result;
    },
  );
  await budget.settle(
    runId,
    jevCostCents(response.usage.inputTokens),
    "Verified Jev usage and request hash " + response.requestHash,
  );
  const publicRun = {
    schemaVersion: 1,
    origin: "recorded",
    runId,
    snapshotDate: fixture.snapshotDate,
    companyId: fixture.company.id,
    jobId: fixture.job.id,
    model: response.model,
    requestHash: response.requestHash,
    evidenceSha256: createHash("sha256")
      .update(JSON.stringify(input.evidence))
      .digest("hex"),
    sourceIds: sources.map((source) => source.id),
    generatedAt: new Date().toISOString(),
    latencyMs: Date.now() - started,
    judgments: response.judgments.map((judgment) => ({
      predicate: propositions.find(
        (item) => item.id === judgment.propositionId,
      )!.statement,
      verdict: judgment.state,
      confidence: judgment.confidence,
      sourceIds: judgment.evidenceScope,
    })),
    detail:
      "Current evidence truth as of October6. The cash engine separately tests explicitly disclosed future conditions and settlement assumptions. These judgments never create an invoice, activate a receipt or move money.",
  };
  await saveJson("work/evidence-judgments.json", {
    input,
    response,
    ...publicRun,
  });
  await writeFile(
    "data/artifacts/evidence-judgments.json",
    JSON.stringify(publicRun, null, 2) + "\n",
  );
  Sentry.logger.info("Current C120 evidence judged", {
    runId,
    model: response.model,
    sourceCount: sources.length,
    questions: propositions.length,
  });
  await flushOwnerTelemetry();
  console.log(
    JSON.stringify({
      runId,
      model: response.model,
      judgments: publicRun.judgments,
      costCents: jevCostCents(response.usage.inputTokens),
    }),
  );
}
main().catch(async (error) => {
  await reportOwnerFailure(error);
  console.error(
    error instanceof Error ? error.message : "Evidence evaluation failed",
  );
  process.exitCode = 1;
});
