import * as Sentry from "@sentry/nextjs";
import { sentryRelease } from "./lib/observability/release";
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  enabled: Boolean(process.env.SENTRY_DSN),
  tracesSampleRate: 1,
  release: sentryRelease(process.env),
  environment: process.env.VERCEL_ENV || process.env.NODE_ENV,
  initialScope: { tags: { component: "edge" } },
});
