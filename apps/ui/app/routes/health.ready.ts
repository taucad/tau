import process from 'node:process';
import type { LoaderFunction } from 'react-router';
import { heapThresholdBytes } from '@taucad/ui-core/constants/health.constants';
import { getEnvironment } from '#environment.config.js';

/**
 * Readiness probe for the UI SSR process.
 *
 * Mirrors `apps/api/app/api/health/health.controller.ts:checkReady`. The UI
 * has no DB / Redis dependency of its own, but it cannot serve a usable page
 * if the API it points at is down — chat/file-manager fail immediately on
 * mount. Probing `${TAU_API_URL}/health/live` couples readiness to the
 * upstream so Fly.io / Netlify pulls the UI from rotation when the API
 * vanishes (and stops returning a stale shell that errors on first
 * interaction).
 *
 * 200 ⇒ API live + heap under threshold.
 * 503 ⇒ API unreachable / unhealthy or local heap exhausted.
 *
 * Caller-supplied AbortSignal is forwarded to the upstream fetch so probe
 * timeouts (Fly.io's 5s default) propagate cleanly instead of leaving a
 * dangling request.
 *
 * Readiness reflects both local heap budget and upstream API liveness.
 */
/** Milliseconds. */
const apiProbeTimeout = 4000;

export const loader: LoaderFunction = async ({ request }) => {
  const env = await getEnvironment();
  const { heapUsed, heapTotal } = process.memoryUsage();
  const heapHealthy = heapUsed < heapThresholdBytes;

  // Compose caller signal with a local timeout so the readiness probe can't
  // hang behind a stuck upstream beyond Fly.io's check window.
  const timeoutController = new AbortController();
  const timeoutHandle = setTimeout(() => {
    timeoutController.abort();
  }, apiProbeTimeout);
  const signal = AbortSignal.any([request.signal, timeoutController.signal]);

  let apiStatus: 'up' | 'down' = 'down';
  let apiMessage: string | undefined;
  try {
    const response = await fetch(`${env.TAU_API_URL.replace(/\/$/, '')}/health/live`, {
      signal,
      // eslint-disable-next-line @typescript-eslint/naming-convention -- HTTP header name retains TitleCase on the wire
      headers: { Accept: 'application/json' },
    });
    if (response.ok) {
      apiStatus = 'up';
    } else {
      apiMessage = `API /health/live returned ${response.status}`;
    }
  } catch (error) {
    apiMessage = error instanceof Error ? error.message : 'API /health/live fetch failed';
  } finally {
    clearTimeout(timeoutHandle);
  }

  const ready = heapHealthy && apiStatus === 'up';

  return Response.json(
    {
      status: ready ? 'ok' : 'error',
      details: {
        api: { status: apiStatus, url: env.TAU_API_URL, message: apiMessage },
        memoryHeap: {
          status: heapHealthy ? 'up' : 'down',
          heapUsedBytes: heapUsed,
          heapTotalBytes: heapTotal,
          thresholdBytes: heapThresholdBytes,
        },
      },
    },
    {
      status: ready ? 200 : 503,
      headers: { 'Cache-Control': 'no-store' },
    },
  );
};
