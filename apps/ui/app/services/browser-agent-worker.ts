import { reportWorkerFailures } from '#lib/worker-error-reporting.js';
/** Create the browser-only agent worker. Desktop aliases this module to a refusal. */
export const createBrowserAgentWorker = (): Worker =>
  reportWorkerFailures(
    new Worker(new URL('../workers/agent-host.worker.ts', import.meta.url), {
      type: 'module',
      name: 'tau-agent-host-worker',
    }),
    'agent-host',
  );
