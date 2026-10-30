/**
 * T10 and T29 (Runtime Observability package §6): the runtime ingest over Fastify inject with an in-memory Redis.
 * Body bound, batch id, limiter, in-flight dedupe, budget, partial recording, fail-open, signed-out keys, release
 * admission, the policy probe and the legacy path, end to end through the guard, the pipe and the controller.
 */
/* eslint-disable max-params, @typescript-eslint/no-restricted-types, @typescript-eslint/naming-convention -- the fake mirrors ioredis' positional signatures and null replies; environment variable names */
import { Logger, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { metrics as otelMetrics } from '@opentelemetry/api';
import { PrometheusExporter } from '@opentelemetry/exporter-prometheus';
import { metrics as sdkMetrics } from '@opentelemetry/sdk-node';
import {
  IngestEntryName,
  RuntimeEntryName,
  ingestReceiptSchema,
  jobProviderIds,
  transcoderIds,
} from '@taucad/telemetry';
import type { Auth } from 'better-auth';
import { getLoggerToken } from 'nestjs-pino';
import { ZodValidationPipe } from 'nestjs-zod';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mock, mockDeep } from 'vitest-mock-extended';
import { AuthGuard } from '#auth/auth.guard.js';
import { authInstanceKey } from '#constants/auth.constant.js';
import { HttpExceptionFilter } from '#filters/http-exception.filter.js';
import { PublicationRateLimiterService } from '#api/publications/publication-rate-limiter.service.js';
import { RedisService } from '#redis/redis.service.js';
import { MetricsService } from '#telemetry/metrics.js';
import { TelemetryController } from '#api/telemetry/telemetry.controller.js';
import { RuntimeIngestService, networkOf, runtimeIngestLimits } from '#api/telemetry/runtime-ingest.service.js';
import { RuntimeMetricsService } from '#api/telemetry/runtime-metrics.service.js';

type Session = NonNullable<Awaited<ReturnType<Auth['api']['getSession']>>>;
type Stored = { value: string | string[] | Set<string>; expiresAt: number | undefined };

/** The Redis commands the ingest uses, in memory, honouring TTLs against `Date.now()`; `down` makes each one throw. */
class FakeRedis {
  public down = false;
  public readonly commands: string[] = [];
  private readonly store = new Map<string, Stored>();

  public async eval(
    _script: string,
    _keys: number,
    key: string,
    windowSeconds: string,
    count: string,
  ): Promise<number> {
    const current = this.live(key);
    const next = Number(current?.value ?? 0) + Number(count);
    this.write('eval', key, String(next), current?.expiresAt ?? Date.now() + Number(windowSeconds) * 1000);
    return next;
  }

  public async set(key: string, value: string, _ex: 'EX', seconds: number, nx?: 'NX'): Promise<'OK' | null> {
    if (nx === 'NX' && this.live(key) !== undefined) {
      this.commands.push(`set ${key}`);
      return null;
    }
    this.write('set', key, value, Date.now() + seconds * 1000);
    return 'OK';
  }

  public async get(key: string): Promise<string | null> {
    this.check('get');
    const value = this.live(key)?.value;
    return typeof value === 'string' ? value : null;
  }

  public async del(key: string): Promise<number> {
    this.check('del');
    return this.store.delete(key) ? 1 : 0;
  }

  public async pfadd(key: string, ...members: string[]): Promise<number> {
    this.check('pfadd');
    const set = (this.live(key)?.value as Set<string> | undefined) ?? new Set<string>();
    for (const member of members) {
      set.add(member);
    }
    this.store.set(key, { value: set, expiresAt: undefined });
    return 1;
  }

  public async pfcount(key: string): Promise<number> {
    this.check('pfcount');
    return (this.live(key)?.value as Set<string> | undefined)?.size ?? 0;
  }

  public async expire(key: string, seconds: number): Promise<number> {
    this.check('expire');
    const stored = this.store.get(key);
    if (stored !== undefined) {
      stored.expiresAt = Date.now() + seconds * 1000;
    }
    return 1;
  }

  public async lrange(key: string, start: number, stop: number): Promise<string[]> {
    this.check('lrange');
    return ((this.live(key)?.value as string[] | undefined) ?? []).slice(start, stop + 1);
  }

  public async lrem(key: string, _count: number, value: string): Promise<number> {
    this.check('lrem');
    const list = (this.live(key)?.value as string[] | undefined) ?? [];
    this.store.set(key, { value: list.filter((item) => item !== value), expiresAt: undefined });
    return 1;
  }

  public async lpush(key: string, value: string): Promise<number> {
    this.check('lpush');
    const list = (this.live(key)?.value as string[] | undefined) ?? [];
    this.store.set(key, { value: [value, ...list], expiresAt: undefined });
    return list.length + 1;
  }

  public async ltrim(key: string, start: number, stop: number): Promise<string> {
    this.check('ltrim');
    const list = (this.live(key)?.value as string[] | undefined) ?? [];
    this.store.set(key, { value: list.slice(start, stop + 1), expiresAt: undefined });
    return 'OK';
  }

  public keys(prefix: string): string[] {
    return [...this.store.keys()].filter((key) => key.startsWith(prefix) && this.live(key) !== undefined);
  }

  public value(key: string): Stored['value'] | undefined {
    return this.live(key)?.value;
  }

  private check(command: string): void {
    this.commands.push(command);
    if (this.down) {
      throw new Error('Connection is closed.');
    }
  }

  private write(command: string, key: string, value: string, expiresAt: number | undefined): void {
    this.check(`${command} ${key}`);
    this.store.set(key, { value, expiresAt });
  }

  private live(key: string): Stored | undefined {
    const stored = this.store.get(key);
    if (stored?.expiresAt !== undefined && stored.expiresAt <= Date.now()) {
      this.store.delete(key);
      return undefined;
    }
    return stored;
  }
}

type Recorded = (key: string, value: number, attributes: Record<string, string>) => void;
type RuntimeMetricsTarget = Readonly<{ count: Recorded; record: Recorded; setGauge: (...args: never[]) => void }>;
/**
 * Spies on the runtime instruments; with a target, every call also reaches the real instruments.
 *
 * @param target - The real service the calls pass through to, when a test reads the exporter.
 * @returns The spies.
 */
const createMetricsSpy = (target?: RuntimeMetricsTarget) => ({
  count: vi.fn<Recorded>((key, value, attributes) => target?.count(key, value, attributes)),
  record: vi.fn<Recorded>((key, value, attributes) => target?.record(key, value, attributes)),
  setGauge: vi.fn(),
});
const legacyMetrics = () => ({
  kernelExecutionDuration: { record: vi.fn() },
  kernelExecutions: { add: vi.fn() },
});

type Harness = Awaited<ReturnType<typeof createApp>>;
const apps: NestFastifyApplication[] = [];

const createApp = async (environment: Record<string, unknown> = {}, target?: RuntimeMetricsTarget) => {
  const redis = new FakeRedis();
  const runtimeMetrics = createMetricsSpy(target);
  const metrics = legacyMetrics();
  const logger = { info: vi.fn(), warn: vi.fn() };
  const auth = mockDeep<Auth>();
  auth.api.getSession.mockImplementation(async (context) => {
    const user = new Headers(context?.headers).get('x-test-user');
    return user === null ? null : mock<Session>({ user: { id: user } });
  });
  const values: Record<string, unknown> = {
    TAU_RUNTIME_TELEMETRY: 'on',
    TAU_VIEW_COOKIE_SECRET: 'x'.repeat(32),
    TAU_FRONTEND_URL: 'http://ui.invalid',
    TAU_RUNTIME_RELEASES: '1.4.0,1.3.0',
    ...environment,
  };
  const module = await Test.createTestingModule({
    controllers: [TelemetryController],
    providers: [
      Reflector,
      AuthGuard,
      RuntimeIngestService,
      PublicationRateLimiterService,
      { provide: authInstanceKey, useValue: auth },
      { provide: MetricsService, useValue: metrics },
      { provide: RuntimeMetricsService, useValue: runtimeMetrics },
      { provide: RedisService, useValue: { client: redis } },
      { provide: ConfigService, useValue: { get: (key: string) => values[key] } },
      { provide: getLoggerToken(RuntimeIngestService.name), useValue: logger },
    ],
  }).compile();
  const app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  app.useGlobalPipes(new ZodValidationPipe());
  app.useGlobalFilters(new HttpExceptionFilter());
  app.enableVersioning({ type: VersioningType.URI });
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  apps.push(app);
  const service = module.get(RuntimeIngestService);
  return { app, redis, runtimeMetrics, metrics, logger, service };
};

let sequence = 0;
const batchId = (): string => (sequence++).toString(16).padStart(32, '0');
const operation = (detail: Record<string, unknown> = {}, duration = 500) => ({
  name: RuntimeEntryName.OPERATION,
  duration,
  detail: {
    operation: 'render',
    outcome: 'succeeded',
    kernel: 'replicad',
    route: 'browser',
    caller: 'editor',
    transport: 'web-worker',
    release: '0123abc',
    ...detail,
  },
});
const post = async (
  harness: Harness,
  body: Record<string, unknown>,
  options: Readonly<{ user?: string; ip?: string; headers?: Record<string, string> }> = {},
) =>
  harness.app.inject({
    method: 'POST',
    url: '/v1/telemetry/ingest',
    remoteAddress: options.ip ?? '198.51.100.7',
    headers: {
      'content-type': 'application/json',
      ...(options.user === undefined ? {} : { 'x-test-user': options.user }),
      ...options.headers,
    },
    payload: body,
  });
const counted = (harness: Harness, key: string) =>
  harness.runtimeMetrics.count.mock.calls
    .filter(([name]) => name === key)
    .map(([, value, attributes]) => ({ value, attributes }));
const dispositions = (harness: Harness) =>
  Object.fromEntries(
    counted(harness, 'telemetryIngestEntries').map(({ value, attributes }) => [
      `${(attributes as { disposition: string }).disposition}`,
      value,
    ]),
  );

beforeAll(() => {
  Logger.overrideLogger(false);
});
beforeEach(() => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 404 }));
});
afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  await Promise.all(apps.splice(0).map(async (app) => app.close()));
});

describe('GET /v1/telemetry/policy', () => {
  it('should answer on with a 15-minute cache where the deployment records', async () => {
    const harness = await createApp();
    const response = await harness.app.inject({ method: 'GET', url: '/v1/telemetry/policy' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ policy: 'on', maxAge: 900 });
    expect(response.headers['cache-control']).toBe('max-age=900');
    expect(harness.runtimeMetrics.count).toHaveBeenCalledWith('telemetryPolicyProbes', 1, { answer: 'on' });
  });

  it('should answer off for a day when unset, and honour a configured max age', async () => {
    const unset = await createApp({ TAU_RUNTIME_TELEMETRY: undefined });
    const unsetPolicy = await unset.app.inject({ method: 'GET', url: '/v1/telemetry/policy' });
    expect(unsetPolicy.json()).toEqual({
      policy: 'off',
      maxAge: 86_400,
    });
    const short = await createApp({ TAU_RUNTIME_TELEMETRY: 'off', TAU_RUNTIME_TELEMETRY_MAX_AGE: 900 });
    const shortPolicy = await short.app.inject({ method: 'GET', url: '/v1/telemetry/policy' });
    expect(shortPolicy.json()).toEqual({
      policy: 'off',
      maxAge: 900,
    });
  });

  it('should resolve a pause to on after its time', async () => {
    const harness = await createApp({ TAU_RUNTIME_TELEMETRY: 'paused-until:2000-01-01T00:00:00Z' });
    const probedPolicy = await harness.app.inject({ method: 'GET', url: '/v1/telemetry/policy' });
    expect(probedPolicy.json()).toMatchObject({
      policy: 'on',
    });
  });

  it('should export the enabled gauge', async () => {
    const off = await createApp({ TAU_RUNTIME_TELEMETRY: 'off' });
    expect(off.runtimeMetrics.setGauge).toHaveBeenCalledWith('telemetryRuntimeEnabled', [{ value: 0, attributes: {} }]);
    const on = await createApp();
    expect(on.runtimeMetrics.setGauge).toHaveBeenCalledWith('telemetryRuntimeEnabled', [{ value: 1, attributes: {} }]);
  });
});

describe('POST /v1/telemetry/ingest (T10)', () => {
  it('should keep a legacy batch exactly as today: 204, recorded signed in only, no Redis', async () => {
    const harness = await createApp();
    const legacy = { name: IngestEntryName.KERNEL_CREATE_GEOMETRY, duration: 1500, detail: { status: 'ok' } };
    const signedOutLegacy = await post(harness, { entries: [legacy] });
    expect(signedOutLegacy.statusCode).toBe(204);
    expect(harness.metrics.kernelExecutions.add).not.toHaveBeenCalled();
    const signedInLegacy = await post(harness, { entries: [legacy] }, { user: 'user-1' });
    expect(signedInLegacy.statusCode).toBe(204);
    expect(harness.metrics.kernelExecutions.add).toHaveBeenCalledTimes(1);
    expect(harness.redis.commands).toEqual([]);
  });

  it('should record legacy entries as today and answer disabled for runtime entries when off (AR-W5-09)', async () => {
    const harness = await createApp({ TAU_RUNTIME_TELEMETRY: 'off' });
    const legacy = { name: IngestEntryName.KERNEL_CREATE_GEOMETRY, duration: 1500, detail: { status: 'ok' } };
    const response = await post(
      harness,
      { batch: batchId(), entries: [legacy, operation(), operation()] },
      { user: 'user-1' },
    );
    expect(response.statusCode).toBe(200);
    expect(ingestReceiptSchema.parse(response.json())).toEqual({
      recorded: 0,
      rejected: 0,
      duplicate: 0,
      disabled: 2,
      policy: 'off',
    });
    expect(harness.metrics.kernelExecutions.add).toHaveBeenCalledTimes(1);
    expect(harness.redis.commands).toEqual([]);
    expect(counted(harness, 'runtimeOperations')).toEqual([]);
  });

  it('should record a valid batch once and answer a receipt', async () => {
    const harness = await createApp();
    const response = await post(harness, { batch: batchId(), entries: [operation()] }, { user: 'user-1' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ recorded: 1, rejected: 0, duplicate: 0, disabled: 0, policy: 'on' });
    expect(harness.runtimeMetrics.count).toHaveBeenCalledWith('runtimeOperations', 1, {
      'tau.runtime.operation': 'render',
      'tau.runtime.outcome': 'succeeded',
      'tau.runtime.cause': 'none',
      'kernel.id': 'replicad',
      'tau.runtime.population': 'signed-in',
    });
    expect(harness.runtimeMetrics.count).toHaveBeenCalledWith('runtimeKernelUsage', 1, {
      'kernel.id': 'replicad',
      'tau.runtime.route': 'browser',
      'tau.runtime.caller': 'editor',
      'tau.runtime.population': 'signed-in',
    });
    expect(harness.runtimeMetrics.count).toHaveBeenCalledWith('runtimeOperationsByHost', 1, {
      'tau.runtime.route': 'browser',
      'tau.runtime.platform': '_OTHER',
      'tau.runtime.os': '_OTHER',
      'tau.runtime.population': 'signed-in',
    });
    expect(harness.redis.keys('telemetry:hll:').length).toBeGreaterThan(0);
  });

  it('should refuse an oversized body with 413 and never touch Redis', async () => {
    const harness = await createApp();
    const tooMany = await post(harness, { batch: batchId(), entries: Array.from({ length: 257 }, () => operation()) });
    expect(tooMany.statusCode).toBe(413);
    const tooLarge = await post(
      harness,
      { batch: batchId(), entries: [operation()] },
      { headers: { 'content-length': String(70_000) } },
    ).catch(() => undefined);
    expect(tooLarge === undefined || tooLarge.statusCode === 413 || tooLarge.statusCode === 400).toBe(true);
    expect(harness.redis.commands).toEqual([]);
  });

  it('should reject forged values entry by entry, and close forged enums without recording the string', async () => {
    const harness = await createApp();
    const response = await post(harness, {
      batch: batchId(),
      entries: [
        operation({ population: 'signed-in' }),
        operation({
          operation: 'evaluate',
          worker: {
            queue: 1,
            execution: 1,
            cold: false,
            reuse: 'cache',
            parameters: { declared: 1, modified: 0, names: ['secret'] },
          },
        }),
        operation({ outcome: 'succeeded', count: 400 }),
        operation({ worker: { queue: 1, execution: 1, cold: false, reuse: 'cache', triangles: 2e9 } }),
        operation({ operation: 'machine', machineKind: 'action', machineAction: 'run.pause' }),
        operation({
          operation: 'export',
          format: 'my-secret-part.step',
          outcome: 'issue',
          code: 'E'.repeat(40),
          kernel: '/home/user',
        }),
      ],
    });
    expect(response.json()).toMatchObject({ recorded: 1, rejected: 5 });
    expect(harness.runtimeMetrics.count).toHaveBeenCalledWith('runtimeOperations', 1, {
      'tau.runtime.operation': 'export',
      'tau.runtime.outcome': 'issue',
      'tau.runtime.cause': 'implementation',
      'kernel.id': '_OTHER',
      'tau.runtime.population': 'signed-out',
    });
    const serialized = JSON.stringify([harness.runtimeMetrics.count.mock.calls, harness.logger.warn.mock.calls]);
    expect(serialized).not.toContain('my-secret-part');
    expect(serialized).not.toContain('/home/user');
    expect(serialized).not.toContain('198.51.100.7');
    expect(dispositions(harness)).toMatchObject({ recorded: 1, 'rejected-invalid': 5 });
  });

  it('should key signed-out batches by day and network: one IPv4, one IPv6 /64, never the viewer hash', async () => {
    expect(networkOf('2001:db8:aa:bb:1:2:3:4')).toBe('2001:db8:aa:bb::/64');
    expect(networkOf('2001:db8:aa:bb::9')).toBe('2001:db8:aa:bb::/64');
    expect(networkOf('::ffff:198.51.100.7')).toBe('198.51.100.7');
    expect(networkOf('198.51.100.7')).toBe('198.51.100.7');
    const harness = await createApp();
    for (let index = 0; index < runtimeIngestLimits.batchesSignedOut; index += 1) {
      // eslint-disable-next-line no-await-in-loop -- the flood is sequential on purpose
      await post(
        harness,
        { batch: batchId(), entries: [operation()] },
        { ip: `2001:db8:aa:bb::${index.toString(16)}` },
      );
    }
    const refused = await post(harness, { batch: batchId(), entries: [operation()] }, { ip: '2001:db8:aa:bb::ffff' });
    expect(refused.statusCode).toBe(429);
    expect(refused.headers['retry-after']).toBeDefined();
    const other = await post(harness, { batch: batchId(), entries: [operation()] }, { ip: '203.0.113.9' });
    expect(other.statusCode).toBe(200);
    const keys = harness.redis.keys('telemetry:rl:batch:');
    expect(keys.some((key) => key.includes('198.51.100.7') || key.includes('2001:db8'))).toBe(false);
  });

  it('should cap the whole signed-out population per app', async () => {
    const harness = await createApp();
    harness.redis.down = false;
    const window = Math.floor(Date.now() / 1000 / 60);
    await harness.redis.eval(
      '',
      1,
      `telemetry:rl:entries:signed-out:w60:${String(window)}`,
      '60',
      String(runtimeIngestLimits.entriesSignedOutGlobal),
    );
    const response = await post(harness, { batch: batchId(), entries: [operation()] }, { ip: '203.0.113.50' });
    expect(response.statusCode).toBe(429);
  });

  it('should admit only configured or polled releases, once per distinct release', async () => {
    const harness = await createApp();
    await post(harness, {
      batch: batchId(),
      entries: [operation({ release: '1.4.0' }), operation({ release: '1.4.0' }), operation({ release: 'deadbee' })],
    });
    const releases = counted(harness, 'runtimeOperationsByRelease').map(
      ({ attributes }) => (attributes as { 'tau.release': string })['tau.release'],
    );
    expect(releases).toEqual(['1.4.0', '1.4.0', '_OTHER']);
    expect(harness.redis.commands.filter((command) => command === 'lrange')).toHaveLength(1);
  });

  it('should keep the last five UI releases from the frontend manifest', async () => {
    const harness = await createApp();
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(Response.json({ release: 'cafe123' }));
    await harness.service.pollUiRelease();
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(Response.json({ release: 'not a release' }));
    await harness.service.pollUiRelease();
    expect(harness.redis.value('telemetry:releases:ui')).toEqual(['cafe123']);
    await post(harness, { batch: batchId(), entries: [operation({ release: 'cafe123' })] });
    expect(counted(harness, 'runtimeOperationsByRelease')[0]?.attributes).toMatchObject({ 'tau.release': 'cafe123' });
  });

  it('should refuse machine entries from browser routes and record them from a Node machine host', async () => {
    const harness = await createApp();
    const response = await post(
      harness,
      {
        batch: batchId(),
        entries: [
          operation({
            operation: 'machine',
            kernel: undefined,
            machineKind: 'action',
            machineAction: 'run.pause',
            plugin: 'grbl',
          }),
          operation({
            operation: 'machine',
            kernel: undefined,
            route: 'daemon',
            machineKind: 'action',
            machineAction: 'run.pause',
            plugin: 'grbl',
          }),
          operation({
            operation: 'machine',
            kernel: undefined,
            route: 'desktop',
            machineKind: 'stop',
            plugin: 'bambu',
          }),
        ],
      },
      { user: 'user-1' },
    );
    expect(response.json()).toMatchObject({ recorded: 2, rejected: 1 });
    expect(counted(harness, 'runtimeMachineOperations').map(({ attributes }) => attributes)).toEqual([
      expect.objectContaining({ 'tau.runtime.machine_action': 'run.pause', 'tau.runtime.plugin': 'grbl' }),
      expect.objectContaining({ 'tau.runtime.machine_kind': 'stop', 'tau.runtime.machine_action': 'none' }),
    ]);
    expect(counted(harness, 'runtimeKernelUsage')).toEqual([]);
  });

  it('should record every product facet, plugin usage and health entry', async () => {
    const harness = await createApp();
    const worker = {
      queue: 5,
      execution: 100,
      cold: true,
      reuse: 'computed',
      heapBytes: 2 ** 28,
      heapSource: 'kernel',
      triangles: 20_000,
      phases: { compute: 50, mesh: 20 },
      middleware: { total: 4, slowestId: 'ParameterCache', slowest: 3, ran: ['ParameterCache', 'GeometryCache'] },
      bundler: 'esbuild',
    };
    const response = await post(
      harness,
      {
        batch: batchId(),
        entries: [
          operation({ worker, platform: 'chromium', os: 'linux', adaptations: ['TESSELLATION_DOWNGRADED'] }),
          operation({
            operation: 'evaluate',
            entryFormat: 'ts',
            worker: {
              queue: 0,
              execution: 1,
              cold: false,
              reuse: 'cache',
              parameters: { declared: 4, modified: 1, features: ['units'] },
            },
          }),
          operation({
            operation: 'transcode',
            kernel: undefined,
            plugin: 'assimp',
            sourceFormat: 'glb',
            format: 'gltf',
          }),
          operation({
            operation: 'transcode',
            kernel: undefined,
            plugin: 'assimp',
            sourceFormat: 'stl',
            format: 'webp',
            outcome: 'failed',
            code: 'TRANSCODER_EXECUTION_FAILED',
          }),
          operation({
            operation: 'export',
            format: 'stl',
            outcome: 'issue',
            code: 'RESOURCE_LIMIT',
            limit: {
              id: 'occt.export.triangles',
              unit: '{triangle}',
              maximum: 10,
              demand: { kind: 'measured', value: 15 },
              origin: 'default',
            },
          }),
          operation({ operation: 'verify', kernel: 'replicad', verify: { selected: 3, passed: 2, failed: 1 } }),
          operation({ operation: 'job', kernel: undefined, outcome: 'attention', plugin: 'tau.calculix.container' }),
          operation({ outcome: 'superseded', count: 7 }),
          operation({ factsMissing: 'missing-worker-gone', operation: 'export', format: 'glb', plugin: 'assimp' }),
          {
            name: RuntimeEntryName.LATE,
            duration: 2000,
            detail: { operation: 'render', settledAs: 'timed-out', route: 'browser', caller: 'editor' },
          },
          {
            name: RuntimeEntryName.VIEWER,
            duration: 120,
            detail: { event: 'first-frame', backend: 'webgl', route: 'browser', release: '0123abc', triangles: 50_000 },
          },
          {
            name: RuntimeEntryName.VIEWER,
            duration: 0,
            detail: {
              event: 'download',
              backend: 'webgpu',
              route: 'browser',
              release: '0123abc',
              format: 'stl',
              device: 'standard',
            },
          },
          {
            name: RuntimeEntryName.DELIVERY,
            duration: 0,
            detail: {
              route: 'browser',
              oldest: 4000,
              dropped: { 'queue-full': 2, bogus: 1, expired: 0 },
              spansDropped: 3,
            },
          },
        ],
      },
      { user: 'user-1' },
    );
    expect(response.json()).toMatchObject({ recorded: 13, rejected: 0 });
    const names = new Set(harness.runtimeMetrics.count.mock.calls.map(([name]) => name));
    const histograms = new Set(harness.runtimeMetrics.record.mock.calls.map(([name]) => name));
    for (const name of [
      'runtimeOperations',
      'runtimeOperationErrors',
      'runtimeOperationsByRelease',
      'runtimeOperationsByCaller',
      'runtimeOperationsByHost',
      'runtimeOperationsByTransport',
      'runtimeKernelUsage',
      'runtimeAdaptations',
      'runtimeReuse',
      'runtimePluginOperations',
      'runtimeJobAttention',
      'runtimeExports',
      'runtimeTranscodeFormats',
      'runtimeEntryFormats',
      'runtimeParameterEvaluations',
      'runtimeParameterFeatures',
      'runtimeCapacityRefusals',
      'runtimeFactsMissing',
      'runtimeLateTerminals',
      'runtimeViewerEvents',
      'telemetryClientDropped',
      'telemetrySpansDropped',
    ]) {
      expect(names, name).toContain(name);
    }
    for (const name of [
      'runtimeOperationDuration',
      'runtimeCohortDuration',
      'runtimeOperationQueue',
      'runtimePhaseDuration',
      'runtimeMiddlewareDuration',
      'runtimeVerifyTests',
      'runtimeViewerFirstFrame',
      'runtimeKernelHeap',
      'runtimeParametersDeclared',
      'runtimeRenderBySize',
      'runtimeCapacityDemandRatio',
      'telemetryDeliveryDelay',
    ]) {
      expect(histograms, name).toContain(name);
    }
    const pairs = counted(harness, 'runtimeTranscodeFormats').map(({ attributes }) => attributes);
    expect(pairs).toEqual([
      expect.objectContaining({
        'tau.runtime.source_format': 'glb',
        'tau.runtime.format': 'gltf',
        'tau.runtime.failed': false,
      }),
      expect.objectContaining({
        'tau.runtime.source_format': '_OTHER',
        'tau.runtime.format': '_OTHER',
        'tau.runtime.failed': true,
      }),
    ]);
    const plugins = counted(harness, 'runtimePluginOperations').map(({ attributes }) => attributes);
    expect(
      plugins.map((attributes) => `${attributes['tau.runtime.capability']}:${attributes['tau.runtime.plugin']}`),
    ).toEqual(
      expect.arrayContaining([
        'middleware:ParameterCache',
        'middleware:GeometryCache',
        'bundler:esbuild',
        'transcoder:assimp',
      ]),
    );
    const superseded: unknown = expect.objectContaining({
      'tau.runtime.outcome': 'superseded',
      'tau.runtime.cause': 'cancelled',
    });
    expect(counted(harness, 'runtimeOperations')).toContainEqual({ value: 7, attributes: superseded });
    expect(
      counted(harness, 'runtimeOperations').some(({ attributes }) => attributes['tau.runtime.outcome'] === 'attention'),
    ).toBe(false);
    expect(
      counted(harness, 'telemetryClientDropped').map(({ value, attributes }) => [
        value,
        (attributes as { reason: string }).reason,
      ]),
    ).toEqual([
      [2, 'queue-full'],
      [1, '_OTHER'],
    ]);
    expect(harness.logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'runtime.operation', outcome: 'failed', code: 'TRANSCODER_EXECUTION_FAILED' }),
      'runtime.operation',
    );
    expect(harness.logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'superseded' }),
      'runtime.operation',
    );
    await harness.service.refreshGauges();
    const principals = harness.runtimeMetrics.setGauge.mock.calls.find(
      ([name]) => name === 'runtimeActivePrincipals',
    )?.[1] as Array<{
      value: number;
      attributes: Record<string, string>;
    }>;
    expect(principals).toContainEqual({ value: 1, attributes: { 'kernel.id': 'replicad', 'tau.runtime.set': 'any' } });
    expect(principals).toContainEqual({ value: 1, attributes: { 'kernel.id': '_ALL', 'tau.runtime.set': 'failed' } });
    const pluginPrincipals = harness.runtimeMetrics.setGauge.mock.calls.find(
      ([name]) => name === 'runtimeActivePluginPrincipals',
    )?.[1] as Array<{
      value: number;
      attributes: Record<string, string>;
    }>;
    expect(pluginPrincipals).toContainEqual({
      value: 1,
      attributes: { 'tau.runtime.plugin': 'assimp', 'tau.runtime.set': 'failed' },
    });
  });

  it('should read every registry transcoder and job provider back from the exporter as its own usage series (T36)', async () => {
    const exporter = new PrometheusExporter({ preventServerStart: true });
    const provider = new sdkMetrics.MeterProvider({ readers: [exporter] });
    otelMetrics.setGlobalMeterProvider(provider);
    try {
      const harness = await createApp({}, new RuntimeMetricsService() as unknown as RuntimeMetricsTarget);
      const fixtures = [
        ...transcoderIds.map((plugin) => ({ plugin, capability: 'transcoder', operation: 'transcode' })),
        ...jobProviderIds.map((plugin) => ({ plugin, capability: 'job', operation: 'job' })),
      ];
      const response = await post(
        harness,
        {
          batch: batchId(),
          entries: fixtures.map(({ plugin, operation: kind }) =>
            operation({ operation: kind, kernel: undefined, plugin }),
          ),
        },
        { user: 'user-1' },
      );
      expect(response.json()).toMatchObject({ recorded: fixtures.length, rejected: 0 });
      const body = await new Promise<string>((resolve) => {
        const scrape = { statusCode: 0, setHeader: () => scrape, end: resolve };
        exporter.getMetricsRequestHandler({} as IncomingMessage, scrape as unknown as ServerResponse);
      });
      const series = [
        ...body.matchAll(/^tau_runtime_plugin_operations_total\{(?<labels>[^}]*)\} (?<value>\S+)/gmu),
      ].map(({ groups }) => ({ labels: groups!['labels']!, value: Number(groups!['value']) }));
      for (const { plugin, capability } of fixtures) {
        const own = series.filter(
          ({ labels }) =>
            labels.includes(`tau_runtime_plugin="${plugin}"`) &&
            labels.includes(`tau_runtime_capability="${capability}"`),
        );
        expect(
          own.map(({ value }) => value),
          plugin,
        ).toEqual([1]);
      }
      expect(series.some(({ labels }) => labels.includes('tau_runtime_plugin="_OTHER"'))).toBe(false);
    } finally {
      await provider.shutdown();
      otelMetrics.disable();
    }
  });

  it('should log at most 60 failure events per key per minute and count the rest as overflow', async () => {
    const harness = await createApp();
    const failures = Array.from({ length: 70 }, () => operation({ outcome: 'failed', code: 'UNKNOWN' }));
    await post(harness, { batch: batchId(), entries: failures }, { user: 'user-1' });
    expect(harness.logger.warn).toHaveBeenCalledTimes(runtimeIngestLimits.eventsPerKey);
    expect(dispositions(harness)).toMatchObject({ overflow: 1 });
  });
});

describe('dedupe, budget and fail-open (T29)', () => {
  it('should refuse a malformed batch id with 400 before Redis', async () => {
    const harness = await createApp();
    for (const batch of [undefined, 'Z'.repeat(32), '0'.repeat(31)]) {
      // eslint-disable-next-line no-await-in-loop -- sequential cases
      const response = await post(harness, { ...(batch === undefined ? {} : { batch }), entries: [operation()] });
      expect(response.statusCode).toBe(400);
    }
    expect(harness.redis.commands).toEqual([]);
  });

  it('should stop a flood of fresh ids at the batch limiter with no SETNX beyond it', async () => {
    const harness = await createApp();
    for (let index = 0; index < runtimeIngestLimits.batchesSignedIn + 5; index += 1) {
      // eslint-disable-next-line no-await-in-loop -- the flood is sequential on purpose
      await post(harness, { batch: batchId(), entries: [operation()] }, { user: 'flooder' });
    }
    expect(harness.redis.keys('telemetry:batch:')).toHaveLength(runtimeIngestLimits.batchesSignedIn);
  });

  it('should answer the same batch id duplicate without spending budget, across a sign-in and a new address', async () => {
    const harness = await createApp();
    const batch = batchId();
    const body = { batch, entries: [operation()] };
    const firstReply = await post(harness, body);
    expect(firstReply.json()).toMatchObject({ recorded: 1 });
    const budgetWrites = harness.redis.commands.filter((command) => command.includes('rl:entries')).length;
    const retry = await post(harness, body, { user: 'user-1', ip: '203.0.113.200' });
    expect(retry.statusCode).toBe(200);
    expect(retry.json()).toMatchObject({ recorded: 0, duplicate: 1 });
    expect(harness.redis.commands.filter((command) => command.includes('rl:entries')).length).toBe(budgetWrites);
  });

  it('should answer 425 while the first copy is in flight, and record the retry once after the key expires', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const harness = await createApp();
    const batch = batchId();
    await harness.redis.set(`telemetry:batch:${batch}`, 'in-flight', 'EX', runtimeIngestLimits.inFlightSeconds, 'NX');
    const inFlight = await post(harness, { batch, entries: [operation()] });
    expect(inFlight.statusCode).toBe(425);
    expect(inFlight.headers['retry-after']).toBe('2');
    vi.setSystemTime(Date.now() + runtimeIngestLimits.inFlightSeconds * 1000 + 1);
    const retry = await post(harness, { batch, entries: [operation()] });
    expect(retry.json()).toMatchObject({ recorded: 1 });
    expect(harness.redis.value(`telemetry:batch:${batch}`)).toBe('recorded');
  });

  it('should release the key on a budget refusal so the retry after Retry-After is recorded', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const harness = await createApp();
    const big = Array.from({ length: runtimeIngestLimits.entriesSignedOut + 1 }, () => operation());
    const batch = batchId();
    const refused = await post(harness, { batch, entries: big.slice(0, 200) });
    expect(refused.statusCode).toBe(429);
    expect(harness.redis.value(`telemetry:batch:${batch}`)).toBeUndefined();
    vi.setSystemTime(Date.now() + Number(refused.headers['retry-after']) * 1000);
    const retry = await post(harness, { batch, entries: big.slice(0, 100) });
    expect(retry.json()).toMatchObject({ recorded: 100 });
  });

  it('should release the key on a throw before the first record and mark it recorded after one', async () => {
    const harness = await createApp();
    const early = batchId();
    harness.runtimeMetrics.count.mockImplementationOnce(() => {
      throw new Error('exporter fault');
    });
    const failedReply = await post(harness, { batch: early, entries: [operation()] });
    expect(failedReply.statusCode).toBe(500);
    expect(harness.redis.value(`telemetry:batch:${early}`)).toBeUndefined();
    const retriedReply = await post(harness, { batch: early, entries: [operation()] });
    expect(retriedReply.json()).toMatchObject({ recorded: 1 });

    const late = batchId();
    let calls = 0;
    harness.runtimeMetrics.count.mockImplementation((name: string) => {
      calls += 1;
      if (name === 'runtimeOperations' && calls > 1) {
        throw new Error('exporter fault');
      }
    });
    harness.runtimeMetrics.record.mockImplementationOnce(() => undefined);
    const partial = await post(harness, { batch: late, entries: [operation(), operation()] });
    expect(partial.statusCode).toBe(500);
    expect(harness.runtimeMetrics.count).toHaveBeenCalledWith('telemetryIngestPartial', 1, {});
    harness.runtimeMetrics.count.mockReset();
    const partialReply = await post(harness, { batch: late, entries: [operation(), operation()] });
    expect(partialReply.json()).toMatchObject({
      duplicate: 2,
    });
  });

  it('should record without dedupe or budget when Redis is down, counted, never a 5xx', async () => {
    const harness = await createApp();
    harness.redis.down = true;
    const response = await post(harness, { batch: batchId(), entries: [operation()] }, { user: 'user-1' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ recorded: 1 });
    const checks = counted(harness, 'telemetryIngestUnavailable').map(
      ({ attributes }) => (attributes as { check: string }).check,
    );
    expect(checks).toContain('budget');
    expect(checks).toContain('dedupe');
    await harness.service.refreshGauges();
  });
});
