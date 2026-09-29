import { randomUUID } from 'node:crypto';
import { expect } from 'vitest';
import type { DesktopSession } from '#support/desktop-app.js';

/** Product geometry utility events, observed in packaged main without replacing its fork. */
export type GeometryHostEvent = Readonly<{
  kind: 'spawn' | 'run' | 'cancel' | 'event' | 'result' | 'exit';
  pid: number;
  at: number;
  root?: string;
  engine?: 'native' | 'legacy';
  eventType?: string;
}>;

/** Install before the first geometry request; the real broker still owns every fork and message. */
export const observeGeometryHost = async (session: DesktopSession): Promise<void> => {
  await session.application.evaluate(({ utilityProcess }) => {
    const state = globalThis as typeof globalThis & {
      tauE2eGeometryEvents?: Array<{
        kind: 'spawn' | 'run' | 'cancel' | 'event' | 'result' | 'exit';
        pid: number;
        at: number;
        root?: string;
        engine?: 'native' | 'legacy';
        eventType?: string;
      }>;
      tauE2eRestoreGeometryFork?: () => void;
    };
    if (state.tauE2eRestoreGeometryFork) {
      throw new Error('Geometry utility observation is already installed.');
    }
    const originalFork = utilityProcess.fork;
    state.tauE2eGeometryEvents = [];
    utilityProcess.fork = ((...args: Parameters<typeof originalFork>) => {
      const geometry = args[2]?.serviceName === 'tau-geometry-host';
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
          const frame = message as { type?: string; root?: string; engine?: 'native' | 'legacy' } | undefined;
          if (frame?.type === 'geometry-run') {
            record('run', { root: frame.root, engine: frame.engine });
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
  });
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
  await session.application.evaluate(() => {
    const state = globalThis as typeof globalThis & { tauE2eRestoreGeometryFork?: () => void };
    state.tauE2eRestoreGeometryFork?.();
  });
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
  expect(hello).toEqual({ server: 'machines', protocolVersion: 1 });
  return Date.now() - before;
};
