'use client';
import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { Sentry.captureException(error); }, [error]);
  return <html lang="en"><body style={{ fontFamily: 'system-ui', padding: 48, color: '#172D3A' }}><h1>We couldn’t open this workspace.</h1><p>Your browser’s saved inputs are still available. Reload the workspace to try again.</p><button onClick={reset}>Reload workspace</button></body></html>;
}
