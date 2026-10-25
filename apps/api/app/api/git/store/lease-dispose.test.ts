import { execFileSync } from 'node:child_process';
import type * as fs from 'node:fs/promises';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { RepositoryStoreError } from '#api/git/store/errors.js';
import { hydrateLease } from '#api/git/store/lease.js';
import { decodeManifest, indexKeyFor } from '#api/git/store/manifest.js';
import { repositoryLocator } from '#api/git/store/locator.js';
import { PackCache } from '#api/git/store/pack-cache.js';
import type { RepositoryStore } from '#api/git/store/port.js';
import { createMemoryRepositoryStore, seedLease } from '#testing/publication-lease.fixture.js';

/* `rm` refuses the one lease directory a test names, and `link` into a gated
   lease waits for its gate after linking; every other call is real. */
const refused = new Set<string>();
let linkGate: { readonly directory: string; readonly open: Promise<void> } | undefined;
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof fs>();
  return {
    ...actual,
    rm: async (...args: Parameters<typeof actual.rm>) => {
      if (refused.has(String(args[0]))) {
        throw Object.assign(new Error('EBUSY: resource busy'), { code: 'EBUSY' });
      }
      return actual.rm(...args);
    },
    link: async (...args: Parameters<typeof actual.link>) => {
      await actual.link(...args);
      const gate = linkGate;
      if (gate !== undefined && String(args[1]).startsWith(gate.directory)) {
        await gate.open;
      }
    },
  };
});

/**
 * DC2 review: a lease whose directory could not be removed still holds its
 * links, so the bytes stay on disk; the cache must keep them pinned rather
 * than offer them to admission as evictable.
 */
describe('lease disposal with the pack cache (DC2)', () => {
  const scratch = mkdtempSync(path.join(tmpdir(), 'tau-dc2-dispose-'));

  afterAll(() => {
    rmSync(scratch, { recursive: true, force: true });
  });

  const seeded = async (
    name: string,
  ): Promise<{ store: RepositoryStore; locator: ReturnType<typeof repositoryLocator> }> => {
    const source = path.join(scratch, `source-${name}`);
    mkdirSync(source);
    const git = (...args: string[]): void => {
      execFileSync('git', args, { cwd: source, stdio: 'ignore' });
    };
    git('init', '--quiet', '--initial-branch=main');
    writeFileSync(path.join(source, 'model.ts'), 'export const d = 1;\n');
    git('add', '.');
    git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '--quiet', '-m', 'one');
    const store = createMemoryRepositoryStore();
    const locator = repositoryLocator({ ownerId: `user-dc2-${name}`, projectId: `proj-dc2-${name}` });
    const lease = await seedLease({ store, ownerId: locator.ownerId, projectId: locator.projectId, source });
    await lease.dispose();
    return { store, locator };
  };

  it('should keep its cache entries pinned when its directory could not be removed', async () => {
    const { store, locator } = await seeded('dispose');
    const cache = new PackCache({ root: path.join(scratch, 'cache'), budgetBytes: async () => 1024 ** 3 });

    const lease = await hydrateLease({ store, locator, parentDirectory: scratch, cache });
    refused.add(lease.directory);
    await expect(lease.dispose()).rejects.toThrow('EBUSY');
    expect(cache.bytes).toBeGreaterThan(0);
    expect(cache.evictableBytes).toBe(0);
    refused.clear();
  });

  it('should give back a hold that lands after its sibling object failed the hydrate', async () => {
    const { store, locator } = await seeded('late');
    const packKey = decodeManifest((await store.readManifest(locator))!.manifest).packs[0]!.key;
    const racing: RepositoryStore = {
      ...store,
      getObject: async (at, key, range) => {
        if (key === indexKeyFor(packKey)) {
          throw new RepositoryStoreError('missing-pack', 'the index is gone');
        }
        return store.getObject(at, key, range);
      },
    };
    const cache = new PackCache({ root: path.join(scratch, 'cache-late'), budgetBytes: async () => 1024 ** 3 });
    /* The pack is linked into the lease but its hold not yet returned when the
       index's refusal fails the hydrate; the gate opens a moment later. */
    linkGate = {
      directory: scratch,
      open: new Promise((resolve) => {
        setTimeout(resolve, 200);
      }),
    };
    await expect(hydrateLease({ store: racing, locator, parentDirectory: scratch, cache })).rejects.toThrow(
      /store lost/,
    );
    await linkGate.open;
    linkGate = undefined;
    await new Promise((resolve) => {
      setTimeout(resolve, 100);
    });
    expect(cache.evictableBytes).toBe(cache.bytes);
  });
});
