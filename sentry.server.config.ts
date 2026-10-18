import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  enabled: Boolean(process.env.SENTRY_DSN),
  environment: process.env.VERCEL_ENV || process.env.NODE_ENV || 'development',
  release: process.env.SENTRY_RELEASE || 'greenlight@0.1.0',
  tracesSampleRate: 1,
  beforeSend(event) {
    delete event.user;
    if (event.request) { delete event.request.cookies; delete event.request.data; delete event.request.headers; }
    return event;
  },
  initialScope: { tags: { component: 'server', product: 'greenlight' } },
});
