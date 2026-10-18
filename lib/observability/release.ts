/** Keep source maps, browser events and server events on the same named release. */
export function sentryRelease(env: Record<string, string | undefined>) {
  if (env.SENTRY_RELEASE) return env.SENTRY_RELEASE;
  const revision = env.HEADROOM_SOURCE_SHA || env.GREENLIGHT_SOURCE_SHA || env.VERCEL_GIT_COMMIT_SHA;
  return revision ? `greenlight@${revision}` : "greenlight@0.1.0";
}
