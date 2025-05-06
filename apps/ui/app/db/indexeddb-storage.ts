import type { PartialDeep } from 'type-fest';
import deepmerge from 'deepmerge';
import type { StorageProvider } from './storage-type.js';
import type { Build } from '@/types/build.js';
import { metaConfig } from '@/config.js';
import { idPrefix } from '@/utils/constants.js';
import { generatePrefixedId } from '@/utils/id.js';

export class IndexedDbStorageProvider implements StorageProvider {
  private get dbName() {
    return `${metaConfig.cookiePrefix}db`;
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
    },
  ): Promise<Build | undefined> {
    const db = await this.getDb();
    const build = await this.getBuild(buildId);

    if (!build) return undefined;

    const mergeIgnoreKeys = new Set(options?.ignoreKeys ?? []);

    const updatedBuild = deepmerge(
      build,
      { ...update, updatedAt: Date.now() },
      {
        customMerge(key) {
          if (mergeIgnoreKeys.has(key)) {
            return (_source: unknown, target: unknown) => target;
          }

          return undefined;
        },
      },
    ) as Build;

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

  public async getBuilds(): Promise<Build[]> {
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
        resolve(request.result as Build[]);
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
    const db = await this.getDb();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(this.storeName, 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.delete(buildId);

      // eslint-disable-next-line unicorn/prefer-add-event-listener -- this is the preferred API for indexedDB
      request.onerror = () => {
        // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- we want to let the actual error be thrown
        reject(request.error);
      };

      request.onsuccess = () => {
        resolve();
      };

      transaction.oncomplete = () => {
        db.close();
      };
    });
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
