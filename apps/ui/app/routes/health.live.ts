import process from 'node:process';
import type { LoaderFunction } from 'react-router';
import { heapThresholdBytes } from '@taucad/ui-core/constants/health.constants';

/**
 * Liveness probe for the UI SSR process.
 *
 * Mirrors `apps/api/app/api/health/health.controller.ts:checkLive`: only
 * inspects in-process state (heap usage). Never reaches out to upstream
 * dependencies — restarting the UI container won't fix an API outage and
 * doing so cascades the failure (machine flaps remove the LB target while
 * the API is still healthy).
 *
 * 200 ⇒ heap under threshold, kept in rotation.
 * 503 ⇒ heap over threshold, container should be restarted.
 *
 * Liveness is process-only; readiness checks upstream API health.
 */
export const loader: LoaderFunction = () => {
  const { heapUsed, heapTotal } = process.memoryUsage();
  const healthy = heapUsed < heapThresholdBytes;

  return Response.json(
    {
      status: healthy ? 'ok' : 'error',
      details: {
        memoryHeap: {
          status: healthy ? 'up' : 'down',
          heapUsedBytes: heapUsed,
          heapTotalBytes: heapTotal,
          thresholdBytes: heapThresholdBytes,
        },
      },
    },
    {
      status: healthy ? 200 : 503,
      headers: { 'Cache-Control': 'no-store' },
    },
  );
};
