import { z } from "zod";
import {
  assertOfficialUrl,
  FetchLike,
  providerRequest,
  required,
} from "./http";
export const DEFAULT_BASE_MODEL = "Qwen/Qwen3-4B-Instruct-2507";
export interface VeriJob {
  id: string;
  status: string;
  cost_usd?: number | null;
  current_step?: number | null;
  total_steps?: number | null;
  current_loss?: number | null;
  hf_repo_url?: string | null;
  error?: unknown;
  hyperparameters?: Record<string, unknown>;
  base_model?: string;
  dataset_id?: string;
  [key: string]: unknown;
}
export interface VeriDeployment {
  id: string;
  status: string;
  model: string;
  source: string;
  total_cost_usd?: number | null;
  error?: unknown;
  failure_code?: string | null;
  [key: string]: unknown;
}
export function boundedTrainingRequest(input: {
  datasetId: string;
  repo: string;
  maxSteps?: number;
  baseModel?: string;
  outputName?: string;
  gpuType?: string;
}) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(input.repo))
    throw new Error("Invalid HF repository");
  const maxSteps = input.maxSteps ?? 4;
  if (!Number.isInteger(maxSteps) || maxSteps < 1 || maxSteps > 300)
    throw new Error("Training steps exceed experiment bound");
  return {
    job_type: "managed",
    method: "sft_text",
    base_model: input.baseModel ?? DEFAULT_BASE_MODEL,
    dataset_id: input.datasetId,
    output_name: input.outputName ?? "greenlight-extractor-proof",
    provider: "aws",
    gpu: { gpu_type: input.gpuType ?? "L4-24GB", gpu_count: 1 },
    hyperparameters: {
      learning_rate: 0.0001,
      num_epochs: 1,
      max_steps: maxSteps,
      max_seq_length: 1536,
      packing: false,
      use_unsloth: false,
      lora_rank: 8,
      lora_alpha: 16,
      load_in_4bit: true,
      micro_batch_size: 1,
      gradient_accumulation_steps: 2,
    },
    requires_heartbeat: true,
    // Project workflow accepts only manifest-reviewed PUBLIC_SYNTHETIC clauses.
    // Current serving workers cannot read a private HF export through the training integration.
    hf_push: { repo: input.repo, artifact: "merged" as const, private: false },
  };
}
export function boundedDeploymentRequest(
  repo: string,
  name: string,
  gpuType = "L4-24GB",
) {
  return {
    model: repo,
    source: "huggingface",
    name,
    provider: "aws",
    gpu: { gpu_type: gpuType, gpu_count: 1 },
    engine: "vllm",
    min_replicas: 0,
    max_replicas: 1,
    scale_to_zero_window_seconds: 300,
    idle_delete_after_days: 1,
    self_heal_attempts: 0,
    cache: false,
    trace_bodies: false,
    vllm_extra_args: [
      "--max-model-len",
      "4096",
      "--max-num-seqs",
      "4",
      "--gpu-memory-utilization",
      "0.85",
    ],
  };
}
export class VeriClient {
  private readonly base: string;
  constructor(
    private readonly config: {
      apiKey: string;
      baseUrl?: string;
      fetch?: FetchLike;
      timeoutMs?: number;
    },
  ) {
    required(config.apiKey, "VERI_API_KEY");
    this.base = assertOfficialUrl(
      config.baseUrl ?? "https://api.veri.studio",
      "api.veri.studio",
    );
  }
  async request<T>(path: string, method = "GET", body?: unknown): Promise<T> {
    if (!path.startsWith("/v1/")) throw new Error("Invalid Veri API path");
    return providerRequest<T>(
      "veri",
      this.base + path,
      {
        method,
        headers: {
          authorization: "Bearer " + this.config.apiKey,
          ...(body !== undefined ? { "content-type": "application/json" } : {}),
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      },
      this.config.fetch,
      this.config.timeoutMs ?? 30000,
    );
  }
  async uploadDataset(name: string, jsonl: string) {
    const body = new FormData();
    body.set("name", name);
    body.set(
      "file",
      new Blob([jsonl], { type: "application/jsonl" }),
      "train.jsonl",
    );
    const out = await providerRequest<unknown>(
      "veri",
      this.base + "/v1/datasets",
      {
        method: "POST",
        headers: { authorization: "Bearer " + this.config.apiKey },
        body,
      },
      this.config.fetch,
      60000,
    );
    return z
      .object({
        id: z.string(),
        name: z.string().optional(),
        format: z.string().optional(),
      })
      .passthrough()
      .parse(out);
  }
  async catalog() {
    return this.request<{
      catalog: {
        provider: string;
        workload: string;
        gpu_type: string;
        node_counts: number[];
        status: string;
        usd_per_gpu_hr: number | null;
      }[];
    }>("/v1/gpu/catalog");
  }
  async balance() {
    return this.request<{ balance_usd: number }>("/v1/billing/balance");
  }
  async createTraining(input: ReturnType<typeof boundedTrainingRequest>) {
    return this.request<VeriJob>("/v1/training_jobs", "POST", input);
  }
  async job(id: string) {
    return this.request<VeriJob>("/v1/training_jobs/" + encodeURIComponent(id));
  }
  async heartbeat(id: string) {
    return this.request<unknown>(
      "/v1/training_jobs/" + encodeURIComponent(id) + "/heartbeat",
      "POST",
      {},
    );
  }
  async cancel(id: string) {
    return this.request<VeriJob>(
      "/v1/training_jobs/" + encodeURIComponent(id) + "/cancel",
      "POST",
      {},
    );
  }
  async createDeployment(input: ReturnType<typeof boundedDeploymentRequest>) {
    return this.request<VeriDeployment>("/v1/deployments", "POST", input);
  }
  async deployment(id: string) {
    return this.request<VeriDeployment>(
      "/v1/deployments/" + encodeURIComponent(id),
    );
  }
  async stop(id: string) {
    return this.request<VeriDeployment>(
      "/v1/deployments/" + encodeURIComponent(id) + "/stop",
      "POST",
      {},
    );
  }
  async chat(
    id: string,
    model: string,
    messages: { role: string; content: string }[],
    maxTokens = 768,
  ) {
    const raw = await this.request<unknown>(
      "/v1/deployments/" + encodeURIComponent(id) + "/chat/completions",
      "POST",
      { model, messages, max_tokens: maxTokens, temperature: 0, stream: false },
    );
    const response = z
      .object({
        id: z.string().optional(),
        model: z.string(),
        choices: z
          .array(
            z.object({
              message: z.object({ content: z.string() }),
              finish_reason: z.string().nullable().optional(),
            }),
          )
          .min(1),
        usage: z
          .object({ prompt_tokens: z.number(), completion_tokens: z.number() })
          .optional(),
      })
      .passthrough()
      .parse(raw);
    return {
      model: response.model,
      text: response.choices[0].message.content,
      finishReason: response.choices[0].finish_reason,
      usage: response.usage,
    };
  }
}
