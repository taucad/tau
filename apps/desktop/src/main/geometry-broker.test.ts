import { spawn } from 'node:child_process';
import { MessageChannel } from 'node:worker_threads';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type { HostGeoSpecRunner } from '@taucad/host/agent-tools';
import type { GeoSpecRunnerEvent, GeoSpecRunnerResult } from 'geospec/runner/worker';
import type { GeometryBrokerOptions } from '#main/geometry-broker.js';
import { createGeometryBroker } from '#main/geometry-broker.js';
import { createGeometryHost } from '#tau/geometry-host.impl.js';
import { createGeometryRunnerClient } from '#tau/geometry-runner-client.js';
import type { UtilityPort } from '#tau/services-host.impl.js';

type FakePort = {
  readonly posted: unknown[];
  readonly postMessage: ReturnType<typeof vi.fn>;
  readonly close: ReturnType<typeof vi.fn>;
  on(event: 'message' | 'close', listener: (value?: { data: unknown }) => void): void;
  send(value: unknown): void;
  disconnect(): void;
  start(): void;
};

const fakePort = (): FakePort => {
  const messages: Array<(value?: { data: unknown }) => void> = [];
  const closes: Array<() => void> = [];
  const posted: unknown[] = [];
  return {
    posted,
    postMessage: vi.fn((value: unknown) => {
      posted.push(value);
    }),
    close: vi.fn(() => {
      for (const listener of closes) {
        listener();
      }
    }),
    on(event, listener) {
      if (event === 'message') {
        messages.push(listener);
      } else {
        closes.push(listener);
      }
    },
    send(value) {
      for (const listener of messages) {
        listener({ data: value });
      }
    },
    disconnect() {
      for (const listener of closes) {
        listener();
      }
    },
    start() {
      /* Electron starts the transferred port; fake delivers synchronously. */
    },
  };
};

type FakeUtility = {
  readonly posted: unknown[];
  readonly kill: ReturnType<typeof vi.fn>;
  postMessage(value: unknown): void;
  on(event: 'message' | 'exit', listener: (value?: unknown) => void): void;
  once(event: 'exit', listener: () => void): void;
  message(value: unknown): void;
  exit(): void;
};

const fakeUtility = (): FakeUtility => {
  const messages: Array<(value?: unknown) => void> = [];
  const exits: Array<() => void> = [];
  const posted: unknown[] = [];
  return {
    posted,
    kill: vi.fn(),
    postMessage(value) {
      posted.push(value);
    },
    on(event, listener) {
      if (event === 'message') {
        messages.push(listener);
      } else {
        exits.push(listener);
      }
    },
    once(_event, listener) {
      exits.push(listener);
    },
    message(value) {
      for (const listener of messages) {
        listener(value);
      }
    },
    exit() {
      for (const listener of exits) {
        listener();
      }
    },
  };
};

const validMeasurement = (id: number) => ({
  id,
  source: { format: 'ap242', bytes: new Uint8Array([1, 2, 3]), coordinateSystem: 'y-up' },
  occurrences: [{ name: 'part-a' }, { name: 'part-b' }],
});
const validMeasurementResult = (id: number) => ({
  id,
  result: {
    status: 'complete',
    fact: {
      source: 'ap242',
      assurance: 'exact-brep',
      unit: 'mm',
      coordinateSystem: 'z-up',
      subjectHash: 'sha256:fixture',
      algorithmProfile: 'geospec-minimum-distance-v1',
      occurrences: ['root.part-a', 'root.part-b'],
      distance: 2,
      points: [
        [0, 0, 0],
        [2, 0, 0],
      ],
    },
  },
});

const harness = (sampleResidentBytes?: GeometryBrokerOptions['sampleResidentBytes']) => {
  const channels: Array<{ client: FakePort; broker: FakePort }> = [];
  const utilities: FakeUtility[] = [];
  const leases: Array<{ port: { id: number }; dispose: ReturnType<typeof vi.fn> }> = [];
  const fork = vi.fn(() => {
    const utility = fakeUtility();
    utilities.push(utility);
    return utility;
  });
  const options = {
    utilityEntry: '/dist/main/geometry-host.js',
    env: {},
    fork,
    createChannel() {
      const client = fakePort();
      const broker = fakePort();
      channels.push({ client, broker });
      return { port1: client, port2: broker };
    },
    connectRuntime() {
      const lease = { port: { id: leases.length + 1 }, closed: Promise.resolve(), dispose: vi.fn() };
      leases.push(lease);
      return lease;
    },
    sampleResidentBytes: sampleResidentBytes ?? (() => 0),
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- Electron ports and utilities cannot be constructed in a Node unit test; the fake implements only broker-used methods.
  } as unknown as GeometryBrokerOptions;
  const broker = createGeometryBroker(options);
  return { broker, channels, utilities, leases, fork };
};

afterEach(() => {
  vi.useRealTimers();
});

describe('geometry broker', () => {
  it('delivers a multi-test report above the progress limit through host, broker and actual client port once', async () => {
    const { broker, channels, utilities, leases } = harness();
    broker.connectSuite({
      root: '/project',
      context: { projectRoot: '/project' },
      stillAuthorized: () => true,
    });
    const { port1, port2 } = new MessageChannel();
    const client = createGeometryRunnerClient(port1);
    const result: GeoSpecRunnerResult = {
      success: false,
      passed: 0,
      failed: 2,
      selectedTests: 2,
      files: [
        {
          file: 'model.test.ts',
          durationMs: 12,
          result: {
            success: true,
            passed: false,
            tests: ['first', 'second'].map((name) => ({
              suite: ['volume control'],
              name,
              status: 'failed',
              diagnostics: [{ code: 'GEOSPEC_CONTROL', severity: 'error', message: 'x'.repeat(40_000) }],
              assertions: [
                {
                  kind: 'watertight',
                  subject: { subjectHash: 'fixture' },
                  expected: true,
                  passed: false,
                  report: {
                    claimId: name,
                    status: 'failed',
                    polarity: 'positive',
                    claim: { claimId: name },
                    result: { claimId: name, status: 'failed' },
                    diagnostics: [],
                    canonicalPlan: new Uint8Array([123, 125]),
                    canonicalClaim: new Uint8Array([123, 125]),
                    canonicalResult: new Uint8Array([123, 125]),
                  },
                },
              ],
            })),
            bundle: { success: true, code: '', issues: [], dependencies: ['model.test.ts'], unresolvedPaths: [] },
          },
        },
      ],
    };
    expect(Buffer.byteLength(JSON.stringify(result))).toBeGreaterThan(64 * 1024);
    expect(Buffer.byteLength(JSON.stringify(result))).toBeLessThan(8 * 1024 * 1024);
    const fileComplete = vi.fn();
    const runComplete = vi.fn();
    client.on('file-complete', fileComplete);
    client.on('run-complete', runComplete);
    channels[0]!.broker.postMessage.mockImplementation((frame: unknown) => {
      port2.postMessage(frame);
    });
    const runner = mock<HostGeoSpecRunner>();
    const observers = new Set<(event: GeoSpecRunnerEvent) => void>();
    runner.on.mockImplementation((type, listener) => {
      const observe = (event: GeoSpecRunnerEvent): void => {
        if (event.type === type) {
          listener(event);
        }
      };
      observers.add(observe);
      return () => {
        observers.delete(observe);
      };
    });
    runner.run.mockImplementation(async () => {
      for (const event of [
        { type: 'run-start', files: ['model.test.ts'] },
        { type: 'file-start', file: 'model.test.ts' },
        { type: 'file-complete', ...result.files[0]! },
        { type: 'run-complete', result },
      ] satisfies GeoSpecRunnerEvent[]) {
        for (const observer of observers) {
          observer(event);
        }
      }
      return result;
    });
    port2.once('message', (input: unknown) => {
      channels[0]!.broker.send(input);
      const host = createGeometryHost({
        post: (frame) => {
          utilities[0]!.message(frame);
        },
        createRunner: async () => runner,
        measure: vi.fn(),
        performance: vi.fn(),
      });
      host.handle({
        data: {
          type: 'geometry-run',
          generation: 1,
          requestId: 1,
          kind: 'suite',
          root: '/project',
          input,
          runtimeConfig: { tauApiUrl: 'http://localhost', tauWebSocketUrl: 'ws://localhost' },
        },
        ports: [mock<UtilityPort>()],
      });
    });
    try {
      await expect(client.run({ files: ['model.test.ts'] })).resolves.toEqual(result);
      expect(fileComplete).toHaveBeenCalledExactlyOnceWith({ type: 'file-complete', ...result.files[0]! });
      expect(runComplete).toHaveBeenCalledExactlyOnceWith({ type: 'run-complete', result });
      expect(client).not.toHaveProperty('sourceRevisions');
      expect(runner.abort).not.toHaveBeenCalled();
      expect(runner.close).toHaveBeenCalledOnce();
      expect(leases[0]!.dispose).toHaveBeenCalledOnce();
      expect(utilities[0]!.kill).not.toHaveBeenCalled();
      expect(observers.size).toBe(0);
    } finally {
      await client.close();
      port2.close();
      const disposed = broker.dispose();
      utilities[0]?.exit();
      await disposed;
    }
  });

  it('refuses malformed or oversized input before process allocation', () => {
    const { broker, channels, fork } = harness();
    broker.connectMeasurement();
    channels[0]!.broker.send({
      ...validMeasurement(1),
      source: { ...validMeasurement(1).source, bytes: new Uint8Array(32 * 1024 * 1024 + 1) },
    });
    expect(channels[0]!.broker.posted).toMatchObject([
      { id: 1, result: { status: 'interrupted', code: 'engine-error' } },
    ]);
    expect(fork).not.toHaveBeenCalled();
  });

  it('closes an unused pre-shutdown port and refuses its late first submit without forking', async () => {
    const { broker, channels, fork } = harness();
    broker.connectMeasurement();
    await broker.dispose();
    expect(channels[0]!.broker.close).toHaveBeenCalledOnce();
    channels[0]!.broker.send(validMeasurement(8));
    expect(channels[0]!.broker.posted).toMatchObject([
      { id: 8, result: { status: 'interrupted', code: 'executor-exited' } },
    ]);
    expect(fork).not.toHaveBeenCalled();
  });

  it('expires an unused request port before it can allocate a process', async () => {
    vi.useFakeTimers();
    try {
      const { broker, channels, fork } = harness();
      broker.connectMeasurement();
      await vi.advanceTimersByTimeAsync(10_000);
      expect(channels[0]!.broker.close).toHaveBeenCalledOnce();
      expect(fork).not.toHaveBeenCalled();
      await broker.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it('bounds unsubmitted ports before allocating another channel', async () => {
    const { broker, channels, fork } = harness();
    for (let index = 0; index < 8; index += 1) {
      broker.connectMeasurement();
    }
    expect(() => broker.connectMeasurement()).toThrow('Too many unsubmitted geometry request ports.');
    expect(channels).toHaveLength(8);
    expect(fork).not.toHaveBeenCalled();
    await broker.dispose();
  });

  it('bounds diagnostic input and schedules it in the same exclusive slot', async () => {
    const { broker, channels, utilities, fork } = harness();
    broker.connectPerformance();
    channels[0]!.broker.send({ type: 'run', id: 5, input: { payload: 'x'.repeat(2 * 1024 * 1024) } });
    expect(channels[0]!.broker.posted).toMatchObject([{ id: 5, type: 'error' }]);
    expect(fork).not.toHaveBeenCalled();

    broker.connectMeasurement();
    broker.connectPerformance();
    channels[1]!.broker.send(validMeasurement(7));
    channels[2]!.broker.send({ type: 'run', id: 9, input: { engine: 'native-desktop' } });
    expect(fork).toHaveBeenCalledOnce();
    expect(utilities[0]!.posted).toHaveLength(1);
    utilities[0]!.message({
      type: 'geometry-result',
      generation: 1,
      requestId: 1,
      value: { id: 7, result: { status: 'interrupted', code: 'engine-error', message: 'fixture' } },
    });
    expect(utilities[0]!.posted[1]).toMatchObject({ kind: 'performance', requestId: 2 });
    utilities[0]!.message({
      type: 'geometry-result',
      generation: 1,
      requestId: 2,
      value: { id: 9, type: 'result', result: { benchmark: 'complete' } },
    });
    expect(channels[2]!.broker.posted).toEqual([{ id: 9, type: 'result', result: { benchmark: 'complete' } }]);
    const disposed = broker.dispose();
    utilities[0]!.exit();
    await disposed;
  });

  it('refuses a malformed native fact or a mismatched UI request id', async () => {
    const { broker, channels, utilities } = harness();
    broker.connectMeasurement();
    broker.connectMeasurement();
    channels[0]!.broker.send(validMeasurement(3));
    channels[1]!.broker.send(validMeasurement(4));
    utilities[0]!.message({ type: 'geometry-result', generation: 1, requestId: 1, value: validMeasurementResult(4) });
    expect(channels[0]!.broker.posted).toMatchObject([
      { id: 3, result: { status: 'interrupted', code: 'engine-error' } },
    ]);
    const malformed = validMeasurementResult(4);
    malformed.result.fact.distance = Number.NaN;
    utilities[0]!.message({ type: 'geometry-result', generation: 1, requestId: 2, value: malformed });
    expect(channels[1]!.broker.posted).toMatchObject([
      { id: 4, result: { status: 'interrupted', code: 'engine-error' } },
    ]);
    const disposed = broker.dispose();
    utilities[0]!.exit();
    await disposed;
  });

  it('cancels active and queued suites when their root grant is revoked', async () => {
    vi.useFakeTimers();
    const { broker, channels, utilities, leases } = harness();
    let authorized = true;
    const stillAuthorized = (): boolean => authorized;
    for (let index = 0; index < 2; index += 1) {
      broker.connectSuite({
        root: '/project/checkout',
        context: { projectRoot: '/project/checkout' },
        stillAuthorized,
      });
      channels[index]!.broker.send({ type: 'run', options: { files: ['model.test.ts'] } });
    }
    expect(leases).toHaveLength(1);
    authorized = false;
    broker.revokeUnauthorized();
    expect(channels[0]!.broker.posted).toMatchObject([
      { type: 'error', message: 'The GeoSpec runner root grant was revoked.' },
    ]);
    expect(channels[1]!.broker.posted).toMatchObject([
      { type: 'error', message: 'The GeoSpec runner root grant was revoked.' },
    ]);
    await vi.advanceTimersByTimeAsync(250);
    expect(utilities[0]!.kill).toHaveBeenCalledOnce();
    utilities[0]!.exit();
    expect(leases[0]!.dispose).toHaveBeenCalledOnce();
    await broker.dispose();
  });

  it('retires an idle slot retaining a revoked suite root before regranting the same path', async () => {
    const { broker, channels, utilities, fork } = harness();
    let firstGenerationAuthorized = true;
    broker.connectSuite({
      root: '/project/checkout',
      context: { projectRoot: '/project/checkout' },
      stillAuthorized: () => firstGenerationAuthorized,
    });
    channels[0]!.broker.send({ type: 'run', options: { files: ['model.test.ts'] } });
    utilities[0]!.message({
      type: 'geometry-result',
      generation: 1,
      requestId: 1,
      value: { type: 'result', result: { success: true } },
    });
    expect(channels[0]!.broker.posted).toMatchObject([{ type: 'result' }]);
    expect(utilities[0]!.kill).not.toHaveBeenCalled();

    firstGenerationAuthorized = false;
    broker.revokeUnauthorized();
    expect(utilities[0]!.kill).toHaveBeenCalledOnce();
    broker.connectSuite({
      root: '/project/checkout',
      context: { projectRoot: '/project/checkout', attachmentGeneration: '2' },
      stillAuthorized: () => true,
    });
    channels[1]!.broker.send({ type: 'run', options: { files: ['model.test.ts'] } });
    expect(fork).toHaveBeenCalledOnce();
    utilities[0]!.exit();
    expect(fork).toHaveBeenCalledTimes(2);
    expect(utilities[1]!.posted[0]).toMatchObject({ generation: 2, kind: 'suite', root: '/project/checkout' });
    const disposed = broker.dispose();
    utilities[1]!.exit();
    await disposed;
  });

  it('retires an idle native slot when its prior root is revoked after a legacy suite', async () => {
    const { broker, channels, utilities, fork } = harness();
    let aAuthorized = true;
    broker.connectSuite({
      root: '/project/A',
      context: { projectRoot: '/project/A' },
      stillAuthorized: () => aAuthorized,
    });
    channels[0]!.broker.send({ type: 'run', options: { files: ['a.test.ts'] } });
    utilities[0]!.message({
      type: 'geometry-result',
      generation: 1,
      requestId: 1,
      value: { type: 'result', result: { success: true } },
    });
    broker.connectSuite({
      root: '/project/B',
      context: { projectRoot: '/project/B' },
      stillAuthorized: () => true,
    });
    channels[1]!.broker.send({ type: 'run', options: { files: ['b.test.ts'] } });
    expect(fork).toHaveBeenCalledOnce();
    utilities[0]!.message({
      type: 'geometry-result',
      generation: 1,
      requestId: 2,
      value: { type: 'result', result: { success: true } },
    });
    aAuthorized = false;
    broker.revokeUnauthorized();
    expect(utilities[0]!.kill).toHaveBeenCalledOnce();
    utilities[0]!.exit();
    await broker.dispose();
  });

  it('keeps the prior native grant after a failed second-root suite', async () => {
    const { broker, channels, utilities } = harness();
    let aAuthorized = true;
    broker.connectSuite({
      root: '/project/A',
      context: { projectRoot: '/project/A' },
      stillAuthorized: () => aAuthorized,
    });
    channels[0]!.broker.send({ type: 'run', options: { files: ['a.test.ts'] } });
    utilities[0]!.message({
      type: 'geometry-result',
      generation: 1,
      requestId: 1,
      value: { type: 'result', result: { success: true } },
    });
    broker.connectSuite({
      root: '/project/B',
      context: { projectRoot: '/project/B' },
      stillAuthorized: () => true,
    });
    channels[1]!.broker.send({ type: 'run', options: { files: ['b.test.ts'] } });
    utilities[0]!.message({
      type: 'geometry-result',
      generation: 1,
      requestId: 2,
      value: { type: 'error', message: 'realpath failed before native session switch' },
    });
    expect(channels[1]!.broker.posted).toEqual([
      { type: 'error', message: 'realpath failed before native session switch' },
    ]);
    aAuthorized = false;
    broker.revokeUnauthorized();
    expect(utilities[0]!.kill).toHaveBeenCalledOnce();
    utilities[0]!.exit();
    await broker.dispose();
  });

  it('reuses an authorized root but retires before dispatch when an older grant expires', async () => {
    const { broker, channels, utilities, fork } = harness();
    let aAuthorized = true;
    const grantA = (): boolean => aAuthorized;
    for (let index = 0; index < 2; index += 1) {
      broker.connectSuite({
        root: '/project/A',
        context: { projectRoot: '/project/A' },
        stillAuthorized: grantA,
      });
      channels[index]!.broker.send({ type: 'run', options: { files: ['a.test.ts'] } });
      utilities[0]!.message({
        type: 'geometry-result',
        generation: 1,
        requestId: index + 1,
        value: { type: 'result', result: { success: true } },
      });
    }
    expect(fork).toHaveBeenCalledOnce();
    expect(utilities[0]!.kill).not.toHaveBeenCalled();
    aAuthorized = false;
    broker.connectSuite({
      root: '/project/B',
      context: { projectRoot: '/project/B' },
      stillAuthorized: () => true,
    });
    channels[2]!.broker.send({ type: 'run', options: { files: ['b.test.ts'] } });
    expect(utilities[0]!.kill).toHaveBeenCalledOnce();
    expect(utilities[0]!.posted).toHaveLength(2);
    expect(fork).toHaveBeenCalledOnce();
    utilities[0]!.exit();
    expect(fork).toHaveBeenCalledTimes(2);
    expect(utilities[1]!.posted[0]).toMatchObject({ generation: 2, kind: 'suite', root: '/project/B' });
    const disposed = broker.dispose();
    utilities[1]!.exit();
    await disposed;
  });

  it('rotates a long-lived slot before grant tracking can grow without bound', async () => {
    const { broker, channels, utilities, fork } = harness();
    for (let index = 0; index < 65; index += 1) {
      broker.connectSuite({
        root: '/project/A',
        context: { projectRoot: '/project/A' },
        stillAuthorized: () => true,
      });
      channels[index]!.broker.send({ type: 'run', options: { files: ['a.test.ts'] } });
      if (index < 64) {
        utilities[0]!.message({
          type: 'geometry-result',
          generation: 1,
          requestId: index + 1,
          value: { type: 'result', result: { success: true } },
        });
      }
    }
    expect(utilities[0]!.posted).toHaveLength(64);
    expect(utilities[0]!.kill).toHaveBeenCalledOnce();
    expect(fork).toHaveBeenCalledOnce();
    utilities[0]!.exit();
    expect(fork).toHaveBeenCalledTimes(2);
    expect(utilities[1]!.posted[0]).toMatchObject({ generation: 2, requestId: 65 });
    const disposed = broker.dispose();
    utilities[1]!.exit();
    await disposed;
  });

  it('fails closed when a retained root grant predicate throws', async () => {
    const { broker, channels, utilities } = harness();
    let predicateThrows = false;
    broker.connectSuite({
      root: '/project',
      context: { projectRoot: '/project' },
      stillAuthorized: () => {
        if (predicateThrows) {
          throw new Error('root generation unavailable');
        }
        return true;
      },
    });
    channels[0]!.broker.send({ type: 'run', options: { files: ['model.test.ts'] } });
    utilities[0]!.message({
      type: 'geometry-result',
      generation: 1,
      requestId: 1,
      value: { type: 'result', result: { success: true } },
    });
    predicateThrows = true;
    expect(() => {
      broker.revokeUnauthorized();
    }).not.toThrow();
    expect(utilities[0]!.kill).toHaveBeenCalledOnce();
    utilities[0]!.exit();
    await broker.dispose();
  });

  it('cancels an active suite when a cyclic event cannot be bounded', async () => {
    vi.useFakeTimers();
    const { broker, channels, utilities } = harness();
    broker.connectSuite({
      root: '/project',
      context: { projectRoot: '/project' },
      stillAuthorized: () => true,
    });
    channels[0]!.broker.send({ type: 'run', options: { files: ['model.test.ts'] } });
    const cyclic: Record<string, unknown> = {};
    cyclic['self'] = cyclic;
    utilities[0]!.message({ type: 'geometry-event', generation: 1, requestId: 1, event: cyclic });
    expect(channels[0]!.broker.posted).toMatchObject([
      {
        type: 'error',
        transport: {
          code: 'GEOSPEC_TRANSPORT_MALFORMED',
          phase: 'event',
          limitBytes: 64 * 1024,
        },
      },
    ]);
    await vi.advanceTimersByTimeAsync(250);
    expect(utilities[0]!.kill).toHaveBeenCalledOnce();
    utilities[0]!.exit();
    await broker.dispose();
  });

  it.each(['event', 'result'] as const)(
    'reports an explicit %s size refusal without treating it as a geometry verdict',
    async (phase) => {
      vi.useFakeTimers();
      const { broker, channels, utilities, leases } = harness();
      broker.connectSuite({
        root: '/project',
        context: { projectRoot: '/project' },
        stillAuthorized: () => true,
      });
      channels[0]!.broker.send({ type: 'run', options: { files: ['model.test.ts'] } });
      const limitBytes = phase === 'event' ? 64 * 1024 : 8 * 1024 * 1024;
      const payload = { type: 'fixture', payload: 'x'.repeat(limitBytes) };
      utilities[0]!.message({
        type: `geometry-${phase}`,
        generation: 1,
        requestId: 1,
        ...(phase === 'event' ? { event: payload } : { value: payload }),
      });
      expect(channels[0]!.broker.posted).toMatchObject([
        {
          type: 'error',
          transport: {
            code: 'GEOSPEC_TRANSPORT_LIMIT',
            phase,
            bytes: Buffer.byteLength(JSON.stringify(payload)),
            limitBytes,
          },
        },
      ]);
      if (phase === 'event') {
        await vi.advanceTimersByTimeAsync(250);
        expect(utilities[0]!.kill).toHaveBeenCalledOnce();
      }
      utilities[0]!.exit();
      expect(leases[0]!.dispose).toHaveBeenCalledOnce();
      expect(channels[0]!.broker.posted).toHaveLength(1);
      await broker.dispose();
    },
  );

  it('terminates an oversized-RSS slot and waits for actual exit before serving its queue', async () => {
    vi.useFakeTimers();
    const sampleResidentBytes = vi.fn(() => 2 * 1024 * 1024 * 1024 + 1);
    const { broker, channels, utilities, fork } = harness(sampleResidentBytes);
    broker.connectMeasurement();
    broker.connectMeasurement();
    channels[0]!.broker.send(validMeasurement(1));
    channels[1]!.broker.send(validMeasurement(2));
    await vi.advanceTimersByTimeAsync(1000);
    expect(sampleResidentBytes).toHaveBeenCalledOnce();
    expect(utilities[0]!.kill).toHaveBeenCalledOnce();
    expect(channels[0]!.broker.posted).toMatchObject([
      { id: 1, result: { status: 'interrupted', code: 'engine-error' } },
    ]);
    expect(fork).toHaveBeenCalledOnce();
    utilities[0]!.exit();
    expect(fork).toHaveBeenCalledTimes(2);
    const disposed = broker.dispose();
    utilities[1]!.exit();
    await disposed;
  });

  it('allows startup metric delay but terminates a slot after five missing samples', async () => {
    vi.useFakeTimers();
    const sampleResidentBytes = vi.fn(() => undefined);
    const { broker, channels, utilities } = harness(sampleResidentBytes);
    broker.connectMeasurement();
    channels[0]!.broker.send(validMeasurement(1));
    await vi.advanceTimersByTimeAsync(4000);
    expect(utilities[0]!.kill).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    expect(utilities[0]!.kill).toHaveBeenCalledOnce();
    expect(channels[0]!.broker.posted).toMatchObject([{ id: 1, result: { status: 'interrupted' } }]);
    utilities[0]!.exit();
    await broker.dispose();
  });

  it('runs one request at a time and fences stale process replies after a killed slot exits', async () => {
    vi.useFakeTimers();
    const { broker, channels, utilities, fork } = harness();
    broker.connectMeasurement();
    broker.connectMeasurement();
    channels[0]!.broker.send(validMeasurement(1));
    channels[1]!.broker.send(validMeasurement(2));
    expect(fork).toHaveBeenCalledOnce();
    expect(utilities[0]!.posted).toHaveLength(1);
    channels[0]!.broker.disconnect();
    await vi.advanceTimersByTimeAsync(251);
    expect(utilities[0]!.kill).toHaveBeenCalledOnce();
    expect(utilities[0]!.posted).toHaveLength(2); // Run, cooperative cancel.
    expect(fork).toHaveBeenCalledOnce(); // No replacement until actual exit.
    utilities[0]!.exit();
    expect(fork).toHaveBeenCalledTimes(2);
    utilities[0]!.message({ type: 'geometry-result', generation: 1, requestId: 1, value: { status: 'complete' } });
    expect(channels[1]!.broker.posted).toHaveLength(0);
    utilities[1]!.message({ type: 'geometry-result', generation: 2, requestId: 2, value: validMeasurementResult(2) });
    expect(channels[1]!.broker.posted).toEqual([validMeasurementResult(2)]);
    const disposed = broker.dispose();
    utilities[1]!.exit();
    await disposed;
  });

  it('mints and disposes a separate Runtime lease for a suite', async () => {
    const { broker, channels, utilities, leases } = harness();
    broker.connectSuite({
      root: '/project/checkout',
      context: { projectRoot: '/project/checkout', computeMode: 'memory' },
      stillAuthorized: () => true,
    });
    channels[0]!.broker.send({ type: 'run', options: { files: ['tests/geospec.test.ts'] } });
    expect(leases).toHaveLength(1);
    expect(utilities[0]!.posted[0]).toMatchObject({ kind: 'suite', root: '/project/checkout' });
    expect(utilities[0]!.posted[0]).not.toHaveProperty('engine');
    utilities[0]!.message({
      type: 'geometry-result',
      generation: 1,
      requestId: 1,
      value: { type: 'result', result: { success: true } },
    });
    expect(leases[0]!.dispose).toHaveBeenCalledOnce();
    expect(channels[0]!.broker.posted).toMatchObject([{ type: 'result' }]);
    const disposed = broker.dispose();
    utilities[0]!.exit();
    await disposed;
  });

  it('rechecks suite root authorization at dispatch before leasing Runtime', () => {
    const { broker, channels, fork, leases } = harness();
    broker.connectSuite({
      root: '/project/checkout',
      context: { projectRoot: '/project/checkout' },
      stillAuthorized: () => false,
    });
    channels[0]!.broker.send({ type: 'run', options: { files: ['model.test.ts'] } });
    expect(channels[0]!.broker.posted).toEqual([
      { type: 'error', message: 'The GeoSpec runner root grant expired before execution.' },
    ]);
    expect(fork).not.toHaveBeenCalled();
    expect(leases).toHaveLength(0);
  });

  it('observes synchronous process exit during shutdown before reporting disposal', async () => {
    const { broker, channels, utilities } = harness();
    broker.connectMeasurement();
    channels[0]!.broker.send(validMeasurement(1));
    utilities[0]!.kill.mockImplementationOnce(() => {
      utilities[0]!.exit();
    });
    await expect(broker.dispose()).resolves.toBeUndefined();
    expect(utilities[0]!.kill).toHaveBeenCalledOnce();
  });

  it('returns fork failure and retries only on a later admitted request', async () => {
    const { broker, channels, fork, utilities } = harness();
    fork.mockImplementationOnce(() => {
      throw new Error('fork refused');
    });
    broker.connectMeasurement();
    channels[0]!.broker.send(validMeasurement(1));
    expect(channels[0]!.broker.posted).toMatchObject([
      { id: 1, result: { status: 'interrupted', code: 'engine-error' } },
    ]);
    broker.connectMeasurement();
    channels[1]!.broker.send(validMeasurement(2));
    expect(fork).toHaveBeenCalledTimes(2);
    const disposed = broker.dispose();
    utilities[0]!.exit();
    await disposed;
  });

  it('refuses new work while a killed process has not actually exited', async () => {
    vi.useFakeTimers();
    const { broker, channels, utilities } = harness();
    broker.connectMeasurement();
    channels[0]!.broker.send(validMeasurement(1));
    channels[0]!.broker.disconnect();
    await vi.advanceTimersByTimeAsync(250 + 5000);
    expect(() => broker.connectMeasurement()).toThrow('has not exited');
    utilities[0]!.exit();
    expect(() => broker.connectMeasurement()).not.toThrow();
    const disposed = broker.dispose();
    await disposed;
  });

  it('observes an actual OS child exit before restarting the queued slot', async () => {
    const child = spawn(process.execPath, ['-e', 'setInterval(() => undefined, 1000)'], { stdio: 'ignore' });
    const exited = new Promise<void>((resolve) => {
      child.once('exit', () => {
        resolve();
      });
    });
    const realUtility: FakeUtility = {
      posted: [],
      kill: vi.fn(() => child.kill('SIGKILL')),
      postMessage(value) {
        this.posted.push(value);
      },
      on(event, listener) {
        child.on(event, () => {
          listener(undefined);
        });
      },
      once(_event, listener) {
        child.once('exit', () => {
          listener();
        });
      },
      message() {
        /* The child is intentionally stalled. */
      },
      exit() {
        child.kill('SIGKILL');
      },
    };
    const { broker, channels, fork, utilities } = harness();
    fork.mockImplementationOnce(() => realUtility);
    try {
      broker.connectMeasurement();
      broker.connectMeasurement();
      channels[0]!.broker.send(validMeasurement(1));
      channels[1]!.broker.send(validMeasurement(2));
      channels[0]!.broker.disconnect();
      await exited;
      expect(realUtility.kill).toHaveBeenCalledOnce();
      expect(child.signalCode).toBe('SIGKILL');
      expect(fork).toHaveBeenCalledTimes(2);
      const disposed = broker.dispose();
      utilities[0]!.exit();
      await disposed;
    } finally {
      child.kill('SIGKILL');
    }
  });
});
