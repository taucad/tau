import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MountTable } from '#mount-table.js';
import { createMemoryProvider } from '#backend/memory-provider.js';
import type { FileSystemProvider } from '#types.js';

describe('MountTable', () => {
  let rootProvider: FileSystemProvider;
  let nodeModulesProvider: FileSystemProvider;
  let mountTable: MountTable;

  beforeEach(async () => {
    rootProvider = await createMemoryProvider();
    nodeModulesProvider = await createMemoryProvider();
    mountTable = new MountTable();
  });

  describe('mount / unmount', () => {
    it('should mount and resolve a root provider', () => {
      mountTable.mount('/', rootProvider, { backend: 'memory' });
      const result = mountTable.resolve('/some/file.ts');
      expect(result.provider).toBe(rootProvider);
      expect(result.path).toBe('/some/file.ts');
    });

    it('should unmount a provider', () => {
      mountTable.mount('/', rootProvider, { backend: 'memory' });
      mountTable.unmount('/');
      expect(() => mountTable.resolve('/file.ts')).toThrow();
    });

    it('should throw when no mount matches', () => {
      expect(() => mountTable.resolve('/file.ts')).toThrow();
    });
  });

  describe('longest-prefix matching', () => {
    it('should route /node_modules/ paths to mounted provider', () => {
      mountTable.mount('/', rootProvider, { backend: 'memory' });
      mountTable.mount('/node_modules', nodeModulesProvider, { backend: 'memory' });

      const result = mountTable.resolve('/node_modules/lodash/index.js');
      expect(result.provider).toBe(nodeModulesProvider);
      expect(result.path).toBe('/lodash/index.js');
    });

    it('should route non-/node_modules/ paths to root provider', () => {
      mountTable.mount('/', rootProvider, { backend: 'memory' });
      mountTable.mount('/node_modules', nodeModulesProvider, { backend: 'memory' });

      const result = mountTable.resolve('/src/main.ts');
      expect(result.provider).toBe(rootProvider);
      expect(result.path).toBe('/src/main.ts');
    });

    it('should resolve exact mount prefix path', () => {
      mountTable.mount('/', rootProvider, { backend: 'memory' });
      mountTable.mount('/node_modules', nodeModulesProvider, { backend: 'memory' });

      const result = mountTable.resolve('/node_modules');
      expect(result.provider).toBe(nodeModulesProvider);
      expect(result.path).toBe('/');
    });

    it('should prefer longer prefix over shorter', async () => {
      const scopeProvider = await createMemoryProvider();
      mountTable.mount('/', rootProvider, { backend: 'memory' });
      mountTable.mount('/node_modules', nodeModulesProvider, { backend: 'memory' });
      mountTable.mount('/node_modules/@scope', scopeProvider, { backend: 'memory' });

      const result = mountTable.resolve('/node_modules/@scope/pkg/index.js');
      expect(result.provider).toBe(scopeProvider);
      expect(result.path).toBe('/pkg/index.js');
    });
  });

  describe('listMounts', () => {
    it('should enumerate mounts in longest-prefix-first order', () => {
      mountTable.mount('/', rootProvider, { backend: 'memory' });
      mountTable.mount('/node_modules', nodeModulesProvider, { backend: 'memory' });
      const list = mountTable.listMounts();
      expect(list.map((m) => m.prefix)).toEqual(['/node_modules', '/']);
      expect(list.map((m) => m.provider)).toEqual([nodeModulesProvider, rootProvider]);
    });
  });

  describe('getMountsUnder', () => {
    it('should return child mounts', () => {
      mountTable.mount('/', rootProvider, { backend: 'memory' });
      mountTable.mount('/node_modules', nodeModulesProvider, { backend: 'memory' });

      const children = mountTable.getMountsUnder('/');
      expect(children).toHaveLength(1);
      expect(children[0]!.prefix).toBe('/node_modules');
    });

    it('should return empty for leaf mounts', () => {
      mountTable.mount('/', rootProvider, { backend: 'memory' });
      mountTable.mount('/node_modules', nodeModulesProvider, { backend: 'memory' });

      const children = mountTable.getMountsUnder('/node_modules');
      expect(children).toHaveLength(0);
    });

    it('should not include the mount itself', () => {
      mountTable.mount('/', rootProvider, { backend: 'memory' });
      const children = mountTable.getMountsUnder('/');
      expect(children).toHaveLength(0);
    });
  });

  describe('edge cases', () => {
    it('should handle trailing slashes on resolve', () => {
      mountTable.mount('/', rootProvider, { backend: 'memory' });
      mountTable.mount('/node_modules', nodeModulesProvider, { backend: 'memory' });

      const result = mountTable.resolve('/node_modules/');
      expect(result.provider).toBe(nodeModulesProvider);
      expect(result.path).toBe('/');
    });

    it('should handle root path resolution', () => {
      mountTable.mount('/', rootProvider, { backend: 'memory' });
      const result = mountTable.resolve('/');
      expect(result.provider).toBe(rootProvider);
      expect(result.path).toBe('/');
    });

    it('should maintain sorted order after multiple mount/unmount', async () => {
      mountTable.mount('/', rootProvider, { backend: 'memory' });
      mountTable.mount('/a/b/c', nodeModulesProvider, { backend: 'memory' });
      mountTable.mount('/a', await createMemoryProvider(), { backend: 'memory' });
      mountTable.unmount('/a');
      mountTable.mount('/a/b', await createMemoryProvider(), { backend: 'memory' });

      const result = mountTable.resolve('/a/b/c/file.ts');
      expect(result.provider).toBe(nodeModulesProvider);
      expect(result.path).toBe('/file.ts');
    });
  });

  describe('backend metadata', () => {
    it('should return backend for a project-mounted path', () => {
      mountTable.mount('/', rootProvider, { backend: 'memory' });
      mountTable.mount('/projects/proj_A', nodeModulesProvider, { backend: 'opfs' });
      const backend = mountTable.resolveBackend('/projects/proj_A/main.ts');
      expect(backend).toBe('opfs');
    });

    it('should always include backend in resolution', () => {
      mountTable.mount('/', rootProvider, { backend: 'indexeddb' });
      const resolution = mountTable.resolve('/src/main.ts');
      expect(resolution.backend).toBe('indexeddb');
    });

    it('should return correct backend after mount/unmount cycles', async () => {
      const projectProvider = await createMemoryProvider();
      mountTable.mount('/', rootProvider, { backend: 'memory' });
      mountTable.mount('/projects/A', projectProvider, { backend: 'opfs' });

      expect(mountTable.resolveBackend('/projects/A/file.ts')).toBe('opfs');

      mountTable.unmount('/projects/A');
      expect(mountTable.resolveBackend('/projects/A/file.ts')).toBe('memory');
    });

    it('should pass backend through resolve as well', () => {
      mountTable.mount('/', rootProvider, { backend: 'memory' });
      mountTable.mount('/projects/B', nodeModulesProvider, { backend: 'indexeddb' });
      const resolution = mountTable.resolve('/projects/B/src/app.ts');
      expect(resolution.provider).toBe(nodeModulesProvider);
      expect(resolution.backend).toBe('indexeddb');
    });
  });

  describe('preservePath mounts', () => {
    it('should preserve the full path when preservePath is true', () => {
      mountTable.mount('/', rootProvider, { backend: 'memory' });
      mountTable.mount('/projects/proj_A', nodeModulesProvider, { backend: 'opfs', preservePath: true });

      const result = mountTable.resolve('/projects/proj_A/main.ts');
      expect(result.provider).toBe(nodeModulesProvider);
      expect(result.path).toBe('/projects/proj_A/main.ts');
    });

    it('should preserve the full path for exact prefix match', () => {
      mountTable.mount('/', rootProvider, { backend: 'memory' });
      mountTable.mount('/projects/proj_A', nodeModulesProvider, { backend: 'memory', preservePath: true });

      const result = mountTable.resolve('/projects/proj_A');
      expect(result.provider).toBe(nodeModulesProvider);
      expect(result.path).toBe('/projects/proj_A');
    });

    it('should still strip prefix when preservePath is false', () => {
      mountTable.mount('/', rootProvider, { backend: 'memory' });
      mountTable.mount('/node_modules', nodeModulesProvider, { backend: 'memory' });

      const result = mountTable.resolve('/node_modules/lodash/index.js');
      expect(result.provider).toBe(nodeModulesProvider);
      expect(result.path).toBe('/lodash/index.js');
    });

    it('should carry backend metadata with preservePath mounts', () => {
      mountTable.mount('/', rootProvider, { backend: 'memory' });
      mountTable.mount('/projects/proj_B', nodeModulesProvider, { backend: 'indexeddb', preservePath: true });

      const result = mountTable.resolve('/projects/proj_B/src/app.ts');
      expect(result.backend).toBe('indexeddb');
      expect(result.path).toBe('/projects/proj_B/src/app.ts');
    });
  });

  describe('provider disposal', () => {
    it('should dispose replaced provider when mounting same prefix', () => {
      const disposeSpy = vi.spyOn(rootProvider, 'dispose');
      mountTable.mount('/', rootProvider, { backend: 'memory' });

      const newProvider = { ...rootProvider, dispose: vi.fn() } as unknown as FileSystemProvider;
      mountTable.mount('/', newProvider, { backend: 'indexeddb' });

      expect(disposeSpy).toHaveBeenCalledOnce();
      const result = mountTable.resolve('/file.ts');
      expect(result.provider).toBe(newProvider);
      expect(result.backend).toBe('indexeddb');
    });

    it('should not dispose providers on unmount', () => {
      const disposeSpy = vi.spyOn(rootProvider, 'dispose');
      mountTable.mount('/', rootProvider, { backend: 'memory' });
      mountTable.unmount('/');
      expect(disposeSpy).not.toHaveBeenCalled();
    });
  });

  describe('dispose', () => {
    it('should clear all mounts', () => {
      mountTable.mount('/', rootProvider, { backend: 'memory' });
      mountTable.mount('/node_modules', nodeModulesProvider, { backend: 'memory' });
      mountTable.dispose();
      expect(() => mountTable.resolve('/file.ts')).toThrow();
    });
  });

  describe('webaccess MountConfig discriminator', () => {
    it('should carry workspaceId through to MountEntry for webaccess mounts', async () => {
      const wspProvider = await createMemoryProvider();
      // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- intentional bare-stub `FileSystemDirectoryHandle`; production callers always supply a real handle resolved by the FM machine
      const stubHandle = {} as FileSystemDirectoryHandle;
      mountTable.mount('/projects/proj_A', wspProvider, {
        backend: 'webaccess',
        directoryHandle: stubHandle,
        workspaceId: 'wsp_alpha',
        preservePath: true,
      });

      const list = mountTable.listMounts();
      const entry = list.find((m) => m.prefix === '/projects/proj_A');
      expect(entry?.workspaceId).toBe('wsp_alpha');
    });

    it('should not assign workspaceId for non-webaccess mounts', () => {
      mountTable.mount('/', rootProvider, { backend: 'memory' });
      const entry = mountTable.listMounts().find((m) => m.prefix === '/');
      expect(entry?.workspaceId).toBeUndefined();
    });
  });
});
