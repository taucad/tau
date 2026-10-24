import { spawn } from 'node:child_process';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { addAbortSignal } from 'node:stream';
import type { Readable } from 'node:stream';
import { and, asc, desc, eq, isNotNull, gt, sql } from 'drizzle-orm';
import type { Database } from '#database/owner-lock.js';
import { mirrorDrillRun, project, projectGit, projectGitLfsObject } from '#database/schema.js';
import { repositoryLocator } from '#api/git/store/locator.js';
import { indexKeyFor, isTombstoned } from '#api/git/store/manifest.js';
import type { Manifest } from '#api/git/store/manifest.js';
import type { RepositoryLocator } from '#api/git/store/port.js';
import { gitChildEnvironment, gitCommandTimeoutMilliseconds } from '#api/git/store/lease.js';
import type { CopyReader, DestinationVersion } from '#api/git/mirror/destination.js';
import { lfsKey, lfsPrefix, repositoryKey, repositoryPrefix } from '#api/git/mirror/keys.js';
import type { MirrorDrillCheck, MirrorDrillEnvironment, MirrorMetrics } from '#api/git/mirror/metrics.js';
import {
  digestStream,
  findSnapshot,
  indexVerifies,
  lfsVerifies,
  listCopy,
  packHash,
  packVerifies,
  snapshotVersions,
} from '#api/git/mirror/snapshots.js';
import type { CopyIndex, ObjectDigest } from '#api/git/mirror/snapshots.js';
import { candidateColumns, defaultAccount, notTombstoned, toCandidate } from '#api/git/mirror/watermark.js';
import type { CopyCandidate, PendingLfsObject } from '#api/git/mirror/watermark.js';

/**
 * DR2-lite: the verify drill `tau-mirror` runs today (W13 DR2's read half). The
 * full drill restores into an isolated bucket from a one-off Machine; until
 * that exists this one proves, daily and once shortly after every start, that
 * what the copy holds is what Postgres says it holds:
 *
 * 1. pick `sample` random repositories the copy has caught (not erased, Tau's
 *    own account);
 * 2. discover the snapshot of `copied_generation` by **version** listing and
 *    require one version whose SHA-256 is `copied_manifest_sha256`;
 * 3. stream every object that snapshot names back from the copy: each pack must
 *    be the length the manifest records, hash to its name, and be a pack
 *    `git index-pack` accepts; each stored index must checksum itself and name
 *    its pack; the push-log chain must be complete back to its first segment;
 *    every copied LFS object must be its oid at its recorded size;
 * 4. require every version used to be locked at least to `copy_locked_until`;
 * 5. count hide markers under the sampled prefixes (must be 0).
 *
 * It only reads: list, head, get. The copy key could write; the drill's reader
 * is built read-only (`S3MirrorDestination` `readOnly`), so a write would be
 * refused before it is signed. Each run is one `mirror_drill_run` row, the
 * `tau.mirror.drill_*` series, and one `tau_mirror.drill` log line of counts.
 */

export type DrillEnvironment = MirrorDrillEnvironment;

/** A failed check, the `check` label on `tau.mirror.drill_check_failures`. */
export type DrillCheck = MirrorDrillCheck;

/** What a finished run records in `mirror_drill_run`. */
export type DrillRun = {
  readonly finishedAt: Date;
  readonly outcome: 'pass' | 'fail';
  readonly failedChecks: readonly string[];
  /** Seconds, keyed by what was timed: `verify` for this drill. */
  readonly durations: Readonly<Record<string, number>>;
  /** Bytes read back from the copy and verified. */
  readonly restoredBytes: number;
};

export type DrillLedger = {
  /** Up to `limit` random repositories the copy has caught: copied, trusted, Tau's account, owner not erased. */
  sample(limit: number): Promise<CopyCandidate[]>;
  /** A project's copied LFS objects with their recorded sizes. */
  copiedLfsObjects(projectId: string): Promise<PendingLfsObject[]>;
  /** Records a run's start; returns its id. */
  start(environment: string, at: Date): Promise<string>;
  finish(id: string, run: DrillRun): Promise<void>;
  /** When the environment's newest passing run finished. */
  lastPass(environment: string): Promise<Date | undefined>;
};

/** One `git index-pack` in progress, fed the bytes of one read. */
export type PackCheck = {
  write(chunk: Uint8Array<ArrayBuffer>): Promise<void>;
  /** The pack name git computed, or `undefined` when git refused the bytes. */
  end(): Promise<string | undefined>;
  abort(): Promise<void>;
};

export type PackChecker = (signal?: AbortSignal) => Promise<PackCheck>;

export type DrillContext = {
  readonly copy: CopyReader;
  readonly ledger: DrillLedger;
  readonly metrics: MirrorMetrics;
  readonly environment: DrillEnvironment;
  /** Repositories per run (`TAU_MIRROR_DRILL_SAMPLE`). */
  readonly sample: number;
  readonly now?: () => Date;
  readonly report?: (event: Readonly<Record<string, unknown>>) => void;
  readonly signal?: AbortSignal;
  /** Defaults to {@link gitPackChecker}. */
  readonly checkPack?: PackChecker;
  /** Bytes one run reads back before it stops, marked truncated. Defaults to {@link drillByteBudget}. */
  readonly byteBudget?: number;
  /** Wall time one run may take before it stops, failing `deadline`. Defaults to {@link drillDeadlineMilliseconds}. */
  readonly deadlineMilliseconds?: number;
};

/** One run reads back at most 4 GiB (one more object may cross it): a few minutes of B2 egress. */
export const drillByteBudget = 4 * 1024 * 1024 * 1024;

/** One run ends after 30 minutes, so a stalled B2 read cannot hold the drill for good. */
export const drillDeadlineMilliseconds = 30 * 60 * 1000;

/** Without input for this long, `index-pack` is stalled and is killed. */
const packStallMilliseconds = 2 * 60 * 1000;

export type DrillResult = {
  readonly outcome: 'pass' | 'fail' | 'skipped';
  readonly repositories: number;
  readonly objects: number;
  readonly bytes: number;
  readonly failed: Readonly<Partial<Record<DrillCheck, number>>>;
  readonly seconds: number;
  /** True when the byte budget stopped the run before every sampled repository was read whole. */
  readonly truncated: boolean;
};

/** A lock B2 or MinIO reports to the second may sit below the millisecond Postgres recorded. */
const lockToleranceMilliseconds = 1000;

const chainLimit = 100_000;

/**
 * `git index-pack --stdin` into a scratch bare repository: git checks the
 * header, inflates and resolves every object, and computes the pack's name.
 * One thread, a small delta cache and a 16 MiB big-file threshold (larger blobs
 * are streamed, not inflated whole) keep a 1 GiB pack inside the copier's 1 GB VM;
 * the scratch directory holds the pack on disk and is removed afterwards. A
 * read that feeds it nothing for {@link packStallMilliseconds} kills it, and once
 * its input ends it has `gitCommandTimeoutMilliseconds` to resolve the deltas.
 */
export const gitPackChecker: PackChecker = async (signal) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'tau-mirror-drill-'));
  const repository = path.join(directory, 'check.git');
  const environment = gitChildEnvironment(repository);
  const run = async (args: readonly string[]): Promise<void> =>
    new Promise((resolve, reject) => {
      const child = spawn('git', [...args], { env: environment, stdio: 'ignore' });
      child.once('error', reject);
      child.once('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`git ${args[0] ?? ''} exited ${String(code)}`));
        }
      });
    });
  await run(['init', '--quiet', '--bare', repository]);
  const child = spawn(
    'git',
    [
      '-c',
      'core.deltaBaseCacheLimit=32m',
      '-c',
      'core.bigFileThreshold=16m',
      '--git-dir',
      repository,
      'index-pack',
      '--stdin',
      '--threads=1',
    ],
    {
      env: environment,
      stdio: ['pipe', 'pipe', 'ignore'],
      killSignal: 'SIGKILL',
      ...(signal === undefined ? {} : { signal }),
    },
  );
  let timer: NodeJS.Timeout | undefined;
  const killAfter = (milliseconds: number): void => {
    clearTimeout(timer);
    timer = setTimeout(() => child.kill('SIGKILL'), milliseconds);
  };
  killAfter(packStallMilliseconds);
  let output = '';
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk: string) => {
    output += chunk.slice(0, 256);
  });
  let broken = false;
  child.stdin.on('error', () => {
    broken = true;
  });
  // A child killed by a signal closes with no code; -1 stands for it.
  const exited = new Promise<number>((resolve) => {
    child.once('close', (code) => {
      clearTimeout(timer);
      resolve(code ?? -1);
    });
    child.once('error', () => {
      clearTimeout(timer);
      resolve(-1);
    });
  });
  const cleanup = async (): Promise<void> => {
    await rm(directory, { recursive: true, force: true });
  };
  return {
    write: async (chunk) => {
      if (broken || child.stdin.destroyed) {
        return;
      }
      killAfter(packStallMilliseconds);
      if (!child.stdin.write(chunk)) {
        await new Promise<void>((resolve) => {
          const done = (): void => {
            child.stdin.off('drain', done);
            child.stdin.off('close', done);
            resolve();
          };
          child.stdin.once('drain', done);
          child.stdin.once('close', done);
        });
      }
    },
    end: async () => {
      killAfter(gitCommandTimeoutMilliseconds);
      child.stdin.end();
      const code = await exited;
      await cleanup();
      return code === 0 ? /^pack\t([\da-f]{40})$/mu.exec(output)?.[1] : undefined;
    },
    abort: async () => {
      child.kill('SIGKILL');
      await exited;
      await cleanup();
    },
  };
};

/** Scratch repositories of a drill killed mid-check (`tau-mirror-drill-*`), removed at start. */
export const removeDrillScratch = async (directory = tmpdir()): Promise<number> => {
  const names = await readdir(directory);
  const left = names.filter((name) => name.startsWith('tau-mirror-drill-'));
  await Promise.all(left.map(async (name) => rm(path.join(directory, name), { recursive: true, force: true })));
  return left.length;
};

type Tally = {
  objects: number;
  bytes: number;
  /** Every check that failed anywhere in the run. */
  failed: Set<DrillCheck>;
  /** One entry per repository per failed check, for the counts. */
  failures: DrillCheck[];
  /** The byte budget stopped the run. */
  truncated: boolean;
  /** The deadline stopped the run. */
  expired: boolean;
};

/** The run's bounds, beside the caller's own signal. */
type Bounds = {
  readonly deadline: AbortSignal;
  readonly stop?: AbortSignal;
  readonly exhausted: () => boolean;
};

/** The byte budget is spent: no further object is read. */
class DrillBudgetSpent extends Error {
  public constructor() {
    super('the drill read its byte budget');
    this.name = 'DrillBudgetSpent';
  }
}

/** Rejects with the signal's reason once it aborts, whatever `promise` does. */
const untilAborted = async <T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> => {
  if (signal === undefined) {
    return promise;
  }
  signal.throwIfAborted();
  let onAbort: (() => void) | undefined;
  const aborted = new Promise<never>((_resolve, reject) => {
    onAbort = () => {
      reject(signal.reason as Error);
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
  try {
    return await Promise.race([promise, aborted]);
  } finally {
    if (onAbort !== undefined) {
      signal.removeEventListener('abort', onAbort);
    }
  }
};

/**
 * The copy as one run sees it: every call ends when the run's signal aborts,
 * even one whose response stalls, and no object is opened past the budget.
 */
const boundedReader = (copy: CopyReader, exhausted: () => boolean): CopyReader => ({
  name: copy.name,
  async *listVersions(prefix, signal) {
    const pages = copy.listVersions(prefix, signal)[Symbol.asyncIterator]();
    for (;;) {
      // oxlint-disable-next-line no-await-in-loop -- one listing page at a time
      const next = await untilAborted(pages.next(), signal);
      if (next.done === true) {
        return;
      }
      yield next.value;
    }
  },
  head: async (key, versionId, signal) => untilAborted(copy.head(key, versionId, signal), signal),
  get: async (key, versionId, signal): Promise<Readable> => {
    if (exhausted()) {
      throw new DrillBudgetSpent();
    }
    const stream = await untilAborted(copy.get(key, versionId, signal), signal);
    return signal === undefined ? stream : addAbortSignal(signal, stream);
  },
});

/** Reads one version, feeding a pack check from the same read when one is given. */
const digestVersion = async (
  context: DrillContext,
  version: DestinationVersion,
  check?: PackCheck,
): Promise<ObjectDigest> =>
  digestStream(await context.copy.get(version.key, version.versionId, context.signal), check?.write);

/** True when the version is locked at least to `lockedUntil`. */
const lockedAtLeast = async (
  context: DrillContext,
  version: DestinationVersion,
  lockedUntil: Date | undefined,
): Promise<boolean> => {
  if (lockedUntil === undefined) {
    return false;
  }
  const head = await context.copy.head(version.key, version.versionId, context.signal);
  return (head?.retainUntil?.getTime() ?? 0) + lockToleranceMilliseconds >= lockedUntil.getTime();
};

type Verified = { version: DestinationVersion; digest: ObjectDigest } | { failure: DrillCheck };

/**
 * The first version of `key` that `accepts` (newest first), so a forged later
 * version is skipped for the one that verifies. `missing` when the copy holds
 * no version, otherwise `failure` from the last version tried.
 */
// oxlint-disable-next-line max-params -- one key of one repository, its listing and its rule
const firstVerifying = async (
  context: DrillContext,
  index: CopyIndex,
  key: string,
  accepts: (version: DestinationVersion) => Promise<DrillCheck | ObjectDigest>,
): Promise<Verified> => {
  const versions = index.versions.get(key) ?? [];
  let failure: DrillCheck = 'missing';
  for (const version of versions) {
    context.signal?.throwIfAborted();
    // oxlint-disable-next-line no-await-in-loop -- one version at a time keeps memory to one chunk
    const outcome = await accepts(version);
    if (typeof outcome === 'string') {
      failure = outcome;
      continue;
    }
    return { version, digest: outcome };
  }
  return { failure };
};

// oxlint-disable-next-line max-params -- one pack of one repository
const verifyPack = async (
  context: DrillContext,
  locator: RepositoryLocator,
  pack: Manifest['packs'][number],
  index: CopyIndex,
): Promise<Verified> => {
  const sha1 = packHash(pack.key);
  if (sha1 === undefined) {
    return { failure: 'checksum' };
  }
  const checker = context.checkPack ?? gitPackChecker;
  return firstVerifying(context, index, repositoryKey(locator, pack.key), async (version) => {
    if (version.bytes !== pack.bytes) {
      return 'checksum';
    }
    const check = await checker(context.signal);
    let digest: ObjectDigest;
    try {
      digest = await digestVersion(context, version, check);
    } catch (error) {
      await check.abort();
      throw error;
    }
    const named = await check.end();
    if (!packVerifies(digest, sha1, pack.bytes)) {
      return 'checksum';
    }
    return named === sha1 ? digest : 'pack';
  });
};

/** Follows the push-log chain from `earlierPushes` to its first segment, oldest version of each key first. */
// oxlint-disable-next-line max-params -- one repository's chain over its listing
const verifyChain = async (
  context: DrillContext,
  locator: RepositoryLocator,
  manifest: Manifest,
  index: CopyIndex,
): Promise<{ versions: DestinationVersion[]; bytes: number } | undefined> => {
  const used: DestinationVersion[] = [];
  let bytes = 0;
  const seen = new Set<string>();
  let next = manifest.earlierPushes ?? undefined;
  while (next !== undefined) {
    if (seen.has(next) || seen.size >= chainLimit) {
      return undefined;
    }
    seen.add(next);
    const versions = [...(index.versions.get(repositoryKey(locator, next)) ?? [])].reverse();
    let previous: string | undefined | false = false;
    for (const version of versions) {
      // oxlint-disable-next-line no-await-in-loop -- segments are a few kilobytes, followed one link at a time
      const parsed = await readSegment(context, version);
      if (parsed !== undefined) {
        used.push(version);
        bytes += version.bytes;
        previous = parsed.previous;
        break;
      }
    }
    if (previous === false) {
      return undefined;
    }
    next = previous;
  }
  return { versions: used, bytes };
};

const segmentByteLimit = 1024 * 1024;

const readSegment = async (
  context: DrillContext,
  version: DestinationVersion,
): Promise<{ previous: string | undefined } | undefined> => {
  if (version.bytes > segmentByteLimit) {
    return undefined;
  }
  const chunks: Array<Uint8Array<ArrayBuffer>> = [];
  for await (const chunk of await context.copy.get(version.key, version.versionId, context.signal)) {
    chunks.push(Buffer.from(chunk as Uint8Array<ArrayBuffer>));
  }
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')) as { previous?: unknown; pushes?: unknown };
    if (!Array.isArray(parsed.pushes)) {
      return undefined;
    }
    if (parsed.previous === null || parsed.previous === undefined) {
      return { previous: undefined };
    }
    return typeof parsed.previous === 'string' && /^pushes\/[\w.-]+\.json$/u.test(parsed.previous)
      ? { previous: parsed.previous }
      : undefined;
  } catch {
    return undefined;
  }
};

/** Every check for one sampled repository. Never throws: an unexpected error is the `error` check. */
// oxlint-disable-next-line max-params -- one repository of one run, within the run's bounds
const verifyRepository = async (
  context: DrillContext,
  candidate: CopyCandidate,
  tally: Tally,
  bounds: Bounds,
): Promise<void> => {
  const failed = new Set<DrillCheck>();
  const locator = repositoryLocator({ ownerId: candidate.ownerId, projectId: candidate.projectId });
  try {
    const index = await listCopy(context.copy, repositoryPrefix(locator), context.signal);
    const lfsIndex = await listCopy(context.copy, lfsPrefix(locator), context.signal);
    if (index.hidden + lfsIndex.hidden > 0) {
      failed.add('hidden_versions');
    }
    const generation = snapshotVersions(locator, index).filter(
      (version) => version.generation === candidate.copiedGeneration,
    );
    const snapshot =
      candidate.copiedManifestSha256 === undefined
        ? undefined
        : await findSnapshot(context.copy, generation, candidate.copiedManifestSha256, context.signal);
    if (snapshot === undefined) {
      if (bounds.exhausted()) {
        // A version left unread is no evidence against the copy.
        tally.truncated = true;
        return;
      }
      failed.add('snapshot');
      return;
    }
    tally.objects += 1;
    tally.bytes += snapshot.bytes.byteLength;
    if (isTombstoned(snapshot.manifest)) {
      // A purged repository's snapshot is the whole of its copy; nothing else is kept locked.
      return;
    }
    const used: DestinationVersion[] = [snapshot.version];
    for (const pack of snapshot.manifest.packs) {
      // oxlint-disable-next-line no-await-in-loop -- one object in flight bounds memory and disk
      const verified = await verifyPack(context, locator, pack, index);
      if ('failure' in verified) {
        failed.add(verified.failure);
        continue;
      }
      used.push(verified.version);
      tally.objects += 1;
      tally.bytes += verified.digest.bytes;
      if (!pack.indexStored) {
        continue;
      }
      // oxlint-disable-next-line no-await-in-loop -- same
      const stored = await firstVerifying(
        context,
        index,
        repositoryKey(locator, indexKeyFor(pack.key)),
        async (version) => {
          const digest = await digestVersion(context, version);
          return indexVerifies(digest, packHash(pack.key) ?? '') ? digest : 'checksum';
        },
      );
      if ('failure' in stored) {
        failed.add(stored.failure);
        continue;
      }
      used.push(stored.version);
      tally.objects += 1;
      tally.bytes += stored.digest.bytes;
    }
    const chain = await verifyChain(context, locator, snapshot.manifest, index);
    if (chain === undefined) {
      failed.add('push_log');
    } else {
      used.push(...chain.versions);
      tally.objects += chain.versions.length;
      tally.bytes += chain.bytes;
    }
    for (const object of await context.ledger.copiedLfsObjects(candidate.projectId)) {
      // oxlint-disable-next-line no-await-in-loop -- one object in flight
      const verified = await firstVerifying(context, lfsIndex, lfsKey(locator, object.oid), async (version) => {
        if (version.bytes !== object.sizeBytes) {
          return 'lfs';
        }
        const digest = await digestVersion(context, version);
        return lfsVerifies(digest, object.oid, object.sizeBytes) ? digest : 'lfs';
      });
      if ('failure' in verified) {
        failed.add(verified.failure === 'missing' ? 'missing' : 'lfs');
        continue;
      }
      used.push(verified.version);
      tally.objects += 1;
      tally.bytes += verified.digest.bytes;
    }
    for (const version of used) {
      // oxlint-disable-next-line no-await-in-loop -- free HEADs, one at a time
      if (!(await lockedAtLeast(context, version, candidate.copyLockedUntil))) {
        failed.add('retention');
        break;
      }
    }
  } catch (error) {
    bounds.stop?.throwIfAborted();
    if (error instanceof DrillBudgetSpent) {
      tally.truncated = true;
    } else if (!bounds.deadline.aborted) {
      failed.add('error');
    }
  } finally {
    if (bounds.deadline.aborted && bounds.stop?.aborted !== true) {
      // Whatever failed was cut short: the run's evidence is that it ran out of time.
      failed.clear();
      failed.add('deadline');
      tally.expired = true;
    }
    for (const check of failed) {
      tally.failed.add(check);
    }
    tally.failures.push(...failed);
  }
};

/** Seeds the freshness gauge from the newest passing row, so a restart does not read as a stale drill. */
export const exportLastDrillPass = async (context: DrillContext): Promise<void> => {
  const at = await context.ledger.lastPass(context.environment);
  if (at !== undefined) {
    context.metrics.drillPassed(context.environment, at);
  }
};

/** One drill run. Throws only when the run could not be recorded at all. */
export const runVerifyDrill = async (context: DrillContext): Promise<DrillResult> => {
  const now = context.now ?? (() => new Date());
  const startedAt = now();
  const started = performance.now();
  const sample = await context.ledger.sample(context.sample);
  if (sample.length === 0) {
    const skipped: DrillResult = {
      outcome: 'skipped',
      repositories: 0,
      objects: 0,
      bytes: 0,
      failed: {},
      seconds: 0,
      truncated: false,
    };
    context.report?.({ event: 'tau_mirror.drill', environment: context.environment, ...skipped });
    return skipped;
  }
  const id = await context.ledger.start(context.environment, startedAt);
  const tally: Tally = { objects: 0, bytes: 0, failed: new Set(), failures: [], truncated: false, expired: false };
  const budget = context.byteBudget ?? drillByteBudget;
  const exhausted = (): boolean => tally.bytes >= budget;
  const deadline = AbortSignal.timeout(context.deadlineMilliseconds ?? drillDeadlineMilliseconds);
  const signal = context.signal === undefined ? deadline : AbortSignal.any([context.signal, deadline]);
  const bounded: DrillContext = { ...context, copy: boundedReader(context.copy, exhausted), signal };
  const bounds: Bounds = { deadline, exhausted, ...(context.signal === undefined ? {} : { stop: context.signal }) };
  let repositories = 0;
  for (const candidate of sample) {
    if (tally.expired || exhausted()) {
      tally.truncated ||= exhausted();
      break;
    }
    repositories += 1;
    // oxlint-disable-next-line no-await-in-loop -- one repository at a time; the copier keeps polling meanwhile
    await verifyRepository(bounded, candidate, tally, bounds);
  }
  const seconds = (performance.now() - started) / 1000;
  const failed: Partial<Record<DrillCheck, number>> = {};
  for (const check of tally.failures) {
    failed[check] = (failed[check] ?? 0) + 1;
  }
  const outcome = tally.failures.length === 0 ? 'pass' : 'fail';
  const finishedAt = now();
  await context.ledger.finish(id, {
    finishedAt,
    outcome,
    failedChecks: [...tally.failed].sort(),
    durations: { verify: Math.round(seconds * 1000) / 1000 },
    restoredBytes: tally.bytes,
  });
  context.metrics.drill(context.environment, { outcome, seconds, bytes: tally.bytes, failed });
  if (outcome === 'pass') {
    context.metrics.drillPassed(context.environment, finishedAt);
  }
  const result: DrillResult = {
    outcome,
    repositories,
    objects: tally.objects,
    bytes: tally.bytes,
    failed,
    seconds,
    truncated: tally.truncated,
  };
  context.report?.({ event: 'tau_mirror.drill', environment: context.environment, ...result });
  return result;
};

/** `tau_mirror`'s side of the drill in Postgres: within its grants (SELECT, and INSERT/UPDATE on `mirror_drill_run`). */
export class PostgresDrillLedger implements DrillLedger {
  public constructor(private readonly database: Database) {}

  public async sample(limit: number): Promise<CopyCandidate[]> {
    const rows = await this.database
      .select(candidateColumns)
      .from(projectGit)
      .innerJoin(project, eq(project.id, projectGit.projectId))
      .where(
        and(
          gt(projectGit.copiedGeneration, 0),
          isNotNull(projectGit.copiedManifestSha256),
          defaultAccount,
          notTombstoned,
        ),
      )
      .orderBy(sql`random()`)
      .limit(limit);
    return rows.map((row) => toCandidate(row));
  }

  public async copiedLfsObjects(projectId: string): Promise<PendingLfsObject[]> {
    return this.database
      .select({ oid: projectGitLfsObject.oid, sizeBytes: projectGitLfsObject.sizeBytes })
      .from(projectGitLfsObject)
      .where(and(eq(projectGitLfsObject.projectId, projectId), isNotNull(projectGitLfsObject.copiedAt)))
      .orderBy(asc(projectGitLfsObject.oid));
  }

  public async start(environment: string, at: Date): Promise<string> {
    const [row] = await this.database
      .insert(mirrorDrillRun)
      .values({ environment, startedAt: at })
      .returning({ id: mirrorDrillRun.id });
    if (row === undefined) {
      throw new Error('mirror_drill_run returned no row');
    }
    return row.id;
  }

  public async finish(id: string, run: DrillRun): Promise<void> {
    await this.database
      .update(mirrorDrillRun)
      .set({
        finishedAt: run.finishedAt,
        outcome: run.outcome,
        failedChecks: [...run.failedChecks],
        durations: run.durations,
        restoredBytes: run.restoredBytes,
      })
      .where(eq(mirrorDrillRun.id, id));
  }

  public async lastPass(environment: string): Promise<Date | undefined> {
    const [row] = await this.database
      .select({ finishedAt: mirrorDrillRun.finishedAt })
      .from(mirrorDrillRun)
      .where(and(eq(mirrorDrillRun.environment, environment), eq(mirrorDrillRun.outcome, 'pass')))
      .orderBy(desc(mirrorDrillRun.finishedAt))
      .limit(1);
    return row?.finishedAt ?? undefined;
  }
}
