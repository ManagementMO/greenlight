export async function GET() {
  return Response.json(
    {
      status: "ok",
      application: "headroom",
      version: "0.1.0",
      sourceRevision:
        process.env.HEADROOM_SOURCE_SHA ||
        process.env.GREENLIGHT_SOURCE_SHA ||
        process.env.VERCEL_GIT_COMMIT_SHA ||
        null,
      mode: "public-deterministic-demo",
      paidPublicInference: false,
      sentryConfigured: Boolean(process.env.SENTRY_DSN),
      timestamp: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
