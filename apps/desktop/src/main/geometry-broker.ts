/** Main-owned, one-active geometry process slot. No geometry runs in main. */
import type { MessageChannelMain, MessagePortMain, UtilityProcess } from 'electron';

const maxStepBytes = 32 * 1024 * 1024;
const maxQueue = 8;
const maxResidentSuiteGrants = 64;
const maxReplyBytes = 8 * 1024 * 1024;
const measurementDeadlineMilliseconds = 120_000;
const suiteDeadlineMilliseconds = 10 * 60_000;
const cancelGraceMilliseconds = 250;
const exitDeadlineMilliseconds = 5000;
const idleRetirementMilliseconds = 120_000;
const residentPollMilliseconds = 1000;
const maxResidentBytes = 2 * 1024 * 1024 * 1024;

type RuntimeLease = {
  readonly port: MessagePortMain;
  readonly closed: Promise<unknown>;
  dispose(): void;
};

type MeasurementRequest = Readonly<{
  id: number;
  source: Readonly<{
    format: 'ap242';
    bytes: Uint8Array<ArrayBuffer>;
    coordinateSystem: 'y-up';
  }>;
  occurrences: readonly [Readonly<{ name: string }>, Readonly<{ name: string }>];
}>;

type SuiteRequest = Readonly<{
  type: 'run';
  options: Readonly<{
    files: readonly string[];
    testNamePattern?: string | RegExp;
    testTimeout?: number;
    matcherWallBackstop?: number;
    forensic?: boolean;
    bail?: boolean;
  }>;
}>;
type PerformanceRequest = Readonly<{ type: 'run'; id: number; input: unknown }>;

type Job = {
  readonly id: number;
  readonly kind: 'measurement' | 'suite' | 'performance';
  readonly port: MessagePortMain;
  readonly input: MeasurementRequest | SuiteRequest | PerformanceRequest;
  readonly context?: Readonly<Record<string, string>>;
  readonly root?: string;
  readonly engine?: 'native' | 'legacy';
  readonly stillAuthorized?: () => boolean;
  deadline?: ReturnType<typeof setTimeout>;
  canceled: boolean;
  finished: boolean;
  lease?: RuntimeLease;
};

/** Electron and runtime seams injectable for deterministic lifecycle tests. */
export type GeometryBrokerOptions = {
  readonly utilityEntry: string;
  readonly env: NodeJS.ProcessEnv;
  readonly fork: (
    entry: string,
    args: string[],
    options: { env: NodeJS.ProcessEnv; serviceName: string },
  ) => UtilityProcess;
  readonly createChannel: () => MessageChannelMain;
  readonly connectRuntime: (context: Readonly<Record<string, string>>) => RuntimeLease;
  readonly runtimeConfig?: Readonly<{ tauApiUrl: string; tauWebSocketUrl: string }>;
  readonly onSpawn?: (utility: UtilityProcess) => void;
  readonly log?: (event: string, detail?: unknown) => void;
  /** Electron main's exact-pid app metric, in bytes; undefined during startup/exit. */
  readonly sampleResidentBytes: (utility: UtilityProcess) => number | undefined;
};

/** A scoped port is only a request channel; it does not grant a root by itself. */
export type GeometryBroker = {
  connectMeasurement(): MessagePortMain;
  connectPerformance(): MessagePortMain;
  connectSuite(
    input: Readonly<{
      root: string;
      context: Readonly<Record<string, string>>;
      engine: 'native' | 'legacy';
      stillAuthorized: () => boolean;
    }>,
  ): MessagePortMain;
  revokeUnauthorized(): void;
  dispose(): Promise<void>;
};

const record = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;

const validName = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= 256 && !value.includes('\0');

const measurementRequest = (value: unknown): value is MeasurementRequest => {
  const frame = record(value);
  const source = record(frame?.['source']);
  const pair = frame?.['occurrences'];
  if (
    frame === undefined ||
    Object.keys(frame).sort().join(',') !== 'id,occurrences,source' ||
    !Number.isSafeInteger(frame['id']) ||
    (frame['id'] as number) < 0 ||
    source === undefined ||
    Object.keys(source).sort().join(',') !== 'bytes,coordinateSystem,format' ||
    source['format'] !== 'ap242' ||
    source['coordinateSystem'] !== 'y-up' ||
    !(source['bytes'] instanceof Uint8Array) ||
    source['bytes'].byteLength === 0 ||
    source['bytes'].byteLength > maxStepBytes ||
    !Array.isArray(pair) ||
    pair.length !== 2
  ) {
    return false;
  }
  const first = record(pair[0]);
  const second = record(pair[1]);
  return (
    first !== undefined &&
    second !== undefined &&
    Object.keys(first).join(',') === 'name' &&
    Object.keys(second).join(',') === 'name' &&
    validName(first['name']) &&
    validName(second['name']) &&
    first['name'] !== second['name']
  );
};

const suiteRequest = (value: unknown): value is SuiteRequest => {
  const frame = record(value);
  const options = record(frame?.['options']);
  if (
    frame?.['type'] !== 'run' ||
    options === undefined ||
    Object.keys(frame).sort().join(',') !== 'options,type' ||
    !Array.isArray(options['files']) ||
    options['files'].length === 0 ||
    options['files'].length > 256 ||
    !options['files'].every((file: unknown) => typeof file === 'string' && file.length > 0 && file.length <= 4096)
  ) {
    return false;
  }
  const allowed = new Set(['files', 'testNamePattern', 'testTimeout', 'matcherWallBackstop', 'forensic', 'bail']);
  if (Object.keys(options).some((key) => !allowed.has(key))) {
    return false;
  }
  const pattern = options['testNamePattern'];
  const { testTimeout, matcherWallBackstop } = options;
  return (
    (pattern === undefined || (typeof pattern === 'string' && pattern.length <= 1024) || pattern instanceof RegExp) &&
    (testTimeout === undefined ||
      (Number.isSafeInteger(testTimeout) &&
        (testTimeout as number) > 0 &&
        (testTimeout as number) <= suiteDeadlineMilliseconds)) &&
    (matcherWallBackstop === undefined ||
      (Number.isSafeInteger(matcherWallBackstop) &&
        (matcherWallBackstop as number) > 0 &&
        (matcherWallBackstop as number) <= suiteDeadlineMilliseconds)) &&
    (options['forensic'] === undefined || typeof options['forensic'] === 'boolean') &&
    (options['bail'] === undefined || typeof options['bail'] === 'boolean')
  );
};

const performanceRequest = (value: unknown): value is PerformanceRequest => {
  const frame = record(value);
  if (
    frame?.['type'] !== 'run' ||
    !Number.isSafeInteger(frame['id']) ||
    (frame['id'] as number) < 0 ||
    Object.keys(frame).sort().join(',') !== 'id,input,type'
  ) {
    return false;
  }
  try {
    return Buffer.byteLength(JSON.stringify(frame['input'])) <= 2 * 1024 * 1024;
  } catch {
    return false;
  }
};

const finitePoint = (value: unknown): boolean =>
  Array.isArray(value) &&
  value.length === 3 &&
  value.every((coordinate: unknown) => typeof coordinate === 'number' && Number.isFinite(coordinate));

const validMeasurementReply = (request: MeasurementRequest, value: unknown): boolean => {
  const frame = record(value);
  const result = record(frame?.['result']);
  if (frame?.['id'] !== request.id || result === undefined) {
    return false;
  }
  if (result['status'] === 'refused' || result['status'] === 'interrupted') {
    const codes =
      result['status'] === 'refused'
        ? ['unsupported-evidence', 'invalid-selection', 'work-limit']
        : ['cancelled', 'executor-exited', 'deadline', 'engine-error'];
    return (
      codes.includes(result['code'] as string) &&
      typeof result['message'] === 'string' &&
      result['message'].length <= 4096
    );
  }
  const fact = record(result['fact']);
  const points = fact?.['points'];
  return (
    result['status'] === 'complete' &&
    fact?.['source'] === 'ap242' &&
    fact['assurance'] === 'exact-brep' &&
    fact['unit'] === 'mm' &&
    fact['coordinateSystem'] === 'z-up' &&
    fact['algorithmProfile'] === 'geospec-minimum-distance-v1' &&
    typeof fact['subjectHash'] === 'string' &&
    fact['subjectHash'].length > 0 &&
    fact['subjectHash'].length <= 256 &&
    Array.isArray(fact['occurrences']) &&
    fact['occurrences'].length === 2 &&
    fact['occurrences'].every((path: unknown) => typeof path === 'string' && path.length > 0 && path.length <= 4096) &&
    typeof fact['distance'] === 'number' &&
    Number.isFinite(fact['distance']) &&
    fact['distance'] >= 0 &&
    Array.isArray(points) &&
    points.length === 2 &&
    points.every((point: unknown) => finitePoint(point))
  );
};

/** Create the exclusive, supervised geometry slot. */
export const createGeometryBroker = (options: GeometryBrokerOptions): GeometryBroker => {
  const queue: Job[] = [];
  const unusedPorts = new Set<MessagePortMain>();
  let active: Job | undefined;
  let utility: UtilityProcess | undefined;
  let generation = 0;
  let nextId = 0;
  let accepting = true;
  let stopping = false;
  let unhealthy = false;
  let exitWatchdog: ReturnType<typeof setTimeout> | undefined;
  let cancelWatchdog: ReturnType<typeof setTimeout> | undefined;
  let idleWatchdog: ReturnType<typeof setTimeout> | undefined;
  let residentWatchdog: ReturnType<typeof setInterval> | undefined;
  // A completed native suite can retain subjects even after a later legacy suite.
  // Conservatively retain all suite grants until exit; rotate at this fixed ceiling.
  const residentSuiteGrants = new Set<() => boolean>();
  const log = options.log ?? ((): void => undefined);
  const isIdle = (): boolean => active === undefined && queue.length === 0 && !stopping;
  const grantAllows = (grant: (() => boolean) | undefined): boolean => {
    try {
      return grant?.() === true;
    } catch {
      return false;
    }
  };
  const residentGrantsAllow = (): boolean => {
    for (const grant of residentSuiteGrants) {
      if (!grantAllows(grant)) {
        return false;
      }
    }
    return true;
  };

  const answer = (job: Job, value: unknown): void => {
    if (job.finished) {
      return;
    }
    job.finished = true;
    clearTimeout(job.deadline);
    try {
      job.port.postMessage(value);
    } catch {
      /* Caller has gone. */
    }
    job.port.close();
  };
  const unavailable = (
    job: Job,
    reason: string,
    code: 'cancelled' | 'deadline' | 'executor-exited' | 'engine-error' = 'engine-error',
  ): void => {
    answer(
      job,
      job.kind === 'measurement'
        ? { id: (job.input as MeasurementRequest).id, result: { status: 'interrupted', code, message: reason } }
        : job.kind === 'performance'
          ? { id: (job.input as PerformanceRequest).id, type: 'error', message: reason }
          : { type: 'error', message: reason },
    );
  };
  const release = (job: Job): void => {
    job.lease?.dispose();
    job.lease = undefined;
  };
  const killActiveSlot = (reason: string): void => {
    if (!utility || stopping) {
      return;
    }
    stopping = true;
    log('geometry.slot-kill', { generation, reason });
    exitWatchdog = setTimeout(() => {
      if (!stopping) {
        return;
      }
      unhealthy = true;
      log('geometry.slot-exit-timeout', { generation });
      while (queue.length > 0) {
        unavailable(queue.shift()!, 'The geometry process did not exit.');
      }
    }, exitDeadlineMilliseconds);
    utility.kill();
  };
  const cancel = (job: Job, reason: string, code: 'cancelled' | 'deadline' = 'cancelled'): void => {
    if (job.canceled || job.finished) {
      return;
    }
    job.canceled = true;
    unavailable(job, reason, code);
    if (active !== job) {
      const index = queue.indexOf(job);
      if (index !== -1) {
        queue.splice(index, 1);
      }
      return;
    }
    try {
      utility?.postMessage({ type: 'geometry-cancel', generation, requestId: job.id });
    } catch {
      /* Kill below. */
    }
    cancelWatchdog = setTimeout(() => {
      killActiveSlot(reason);
    }, cancelGraceMilliseconds);
  };
  const pump = (): void => {
    if (!accepting || stopping || active !== undefined || queue.length === 0) {
      return;
    }
    const job = queue.shift()!;
    if (job.canceled || job.finished) {
      pump();
      return;
    }
    if (job.kind === 'suite' && !grantAllows(job.stillAuthorized)) {
      unavailable(job, 'The GeoSpec runner root grant expired before execution.');
      pump();
      return;
    }
    if (
      utility &&
      (!residentGrantsAllow() ||
        (job.kind === 'suite' &&
          !residentSuiteGrants.has(job.stillAuthorized!) &&
          residentSuiteGrants.size >= maxResidentSuiteGrants))
    ) {
      queue.unshift(job);
      killActiveSlot('retained GeoSpec root grant expired or tracking bound reached');
      return;
    }
    try {
      if (!utility) {
        const spawned = options.fork(options.utilityEntry, [], { env: options.env, serviceName: 'tau-geometry-host' });
        utility = spawned;
        generation += 1;
        const thisGeneration = generation;
        let missingResidentSamples = 0;
        residentWatchdog = setInterval(() => {
          if (utility !== spawned || stopping) {
            return;
          }
          let bytes: number | undefined;
          try {
            bytes = options.sampleResidentBytes(spawned);
          } catch (error) {
            log('geometry.slot-rss-sample-error', { generation, error });
          }
          if (bytes === undefined || !Number.isSafeInteger(bytes) || bytes < 0) {
            missingResidentSamples += 1;
            if (missingResidentSamples < 5) {
              return;
            }
            log('geometry.slot-rss-unavailable', { generation, samples: missingResidentSamples });
            if (active) {
              active.canceled = true;
              unavailable(active, 'The geometry process memory could not be observed.');
            }
            killActiveSlot('resident-memory observation failed');
            return;
          }
          missingResidentSamples = 0;
          if (bytes > maxResidentBytes) {
            log('geometry.slot-rss-limit', { generation, bytes, limit: maxResidentBytes });
            if (active) {
              active.canceled = true;
              unavailable(active, 'The geometry process exceeded its resident-memory limit.');
            }
            killActiveSlot('resident-memory limit');
          }
        }, residentPollMilliseconds);
        residentWatchdog.unref();
        spawned.on('message', (message: unknown) => {
          if (utility !== spawned || thisGeneration !== generation || !active) {
            return;
          }
          const frame = record(message);
          if (frame?.['generation'] !== thisGeneration || frame['requestId'] !== active.id) {
            return;
          }
          if (frame['type'] === 'geometry-event') {
            if (active.kind === 'suite' && !active.canceled) {
              try {
                if (Buffer.byteLength(JSON.stringify(frame['event'])) > 64 * 1024) {
                  throw new Error('The geometry event exceeded its limit.');
                }
                active.port.postMessage({ type: 'event', event: frame['event'] });
              } catch {
                cancel(active, 'The geometry event was malformed or exceeded its limit.');
              }
            }
            return;
          }
          if (frame['type'] !== 'geometry-result') {
            return;
          }
          const finished = active;
          active = undefined;
          clearTimeout(cancelWatchdog);
          release(finished);
          if (!finished.canceled) {
            try {
              if (Buffer.byteLength(JSON.stringify(frame['value'])) > maxReplyBytes) {
                throw new Error('The geometry reply exceeded its limit.');
              }
              if (
                finished.kind === 'measurement' &&
                !validMeasurementReply(finished.input as MeasurementRequest, frame['value'])
              ) {
                throw new Error('The geometry reply is malformed.');
              }
              answer(finished, frame['value']);
            } catch {
              unavailable(finished, 'The geometry reply is malformed or exceeded its limit.');
            }
          }
          pump();
          if (isIdle()) {
            idleWatchdog = setTimeout(() => {
              killActiveSlot('idle memory retirement');
            }, idleRetirementMilliseconds);
          }
        });
        spawned.on('exit', () => {
          if (utility !== spawned) {
            return;
          }
          clearTimeout(cancelWatchdog);
          clearTimeout(exitWatchdog);
          clearTimeout(idleWatchdog);
          clearInterval(residentWatchdog);
          residentWatchdog = undefined;
          utility = undefined;
          residentSuiteGrants.clear();
          stopping = false;
          unhealthy = false;
          if (active) {
            const interrupted = active;
            active = undefined;
            release(interrupted);
            unavailable(interrupted, 'The geometry process exited before completing the request.', 'executor-exited');
          }
          log('geometry.slot-exited', { generation: thisGeneration });
          pump();
        });
        options.onSpawn?.(spawned);
      }
      active = job;
      clearTimeout(idleWatchdog);
      if (job.kind === 'suite') {
        job.lease = options.connectRuntime(job.context!);
        residentSuiteGrants.add(job.stillAuthorized!);
        utility.postMessage(
          {
            type: 'geometry-run',
            generation,
            requestId: job.id,
            kind: job.kind,
            root: job.root,
            engine: job.engine,
            input: job.input,
            runtimeConfig: options.runtimeConfig,
          },
          [job.lease.port],
        );
      } else {
        utility.postMessage({ type: 'geometry-run', generation, requestId: job.id, kind: job.kind, input: job.input });
      }
    } catch (error) {
      active = undefined;
      release(job);
      unavailable(job, error instanceof Error ? error.message : 'The geometry request could not start.');
      if (utility) {
        killActiveSlot('dispatch failed');
      } else {
        while (queue.length > 0) {
          unavailable(queue.shift()!, 'The geometry process could not start.');
        }
      }
    }
  };
  const connect = (
    kind: Job['kind'],
    suite?: Readonly<{
      root: string;
      context: Readonly<Record<string, string>>;
      engine: 'native' | 'legacy';
      stillAuthorized: () => boolean;
    }>,
  ): MessagePortMain => {
    if (!accepting || unhealthy) {
      throw new Error(
        unhealthy ? 'The geometry process has not exited after termination.' : 'The geometry broker is shutting down.',
      );
    }
    if (unusedPorts.size >= maxQueue) {
      throw new Error('Too many unsubmitted geometry request ports.');
    }
    const channel = options.createChannel();
    const port = channel.port2;
    unusedPorts.add(port);
    const admissionWatchdog = setTimeout(() => {
      port.close();
    }, 10_000);
    admissionWatchdog.unref();
    let submitted = false;
    port.on('message', (event: { data: unknown }) => {
      if (submitted) {
        if (record(event.data)?.['type'] === 'cancel') {
          const job = active?.port === port ? active : queue.find((entry) => entry.port === port);
          if (job) {
            cancel(job, 'The geometry request was cancelled.');
          }
        }
        return;
      }
      submitted = true;
      clearTimeout(admissionWatchdog);
      unusedPorts.delete(port);
      if (!accepting || unhealthy) {
        const id = record(event.data)?.['id'];
        try {
          port.postMessage(
            kind === 'measurement'
              ? {
                  id,
                  result: {
                    status: 'interrupted',
                    code: 'executor-exited',
                    message: 'The geometry broker is no longer accepting requests.',
                  },
                }
              : { id, type: 'error', message: 'The geometry broker is no longer accepting requests.' },
          );
        } catch {
          /* Caller has gone. */
        }
        port.close();
        return;
      }
      const input =
        kind === 'measurement'
          ? measurementRequest(event.data)
            ? event.data
            : undefined
          : kind === 'performance'
            ? performanceRequest(event.data)
              ? event.data
              : undefined
            : suiteRequest(event.data)
              ? event.data
              : undefined;
      if (!input || queue.length >= maxQueue) {
        try {
          port.postMessage(
            kind === 'measurement'
              ? {
                  id: record(event.data)?.['id'],
                  result: {
                    status: 'interrupted',
                    code: 'engine-error',
                    message: input ? 'The geometry queue is full.' : 'Invalid or oversized exact measurement request.',
                  },
                }
              : kind === 'performance'
                ? {
                    id: record(event.data)?.['id'],
                    type: 'error',
                    message: input ? 'The geometry queue is full.' : 'Invalid GeoSpec performance request.',
                  }
                : { type: 'error', message: input ? 'The geometry queue is full.' : 'Invalid GeoSpec suite request.' },
          );
        } catch {
          /* Caller has gone. */
        }
        port.close();
        return;
      }
      const job: Job = {
        id: ++nextId,
        kind,
        port,
        input,
        root: suite?.root,
        context: suite?.context,
        engine: suite?.engine,
        stillAuthorized: suite?.stillAuthorized,
        canceled: false,
        finished: false,
      };
      job.deadline = setTimeout(
        () => {
          cancel(job, 'The geometry request timed out.', 'deadline');
        },
        kind === 'measurement' ? measurementDeadlineMilliseconds : suiteDeadlineMilliseconds,
      );
      queue.push(job);
      pump();
    });
    port.on('close', () => {
      clearTimeout(admissionWatchdog);
      unusedPorts.delete(port);
      const job = active?.port === port ? active : queue.find((entry) => entry.port === port);
      if (job) {
        cancel(job, 'The geometry requester disconnected.');
      }
    });
    port.start();
    return channel.port1;
  };
  return {
    connectMeasurement: () => connect('measurement'),
    connectPerformance: () => connect('performance'),
    connectSuite: (input) => connect('suite', input),
    revokeUnauthorized() {
      for (const job of queue.toReversed()) {
        if (job.kind === 'suite' && !grantAllows(job.stillAuthorized)) {
          cancel(job, 'The GeoSpec runner root grant was revoked.');
        }
      }
      if (active?.kind === 'suite' && !grantAllows(active.stillAuthorized)) {
        cancel(active, 'The GeoSpec runner root grant was revoked.');
      }
      if (!residentGrantsAllow() && utility) {
        if (active && !active.canceled) {
          active.canceled = true;
          unavailable(active, 'The geometry process retained a revoked GeoSpec root.');
        }
        killActiveSlot('retained GeoSpec root grant revoked');
      }
    },
    async dispose() {
      accepting = false;
      for (const port of unusedPorts) {
        port.close();
      }
      while (queue.length > 0) {
        unavailable(queue.shift()!, 'The geometry broker is shutting down.');
      }
      if (active) {
        cancel(active, 'The geometry broker is shutting down.');
      }
      if (!utility) {
        return;
      }
      const spawned = utility;
      clearTimeout(idleWatchdog);
      const exited = new Promise<void>((resolve) => {
        spawned.once('exit', () => {
          resolve();
        });
      });
      killActiveSlot('shutdown');
      let geometryExitTimeout: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          exited,
          new Promise<never>((_resolve, reject) => {
            geometryExitTimeout = setTimeout(() => {
              reject(new Error('The geometry process did not exit on shutdown.'));
            }, exitDeadlineMilliseconds);
          }),
        ]);
      } finally {
        clearTimeout(geometryExitTimeout);
      }
    },
  };
};
