import { createModuleWorker } from '#lib/module-worker.js';
/** Create the browser-only agent worker. Desktop aliases this module to a refusal. */
export const createBrowserAgentWorker = (): Worker =>
  createModuleWorker(
    () =>
      new Worker(new URL('../workers/agent-host.worker.ts', import.meta.url), {
        type: 'module',
        name: 'tau-agent-host-worker',
      }),
    {
      name: 'agent-host',
      // The client owns it: it starts a new worker within its bound, then hands over to the page (FP10).
      onLoadFailure: () => undefined,
    },
  );
