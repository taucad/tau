import { execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PassThrough, Readable } from 'node:stream';
import { afterAll, describe, expect, it } from 'vitest';
import { developmentSigningKeyJson } from '#api/git/forwarding/contract/development-keys.js';
import { mintGrant, storagePath } from '#api/git/forwarding/contract/grant.js';
import type { StorageGrant } from '#api/git/forwarding/contract/grant.js';
import { parseSigningKey } from '#api/git/forwarding/contract/keys.js';
import type { StorageReceiptFacts } from '#api/git/forwarding/contract/receipt.js';
import type { FaultPoint } from '#api/git/store/fault-points.js';
import { livePackBound } from '#api/git/store/limits.js';
import { repositoryLocator } from '#api/git/store/locator.js';
import { compactionCommitter, decodeManifest } from '#api/git/store/manifest.js';
import type { Manifest } from '#api/git/store/manifest.js';
import type { RepositoryStore } from '#api/git/store/port.js';
import { StorageGitService } from '#api/git/worker/storage-git.service.js';
import { createMemoryRepositoryStore } from '#testing/publication-lease.fixture.js';

/**
 * A push's compaction off the reply path (push latency F2): the push past the
 * pack bound is answered once its own pack is committed, and its compaction
 * runs after, over the same lease, under its own conditional write — giving
 * way to a push already on its way, and reporting its generation to the API.
 *
 * Real `receive-pack` over the worker's own lease, against the in-memory
 * store: the order of the reply, the compaction and the posted receipts is
 * the behaviour under test.
 */

const scratch: string[] = [];

afterAll(() => {
  for (const directory of scratch) {
    rmSync(directory, { recursive: true, force: true });
  }
});

/* eslint-disable @typescript-eslint/naming-convention -- process environment names */
const isolated = {
  PATH: process.env['PATH'] ?? '/usr/bin:/bin',
  HOME: '/nonexistent',
  LANG: 'C',
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_SYSTEM: '/dev/null',
} as unknown as NodeJS.ProcessEnv;
/* eslint-enable @typescript-eslint/naming-convention -- end of the process environment map */

const git = (cwd: string, args: readonly string[], input?: string): Uint8Array<ArrayBuffer> =>
  execFileSync('git', args, { cwd, env: isolated, input, stdio: ['pipe', 'pipe', 'pipe'] }) as Uint8Array<ArrayBuffer>;

const gitText = (cwd: string, args: readonly string[]): string => new TextDecoder().decode(git(cwd, args)).trim();

const key = parseSigningKey(developmentSigningKeyJson('grant'), 'grant');

/** A git-lfs pointer for fresh content, and the oid it names. */
const pointer = (): { text: string; oid: string } => {
  const bytes = randomBytes(64);
  const oid = createHash('sha256').update(bytes).digest('hex');
  return { text: `version https://git-lfs.github.com/spec/v1\noid sha256:${oid}\nsize 64\n`, oid };
};

/** One pkt-line. */
const packetLine = (text: string): Uint8Array<ArrayBuffer> =>
  Buffer.concat([Buffer.from((text.length + 4).toString(16).padStart(4, '0')), Buffer.from(text)]);

/** A repository the worker serves, and a client that pushes to it through `receivePack`. */
const newRepository = (
  options: { readonly store?: RepositoryStore } = {},
): {
  store: RepositoryStore;
  owner: string;
  project: string;
  client: string;
  /** Commits a new pointer, returning its oid. */
  commitPointer: () => string;
  /** Commits a plain revision. */
  revise: () => void;
  /** The smart-HTTP body `git push` sends for `branch` (`main` by default), against the stored tip. */
  pushBody: (branch?: string) => Promise<Uint8Array<ArrayBuffer>>;
  grant: () => StorageGrant;
  read: () => Promise<Manifest | undefined>;
} => {
  const store = options.store ?? createMemoryRepositoryStore();
  const owner = `user-${randomBytes(4).toString('hex')}`;
  const project = `proj-${randomBytes(4).toString('hex')}`;
  const locator = repositoryLocator({ ownerId: owner, projectId: project });
  const client = mkdtempSync(path.join(tmpdir(), 'tau-deferred-compaction-'));
  scratch.push(client);
  git(client, ['init', '--quiet', '--initial-branch=main', '.']);
  git(client, ['config', 'user.name', 'Push']);
  git(client, ['config', 'user.email', 'push@tau.test']);
  let revision = 0;
  const commit = (name: string, text: string): void => {
    writeFileSync(path.join(client, name), text);
    git(client, ['add', name]);
    git(client, ['commit', '--quiet', '-m', `revision ${String(revision)}`]);
  };
  const read = async (): Promise<Manifest | undefined> => {
    const stored = await store.readManifest(locator);
    return stored === undefined ? undefined : decodeManifest(stored.manifest);
  };
  return {
    store,
    owner,
    project,
    client,
    commitPointer: () => {
      revision += 1;
      const made = pointer();
      commit(`model-${String(revision)}.stl`, made.text);
      return made.oid;
    },
    revise: () => {
      revision += 1;
      commit('main.scad', `cube(${String(revision)});\n`);
    },
    pushBody: async (branch = 'main') => {
      const tip = gitText(client, ['rev-parse', branch]);
      const stored = await read();
      const old = stored?.refs[`refs/heads/${branch}`]?.oid;
      const command = `${old ?? '0'.repeat(40)} ${tip} refs/heads/${branch}\0report-status\n`;
      const pack = git(
        client,
        ['pack-objects', '--stdout', '--revs', '--quiet'],
        `${tip}\n${old === undefined ? '' : `^${old}\n`}`,
      );
      return Buffer.concat([packetLine(command), Buffer.from('0000'), pack]);
    },
    grant: () =>
      mintGrant(
        {
          method: 'POST',
          path: storagePath(project, 'git-receive-pack'),
          owner,
          project,
          callerId: owner,
          committedBy: owner,
          remainingBytes: 64 * 1024 ** 2,
          storageLimitBytes: 64 * 1024 ** 2,
          recordedGeneration: 0,
          route: { store: 'r2', authoritative: true },
        },
        { key },
      ).grant,
    read,
  };
};

/** A worker whose receipts are the facts themselves, signed or posted, so a test can read them. */
const newWorker = (
  store: RepositoryStore,
  options: { readonly beforePost?: (facts: StorageReceiptFacts) => Promise<void> } = {},
): { service: StorageGitService; signed: StorageReceiptFacts[]; posted: StorageReceiptFacts[] } => {
  const signed: StorageReceiptFacts[] = [];
  const posted: StorageReceiptFacts[] = [];
  const service = new StorageGitService({
    store,
    receipts: {
      sign: (facts) => {
        signed.push(facts);
        return JSON.stringify(facts);
      },
      post: async (facts) => {
        await options.beforePost?.(facts);
        posted.push(facts);
      },
    },
  });
  service.slowBodyMinimumBytes = 0;
  return { service, signed, posted };
};

/** Pushes `branch` (`main` by default) through the worker; what the push left running is not awaited. */
const push = async (
  service: StorageGitService,
  repository: ReturnType<typeof newRepository>,
  branch?: string,
): Promise<{ report: string; receipt: StorageReceiptFacts | undefined }> => {
  const result = await service.receivePack({
    grant: repository.grant(),
    body: Readable.from([await repository.pushBody(branch)]),
    gzipped: false,
  });
  return {
    report: new TextDecoder().decode(result.report),
    receipt: result.receipt === undefined ? undefined : (JSON.parse(result.receipt) as StorageReceiptFacts),
  };
};

/** A promise and the function that resolves it. */
const gate = (): { opened: Promise<void>; open: () => void } => {
  let open: () => void = () => undefined;
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { opened, open };
};

describe('StorageGitService deferred compaction (push latency F2)', () => {
  it('should answer the push past the bound before it compacts, then compact and report the generation', async () => {
    const repository = newRepository();
    const { service, posted } = newWorker(repository.store);
    const first = repository.commitPointer();
    for (let pushes = 0; pushes < livePackBound; pushes += 1) {
      // oxlint-disable-next-line no-await-in-loop -- each push builds on the generation before it
      await push(service, repository);
      repository.revise();
    }
    await service.settled();
    const filled = await repository.read();
    expect(filled?.packs).toHaveLength(livePackBound);
    expect(posted).toStrictEqual([]);

    /* The compaction is held at its repack, after the reply went out. */
    const held = gate();
    const reached = gate();
    service.faults = async (point: FaultPoint) => {
      if (point === 'mid-compaction') {
        reached.open();
        await held.opened;
      }
    };
    const last = repository.commitPointer();
    const answered = await push(service, repository);
    await reached.opened;

    expect(answered.report).toContain('ok refs/heads/main');
    const pushed = await repository.read();
    expect(pushed?.packs).toHaveLength(livePackBound + 1);
    expect(answered.receipt).toMatchObject({ kind: 'commit', generation: pushed?.generation });
    /* The receipt's LFS walk started from the last one and still names the whole set. */
    expect(answered.receipt?.reachableLfsOids).toStrictEqual([first, last].sort());
    expect(posted).toStrictEqual([]);

    held.open();
    await service.settled();

    const compacted = await repository.read();
    expect(compacted?.generation).toBe((pushed?.generation ?? 0) + 1);
    expect(compacted?.refs).toStrictEqual(pushed?.refs);
    expect(compacted?.packs.length).toBeLessThanOrEqual(2);
    expect(compacted?.pushes.at(-1)).toMatchObject({ committedBy: compactionCommitter, refs: [] });
    const [report, retained] = posted;
    expect(report).toMatchObject({
      kind: 'commit',
      generation: compacted?.generation,
      incarnation: compacted?.incarnation,
      /* It moved no ref; the push's own receipt announces the push. */
      movedRefs: [],
      reachableLfsOids: answered.receipt?.reachableLfsOids,
    });
    /* A fresh request id: the push's own receipt already claimed `(rid, commit)` in the API's ledger. */
    expect(report?.rid).not.toBe(answered.receipt?.rid);
    expect(retained).toMatchObject({ kind: 'retained', generation: compacted?.generation });
    expect(posted).toHaveLength(2);
  }, 120_000);

  it('should give way to a push for the project already in flight, which then owes and runs the compaction', async () => {
    const repository = newRepository();
    const { service, posted } = newWorker(repository.store);
    for (let pushes = 0; pushes < livePackBound; pushes += 1) {
      repository.revise();
      // oxlint-disable-next-line no-await-in-loop -- each push builds on the generation before it
      await push(service, repository);
    }
    await service.settled();

    const held = gate();
    const reached = gate();
    let compactions = 0;
    service.faults = async (point: FaultPoint) => {
      if (point === 'mid-compaction') {
        compactions += 1;
        if (compactions === 1) {
          reached.open();
          await held.opened;
        }
      }
    };
    repository.revise();
    await push(service, repository);
    await reached.opened;
    const answered = await repository.read();

    /* The next push is admitted and hydrated while the first push's compaction waits; its body has not arrived. */
    repository.revise();
    const body = await repository.pushBody();
    const arriving = new PassThrough();
    const next = service.receivePack({ grant: repository.grant(), body: arriving, gzipped: false });
    held.open();
    await service.settled();

    /* The compaction gave way: nothing was committed over the push it followed. */
    const unmoved = await repository.read();
    expect(unmoved?.generation).toBe(answered?.generation);
    expect(posted).toStrictEqual([]);

    arriving.end(body);
    const nextResult = await next;
    const report = new TextDecoder().decode(nextResult.report);
    expect(report).toContain('ok refs/heads/main');
    await service.settled();

    /* The next push committed, owed the compaction in turn, and ran it. */
    const settled = await repository.read();
    expect(settled?.generation).toBe((answered?.generation ?? 0) + 2);
    expect(settled?.packs.length).toBeLessThanOrEqual(2);
    expect(settled?.pushes.at(-1)).toMatchObject({ committedBy: compactionCommitter });
    expect(posted.map((facts) => facts.kind)).toStrictEqual(['commit', 'retained']);
  }, 120_000);

  it('should give the lease and its admission back before it posts its receipt', async () => {
    const repository = newRepository();
    const posting = gate();
    const reached = gate();
    const { service, posted } = newWorker(repository.store, {
      beforePost: async (facts) => {
        if (facts.kind === 'commit') {
          reached.open();
          await posting.opened;
        }
      },
    });
    for (let pushes = 0; pushes <= livePackBound; pushes += 1) {
      repository.revise();
      // oxlint-disable-next-line no-await-in-loop -- each push builds on the generation before it
      await push(service, repository);
    }

    await reached.opened;
    /* The compaction committed and its receipt is on its way: nothing is reserved any more. */
    const compacted = await repository.read();
    expect(compacted?.pushes.at(-1)?.committedBy).toBe(compactionCommitter);
    expect(service.reservedLeaseBytes).toBe(0);

    posting.open();
    await service.settled();
    expect(posted.map((facts) => facts.kind)).toStrictEqual(['commit', 'retained']);
  }, 120_000);

  it('should give way to a ref removal for the project, which commits; the compaction does not', async () => {
    const repository = newRepository();
    const { service, posted } = newWorker(repository.store);
    repository.revise();
    await push(service, repository);
    gitText(repository.client, ['switch', '--quiet', '-c', 'conflicts/main/laptop']);
    repository.revise();
    const branched = await push(service, repository, 'conflicts/main/laptop');
    expect(branched.report).toContain('ok refs/heads/conflicts');
    gitText(repository.client, ['switch', '--quiet', 'main']);
    for (let pushes = 2; pushes < livePackBound; pushes += 1) {
      repository.revise();
      // oxlint-disable-next-line no-await-in-loop -- each push builds on the generation before it
      await push(service, repository);
    }
    await service.settled();

    /* The compaction holds at its repack; the removal, which compacts inline, holds at its own. */
    const held = gate();
    const reached = gate();
    const removalHeld = gate();
    const removalReached = gate();
    let compactions = 0;
    service.faults = async (point: FaultPoint) => {
      if (point === 'mid-compaction') {
        compactions += 1;
        if (compactions === 1) {
          reached.open();
          await held.opened;
        } else if (compactions === 2) {
          removalReached.open();
          await removalHeld.opened;
        }
      }
    };
    repository.revise();
    await push(service, repository);
    await reached.opened;
    const answered = await repository.read();
    const side = answered?.refs['refs/heads/conflicts/main/laptop']?.oid;

    const removing = service.removeRef({
      ...repository.grant(),
      ref: 'refs/heads/conflicts/main/laptop',
      tip: side,
    });
    await removalReached.opened;
    /* The removal is in flight and has not committed: only its registration can make the compaction give way. */
    held.open();
    await service.settled();
    const unmoved = await repository.read();
    expect(unmoved?.generation).toBe(answered?.generation);
    removalHeld.open();
    const removed = await removing;
    await service.settled();

    const settled = await repository.read();
    expect(removed.generation).toBe((answered?.generation ?? 0) + 1);
    expect(settled?.generation).toBe(removed.generation);
    expect(settled?.refs['refs/heads/conflicts/main/laptop']).toBeUndefined();
    expect(settled?.pushes.at(-1)?.committedBy).not.toBe(compactionCommitter);
    expect(posted.map((facts) => facts.kind)).not.toContain('commit');
  }, 120_000);

  it('should run only the newest owed compaction when a push owes one while another is repacking', async () => {
    const repository = newRepository();
    const { service, posted } = newWorker(repository.store);
    for (let pushes = 0; pushes < livePackBound; pushes += 1) {
      repository.revise();
      // oxlint-disable-next-line no-await-in-loop -- each push builds on the generation before it
      await push(service, repository);
    }
    await service.settled();

    const held = gate();
    const reached = gate();
    let compactions = 0;
    service.faults = async (point: FaultPoint) => {
      if (point === 'mid-compaction') {
        compactions += 1;
        if (compactions === 1) {
          reached.open();
          await held.opened;
        }
      }
    };
    repository.revise();
    await push(service, repository);
    await reached.opened;

    /* Push B commits while A repacks, and owes a compaction of its own. */
    repository.revise();
    const second = await push(service, repository);
    expect(second.report).toContain('ok refs/heads/main');
    const pushed = await repository.read();
    expect(pushed?.packs).toHaveLength(livePackBound + 2);
    held.open();
    await service.settled();

    /* A gave way without a marker or an upload; B's compaction ran once and committed. */
    expect(compactions).toBe(2);
    const settled = await repository.read();
    expect(settled?.generation).toBe((pushed?.generation ?? 0) + 1);
    expect(settled?.pushes.at(-1)?.committedBy).toBe(compactionCommitter);
    expect(settled?.packs.length).toBeLessThanOrEqual(2);
    expect(posted.map((facts) => facts.kind)).toStrictEqual(['commit', 'retained']);
    const locator = repositoryLocator({ ownerId: repository.owner, projectId: repository.project });
    const markers: string[] = [];
    for await (const object of repository.store.listObjects(locator, 'retired/')) {
      markers.push(object.key);
    }
    const live = new Set(settled?.packs.map((pack) => path.posix.basename(pack.key)));
    expect(markers.filter((key) => live.has(key.slice(key.indexOf('-') + 1)))).toStrictEqual([]);
    expect(markers).toHaveLength((pushed?.packs.length ?? 0) - 1);
  }, 120_000);
});
