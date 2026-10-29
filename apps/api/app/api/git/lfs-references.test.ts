import { execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { LfsReferenceCache, referencedLfsOids, referencedLfsOidsSince } from '#api/git/lfs-references.js';
import type { LfsReferenceBase, RefTips } from '#api/git/lfs-references.js';

/**
 * The receipt's LFS walk, whole and incremental (push latency F4): the walk a
 * push's receipt makes from the repository's last walk must name exactly the
 * set the whole-repository walk names, whatever the push did, because the API
 * applies it as the whole set (`reachableLfsOids`).
 *
 * Real git over a bare repository, no database and no store: the walk is the
 * thing under test, and only git can say what a tip reaches.
 */

const scratch: string[] = [];

afterAll(() => {
  for (const directory of scratch) {
    rmSync(directory, { recursive: true, force: true });
  }
});

const temporary = (label: string): string => {
  const directory = mkdtempSync(path.join(tmpdir(), `tau-lfs-references-${label}-`));
  scratch.push(directory);
  return directory;
};

/* eslint-disable @typescript-eslint/naming-convention -- process environment names */
const isolated = {
  PATH: process.env['PATH'] ?? '/usr/bin:/bin',
  HOME: '/nonexistent',
  LANG: 'C',
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_SYSTEM: '/dev/null',
} as unknown as NodeJS.ProcessEnv;
/* eslint-enable @typescript-eslint/naming-convention -- end of the process environment map */

const git = (cwd: string, ...args: readonly string[]): string =>
  execFileSync('git', args, { cwd, encoding: 'utf8', env: isolated, stdio: ['ignore', 'pipe', 'pipe'] });

/** A git-lfs pointer for fresh content, and the oid it names. */
const pointer = (): { text: string; oid: string } => {
  const bytes = randomBytes(64);
  const oid = createHash('sha256').update(bytes).digest('hex');
  return { text: `version https://git-lfs.github.com/spec/v1\noid sha256:${oid}\nsize 64\n`, oid };
};

/** A client with one commit, and a bare server it pushes to. */
const newRepository = (): {
  client: string;
  server: string;
  /** Commits a new pointer as `name`, and returns its oid. */
  commitPointer: (name: string) => string;
  push: (...refspecs: readonly string[]) => void;
} => {
  const client = temporary('client');
  const server = temporary('server');
  git(server, 'init', '--quiet', '--bare', '.');
  git(client, 'init', '--quiet', '--initial-branch=main', '.');
  git(client, 'config', 'user.name', 'Walk');
  git(client, 'config', 'user.email', 'walk@tau.test');
  writeFileSync(path.join(client, 'main.scad'), 'cube(1);\n');
  git(client, 'add', '.');
  git(client, 'commit', '--quiet', '-m', 'one');
  return {
    client,
    server,
    commitPointer: (name) => {
      const made = pointer();
      writeFileSync(path.join(client, name), made.text);
      git(client, 'add', name);
      git(client, 'commit', '--quiet', '-m', `add ${name}`);
      return made.oid;
    },
    push: (...refspecs) => {
      git(client, 'push', '--quiet', server, ...refspecs);
    },
  };
};

/** The server's refs, as a manifest's ref map names them. */
const tipsOf = (server: string): RefTips =>
  Object.fromEntries(
    git(server, 'for-each-ref', '--format=%(refname) %(objectname)')
      .split('\n')
      .filter((line) => line.length > 0)
      .map((line) => {
        const [ref = '', oid = ''] = line.split(' ');
        return [ref, { oid }];
      }),
  );

/** The base a walk of the server as it stands leaves. */
const baseOf = async (server: string): Promise<LfsReferenceBase> => ({
  tips: tipsOf(server),
  oids: await referencedLfsOids(server),
});

const sorted = (oids: ReadonlySet<string>): string[] => [...oids].sort();

describe('referencedLfsOidsSince', () => {
  it('should add the pointers a fast-forward push brought to the base set, and agree with the whole walk', async () => {
    const repository = newRepository();
    const first = repository.commitPointer('a.stl');
    repository.push('main');
    const base = await baseOf(repository.server);
    expect(sorted(base.oids)).toStrictEqual([first]);

    const second = repository.commitPointer('b.stl');
    writeFileSync(path.join(repository.client, 'large.bin'), randomBytes(4096));
    git(repository.client, 'add', 'large.bin');
    git(repository.client, 'commit', '--quiet', '-m', 'content, never a pointer');
    repository.push('main');

    const walked = await referencedLfsOidsSince(repository.server, { tips: tipsOf(repository.server), base });
    expect(walked.walk).toBe('incremental');
    expect(sorted(walked.oids)).toStrictEqual([first, second].sort());
    expect(sorted(walked.oids)).toStrictEqual(sorted(await referencedLfsOids(repository.server)));
  });

  it('should cover a new branch and an annotated tag the push created', async () => {
    const repository = newRepository();
    const first = repository.commitPointer('a.stl');
    repository.push('main');
    const base = await baseOf(repository.server);

    git(repository.client, 'switch', '--quiet', '-c', 'conflicts/one');
    const branched = repository.commitPointer('b.stl');
    git(repository.client, 'tag', '-a', 'v1', '-m', 'version one');
    repository.push('conflicts/one', 'refs/tags/v1');

    const walked = await referencedLfsOidsSince(repository.server, { tips: tipsOf(repository.server), base });
    expect(walked.walk).toBe('incremental');
    expect(sorted(walked.oids)).toStrictEqual([first, branched].sort());
    expect(sorted(walked.oids)).toStrictEqual(sorted(await referencedLfsOids(repository.server)));
  });

  it('should answer the base itself when no tip moved', async () => {
    const repository = newRepository();
    repository.commitPointer('a.stl');
    repository.push('main');
    const base = await baseOf(repository.server);

    const walked = await referencedLfsOidsSince(repository.server, { tips: tipsOf(repository.server), base });
    expect(walked).toStrictEqual({ oids: base.oids, walk: 'unchanged' });
  });

  it('should walk the whole repository when a ref the base had is gone, and drop what only it reached', async () => {
    const repository = newRepository();
    const kept = repository.commitPointer('a.stl');
    repository.push('main');
    git(repository.client, 'switch', '--quiet', '-c', 'conflicts/gone');
    repository.commitPointer('b.stl');
    repository.push('conflicts/gone');
    const base = await baseOf(repository.server);
    expect(base.oids.size).toBe(2);

    git(repository.server, 'update-ref', '-d', 'refs/heads/conflicts/gone');
    const walked = await referencedLfsOidsSince(repository.server, { tips: tipsOf(repository.server), base });
    expect(walked.walk).toBe('full');
    expect(sorted(walked.oids)).toStrictEqual([kept]);
  });

  it('should walk the whole repository when a moved ref no longer reaches its old tip', async () => {
    const repository = newRepository();
    const kept = repository.commitPointer('a.stl');
    repository.push('main');
    repository.commitPointer('b.stl');
    repository.push('main');
    const base = await baseOf(repository.server);
    expect(base.oids.size).toBe(2);

    git(repository.client, 'reset', '--quiet', '--hard', 'HEAD~1');
    const replacement = repository.commitPointer('c.stl');
    repository.push('--force', 'main');

    const walked = await referencedLfsOidsSince(repository.server, { tips: tipsOf(repository.server), base });
    expect(walked.walk).toBe('full');
    expect(sorted(walked.oids)).toStrictEqual([kept, replacement].sort());
    expect(sorted(walked.oids)).toStrictEqual(sorted(await referencedLfsOids(repository.server)));
  });

  it('should walk the whole repository when the base names a tip this repository does not hold', async () => {
    const repository = newRepository();
    const first = repository.commitPointer('a.stl');
    repository.push('main');
    const base: LfsReferenceBase = {
      tips: { 'refs/heads/main': { oid: 'f'.repeat(40) } },
      oids: new Set(['0'.repeat(64)]),
    };

    const walked = await referencedLfsOidsSince(repository.server, { tips: tipsOf(repository.server), base });
    expect(walked.walk).toBe('full');
    expect(sorted(walked.oids)).toStrictEqual([first]);
  });

  it('should walk the whole repository when there is no base', async () => {
    const repository = newRepository();
    const first = repository.commitPointer('a.stl');
    repository.push('main');

    const walked = await referencedLfsOidsSince(repository.server, { tips: tipsOf(repository.server) });
    expect(walked.walk).toBe('full');
    expect(sorted(walked.oids)).toStrictEqual([first]);
  });

  it('should agree with the whole walk after every push of a longer history', async () => {
    const repository = newRepository();
    repository.push('main');
    let base = await baseOf(repository.server);
    for (let push = 0; push < 6; push += 1) {
      repository.commitPointer(`p${String(push)}.stl`);
      if (push % 2 === 1) {
        repository.commitPointer(`q${String(push)}.stl`);
      }
      if (push === 3) {
        git(repository.client, 'tag', `t${String(push)}`);
      }
      repository.push('main', '--tags');
      // oxlint-disable-next-line no-await-in-loop -- each push's walk starts from the one before
      const walked = await referencedLfsOidsSince(repository.server, { tips: tipsOf(repository.server), base });
      expect(walked.walk).toBe('incremental');
      // oxlint-disable-next-line no-await-in-loop -- the oracle for this push
      expect(sorted(walked.oids)).toStrictEqual(sorted(await referencedLfsOids(repository.server)));
      base = { tips: tipsOf(repository.server), oids: walked.oids };
    }
    expect(base.oids.size).toBe(9);
  });
});

describe('LfsReferenceCache', () => {
  it('should walk a repository whole once and from its last walk after that', async () => {
    const repository = newRepository();
    const cache = new LfsReferenceCache();
    const first = repository.commitPointer('a.stl');
    repository.push('main');
    const cold = await cache.walk('owner/project', repository.server, tipsOf(repository.server));
    expect(cold.walk).toBe('full');

    const second = repository.commitPointer('b.stl');
    repository.push('main');
    const warm = await cache.walk('owner/project', repository.server, tipsOf(repository.server));
    expect(warm.walk).toBe('incremental');
    expect(sorted(warm.oids)).toStrictEqual([first, second].sort());

    const again = await cache.walk('owner/project', repository.server, tipsOf(repository.server));
    expect(again.walk).toBe('unchanged');
  });

  it('should hold at most its bound of repositories, the least recently walked leaving first', async () => {
    const one = newRepository();
    const two = newRepository();
    one.push('main');
    two.push('main');
    const cache = new LfsReferenceCache({ maximumRepositories: 1 });
    await cache.walk('one', one.server, tipsOf(one.server));
    await cache.walk('two', two.server, tipsOf(two.server));
    expect(cache.size).toBe(1);

    const evicted = await cache.walk('one', one.server, tipsOf(one.server));
    expect(evicted.walk).toBe('full');
    const kept = await cache.walk('one', one.server, tipsOf(one.server));
    expect(kept.walk).toBe('unchanged');
  });

  it('should keep no set larger than its bound, and walk such a repository whole every time', async () => {
    const repository = newRepository();
    repository.commitPointer('a.stl');
    repository.push('main');
    const cache = new LfsReferenceCache({ maximumOids: 0 });
    await cache.walk('owner/project', repository.server, tipsOf(repository.server));
    expect(cache.size).toBe(0);
    const again = await cache.walk('owner/project', repository.server, tipsOf(repository.server));
    expect(again.walk).toBe('full');
  });

  it('should hold at most its bound of oids across repositories, the least recently walked leaving first', async () => {
    const one = newRepository();
    const two = newRepository();
    one.commitPointer('a.stl');
    one.commitPointer('b.stl');
    one.push('main');
    two.commitPointer('c.stl');
    two.push('main');
    const cache = new LfsReferenceCache({ maximumTotalOids: 2 });
    await cache.walk('one', one.server, tipsOf(one.server));
    expect(cache.oids).toBe(2);
    await cache.walk('two', two.server, tipsOf(two.server));
    expect(cache.size).toBe(1);
    expect(cache.oids).toBe(1);

    const evicted = await cache.walk('one', one.server, tipsOf(one.server));
    expect(evicted.walk).toBe('full');
    expect(cache.oids).toBe(2);
    const kept = await cache.walk('one', one.server, tipsOf(one.server));
    expect(kept.walk).toBe('unchanged');
    expect(cache.oids).toBe(2);
  });
});
