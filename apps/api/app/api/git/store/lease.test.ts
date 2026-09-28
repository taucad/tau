import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { hydrateLease as HydrateLease } from '#api/git/store/lease.js';
import { repositoryLocator } from '#api/git/store/locator.js';
import type { RepositoryStore } from '#api/git/store/port.js';

/**
 * Every request to the Hosted Remote hydrates a lease, and a push is two
 * requests, so a process spent per lease is spent per request (E10). The count
 * is taken by a `git` on `PATH` that logs each invocation and hands it to the
 * real one — the processes themselves, not a mock of the module that spawns them.
 */
describe('hydrateLease', () => {
  const scratch = mkdtempSync(path.join(tmpdir(), 'tau-lease-test-'));
  const log = path.join(scratch, 'git.log');
  const originalPath = process.env['PATH'];
  /* A repository with no manifest yet: nothing to fetch, so every process the
   * lease spawns is its own setup. */
  const store = { readManifest: async () => undefined } as unknown as RepositoryStore;
  let hydrateLease: typeof HydrateLease;

  beforeAll(async () => {
    const realGit = execFileSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).trim();
    const shims = path.join(scratch, 'bin');
    mkdirSync(shims);
    writeFileSync(path.join(shims, 'git'), `#!/bin/sh\necho "$*" >> '${log}'\nexec '${realGit}' "$@"\n`);
    chmodSync(path.join(shims, 'git'), 0o755);
    // `lease.ts` reads PATH once, when it is first imported.
    process.env['PATH'] = `${shims}:${originalPath ?? ''}`;
    ({ hydrateLease } = await import('#api/git/store/lease.js'));
  });

  afterAll(() => {
    process.env['PATH'] = originalPath;
    rmSync(scratch, { recursive: true, force: true });
  });

  const spawned = (): string[] => readFileSync(log, 'utf8').trim().split('\n');

  it('writes its configuration without a process per key', async () => {
    const lease = await hydrateLease({
      store,
      locator: repositoryLocator({ ownerId: 'owner-e10', projectId: 'proj-e10' }),
      parentDirectory: scratch,
      config: { 'transfer.unpackLimit': '100', 'gc.autoPackLimit': '2' },
    });
    try {
      expect(spawned()).toStrictEqual(['init --bare --quiet --template= --initial-branch=main .']);

      /* Git itself is the reader: every setting is in force, and an override
       * replaces the lease's own value rather than sitting beside it. */
      const read = (key: string): string =>
        execFileSync('git', ['config', '--get-all', key], { cwd: lease.directory, encoding: 'utf8' }).trim();
      expect({
        unpackLimit: read('transfer.unpackLimit'),
        autoPackLimit: read('gc.autoPackLimit'),
        autogc: read('receive.autogc'),
        gcAuto: read('gc.auto'),
        maintenance: read('maintenance.auto'),
        denyDeletes: read('receive.denyDeletes'),
        denyNonFastForwards: read('receive.denyNonFastForwards'),
        fsckObjects: read('receive.fsckObjects'),
        bare: read('core.bare'),
      }).toStrictEqual({
        unpackLimit: '100',
        autoPackLimit: '2',
        autogc: 'false',
        gcAuto: '0',
        maintenance: 'false',
        denyDeletes: 'true',
        denyNonFastForwards: 'true',
        fsckObjects: 'true',
        bare: 'true',
      });
    } finally {
      await lease.dispose();
    }
  }, 60_000);
});
