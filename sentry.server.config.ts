import * as Sentry from "@sentry/nextjs";
import { sentryRelease } from "./lib/observability/release";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  enabled: Boolean(process.env.SENTRY_DSN),
  environment: process.env.VERCEL_ENV || process.env.NODE_ENV || "development",
  release: sentryRelease(process.env),
  tracesSampleRate: 1,
  beforeSend(event) {
    delete event.user;
    if (event.request) {
      delete event.request.cookies;
      delete event.request.data;
      delete event.request.headers;
    }
    return event;
  },
  initialScope: { tags: { component: "server", product: "greenlight" } },
});
