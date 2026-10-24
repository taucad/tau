/**
 * Services utility entry (work item E7).
 *
 * Thin bootstrap over `services-host.impl.ts`; everything testable lives
 * there. Imports no `electron`: `process.parentPort` is a process global on an
 * Electron utility process, not a module export.
 */

import { createDiagnosticsLog } from '#main/diagnostics.js';
import { randomUUID } from 'node:crypto';

import type { HostPrepareKernel } from '@taucad/host';
import { preparableKernels } from '@taucad/native-process-core/store';

import { createServicesHost, refusedRuntimePortMessage } from '#tau/services-host.impl.js';
import { desktopNativeDeployments } from '#tau/desktop-native-deployments.js';
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
/* Optional on purpose: a build that names no machine store serves every other
 * concern and refuses the machines concern. Main names the app's old machine
 * directory only when it is not the store itself. */
const machinesDirectory = process.env['TAU_DESKTOP_MACHINES_DIR'];
const legacyMachinesDirectory = process.env['TAU_DESKTOP_LEGACY_MACHINES_DIR'];
const diagnostics =
  logDirectory === undefined ? undefined : createDiagnosticsLog({ directory: logDirectory, producer: 'services' });
const pendingRuntimePorts = new Map<
  string,
  {
    readonly runtimePortTimeout: ReturnType<typeof setTimeout>;
    reject(error: Error): void;
    resolve(lease: {
      readonly port: UtilityMessage['ports'][number];
      release(reason: 'requested' | 'operation-timeout'): void;
    }): void;
  }
>();
const pendingGeometryPorts = new Map<
  string,
  {
    readonly geometryPortTimeout: ReturnType<typeof setTimeout>;
    resolve(port: UtilityMessage['ports'][number]): void;
    reject(error: Error): void;
  }
>();
const requestGeometryPort = async (workspaceRoot: string): Promise<UtilityMessage['ports'][number]> => {
  const requestId = randomUUID();
  const answer = new Promise<UtilityMessage['ports'][number]>((resolve, reject) => {
    const geometryPortTimeout = setTimeout(() => {
      pendingGeometryPorts.delete(requestId);
      reject(new Error('Main did not answer the geometry-runner port request within 10 seconds.'));
    }, 10_000);
    pendingGeometryPorts.set(requestId, { geometryPortTimeout, resolve, reject });
  });
  try {
    parentPort.postMessage({ type: 'geometry-port-request', requestId, workspaceRoot });
  } catch (error) {
    const pending = pendingGeometryPorts.get(requestId);
    if (pending) {
      pendingGeometryPorts.delete(requestId);
      clearTimeout(pending.geometryPortTimeout);
      pending.reject(error instanceof Error ? error : new Error(String(error)));
    }
  }
  return answer;
};
const requestRuntimePort = async (
  workspaceRoot: string,
): Promise<{
  readonly port: UtilityMessage['ports'][number];
  release(reason: 'requested' | 'operation-timeout'): void;
}> => {
  const requestId = randomUUID();
  const port = new Promise<{
    readonly port: UtilityMessage['ports'][number];
    release(reason: 'requested' | 'operation-timeout'): void;
  }>((resolve, reject) => {
    const runtimePortTimeout = setTimeout(() => {
      pendingRuntimePorts.delete(requestId);
      parentPort.postMessage({ type: 'runtime-port-release', requestId });
      reject(
        Object.assign(new Error('Main did not answer the desktop runtime-port request within 10 seconds.'), {
          code: 'TIMEOUT',
        }),
      );
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
/* The agent's `prepare_kernel`: main prepares the kernel, joining a download the viewer may already have started, and
 * reports progress against this request. An agent that stops waiting leaves the download running for the viewer. */
const pendingKernelPreparations = new Map<
  string,
  {
    readonly resolve: (outcome: Awaited<ReturnType<HostPrepareKernel>>) => void;
    readonly onProgress: Parameters<HostPrepareKernel>[1]['onProgress'];
  }
>();
const prepareNativeKernel: HostPrepareKernel = async ({ kernel }, { signal, onProgress }) => {
  const requestId = randomUUID();
  const answer = Promise.withResolvers<Awaited<ReturnType<HostPrepareKernel>>>();
  const stop = (): void => {
    answer.resolve({
      status: 'cancelled',
      kernel,
      message: `Stopped waiting for ${kernel}; Tau keeps downloading it, and the model renders once it is ready.`,
    });
  };
  pendingKernelPreparations.set(requestId, { resolve: answer.resolve, onProgress });
  signal.addEventListener('abort', stop, { once: true });
  try {
    parentPort.postMessage({ type: 'native-kernel-prepare', requestId, kernel });
    return await answer.promise;
  } finally {
    signal.removeEventListener('abort', stop);
    pendingKernelPreparations.delete(requestId);
  }
};

/* The `git` main resolved from the bundle, when this build ships one (OQ3);
 * absent, the toolchain comes from `PATH` and says so once if it is not there. */
const gitExecutable = process.env['TAU_GIT_EXECUTABLE'];

const host = createServicesHost({
  authorityDirectory,
  ...(machinesDirectory === undefined || machinesDirectory === '' ? {} : { machinesDirectory }),
  ...(legacyMachinesDirectory === undefined || legacyMachinesDirectory === '' ? {} : { legacyMachinesDirectory }),
  requestRuntimePort,
  requestGeometryPort,
  nativeKernels: { prepare: prepareNativeKernel, preparable: preparableKernels(desktopNativeDeployments) },
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
  machinesStreaming: (requestId, machines) => {
    parentPort.postMessage({ type: 'machines-streaming-answered', requestId, machines });
  },
  machineBindingCompleted: (requestId, result) => {
    parentPort.postMessage(
      'error' in result
        ? { type: 'machine-binding-complete-failed', requestId, message: result.error, code: result.code }
        : { type: 'machine-binding-completed', requestId, outcome: result.outcome },
    );
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
  for (const pending of pendingGeometryPorts.values()) {
    clearTimeout(pending.geometryPortTimeout);
    pending.reject(new Error('The services utility exited before main supplied a geometry-runner port.'));
  }
  pendingGeometryPorts.clear();
  for (const pending of pendingKernelPreparations.values()) {
    pending.resolve({
      status: 'failed',
      kernel: '',
      code: 'PREPARE_KERNEL_FAILED',
      message: 'The services utility exited before main prepared the kernel.',
    });
  }
  host.dispose();
});
parentPort.on('message', (message) => {
  const frame = message.data;
  if (frame && typeof frame === 'object') {
    const { message: refusal, requestId, type } = frame as Record<string, unknown>;
    if (typeof requestId === 'string' && (type === 'native-kernel-progress' || type === 'native-kernel-prepared')) {
      const pending = pendingKernelPreparations.get(requestId);
      const { outcome, progress } = frame as Record<string, unknown>;
      if (type === 'native-kernel-progress' && typeof progress === 'object' && progress !== null) {
        const { progress: done, total, message: text } = progress as Record<string, unknown>;
        if (typeof done === 'number' && typeof total === 'number') {
          pending?.onProgress({ progress: done, total, message: typeof text === 'string' ? text : '' });
        }
      } else if (type === 'native-kernel-prepared' && typeof outcome === 'object' && outcome !== null) {
        pending?.resolve(outcome as Awaited<ReturnType<HostPrepareKernel>>);
      }
      return;
    }
    if (typeof requestId === 'string' && (type === 'geometry-port' || type === 'geometry-port-refused')) {
      const pending = pendingGeometryPorts.get(requestId);
      if (pending) {
        pendingGeometryPorts.delete(requestId);
        clearTimeout(pending.geometryPortTimeout);
        const [port] = message.ports;
        if (type === 'geometry-port' && port) {
          pending.resolve(port);
        } else {
          port?.close();
          pending.reject(new Error(typeof refusal === 'string' ? refusal : 'Main refused the geometry-runner port.'));
        }
      } else {
        for (const latePort of message.ports) {
          latePort.close();
        }
      }
      return;
    }
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
