import { createModuleWorker } from '@taucad/ui-core/lib/module-worker';
import { reportWorkerFailures } from '#lib/worker-error-reporting.js';

/** The resident agent host worker's name in reports and in the page's replacement bound (FP10). */
export const agentHostWorkerName = 'agent-host';

/** Create the browser-only agent worker. Desktop aliases this module to a refusal. */
export const createBrowserAgentWorker = (): Worker =>
  reportWorkerFailures(
    createModuleWorker(
      () =>
        new Worker(new URL('../workers/agent-host.worker.ts', import.meta.url), {
          type: 'module',
          name: 'tau-agent-host-worker',
        }),
      { name: agentHostWorkerName },
    ),
    'agent-host',
  );
