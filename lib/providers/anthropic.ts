import { z } from "zod";
import {
  assertOfficialUrl,
  FetchLike,
  providerRequest,
  required,
} from "./http";
const responseSchema = z.object({
  id: z.string(),
  model: z.string(),
  content: z.array(
    z.object({ type: z.string(), text: z.string().optional() }).passthrough(),
  ),
  usage: z
    .object({
      input_tokens: z.number().int().nonnegative(),
      output_tokens: z.number().int().nonnegative(),
    })
    .passthrough(),
  stop_reason: z.string().nullable().optional(),
});
export interface AnthropicConfig {
  apiKey: string;
  workspaceId?: string;
  model: string;
  baseUrl?: string;
  fetch?: FetchLike;
  timeoutMs?: number;
}
export class AnthropicClient {
  private readonly base: string;
  constructor(private readonly config: AnthropicConfig) {
    required(config.apiKey, "ANTHROPIC_API_KEY");
    required(config.model, "ANTHROPIC_MODEL");
    this.base = assertOfficialUrl(
      config.baseUrl ?? "https://api.anthropic.com",
      "api.anthropic.com",
    );
  }
  async message(input: { system: string; user: string; maxTokens: number }) {
    if (
      !Number.isInteger(input.maxTokens) ||
      input.maxTokens < 1 ||
      input.maxTokens > 4096
    )
      throw new Error("maxTokens must be bounded to 1..4096");
    const raw = await providerRequest<unknown>(
      "anthropic",
      this.base + "/v1/messages",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": this.config.apiKey,
          "anthropic-version": "2023-06-01",
          ...(this.config.workspaceId
            ? { "anthropic-workspace-id": this.config.workspaceId }
            : {}),
        },
        body: JSON.stringify({
          model: this.config.model,
          max_tokens: input.maxTokens,
          system: input.system,
          messages: [{ role: "user", content: input.user }],
        }),
      },
      this.config.fetch,
      this.config.timeoutMs,
    );
    const response = responseSchema.parse(raw);
    const text = response.content
      .filter((x) => x.type === "text")
      .map((x) => x.text ?? "")
      .join("");
    if (!text) throw new Error("Anthropic returned no text");
    return {
      id: response.id,
      model: response.model,
      text,
      stopReason: response.stop_reason,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
    };
  }
}
