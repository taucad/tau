import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RpcDependencies, RpcFileSystem } from '@taucad/chat/rpc';
import { rpcClientErrorCodeSchema } from '@taucad/chat';
import type { FileEntry, FileExtension } from '@taucad/types';
import type { ListedDirectoryEntry } from '@taucad/fs-client/directory-listing';
import { rpcName } from '@taucad/chat/constants';
import type { RpcHandlerDependencies, RpcCallInput, ResolveGraphicsForFile } from '#hooks/rpc-handlers.js';

// ===================================================================
// Module mocks
// ===================================================================

let capturedDeps: RpcDependencies | undefined;

const rpcDispatcherMocks = vi.hoisted(() => ({
  dispatch: vi.fn(),
}));

vi.mock('@taucad/chat/rpc', () => ({
  createRpcDispatcher: (deps: RpcDependencies) => {
    capturedDeps = deps;
    return { dispatch: rpcDispatcherMocks.dispatch };
  },
}));

const ledgerMocks = vi.hoisted(() => ({
  recordRpcOutcome: vi.fn(),
}));

vi.mock('#services/rpc-ledger.js', () => ({
  recordRpcOutcome: ledgerMocks.recordRpcOutcome,
}));

const mockWaitFor = vi.fn();
vi.mock('xstate', async () => {
  const actual = await vi.importActual('xstate');
  return {
    ...(actual as Record<string, unknown>),
    // oxlint-disable-next-line no-unsafe-return -- mock factory returns untyped
    waitFor: (...args: unknown[]) => mockWaitFor(...args) as unknown,
  };
});

const { createRpcHandlers } = await import('#hooks/rpc-handlers.js');

// ===================================================================
// Factories
// ===================================================================

type FileEntryOptions = {
  path: string;
  name: string;
  type: 'file' | 'dir';
  size?: number;
};

function createFileEntry(options: FileEntryOptions): FileEntry {
  return {
    path: options.path,
    name: options.name,
    type: options.type,
    size: options.size ?? 100,
    mtimeMs: 0,
    isLoaded: false,
  };
}

type FileManagerWriteCall = [string, Uint8Array<ArrayBuffer>, { source: string }];

function createMockTreeService(tree?: Map<string, FileEntry>) {
  const _tree = tree ?? new Map<string, FileEntry>();
  return {
    getTreeSnapshot: () => _tree,
    exists: vi.fn(async (path: string) => _tree.has(path)),
    listDirectory: vi.fn(async (_path: string): Promise<readonly ListedDirectoryEntry[]> => []),
  };
}

type MockTreeService = ReturnType<typeof createMockTreeService>;

function createMockFileManager() {
  return {
    readFile: vi.fn<(path: string) => Promise<Uint8Array<ArrayBuffer>>>(),
    writeFile: vi
      .fn<(path: string, data: Uint8Array<ArrayBuffer>, options: { source: string }) => Promise<void>>()
      .mockResolvedValue(undefined),
    deleteFile: vi.fn<(path: string, options: { source: string }) => Promise<void>>().mockResolvedValue(undefined),
    stat: vi
      .fn<(path: string) => Promise<{ type: 'file' | 'dir'; size: number; mtimeMs: number }>>()
      .mockResolvedValue({ type: 'file', size: 0, mtimeMs: Date.now() }),
    whenServicesReady: vi.fn<() => Promise<{ treeService: MockTreeService }>>(),
  };
}

function createMockProjectRef(options?: { geometryUnits?: Map<string, unknown>; mainEntryFile?: string }) {
  return {
    getSnapshot: vi.fn().mockReturnValue({
      context: {
        geometryUnits: options?.geometryUnits ?? new Map<string, unknown>(),
        mainEntryFile: options?.mainEntryFile ?? 'main.scad',
      },
    }),
    send: vi.fn(),
    on: vi.fn().mockReturnValue({ unsubscribe: vi.fn() }),
    subscribe: vi.fn().mockReturnValue({ unsubscribe: vi.fn() }),
    getPersistedSnapshot: vi.fn(),
    [Symbol.observable]: vi.fn(),
    id: 'mock-build',
    sessionId: 'mock-session',
    start: vi.fn(),
    stop: vi.fn(),
    system: {},
    src: undefined,
  };
}

function createMockCadUnit(options?: {
  geometries?: Array<{ format: string; content: Uint8Array<ArrayBuffer>; hash: string }>;
  kernelIssues?: Map<string, Array<{ message: string; type: string; severity: string }>>;
  value?: string;
  kernelClient?: unknown;
}) {
  return {
    getSnapshot: vi.fn().mockReturnValue({
      value: options?.value ?? 'idle',
      context: {
        geometries: options?.geometries ?? [],
        kernelIssues:
          options?.kernelIssues ?? new Map<string, Array<{ message: string; type: string; severity: string }>>(),
        ...(options?.kernelClient === undefined ? {} : { kernelClient: options.kernelClient }),
      },
    }),
    on: vi.fn().mockReturnValue({ unsubscribe: vi.fn() }),
    subscribe: vi.fn().mockReturnValue({ unsubscribe: vi.fn() }),
    id: 'mock-cad',
    sessionId: 'mock-cad-session',
    start: vi.fn(),
    stop: vi.fn(),
    system: {},
    src: undefined,
  };
}

let lastTreeService: MockTreeService | undefined;

function buildDeps(overrides?: {
  fileManager?: ReturnType<typeof createMockFileManager>;
  fileTree?: Map<string, FileEntry>;
  projectRef?: ReturnType<typeof createMockProjectRef>;
  resolveGraphicsForFile?: ResolveGraphicsForFile;
  screenshotQuality?: number;
  treeService?: MockTreeService;
}): RpcDependencies {
  capturedDeps = undefined;

  const ts = overrides?.treeService ?? createMockTreeService(overrides?.fileTree);
  lastTreeService = ts;

  const mockFm = overrides?.fileManager ?? createMockFileManager();
  vi.mocked(mockFm.whenServicesReady).mockResolvedValue({ treeService: ts });

  createRpcHandlers({
    chatId: 'chat_rpc_handlers_test_deps',
    fileManager: mockFm as RpcHandlerDependencies['fileManager'],
    projectRef: (overrides?.projectRef ?? createMockProjectRef()) as unknown as RpcHandlerDependencies['projectRef'],
    resolveGraphicsForFile: overrides?.resolveGraphicsForFile,
    screenshotQuality: overrides?.screenshotQuality ?? 0.8,
  });

  return capturedDeps!;
}

/** Extracts typed write args from the mock's call history. */
function getWriteCall(mockFm: ReturnType<typeof createMockFileManager>, index = 0): FileManagerWriteCall {
  return mockFm.writeFile.mock.calls[index]! as FileManagerWriteCall;
}

// ===================================================================
// Tests
// ===================================================================

describe('rpc-handlers', () => {
  beforeEach(() => {
    capturedDeps = undefined;
    mockWaitFor.mockReset();
    rpcDispatcherMocks.dispatch.mockReset();
    ledgerMocks.recordRpcOutcome.mockReset();
  });

  // ===============================================================
  // createBrowserRpcFileSystem
  // ===============================================================

  describe('createBrowserRpcFileSystem', () => {
    let fileSystem: RpcFileSystem;
    let mockFm: ReturnType<typeof createMockFileManager>;
    let fileTree: Map<string, FileEntry>;

    beforeEach(() => {
      mockFm = createMockFileManager();
      fileTree = new Map<string, FileEntry>();
      const deps = buildDeps({ fileManager: mockFm, fileTree });
      fileSystem = deps.fileSystem;
    });

    // ----- readFile -----

    describe('readFile', () => {
      it('should decode binary data to UTF-8 text', async () => {
        const encoded = new TextEncoder().encode('hello world');
        mockFm.readFile.mockResolvedValue(encoded);

        const result = await fileSystem.readFile('test.txt');

        expect(result).toBe('hello world');
        expect(mockFm.readFile).toHaveBeenCalledWith('test.txt');
      });

      it('should handle multi-byte UTF-8 characters', async () => {
        const text = '日本語テスト 🚀';
        const encoded = new TextEncoder().encode(text);
        mockFm.readFile.mockResolvedValue(encoded);

        const result = await fileSystem.readFile('unicode.txt');

        expect(result).toBe(text);
      });

      it('should propagate errors from fileManager', async () => {
        mockFm.readFile.mockRejectedValue(new Error('ENOENT'));

        await expect(fileSystem.readFile('missing.txt')).rejects.toThrow('ENOENT');
      });
    });

    // ----- writeFile -----

    describe('writeFile', () => {
      it('should encode text to binary and write with machine source', async () => {
        await fileSystem.writeFile('output.txt', 'file content');

        expect(mockFm.writeFile).toHaveBeenCalledOnce();
        const [path, data, options] = getWriteCall(mockFm);
        expect(path).toBe('output.txt');
        expect(new TextDecoder().decode(data)).toBe('file content');
        expect(options).toEqual({ source: 'machine' });
      });

      it('should handle empty content', async () => {
        await fileSystem.writeFile('empty.txt', '');

        const [, data] = getWriteCall(mockFm);
        expect(data.byteLength).toBe(0);
      });
    });

    // ----- writeBinaryFile -----

    describe('writeBinaryFile', () => {
      it('should write a copy that does not share the original ArrayBuffer', async () => {
        const original = new Uint8Array([0x67, 0x6c, 0x54, 0x46]);

        await fileSystem.writeBinaryFile('model.glb', original);

        expect(mockFm.writeFile).toHaveBeenCalledOnce();
        const [path, written, options] = getWriteCall(mockFm);
        expect(path).toBe('model.glb');
        expect(options).toEqual({ source: 'machine' });
        expect(written.buffer).not.toBe(original.buffer);
        expect(written).toEqual(original);
      });

      it('should not corrupt the original Uint8Array after write', async () => {
        const original = new Uint8Array([1, 2, 3, 4, 5]);
        const snapshot = new Uint8Array(original);

        await fileSystem.writeBinaryFile('data.bin', original);

        expect(original).toEqual(snapshot);
        expect(original.byteLength).toBe(5);
        expect(original.buffer.byteLength).toBe(5);
      });

      it('should correctly copy a view with non-zero byteOffset', async () => {
        const pool = new ArrayBuffer(16);
        const view = new Uint8Array(pool, 4, 4);
        view.set([0x67, 0x6c, 0x54, 0x46]);

        await fileSystem.writeBinaryFile('offset.glb', view);

        const [, written] = getWriteCall(mockFm);
        expect(written.byteLength).toBe(4);
        expect(written).toEqual(new Uint8Array([0x67, 0x6c, 0x54, 0x46]));
        expect(written.byteOffset).toBe(0);
      });

      it('should handle empty data', async () => {
        const empty = new Uint8Array(0);

        await fileSystem.writeBinaryFile('empty.bin', empty);

        const [, written] = getWriteCall(mockFm);
        expect(written.byteLength).toBe(0);
      });
    });

    // ----- deleteFile -----

    describe('deleteFile', () => {
      it('should delete with machine source', async () => {
        await fileSystem.deleteFile('obsolete.txt');

        expect(mockFm.deleteFile).toHaveBeenCalledWith('obsolete.txt', { source: 'machine' });
      });
    });

    // ----- readdir -----

    describe('readdir', () => {
      it('should surface real size and modifiedAt from the stat-aware tree call', async () => {
        const writtenAt = Date.UTC(2026, 0, 15, 12, 30, 0);
        vi.mocked(lastTreeService!.listDirectory).mockResolvedValueOnce([
          { name: 'main.ts', path: 'src/main.ts', isFolder: false, size: 1234, mtimeMs: writtenAt },
          { name: 'utils.ts', path: 'src/utils.ts', isFolder: false, size: 56, mtimeMs: writtenAt },
          { name: 'lib', path: 'src/lib', isFolder: true, size: 0, mtimeMs: writtenAt },
        ]);

        const entries = await fileSystem.readdir('src');

        expect(lastTreeService!.listDirectory).toHaveBeenCalledWith('src');
        expect(entries).toEqual([
          { name: 'main.ts', type: 'file', size: 1234, modifiedAt: new Date(writtenAt).toISOString() },
          { name: 'utils.ts', type: 'file', size: 56, modifiedAt: new Date(writtenAt).toISOString() },
          { name: 'lib', type: 'dir', size: 0, modifiedAt: new Date(writtenAt).toISOString() },
        ]);
      });

      it('should omit modifiedAt when stat fan-out fell back to a zero mtime', async () => {
        vi.mocked(lastTreeService!.listDirectory).mockResolvedValueOnce([
          { name: 'orphan.ts', path: 'src/orphan.ts', isFolder: false, size: 0, mtimeMs: 0 },
        ]);

        const entries = await fileSystem.readdir('src');

        expect(entries).toEqual([{ name: 'orphan.ts', type: 'file', size: 0 }]);
      });

      it('should return empty array when no entries exist', async () => {
        vi.mocked(lastTreeService!.listDirectory).mockResolvedValueOnce([]);

        const entries = await fileSystem.readdir('lib');

        expect(entries).toEqual([]);
      });

      it('should preserve directory entries from the stat-aware tree call', async () => {
        vi.mocked(lastTreeService!.listDirectory).mockResolvedValueOnce([
          { name: 'components', path: 'src/components', isFolder: true, size: 0, mtimeMs: 0 },
        ]);

        const entries = await fileSystem.readdir('src');

        expect(entries).toEqual([expect.objectContaining({ name: 'components', type: 'dir' })]);
      });

      it('should await whenServicesReady before listing directory entries', async () => {
        vi.mocked(lastTreeService!.listDirectory).mockResolvedValueOnce([
          { name: 'a.txt', path: 'src/a.txt', isFolder: false, size: 1, mtimeMs: 1 },
        ]);
        let resolveReady!: (value: { treeService: MockTreeService }) => void;
        mockFm.whenServicesReady.mockImplementation(async () => {
          return new Promise<{ treeService: MockTreeService }>((resolve) => {
            resolveReady = resolve;
          });
        });

        const pending = fileSystem.readdir('src');
        expect(mockFm.whenServicesReady).toHaveBeenCalledOnce();
        resolveReady({ treeService: lastTreeService! });

        await expect(pending).resolves.toEqual([expect.objectContaining({ name: 'a.txt' })]);
      });

      it.each(['.', '/', './', ''] as const)(
        'should pass root alias %j through to listDirectory unchanged',
        async (pathArgument) => {
          vi.mocked(lastTreeService!.listDirectory).mockResolvedValueOnce([]);
          await fileSystem.readdir(pathArgument);
          expect(lastTreeService!.listDirectory).toHaveBeenCalledWith(pathArgument);
        },
      );

      it('should reject when whenServicesReady rejects', async () => {
        mockFm.whenServicesReady.mockRejectedValue(new Error('File manager initialization failed'));
        await expect(fileSystem.readdir('any')).rejects.toThrow('File manager initialization failed');
      });
    });

    // ----- exists -----

    describe('exists', () => {
      it('should return true when path exists in fileTree', async () => {
        fileTree.set('main.scad', createFileEntry({ path: 'main.scad', name: 'main.scad', type: 'file' }));

        expect(await fileSystem.exists('main.scad')).toBe(true);
      });

      it('should return false when path does not exist', async () => {
        expect(await fileSystem.exists('missing.txt')).toBe(false);
      });

      it('should reject when whenServicesReady rejects', async () => {
        mockFm.whenServicesReady.mockRejectedValue(new Error('File manager initialization failed'));
        await expect(fileSystem.exists('any')).rejects.toThrow('File manager initialization failed');
      });
    });
  });

  // ===============================================================
  // createBrowserGraphicsClient
  // ===============================================================

  describe('createBrowserGraphicsClient', () => {
    const stubResolver: ResolveGraphicsForFile = vi.fn();

    describe('fetchGeometry', () => {
      // FetchGeometry routes through the same `resolveOrCreateGeometryUnit`
      // helper as getKernelResult. Every test must therefore mock `waitFor`
      // with the settled cad snapshot, not just rely on `cadUnit.getSnapshot()`
      // being read synchronously.

      const cadSnapshotWith = (
        geometries: Array<{ format: string; content: Uint8Array<ArrayBuffer>; hash: string }>,
      ) => ({
        value: 'idle',
        context: {
          geometries,
          kernelIssues: new Map<string, unknown[]>(),
        },
      });

      it('should resolve the geometry unit matching targetFile', async () => {
        const glbContent = new Uint8Array([0x67, 0x6c, 0x54, 0x46, 0x02, 0x00, 0x00, 0x00]);
        const cadUnit = createMockCadUnit({
          geometries: [{ format: 'gltf', content: glbContent, hash: 'abc123' }],
        });
        const geometryUnits = new Map<string, unknown>([['main.scad', cadUnit]]);
        const projectRef = createMockProjectRef({ geometryUnits });
        mockWaitFor.mockResolvedValue(cadSnapshotWith([{ format: 'gltf', content: glbContent, hash: 'abc123' }]));
        const deps = buildDeps({ projectRef, resolveGraphicsForFile: stubResolver });
        const graphics = deps.graphics!;

        const result = await graphics.fetchGeometry({ targetFile: 'main.scad' });

        expect(result).toEqual(
          expect.objectContaining({
            success: true,
            glb: glbContent,
          }),
        );
      });

      it('should send createGeometryUnit and resolve through bootstrap when targetFile points at a missing geometry unit', async () => {
        const glbContent = new Uint8Array([0x42]);
        const cadUnit = createMockCadUnit({
          geometries: [{ format: 'gltf', content: glbContent, hash: 'boot' }],
        });
        const emptyUnits = new Map<string, unknown>();
        const populatedUnits = new Map<string, unknown>([['lib/main_rotor.scad', cadUnit]]);
        const projectRef = createMockProjectRef({ geometryUnits: emptyUnits });
        projectRef.getSnapshot
          .mockReturnValueOnce({ context: { geometryUnits: emptyUnits, mainEntryFile: 'main.scad' } })
          .mockReturnValue({ context: { geometryUnits: populatedUnits, mainEntryFile: 'main.scad' } });
        mockWaitFor.mockResolvedValue(cadSnapshotWith([{ format: 'gltf', content: glbContent, hash: 'boot' }]));

        const deps = buildDeps({ projectRef, resolveGraphicsForFile: stubResolver });
        const graphics = deps.graphics!;

        const result = await graphics.fetchGeometry({ targetFile: 'lib/main_rotor.scad' });

        expect(projectRef.send).toHaveBeenCalledWith({
          type: 'createGeometryUnit',
          entryFile: 'lib/main_rotor.scad',
        });
        expect(result).toEqual(
          expect.objectContaining({
            success: true,
            glb: glbContent,
          }),
        );
      });

      it('should return UNKNOWN with bootstrap-failure message when geometry unit bootstrap fails', async () => {
        const projectRef = createMockProjectRef({ geometryUnits: new Map<string, unknown>() });
        const deps = buildDeps({ projectRef, resolveGraphicsForFile: stubResolver });
        const graphics = deps.graphics!;

        const result = await graphics.fetchGeometry({ targetFile: 'lib/main_rotor.scad' });

        expect(result).toEqual({
          success: false,
          errorCode: 'UNKNOWN',
          message: 'Failed to create geometry unit for lib/main_rotor.scad',
        });
        if (!result.success) {
          expect(rpcClientErrorCodeSchema.safeParse(result.errorCode).success).toBe(true);
        }
        expect(projectRef.send).toHaveBeenCalledWith({
          type: 'createGeometryUnit',
          entryFile: 'lib/main_rotor.scad',
        });
      });

      it('should return NO_TOP_LEVEL_GEOMETRY when a freshly-bootstrapped geometry unit settles idle without geometry', async () => {
        const cadUnit = createMockCadUnit({ geometries: [] });
        const emptyUnits = new Map<string, unknown>();
        const populatedUnits = new Map<string, unknown>([['lib/main_rotor.scad', cadUnit]]);
        const projectRef = createMockProjectRef({ geometryUnits: emptyUnits });
        projectRef.getSnapshot
          .mockReturnValueOnce({ context: { geometryUnits: emptyUnits, mainEntryFile: 'main.scad' } })
          .mockReturnValue({ context: { geometryUnits: populatedUnits, mainEntryFile: 'main.scad' } });
        mockWaitFor.mockResolvedValue(cadSnapshotWith([]));

        const deps = buildDeps({ projectRef, resolveGraphicsForFile: stubResolver });
        const graphics = deps.graphics!;

        const result = await graphics.fetchGeometry({ targetFile: 'lib/main_rotor.scad' });

        expect(result).toEqual({
          success: false,
          errorCode: 'NO_TOP_LEVEL_GEOMETRY',
          message: expect.stringContaining('lib/main_rotor.scad') as unknown as string,
        });
      });

      it('should return NO_TOP_LEVEL_GEOMETRY when an existing geometry unit settles idle without GLTF', async () => {
        const cadUnit = createMockCadUnit({ geometries: [] });
        const geometryUnits = new Map<string, unknown>([['main.scad', cadUnit]]);
        const projectRef = createMockProjectRef({ geometryUnits });
        mockWaitFor.mockResolvedValue(cadSnapshotWith([]));

        const deps = buildDeps({ projectRef, resolveGraphicsForFile: stubResolver });
        const graphics = deps.graphics!;

        const result = await graphics.fetchGeometry({ targetFile: 'main.scad' });

        expect(result).toEqual({
          success: false,
          errorCode: 'NO_TOP_LEVEL_GEOMETRY',
          message: expect.stringContaining('main.scad') as unknown as string,
        });
      });

      it('should return FILE_NOT_FOUND when the kernel surfaces an ENOENT-class kernelIssue', async () => {
        const cadUnit = createMockCadUnit({ geometries: [] });
        const geometryUnits = new Map<string, unknown>([['lib/missing.scad', cadUnit]]);
        const projectRef = createMockProjectRef({ geometryUnits });
        const issues = new Map<string, Array<{ message: string; type: string; severity: string }>>([
          [
            'lib/missing.scad',
            [
              {
                message: "ENOENT: no such file or directory, open 'lib/missing.scad'",
                type: 'kernel',
                severity: 'error',
              },
            ],
          ],
        ]);
        mockWaitFor.mockResolvedValue({
          value: 'error',
          context: { geometries: [], kernelIssues: issues },
        });

        const deps = buildDeps({ projectRef, resolveGraphicsForFile: stubResolver });
        const graphics = deps.graphics!;

        const result = await graphics.fetchGeometry({ targetFile: 'lib/missing.scad' });

        expect(result).toEqual({
          success: false,
          errorCode: 'FILE_NOT_FOUND',
          message: expect.stringContaining('lib/missing.scad') as unknown as string,
        });
      });

      it('should return FILE_NOT_FOUND for a "does not exist"-style kernelIssue', async () => {
        const cadUnit = createMockCadUnit({ geometries: [] });
        const geometryUnits = new Map<string, unknown>([['lib/typo.ts', cadUnit]]);
        const projectRef = createMockProjectRef({ geometryUnits });
        const issues = new Map<string, Array<{ message: string; type: string; severity: string }>>([
          ['lib/typo.ts', [{ message: "Path does not exist: 'lib/typo.ts'", type: 'kernel', severity: 'error' }]],
        ]);
        mockWaitFor.mockResolvedValue({
          value: 'error',
          context: { geometries: [], kernelIssues: issues },
        });

        const deps = buildDeps({ projectRef, resolveGraphicsForFile: stubResolver });
        const graphics = deps.graphics!;

        const result = await graphics.fetchGeometry({ targetFile: 'lib/typo.ts' });

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.errorCode).toBe('FILE_NOT_FOUND');
        }
      });

      it('should fall back to UNKNOWN for non-ENOENT compile errors so the agent can read the kernel diagnostic', async () => {
        const cadUnit = createMockCadUnit({ geometries: [] });
        const geometryUnits = new Map<string, unknown>([['main.scad', cadUnit]]);
        const projectRef = createMockProjectRef({ geometryUnits });
        const issues = new Map<string, Array<{ message: string; type: string; severity: string }>>([
          ['main.scad', [{ message: 'syntax error at line 4', type: 'compilation', severity: 'error' }]],
        ]);
        mockWaitFor.mockResolvedValue({
          value: 'error',
          context: { geometries: [], kernelIssues: issues },
        });

        const deps = buildDeps({ projectRef, resolveGraphicsForFile: stubResolver });
        const graphics = deps.graphics!;

        const result = await graphics.fetchGeometry({ targetFile: 'main.scad' });

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.errorCode).toBe('UNKNOWN');
        }
      });

      it('should select gltf among multiple formats for the targetFile', async () => {
        const glbContent = new Uint8Array([0x67, 0x6c, 0x54, 0x46]);
        const cadUnit = createMockCadUnit({
          geometries: [
            { format: 'svg', content: new Uint8Array(), hash: 'svg1' },
            { format: 'gltf', content: glbContent, hash: 'glb1' },
          ],
        });
        const geometryUnits = new Map<string, unknown>([['main.scad', cadUnit]]);
        const projectRef = createMockProjectRef({ geometryUnits });
        mockWaitFor.mockResolvedValue(
          cadSnapshotWith([
            { format: 'svg', content: new Uint8Array(), hash: 'svg1' },
            { format: 'gltf', content: glbContent, hash: 'glb1' },
          ]),
        );
        const deps = buildDeps({ projectRef, resolveGraphicsForFile: stubResolver });
        const graphics = deps.graphics!;

        const result = await graphics.fetchGeometry({ targetFile: 'main.scad' });

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.glb).toBe(glbContent);
        }
      });

      it('should resolve different geometry units based on targetFile, never falling back to main', async () => {
        const mainGlb = new Uint8Array([0x01]);
        const penGlb = new Uint8Array([0x02]);
        const mainUnit = createMockCadUnit({ geometries: [{ format: 'gltf', content: mainGlb, hash: 'm' }] });
        const penUnit = createMockCadUnit({ geometries: [{ format: 'gltf', content: penGlb, hash: 'p' }] });
        const geometryUnits = new Map<string, unknown>([
          ['main.ts', mainUnit],
          ['pen.ts', penUnit],
        ]);
        const projectRef = createMockProjectRef({ geometryUnits, mainEntryFile: 'main.ts' });
        mockWaitFor
          .mockResolvedValueOnce(cadSnapshotWith([{ format: 'gltf', content: mainGlb, hash: 'm' }]))
          .mockResolvedValueOnce(cadSnapshotWith([{ format: 'gltf', content: penGlb, hash: 'p' }]));
        const deps = buildDeps({ projectRef, resolveGraphicsForFile: stubResolver });
        const graphics = deps.graphics!;

        const mainResult = await graphics.fetchGeometry({ targetFile: 'main.ts' });
        const penResult = await graphics.fetchGeometry({ targetFile: 'pen.ts' });

        if (mainResult.success) {
          expect(mainResult.glb).toBe(mainGlb);
        }
        if (penResult.success) {
          expect(penResult.glb).toBe(penGlb);
        }
      });

      it('should map AwaitFreshRenderTimeoutError to errorCode RENDER_TIMEOUT', async () => {
        const cadUnit = createMockCadUnit();
        const geometryUnits = new Map<string, unknown>([['main.scad', cadUnit]]);
        const projectRef = createMockProjectRef({ geometryUnits });
        const awaitFreshRenderModule = await import('#machines/await-fresh-render.js');
        mockWaitFor.mockRejectedValue(new awaitFreshRenderModule.AwaitFreshRenderTimeoutError(5000, 0));

        const deps = buildDeps({ projectRef, resolveGraphicsForFile: stubResolver });
        const graphics = deps.graphics!;

        const result = await graphics.fetchGeometry({ targetFile: 'main.scad' });

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.errorCode).toBe('RENDER_TIMEOUT');
          expect(result.message).toContain('main.scad');
          expect(rpcClientErrorCodeSchema.safeParse(result.errorCode).success).toBe(true);
        }
      });

      it('should return UNKNOWN when waitFor rejects during geometry unit resolution', async () => {
        const cadUnit = createMockCadUnit();
        const geometryUnits = new Map<string, unknown>([['main.scad', cadUnit]]);
        const projectRef = createMockProjectRef({ geometryUnits });
        mockWaitFor.mockRejectedValue(new Error('Actor stopped'));

        const deps = buildDeps({ projectRef, resolveGraphicsForFile: stubResolver });
        const graphics = deps.graphics!;

        const result = await graphics.fetchGeometry({ targetFile: 'main.scad' });

        expect(result).toEqual({
          success: false,
          errorCode: 'UNKNOWN',
          message: 'Actor stopped',
        });
        if (!result.success) {
          expect(rpcClientErrorCodeSchema.safeParse(result.errorCode).success).toBe(true);
        }
      });

      it('should handle getSnapshot throwing by returning UNKNOWN error', async () => {
        const projectRef = createMockProjectRef();
        projectRef.getSnapshot.mockImplementation(() => {
          throw new Error('Actor not running');
        });
        const deps = buildDeps({ projectRef, resolveGraphicsForFile: stubResolver });
        const graphics = deps.graphics!;

        const result = await graphics.fetchGeometry({ targetFile: 'main.scad' });

        expect(result).toEqual({
          success: false,
          errorCode: 'UNKNOWN',
          message: 'Actor not running',
        });
        if (!result.success) {
          expect(rpcClientErrorCodeSchema.safeParse(result.errorCode).success).toBe(true);
        }
      });
    });

    describe('exportGeometry', () => {
      const glbContent = new Uint8Array([0x67, 0x6c, 0x54, 0x46]);

      const cadSnapshotForExport = (kernelClient: unknown) => ({
        value: 'idle',
        context: {
          geometries: [{ format: 'gltf', content: glbContent, hash: 'h1' }],
          kernelIssues: new Map<string, Array<{ message: string; type: string; severity: string }>>(),
          kernelClient,
        },
      });

      it('should return STEP bytes after kernel export resolves', async () => {
        const stepBytes = new Uint8Array([0x53, 0x54, 0x45, 0x50]);
        const kernelClient = {
          export: vi.fn<(format: FileExtension | string) => Promise<unknown>>().mockResolvedValue({
            success: true,
            data: { bytes: stepBytes, name: 'mesh.step', mimeType: 'application/step' },
            issues: [],
          }),
        };

        const cadUnit = createMockCadUnit({
          geometries: [{ format: 'gltf', content: glbContent, hash: 'h1' }],
          kernelClient,
        });
        const geometryUnits = new Map<string, unknown>([['main.scad', cadUnit]]);
        const projectRef = createMockProjectRef({ geometryUnits });
        mockWaitFor.mockResolvedValue(cadSnapshotForExport(kernelClient));

        const deps = buildDeps({ projectRef, resolveGraphicsForFile: stubResolver });
        const graphics = deps.graphics!;

        const result = await graphics.exportGeometry({ targetFile: 'main.scad', format: 'step' });

        expect(kernelClient.export).toHaveBeenCalledWith('step');
        expect(result).toEqual({
          success: true,
          bytes: stepBytes,
          mimeType: 'application/step',
        });
      });

      it('should return UNKNOWN when runtime client is not connected yet', async () => {
        const cadUnit = createMockCadUnit({
          geometries: [{ format: 'gltf', content: glbContent, hash: 'h1' }],
        });
        const geometryUnits = new Map<string, unknown>([['main.scad', cadUnit]]);
        const projectRef = createMockProjectRef({ geometryUnits });

        mockWaitFor.mockResolvedValue({
          value: 'idle',
          context: {
            geometries: [{ format: 'gltf', content: glbContent, hash: 'h1' }],
            kernelIssues: new Map<string, Array<{ message: string; type: string; severity: string }>>(),
          },
        });

        const deps = buildDeps({ projectRef, resolveGraphicsForFile: stubResolver });
        const graphics = deps.graphics!;

        const result = await graphics.exportGeometry({ targetFile: 'main.scad', format: 'stl' });

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.errorCode).toBe('UNKNOWN');
          expect(result.message).toContain('Runtime client not connected');
        }
      });

      it('should map unsuccessful export pipeline issues into UNKNOWN RPC errors', async () => {
        const kernelClient = {
          export: vi.fn<(format: FileExtension | string) => Promise<unknown>>().mockResolvedValue({
            success: false,
            issues: [{ severity: 'error', message: 'No exporters match', code: 'KERNEL_CAPABILITY_MISSING' }],
          }),
        };
        const cadUnit = createMockCadUnit({
          geometries: [{ format: 'gltf', content: glbContent, hash: 'h1' }],
          kernelClient,
        });
        const geometryUnits = new Map<string, unknown>([['main.scad', cadUnit]]);
        const projectRef = createMockProjectRef({ geometryUnits });
        mockWaitFor.mockResolvedValue(cadSnapshotForExport(kernelClient));

        const deps = buildDeps({ projectRef, resolveGraphicsForFile: stubResolver });
        const graphics = deps.graphics!;

        const result = await graphics.exportGeometry({ targetFile: 'main.scad', format: 'stl' });

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.message).toContain('No exporters match');
        }
      });
    });

    describe('captureScreenshot / captureObservations resolver gating', () => {
      it('should error UNKNOWN_GEOMETRY_UNIT when no panel displays the targetFile', async () => {
        const resolver: ResolveGraphicsForFile = vi.fn(() => undefined);
        const projectRef = createMockProjectRef();
        const deps = buildDeps({ projectRef, resolveGraphicsForFile: resolver });
        const graphics = deps.graphics!;

        const screenshot = await graphics.captureScreenshot({ targetFile: 'pen.ts' });
        expect(screenshot).toEqual({
          success: false,
          errorCode: 'UNKNOWN_GEOMETRY_UNIT',
          message: 'No viewer panel currently displays pen.ts',
        });

        const observations = await graphics.captureObservations({ targetFile: 'pen.ts' });
        expect(observations).toEqual({
          success: false,
          errorCode: 'UNKNOWN_GEOMETRY_UNIT',
          message: 'No viewer panel currently displays pen.ts',
        });

        expect(resolver).toHaveBeenCalledWith('pen.ts');
      });
    });
  });

  // ===============================================================
  // createBrowserRuntimeClient
  // ===============================================================

  describe('createBrowserRuntimeClient', () => {
    describe('getKernelResult', () => {
      it('should return ready status when cad unit is idle with no errors', async () => {
        const cadUnit = createMockCadUnit({ value: 'idle' });
        const geometryUnits = new Map<string, unknown>([['main.scad', cadUnit]]);
        const projectRef = createMockProjectRef({ geometryUnits });
        mockWaitFor.mockResolvedValue({
          value: 'idle',
          context: { kernelIssues: new Map<string, unknown[]>() },
        });

        const deps = buildDeps({ projectRef });
        const result = await deps.kernelClient.getKernelResult('main.scad');

        expect(result).toEqual({
          success: true,
          status: 'ready',
          kernelIssues: [],
        });
      });

      it('should return error status when kernel issues contain errors', async () => {
        const issues = [{ message: 'Syntax error', type: 'compile', severity: 'error' }];
        const kernelIssues = new Map([['main.scad', issues]]);
        const cadUnit = createMockCadUnit({ value: 'idle', kernelIssues });
        const geometryUnits = new Map<string, unknown>([['main.scad', cadUnit]]);
        const projectRef = createMockProjectRef({ geometryUnits });
        mockWaitFor.mockResolvedValue({
          value: 'idle',
          context: { kernelIssues },
        });

        const deps = buildDeps({ projectRef });
        const result = await deps.kernelClient.getKernelResult('main.scad');

        expect(result).toEqual({
          success: true,
          status: 'error',
          kernelIssues: issues,
        });
      });

      it('should return error status when cad unit machine is in error state', async () => {
        const cadUnit = createMockCadUnit({ value: 'error' });
        const geometryUnits = new Map<string, unknown>([['main.scad', cadUnit]]);
        const projectRef = createMockProjectRef({ geometryUnits });
        mockWaitFor.mockResolvedValue({
          value: 'error',
          context: { kernelIssues: new Map<string, unknown[]>() },
        });

        const deps = buildDeps({ projectRef });
        const result = await deps.kernelClient.getKernelResult('main.scad');

        expect(result).toEqual({
          success: true,
          status: 'error',
          kernelIssues: [],
        });
      });

      it('should return ready when warnings exist but no errors', async () => {
        const issues = [{ message: 'Deprecated API', type: 'runtime', severity: 'warning' }];
        const kernelIssues = new Map([['main.scad', issues]]);
        const cadUnit = createMockCadUnit({ value: 'idle', kernelIssues });
        const geometryUnits = new Map<string, unknown>([['main.scad', cadUnit]]);
        const projectRef = createMockProjectRef({ geometryUnits });
        mockWaitFor.mockResolvedValue({
          value: 'idle',
          context: { kernelIssues },
        });

        const deps = buildDeps({ projectRef });
        const result = await deps.kernelClient.getKernelResult('main.scad');

        expect(result).toEqual({
          success: true,
          status: 'ready',
          kernelIssues: issues,
        });
      });

      it('should send createGeometryUnit when unit does not exist', async () => {
        const cadUnit = createMockCadUnit({ value: 'idle' });
        const emptyUnits = new Map<string, unknown>();
        const populatedUnits = new Map<string, unknown>([['new-file.scad', cadUnit]]);
        const projectRef = createMockProjectRef({ geometryUnits: emptyUnits });
        projectRef.getSnapshot
          .mockReturnValueOnce({ context: { geometryUnits: emptyUnits, mainEntryFile: 'main.scad' } })
          .mockReturnValue({ context: { geometryUnits: populatedUnits, mainEntryFile: 'main.scad' } });
        mockWaitFor.mockResolvedValue({
          value: 'idle',
          context: { kernelIssues: new Map<string, unknown[]>() },
        });

        const deps = buildDeps({ projectRef });
        const result = await deps.kernelClient.getKernelResult('new-file.scad');

        expect(projectRef.send).toHaveBeenCalledWith({
          type: 'createGeometryUnit',
          entryFile: 'new-file.scad',
        });
        expect(result.success).toBe(true);
      });

      it('should return error when geometry unit cannot be created', async () => {
        const projectRef = createMockProjectRef({ geometryUnits: new Map<string, unknown>() });

        const deps = buildDeps({ projectRef });
        const result = await deps.kernelClient.getKernelResult('impossible.scad');

        expect(result).toEqual({
          success: false,
          errorCode: 'UNKNOWN',
          message: 'Failed to create geometry unit for impossible.scad',
        });
      });

      it('should return error when waitFor rejects', async () => {
        const cadUnit = createMockCadUnit();
        const geometryUnits = new Map<string, unknown>([['main.scad', cadUnit]]);
        const projectRef = createMockProjectRef({ geometryUnits });
        mockWaitFor.mockRejectedValue(new Error('Actor stopped'));

        const deps = buildDeps({ projectRef });
        const result = await deps.kernelClient.getKernelResult('main.scad');

        expect(result).toEqual({
          success: false,
          errorCode: 'UNKNOWN',
          message: 'Actor stopped',
        });
      });
    });
  });

  // ===============================================================
  // executeRpcCall + RPC ledger
  // ===============================================================

  describe('executeRpcCall ledger recording', () => {
    it('records successful side-effect RPC in the ledger', async () => {
      const out = {
        message: 'ok',
        diffStats: {
          linesAdded: 1,
          linesRemoved: 0,
          originalContent: '',
          modifiedContent: '// x',
        },
      };
      rpcDispatcherMocks.dispatch.mockResolvedValue(out);

      const mockFm = createMockFileManager();
      const ts = createMockTreeService();
      vi.mocked(mockFm.whenServicesReady).mockResolvedValue({ treeService: ts });

      const handlers = createRpcHandlers({
        chatId: 'chat_ledger_ok',
        fileManager: mockFm as RpcHandlerDependencies['fileManager'],
        projectRef: createMockProjectRef() as unknown as RpcHandlerDependencies['projectRef'],
        resolveGraphicsForFile: undefined,
        screenshotQuality: 0.8,
      });

      await handlers.executeRpcCall({
        rpcName: rpcName.createFile,
        args: { targetFile: '/a.scad', content: '// x' },
        toolCallId: 'tool_call_cf_1',
      } as RpcCallInput);

      expect(ledgerMocks.recordRpcOutcome).toHaveBeenCalledWith('chat_ledger_ok', 'tool_call_cf_1', {
        kind: 'success',
        output: out,
      });
    });

    it('records failed side-effect RPC with valid code as-is before rethrowing', async () => {
      // T2.3: valid RpcClientErrorCode passes through unchanged.
      rpcDispatcherMocks.dispatch.mockRejectedValue(Object.assign(new Error('boom'), { code: 'IO_ERROR' }));

      const mockFm = createMockFileManager();
      const ts = createMockTreeService();
      vi.mocked(mockFm.whenServicesReady).mockResolvedValue({ treeService: ts });

      const handlers = createRpcHandlers({
        chatId: 'chat_ledger_err',
        fileManager: mockFm as RpcHandlerDependencies['fileManager'],
        projectRef: createMockProjectRef() as unknown as RpcHandlerDependencies['projectRef'],
        resolveGraphicsForFile: undefined,
        screenshotQuality: 0.8,
      });

      await expect(
        handlers.executeRpcCall({
          rpcName: rpcName.editFile,
          args: { targetFile: '/a.scad', oldString: 'a', newString: 'b' },
          toolCallId: 'tool_call_ef_1',
        } as RpcCallInput),
      ).rejects.toThrow('boom');

      expect(ledgerMocks.recordRpcOutcome).toHaveBeenCalledWith('chat_ledger_err', 'tool_call_ef_1', {
        kind: 'error',
        errorCode: 'IO_ERROR',
        message: 'boom',
      });
    });

    it('collapses non-string error codes to UNKNOWN before recording', async () => {
      // T2.2: numeric `code` (not in the enum) collapses to UNKNOWN, never the
      // free-form string '42'. This is what protects downstream `errorText`
      // JSON consumers from receiving codes outside `rpcClientErrorCodeSchema`.
      rpcDispatcherMocks.dispatch.mockRejectedValue(Object.assign(new Error('numeric'), { code: 42 }));

      const mockFm = createMockFileManager();
      const ts = createMockTreeService();
      vi.mocked(mockFm.whenServicesReady).mockResolvedValue({ treeService: ts });

      const handlers = createRpcHandlers({
        chatId: 'chat_ledger_numeric',
        fileManager: mockFm as RpcHandlerDependencies['fileManager'],
        projectRef: createMockProjectRef() as unknown as RpcHandlerDependencies['projectRef'],
        resolveGraphicsForFile: undefined,
        screenshotQuality: 0.8,
      });

      await expect(
        handlers.executeRpcCall({
          rpcName: rpcName.createFile,
          args: { targetFile: '/x.scad', content: '//' },
          toolCallId: 'tool_call_num_1',
        } as RpcCallInput),
      ).rejects.toThrow('numeric');

      expect(ledgerMocks.recordRpcOutcome).toHaveBeenCalledWith('chat_ledger_numeric', 'tool_call_num_1', {
        kind: 'error',
        errorCode: 'UNKNOWN',
        message: 'numeric',
      });
    });

    it('collapses missing error.code to UNKNOWN before recording', async () => {
      // T2.4: bare error with no `code` lands as UNKNOWN.
      rpcDispatcherMocks.dispatch.mockRejectedValue(new Error('plain'));

      const mockFm = createMockFileManager();
      const ts = createMockTreeService();
      vi.mocked(mockFm.whenServicesReady).mockResolvedValue({ treeService: ts });

      const handlers = createRpcHandlers({
        chatId: 'chat_ledger_nocode',
        fileManager: mockFm as RpcHandlerDependencies['fileManager'],
        projectRef: createMockProjectRef() as unknown as RpcHandlerDependencies['projectRef'],
        resolveGraphicsForFile: undefined,
        screenshotQuality: 0.8,
      });

      await expect(
        handlers.executeRpcCall({
          rpcName: rpcName.deleteFile,
          args: { targetFile: '/y.scad' },
          toolCallId: 'tool_call_plain_1',
        } as RpcCallInput),
      ).rejects.toThrow('plain');

      expect(ledgerMocks.recordRpcOutcome).toHaveBeenCalledWith('chat_ledger_nocode', 'tool_call_plain_1', {
        kind: 'error',
        errorCode: 'UNKNOWN',
        message: 'plain',
      });
    });

    it('collapses unknown string error codes to UNKNOWN before recording', async () => {
      // T2.2 follow-on: a string code that is not a valid `RpcClientErrorCode`
      // member (e.g. an arbitrary infra error string) collapses to UNKNOWN
      // rather than being persisted verbatim.
      rpcDispatcherMocks.dispatch.mockRejectedValue(Object.assign(new Error('unknown-str'), { code: 'E_RPC' }));

      const mockFm = createMockFileManager();
      const ts = createMockTreeService();
      vi.mocked(mockFm.whenServicesReady).mockResolvedValue({ treeService: ts });

      const handlers = createRpcHandlers({
        chatId: 'chat_ledger_strcode',
        fileManager: mockFm as RpcHandlerDependencies['fileManager'],
        projectRef: createMockProjectRef() as unknown as RpcHandlerDependencies['projectRef'],
        resolveGraphicsForFile: undefined,
        screenshotQuality: 0.8,
      });

      await expect(
        handlers.executeRpcCall({
          rpcName: rpcName.appendFile,
          args: { targetFile: '/y.scad', content: '//' },
          toolCallId: 'tool_call_estr_1',
        } as RpcCallInput),
      ).rejects.toThrow('unknown-str');

      expect(ledgerMocks.recordRpcOutcome).toHaveBeenCalledWith('chat_ledger_strcode', 'tool_call_estr_1', {
        kind: 'error',
        errorCode: 'UNKNOWN',
        message: 'unknown-str',
      });

      // Sanity: the canonical schema would have rejected this too.
      expect(rpcClientErrorCodeSchema.safeParse('E_RPC').success).toBe(false);
    });

    it('does not record read-only RPC outcomes', async () => {
      rpcDispatcherMocks.dispatch.mockResolvedValue({ content: 'x', totalLines: 1 });

      const mockFm = createMockFileManager();
      const ts = createMockTreeService();
      vi.mocked(mockFm.whenServicesReady).mockResolvedValue({ treeService: ts });

      const handlers = createRpcHandlers({
        chatId: 'chat_ledger_readonly',
        fileManager: mockFm as RpcHandlerDependencies['fileManager'],
        projectRef: createMockProjectRef() as unknown as RpcHandlerDependencies['projectRef'],
        resolveGraphicsForFile: undefined,
        screenshotQuality: 0.8,
      });

      await handlers.executeRpcCall({
        rpcName: rpcName.readFile,
        args: { targetFile: '/a.scad' },
        toolCallId: 'tool_call_rf_1',
      } as RpcCallInput);

      expect(ledgerMocks.recordRpcOutcome).not.toHaveBeenCalled();
    });
  });

  // ===============================================================
  // createRpcHandlers (factory)
  // ===============================================================

  describe('createRpcHandlers', () => {
    it('should set graphics to undefined when resolveGraphicsForFile is undefined', () => {
      const deps = buildDeps({ resolveGraphicsForFile: undefined });

      expect(deps.graphics).toBeUndefined();
    });

    it('should provide graphics when resolveGraphicsForFile is defined', () => {
      const projectRef = createMockProjectRef();
      const deps = buildDeps({ projectRef, resolveGraphicsForFile: vi.fn() });

      expect(deps.graphics).toBeDefined();
    });

    it('should return an object with executeRpcCall method', () => {
      const mockFm = createMockFileManager();
      const ts = createMockTreeService();
      vi.mocked(mockFm.whenServicesReady).mockResolvedValue({ treeService: ts });

      const handlers = createRpcHandlers({
        chatId: 'chat_rpc_handlers_factory_test',
        fileManager: mockFm as RpcHandlerDependencies['fileManager'],
        projectRef: createMockProjectRef() as unknown as RpcHandlerDependencies['projectRef'],
        resolveGraphicsForFile: undefined,
        screenshotQuality: 0.8,
      });

      expect(handlers).toHaveProperty('executeRpcCall');
      expect(typeof handlers.executeRpcCall).toBe('function');
    });
  });
});
