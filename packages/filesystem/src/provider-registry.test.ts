import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { ProviderRegistry } from '#provider-registry.js';
import { isMissingWorkspaceHandleError } from '#workspace-errors.js';
import type { FileSystemProvider } from '#types.js';
import type { WorkspaceScope } from '#mount-table.js';

const directIdbInitialize = vi.hoisted(() => vi.fn<() => Promise<void>>(async () => undefined));

const createMockHandle = (name: string): FileSystemDirectoryHandle => mock<FileSystemDirectoryHandle>({ name });

const invalidMemoryScopeInput = { backend: 'memory' } as const;
const invalidMemoryScope = invalidMemoryScopeInput as WorkspaceScope;
const sharedMemoryScope: WorkspaceScope = { backend: 'memory', storageRootKey: 'memory:shared' };
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
    public capabilities = {
      persistent: true,
      writable: true,
      quotaBased: true,
      durability: 'transactional-rewrite',
    };
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
    public initialize = directIdbInitialize;
  }
  // eslint-disable-next-line @typescript-eslint/naming-convention -- Module export must match class name
  return { DirectIdbProvider: MockDirectIdbProvider };
});

vi.mock('#backend/memory-provider.js', () => {
  class MockMemoryProvider {
    public id = 'memory';
    public capabilities = { persistent: false, writable: true, quotaBased: false, durability: 'ephemeral' };
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
    public capabilities = {
      persistent: true,
      writable: true,
      quotaBased: false,
      durability: 'stream-append',
    };
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
    public capabilities = {
      persistent: true,
      writable: true,
      quotaBased: true,
      durability: 'exclusive-append',
    };
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
    directIdbInitialize.mockImplementation(async () => undefined);
    registry = new ProviderRegistry();
  });

  describe('constructor', () => {
    it('should accept custom databasePrefix', async () => {
      const custom = new ProviderRegistry({ databasePrefix: 'custom' });
      const provider = await custom.getProvider(indexeddbScope);
      expect(provider.id).toBe('indexeddb');
    });
  });

  describe('getProvider', () => {
    it('should share a deliberately keyed memory root', async () => {
      const first = await registry.getProvider(sharedMemoryScope);
      const second = await registry.getProvider(sharedMemoryScope);
      expect(first).toBe(second);
    });

    it('should reject an unkeyed or malformed memory root', async () => {
      await expect(registry.getProvider(invalidMemoryScope)).rejects.toThrow('memory:<scope>');
      await expect(
        registry.getProvider({ backend: 'memory', storageRootKey: 'scratch' } as WorkspaceScope),
      ).rejects.toThrow('memory:<scope>');
      await expect(
        registry.getProvider({ backend: 'memory', storageRootKey: 'memory:' } as WorkspaceScope),
      ).rejects.toThrow('memory:<scope>');
    });

    it('should cache webaccess providers per physical root key', async () => {
      const scopeA = webaccessScope('wsp_aaa', 'A');
      const scopeB = webaccessScope('wsp_bbb', 'B');
      const a1 = await registry.getProvider(scopeA);
      const a2 = await registry.getProvider(scopeA);
      const b1 = await registry.getProvider(scopeB);
      expect(a1).toBe(a2);
      expect(a1).not.toBe(b1);
    });

    it('should share the single IndexedDB database root', async () => {
      const first = await registry.getProvider(indexeddbScope);
      const second = await registry.getProvider({ backend: 'indexeddb' });
      expect(first).toBe(second);
    });

    it('should share one provider while initialization is pending', async () => {
      let release!: () => void;
      directIdbInitialize.mockImplementationOnce(
        async () =>
          new Promise<void>((resolve) => {
            release = resolve;
          }),
      );

      const first = registry.getProvider(indexeddbScope);
      const second = registry.getProvider(indexeddbScope);
      expect(directIdbInitialize).toHaveBeenCalledOnce();
      release();

      expect(await first).toBe(await second);
    });
  });

  describe('disposeRoot', () => {
    it('should dispose only the selected physical root', async () => {
      const a = await registry.getProvider(webaccessScope('wsp_aaa', 'A'));
      const b = await registry.getProvider(webaccessScope('wsp_bbb', 'B'));
      registry.disposeRoot('webaccess:wsp_aaa');
      await Promise.resolve();
      expect(a.dispose).toHaveBeenCalled();
      expect(b.dispose).not.toHaveBeenCalled();
      expect(await registry.getProvider(webaccessScope('wsp_aaa', 'A'))).not.toBe(a);
      expect(await registry.getProvider(webaccessScope('wsp_bbb', 'B'))).toBe(b);
    });

    it('should dispose a provider whose initialization finishes after revocation', async () => {
      let release!: () => void;
      directIdbInitialize.mockImplementationOnce(
        async () =>
          new Promise<void>((resolve) => {
            release = resolve;
          }),
      );
      const pending = registry.getProvider(indexeddbScope);

      registry.disposeRoot('indexeddb:tau');
      release();
      await expect(pending).rejects.toThrow('revoked');
      await Promise.resolve();

      const replacement = await registry.getProvider(indexeddbScope);
      expect(replacement).toBeDefined();
    });
  });

  describe('owned provider lookup', () => {
    it('should return only an already-owned provider promise without constructing one', async () => {
      expect(registry.getOwnedProvider('indexeddb:tau')).toBeUndefined();
      expect(directIdbInitialize).not.toHaveBeenCalled();

      const provider = await registry.getProvider(indexeddbScope);
      await expect(registry.getOwnedProvider('indexeddb:tau')).resolves.toBe(provider);
    });
  });

  describe('disposeAll', () => {
    it('should dispose all standalone providers', async () => {
      const standalone = await registry.getProvider(sharedMemoryScope);
      registry.disposeAll();
      await Promise.resolve();
      expect(standalone.dispose).toHaveBeenCalled();
    });

    it('should allow new provider creation after disposing empty registry', async () => {
      registry.disposeAll();
      const provider = await registry.getProvider({ backend: 'memory', storageRootKey: 'memory:after-dispose' });
      expect(provider).toBeDefined();
      expect(provider.id).toBe('memory');
    });
  });

  describe('provider creation', () => {
    it('should create a provider for the given backend', async () => {
      const provider = await registry.getProvider({ backend: 'memory', storageRootKey: 'memory:created' });
      expect(provider.id).toBe('memory');
    });

    it('should create multiple providers of the same backend type', async () => {
      const first = await registry.getProvider({ backend: 'memory', storageRootKey: 'memory:first' });
      const second = await registry.getProvider({ backend: 'memory', storageRootKey: 'memory:second' });
      expect(first.id).toBe('memory');
      expect(second.id).toBe('memory');
      expect(first).not.toBe(second);
    });

    it('should create webaccess mount provider when scope carries an explicit handle', async () => {
      const provider = await registry.getProvider(webaccessScope('wsp_explicit'));
      expect(provider.id).toBe('webaccess');
    });

    it('should throw for unknown backend', async () => {
      // oxlint-disable-next-line no-explicit-any,no-unsafe-argument -- intentionally testing invalid input
      await expect(registry.getProvider({ backend: 'nonexistent' } as any)).rejects.toThrow(
        'Unknown backend: nonexistent',
      );
    });
  });

  describe('webaccess backend', () => {
    it('should throw a structured MissingWorkspaceHandleError when scope omits the handle', async () => {
      const error = await registry
        // oxlint-disable-next-line no-explicit-any,no-unsafe-argument -- intentionally invalid scope
        .getProvider({ backend: 'webaccess', workspaceId: 'wsp_oops' } as any)
        .catch((caughtError: unknown) => caughtError);
      expect(isMissingWorkspaceHandleError(error)).toBe(true);
    });
  });

  describe('native provider instantiation', () => {
    it('should create DirectIdbProvider for indexeddb backend', async () => {
      const provider = await registry.getProvider(indexeddbScope);
      expect(provider.id).toBe('indexeddb');
      expect(provider.capabilities).toEqual({
        persistent: true,
        writable: true,
        quotaBased: true,
        durability: 'transactional-rewrite',
      });
    });

    it('should create OPFSProvider for opfs backend', async () => {
      const provider = await registry.getProvider(opfsScope);
      expect(provider.id).toBe('opfs');
      expect(provider.capabilities).toEqual({
        persistent: true,
        writable: true,
        quotaBased: true,
        durability: 'exclusive-append',
      });
    });

    it('should create FileSystemAccessProvider for webaccess backend with handle', async () => {
      const provider = await registry.getProvider(webaccessScope('wsp_local', 'local-dir'));
      expect(provider.id).toBe('webaccess');
      expect(provider.capabilities).toEqual({
        persistent: true,
        writable: true,
        quotaBased: false,
        durability: 'stream-append',
      });
    });
  });

  describe('node backend', () => {
    const nodeScope: WorkspaceScope = { backend: 'node', path: '/tmp/tau-root' };

    it('re-requests a port after the host dies instead of serving a dead channel', async () => {
      const ports: MessagePort[] = [];
      const createNodeFsPort = vi.fn(async () => {
        const { port1, port2 } = new MessageChannel();
        ports.push(port2);
        return port1;
      });
      const nodeRegistry = new ProviderRegistry({ databasePrefix: 'tau-', createNodeFsPort });

      const first = await nodeRegistry.getProvider(nodeScope);
      expect(createNodeFsPort).toHaveBeenCalledOnce();
      // Cached while the channel is live.
      expect(await nodeRegistry.getProvider(nodeScope)).toBe(first);

      ports[0]!.close();
      await vi.waitFor(() => {
        expect(nodeRegistry.getOwnedProvider('node:/tmp/tau-root')).toBeUndefined();
      });

      const second = await nodeRegistry.getProvider(nodeScope);
      expect(createNodeFsPort).toHaveBeenCalledTimes(2);
      expect(second).not.toBe(first);
      for (const port of ports) {
        port.close();
      }
    });

    it('refuses a node scope on a host with no transport', async () => {
      await expect(new ProviderRegistry({ databasePrefix: 'tau-' }).getProvider(nodeScope)).rejects.toThrow(
        /no node filesystem transport/,
      );
    });
  });
});
