/** GeoSpecRunner façade over one main-admitted, separately supervised geometry port. */
import { toNodeFsPort } from '@taucad/filesystem/backend/node';
import type { HostGeoSpecRunner } from '@taucad/host/agent-tools';
import type { SourceRevision } from '@taucad/runtime';
import type { GeoSpecRunnerEvent, GeoSpecRunnerResult } from 'geospec/runner/worker';
import type { UtilityPort } from '#tau/services-host.impl.js';

type RunnerFrame =
  | Readonly<{ type: 'event'; event: GeoSpecRunnerEvent }>
  | Readonly<{ type: 'result'; result: GeoSpecRunnerResult; sourceRevisions: readonly SourceRevision[] }>
  | Readonly<{ type: 'error'; message: string }>;

/** Create a one-run remote façade; the Runtime belongs to the geometry slot. */
export const createGeometryRunnerClient = (port: UtilityPort): HostGeoSpecRunner => {
  const channel = toNodeFsPort(port);
  const listeners = new Set<(event: GeoSpecRunnerEvent) => void>();
  let pending: ReturnType<typeof Promise.withResolvers<GeoSpecRunnerResult>> | undefined;
  let revisions: readonly SourceRevision[] = [];
  let closed = false;
  const rejectPending = (reason: string): void => {
    pending?.reject(new Error(reason));
    pending = undefined;
  };
  channel.addEventListener('message', ({ data }) => {
    if (data === null || typeof data !== 'object') {
      return;
    }
    const frame = data as RunnerFrame;
    if (closed || pending === undefined) {
      return;
    }
    switch (frame.type) {
      case 'event': {
        for (const listener of listeners) {
          listener(frame.event);
        }
        break;
      }
      case 'result': {
        revisions = frame.sourceRevisions;
        pending.resolve(frame.result);
        pending = undefined;
        break;
      }
      case 'error': {
        rejectPending(frame.message);
        break;
      }
    }
  });
  port.on('close', () => {
    closed = true;
    rejectPending('The geometry process connection closed before the GeoSpec suite completed.');
  });
  channel.start?.();
  return {
    async run(options) {
      if (closed || pending !== undefined) {
        throw new Error('The GeoSpec runner is closed or already running.');
      }
      const current = Promise.withResolvers<GeoSpecRunnerResult>();
      pending = current;
      try {
        channel.postMessage({ type: 'run', options });
      } catch (error) {
        rejectPending(error instanceof Error ? error.message : String(error));
      }
      return current.promise;
    },
    on(type, handler) {
      const listener = (event: GeoSpecRunnerEvent): void => {
        if (event.type === type) {
          // The discriminant was checked above; TypeScript cannot narrow a generic Extract here.
          handler(event as Extract<GeoSpecRunnerEvent, { type: typeof type }>);
        }
      };
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    abort(reason) {
      if (!closed) {
        channel.postMessage({ type: 'cancel', reason });
      }
    },
    async close() {
      closed = true;
      rejectPending('The GeoSpec runner was closed.');
      channel.close?.();
    },
    sourceRevisions: () => revisions,
  };
};
