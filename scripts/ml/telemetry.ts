import * as Sentry from "@sentry/node";
import type { ExtractionScore } from "../../lib/providers/evaluation";

export function initOwnerTelemetry(component: string, runId: string) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    enabled: Boolean(process.env.SENTRY_DSN),
    environment: "experiment",
    release: process.env.SENTRY_RELEASE || "greenlight@0.1.0",
    tracesSampleRate: 1,
    beforeSend(event) {
      delete event.user;
      if (event.request) {
        delete event.request.headers;
        delete event.request.cookies;
        delete event.request.data;
      }
      return event;
    },
    initialScope: { tags: { product: "greenlight", component, runId } },
  });
}

type Inference = {
  model: string;
  usage?: { prompt_tokens: number; completion_tokens: number };
};
/** Current Sentry AI conventions; record usage/identity, never document or answer bodies. */
export function traceExtraction<T extends Inference>(
  model: string,
  runId: string,
  purpose: string,
  invoke: () => Promise<T>,
): Promise<T> {
  return Sentry.startSpan(
    {
      name: `extractor.${purpose}`,
      op: "gen_ai.chat",
      attributes: {
        "gen_ai.operation.name": "chat",
        "gen_ai.provider.name": "veri",
        "gen_ai.request.model": model,
        "greenlight.run_id": runId,
        "greenlight.purpose": purpose,
      },
    },
    async (span) => {
      const result = await invoke();
      span.setAttribute("gen_ai.response.model", result.model);
      if (result.usage)
        span.setAttributes({
          "gen_ai.usage.input_tokens": result.usage.prompt_tokens,
          "gen_ai.usage.output_tokens": result.usage.completion_tokens,
          "gen_ai.usage.total_tokens":
            result.usage.prompt_tokens + result.usage.completion_tokens,
        });
      return result;
    },
  );
}

export function recordExtractionScore(
  runId: string,
  caseId: string,
  score: ExtractionScore,
) {
  const attributes = {
    runId,
    caseId,
    valid: score.valid,
    materialExact: score.materialExact,
    unsafeProposed: score.unsafeProposed,
  };
  if (score.unsafeProposed || !score.valid)
    Sentry.logger.warn(
      "Extraction candidate withheld by evaluator",
      attributes,
    );
  else Sentry.logger.info("Extraction candidate evaluated", attributes);
}
export async function flushOwnerTelemetry() {
  await Sentry.flush(3000);
}
export async function reportOwnerFailure(error: unknown) {
  try {
    Sentry.captureException(error);
    await flushOwnerTelemetry();
  } catch {
    /* Monitoring must never hide the primary failure. */
  }
}
