import * as Sentry from '@sentry/nextjs';
Sentry.init({ dsn: process.env.SENTRY_DSN, enabled: Boolean(process.env.SENTRY_DSN), tracesSampleRate: 1, release: process.env.SENTRY_RELEASE || 'greenlight@0.1.0', environment: process.env.VERCEL_ENV || process.env.NODE_ENV, initialScope: { tags: { component: 'edge' } } });
