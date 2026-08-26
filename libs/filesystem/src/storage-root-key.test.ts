import { describe, it, expect } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { resolveStorageRootKey } from '#storage-root-key.js';
import { ProviderRegistry } from '#provider-registry.js';

/**
 * The library's blocking decision compares a worker-derived storage-root key
 * with a UI-derived one (blueprint Finding 3). Both sides now call this exact
 * function, so the only remaining drift axis is the database prefix — pinned
 * here against the shapes the UI passes (`metaConfig.databasePrefix === 'tau-'`).
 */
describe('resolveStorageRootKey', () => {
  it('derives the exact key shape for every persistent backend', () => {
    expect(resolveStorageRootKey({ backend: 'indexeddb' }, 'tau-')).toBe('indexeddb:tau-');
    expect(resolveStorageRootKey({ backend: 'opfs' }, 'tau-')).toBe('opfs:origin');
    expect(resolveStorageRootKey({ backend: 'webaccess', workspaceId: 'wsp_alpha' }, 'tau-')).toBe(
      'webaccess:wsp_alpha',
    );
    expect(resolveStorageRootKey({ backend: 'memory', storageRootKey: 'memory:preview:1' }, 'tau-')).toBe(
      'memory:preview:1',
    );
  });

  it('rejects a memory scope that carries no scoped root', () => {
    expect(() => resolveStorageRootKey({ backend: 'memory', storageRootKey: 'memory: ' }, 'tau-')).toThrow(TypeError);
  });

  it('is the same derivation the worker-side registry applies', () => {
    const registry = new ProviderRegistry({ databasePrefix: 'tau-' });

    for (const scope of [
      { backend: 'indexeddb' },
      { backend: 'opfs' },
      { backend: 'webaccess', workspaceId: 'wsp_alpha', directoryHandle: mock<FileSystemDirectoryHandle>() },
    ] as const) {
      expect(registry.resolveStorageRootKey(scope)).toBe(resolveStorageRootKey(scope, 'tau-'));
    }
  });
});
