import { createHash, randomBytes } from 'node:crypto';
import { Readable } from 'node:stream';
import { buffer } from 'node:stream/consumers';
import type { Meter } from '@opentelemetry/api';
import { RepositoryStoreError } from '#api/git/store/errors.js';
import { decodeManifest, encodeManifest, succeedManifest, tombstoneManifest } from '#api/git/store/manifest.js';
import type { Manifest, ManifestPack } from '#api/git/store/manifest.js';
import type { ObjectSource, RepositoryLocator, StoredObject } from '#api/git/store/port.js';
import type {
  DestinationHead,
  DestinationPutOptions,
  DestinationVersion,
  MirrorDestination,
} from '#api/git/mirror/destination.js';
import type { CopierContext } from '#api/git/mirror/copier.js';
import { MirrorMetrics } from '#api/git/mirror/metrics.js';
import type { MirrorSource } from '#api/git/mirror/source.js';
import type {
  BacklogReading,
  CopyCandidate,
  CopyRecord,
  MirrorLedger,
  PendingLfsObject,
  TombstonedOwner,
} from '#api/git/mirror/watermark.js';

/**
 * In-memory doubles for the copier's three ports, faithful where the copier's
 * safety depends on them: the destination keeps versions, refuses a body whose
 * SHA-256 is not the declared one (B2's BadDigest, DT0 T5) and a retention
 * shortening (compliance mode, DT0 T3), and records every call by name; the
 * ledger applies the same monotonic rules as the SQL.
 */

export const day = 24 * 60 * 60 * 1000;

/** A settable clock. */
export type Clock = { readonly now: () => Date; readonly advance: (milliseconds: number) => void };

export const clock = (start = Date.parse('2026-10-24T00:00:00.000Z')): Clock => {
  let now = start;
  return {
    now: () => new Date(now),
    advance: (milliseconds: number) => {
      now += milliseconds;
    },
  };
};

const sha256Base64 = (bytes: Uint8Array<ArrayBuffer>): string => createHash('sha256').update(bytes).digest('base64');

export const sha256Hex = (bytes: Uint8Array<ArrayBuffer>): string => createHash('sha256').update(bytes).digest('hex');

/** Pack bytes whose trailing 20 bytes are the SHA-1 of the rest, and the key git would name them under. */
export const packOf = (content: string): { key: string; bytes: Uint8Array<ArrayBuffer> } => {
  const body = Buffer.from(`PACK${content}`);
  const sha1 = createHash('sha1').update(body).digest();
  return {
    key: `packs/pack-${sha1.toString('hex')}-${randomBytes(4).toString('hex')}.pack`,
    bytes: new Uint8Array(Buffer.concat([body, sha1])),
  };
};

type StoredVersion = {
  versionId: string;
  bytes: Uint8Array<ArrayBuffer>;
  retainUntil: Date;
  hide: boolean;
  modifiedAt: Date;
};

export class FakeDestination implements MirrorDestination {
  public get name(): 'b2' {
    return 'b2';
  }

  public readonly calls: string[] = [];

  /** Every key a successful `put` wrote, in order. */
  public readonly putKeys: string[] = [];

  public readonly objects = new Map<string, StoredVersion[]>();

  public reachable = true;

  /** Throws on the Nth `put` (1-based) once, to simulate a crash between steps. */
  public failPutAt: number | undefined;

  private puts = 0;

  private sequence = 0;

  public constructor(private readonly now: () => Date) {}

  public async probe(): Promise<boolean> {
    this.calls.push('probe');
    return this.reachable;
  }

  public async *listVersions(prefix: string): AsyncIterable<DestinationVersion> {
    this.calls.push('listVersions');
    for (const [key, versions] of [...this.objects].sort(([left], [right]) => (left < right ? -1 : 1))) {
      if (!key.startsWith(prefix)) {
        continue;
      }
      for (const version of versions) {
        yield {
          key,
          versionId: version.versionId,
          bytes: version.bytes.byteLength,
          isHideMarker: version.hide,
          modifiedAt: version.modifiedAt,
        };
      }
    }
  }

  public async head(key: string, versionId: string): Promise<DestinationHead | undefined> {
    this.calls.push('head');
    const version = this.objects.get(key)?.find((candidate) => candidate.versionId === versionId && !candidate.hide);
    return version === undefined
      ? undefined
      : {
          versionId,
          bytes: version.bytes.byteLength,
          retainUntil: version.retainUntil,
          sha256: sha256Base64(version.bytes),
        };
  }

  public async get(key: string, versionId: string): Promise<Readable> {
    this.calls.push('get');
    const version = this.objects.get(key)?.find((candidate) => candidate.versionId === versionId);
    if (version === undefined) {
      throw Object.assign(new Error('NoSuchVersion'), {
        $metadata: { httpStatusCode: 404 },
      });
    }
    return Readable.from([Buffer.from(version.bytes)]);
  }

  public async put(
    key: string,
    body: Uint8Array<ArrayBuffer> | ObjectSource,
    options: DestinationPutOptions,
  ): Promise<{ versionId: string }> {
    this.calls.push('put');
    this.puts += 1;
    if (this.failPutAt === this.puts) {
      this.failPutAt = undefined;
      throw Object.assign(new Error('injected crash'), {
        $metadata: { httpStatusCode: 503 },
      });
    }
    const bytes = typeof body === 'function' ? new Uint8Array(await buffer(await body())) : body;
    if (bytes.byteLength !== options.contentLength || sha256Base64(bytes) !== options.sha256) {
      throw Object.assign(new Error('BadDigest'), {
        $metadata: { httpStatusCode: 400 },
      });
    }
    this.sequence += 1;
    const versionId = `v${String(this.sequence)}`;
    const list = this.objects.get(key) ?? [];
    list.push({
      versionId,
      bytes,
      retainUntil: options.retainUntil,
      hide: false,
      modifiedAt: this.now(),
    });
    this.objects.set(key, list);
    this.putKeys.push(key);
    return { versionId };
  }

  public async extendRetention(key: string, versionId: string, retainUntil: Date): Promise<void> {
    this.calls.push('extendRetention');
    const version = this.objects.get(key)?.find((candidate) => candidate.versionId === versionId);
    if (version === undefined) {
      throw Object.assign(new Error('NoSuchVersion'), {
        $metadata: { httpStatusCode: 404 },
      });
    }
    if (retainUntil < version.retainUntil) {
      throw Object.assign(new Error('AccessDenied: compliance retention cannot be shortened'), {
        $metadata: { httpStatusCode: 403 },
      });
    }
    version.retainUntil = retainUntil;
  }

  /** What an attacker with the copy key could do: hide a name (an S3 delete marker). */
  public hide(key: string): void {
    this.sequence += 1;
    const list = this.objects.get(key) ?? [];
    list.push({
      versionId: `h${String(this.sequence)}`,
      bytes: new Uint8Array(new ArrayBuffer(0)),
      retainUntil: this.now(),
      hide: true,
      modifiedAt: this.now(),
    });
    this.objects.set(key, list);
  }

  public keys(prefix = ''): string[] {
    return [...this.objects.keys()].filter((key) => key.startsWith(prefix)).sort();
  }

  public latest(key: string): StoredVersion | undefined {
    return this.objects.get(key)?.findLast((version) => !version.hide);
  }
}

/** The primary: one manifest per repository plus objects by key, and LFS bytes by oid. */
export class FakeSource implements MirrorSource {
  public readonly manifests = new Map<string, Uint8Array<ArrayBuffer>>();

  public readonly objects = new Map<string, Uint8Array<ArrayBuffer>>();

  public readonly lfs = new Map<string, Uint8Array<ArrayBuffer>>();

  public async readManifest(
    locator: RepositoryLocator,
  ): Promise<{ bytes: Uint8Array<ArrayBuffer>; manifest: Manifest } | undefined> {
    const bytes = this.manifests.get(repo(locator));
    return bytes === undefined ? undefined : { bytes, manifest: decodeManifest(bytes) };
  }

  public async open(locator: RepositoryLocator, key: string): Promise<Readable> {
    const bytes = this.objects.get(`${repo(locator)}${key}`);
    if (bytes === undefined) {
      throw new RepositoryStoreError('missing-pack', `the store holds no '${key}'`);
    }
    return Readable.from([Buffer.from(bytes)]);
  }

  public async *list(locator: RepositoryLocator, prefix: string): AsyncIterable<StoredObject> {
    for (const [key, bytes] of this.objects) {
      if (key.startsWith(`${repo(locator)}${prefix}`)) {
        yield {
          key: key.slice(repo(locator).length),
          bytes: bytes.byteLength,
          modifiedAt: undefined,
        };
      }
    }
  }

  public async openLfs(locator: RepositoryLocator, oid: string): Promise<Readable | undefined> {
    const bytes = this.lfs.get(`${repo(locator)}${oid}`);
    return bytes === undefined ? undefined : Readable.from([Buffer.from(bytes)]);
  }

  public manifestOf(locator: RepositoryLocator): Manifest | undefined {
    const bytes = this.manifests.get(repo(locator));
    return bytes === undefined ? undefined : decodeManifest(bytes);
  }

  /**
   * Commits one push: a new pack (and its stored index), the spilled push-log
   * segment when the log spills, and the manifest. Returns the new manifest.
   */
  public push(locator: RepositoryLocator, at: Date, options: { compact?: boolean } = {}): Manifest {
    const base = this.manifestOf(locator);
    const pack = packOf(
      `${locator.projectId}-${String((base?.generation ?? 0) + 1)}-${randomBytes(4).toString('hex')}`,
    );
    this.objects.set(`${repo(locator)}${pack.key}`, pack.bytes);
    const index = new Uint8Array(Buffer.from(`idx:${pack.key}`));
    this.objects.set(`${repo(locator)}${pack.key.slice(0, -'.pack'.length)}.idx`, index);
    const entry: ManifestPack = {
      key: pack.key,
      bytes: pack.bytes.byteLength,
      indexStored: true,
    };
    const packs = options.compact === true ? [entry] : [...(base?.packs ?? []), entry];
    const next = succeedManifest(
      base,
      {
        refs: {
          'refs/heads/main': {
            oid: createHash('sha1').update(pack.key).digest('hex'),
          },
        },
        packs,
        committedBy: 'user_fixture',
      },
      at,
    );
    if (base !== undefined && next.earlierPushes !== null && next.earlierPushes !== base.earlierPushes) {
      const segment = new TextEncoder().encode(JSON.stringify({ previous: base.earlierPushes, pushes: base.pushes }));
      this.objects.set(`${repo(locator)}${next.earlierPushes}`, segment);
    }
    this.manifests.set(repo(locator), encodeManifest(next));
    return next;
  }

  public tombstone(locator: RepositoryLocator, at: Date): Manifest {
    const base = this.manifestOf(locator);
    if (base === undefined) {
      throw new Error('nothing to tombstone');
    }
    const next = tombstoneManifest(base, { committedBy: 'purge', at });
    this.manifests.set(repo(locator), encodeManifest(next));
    return next;
  }

  /** Stores an LFS object and returns its oid. */
  public addLfs(locator: RepositoryLocator, content: string): { oid: string; sizeBytes: number } {
    const bytes = new Uint8Array(Buffer.from(content));
    const oid = sha256Hex(bytes);
    this.lfs.set(`${repo(locator)}${oid}`, bytes);
    return { oid, sizeBytes: bytes.byteLength };
  }
}

const repo = (locator: RepositoryLocator): string => `${locator.ownerId}/${locator.projectId}/`;

type LedgerRow = {
  projectId: string;
  ownerId: string;
  generation: number;
  copiedGeneration: number;
  copyPendingSince: Date | undefined;
  copyLockedUntil: Date | undefined;
  copiedManifestSha256: string | undefined;
  updatedAt: Date;
};

type LfsRow = {
  projectId: string;
  oid: string;
  sizeBytes: number;
  finalizedAt: Date | undefined;
  copiedAt: Date | undefined;
};

/** The ledger's SQL rules, in memory. */
export class FakeLedger implements MirrorLedger {
  public readonly rows = new Map<string, LedgerRow>();

  public readonly lfs: LfsRow[] = [];

  public readonly tombstones = new Map<string, TombstonedOwner & { copyMarkedAt: Date | undefined }>();

  public constructor(private readonly now: () => Date) {}

  /** What `recordGeneration` does: advance `generation` and start the clock with `coalesce`. */
  public recordGeneration(locator: RepositoryLocator, generation: number): void {
    const row = this.rows.get(locator.projectId) ?? {
      projectId: locator.projectId,
      ownerId: locator.ownerId,
      generation: 0,
      copiedGeneration: 0,
      copyPendingSince: undefined,
      copyLockedUntil: undefined,
      copiedManifestSha256: undefined,
      updatedAt: this.now(),
    };
    if (generation > row.generation) {
      row.generation = generation;
      if (generation > row.copiedGeneration) {
        row.copyPendingSince ??= this.now();
      }
      row.updatedAt = this.now();
    }
    this.rows.set(locator.projectId, row);
  }

  public addLfsRow(locator: RepositoryLocator, object: { oid: string; sizeBytes: number }, finalizedAt?: Date): void {
    this.lfs.push({
      projectId: locator.projectId,
      ...object,
      finalizedAt,
      copiedAt: undefined,
    });
  }

  public row(projectId: string): LedgerRow {
    const row = this.rows.get(projectId);
    if (row === undefined) {
      throw new Error(`no row for ${projectId}`);
    }
    return row;
  }

  public async claim(args: {
    limit: number;
    backfillLimit: number;
    exclude: ReadonlySet<string>;
  }): Promise<CopyCandidate[]> {
    const rows = [...this.rows.values()].filter((row) => !args.exclude.has(row.projectId));
    const steady = rows
      .filter((row) => row.copyPendingSince !== undefined)
      .sort((left, right) => left.copyPendingSince!.getTime() - right.copyPendingSince!.getTime())
      .slice(0, args.limit);
    const room = Math.min(args.backfillLimit, args.limit - steady.length);
    const backfill = rows
      .filter((row) => row.copyPendingSince === undefined && row.generation > row.copiedGeneration)
      .sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime())
      .slice(0, Math.max(0, room));
    return [...steady, ...backfill].map((row) => this.toCandidate(row));
  }

  public async candidate(projectId: string): Promise<CopyCandidate | undefined> {
    const row = this.rows.get(projectId);
    return row === undefined ? undefined : this.toCandidate(row);
  }

  public async tombstone(ownerId: string): Promise<TombstonedOwner | undefined> {
    return this.tombstones.get(ownerId);
  }

  // oxlint-disable-next-line max-params -- the port's own signature
  public async pendingLfs(
    projectId: string,
    finalizedBy: Date,
    limit: number,
    after?: string,
  ): Promise<PendingLfsObject[]> {
    return this.lfs
      .filter(
        (row) =>
          row.projectId === projectId &&
          row.copiedAt === undefined &&
          row.finalizedAt !== undefined &&
          row.finalizedAt <= finalizedBy &&
          (after === undefined || row.oid > after),
      )
      .sort((left, right) => (left.oid < right.oid ? -1 : 1))
      .slice(0, limit)
      .map(({ oid, sizeBytes }) => ({ oid, sizeBytes }));
  }

  public async markLfsCopied(projectId: string, oids: readonly string[], at: Date): Promise<void> {
    for (const row of this.lfs) {
      if (row.projectId === projectId && oids.includes(row.oid)) {
        row.copiedAt = at;
      }
    }
  }

  public async copiedLfs(projectId: string): Promise<ReadonlySet<string>> {
    return new Set(
      this.lfs.filter((row) => row.projectId === projectId && row.copiedAt !== undefined).map((row) => row.oid),
    );
  }

  public async recordCopy(projectId: string, record: CopyRecord): Promise<void> {
    const row = this.rows.get(projectId);
    if (row === undefined) {
      return;
    }
    const newest = record.generation >= row.copiedGeneration;
    row.copiedGeneration = Math.max(row.copiedGeneration, record.generation);
    if (newest) {
      row.copiedManifestSha256 = record.manifestSha256;
      row.copyLockedUntil = record.lockedUntil;
    }
    if (row.generation <= record.generation) {
      row.copyPendingSince = undefined;
    }
  }

  public async settle(projectId: string, storeGeneration: number): Promise<void> {
    const row = this.rows.get(projectId);
    if (row !== undefined && row.generation <= row.copiedGeneration && storeGeneration <= row.copiedGeneration) {
      row.copyPendingSince = undefined;
    }
  }

  public async unmarkedTombstones(limit: number): Promise<TombstonedOwner[]> {
    return [...this.tombstones.values()].filter((owner) => owner.copyMarkedAt === undefined).slice(0, limit);
  }

  public async markTombstone(ownerId: string, at: Date): Promise<void> {
    const owner = this.tombstones.get(ownerId);
    if (owner !== undefined) {
      owner.copyMarkedAt ??= at;
    }
  }

  public async sweepCandidates(floor: Date, limit: number, after?: string): Promise<CopyCandidate[]> {
    return [...this.rows.values()]
      .filter(
        (row) =>
          row.copiedGeneration > 0 &&
          row.copiedManifestSha256 !== undefined &&
          (row.copyLockedUntil === undefined || row.copyLockedUntil < floor) &&
          !this.tombstones.has(row.ownerId) &&
          (after === undefined || row.projectId > after),
      )
      .sort((left, right) => (left.projectId < right.projectId ? -1 : 1))
      .slice(0, limit)
      .map((row) => this.toCandidate(row));
  }

  public async advanceLock(projectId: string, generation: number, lockedUntil: Date): Promise<void> {
    const row = this.rows.get(projectId);
    if (row !== undefined && row.copiedGeneration === generation) {
      row.copyLockedUntil = lockedUntil;
    }
  }

  public async reconcileCandidates(since: Date | undefined, limit: number, after?: string): Promise<CopyCandidate[]> {
    return [...this.rows.values()]
      .filter((row) => (since === undefined || row.updatedAt > since) && (after === undefined || row.projectId > after))
      .sort((left, right) => (left.projectId < right.projectId ? -1 : 1))
      .slice(0, limit)
      .map((row) => this.toCandidate(row));
  }

  public async markStoreAhead(projectId: string, storeGeneration: number): Promise<void> {
    const row = this.rows.get(projectId);
    if (row !== undefined && row.copiedGeneration < storeGeneration) {
      row.copyPendingSince ??= this.now();
    }
  }

  public async backlog(): Promise<BacklogReading> {
    const rows = [...this.rows.values()];
    const pending = rows.flatMap((row) => (row.copyPendingSince === undefined ? [] : [row.copyPendingSince.getTime()]));
    const locks = rows
      .filter((row) => row.copiedGeneration > 0 && !this.tombstones.has(row.ownerId))
      .flatMap((row) => (row.copyLockedUntil === undefined ? [] : [row.copyLockedUntil.getTime()]));
    return {
      oldestPendingSince: pending.length === 0 ? undefined : new Date(Math.min(...pending)),
      lagGenerations: Math.max(0, ...rows.map((row) => row.generation - row.copiedGeneration)),
      steady: rows.filter((row) => row.copyPendingSince !== undefined).length,
      backfill: rows.filter((row) => row.copyPendingSince === undefined && row.generation > row.copiedGeneration)
        .length,
      lfsBacklog: this.lfs.filter((row) => row.copiedAt === undefined && row.finalizedAt !== undefined).length,
      earliestLockedUntil: locks.length === 0 ? undefined : new Date(Math.min(...locks)),
    };
  }

  private toCandidate(row: LedgerRow): CopyCandidate {
    return {
      ...row,
      phase: row.copyPendingSince === undefined ? 'backfill' : 'steady',
    };
  }
}

/** One recorded instrument call: the value and its labels. */
export type Recorded = {
  readonly value: number;
  readonly attributes: Readonly<Record<string, unknown>>;
};

/** A meter that remembers every call by instrument name, for asserting the exported series. */
export const recordingMeter = (): {
  meter: Meter;
  recorded: Map<string, Recorded[]>;
} => {
  const recorded = new Map<string, Recorded[]>();
  const instrument = (name: string) => {
    const write = (value: number, attributes: Record<string, unknown> = {}) => {
      recorded.set(name, [...(recorded.get(name) ?? []), { value, attributes }]);
    };
    return { add: write, record: write };
  };
  const meter = {
    createCounter: instrument,
    createGauge: instrument,
    createHistogram: instrument,
  } as unknown as Meter;
  return { meter, recorded };
};

/** The sum of a counter's adds whose labels include `labels`. */
export const total = (recorded: Map<string, Recorded[]>, name: string, labels: Record<string, unknown> = {}): number =>
  (recorded.get(name) ?? [])
    .filter((entry) => Object.entries(labels).every(([key, value]) => entry.attributes[key] === value))
    .reduce((sum, entry) => sum + entry.value, 0);

/** The last value a gauge recorded under `labels`. */
export const last = (
  recorded: Map<string, Recorded[]>,
  name: string,
  labels: Record<string, unknown> = {},
): number | undefined =>
  (recorded.get(name) ?? []).findLast((entry) =>
    Object.entries(labels).every(([key, value]) => entry.attributes[key] === value),
  )?.value;

/** A complete copier harness over the three doubles. */
export type Harness = {
  readonly time: Clock;
  readonly destination: FakeDestination;
  readonly source: FakeSource;
  readonly ledger: FakeLedger;
  readonly recorded: Map<string, Recorded[]>;
  readonly events: Array<Readonly<Record<string, unknown>>>;
  readonly context: CopierContext;
};

export const harness = (): Harness => {
  const time = clock();
  const destination = new FakeDestination(time.now);
  const source = new FakeSource();
  const ledger = new FakeLedger(time.now);
  const { meter, recorded } = recordingMeter();
  const metrics = new MirrorMetrics(meter);
  const events: Array<Readonly<Record<string, unknown>>> = [];
  return {
    time,
    destination,
    source,
    ledger,
    recorded,
    events,
    context: {
      source,
      destination,
      ledger,
      metrics,
      now: time.now,
      report: (event: Readonly<Record<string, unknown>>) => {
        events.push(event);
      },
    },
  };
};
