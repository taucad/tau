/* oxlint-disable tau-lint/no-direct-indexeddb -- Browser tests inspect the persisted storage contract itself. */
/* oxlint-disable eslint/no-await-in-loop -- Directory-handle traversal is path-ordered and inherently sequential. */
import * as target from '#support/external-target.js';

export type StoredProjectConfig = {
  readonly projectId: string;
  readonly backend: 'indexeddb' | 'opfs' | 'webaccess';
  readonly providerBasePath: string;
  readonly workspaceId?: string;
};

export type ProjectStorageState = {
  readonly pin?: string;
  readonly preference?: { readonly kind: 'home' } | { readonly kind: 'workspace'; readonly workspaceId: string };
  readonly configs: readonly StoredProjectConfig[];
  readonly workspaces: ReadonlyArray<{
    readonly workspaceId: string;
    readonly name: string;
    readonly slug: string;
  }>;
  readonly handleWorkspaceIds: readonly string[];
};

export type PhysicalProjectEvidence = {
  readonly manifestText: string;
  readonly sourceText: string;
};

/** Read a fixture's durable workspace marker. */
export const readOpfsWorkspaceMarker = async (
  fixture: string,
): Promise<Readonly<Record<string, unknown>> | undefined> =>
  target.evaluate(async (fixtureName) => {
    try {
      const root = await navigator.storage.getDirectory();
      const fixtureRoot = await root.getDirectoryHandle(fixtureName);
      const tau = await fixtureRoot.getDirectoryHandle('.tau');
      const marker = await tau.getFileHandle('workspace.json');
      const file = await marker.getFile();
      return JSON.parse(await file.text()) as Readonly<Record<string, unknown>>;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'NotFoundError') {
        return undefined;
      }
      throw error;
    }
  }, fixture);

/** Read the shared project-routing metadata without importing application modules into the browser runner. */
export const readProjectStorageState = async (): Promise<ProjectStorageState> =>
  target.evaluate(async () => {
    const databases = await indexedDB.databases();
    const database = databases.find(({ name }) => name?.endsWith('fs-handles'));
    if (!database?.name) {
      return { configs: [], workspaces: [], handleWorkspaceIds: [] };
    }
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(database.name!);
      request.addEventListener(
        'success',
        () => {
          resolve(request.result);
        },
        { once: true },
      );
      request.addEventListener(
        'error',
        () => {
          reject(request.error ?? new Error('Failed to open project storage metadata'));
        },
        { once: true },
      );
    });
    const result = async <T>(request: IDBRequest<T>): Promise<T> =>
      new Promise<T>((resolve, reject) => {
        request.addEventListener(
          'success',
          () => {
            resolve(request.result);
          },
          { once: true },
        );
        request.addEventListener(
          'error',
          () => {
            reject(request.error ?? new Error('Failed to read project storage metadata'));
          },
          { once: true },
        );
      });
    try {
      const meta = db.transaction('meta').objectStore('meta');
      const pin = await result<unknown>(meta.get('home-storage-backend'));
      const preference = await result<unknown>(meta.get('project-creation-location'));
      const configs = await result<unknown[]>(db.transaction('configs').objectStore('configs').getAll());
      const workspaces = await result<unknown[]>(db.transaction('workspaces').objectStore('workspaces').getAll());
      const handleWorkspaceIds = await result<IDBValidKey[]>(
        db.transaction('handles').objectStore('handles').getAllKeys(),
      );
      return {
        pin: (pin as { backend?: string } | undefined)?.backend,
        preference: (preference as { location?: ProjectStorageState['preference'] } | undefined)?.location,
        configs: configs as ProjectStorageState['configs'],
        workspaces: (workspaces as ProjectStorageState['workspaces']).map(({ workspaceId, name, slug }) => ({
          workspaceId,
          name,
          slug,
        })),
        handleWorkspaceIds: handleWorkspaceIds.map(String),
      };
    } finally {
      db.close();
    }
  });

/** Simulate browser handle eviction while retaining the durable workspace row. */
export const deleteWorkspaceHandle = async (workspaceId: string): Promise<void> =>
  target.evaluate(async (id) => {
    const databases = await indexedDB.databases();
    const database = databases.find(({ name }) => name?.endsWith('fs-handles'));
    if (!database?.name) {
      throw new Error('Project storage metadata database is missing');
    }
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(database.name!);
      request.addEventListener(
        'success',
        () => {
          resolve(request.result);
        },
        { once: true },
      );
      request.addEventListener(
        'error',
        () => {
          reject(request.error ?? new Error('Failed to open project storage metadata'));
        },
        { once: true },
      );
    });
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction('handles', 'readwrite');
        transaction.objectStore('handles').delete(id);
        transaction.addEventListener(
          'complete',
          () => {
            resolve();
          },
          { once: true },
        );
        transaction.addEventListener(
          'error',
          () => {
            reject(transaction.error ?? new Error('Failed to delete workspace handle'));
          },
          { once: true },
        );
      });
    } finally {
      db.close();
    }
  }, workspaceId);

/** Seed the historical duplicate-row incident while retaining one connected canonical workspace. */
export const seedDisconnectedWorkspaceAliases = async (options: {
  readonly canonicalWorkspaceId: string;
  readonly aliasWorkspaceIds: readonly string[];
  readonly retainedConfig?: StoredProjectConfig;
}): Promise<void> =>
  target.evaluate(async ({ canonicalWorkspaceId, aliasWorkspaceIds, retainedConfig }) => {
    const databases = await indexedDB.databases();
    const database = databases.find(({ name }) => name?.endsWith('fs-handles'));
    if (!database?.name) {
      throw new Error('Project storage metadata database is missing');
    }
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(database.name!);
      request.addEventListener(
        'success',
        () => {
          resolve(request.result);
        },
        { once: true },
      );
      request.addEventListener(
        'error',
        () => {
          reject(request.error ?? new Error('Failed to open project storage metadata'));
        },
        { once: true },
      );
    });
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(['configs', 'workspaces', 'handles', 'meta'], 'readwrite');
        const configs = tx.objectStore('configs');
        const read = configs.getAll();
        read.addEventListener('success', () => {
          const rows = read.result as StoredProjectConfig[];
          for (const [index, config] of rows.entries()) {
            if (config.backend === 'webaccess' && config.workspaceId === canonicalWorkspaceId) {
              configs.put({ ...config, workspaceId: aliasWorkspaceIds[index % aliasWorkspaceIds.length] });
            }
          }
          if (retainedConfig) {
            configs.put(retainedConfig);
          }
          for (const [index, workspaceId] of aliasWorkspaceIds.entries()) {
            tx.objectStore('workspaces').put({
              workspaceId,
              name: 'Previous workspace',
              slug: `previous-workspace-${index + 1}`,
              lastConnectedAt: index + 1,
            });
            tx.objectStore('handles').delete(workspaceId);
          }
          tx.objectStore('meta').put({
            key: 'project-creation-location',
            location: { kind: 'workspace', workspaceId: aliasWorkspaceIds[0] },
          });
        });
        tx.addEventListener(
          'complete',
          () => {
            resolve();
          },
          { once: true },
        );
        tx.addEventListener(
          'error',
          () => {
            reject(tx.error ?? new Error('Failed to seed workspace aliases'));
          },
          { once: true },
        );
        tx.addEventListener(
          'abort',
          () => {
            reject(tx.error ?? new Error('Workspace alias seed was aborted'));
          },
          { once: true },
        );
      });
    } finally {
      db.close();
    }
  }, options);

/** Read manifest and authored source from an OPFS directory (Home or a seeded disk fixture). */
export const readOpfsProjectEvidence = async (options: {
  readonly providerBasePath: string;
  readonly fixture?: string;
}): Promise<PhysicalProjectEvidence | undefined> =>
  target.evaluate(async ({ providerBasePath, fixture }) => {
    const readFile = async (root: FileSystemDirectoryHandle, path: string): Promise<string> => {
      const parts = path.split('/').filter(Boolean);
      let directory = root;
      for (const part of parts.slice(0, -1)) {
        directory = await directory.getDirectoryHandle(part);
      }
      const fileHandle = await directory.getFileHandle(parts.at(-1)!);
      const file = await fileHandle.getFile();
      return file.text();
    };
    try {
      let root = await navigator.storage.getDirectory();
      if (fixture) {
        root = await root.getDirectoryHandle(fixture);
      }
      const manifestPath = `${providerBasePath}/tau.json`;
      const manifestText = await readFile(root, manifestPath);
      const manifest = JSON.parse(manifestText) as { assets: { main: { entryPath: string } } };
      const sourceText = await readFile(root, `${providerBasePath}/${manifest.assets.main.entryPath}`);
      return { manifestText, sourceText };
    } catch (error) {
      if (error instanceof DOMException && error.name === 'NotFoundError') {
        return undefined;
      }
      throw error;
    }
  }, options);

/** Read manifest and source bytes from the direct IndexedDB Home provider. */
export const readIndexedDbProjectEvidence = async (
  providerBasePath: string,
): Promise<PhysicalProjectEvidence | undefined> =>
  target.evaluate(async (basePath) => {
    const databases = await indexedDB.databases();
    const database = databases.find(({ name }) => name?.endsWith('-fs-direct'));
    if (!database?.name) {
      return undefined;
    }
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(database.name!);
      request.addEventListener(
        'success',
        () => {
          resolve(request.result);
        },
        { once: true },
      );
      request.addEventListener(
        'error',
        () => {
          reject(request.error ?? new Error('Failed to open IndexedDB Home storage'));
        },
        { once: true },
      );
    });
    const readText = async (path: string): Promise<string | undefined> =>
      new Promise<string | undefined>((resolve, reject) => {
        const request = db.transaction('files').objectStore('files').get(path);
        request.addEventListener(
          'success',
          () => {
            const value = request.result as Uint8Array<ArrayBuffer> | ArrayBuffer | undefined;
            const bytes = value instanceof Uint8Array ? value : value ? new Uint8Array(value) : undefined;
            resolve(bytes ? new TextDecoder().decode(bytes) : undefined);
          },
          { once: true },
        );
        request.addEventListener(
          'error',
          () => {
            reject(request.error ?? new Error(`Failed to read IndexedDB Home path ${path}`));
          },
          { once: true },
        );
      });
    try {
      const manifestText = await readText(`${basePath}/tau.json`);
      if (!manifestText) {
        return undefined;
      }
      const manifest = JSON.parse(manifestText) as { assets: { main: { entryPath: string } } };
      const sourceText = await readText(`${basePath}/${manifest.assets.main.entryPath}`);
      if (sourceText === undefined) {
        throw new Error('IndexedDB Home project source is missing');
      }
      return { manifestText, sourceText };
    } finally {
      db.close();
    }
  }, providerBasePath);

/** Snapshot file text below one direct IndexedDB project root. */
export const readIndexedDbTree = async (providerBasePath: string): Promise<Readonly<Record<string, string>>> =>
  target.evaluate(async (basePath) => {
    const databases = await indexedDB.databases();
    const database = databases.find(({ name }) => name?.endsWith('-fs-direct'));
    if (!database?.name) {
      return {};
    }
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(database.name!);
      request.addEventListener(
        'success',
        () => {
          resolve(request.result);
        },
        { once: true },
      );
      request.addEventListener(
        'error',
        () => {
          reject(request.error ?? new Error('Failed to open IndexedDB Home'));
        },
        { once: true },
      );
    });
    const result = async <T>(request: IDBRequest<T>): Promise<T> =>
      new Promise<T>((resolve, reject) => {
        request.addEventListener(
          'success',
          () => {
            resolve(request.result);
          },
          { once: true },
        );
        request.addEventListener(
          'error',
          () => {
            reject(request.error ?? new Error('Failed to read IndexedDB tree'));
          },
          { once: true },
        );
      });
    try {
      const store = db.transaction('files').objectStore('files');
      const allKeys = await result(store.getAllKeys());
      const keys = allKeys.map(String);
      const root = basePath.replaceAll(/^\/+|\/$/gu, '');
      const prefixes = [`/${root}/`, `${root}/`];
      const entries: Array<readonly [string, string]> = [];
      for (const key of keys.sort()) {
        const prefix = prefixes.find((candidate) => key.startsWith(candidate));
        if (!prefix) {
          continue;
        }
        const value = await result(store.get(key) as IDBRequest<Uint8Array<ArrayBuffer> | ArrayBuffer | undefined>);
        if (value) {
          const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
          entries.push([`/${key.slice(prefix.length)}`, new TextDecoder().decode(bytes)]);
        }
      }
      return Object.fromEntries(entries);
    } finally {
      db.close();
    }
  }, providerBasePath);

/** Snapshot names and file text below an OPFS directory path for no-write assertions. */
export const readOpfsTree = async (fixture: string): Promise<Readonly<Record<string, string>>> =>
  target.evaluate(async (fixtureName) => {
    const root = await navigator.storage.getDirectory();
    let fixtureRoot = root;
    for (const segment of fixtureName.split('/').filter(Boolean)) {
      fixtureRoot = await fixtureRoot.getDirectoryHandle(segment);
    }
    const entries: Array<readonly [string, string]> = [];
    const visit = async (directory: FileSystemDirectoryHandle, prefix: string): Promise<void> => {
      for await (const [name, handle] of directory.entries()) {
        const path = `${prefix}/${name}`;
        if (handle.kind === 'directory') {
          await visit(handle, path);
        } else {
          const file = await handle.getFile();
          entries.push([path, await file.text()]);
        }
      }
    };
    await visit(fixtureRoot, '');
    return Object.fromEntries(entries.sort(([left], [right]) => left.localeCompare(right)));
  }, fixture);

/** Read a project's physical tree through the backend selected by its durable config. */
export const readProjectTree = async (config: StoredProjectConfig): Promise<Readonly<Record<string, string>>> => {
  if (config.backend === 'opfs') {
    return readOpfsTree(config.providerBasePath);
  }
  if (config.backend === 'indexeddb') {
    return readIndexedDbTree(config.providerBasePath);
  }
  throw new Error('Webaccess tree evidence requires the directory-picker fixture handle.');
};
