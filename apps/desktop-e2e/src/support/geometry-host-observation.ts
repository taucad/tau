import { randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { expect } from 'vitest';
import { machineChannelProtocolVersion } from '@taucad/runtime/machine';
import type { DesktopSession } from '#support/desktop-app.js';

/** Product geometry utility events, observed in packaged main without replacing its fork. */
export type GeometryHostEvent = Readonly<{
  kind: 'spawn' | 'run' | 'cancel' | 'event' | 'native-entry' | 'native-return' | 'result' | 'exit';
  pid: number;
  at: number;
  root?: string;
  eventType?: string;
  capability?: string;
  held?: boolean;
  count?: number;
  toleranceMm?: number;
}>;

/* Test-only geometry utility entry installs the native hook before importing the real bundle. */
const nativeEntryPreload = String.raw`const Module = require('node:module');
const load = Module._load;
let minimumDistanceCalls = 0;
Module._load = function(request, parent, isMain) {
  const binding = load.apply(this, arguments);
  let resolved;
  try { resolved = Module._resolveFilename(request, parent, isMain); } catch { return binding; }
  if (typeof resolved !== 'string' || !/geospec-engine-native.*\.node$/u.test(resolved) ||
      typeof binding?.Engine?.prototype?.evaluateClaim !== 'function') return binding;
  const original = binding.Engine.prototype.evaluateClaim;
  if (original.__tauE2eNativeEntryWrapped) return binding;
  function observedEvaluateClaim(bytes) {
    let observed = false;
    try {
      const request = JSON.parse(Buffer.from(bytes).toString('utf8'));
      const claim = request?.plan?.claims?.[0];
      if (request?.method === 'submitClaims' && typeof claim?.capability === 'string') {
        observed = true;
        const held = claim.capability === 'minimumDistance' &&
          ++minimumDistanceCalls === 2 && process.env.TAU_E2E_HOLD_SECOND_MINIMUM_DISTANCE === '1';
        const expected = claim.payload?.arguments?.[0];
        process.parentPort?.postMessage({
          type: 'tau-e2e-native-entry', capability: claim.capability,
          ...(held ? { held: true } : {}),
          count: expected?.count,
          toleranceMm: expected?.toleranceMm,
        });
        if (held) {
          // Test-only synchronous boundary hold. The real addon has not been called yet.
          Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 30_000);
        }
      }
    } catch { /* Observation cannot alter the native call's return or throw. */ }
    try {
      return original.apply(this, arguments);
    } finally {
      if (observed) {
        try { process.parentPort?.postMessage({ type: 'tau-e2e-native-return' }); } catch {}
      }
    }
  }
  observedEvaluateClaim.__tauE2eNativeEntryWrapped = true;
  binding.Engine.prototype.evaluateClaim = observedEvaluateClaim;
  return binding;
};
if (process.env.TAU_E2E_GEOMETRY_ENTRY) {
  // Electron does not honor Node's --require in a packaged utility process.
  // This test-only entry installs the hook, then runs the unchanged product entry.
  void import(require('node:url').pathToFileURL(process.env.TAU_E2E_GEOMETRY_ENTRY).href);
}
`;

const preloadRoot = resolve(
  import.meta.dirname,
  '../../../../out/research/geospec-native-closeout-blueprint/2026-09-29-implementation/lanes/arch02-product-host-b1',
);
let preloadPath: string | undefined;

/** Create the exact test-only preload used by the packaged utility or a tiny addon check. */
export const writeNativeEntryPreload = async (): Promise<string> => {
  await mkdir(preloadRoot, { recursive: true });
  const path = join(preloadRoot, `native-entry-${randomUUID()}.cjs`);
  await writeFile(path, nativeEntryPreload);
  return path;
};

/** Install before the first geometry request; the real broker still owns every fork and message. */
export const observeGeometryHost = async (
  session: DesktopSession,
  options?: { readonly holdSecondMinimumDistance?: boolean },
): Promise<void> => {
  const holdSecondMinimumDistance = options?.holdSecondMinimumDistance ?? false;
  preloadPath = await writeNativeEntryPreload();
  await session.application.evaluate(
    ({ utilityProcess }, { entryPreload, holdSecondMinimumDistance }) => {
      const state = globalThis as typeof globalThis & {
        tauE2eGeometryEvents?: Array<{
          kind: 'spawn' | 'run' | 'cancel' | 'event' | 'native-entry' | 'native-return' | 'result' | 'exit';
          pid: number;
          at: number;
          root?: string;
          eventType?: string;
          capability?: string;
          held?: boolean;
          count?: number;
          toleranceMm?: number;
        }>;
        tauE2eRestoreGeometryFork?: () => void;
      };
      if (state.tauE2eRestoreGeometryFork) {
        throw new Error('Geometry utility observation is already installed.');
      }
      const originalFork = utilityProcess.fork;
      state.tauE2eGeometryEvents = [];
      utilityProcess.fork = ((...args: Parameters<typeof originalFork>) => {
        const options = args[2];
        const geometry = options?.serviceName === 'tau-geometry-host';
        if (geometry && entryPreload) {
          const environment: Record<string, string | undefined> = { ...options.env };
          environment['TAU_E2E_GEOMETRY_ENTRY'] = args[0];
          environment['TAU_E2E_HOLD_SECOND_MINIMUM_DISTANCE'] = holdSecondMinimumDistance ? '1' : '0';
          args[0] = entryPreload;
          args[2] = {
            ...options,
            env: environment,
          };
        }
        const child = originalFork(...args);
        if (geometry) {
          let spawnedPid: number | undefined;
          const record = (kind: GeometryHostEvent['kind'], extra?: Partial<GeometryHostEvent>): void => {
            const pid = spawnedPid ?? child.pid;
            if (pid === undefined || !Number.isSafeInteger(pid) || pid <= 0) {
              return;
            }
            state.tauE2eGeometryEvents?.push({ kind, pid, at: Date.now(), ...extra });
          };
          if (child.pid !== undefined && Number.isSafeInteger(child.pid) && child.pid > 0) {
            spawnedPid = child.pid;
            record('spawn');
          } else {
            child.once('spawn', () => {
              spawnedPid = child.pid;
              record('spawn');
            });
          }
          const originalPost = child.postMessage.bind(child);
          child.postMessage = ((message: unknown, transfer?: Parameters<typeof originalPost>[1]) => {
            const frame = message as { type?: string; root?: string } | undefined;
            if (frame?.type === 'geometry-run') {
              record('run', { root: frame.root });
            }
            if (frame?.type === 'geometry-cancel') {
              record('cancel');
            }
            originalPost(message, transfer);
          }) as typeof child.postMessage;
          child.on('message', (message: unknown) => {
            const frame = message as { type?: string; event?: { type?: string } } | undefined;
            if (frame?.type === 'geometry-event') {
              record('event', { eventType: frame.event?.type });
            }
            if (frame?.type === 'tau-e2e-native-entry') {
              const entry = frame as typeof frame & {
                capability?: string;
                held?: boolean;
                count?: number;
                toleranceMm?: number;
              };
              record('native-entry', {
                capability: entry.capability,
                held: entry.held,
                count: entry.count,
                toleranceMm: entry.toleranceMm,
              });
            }
            if (frame?.type === 'tau-e2e-native-return') {
              record('native-return');
            }
            if (frame?.type === 'geometry-result') {
              record('result');
            }
          });
          child.once('exit', () => {
            record('exit');
          });
        }
        return child;
      }) as typeof utilityProcess.fork;
      state.tauE2eRestoreGeometryFork = () => {
        utilityProcess.fork = originalFork;
        delete state.tauE2eRestoreGeometryFork;
      };
    },
    { entryPreload: preloadPath, holdSecondMinimumDistance },
  );
};

/** Cumulative CPU seconds and creation identity for one actual geometry utility. */
export const geometryHostCpuSeconds = async (
  session: DesktopSession,
  pid: number,
): Promise<Readonly<{ seconds: number; creationTime: number }>> =>
  session.application.evaluate(({ app }, expectedPid) => {
    const metric = app.getAppMetrics().find((entry) => entry.pid === expectedPid);
    const seconds = metric?.cpu.cumulativeCPUUsage;
    if (metric?.type !== 'Utility' || seconds === undefined || !Number.isFinite(seconds)) {
      throw new Error(`No cumulative CPU observation for geometry utility ${String(expectedPid)}.`);
    }
    return { seconds, creationTime: metric.creationTime };
  }, pid);

/** Snapshot retained by packaged main, not inferred from a separate miniapp. */
export const geometryHostEvents = async (session: DesktopSession): Promise<readonly GeometryHostEvent[]> =>
  session.application.evaluate(() => {
    const state = globalThis as typeof globalThis & { tauE2eGeometryEvents?: GeometryHostEvent[] };
    if (!state.tauE2eGeometryEvents) {
      throw new Error('Geometry utility observation was not installed.');
    }
    return [...state.tauE2eGeometryEvents];
  });

/** Undo the test-only observer before Electron teardown. */
export const restoreGeometryHost = async (session: DesktopSession): Promise<void> => {
  try {
    await session.application.evaluate(() => {
      const state = globalThis as typeof globalThis & { tauE2eRestoreGeometryFork?: () => void };
      state.tauE2eRestoreGeometryFork?.();
    });
  } finally {
    if (preloadPath) {
      await unlink(preloadPath);
      preloadPath = undefined;
    }
  }
};

/** The machines hello is emitted by the independent real services utility. */
export const probeServicesHost = async (session: DesktopSession): Promise<number> => {
  const before = Date.now();
  const hello = await session.page.evaluate(async (requestId) => {
    const shell = (
      globalThis as typeof globalThis & {
        tau: { relayTag: string; requestServicesPort(requestId: string, concern: string): void };
      }
    ).tau;
    return new Promise<unknown>((resolve, reject) => {
      let port: MessagePort | undefined;
      const timer = setTimeout(() => {
        globalThis.removeEventListener('message', onRelay);
        port?.close();
        reject(new Error('The product services utility did not answer machines hello in 10 seconds.'));
      }, 10_000);
      const onRelay = (event: MessageEvent): void => {
        if (
          event.source !== globalThis.window ||
          event.data?.taucadRelay !== shell.relayTag ||
          event.data?.requestId !== requestId
        ) {
          return;
        }
        globalThis.removeEventListener('message', onRelay);
        const incomingPort = event.ports[0];
        port = incomingPort;
        if (!incomingPort) {
          clearTimeout(timer);
          reject(new Error(`The product refused the machines port: ${String(event.data?.error)}`));
          return;
        }
        incomingPort.addEventListener('message', ({ data }: MessageEvent) => {
          if (data?.v !== 1 || data?.k !== 'lh') {
            return;
          }
          clearTimeout(timer);
          incomingPort.close();
          resolve(data.d);
        });
        incomingPort.start();
      };
      globalThis.addEventListener('message', onRelay);
      shell.requestServicesPort(requestId, 'machines');
    });
  }, randomUUID());
  expect(hello).toEqual({ server: 'machines', protocolVersion: machineChannelProtocolVersion });
  return Date.now() - before;
};
