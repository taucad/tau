/**
 * Services utility entry (work item E7).
 *
 * Thin bootstrap over `services-host.impl.ts`; everything testable lives
 * there. Imports no `electron`: `process.parentPort` is a process global on an
 * Electron utility process, not a module export.
 */

import { createDiagnosticsLog } from '#main/diagnostics.js';
import { randomUUID } from 'node:crypto';

import { createServicesHost, refusedRuntimePortMessage } from '#tau/services-host.impl.js';
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
const authorityDirectory = process.env['TAU_DESKTOP_AUTHORITY_DIR'];
if (!authorityDirectory) {
  throw new Error('The Tau services host requires a host-owned filesystem authority directory.');
}
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
/* The `git` main resolved from the bundle, when this build ships one (OQ3);
 * absent, the toolchain comes from `PATH` and says so once if it is not there. */
const gitExecutable = process.env['TAU_GIT_EXECUTABLE'];

const host = createServicesHost({
  authorityDirectory,
  requestRuntimePort,
  ...(gitExecutable === undefined || gitExecutable === '' ? {} : { gitExecutable }),
  runtimeContext: (action, workspaceRoot, projectRoot) => {
    parentPort.postMessage({ type: `runtime-context-${action}`, workspaceRoot, projectRoot });
  },
  /* The reply half of main's quit hold (W19): every project this utility serves
   * has taken its close cut and settled its sync. */
  quiesced: (outcome) => {
    parentPort.postMessage(outcome);
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
        log: (event, detail, level) => {
          diagnostics.log(level ?? 'info', `services.${event}`, detail);
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
    const { message: refusal, requestId, type } = frame as Record<string, unknown>;
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
          pending.reject(new Error(refusedRuntimePortMessage(refusal)));
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
