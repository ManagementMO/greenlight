export type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;
export class ProviderError extends Error {
  constructor(
    readonly provider: string,
    readonly status: number | null,
    readonly requestId: string | null,
    kind = "request failed",
  ) {
    super(`${provider} ${kind}${status === null ? "" : ` (HTTP ${status})`}`);
    this.name = "ProviderError";
  }
}
/** Deliberately no retries: a timed-out paid request may already have executed. */
export async function providerRequest<T>(
  provider: string,
  url: string,
  options: RequestInit,
  fetcher: FetchLike = fetch,
  timeoutMs = 30_000,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetcher(url, {
      ...options,
      signal: controller.signal,
    });
    const id =
      response.headers.get("request-id") ??
      response.headers.get("x-request-id");
    if (!response.ok) throw new ProviderError(provider, response.status, id);
    const raw = await response.text();
    if (raw.length > 4_000_000)
      throw new ProviderError(
        provider,
        response.status,
        id,
        "response too large",
      );
    try {
      return JSON.parse(raw) as T;
    } catch {
      throw new ProviderError(
        provider,
        response.status,
        id,
        "invalid JSON response",
      );
    }
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    throw new ProviderError(
      provider,
      null,
      null,
      controller.signal.aborted ? "request timed out" : "connection failed",
    );
  } finally {
    clearTimeout(timer);
  }
}
export function required(value: string | undefined, name: string) {
  if (!value?.trim()) throw new Error(`Missing ${name}`);
  return value.trim();
}
export function assertOfficialUrl(value: string, hostname: string) {
  const u = new URL(value);
  if (
    u.protocol !== "https:" ||
    u.hostname !== hostname ||
    u.username ||
    u.password ||
    u.search ||
    u.hash
  )
    throw new Error("Provider base URL host is not permitted");
  return u.href.replace(/\/$/, "");
}
