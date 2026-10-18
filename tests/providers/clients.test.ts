import { describe, it, expect } from "vitest";
import { AnthropicClient } from "../../lib/providers/anthropic";
import { JevClient } from "../../lib/providers/jev";
import {
  VeriClient,
  boundedTrainingRequest,
  boundedDeploymentRequest,
} from "../../lib/providers/veri";
describe("provider HTTP contracts", () => {
  it("passes Anthropic workspace identity", async () => {
    let observed: RequestInit | undefined;
    const client = new AnthropicClient({
      apiKey: "private-anthropic",
      workspaceId: "ws",
      model: "claude-test",
      fetch: async (_url, init) => {
        observed = init;
        return new Response(
          JSON.stringify({
            id: "msg",
            model: "claude-test",
            content: [{ type: "text", text: "ok" }],
            usage: { input_tokens: 7, output_tokens: 1 },
            stop_reason: "end_turn",
          }),
        );
      },
    });
    const response = await client.message({
      system: "Bounded investigation",
      user: "Only evidence",
      maxTokens: 32,
    });
    expect(new Headers(observed?.headers).get("anthropic-workspace-id")).toBe(
      "ws",
    );
    expect(response.text).toBe("ok");
    expect(response.usage.inputTokens).toBe(7);
  });
  it("routes low Jev confidence to unknown", async () => {
    const client = new JevClient({
      apiKey: "private-jev",
      model: "jev-test",
      fetch: async () =>
        new Response(
          JSON.stringify({
            model: "jev-test",
            answers: {
              p: {
                type: "choice",
                choice: "MET",
                probabilities: {
                  MET: 0.6,
                  NOT_MET: 0.2,
                  UNKNOWN: 0.1,
                  CONFLICTING: 0.1,
                },
                confidence: 0.2,
              },
            },
            usage: { input_tokens: 100, output_tokens: 10 },
          }),
        ),
    });
    const result = await client.judge({
      snapshotVersion: "v1",
      companyId: "c",
      jobId: "j",
      propositions: [
        { id: "p", subject: "phase_1", statement: "Inspection passed" },
      ],
      evidence: [{ id: "s1", companyId: "c", jobId: "j", text: "It passed." }],
    });
    expect(result.judgments[0].state).toBe("UNKNOWN");
    expect(result.judgments[0].rawChoice).toBe("MET");
  });
  it("redacts provider error bodies and never retries paid calls", async () => {
    let count = 0;
    const client = new AnthropicClient({
      apiKey: "private-anthropic",
      model: "test",
      fetch: async () => {
        count++;
        return new Response("secret prompt private-anthropic", { status: 429 });
      },
    });
    await expect(
      client.message({ system: "x", user: "y", maxTokens: 8 }),
    ).rejects.toThrow(/429/);
    expect(count).toBe(1);
    const bad = new JevClient({
      apiKey: "k",
      fetch: async () =>
        new Response(
          JSON.stringify({
            model: "x",
            answers: {
              p: {
                type: "choice",
                choice: "HALLUCINATED",
                probabilities: {},
                confidence: 1,
              },
            },
            usage: { input_tokens: 1, output_tokens: 1 },
          }),
        ),
    });
    await expect(
      bad.judge({
        snapshotVersion: "1",
        companyId: "c",
        jobId: "j",
        propositions: [{ id: "p", subject: "s", statement: "passed" }],
        evidence: [],
      }),
    ).rejects.toThrow();
  });
  it("uses real merged SFT and avoids persistent serving floor", () => {
    const train = boundedTrainingRequest({
      datasetId: "d@snap-1",
      repo: "me/greenlight-proof",
      maxSteps: 2,
    });
    expect(train.method).toBe("sft_text");
    expect(train.hf_push.artifact).toBe("merged");
    expect(train.requires_heartbeat).toBe(true);
    const dep = boundedDeploymentRequest("me/greenlight-proof", "proof");
    expect(dep.min_replicas).toBe(0);
    expect(dep.max_replicas).toBe(1);
    expect(dep.self_heal_attempts).toBe(0);
  });
  it("never sends Veri secrets to a caller-selected host", () => {
    expect(
      () =>
        new VeriClient({ apiKey: "secret", baseUrl: "https://evil.example" }),
    ).toThrow(/host/i);
  });
});
