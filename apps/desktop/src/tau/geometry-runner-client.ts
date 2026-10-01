/** GeoSpecRunner façade over one main-admitted, separately supervised geometry port. */
import { toNodeFsPort } from '@taucad/filesystem/backend/node';
import { Topic } from '@taucad/events';
import type { HostGeoSpecRunner } from '@taucad/host/agent-tools';
import type { GeoSpecRunnerEvent, GeoSpecRunnerResult } from 'geospec/runner/worker';
import type { UtilityPort } from '#tau/services-host.impl.js';

type RunnerFrame =
  | Readonly<{
      type: 'event';
      event: GeoSpecRunnerEvent | Readonly<{ type: 'file-progress'; file: string; durationMs?: number }>;
    }>
  | Readonly<{ type: 'result'; result: GeoSpecRunnerResult }>
  | Readonly<{
      type: 'error';
      message: string;
      transport?: Readonly<{
        code: 'GEOSPEC_TRANSPORT_MALFORMED' | 'GEOSPEC_TRANSPORT_LIMIT';
        phase: 'event' | 'result';
        bytes?: number;
        limitBytes: number;
      }>;
    }>;

/** Create a one-run remote façade; the Runtime belongs to the geometry slot. */
export const createGeometryRunnerClient = (port: UtilityPort): HostGeoSpecRunner => {
  const channel = toNodeFsPort(port);
  const events = new Topic<GeoSpecRunnerEvent>({ name: 'GeometryRunnerClient.events' });
  let pending: ReturnType<typeof Promise.withResolvers<GeoSpecRunnerResult>> | undefined;
  let closed = false;
  const rejectPending = (reason: string, transport?: Extract<RunnerFrame, { type: 'error' }>['transport']): void => {
    pending?.reject(
      Object.assign(new Error(reason), transport === undefined ? {} : { code: transport.code, transport }),
    );
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
        if (frame.event.type !== 'file-progress') {
          events.emit(frame.event);
        }
        break;
      }
      case 'result': {
        const current = pending;
        pending = undefined;
        current.resolve(frame.result);
        for (const file of frame.result.files) {
          events.emit({ type: 'file-complete', ...file });
        }
        events.emit({ type: 'run-complete', result: frame.result });
        break;
      }
      case 'error': {
        rejectPending(frame.message, frame.transport);
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
      return events.subscribe((event) => {
        if (event.type === type) {
          // The discriminant was checked above; TypeScript cannot narrow a generic Extract here.
          handler(event as Extract<GeoSpecRunnerEvent, { type: typeof type }>);
        }
      });
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
      events.dispose();
    },
  };
};
