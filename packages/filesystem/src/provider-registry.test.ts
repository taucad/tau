import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { ProviderRegistry } from '#provider-registry.js';
import { isMissingWorkspaceHandleError } from '#workspace-errors.js';
import type { FileSystemProvider } from '#types.js';
import type { WorkspaceScope } from '#mount-table.js';

const createMockHandle = (name: string): FileSystemDirectoryHandle => mock<FileSystemDirectoryHandle>({ name });

const memoryScope: WorkspaceScope = { backend: 'memory' };
const indexeddbScope: WorkspaceScope = { backend: 'indexeddb' };
const opfsScope: WorkspaceScope = { backend: 'opfs' };
const webaccessScope = (workspaceId: string, handleName = 'mount-dir'): WorkspaceScope => ({
  backend: 'webaccess',
  directoryHandle: createMockHandle(handleName),
  workspaceId,
});

vi.mock('#backend/direct-idb-provider.js', () => {
  class MockDirectIdbProvider {
    public id = 'indexeddb';
    public capabilities = { persistent: true, writable: true, quotaBased: true };
    public readFile = vi.fn() as FileSystemProvider['readFile'];
    public writeFile = vi.fn();
    public readdir = vi.fn();
    public stat = vi.fn();
    public mkdir = vi.fn();
    public unlink = vi.fn();
    public rmdir = vi.fn();
    public rename = vi.fn();
    public exists = vi.fn();
    public lstat = vi.fn();
    public dispose = vi.fn();
    public initialize = vi.fn();
  }
  // eslint-disable-next-line @typescript-eslint/naming-convention -- Module export must match class name
  return { DirectIdbProvider: MockDirectIdbProvider };
});

vi.mock('#backend/memory-provider.js', () => {
  class MockMemoryProvider {
    public id = 'memory';
    public capabilities = { persistent: false, writable: true, quotaBased: false };
    public readFile = vi.fn() as FileSystemProvider['readFile'];
    public writeFile = vi.fn();
    public readdir = vi.fn();
    public stat = vi.fn();
    public mkdir = vi.fn();
    public unlink = vi.fn();
    public rmdir = vi.fn();
    public rename = vi.fn();
    public exists = vi.fn();
    public lstat = vi.fn();
    public dispose = vi.fn();
  }
  // eslint-disable-next-line @typescript-eslint/naming-convention -- Module export must match class name
  return { MemoryProvider: MockMemoryProvider };
});

vi.mock('#backend/fs-access-provider.js', () => {
  class MockFileSystemAccessProvider {
    public id = 'webaccess';
    public capabilities = { persistent: true, writable: true, quotaBased: false };
    public readFile = vi.fn() as FileSystemProvider['readFile'];
    public writeFile = vi.fn();
    public readdir = vi.fn();
    public stat = vi.fn();
    public mkdir = vi.fn();
    public unlink = vi.fn();
    public rmdir = vi.fn();
    public rename = vi.fn();
    public exists = vi.fn();
    public lstat = vi.fn();
    public dispose = vi.fn();
  }
  // eslint-disable-next-line @typescript-eslint/naming-convention -- Module export must match class name
  return { FileSystemAccessProvider: MockFileSystemAccessProvider };
});

vi.mock('#backend/opfs-provider.js', () => {
  class MockOPFSProvider {
    public id = 'opfs';
    public capabilities = { persistent: true, writable: true, quotaBased: true };
    public readFile = vi.fn() as FileSystemProvider['readFile'];
    public writeFile = vi.fn();
    public readdir = vi.fn();
    public stat = vi.fn();
    public mkdir = vi.fn();
    public unlink = vi.fn();
    public rmdir = vi.fn();
    public rename = vi.fn();
    public exists = vi.fn();
    public lstat = vi.fn();
    public dispose = vi.fn();
    public initialize = vi.fn();
  }
  // eslint-disable-next-line @typescript-eslint/naming-convention -- Module export must match class name
  return { OPFSProvider: MockOPFSProvider };
});

describe('ProviderRegistry', () => {
  let registry: ProviderRegistry;

  beforeEach(() => {
    vi.clearAllMocks();
    registry = new ProviderRegistry();
  });

  describe('constructor', () => {
    it('should accept custom databasePrefix', async () => {
      const custom = new ProviderRegistry({ databasePrefix: 'custom' });
      const provider = await custom.createMountProvider(indexeddbScope);
      expect(provider.id).toBe('indexeddb');
    });
  });

  describe('getStandaloneProvider', () => {
    it('should return a standalone provider cached separately from mount providers', async () => {
      const mount = await registry.createMountProvider(memoryScope);
      const standalone = await registry.getStandaloneProvider(memoryScope);
      expect(mount).not.toBe(standalone);
    });

    it('should cache standalone providers', async () => {
      const first = await registry.getStandaloneProvider(memoryScope);
      const second = await registry.getStandaloneProvider(memoryScope);
      expect(first).toBe(second);
    });

    it('should cache webaccess standalone providers per workspaceId', async () => {
      const scopeA = webaccessScope('wsp_aaa', 'A');
      const scopeB = webaccessScope('wsp_bbb', 'B');
      const a1 = await registry.getStandaloneProvider(scopeA);
      const a2 = await registry.getStandaloneProvider(scopeA);
      const b1 = await registry.getStandaloneProvider(scopeB);
      expect(a1).toBe(a2);
      expect(a1).not.toBe(b1);
    });
  });

  describe('invalidateStandaloneProvider', () => {
    it('should dispose and remove standalone provider for a backend', async () => {
      const standalone = await registry.getStandaloneProvider(memoryScope);
      registry.invalidateStandaloneProvider('memory');
      expect(standalone.dispose).toHaveBeenCalled();

      const renewed = await registry.getStandaloneProvider(memoryScope);
      expect(renewed).not.toBe(standalone);
    });

    it('should not affect subsequent provider creation when no standalone exists', async () => {
      registry.invalidateStandaloneProvider('memory');
      const provider = await registry.getStandaloneProvider(memoryScope);
      expect(provider).toBeDefined();
      expect(provider.id).toBe('memory');
    });

    it('should drop only the targeted webaccess workspaceId entry', async () => {
      const scopeA = webaccessScope('wsp_aaa', 'A');
      const scopeB = webaccessScope('wsp_bbb', 'B');
      const a = await registry.getStandaloneProvider(scopeA);
      const b = await registry.getStandaloneProvider(scopeB);

      registry.invalidateStandaloneProvider('webaccess', 'wsp_aaa');
      expect(a.dispose).toHaveBeenCalled();
      expect(b.dispose).not.toHaveBeenCalled();

      const aNext = await registry.getStandaloneProvider(scopeA);
      const bNext = await registry.getStandaloneProvider(scopeB);
      expect(aNext).not.toBe(a);
      expect(bNext).toBe(b);
    });

    it('should drop every webaccess entry when called without a workspaceId', async () => {
      const a = await registry.getStandaloneProvider(webaccessScope('wsp_aaa', 'A'));
      const b = await registry.getStandaloneProvider(webaccessScope('wsp_bbb', 'B'));
      registry.invalidateStandaloneProvider('webaccess');
      expect(a.dispose).toHaveBeenCalled();
      expect(b.dispose).toHaveBeenCalled();
    });
  });

  describe('disposeAll', () => {
    it('should dispose all standalone providers', async () => {
      const standalone = await registry.getStandaloneProvider(memoryScope);
      registry.disposeAll();
      expect(standalone.dispose).toHaveBeenCalled();
    });

    it('should allow new provider creation after disposing empty registry', async () => {
      registry.disposeAll();
      const provider = await registry.createMountProvider(memoryScope);
      expect(provider).toBeDefined();
      expect(provider.id).toBe('memory');
    });
  });

  describe('createMountProvider', () => {
    it('should create a provider for the given backend', async () => {
      const provider = await registry.createMountProvider(memoryScope);
      expect(provider.id).toBe('memory');
    });

    it('should create multiple providers of the same backend type', async () => {
      const first = await registry.createMountProvider(memoryScope);
      const second = await registry.createMountProvider(memoryScope);
      expect(first.id).toBe('memory');
      expect(second.id).toBe('memory');
      expect(first).not.toBe(second);
    });

    it('should create webaccess mount provider when scope carries an explicit handle', async () => {
      const provider = await registry.createMountProvider(webaccessScope('wsp_explicit'));
      expect(provider.id).toBe('webaccess');
    });

    it('should throw for unknown backend', async () => {
      // oxlint-disable-next-line no-explicit-any,no-unsafe-argument -- intentionally testing invalid input
      await expect(registry.createMountProvider({ backend: 'nonexistent' } as any)).rejects.toThrow(
        'Unknown backend: nonexistent',
      );
    });
  });

  describe('webaccess backend', () => {
    it('should throw a structured MissingWorkspaceHandleError when scope omits the handle', async () => {
      const error = await registry
        // oxlint-disable-next-line no-explicit-any,no-unsafe-argument -- intentionally invalid scope
        .createMountProvider({ backend: 'webaccess', workspaceId: 'wsp_oops' } as any)
        .catch((caughtError: unknown) => caughtError);
      expect(isMissingWorkspaceHandleError(error)).toBe(true);
    });
  });

  describe('native provider instantiation', () => {
    it('should create DirectIdbProvider for indexeddb backend', async () => {
      const provider = await registry.createMountProvider(indexeddbScope);
      expect(provider.id).toBe('indexeddb');
      expect(provider.capabilities).toEqual({ persistent: true, writable: true, quotaBased: true });
    });

    it('should create OPFSProvider for opfs backend', async () => {
      const provider = await registry.createMountProvider(opfsScope);
      expect(provider.id).toBe('opfs');
      expect(provider.capabilities).toEqual({ persistent: true, writable: true, quotaBased: true });
    });

    it('should create FileSystemAccessProvider for webaccess backend with handle', async () => {
      const provider = await registry.createMountProvider(webaccessScope('wsp_local', 'local-dir'));
      expect(provider.id).toBe('webaccess');
      expect(provider.capabilities).toEqual({ persistent: true, writable: true, quotaBased: false });
    });
  });
});
