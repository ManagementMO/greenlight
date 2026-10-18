export async function GET() {
  return Response.json({ status: 'ok', application: 'greenlight', version: '0.1.0', mode: 'public-deterministic-demo', paidPublicInference: false, sentryConfigured: Boolean(process.env.SENTRY_DSN), timestamp: new Date().toISOString() }, { headers: { 'Cache-Control': 'no-store' } });
}
