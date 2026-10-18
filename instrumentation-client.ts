import * as Sentry from '@sentry/nextjs';
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),
  release: process.env.NEXT_PUBLIC_SENTRY_RELEASE,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 1,
  beforeSend(event) {
    delete event.user;
    if (event.request) { delete event.request.cookies; delete event.request.data; delete event.request.headers; }
    return event;
  },
  integrations: [Sentry.replayIntegration({ maskAllText: true, blockAllMedia: true })],
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1,
  initialScope: { tags: { component: 'browser', product: 'greenlight' } },
});
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
