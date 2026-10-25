import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LeaseAdmission } from '#api/git/admission/lease-admission.js';
import { hydrateAdmittedLease, LeaseRefusedError } from '#api/git/admission/admitted-lease.js';
import { repositoryLocator } from '#api/git/store/locator.js';
import type { RepositoryStore } from '#api/git/store/port.js';
import { createMemoryRepositoryStore, seedLease } from '#testing/publication-lease.fixture.js';

/**
 * DC3: `retire-lfs` (in tau-maintenance, DC4) builds its read-only lease
 * through the same real-byte admission tau-storage uses (DA3), rather than
 * hydrating whatever the disk holds. A lease that does not fit is refused
 * before any pack is read; one that fits gives its reservation back on release.
 */
describe('hydrateAdmittedLease (DC3, retire-lfs)', () => {
  const scratch = mkdtempSync(path.join(tmpdir(), 'tau-dc3-admitted-'));
  const ownerId = 'user-dc3-retire';
  const projectId = 'proj-dc3-retire';
  const locator = repositoryLocator({ ownerId, projectId });
  let store: RepositoryStore;
  let reads = 0;

  beforeAll(async () => {
    const source = path.join(scratch, 'source');
    mkdirSync(source);
    const run = (...args: string[]): void => {
      execFileSync('git', args, { cwd: source, stdio: 'ignore' });
    };
    run('init', '--quiet', '--initial-branch=main');
    writeFileSync(path.join(source, 'model.ts'), 'export const size = 1;\n');
    run('add', '.');
    run('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '--quiet', '-m', 'one');
    const memory = createMemoryRepositoryStore();
    const seeded = await seedLease({ store: memory, ownerId, projectId, source });
    await seeded.dispose();
    store = {
      ...memory,
      getObject: async (...args) => {
        reads += 1;
        return memory.getObject(...args);
      },
    };
  });

  afterAll(() => {
    rmSync(scratch, { recursive: true, force: true });
  });

  it('should refuse a lease that does not fit the disk before reading a pack', async () => {
    reads = 0;
    const admission = new LeaseAdmission({ readFreeBytes: async () => 1024, waitMilliseconds: 0 });
    await expect(
      hydrateAdmittedLease({ store, locator, ownerId, admission, parentDirectory: scratch }),
    ).rejects.toThrow(LeaseRefusedError);
    expect(reads).toBe(0);
    expect(admission.reservedBytes).toBe(0);
  });

  it('should hydrate a lease that fits and give its reservation back on release', async () => {
    reads = 0;
    const admission = new LeaseAdmission({ readFreeBytes: async () => 8 * 1024 ** 3, waitMilliseconds: 0 });
    const admitted = await hydrateAdmittedLease({ store, locator, ownerId, admission, parentDirectory: scratch });
    expect(reads).toBeGreaterThan(0);
    expect(admission.reservedBytes).toBeGreaterThan(0);
    expect(existsSync(admitted.lease.directory)).toBe(true);
    await admitted.release();
    expect(admission.reservedBytes).toBe(0);
    expect(existsSync(admitted.lease.directory)).toBe(false);
  });
});
