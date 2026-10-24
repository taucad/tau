/**
 * The runtime half of `POST /v1/telemetry/ingest` and the policy probe (Runtime Observability package §3–§4, design
 * `ingest.ts`): gate → body bound → batch id → batch-rate limiter → in-flight dedupe → entry budget → record → mark
 * recorded. Everything recorded is a closed vocabulary or a bucketed number; the abuse key, the batch id and the
 * principal never become a label or a log field.
 */
import { createHmac } from 'node:crypto';
import { isIPv4, isIPv6 } from 'node:net';
import { Injectable } from '@nestjs/common';
import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import {
  RuntimeEntryName,
  absentLabel,
  admittedReleaseLimit,
  capabilityOf,
  causeOf,
  conversionPairOf,
  ingestBodyBounds,
  otherValue,
  parameterClassOf,
  parseRuntimeEntry,
  parseRuntimeTelemetryMode,
  pluginUsageIds,
  policyMaxAgeBounds,
  releasePattern,
  resolveRuntimeTelemetry,
  runtimeKernelIds,
  runtimeVocabulary,
  sizeClassOf,
} from '@taucad/telemetry';
import type {
  DeliveryHealthRecord,
  IngestReceipt,
  PluginUsageId,
  RuntimeEntryRecord,
  RuntimeLateRecord,
  RuntimeOperationRecord,
  RuntimeTelemetryMode,
  RuntimeViewerRecord,
  TelemetryPolicyAnswer,
} from '@taucad/telemetry';
import type { Environment } from '#config/environment.config.js';
import { PublicationRateLimiterService } from '#api/publications/publication-rate-limiter.service.js';
import { RedisService } from '#redis/redis.service.js';
import { RuntimeMetricsService } from '#api/telemetry/runtime-metrics.service.js';

type Population = 'signed-in' | 'signed-out';
type Disposition =
  | 'recorded'
  | 'rejected-invalid'
  | 'rejected-rate-limit'
  | 'rejected-unknown-entry'
  | 'duplicate'
  | 'disabled'
  | 'overflow';

/** What the route answers: a status, the receipt, and a `Retry-After` in seconds when the client should retry. */
export type RuntimeIngestResult = Readonly<{
  status: 200 | 400 | 413 | 425 | 429;
  receipt: IngestReceipt;
  retryAfterSeconds?: number;
}>;

/** One runtime ingest request. */
export type RuntimeIngestRequest = Readonly<{
  batch: string | undefined;
  entries: readonly unknown[];
  principal: string | undefined;
  ip: string;
  bodyBytes: number;
  now: Date;
}>;

/** Abuse-control limits (package §4.2, design `ingest.ts`). */
export const runtimeIngestLimits = {
  /** Batches per minute per signed-in principal. */
  batchesSignedIn: 60,
  /** Batches per minute per signed-out key. */
  batchesSignedOut: 20,
  /** Entries per minute per signed-in principal. */
  entriesSignedIn: 600,
  /** Entries per minute per signed-out key. */
  entriesSignedOut: 120,
  /** Entries per minute for every signed-out key together, per API app. */
  entriesSignedOutGlobal: 20_000,
  /** Seconds a first copy is held in flight. */
  inFlightSeconds: 10,
  /** Seconds a recorded batch id is remembered. */
  recordedSeconds: 900,
  /** Seconds a 425 asks the client to wait. */
  inFlightRetrySeconds: 2,
  /** Seconds a day's HyperLogLog set lives. */
  principalSetSeconds: 48 * 60 * 60,
  /** Loki events per abuse key per minute; the rest count as `overflow`. */
  eventsPerKey: 60,
  /** Last UI releases kept. */
  uiReleases: 5,
} as const;

/** Milliseconds between principal-gauge refreshes. */
const gaugeRefreshInterval = 60_000;
/** Milliseconds an admitted-release set is reused. */
const releaseCacheLifetime = 60_000;
/** Milliseconds between UI release polls. */
const releasePollInterval = 5 * 60_000;
/** Milliseconds a release poll may take. */
const releasePollTimeout = 5000;
const uiReleasesKey = 'telemetry:releases:ui';
const mergedOutcomes: ReadonlySet<string> = new Set(['superseded', 'cancelled', 'abandoned']);
const principalSets = ['any', 'failed'] as const;
const kernelSetIds = [...runtimeKernelIds, '_ALL'] as const;

/**
 * The IPv4 address, or the /64 prefix of an IPv6 address, so rotating interface ids inside one network share one key.
 *
 * @param ip - The request's address.
 * @returns The network.
 */
export const networkOf = (ip: string): string => {
  const mapped = /^::ffff:(?<v4>\d+\.\d+\.\d+\.\d+)$/iu.exec(ip)?.groups?.['v4'];
  if (mapped !== undefined) {
    return mapped;
  }
  if (isIPv4(ip) || !isIPv6(ip)) {
    return ip;
  }
  const [head = '', tail = ''] = ip.toLowerCase().split('::');
  const headParts = head === '' ? [] : head.split(':');
  const tailParts = tail === '' ? [] : tail.split(':');
  const hextets = ip.includes('::')
    ? [...headParts, ...Array.from({ length: 8 - headParts.length - tailParts.length }, () => '0'), ...tailParts]
    : headParts;
  return `${hextets
    .slice(0, 4)
    .map((part) => Number.parseInt(part, 16).toString(16))
    .join(':')}::/64`;
};

@Injectable()
export class RuntimeIngestService implements OnModuleInit, OnModuleDestroy {
  private readonly mode: RuntimeTelemetryMode;
  private readonly maxAge: number | undefined;
  private readonly configuredReleases: readonly string[];
  private admitted: { releases: ReadonlySet<string>; at: number } | undefined;
  private readonly events = new Map<string, number>();
  private eventsWindow = 0;
  private gaugeTimer: ReturnType<typeof setInterval> | undefined;
  private releaseTimer: ReturnType<typeof setInterval> | undefined;

  public constructor(
    private readonly configService: ConfigService<Environment, true>,
    private readonly redisService: RedisService,
    private readonly rateLimiter: PublicationRateLimiterService,
    private readonly runtimeMetrics: RuntimeMetricsService,
    // oxlint-disable-next-line new-cap -- @InjectPinoLogger is a Nest decorator factory, not a constructor
    @InjectPinoLogger(RuntimeIngestService.name) private readonly logger: PinoLogger,
  ) {
    this.mode = parseRuntimeTelemetryMode(this.configService.get('TAU_RUNTIME_TELEMETRY', { infer: true }));
    this.maxAge = this.configService.get('TAU_RUNTIME_TELEMETRY_MAX_AGE', { infer: true });
    this.configuredReleases = (this.configService.get('TAU_RUNTIME_RELEASES', { infer: true }) ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter((value) => releasePattern.test(value));
    this.refreshEnabledGauge();
  }

  public onModuleInit(): void {
    if (this.mode.mode === 'off') {
      return;
    }
    this.gaugeTimer = setInterval(() => {
      void this.refreshGauges();
    }, gaugeRefreshInterval);
    this.gaugeTimer.unref();
    this.releaseTimer = setInterval(() => {
      void this.pollUiRelease();
    }, releasePollInterval);
    this.releaseTimer.unref();
    void this.pollUiRelease();
  }

  public onModuleDestroy(): void {
    clearInterval(this.gaugeTimer);
    clearInterval(this.releaseTimer);
  }

  /**
   * Whether this deployment records runtime entries now.
   *
   * @param now - The current time.
   * @returns `on` or `off`.
   */
  public policyAt(now: Date): TelemetryPolicyAnswer['policy'] {
    return resolveRuntimeTelemetry(this.mode, now) ? 'on' : 'off';
  }

  /**
   * The entry-free policy probe's answer: `on` cached 15 minutes, `off` a day, unless configured.
   *
   * @param now - The current time.
   * @returns The answer.
   */
  public policy(now: Date): TelemetryPolicyAnswer {
    const policy = this.policyAt(now);
    this.runtimeMetrics.count('telemetryPolicyProbes', 1, { answer: policy });
    const fallback = policy === 'on' ? policyMaxAgeBounds.minimum : policyMaxAgeBounds.maximum;
    return { policy, maxAge: this.maxAge ?? fallback };
  }

  /**
   * Run one batch through the pipeline.
   *
   * @param input - The batch, the principal and the request facts.
   * @returns The status, the receipt and any `Retry-After`.
   */
  public async ingest(input: RuntimeIngestRequest): Promise<RuntimeIngestResult> {
    const total = input.entries.length;
    const policy = this.policyAt(input.now);
    const population: Population = input.principal === undefined ? 'signed-out' : 'signed-in';
    const none: IngestReceipt = { recorded: 0, rejected: 0, duplicate: 0, disabled: 0, policy };
    const answer = (
      status: RuntimeIngestResult['status'],
      disposition: Disposition,
      outcome: Partial<IngestReceipt> & Readonly<{ retryAfterSeconds?: number }>,
    ): RuntimeIngestResult => {
      const { retryAfterSeconds, ...receipt } = outcome;
      this.countEntries(disposition, total, population);
      return {
        status,
        receipt: { ...none, ...receipt },
        ...(retryAfterSeconds === undefined ? {} : { retryAfterSeconds }),
      };
    };
    if (policy === 'off') {
      return answer(200, 'disabled', { disabled: total });
    }
    if (total > ingestBodyBounds.maxEntries || input.bodyBytes > ingestBodyBounds.maxBytes) {
      return answer(413, 'rejected-invalid', { rejected: total });
    }
    if (input.batch === undefined || !ingestBodyBounds.batchId.test(input.batch)) {
      return answer(400, 'rejected-invalid', { rejected: total });
    }
    const key = this.abuseKey(input.principal, input.ip, input.now);
    const batchRate = await this.consume(
      `telemetry:rl:batch:${key}`,
      population === 'signed-in' ? runtimeIngestLimits.batchesSignedIn : runtimeIngestLimits.batchesSignedOut,
      1,
    );
    if (!batchRate.allowed) {
      return answer(429, 'rejected-rate-limit', { rejected: total, retryAfterSeconds: batchRate.retryAfterSeconds });
    }
    const delivery = await this.firstDelivery(input.batch);
    if (delivery === 'recorded') {
      return answer(200, 'duplicate', { duplicate: total });
    }
    if (delivery === 'in-flight') {
      return { status: 425, receipt: none, retryAfterSeconds: runtimeIngestLimits.inFlightRetrySeconds };
    }
    const dedupe = delivery === 'first';
    let recordedAny = false;
    try {
      const budget = await this.withinBudget(key, population, total);
      if (!budget.allowed) {
        if (dedupe) {
          await this.releaseDelivery(input.batch);
        }
        return answer(429, 'rejected-rate-limit', { rejected: total, retryAfterSeconds: budget.retryAfterSeconds });
      }
      const parsed = input.entries.map((entry) =>
        typeof entry === 'object' && entry !== null && 'name' in entry && typeof entry.name === 'string'
          ? parseRuntimeEntry(entry as { name: string })
          : undefined,
      );
      const valid = parsed.filter((entry): entry is RuntimeEntryRecord => entry !== undefined);
      const releases = await this.admittedReleases(valid, input.now);
      const members = new Map<string, Set<string>>();
      for (const entry of valid) {
        this.recordEntry(entry, { population, releases, members, principal: input.principal, key, now: input.now });
        recordedAny = true;
      }
      this.countEntries('recorded', valid.length, population);
      this.countEntries('rejected-invalid', total - valid.length, population);
      await this.addPrincipals(members);
      if (dedupe) {
        await this.markRecorded(input.batch);
      }
      return { status: 200, receipt: { ...none, recorded: valid.length, rejected: total - valid.length } };
    } catch (error) {
      /* AR-W16-05: release the key only while nothing landed; after the first write mark it recorded and count the partial. */
      if (recordedAny) {
        this.runtimeMetrics.count('telemetryIngestPartial', 1, {});
        if (dedupe) {
          await this.markRecorded(input.batch).catch(() => undefined);
        }
      } else if (dedupe) {
        await this.releaseDelivery(input.batch).catch(() => undefined);
      }
      throw error;
    }
  }

  /* ------------------------------------------------------------------------------------------- *
   * Abuse controls.                                                                             *
   * ------------------------------------------------------------------------------------------- */

  /** Read the UI's `/tau-release.json` and keep the last five distinct values in Redis, so every Machine agrees. */
  public async pollUiRelease(): Promise<void> {
    try {
      const url = new URL('/tau-release.json', this.configService.get('TAU_FRONTEND_URL', { infer: true }));
      const response = await fetch(url, { signal: AbortSignal.timeout(releasePollTimeout) });
      const body = response.ok ? ((await response.json()) as unknown) : undefined;
      const release =
        typeof body === 'object' && body !== null && 'release' in body && typeof body.release === 'string'
          ? body.release
          : undefined;
      if (release === undefined || !releasePattern.test(release)) {
        return;
      }
      const { client } = this.redisService;
      const [latest] = await client.lrange(uiReleasesKey, 0, 0);
      if (latest !== release) {
        await client.lrem(uiReleasesKey, 0, release);
        await client.lpush(uiReleasesKey, release);
        await client.ltrim(uiReleasesKey, 0, runtimeIngestLimits.uiReleases - 1);
        this.admitted = undefined;
      }
    } catch {
      /* A missing manifest or an unreachable UI leaves the admitted set as it was. */
    }
  }

  /** Refresh the enabled flag and today's distinct-principal estimates; called every minute while recording. */
  public async refreshGauges(now = new Date()): Promise<void> {
    this.refreshEnabledGauge();
    try {
      const { client } = this.redisService;
      const kernels = await Promise.all(
        kernelSetIds.flatMap((kernel) =>
          principalSets.map(async (set) => ({
            value: await client.pfcount(principalKey(now, { kind: 'kernel', id: kernel, set })),
            attributes: { 'kernel.id': kernel, 'tau.runtime.set': set },
          })),
        ),
      );
      const plugins = await Promise.all(
        pluginUsageIds.flatMap((plugin) =>
          principalSets.map(async (set) => ({
            value: await client.pfcount(principalKey(now, { kind: 'plugin', id: plugin, set })),
            attributes: { 'tau.runtime.plugin': plugin, 'tau.runtime.set': set },
          })),
        ),
      );
      this.runtimeMetrics.setGauge('runtimeActivePrincipals', kernels);
      this.runtimeMetrics.setGauge('runtimeActivePluginPrincipals', plugins);
    } catch {
      /* The gauges keep their last values while Redis is down. */
    }
  }

  private abuseKey(principal: string | undefined, ip: string, now: Date): string {
    if (principal !== undefined) {
      return `p:${principal}`;
    }
    const secret = this.configService.get('TAU_VIEW_COOKIE_SECRET', { infer: true });
    const day = now.toISOString().slice(0, 10);
    return `a:${createHmac('sha256', secret)
      .update(`telemetry:${day}:${networkOf(ip)}`)
      .digest('hex')}`;
  }

  private async consume(
    key: string,
    limit: number,
    count: number,
  ): Promise<Readonly<{ allowed: boolean; retryAfterSeconds: number }>> {
    try {
      return await this.rateLimiter.consumeWindowBudget({ key, limit, windowSeconds: 60, count });
    } catch {
      this.runtimeMetrics.count('telemetryIngestUnavailable', 1, { check: 'budget' });
      return { allowed: true, retryAfterSeconds: 0 };
    }
  }

  private async withinBudget(
    key: string,
    population: Population,
    entries: number,
  ): Promise<Readonly<{ allowed: boolean; retryAfterSeconds: number }>> {
    const own = await this.consume(
      `telemetry:rl:entries:${key}`,
      population === 'signed-in' ? runtimeIngestLimits.entriesSignedIn : runtimeIngestLimits.entriesSignedOut,
      entries,
    );
    if (!own.allowed || population === 'signed-in') {
      return own;
    }
    return this.consume('telemetry:rl:entries:signed-out', runtimeIngestLimits.entriesSignedOutGlobal, entries);
  }

  private async firstDelivery(batch: string): Promise<'first' | 'in-flight' | 'recorded' | 'unavailable'> {
    const key = `telemetry:batch:${batch}`;
    try {
      const set = await this.redisService.client.set(key, 'in-flight', 'EX', runtimeIngestLimits.inFlightSeconds, 'NX');
      if (set === 'OK') {
        return 'first';
      }
      return (await this.redisService.client.get(key)) === 'recorded' ? 'recorded' : 'in-flight';
    } catch {
      this.runtimeMetrics.count('telemetryIngestUnavailable', 1, { check: 'dedupe' });
      return 'unavailable';
    }
  }

  private async markRecorded(batch: string): Promise<void> {
    await this.redisService.client.set(
      `telemetry:batch:${batch}`,
      'recorded',
      'EX',
      runtimeIngestLimits.recordedSeconds,
    );
  }

  private async releaseDelivery(batch: string): Promise<void> {
    await this.redisService.client.del(`telemetry:batch:${batch}`);
  }

  private countEntries(disposition: Disposition, count: number, population: Population): void {
    if (count > 0) {
      this.runtimeMetrics.count('telemetryIngestEntries', count, { disposition, 'tau.runtime.population': population });
    }
  }

  /* ------------------------------------------------------------------------------------------- *
   * Release admission (resolved Q11): server-side sources only, newest 32, else `_OTHER`.         *
   * ------------------------------------------------------------------------------------------- */

  private async admittedReleases(entries: readonly RuntimeEntryRecord[], now: Date): Promise<ReadonlySet<string>> {
    const needed = entries.some((entry) => entry.name === RuntimeEntryName.OPERATION);
    if (!needed) {
      return new Set();
    }
    if (this.admitted !== undefined && now.getTime() - this.admitted.at < releaseCacheLifetime) {
      return this.admitted.releases;
    }
    let ui: string[] = [];
    try {
      const listed = await this.redisService.client.lrange(uiReleasesKey, 0, runtimeIngestLimits.uiReleases - 1);
      ui = listed.filter((release) => releasePattern.test(release));
    } catch {
      /* Redis down: the configured releases still admit; the UI ones read `_OTHER` until it returns. */
    }
    const releases = new Set([...ui, ...this.configuredReleases].slice(0, admittedReleaseLimit));
    this.admitted = { releases, at: now.getTime() };
    return releases;
  }

  /* ------------------------------------------------------------------------------------------- *
   * Recording.                                                                                  *
   * ------------------------------------------------------------------------------------------- */

  private recordEntry(entry: RuntimeEntryRecord, context: RecordContext): void {
    switch (entry.name) {
      case RuntimeEntryName.OPERATION: {
        this.recordOperation(entry, context);
        return;
      }
      case RuntimeEntryName.LATE: {
        this.recordLate(entry);
        return;
      }
      case RuntimeEntryName.VIEWER: {
        this.recordViewer(entry);
        return;
      }
      default: {
        this.recordDelivery(entry);
      }
    }
  }

  private recordOperation(entry: RuntimeOperationRecord, context: RecordContext): void {
    const { detail } = entry;
    const { population } = context;
    const { operation, outcome, worker } = detail;
    const kernel = detail.kernel ?? absentLabel;
    const count = detail.count ?? 1;
    if (outcome === 'attention') {
      this.runtimeMetrics.count('runtimeJobAttention', 1, {
        'tau.runtime.plugin': detail.plugin ?? otherValue,
        'tau.runtime.population': population,
      });
      return;
    }
    const cause = causeOf(outcome, detail.code);
    const isFailed = cause !== 'none' && cause !== 'cancelled';
    const completed = !mergedOutcomes.has(outcome);
    const seconds = entry.duration / 1000;
    const release = context.releases.has(detail.release) ? detail.release : otherValue;
    this.runtimeMetrics.count('runtimeOperations', count, {
      'tau.runtime.operation': operation,
      'tau.runtime.outcome': outcome,
      'tau.runtime.cause': cause,
      'kernel.id': kernel,
      'tau.runtime.population': population,
    });
    this.runtimeMetrics.record('runtimeOperationDuration', seconds, {
      'tau.runtime.operation': operation,
      'tau.runtime.outcome': outcome,
      'tau.runtime.route': detail.route,
      'tau.runtime.cold': worker?.cold ?? false,
    });
    if (detail.code !== undefined) {
      this.runtimeMetrics.count('runtimeOperationErrors', count, {
        'tau.runtime.operation': operation,
        'error.type': detail.code,
        'kernel.id': kernel,
      });
    }
    if (detail.transport !== undefined) {
      this.runtimeMetrics.count('runtimeOperationsByTransport', count, {
        'tau.runtime.operation': operation,
        'tau.runtime.transport': detail.transport,
        'tau.runtime.outcome': outcome,
      });
    }
    for (const adaptation of detail.adaptations ?? []) {
      this.runtimeMetrics.count('runtimeAdaptations', 1, {
        'kernel.id': kernel,
        'error.type': adaptation,
        'tau.runtime.operation': operation,
      });
    }
    if (detail.factsMissing !== undefined) {
      this.runtimeMetrics.count('runtimeFactsMissing', 1, {
        'tau.runtime.operation': operation,
        'tau.runtime.reason': detail.factsMissing,
        'tau.runtime.route': detail.route,
      });
    }
    if (completed) {
      this.recordCompleted(entry, { ...context, kernel, isFailed, release, seconds });
    }
    if (worker !== undefined) {
      this.recordWorker(entry, worker, { ...context, kernel, isFailed });
    }
    this.recordPlugins(entry, { ...context, isFailed });
    this.recordCapacity(entry, kernel);
    if (context.principal !== undefined && detail.kernel !== undefined) {
      for (const set of isFailed ? principalSets : (['any'] as const)) {
        addMember(
          context.members,
          principalKey(context.now, { kind: 'kernel', id: detail.kernel, set }),
          context.principal,
        );
        addMember(context.members, principalKey(context.now, { kind: 'kernel', id: '_ALL', set }), context.principal);
      }
    }
    if (outcome !== 'succeeded') {
      this.logOperation(entry, { cause, kernel, population, release, key: context.key, now: context.now });
    }
  }

  private recordCompleted(
    entry: RuntimeOperationRecord,
    context: RecordContext & Readonly<{ kernel: string; isFailed: boolean; release: string; seconds: number }>,
  ): void {
    const { detail } = entry;
    const { population, kernel, isFailed, release } = context;
    const { operation } = detail;
    const kernelId = kernel as RuntimeOperationKernel;
    this.runtimeMetrics.count('runtimeOperationsByRelease', 1, {
      'tau.runtime.operation': operation,
      'tau.release': release,
      'tau.runtime.failed': isFailed,
    });
    this.runtimeMetrics.count('runtimeOperationsByCaller', 1, {
      'tau.runtime.operation': operation,
      'tau.runtime.caller': detail.caller,
      'tau.runtime.failed': isFailed,
    });
    this.runtimeMetrics.count('runtimeOperationsByHost', 1, {
      'tau.runtime.route': detail.route,
      'tau.runtime.platform': detail.platform ?? otherValue,
      'tau.runtime.os': detail.os ?? otherValue,
      'tau.runtime.population': population,
    });
    /* AR-W23-04: an entry without a kernel is not kernel usage. */
    if (detail.kernel !== undefined) {
      this.runtimeMetrics.count('runtimeKernelUsage', 1, {
        'kernel.id': detail.kernel,
        'tau.runtime.route': detail.route,
        'tau.runtime.caller': detail.caller,
        'tau.runtime.population': population,
      });
    }
    if (detail.outcome === 'succeeded') {
      this.runtimeMetrics.record('runtimeCohortDuration', context.seconds, {
        'tau.runtime.operation': operation,
        'kernel.id': kernelId,
        'tau.release': release,
      });
    }
    if (operation === 'export' || operation === 'transcode') {
      this.runtimeMetrics.count('runtimeExports', 1, {
        'kernel.id': kernelId,
        'tau.runtime.format': detail.format ?? otherValue,
        'tau.runtime.outcome': detail.outcome,
        'tau.runtime.population': population,
      });
      if (detail.sourceFormat !== undefined) {
        const pair = conversionPairOf(detail.sourceFormat, detail.format ?? otherValue);
        this.runtimeMetrics.count('runtimeTranscodeFormats', 1, {
          'tau.runtime.source_format': pair.source as RuntimeFileFormat,
          'tau.runtime.format': pair.target as RuntimeFormat,
          'tau.runtime.failed': isFailed,
          'tau.runtime.population': population,
        });
      }
    }
    if (operation === 'evaluate' && detail.entryFormat !== undefined) {
      this.runtimeMetrics.count('runtimeEntryFormats', 1, {
        'kernel.id': kernelId,
        'tau.runtime.entry_format': detail.entryFormat,
        'tau.runtime.population': population,
      });
    }
    if (detail.verify !== undefined) {
      for (const set of ['selected', 'passed', 'failed'] as const) {
        this.runtimeMetrics.record('runtimeVerifyTests', detail.verify[set], {
          'tau.runtime.set': set,
          'kernel.id': kernelId,
        });
      }
    }
  }

  private recordWorker(
    entry: RuntimeOperationRecord,
    worker: NonNullable<RuntimeOperationRecord['detail']['worker']>,
    context: RecordContext & Readonly<{ kernel: string; isFailed: boolean }>,
  ): void {
    const { detail } = entry;
    const { population, isFailed } = context;
    const kernel = context.kernel as RuntimeOperationKernel;
    const { operation } = detail;
    this.runtimeMetrics.record('runtimeOperationQueue', worker.queue / 1000, {
      'tau.runtime.operation': operation,
      'tau.runtime.route': detail.route,
    });
    this.runtimeMetrics.count('runtimeReuse', 1, { 'kernel.id': kernel, 'tau.runtime.reuse': worker.reuse });
    if (worker.heapBytes !== undefined) {
      this.runtimeMetrics.record('runtimeKernelHeap', worker.heapBytes, {
        'kernel.id': kernel,
        'tau.runtime.heap_source': worker.heapSource ?? 'none',
        'tau.runtime.failed': isFailed,
        'tau.runtime.route': detail.route,
        ...(detail.device === undefined ? {} : { 'tau.runtime.device': detail.device }),
        'tau.runtime.population': population,
      });
    }
    if (worker.middleware !== undefined) {
      this.runtimeMetrics.record('runtimeMiddlewareDuration', worker.middleware.total / 1000, {
        'tau.runtime.middleware': worker.middleware.slowestId,
        'tau.runtime.operation': operation,
      });
    }
    if (detail.outcome !== 'succeeded') {
      return;
    }
    for (const [phase, milliseconds] of Object.entries(worker.phases ?? {})) {
      this.runtimeMetrics.record('runtimePhaseDuration', milliseconds / 1000, {
        'tau.runtime.phase': phase as RuntimePhase,
        'kernel.id': kernel,
        'tau.runtime.operation': operation,
      });
    }
    if (worker.parameters !== undefined) {
      this.runtimeMetrics.record('runtimeParametersDeclared', worker.parameters.declared, {
        'kernel.id': kernel,
        'tau.runtime.population': population,
      });
      this.runtimeMetrics.count('runtimeParameterEvaluations', 1, {
        'kernel.id': kernel,
        'tau.runtime.parameter_class': parameterClassOf(worker.parameters),
        'tau.runtime.population': population,
      });
      for (const feature of new Set(worker.parameters.features ?? [])) {
        this.runtimeMetrics.count('runtimeParameterFeatures', 1, {
          'kernel.id': kernel,
          'tau.runtime.parameter_feature': feature,
          'tau.runtime.population': population,
        });
      }
    }
    if (operation === 'render' && worker.triangles !== undefined) {
      this.runtimeMetrics.record('runtimeRenderBySize', entry.duration / 1000, {
        'kernel.id': kernel,
        'tau.runtime.size_class': sizeClassOf(worker.triangles),
        'tau.runtime.population': population,
      });
    }
  }

  /**
   * Usage of every non-kernel capability the attempt touched: the transcoder, job or machine provider it names (the
   * worker's own stamp wins), each middleware that ran and the bundler. The capability is derived, never sent.
   */
  private recordPlugins(entry: RuntimeOperationRecord, context: RecordContext & Readonly<{ isFailed: boolean }>): void {
    const { population, members, principal, isFailed, now } = context;
    const { detail } = entry;
    const { worker } = detail;
    const ran = worker?.middleware?.ran ?? (worker?.middleware === undefined ? [] : [worker.middleware.slowestId]);
    const usage = [worker?.plugin ?? detail.plugin, ...ran, worker?.bundler].filter((id) => id !== undefined);
    for (const id of new Set(usage)) {
      const plugin = (pluginUsageIds as readonly string[]).includes(id) ? (id as PluginUsageId) : undefined;
      this.runtimeMetrics.count('runtimePluginOperations', detail.count ?? 1, {
        'tau.runtime.capability': plugin === undefined ? otherValue : capabilityOf[plugin],
        'tau.runtime.plugin': plugin ?? otherValue,
        'tau.runtime.operation': detail.operation,
        'tau.runtime.outcome': detail.outcome,
        'tau.runtime.population': population,
      });
      if (principal !== undefined && plugin !== undefined) {
        for (const set of isFailed ? principalSets : (['any'] as const)) {
          addMember(members, principalKey(now, { kind: 'plugin', id: plugin, set }), principal);
        }
      }
    }
    if (detail.operation === 'machine' && detail.machineKind !== undefined) {
      this.runtimeMetrics.count('runtimeMachineOperations', 1, {
        'tau.runtime.plugin': detail.plugin ?? otherValue,
        'tau.runtime.machine_kind': detail.machineKind,
        'tau.runtime.machine_action': detail.machineAction ?? absentLabel,
        'tau.runtime.outcome': detail.outcome,
        'tau.runtime.caller': detail.caller,
        'tau.runtime.population': population,
      });
    }
  }

  private recordCapacity(entry: RuntimeOperationRecord, kernel: string): void {
    const { limit, code, route } = entry.detail;
    if (limit === undefined || (code !== 'RESOURCE_LIMIT' && code !== 'HOST_LIMIT_EXCEEDED')) {
      return;
    }
    const demandKind = 'demand' in limit ? limit.demand.kind : 'unknown';
    this.runtimeMetrics.count('runtimeCapacityRefusals', 1, {
      'tau.runtime.limit': limit.id,
      'tau.runtime.demand_kind': demandKind,
      'kernel.id': kernel as RuntimeOperationKernel,
      'tau.runtime.route': route,
    });
    if ('demand' in limit && limit.demand.kind !== 'unknown' && limit.maximum > 0) {
      this.runtimeMetrics.record('runtimeCapacityDemandRatio', limit.demand.value / limit.maximum, {
        'tau.runtime.limit': limit.id,
      });
    }
  }

  private recordLate(entry: RuntimeLateRecord): void {
    this.runtimeMetrics.count('runtimeLateTerminals', 1, {
      'tau.runtime.operation': entry.detail.operation,
      'tau.runtime.settled_as': entry.detail.settledAs,
      'tau.runtime.route': entry.detail.route,
    });
  }

  private recordViewer(entry: RuntimeViewerRecord): void {
    const { detail } = entry;
    this.runtimeMetrics.count('runtimeViewerEvents', 1, {
      'tau.runtime.viewer_event': detail.event,
      'tau.runtime.backend': detail.backend,
      'tau.runtime.route': detail.route,
      ...(detail.device === undefined ? {} : { 'tau.runtime.device': detail.device }),
      ...(detail.format === undefined ? {} : { 'tau.runtime.format': detail.format }),
    });
    if (detail.event === 'first-frame') {
      this.runtimeMetrics.record('runtimeViewerFirstFrame', entry.duration / 1000, {
        'tau.runtime.backend': detail.backend,
        'tau.runtime.size_class': sizeClassOf(detail.triangles ?? 0),
      });
    }
  }

  private recordDelivery(entry: DeliveryHealthRecord): void {
    const { detail } = entry;
    for (const [reason, count] of Object.entries(detail.dropped)) {
      if (count > 0) {
        this.runtimeMetrics.count('telemetryClientDropped', count, {
          'tau.runtime.route': detail.route,
          reason: runtimeVocabulary.dropReason.parse(reason),
        });
      }
    }
    if (detail.spansDropped !== undefined && detail.spansDropped > 0) {
      this.runtimeMetrics.count('telemetrySpansDropped', detail.spansDropped, { 'tau.runtime.route': detail.route });
    }
    this.runtimeMetrics.record('telemetryDeliveryDelay', detail.oldest / 1000, { 'tau.runtime.route': detail.route });
  }

  /**
   * The Loki event of a non-success attempt: closed values only, at most 60 per abuse key per minute.
   */
  private logOperation(
    entry: RuntimeOperationRecord,
    context: Readonly<{
      cause: string;
      kernel: string;
      population: Population;
      release: string;
      key: string;
      now: Date;
    }>,
  ): void {
    const window = Math.floor(context.now.getTime() / 60_000);
    if (window !== this.eventsWindow) {
      this.eventsWindow = window;
      this.events.clear();
    }
    const sent = this.events.get(context.key) ?? 0;
    if (sent >= runtimeIngestLimits.eventsPerKey) {
      this.countEntries('overflow', 1, context.population);
      return;
    }
    this.events.set(context.key, sent + 1);
    const { detail } = entry;
    const fields = {
      event: 'runtime.operation',
      operation: detail.operation,
      outcome: detail.outcome,
      cause: context.cause,
      code: detail.code ?? absentLabel,
      kernel: context.kernel,
      route: detail.route,
      caller: detail.caller,
      population: context.population,
      release: context.release,
    };
    if (context.cause === 'cancelled') {
      this.logger.info(fields, 'runtime.operation');
    } else {
      this.logger.warn(fields, 'runtime.operation');
    }
  }

  /* ------------------------------------------------------------------------------------------- *
   * Distinct principals (HyperLogLog) and the gauges.                                           *
   * ------------------------------------------------------------------------------------------- */

  private async addPrincipals(members: ReadonlyMap<string, ReadonlySet<string>>): Promise<void> {
    try {
      for (const [key, values] of members) {
        // oxlint-disable-next-line no-await-in-loop -- a handful of keys per batch, each its own command pair.
        await this.redisService.client.pfadd(key, ...values);
        // oxlint-disable-next-line no-await-in-loop -- the TTL follows its own PFADD.
        await this.redisService.client.expire(key, runtimeIngestLimits.principalSetSeconds);
      }
    } catch {
      this.runtimeMetrics.count('telemetryIngestUnavailable', 1, { check: 'budget' });
    }
  }

  private refreshEnabledGauge(): void {
    this.runtimeMetrics.setGauge('telemetryRuntimeEnabled', [
      { value: this.policyAt(new Date()) === 'on' ? 1 : 0, attributes: {} },
    ]);
  }
}

type RecordContext = Readonly<{
  population: Population;
  releases: ReadonlySet<string>;
  members: Map<string, Set<string>>;
  principal: string | undefined;
  key: string;
  now: Date;
}>;
type RuntimeOperationKernel = (typeof runtimeKernelIds)[number] | typeof otherValue | typeof absentLabel;
type RuntimeFileFormat = NonNullable<RuntimeOperationRecord['detail']['sourceFormat']>;
type RuntimeFormat = NonNullable<RuntimeOperationRecord['detail']['format']>;
type RuntimePhase = keyof NonNullable<NonNullable<RuntimeOperationRecord['detail']['worker']>['phases']>;

/**
 * The HyperLogLog key of one day's principal set.
 *
 * @param now - The current time; the set is per UTC day.
 * @param member - The set: kernel or plugin, the kernel id (or `_ALL`) or plugin id, and `any` or `failed`.
 * @returns The key.
 */
const principalKey = (
  now: Date,
  member: Readonly<{ kind: 'kernel' | 'plugin'; id: string; set: (typeof principalSets)[number] }>,
): string => `telemetry:hll:${now.toISOString().slice(0, 10)}:${member.kind}:${member.id}:${member.set}`;

/**
 * Add a member to a pending HyperLogLog key.
 *
 * @param members - The batch's pending members.
 * @param key - The key.
 * @param member - The principal.
 */
const addMember = (members: Map<string, Set<string>>, key: string, member: string): void => {
  const set = members.get(key) ?? new Set<string>();
  set.add(member);
  members.set(key, set);
};
