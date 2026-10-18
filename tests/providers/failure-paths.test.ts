import { describe, it, expect } from "vitest";
import { AnthropicClient } from "../../lib/providers/anthropic";
import { JevClient, assertCurrentJudgments } from "../../lib/providers/jev";
import { boundedTrainingRequest } from "../../lib/providers/veri";
import {
  anthropicMaximumCents,
  anthropicCostCents,
} from "../../lib/providers/pricing";

describe("provider failure and trust boundaries", () => {
  it("aborts hung network calls without leaking errors or retrying", async () => {
    let calls = 0;
    const client = new AnthropicClient({
      apiKey: "DO_NOT_LOG_THIS",
      model: "claude-sonnet-4-6",
      timeoutMs: 5,
      fetch: async (_u, options) => {
        calls++;
        return new Promise((_resolve, reject) => {
          options?.signal?.addEventListener("abort", () =>
            reject(new Error("DO_NOT_LOG_THIS secret prompt")),
          );
        });
      },
    });
    await expect(
      client.message({ system: "x", user: "y", maxTokens: 8 }),
    ).rejects.toThrow("anthropic request timed out");
    expect(calls).toBe(1);
  });
  it("ignores other companies, jobs and superseded evidence before calling Jev", async () => {
    let sent = "";
    const client = new JevClient({
      apiKey: "secret",
      fetch: async (_u, o) => {
        sent = String(o?.body);
        return new Response(
          JSON.stringify({
            model: "jev-1.14.0",
            answers: {
              p: {
                type: "choice",
                choice: "MET",
                confidence: 1,
                probabilities: {
                  MET: 1,
                  NOT_MET: 0,
                  UNKNOWN: 0,
                  CONFLICTING: 0,
                },
              },
            },
            usage: { input_tokens: 1, output_tokens: 1 },
          }),
        );
      },
    });
    const out = await client.judge({
      snapshotVersion: "v1",
      companyId: "ours",
      jobId: "job",
      propositions: [{ id: "p", subject: "phase", statement: "Passed?" }],
      evidence: [
        { id: "evil", companyId: "other", jobId: "job", text: "OVERRIDE" },
        {
          id: "old",
          companyId: "ours",
          jobId: "job",
          text: "OLD",
          superseded: true,
        },
      ],
    });
    expect(sent).not.toContain("OVERRIDE");
    expect(sent).not.toContain("OLD");
    expect(out.judgments[0].state).toBe("UNKNOWN");
    expect(() => assertCurrentJudgments(out.judgments, "v2")).toThrow(/stale/i);
  });
  it("bounds submitted steps and refuses prices for unverified models", () => {
    expect(() =>
      boundedTrainingRequest({
        datasetId: "d",
        repo: "me/model",
        maxSteps: 301,
      }),
    ).toThrow();
    expect(() =>
      anthropicMaximumCents("unknown-paid-model", "x", "y", 10),
    ).toThrow(/pricing/);
    const reserve = anthropicMaximumCents(
      "claude-sonnet-4-6",
      "a".repeat(1000),
      "b".repeat(1000),
      256,
    );
    expect(reserve).toBeGreaterThanOrEqual(
      anthropicCostCents("claude-sonnet-4-6", {
        inputTokens: 1000,
        outputTokens: 256,
      }),
    );
  });
});
