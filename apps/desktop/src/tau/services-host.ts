/**
 * Services utility entry (work item E7).
 *
 * Thin bootstrap over `services-host.impl.ts`; everything testable lives
 * there. Imports no `electron`: `process.parentPort` is a process global on an
 * Electron utility process, not a module export.
 */

import { createDiagnosticsLog } from '#main/diagnostics.js';
import { createServicesHost } from '#tau/services-host.impl.js';
import type { UtilityMessage } from '#tau/services-host.impl.js';

type ParentPort = { on(event: 'message', listener: (message: UtilityMessage) => void): unknown };

const { parentPort } = process as unknown as { parentPort?: ParentPort };
if (!parentPort) {
  throw new Error('The Tau services host must run inside an Electron utility process.');
}

/* Into the same rotating file main writes, so `agent-host-ready` and
 * `node-fs-served` are assertable from disk rather than only from inherited
 * stdout. Absent the directory the default console sink still applies. */
const logDirectory = process.env['TAU_DESKTOP_LOG_DIR'];
const diagnostics = logDirectory === undefined ? undefined : createDiagnosticsLog({ directory: logDirectory });
const host = createServicesHost(
  diagnostics === undefined
    ? {}
    : {
        log: (event, detail) => {
          diagnostics.log('info', `services.${event}`, detail);
        },
      },
);
parentPort.on('message', (message) => {
  host.handleMessage(message);
});

// oxlint-disable-next-line no-console -- startup trace, forwarded to userData/logs
console.log(`[tau-desktop:services] started node=${process.versions.node}`);
