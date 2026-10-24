import { describe, expect, it } from 'vitest';
import { repositoryLocator } from '#api/git/store/locator.js';
import type { RepositoryLocator } from '#api/git/store/port.js';
import { copyRepository } from '#api/git/mirror/copier.js';
import { runVerifyDrill } from '#api/git/mirror/drill.js';
import type { DrillContext, DrillLedger, DrillRun, PackChecker } from '#api/git/mirror/drill.js';
import { lfsKey, repositoryKey, repositoryPrefix } from '#api/git/mirror/keys.js';
import { MirrorMetrics } from '#api/git/mirror/metrics.js';
import { harness, last, recordingMeter, total } from '#api/git/mirror/mirror.fixture.js';
import type { Harness } from '#api/git/mirror/mirror.fixture.js';
import type { CopyCandidate, PendingLfsObject } from '#api/git/mirror/watermark.js';

/**
 * DR2-lite, the verify drill `tau-mirror` runs daily: a random sample of copied
 * repositories, read back from the copy alone with read calls only, each proved
 * against the trust root Postgres holds. Doubles here; the real B2 stand-in,
 * PostgreSQL and `git index-pack` are `drill.integration.test.ts`.
 */

const alice = repositoryLocator({ ownerId: 'user_alice', projectId: 'proj_one' });
const bob = repositoryLocator({ ownerId: 'user_bob', projectId: 'proj_two' });

class FakeDrillLedger implements DrillLedger {
  public readonly runs = new Map<string, DrillRun & { environment: string; startedAt: Date }>();

  public constructor(private readonly h: Harness) {}

  public async sample(limit: number): Promise<CopyCandidate[]> {
    const rows = [...this.h.ledger.rows.values()].filter(
      (row) => row.copiedGeneration > 0 && row.copiedManifestSha256 !== undefined,
    );
    return Promise.all(rows.slice(0, limit).map(async (row) => (await this.h.ledger.candidate(row.projectId))!));
  }

  public async copiedLfsObjects(projectId: string): Promise<PendingLfsObject[]> {
    return this.h.ledger.lfs
      .filter((row) => row.projectId === projectId && row.copiedAt !== undefined)
      .map(({ oid, sizeBytes }) => ({ oid, sizeBytes }));
  }

  public async start(environment: string, at: Date): Promise<string> {
    const id = `run_${String(this.runs.size + 1)}`;
    this.runs.set(id, {
      environment,
      startedAt: at,
      finishedAt: at,
      outcome: 'fail',
      failedChecks: ['unfinished'],
      durations: {},
      restoredBytes: 0,
    });
    return id;
  }

  public async finish(id: string, run: DrillRun): Promise<void> {
    const started = this.runs.get(id)!;
    this.runs.set(id, { ...started, ...run });
  }

  public async lastPass(environment: string): Promise<Date | undefined> {
    return [...this.runs.values()].findLast((run) => run.environment === environment && run.outcome === 'pass')
      ?.finishedAt;
  }
}

/** A pack checker that accepts what hashes to the expected name, as `index-pack` would name it. */
const namingChecker =
  (accept = true): PackChecker =>
  async () => {
    const chunks: Array<Uint8Array<ArrayBuffer>> = [];
    return {
      write: async (chunk) => {
        chunks.push(chunk);
      },
      end: async () => (accept ? Buffer.concat(chunks).subarray(-20).toString('hex') : undefined),
      abort: async () => undefined,
    };
  };

const copied = async (h: Harness, locator: RepositoryLocator) => {
  const manifest = h.source.push(locator, h.time.now());
  h.ledger.recordGeneration(locator, manifest.generation);
  const result = await copyRepository(h.context, (await h.ledger.candidate(locator.projectId))!);
  expect(result.outcome).toBe('copied');
  return manifest;
};

const drill = (h: Harness, overrides: Partial<DrillContext> = {}) => {
  const { meter, recorded } = recordingMeter();
  const ledger = new FakeDrillLedger(h);
  const events: Array<Readonly<Record<string, unknown>>> = [];
  const context: DrillContext = {
    copy: h.destination,
    ledger,
    metrics: new MirrorMetrics(meter),
    environment: 'staging',
    sample: 3,
    now: h.time.now,
    report: (event) => events.push(event),
    checkPack: namingChecker(),
    ...overrides,
  };
  return { context, ledger, recorded, events };
};

const callsAfter = (h: Harness, mark: number): string[] => [...new Set(h.destination.calls.slice(mark))].sort();

describe('runVerifyDrill', () => {
  it('should pass a copy that verifies, record the run, emit its metrics and one count-only log line', async () => {
    const h = harness();
    const lfs = h.source.addLfs(alice, 'a large file');
    h.ledger.addLfsRow(alice, lfs, new Date(h.time.now().getTime() - 1000));
    await copied(h, alice);
    await copied(h, alice);
    await copied(h, bob);
    const mark = h.destination.calls.length;
    const { context, ledger, recorded, events } = drill(h);

    const result = await runVerifyDrill(context);

    expect(result.failed).toStrictEqual({});
    expect(result).toMatchObject({ outcome: 'pass', repositories: 2 });
    // Alice: snapshot, two packs, two indexes, one LFS object; bob: snapshot, one pack, one index.
    expect(result.objects).toBe(9);
    expect(callsAfter(h, mark)).toStrictEqual(['get', 'head', 'listVersions']);
    const [run] = [...ledger.runs.values()];
    expect(run).toMatchObject({ environment: 'staging', outcome: 'pass', failedChecks: [] });
    expect(run?.restoredBytes).toBe(result.bytes);
    expect(Object.keys(run?.durations ?? {})).toStrictEqual(['verify']);
    expect(total(recorded, 'tau.mirror.drill_runs', { environment: 'staging', outcome: 'pass' })).toBe(1);
    expect(last(recorded, 'tau.mirror.drill_last_success_timestamp_seconds', { environment: 'staging' })).toBe(
      Math.floor(h.time.now().getTime() / 1000),
    );
    expect(total(recorded, 'tau.mirror.drill_verified_bytes', { environment: 'staging' })).toBe(result.bytes);
    expect(recorded.get('tau.mirror.drill_duration_seconds')).toHaveLength(1);
    expect(events).toStrictEqual([
      {
        event: 'tau_mirror.drill',
        environment: 'staging',
        outcome: 'pass',
        repositories: 2,
        objects: 9,
        bytes: result.bytes,
        failed: {},
        seconds: expect.any(Number),
      },
    ]);
    expect(JSON.stringify(events)).not.toMatch(/proj_|user_/u);
  });

  it('should find the trusted snapshot past a newer forged version, and fail when none matches the trust root', async () => {
    const h = harness();
    const manifest = await copied(h, alice);
    const [snapshot] = h.destination.keys(`${repositoryPrefix(alice)}manifests/`);
    const forged = new TextEncoder().encode(JSON.stringify({ ...manifest, refs: {} }));
    h.destination.objects.get(snapshot!)!.push({
      versionId: 'forged',
      bytes: new Uint8Array(forged),
      retainUntil: new Date(h.time.now().getTime() + 40 * 24 * 60 * 60 * 1000),
      hide: false,
      modifiedAt: new Date(h.time.now().getTime() + 1000),
    });

    const passing = await runVerifyDrill(drill(h).context);
    expect(passing.outcome).toBe('pass');

    h.ledger.row('proj_one').copiedManifestSha256 = '0'.repeat(64);
    const failing = await runVerifyDrill(drill(h).context);

    expect(failing).toMatchObject({ outcome: 'fail', failed: { snapshot: 1 } });
  });

  it('should use the version of a pack that verifies, and fail checksum when no version does', async () => {
    const h = harness();
    const manifest = await copied(h, alice);
    const key = repositoryKey(alice, manifest.packs[0]!.key);
    const [good] = h.destination.objects.get(key)!;
    h.destination.objects.get(key)!.push({ ...good!, versionId: 'truncated', bytes: good!.bytes.slice(0, 10) });

    const passing = await runVerifyDrill(drill(h).context);
    expect(passing.outcome).toBe('pass');

    good!.bytes = new Uint8Array(good!.bytes.byteLength);
    const { context, recorded, ledger } = drill(h);
    const failing = await runVerifyDrill(context);

    expect(failing).toMatchObject({ outcome: 'fail', failed: { checksum: 1 } });
    expect(total(recorded, 'tau.mirror.drill_runs', { outcome: 'fail' })).toBe(1);
    expect(total(recorded, 'tau.mirror.drill_check_failures', { check: 'checksum' })).toBe(1);
    expect([...ledger.runs.values()][0]).toMatchObject({ outcome: 'fail', failedChecks: ['checksum'] });
  });

  it('should fail pack when git does not accept the bytes as a pack', async () => {
    const h = harness();
    await copied(h, alice);

    const result = await runVerifyDrill(drill(h, { checkPack: namingChecker(false) }).context);

    expect(result).toMatchObject({ outcome: 'fail', failed: { pack: 1 } });
  });

  it('should fail retention when a version is locked short of the lock Postgres records', async () => {
    const h = harness();
    const manifest = await copied(h, alice);
    const key = repositoryKey(alice, `${manifest.packs[0]!.key.slice(0, -5)}.idx`);
    h.destination.objects.get(key)![0]!.retainUntil = new Date(h.time.now().getTime() + 1000);

    const result = await runVerifyDrill(drill(h).context);

    expect(result).toMatchObject({ outcome: 'fail', failed: { retention: 1 } });
  });

  it('should fail lfs for an object that is not its oid, missing for a pack the copy lacks, and count hide markers', async () => {
    const h = harness();
    const lfs = h.source.addLfs(alice, 'an LFS object');
    h.ledger.addLfsRow(alice, lfs, new Date(h.time.now().getTime() - 1000));
    const manifest = await copied(h, alice);
    h.destination.objects.get(lfsKey(alice, lfs.oid))![0]!.bytes = new Uint8Array(Buffer.from('an LFS objecT'));
    const pack = repositoryKey(alice, manifest.packs[0]!.key);
    h.destination.objects.delete(pack);
    h.destination.hide(repositoryKey(alice, `${manifest.packs[0]!.key.slice(0, -5)}.idx`));

    const result = await runVerifyDrill(drill(h).context);

    expect(result).toMatchObject({ outcome: 'fail', failed: { lfs: 1, missing: 1, hidden_versions: 1 } });
  });

  it('should record nothing and report a skip when nothing has been copied yet', async () => {
    const h = harness();
    const { context, ledger, events, recorded } = drill(h);

    const result = await runVerifyDrill(context);

    expect(result.outcome).toBe('skipped');
    expect(ledger.runs.size).toBe(0);
    expect(total(recorded, 'tau.mirror.drill_runs')).toBe(0);
    expect(events).toMatchObject([{ event: 'tau_mirror.drill', outcome: 'skipped', repositories: 0 }]);
  });
});
