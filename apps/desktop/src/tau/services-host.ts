/**
 * Services utility entry (work item E7).
 *
 * Thin bootstrap over `services-host.impl.ts`; everything testable lives
 * there. Imports no `electron`: `process.parentPort` is a process global on an
 * Electron utility process, not a module export.
 */

import { createDiagnosticsLog } from '#main/diagnostics.js';
import { randomUUID } from 'node:crypto';

import { createServicesHost } from '#tau/services-host.impl.js';
import type { UtilityMessage } from '#tau/services-host.impl.js';

type ParentPort = {
  on(event: 'message', listener: (message: UtilityMessage) => void): unknown;
  postMessage(message: unknown): void;
};

const { parentPort } = process as unknown as { parentPort?: ParentPort };
if (!parentPort) {
  throw new Error('The Tau services host must run inside an Electron utility process.');
}

/* Into the same rotating file main writes, so `agent-host-ready` and
 * `node-fs-served` are assertable from disk rather than only from inherited
 * stdout. Absent the directory the default console sink still applies. */
const logDirectory = process.env['TAU_DESKTOP_LOG_DIR'];
const diagnostics =
  logDirectory === undefined ? undefined : createDiagnosticsLog({ directory: logDirectory, producer: 'services' });
const pendingRuntimePorts = new Map<
  string,
  {
    readonly runtimePortTimeout: ReturnType<typeof setTimeout>;
    reject(error: Error): void;
    resolve(lease: {
      readonly port: UtilityMessage['ports'][number];
      release(reason: 'requested' | 'render-timeout'): void;
    }): void;
  }
>();
const requestRuntimePort = async (
  workspaceRoot: string,
): Promise<{
  readonly port: UtilityMessage['ports'][number];
  release(reason: 'requested' | 'render-timeout'): void;
}> => {
  const requestId = randomUUID();
  const port = new Promise<{
    readonly port: UtilityMessage['ports'][number];
    release(reason: 'requested' | 'render-timeout'): void;
  }>((resolve, reject) => {
    const runtimePortTimeout = setTimeout(() => {
      pendingRuntimePorts.delete(requestId);
      parentPort.postMessage({ type: 'runtime-port-release', requestId });
      reject(new Error('Main did not answer the desktop runtime-port request within 10 seconds.'));
    }, 10_000);
    pendingRuntimePorts.set(requestId, { resolve, reject, runtimePortTimeout });
  });
  try {
    parentPort.postMessage({ type: 'runtime-port-request', requestId, workspaceRoot });
  } catch (error) {
    const pending = pendingRuntimePorts.get(requestId);
    if (pending) {
      pendingRuntimePorts.delete(requestId);
      clearTimeout(pending.runtimePortTimeout);
      pending.reject(error instanceof Error ? error : new Error(String(error)));
    }
  }
  return port;
};
const host = createServicesHost({
  requestRuntimePort,
  runtimeContext: (action, workspaceRoot, projectRoot) => {
    parentPort.postMessage({ type: `runtime-context-${action}`, workspaceRoot, projectRoot });
  },
  /* The reply half of main's quit hold (W19): every project this utility serves
   * has taken its close cut and settled its sync. */
  quiesced: (error) => {
    parentPort.postMessage({
      type: error === undefined ? 'quiesced' : 'quiesce-failed',
      ...(error === undefined ? {} : { error }),
    });
  },
  agentHostReleased: (requestId, error) => {
    parentPort.postMessage({
      type: error === undefined ? 'agent-host-released' : 'agent-host-release-failed',
      requestId,
    });
  },
  ...(diagnostics === undefined
    ? {}
    : {
        log: (event, detail) => {
          diagnostics.log('info', `services.${event}`, detail);
        },
      }),
});
process.once('exit', () => {
  for (const pending of pendingRuntimePorts.values()) {
    clearTimeout(pending.runtimePortTimeout);
    pending.reject(new Error('The services utility exited before main supplied a runtime port.'));
  }
  pendingRuntimePorts.clear();
  host.dispose();
});
parentPort.on('message', (message) => {
  const frame = message.data;
  if (frame && typeof frame === 'object') {
    const { requestId, type } = frame as Record<string, unknown>;
    if (typeof requestId === 'string' && (type === 'runtime-port' || type === 'runtime-port-refused')) {
      const pending = pendingRuntimePorts.get(requestId);
      if (pending) {
        pendingRuntimePorts.delete(requestId);
        clearTimeout(pending.runtimePortTimeout);
        const [port] = message.ports;
        if (type === 'runtime-port' && port) {
          pending.resolve({
            port,
            release: () => {
              parentPort.postMessage({ type: 'runtime-port-release', requestId });
            },
          });
        } else {
          port?.close();
          pending.reject(new Error('Main refused the desktop runtime-port request.'));
        }
      } else {
        for (const latePort of message.ports) {
          latePort.close();
        }
        parentPort.postMessage({ type: 'runtime-port-release', requestId });
      }
      return;
    }
  }
  host.handleMessage(message);
});

// oxlint-disable-next-line no-console -- startup trace, forwarded to userData/logs
console.log(`[services] started node=${process.versions.node}`);
