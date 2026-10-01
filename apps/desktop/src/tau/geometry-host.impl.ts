/** Process-local geometry dispatcher. Main is the sole authority and scheduler. */
import type { UtilityPort } from '#tau/services-host.impl.js';
import type { HostGeoSpecRunner } from '@taucad/host/agent-tools';
import type { GeoSpecRunnerRunOptions } from 'geospec/runner/worker';

type Message = Readonly<{ data: unknown; ports: readonly UtilityPort[] }>;
type Reply = (frame: unknown) => void;
type MeasurementRequest = Readonly<{
  id: number;
  source: Readonly<{ format: 'ap242'; bytes: Uint8Array<ArrayBuffer>; coordinateSystem: 'y-up' }>;
  occurrences: readonly [Readonly<{ name: string }>, Readonly<{ name: string }>];
}>;

type RunFrame = Readonly<{
  type: 'geometry-run';
  generation: number;
  requestId: number;
  kind: 'measurement' | 'suite' | 'performance';
  input:
    | MeasurementRequest
    | Readonly<{ type: 'run'; options: GeoSpecRunnerRunOptions }>
    | Readonly<{ type: 'run'; id: number; input: unknown }>;
  root?: string;
  engine?: 'native' | 'legacy';
  runtimeConfig?: Readonly<{ tauApiUrl: string; tauWebSocketUrl: string }>;
}>;

/** Dependencies that remain inside this process, injectable for lifecycle tests. */
export type GeometryHostOptions = {
  readonly post: Reply;
  readonly measure: (input: MeasurementRequest) => Promise<unknown>;
  readonly performance: (input: unknown) => Promise<unknown>;
  readonly createRunner: (
    input: Readonly<{
      root: string;
      engine: 'native' | 'legacy';
      runtimePort: UtilityPort;
      runtimeConfig: Readonly<{ tauApiUrl: string; tauWebSocketUrl: string }>;
    }>,
  ) => Promise<HostGeoSpecRunner>;
};

const record = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;

/** Admit one main-validated task, forwarding lifecycle and generation labels. */
export const createGeometryHost = (options: GeometryHostOptions): Readonly<{ handle(message: Message): void }> => {
  let active: { generation: number; requestId: number; runner?: HostGeoSpecRunner; cancelled: boolean } | undefined;
  const handle = (message: Message): void => {
    const frame = record(message.data);
    if (frame?.['type'] === 'geometry-cancel') {
      const running = active;
      if (
        running !== undefined &&
        running.generation === frame['generation'] &&
        running.requestId === frame['requestId']
      ) {
        running.cancelled = true;
        running.runner?.abort('The geometry requester cancelled.');
      }
      return;
    }
    if (
      frame?.['type'] !== 'geometry-run' ||
      !Number.isSafeInteger(frame['generation']) ||
      !Number.isSafeInteger(frame['requestId']) ||
      active !== undefined
    ) {
      for (const port of message.ports) {
        port.close();
      }
      return;
    }
    const run = frame as RunFrame;
    const current = {
      generation: run.generation,
      requestId: run.requestId,
      cancelled: false,
      runner: undefined as HostGeoSpecRunner | undefined,
    };
    active = current;
    const execute = async (): Promise<void> => {
      let value: unknown;
      try {
        if (run.kind === 'measurement') {
          value = await options.measure(run.input as MeasurementRequest);
        } else if (run.kind === 'performance') {
          const diagnostic = run.input as Readonly<{ type: 'run'; id: number; input: unknown }>;
          value = { id: diagnostic.id, type: 'result', result: await options.performance(diagnostic.input) };
        } else {
          const [runtimePort] = message.ports;
          if (!runtimePort || !run.root || !run.runtimeConfig || !run.engine || !('options' in run.input)) {
            throw new Error('The geometry suite has no authorized Runtime port or valid run options.');
          }
          current.runner = await options.createRunner({
            root: run.root,
            engine: run.engine,
            runtimePort,
            runtimeConfig: run.runtimeConfig,
          });
          const unsubscribers = (
            ['run-start', 'file-start', 'file-complete', 'run-complete', 'forensic', 'abort', 'close'] as const
          ).map((type) =>
            current.runner!.on(type, (event) => {
              options.post({
                type: 'geometry-event',
                generation: current.generation,
                requestId: current.requestId,
                event,
              });
            }),
          );
          try {
            if (current.cancelled) {
              current.runner.abort('The geometry requester cancelled.');
              throw new Error('The geometry requester cancelled before the GeoSpec suite started.');
            }
            const result = await current.runner.run(run.input.options);
            value = { type: 'result', result, sourceRevisions: current.runner.sourceRevisions?.() ?? [] };
          } finally {
            for (const unsubscribe of unsubscribers) {
              unsubscribe();
            }
            await current.runner.close();
          }
        }
      } catch (error) {
        value =
          run.kind === 'measurement'
            ? {
                id: (run.input as MeasurementRequest).id,
                result: {
                  status: 'interrupted',
                  code: 'engine-error',
                  message: error instanceof Error ? error.message : String(error),
                },
              }
            : run.kind === 'performance'
              ? {
                  id: (run.input as { id: number }).id,
                  type: 'error',
                  message: error instanceof Error ? error.message : String(error),
                }
              : { type: 'error', message: error instanceof Error ? error.message : String(error) };
      } finally {
        for (const port of message.ports) {
          port.close();
        }
        if (active === current) {
          active = undefined;
        }
      }
      options.post({ type: 'geometry-result', generation: current.generation, requestId: current.requestId, value });
    };
    // async-iife: utility entry dispatches one task and main owns cancellation/exit supervision.
    void execute();
  };
  return { handle };
};
