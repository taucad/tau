import type { PartialDeep } from 'type-fest';
import deepmerge from 'deepmerge';
import type { Build } from '@taucad/types';
import { idPrefix } from '@taucad/types/constants';
import type { StorageProvider } from '#types/storage.types.js';
import { generatePrefixedId } from '#utils/id.utils.js';
import { metaConfig } from '#constants/meta.constants.js';

export class IndexedDbStorageProvider implements StorageProvider {
  private get dbName() {
    return `${metaConfig.databasePrefix}db`;
  }

  private get storeName() {
    return 'builds';
  }

  private get version() {
    return 1;
  }

  public async createBuild(build: Omit<Build, 'id' | 'createdAt' | 'updatedAt'>): Promise<Build> {
    const id = generatePrefixedId(idPrefix.build);
    const timestamp = Date.now();
    const buildWithId = {
      ...build,
      id,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    const db = await this.getDb();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(this.storeName, 'readwrite');
      const store = transaction.objectStore(this.storeName);

      const request = store.add(buildWithId);

      // eslint-disable-next-line unicorn/prefer-add-event-listener -- this is the preferred API for indexedDB
      request.onerror = () => {
        // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- we want to let the actual error be thrown
        reject(request.error);
      };

      request.onsuccess = () => {
        resolve(buildWithId);
      };

      transaction.oncomplete = () => {
        db.close();
      };
    });
  }

  public async updateBuild(
    buildId: string,
    update: PartialDeep<Build>,
    options?: {
      ignoreKeys?: string[];
      /**
       * If true, the updatedAt timestamp will not be updated.
       *
       * This should be removed after hash-checking is added for avoiding
       * unnecessary updates.
       */
      noUpdatedAt?: boolean;
    },
  ): Promise<Build | undefined> {
    const db = await this.getDb();
    const existingBuild = await this.getBuild(buildId);

    if (!existingBuild) {
      return undefined;
    }

    // If update contains an 'id' field matching buildId, treat it as a full build replacement
    // This is the new pattern from the parallel state machine refactor
    const isBuild = 'id' in update && update.id === buildId;

    let updatedBuild: Build;

    if (isBuild) {
      // Full build replacement - no merging needed
      updatedBuild = update as Build;
    } else {
      // Partial update - use deepmerge for backward compatibility
      const mergeIgnoreKeys = new Set(options?.ignoreKeys ?? []);
      const optionalParameters = {
        ...(options?.noUpdatedAt ? {} : { updatedAt: Date.now() }),
      };

      updatedBuild = deepmerge(
        existingBuild,
        { ...update, ...optionalParameters },
        {
          customMerge(key) {
            if (mergeIgnoreKeys.has(key)) {
              return (_source: unknown, target: unknown) => target;
            }

            return undefined;
          },
        },
      ) as Build;
    }

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(this.storeName, 'readwrite');
      const store = transaction.objectStore(this.storeName);

      const request = store.put(updatedBuild);

      // eslint-disable-next-line unicorn/prefer-add-event-listener -- this is the preferred API for indexedDB
      request.onerror = () => {
        // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- we want to let the actual error be thrown
        reject(request.error);
      };

      request.onsuccess = () => {
        resolve(updatedBuild);
      };

      transaction.oncomplete = () => {
        db.close();
      };
    });
  }

  public async getBuilds(options?: { includeDeleted?: boolean }): Promise<Build[]> {
    const db = await this.getDb();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(this.storeName, 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.getAll();

      // eslint-disable-next-line unicorn/prefer-add-event-listener -- this is the preferred API for indexedDB
      request.onerror = () => {
        // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- we want to let the actual error be thrown
        reject(request.error);
      };

      request.onsuccess = () => {
        const builds = request.result as Build[];
        // Filter out deleted builds unless explicitly requested
        const filteredBuilds = options?.includeDeleted ? builds : builds.filter((build) => !build.deletedAt);
        resolve(filteredBuilds);
      };

      transaction.oncomplete = () => {
        db.close();
      };
    });
  }

  public async getBuild(buildId: string): Promise<Build | undefined> {
    const db = await this.getDb();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(this.storeName, 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.get(buildId);

      // eslint-disable-next-line unicorn/prefer-add-event-listener -- this is the preferred API for indexedDB
      request.onerror = () => {
        // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- we want to let the actual error be thrown
        reject(request.error);
      };

      request.onsuccess = () => {
        resolve(request.result as Build | undefined);
      };

      transaction.oncomplete = () => {
        db.close();
      };
    });
  }

  public async deleteBuild(buildId: string): Promise<void> {
    // Get the build to make sure it exists
    const build = await this.getBuild(buildId);
    if (!build) {
      return;
    }

    // Perform soft delete by updating deletedAt timestamp
    await this.updateBuild(buildId, { deletedAt: Date.now() });
  }

  private async getDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);

      // eslint-disable-next-line unicorn/prefer-add-event-listener -- this is the preferred API for indexedDB
      request.onerror = () => {
        // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- we want to let the actual error be thrown
        reject(request.error);
      };

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName, { keyPath: 'id' });
        }
      };
    });
  }
}
