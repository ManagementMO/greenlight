import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";
import { sentryRelease } from "./lib/observability/release";

const release = sentryRelease(process.env);

const nextConfig: NextConfig = {
  poweredByHeader: false,
  devIndicators: false,
  turbopack: { root: process.cwd() },
  env: {
    NEXT_PUBLIC_SENTRY_DSN: process.env.SENTRY_DSN || "",
    NEXT_PUBLIC_SENTRY_RELEASE: release,
  },
  serverExternalPackages: [],
};

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG || "greenlight-full",
  project: process.env.SENTRY_PROJECT || "greenlight-full",
  authToken: process.env.SENTRY_AUTH_TOKEN,
  release: { name: release },
  silent: !process.env.CI,
  widenClientFileUpload: true,
  sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN },
  telemetry: false,
});
