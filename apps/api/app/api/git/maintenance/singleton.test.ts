import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type { DatabaseType } from '#database/database.service.js';
import type { ObjectStorageService } from '#storage/object-storage.service.js';
import type { RepositoryStore } from '#api/git/store/port.js';
import { repositoryLocator } from '#api/git/store/locator.js';
import { collectZeroCountBlobs } from '#api/git/maintenance/blob-collector.js';
import { purgeTombstonedTenants } from '#api/git/maintenance/purge.js';
import { restoreRepository } from '#api/git/maintenance/restore.js';
import { assertSingletonProcessGroup, maintenanceProcessGroup } from '#api/git/maintenance/singleton.js';

/**
 * D21: purge, blob collection and restore run once, in the
 * `revisions-maintenance` process group, and never in an `app` replica. Three
 * independent halves prove it — the guard itself, every job calling it before
 * it touches anything, and nothing in the application importing the jobs at
 * all, by any spelling.
 */

/** `apps/api/app`, which is every module the API can boot. */
const applicationRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

const maintenanceDirectory = path.join(applicationRoot, 'api/git/maintenance');

describe('singleton maintenance group', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('should refuse to run in the request-serving process group', () => {
    expect(() => {
      // eslint-disable-next-line @typescript-eslint/naming-convention -- process environment name
      assertSingletonProcessGroup({ FLY_PROCESS_GROUP: 'app' });
    }).toThrow(/revisions-maintenance/u);
  });

  it('should run in its own process group', () => {
    expect(() => {
      // eslint-disable-next-line @typescript-eslint/naming-convention -- process environment name
      assertSingletonProcessGroup({ FLY_PROCESS_GROUP: maintenanceProcessGroup });
    }).not.toThrow();
  });

  it('should run where no process group is declared, as a local operator run', () => {
    expect(() => {
      assertSingletonProcessGroup({});
    }).not.toThrow();
  });

  it('should refuse every job in the request-serving process group, before it reads anything', async () => {
    vi.stubEnv('FLY_PROCESS_GROUP', 'app');
    const database = mock<DatabaseType>();
    const driver = mock<ObjectStorageService>();
    const store = mock<RepositoryStore>();

    await expect(purgeTombstonedTenants({ database, driver })).rejects.toThrow(/revisions-maintenance/u);
    await expect(collectZeroCountBlobs({ database, driver })).rejects.toThrow(/revisions-maintenance/u);
    await expect(
      restoreRepository({
        source: store,
        primary: store,
        locator: repositoryLocator({ ownerId: 'owner', projectId: 'project' }),
        operator: 'tester',
      }),
    ).rejects.toThrow(/revisions-maintenance/u);
  });

  it('should keep the lifecycle jobs out of every application module', () => {
    /*
     * By module basename rather than by directory, because a provider would be
     * wired in from `apps/api/app/api/git/` with a relative `./maintenance/…`
     * specifier that contains no `api/git/maintenance/` substring at all.
     */
    const listed = execFileSync(
      'grep',
      ['-rlE', String.raw`from '[^']*(purge|blob-collector|restore|singleton)\.js'`, applicationRoot],
      { encoding: 'utf8' },
    );
    const importers = listed
      .split('\n')
      .filter((file) => file.endsWith('.ts') && !file.startsWith(maintenanceDirectory))
      .map((file) => path.relative(applicationRoot, file))
      .sort();

    expect(importers).toStrictEqual(['maintenance-command.ts']);
  });
});
