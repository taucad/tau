import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { afterAll, describe, expect, it } from 'vitest';
import {
  developmentAttestationPublicKeysJson,
  developmentSigningKeyJson,
} from '#forwarding/contract/development-keys.js';
import { parseSigningKey } from '#forwarding/contract/keys.js';
import { attestationKey, attestationPrefix, readAttestation, recordKey, signAttestation } from '#store/attestation.js';
import { parseAttestationPublicKeys } from '#store/attestation-keys.js';
import { commitLease } from '#store/commit.js';
import type { CommitAttestationArguments, CommitResult } from '#store/commit.js';
import { hydrateLease } from '#store/lease.js';
import { repositoryLocator } from '#store/locator.js';
import { compactionCommitter, decodeManifest } from '#store/manifest.js';
import type { Manifest, PushRecord } from '#store/manifest.js';
import type { RepositoryLocator, RepositoryStore } from '#store/port.js';
import { createMemoryRepositoryStore } from '#testing/publication-lease.fixture.js';

/**
 * The attestation in `commitLease` (cloud backup admission blueprint D3, I4, I5): written before the manifest under
 * the key a reader recomputes from the committed record; the degraded forms that admit instead of refusing (P4b);
 * the 1 ms collision move, which a rebase over a deferred compaction keeps (E10, P4a).
 */

/* eslint-disable @typescript-eslint/naming-convention -- process environment names */
const isolated = {
  PATH: process.env['PATH'] ?? '/usr/bin:/bin',
  HOME: '/nonexistent',
  LANG: 'C',
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_SYSTEM: '/dev/null',
  TAU_GIT_PUSH_ADMITTED: '1',
} as unknown as NodeJS.ProcessEnv;
/* eslint-enable @typescript-eslint/naming-convention -- end of the process environment map */

const scratch: string[] = [];
afterAll(() => {
  for (const directory of scratch) {
    rmSync(directory, { recursive: true, force: true });
  }
});

const temporary = (label: string): string => {
  const directory = mkdtempSync(path.join(tmpdir(), `tau-attest-${label}-`));
  scratch.push(directory);
  return directory;
};

const git = (cwd: string, ...args: readonly string[]): string =>
  execFileSync('git', args, { cwd, encoding: 'utf8', env: isolated, stdio: ['ignore', 'pipe', 'pipe'] }).trim();

const newClient = (): { directory: string; revise: (n: number) => string } => {
  const directory = temporary('client');
  git(directory, 'init', '--quiet', '--initial-branch=main', '.');
  git(directory, 'config', 'user.name', 'Anonymous');
  git(directory, 'config', 'user.email', 'anon:3fa9c1d2@users.noreply.tau.new');
  const revise = (n: number): string => {
    writeFileSync(path.join(directory, 'main.scad'), `cube(${String(n)});\n`);
    git(directory, 'add', '.');
    git(directory, 'commit', '--quiet', '-m', `rev ${String(n)}`);
    return git(directory, 'rev-parse', 'HEAD');
  };
  revise(1);
  return { directory, revise };
};

const signer = parseSigningKey(developmentSigningKeyJson('attestation'), 'test');
const keys = parseAttestationPublicKeys(developmentAttestationPublicKeysJson());
const attest: CommitAttestationArguments = { kind: 'push', signer, identities: [] };

const newLocator = (): RepositoryLocator =>
  repositoryLocator({ ownerId: 'owner-attest', projectId: `proj-${String(Math.random()).slice(2, 10)}` });

const stored = async (store: RepositoryStore, locator: RepositoryLocator): Promise<Manifest> => {
  const read = await store.readManifest(locator);
  if (read === undefined) {
    throw new Error('no manifest');
  }
  return decodeManifest(read.manifest);
};

const newest = (manifest: Manifest): PushRecord => {
  const record = manifest.pushes.at(-1);
  if (record === undefined) {
    throw new Error('no record');
  }
  return record;
};

const push = async (args: {
  store: RepositoryStore;
  locator: RepositoryLocator;
  client: string;
  overrides?: Partial<Parameters<typeof commitLease>[0]>;
}): Promise<CommitResult> => {
  const lease = await hydrateLease({ store: args.store, locator: args.locator, parentDirectory: temporary('lease') });
  try {
    git(args.client, 'push', '--quiet', lease.directory, 'main');
    return await commitLease({ store: args.store, lease, committedBy: 'user_pusher', attest, ...args.overrides });
  } finally {
    await lease.dispose();
  }
};

const objectKeys = async (store: RepositoryStore, locator: RepositoryLocator): Promise<string[]> => {
  const found: string[] = [];
  for await (const object of store.listObjects(locator, 'attestations/')) {
    found.push(object.key);
  }
  return found;
};

describe('the attestation in commitLease (D3)', () => {
  it('should write a verifying attestation under the committed record key and leave the record shape closed', async () => {
    const store = createMemoryRepositoryStore();
    const locator = newLocator();
    const client = newClient();
    const result = await push({ store, locator, client: client.directory });

    const manifest = await stored(store, locator);
    const record = newest(manifest);
    expect(Object.keys(record)).toStrictEqual(['generation', 'committedAt', 'committedBy', 'refs', 'anonymous']);
    const read = await readAttestation({ store, locator, record: recordKey(record), keys });
    expect(read?.attestation).toMatchObject({
      kind: 'push',
      origin: 'admission',
      coverage: 'complete',
      basisInputs: { email: 'none', forge: 'none' },
      refs: [{ ref: 'refs/heads/main', tip: git(client.directory, 'rev-parse', 'main') }],
      commits: { count: 1 },
    });
    expect(result).toMatchObject({
      committed: true,
      attestation: { record: recordKey(record), coverage: 'complete', commits: 1, anonymous: true },
    });
    expect(result.committed && result.degraded).toBeUndefined();
  }, 60_000);

  it('should admit with no attestation when the signing key is missing or the write fails (P4b)', async () => {
    const store = createMemoryRepositoryStore();
    const locator = newLocator();
    const client = newClient();
    const unsigned = await push({
      store,
      locator,
      client: client.directory,
      overrides: { attest: { ...attest, signer: undefined } },
    });
    expect(unsigned).toMatchObject({ committed: true, degraded: ['signing_failed'] });
    expect(unsigned.committed && unsigned.attestation).toBeUndefined();
    expect(await objectKeys(store, locator)).toStrictEqual([]);

    const failing: RepositoryStore = {
      ...store,
      // oxlint-disable-next-line max-params -- the port's own signature
      putObject: async (target, key, body, options, signal) => {
        if (key.startsWith('attestations/')) {
          throw new Error('injected attestation write failure');
        }
        return store.putObject(target, key, body, options, signal);
      },
    };
    client.revise(2);
    const unwritten = await push({ store: failing, locator, client: client.directory });
    expect(unwritten).toMatchObject({ committed: true, degraded: ['write_failed'] });
    const after = await stored(store, locator);
    expect(after.generation).toBe(2);
  }, 60_000);

  it('should write a failed-coverage attestation and mark the record anonymous when the pass has no budget (P4b)', async () => {
    const store = createMemoryRepositoryStore();
    const locator = newLocator();
    const client = newClient();
    git(client.directory, 'config', 'user.email', 'ada@example.com');
    client.revise(2);
    const result = await push({
      store,
      locator,
      client: client.directory,
      overrides: { attest: { ...attest, budgetMilliseconds: 0 } },
    });
    expect(result).toMatchObject({
      committed: true,
      degraded: ['budget_exceeded'],
      attestation: { coverage: 'failed' },
    });
    const record = newest(await stored(store, locator));
    expect(record.anonymous).toBe(true);
    const read = await readAttestation({ store, locator, record: recordKey(record), keys });
    expect(read?.attestation).toMatchObject({ coverage: 'failed', commits: { count: 0 } });
  }, 60_000);

  it('should move at by 1 ms past a key collision, and a rebase over a deferred compaction keeps the moved key (E10)', async () => {
    const store = createMemoryRepositoryStore();
    const locator = newLocator();
    const client = newClient();
    for (let n = 2; n < 5; n += 1) {
      // oxlint-disable-next-line no-await-in-loop -- each push builds on the one before
      await push({ store, locator, client: client.directory });
      client.revise(n);
    }
    /* A push that owes a deferred compaction, and a second lease of its generation, as another member would hold. */
    const owing = await hydrateLease({ store, locator, parentDirectory: temporary('lease') });
    git(client.directory, 'push', '--quiet', owing.directory, 'main');
    const outcome = await commitLease({
      store,
      lease: owing,
      committedBy: 'user_pusher',
      attest,
      packBound: 2,
      deferCompaction: true,
    });
    if (!outcome.committed || outcome.compaction === undefined) {
      throw new Error('the push owed no compaction');
    }
    const racing = await hydrateLease({ store, locator, parentDirectory: temporary('lease') });
    const compacted = await outcome.compaction();
    await owing.dispose();
    expect(compacted.outcome).toBe('committed');

    /* Plant different bytes under the key the racing push will compute at its clock. */
    const at = new Date('2026-11-27T12:00:00.000Z');
    const tip = client.revise(10);
    const planned: PushRecord = {
      generation: 0,
      committedAt: at.toISOString(),
      committedBy: 'user_pusher',
      refs: [{ ref: 'refs/heads/main', tip }],
      anonymous: true,
    };
    const planted = signAttestation(
      {
        record: recordKey(planned),
        kind: 'push',
        origin: 'admission',
        coverage: 'failed',
        basisInputs: { email: 'none', forge: 'none' },
        refs: [],
        commits: [],
      },
      signer,
    );
    for (const object of planted) {
      const bytes = new TextEncoder().encode(object.body);
      // oxlint-disable-next-line no-await-in-loop -- one object
      await store.putObject(locator, object.key, bytes, { contentLength: bytes.byteLength, sha256: '' });
    }

    let rebased: CommitResult;
    try {
      git(client.directory, 'push', '--quiet', racing.directory, 'main');
      rebased = await commitLease({
        store,
        lease: racing,
        committedBy: 'user_pusher',
        attest,
        packBound: 2,
        deferCompaction: true,
        now: () => at,
        faults: async (point) => {
          /* The fault point the blueprint names: the commit is about to write its manifest. */
          expect(point === 'before-manifest-commit' ? 'reached' : point).toBeTruthy();
        },
      });
    } finally {
      await racing.dispose();
    }

    const manifest = await stored(store, locator);
    const record = newest(manifest);
    expect(manifest.pushes.at(-2)?.committedBy).toBe(compactionCommitter);
    expect(record.committedAt).toBe(new Date(at.getTime() + 1).toISOString());
    expect(rebased).toMatchObject({ committed: true, attestation: { record: recordKey(record) } });
    const read = await readAttestation({ store, locator, record: recordKey(record), keys });
    expect(read?.attestation).toMatchObject({ coverage: 'complete', refs: [{ ref: 'refs/heads/main', tip }] });
    /* The planted object is untouched and is not this record's. */
    expect(await objectKeys(store, locator)).toContain(attestationKey(recordKey(planned), signer.kid, 'admission'));
    expect(recordKey(planned)).not.toBe(recordKey(record));
    /* P4a: every account successor has an attestation; the compaction has none. */
    const everyKey = await objectKeys(store, locator);
    for (const each of manifest.pushes) {
      const keysUnder = everyKey.filter((key) => key.startsWith(attestationPrefix(recordKey(each))));
      expect([each.committedBy, keysUnder.length > 0]).toStrictEqual([
        each.committedBy,
        each.committedBy !== compactionCommitter,
      ]);
    }
  }, 120_000);
});
