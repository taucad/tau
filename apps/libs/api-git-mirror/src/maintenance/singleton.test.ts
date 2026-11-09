import { afterEach, describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type { DatabaseType } from '@taucad/api-database';
import type { ObjectStorageService } from '@taucad/api-object-storage';
import type { RepositoryStore } from '@taucad/api-git-core/store/port';
import { repositoryLocator } from '@taucad/api-git-core/store/locator';
import { collectZeroCountBlobs } from '#maintenance/blob-collector.js';
import { purgeTombstonedTenants as streamTombstonedTenants } from '#maintenance/purge.js';

import { restoreRepository } from '#maintenance/restore.js';
import { assertSingletonProcessGroup, maintenanceProcessGroup } from '#maintenance/singleton.js';

const purgeTombstonedTenants = async (...args: Parameters<typeof streamTombstonedTenants>) =>
  Array.fromAsync(streamTombstonedTenants(...args));

/**
 * D21: purge, blob collection and restore run once, in the
 * `revisions-maintenance` process group, and never in an `app` replica. Three
 * independent halves prove it — the guard itself, every job calling it before
 * it touches anything, and nothing in the application importing the jobs at
 * all, by any spelling.
 */

/* The third half, that no application module imports the jobs, is `apps/api/app/maintenance-isolation.test.ts`. */

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
        database,
        source: store,
        primary: store,
        locator: repositoryLocator({ ownerId: 'owner', projectId: 'project' }),
        operator: 'tester',
      }),
    ).rejects.toThrow(/revisions-maintenance/u);
  });
});
