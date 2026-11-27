/* oxlint-disable tau-lint/no-direct-indexeddb -- These rows hold the handle database open from a second tab. */
import { describe, expect, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import * as target from '#support/external-target.js';
import { readProjectStorageState } from '#support/project-storage-state.js';

const createHomeProject = async (name: string): Promise<void> => {
  await target.navigate('/projects/new');
  await target.expectVisible(selectors.getByRole('button', { name: 'Create in Home' }), 60_000);
  await target.fill(selectors.getByLabelText('Project Name *'), name);
  await target.click(selectors.getByRole('button', { name: /Create Project/u }));
  await target.expectUrl(/\/w\/home\/[^/]+$/u, 60_000);
};

describe('Home storage engine selection', () => {
  test('prefers and pins OPFS when sync access handles are available', async () => {
    await createHomeProject('OPFS Home Browser Test');

    const state = await readProjectStorageState();
    expect({ pin: state.pin, projectBackends: state.configs.map(({ backend }) => backend) }).toEqual({
      pin: 'opfs',
      projectBackends: ['opfs'],
    });
  });

  test('degrades and pins IndexedDB when the OPFS requirement probe is unavailable', async () => {
    await target.addInitScript(() => {
      Object.defineProperty(navigator.storage, 'getDirectory', { configurable: true, value: undefined });
    });
    await createHomeProject('IndexedDB Home Browser Test');

    const state = await readProjectStorageState();
    expect({ pin: state.pin, projectBackends: state.configs.map(({ backend }) => backend) }).toEqual({
      pin: 'indexeddb',
      projectBackends: ['indexeddb'],
    });
  });
});

const databasePanel = selectors.getByRole('alert', { name: "Tau's local database is unavailable" });

/**
 * In the second tab: hold the handle database open at `version` and never yield, as a tab running another build of
 * Tau does. A version below the current one is what an older build holds; recreating the database at it is the only
 * way a newer profile can be held there. A higher version leaves the page's own open with `VersionError`.
 *
 * Both tabs stand on a static file while the database is replaced: a live Tau page in either one reopens the database
 * at the current version the moment it is deleted, and the hold then fails or holds nothing.
 */
const holdHandleDatabase = async (version: number): Promise<void> => {
  await target.navigate('/robots.txt');
  await target.openSecondary('/robots.txt');
  await target.evaluate(
    async (heldVersion) => {
      const databases = await indexedDB.databases();
      const name = databases.find((database) => database.name?.endsWith('fs-handles'))?.name;
      if (name === undefined) {
        throw new Error('The handle database does not exist yet');
      }
      if (heldVersion < 4) {
        await new Promise<void>((resolve, reject) => {
          const deletion = indexedDB.deleteDatabase(name);
          deletion.addEventListener('success', () => {
            resolve();
          });
          deletion.addEventListener('error', () => {
            reject(deletion.error ?? new Error('delete failed'));
          });
        });
      }
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.open(name, heldVersion);
        request.addEventListener('upgradeneeded', () => {
          const keyPaths: Record<string, string | undefined> = {
            handles: undefined,
            configs: 'projectId',
            workspaces: 'workspaceId',
            meta: 'key',
          };
          for (const [store, keyPath] of Object.entries(keyPaths)) {
            if (!request.result.objectStoreNames.contains(store)) {
              request.result.createObjectStore(store, keyPath === undefined ? undefined : { keyPath });
            }
          }
        });
        request.addEventListener('success', () => {
          (globalThis as { heldDatabase?: IDBDatabase }).heldDatabase = request.result;
          resolve();
        });
        request.addEventListener('error', () => {
          reject(request.error ?? new Error('hold failed'));
        });
      });
    },
    version,
    'secondary',
  );
};

/* T-B5.7 (B5). */
describe('Home storage when the handle database cannot be opened', () => {
  test('shows the blocked copy while another tab holds the database, and opens Home once it closes', async () => {
    await createHomeProject('Blocked Home Browser Test');
    await holdHandleDatabase(3);

    await target.navigate('/');
    await target.expectVisible(databasePanel, 30_000);
    await target.expectVisible(selectors.getByText(/close the other Tau window/iu));
    await target.closeSecondary();
    await target.click(databasePanel.getByRole('button', { name: 'Try again' }));
    await target.expectHidden(databasePanel, 30_000);
  });

  test("offers Reset folder list with Home's engine mirror, and the reset keeps Home on the same engine", async () => {
    await createHomeProject('Mirrored Home Browser Test');
    await holdHandleDatabase(5);

    await target.navigate('/');
    await target.expectVisible(databasePanel, 30_000);
    await target.evaluate(
      () => {
        (globalThis as { heldDatabase?: IDBDatabase }).heldDatabase?.close();
      },
      undefined,
      'secondary',
    );
    await target.closeSecondary();
    await target.click(databasePanel.getByRole('button', { name: 'Reset folder list' }));
    await target.expectHidden(databasePanel, 60_000);

    const state = await readProjectStorageState();
    expect(state.pin).toBe('opfs');
  });

  test("offers no reset without Home's engine mirror", async () => {
    await createHomeProject('Unmirrored Home Browser Test');
    await target.evaluate(() => {
      localStorage.removeItem('tau:home-backend');
    });
    await holdHandleDatabase(5);

    await target.navigate('/');
    await target.expectVisible(selectors.getByRole('button', { name: 'Try again' }), 30_000);
    expect(await target.isVisible(selectors.getByRole('button', { name: 'Reset folder list' }))).toBe(false);
    await target.closeSecondary();
  });
});
