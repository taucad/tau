// oxlint-disable max-lines -- test file
/* eslint-disable @typescript-eslint/naming-convention -- Monaco API */
/**
 * TypeAcquisitionService Tests
 *
 * Comprehensive tests covering:
 * - Static type registration (addExtraLib on both defaults)
 * - Dynamic type watching (model listeners, create/dispose)
 * - Debounce behavior
 * - Import scanning and dedup
 * - CDN fetching (no version resolution)
 * - Epoch / session safety
 * - Retry and backoff
 * - Offline / CDN failure resilience
 * - Disposal
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type * as Monaco from 'monaco-editor';
import { TypeAcquisitionService, generateStubDeclarations } from '#lib/type-acquisition-service.js';
import type { StaticTypeDefinition } from '#lib/type-acquisition-service.js';

// =============================================================================
// Mock helpers
// =============================================================================

type MockDisposable = { dispose: ReturnType<typeof vi.fn> };

function createMockDisposable(): MockDisposable {
  return { dispose: vi.fn() };
}

type MockModelListener = (event?: unknown) => void;

// Define mock types explicitly to avoid circular type references
type MockMonacoModel = {
  getLanguageId: () => string;
  getValue: () => string;
  getVersionId: () => number;
  uri: { toString: () => string; path: string };
  onDidChangeContent: ReturnType<typeof vi.fn>;
  _setContent: (newContent: string) => void;
};

type MockDefaults = {
  addExtraLib: ReturnType<typeof vi.fn>;
  setCompilerOptions: ReturnType<typeof vi.fn>;
  setEagerModelSync: ReturnType<typeof vi.fn>;
};

type MockMonaco = {
  typescript: {
    typescriptDefaults: MockDefaults;
    javascriptDefaults: MockDefaults;
    ModuleResolutionKind: { NodeJs: number };
    ScriptTarget: { ESNext: number };
    ModuleKind: { ESNext: number };
  };
  editor: {
    getModels: () => MockMonacoModel[];
    getModel: ReturnType<typeof vi.fn>;
    onDidCreateModel: ReturnType<typeof vi.fn>;
    onWillDisposeModel: ReturnType<typeof vi.fn>;
  };
  Uri: {
    file: (path: string) => { toString: () => string; path: string };
  };
  _addModel: (model: MockMonacoModel) => void;
};

function createMockModel(options: { languageId?: string; content?: string; uri?: string }): {
  model: MockMonacoModel;
  fireContentChange: () => void;
} {
  const contentChangeListeners: MockModelListener[] = [];
  let currentContent = options.content ?? '';
  let versionId = 1;

  const model: MockMonacoModel = {
    getLanguageId: () => options.languageId ?? 'typescript',
    getValue: () => currentContent,
    getVersionId: () => versionId,
    uri: { toString: () => options.uri ?? 'file:///main.ts', path: options.uri ?? '/main.ts' },
    onDidChangeContent: vi.fn((listener: MockModelListener) => {
      contentChangeListeners.push(listener);
      return createMockDisposable();
    }),
    _setContent(newContent: string): void {
      currentContent = newContent;
      versionId++;
    },
  };

  return {
    model,
    fireContentChange(): void {
      for (const listener of contentChangeListeners) {
        listener();
      }
    },
  };
}

type ModelCreateListener = (model: MockMonacoModel) => void;
type ModelDisposeListener = (model: MockMonacoModel) => void;

function createMockMonaco(): {
  monaco: typeof Monaco & MockMonaco;
  fireModelCreate: (model: MockMonacoModel) => void;
  fireModelDispose: (model: MockMonacoModel) => void;
} {
  const models: MockMonacoModel[] = [];
  const modelCreateListeners: ModelCreateListener[] = [];
  const modelDisposeListeners: ModelDisposeListener[] = [];

  const tsDefaults: MockDefaults = {
    addExtraLib: vi.fn(() => createMockDisposable()),
    setCompilerOptions: vi.fn(),
    setEagerModelSync: vi.fn(),
  };
  const jsDefaults: MockDefaults = {
    addExtraLib: vi.fn(() => createMockDisposable()),
    setCompilerOptions: vi.fn(),
    setEagerModelSync: vi.fn(),
  };

  const monaco: MockMonaco = {
    typescript: {
      typescriptDefaults: tsDefaults,
      javascriptDefaults: jsDefaults,
      ModuleResolutionKind: { NodeJs: 2 },
      ScriptTarget: { ESNext: 99 },
      ModuleKind: { ESNext: 99 },
    },
    editor: {
      getModels: () => [...models],
      getModel: vi.fn(),
      onDidCreateModel: vi.fn((listener: ModelCreateListener) => {
        modelCreateListeners.push(listener);
        return createMockDisposable();
      }),
      onWillDisposeModel: vi.fn((listener: ModelDisposeListener) => {
        modelDisposeListeners.push(listener);
        return createMockDisposable();
      }),
    },
    Uri: {
      file: (path: string) => ({ toString: () => `file://${path}`, path }),
    },
    _addModel(model: MockMonacoModel): void {
      models.push(model);
    },
  };

  return {
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- mock proxy type not assignable to Monaco
    monaco: monaco as unknown as typeof Monaco & MockMonaco,
    fireModelCreate(model: MockMonacoModel): void {
      for (const listener of modelCreateListeners) {
        listener(model);
      }
    },
    fireModelDispose(model: MockMonacoModel): void {
      for (const listener of modelDisposeListeners) {
        listener(model);
      }
    },
  };
}

// =============================================================================
// Mock es-module-lexer
// =============================================================================

// Mock the entire module to avoid WASM initialization in tests
vi.mock('es-module-lexer', () => {
  type MockImport = { n: string; s: number; e: number; ss: number; se: number; d: number };
  type MockExport = { s: number; e: number; ls: number; le: number; n: string; ln: string };

  let initialized = false;
  return {
    // oxlint-disable-next-line promise/prefer-await-to-then -- test setup
    init: Promise.resolve().then(() => {
      initialized = true;
    }),
    parse(code: string): [MockImport[], MockExport[]] {
      if (!initialized) {
        throw new Error('es-module-lexer not initialized');
      }

      // Simple regex-based import parser for tests
      const imports: MockImport[] = [];
      const importRegex = /import\s+(?:.*?\s+from\s+)?["']([^"']+)["']/g;
      let match;

      while ((match = importRegex.exec(code)) !== null) {
        const specifier = match[1]!;
        const specifierStart = match.index + match[0].indexOf(specifier);
        imports.push({
          n: specifier,
          s: specifierStart,
          e: specifierStart + specifier.length,
          ss: match.index,
          se: match.index + match[0].length,
          d: -1,
        });
      }

      // Simple regex-based export parser for tests
      // Handles: export { local as name, ... } and export default
      const exports: MockExport[] = [];
      const namedExportRegex = /(\w+)\s+as\s+(\w+)/g;
      const exportBlockRegex = /export\s*{([^}]+)}/g;
      let blockMatch;

      while ((blockMatch = exportBlockRegex.exec(code)) !== null) {
        const block = blockMatch[1]!;
        let namedMatch;
        while ((namedMatch = namedExportRegex.exec(block)) !== null) {
          const localName = namedMatch[1]!;
          const exportedName = namedMatch[2]!;
          const nameStart = blockMatch.index + blockMatch[0].indexOf(exportedName, namedMatch.index);
          exports.push({
            s: nameStart,
            e: nameStart + exportedName.length,
            ls: nameStart - exportedName.length - 4,
            le: nameStart - 4,
            n: exportedName,
            ln: localName,
          });
        }
      }

      // Handle export default
      const defaultRegex = /export\s+default\s/g;
      let defaultMatch;
      while ((defaultMatch = defaultRegex.exec(code)) !== null) {
        const nameStart = defaultMatch.index + defaultMatch[0].indexOf('default');
        exports.push({
          s: nameStart,
          e: nameStart + 7,
          ls: -1,
          le: -1,
          n: 'default',
          ln: '',
        });
      }

      return [imports, exports];
    },
  };
});

// =============================================================================
// Test setup
// =============================================================================

const staticReplicad: StaticTypeDefinition = {
  packageName: 'replicad',
  content: 'export function draw(): void;',
};

const staticJscad: StaticTypeDefinition = {
  packageName: '@jscad/modeling',
  content: 'export function cube(): void;',
};

// =============================================================================
// Tests
// =============================================================================

describe('TypeAcquisitionService', () => {
  let service: TypeAcquisitionService;
  let mockMonaco: ReturnType<typeof createMockMonaco>;

  beforeEach(() => {
    vi.useFakeTimers();
    service = new TypeAcquisitionService();
    mockMonaco = createMockMonaco();
    vi.stubGlobal('requestIdleCallback', (callback: () => void) => {
      setTimeout(callback, 0);
      return 0;
    });
  });

  afterEach(() => {
    service.dispose();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // =========================================================================
  // Static type registration
  // =========================================================================

  describe('static type registration', () => {
    it('should register static types via addExtraLib on both defaults', () => {
      service.initialize(mockMonaco.monaco, {
        staticTypes: [staticReplicad, staticJscad],
      });

      const tsDefaults = mockMonaco.monaco.typescript.typescriptDefaults;
      const jsDefaults = mockMonaco.monaco.typescript.javascriptDefaults;

      // Each static type: index.d.ts + package.json on both defaults
      expect(tsDefaults.addExtraLib).toHaveBeenCalledTimes(4);
      expect(jsDefaults.addExtraLib).toHaveBeenCalledTimes(4);
    });

    it('should register synthetic package.json for each static package on typescriptDefaults', () => {
      service.initialize(mockMonaco.monaco, {
        staticTypes: [staticReplicad],
      });

      const tsDefaults = mockMonaco.monaco.typescript.typescriptDefaults;
      const packageCall = tsDefaults.addExtraLib.mock.calls.find(
        (call) => call[1] === 'file:///node_modules/replicad/package.json',
      );
      expect(packageCall).toBeDefined();
      expect(JSON.parse(packageCall![0] as string)).toEqual({ name: 'replicad', types: 'index.d.ts' });
    });

    it('should wrap content in declare module format', () => {
      service.initialize(mockMonaco.monaco, {
        staticTypes: [staticReplicad],
      });

      const tsDefaults = mockMonaco.monaco.typescript.typescriptDefaults;
      const call = tsDefaults.addExtraLib.mock.calls[0]!;
      const content = call[0] as string;

      expect(content).toContain("declare module 'replicad'");
      expect(content).toContain('export function draw(): void;');
    });

    it('should use correct filePath format', () => {
      service.initialize(mockMonaco.monaco, {
        staticTypes: [staticReplicad],
      });

      const tsDefaults = mockMonaco.monaco.typescript.typescriptDefaults;
      const call = tsDefaults.addExtraLib.mock.calls[0]!;
      const filePath = call[1] as string;

      expect(filePath).toBe('file:///node_modules/replicad/index.d.ts');
    });

    it('should handle scoped package names in filePath', () => {
      service.initialize(mockMonaco.monaco, {
        staticTypes: [staticJscad],
      });

      const tsDefaults = mockMonaco.monaco.typescript.typescriptDefaults;
      const call = tsDefaults.addExtraLib.mock.calls[0]!;
      const filePath = call[1] as string;

      expect(filePath).toBe('file:///node_modules/@jscad/modeling/index.d.ts');
    });

    it('should not re-fetch static types dynamically', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: { get: () => null },
      });
      vi.stubGlobal('fetch', mockFetch);

      service.initialize(mockMonaco.monaco, {
        staticTypes: [staticReplicad],
      });

      const { model, fireContentChange } = createMockModel({
        content: "import { draw } from 'replicad';",
      });
      mockMonaco.monaco._addModel(model);

      service.startWatching();

      // Trigger content change and debounce
      fireContentChange();
      vi.advanceTimersByTime(600);
      await vi.advanceTimersByTimeAsync(10);

      // Fetch should NOT have been called for replicad (it's static)
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Dynamic type watching
  // =========================================================================

  describe('dynamic type watching', () => {
    beforeEach(() => {
      service.initialize(mockMonaco.monaco, { staticTypes: [staticReplicad] });
      vi.stubGlobal('fetch', vi.fn());
    });

    it('should attach content listeners to existing JS/TS models on startWatching', () => {
      const { model } = createMockModel({ languageId: 'typescript' });
      mockMonaco.monaco._addModel(model);

      service.startWatching();

      expect(model.onDidChangeContent).toHaveBeenCalledOnce();
    });

    it('should attach content listeners to newly created models', () => {
      service.startWatching();

      const { model } = createMockModel({ languageId: 'javascript' });
      mockMonaco.fireModelCreate(model);

      expect(model.onDidChangeContent).toHaveBeenCalledOnce();
    });

    it('should detach listeners on model dispose', () => {
      const { model } = createMockModel({ languageId: 'typescript' });
      mockMonaco.monaco._addModel(model);

      service.startWatching();

      const disposable = model.onDidChangeContent.mock.results[0]!.value as MockDisposable;

      mockMonaco.fireModelDispose(model);

      expect(disposable.dispose).toHaveBeenCalledOnce();
    });

    it('should ignore non-JS/TS models', () => {
      const { model: jsonModel } = createMockModel({ languageId: 'json' });
      const { model: kclModel } = createMockModel({ languageId: 'kcl' });

      mockMonaco.monaco._addModel(jsonModel);
      mockMonaco.monaco._addModel(kclModel);

      service.startWatching();

      expect(jsonModel.onDidChangeContent).not.toHaveBeenCalled();
      expect(kclModel.onDidChangeContent).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Debounce behavior
  // =========================================================================

  describe('debounce behavior', () => {
    beforeEach(() => {
      service.initialize(mockMonaco.monaco, { staticTypes: [] });
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          headers: { get: () => null },
        }),
      );
    });

    it('should debounce content changes at 500ms', () => {
      const { model, fireContentChange } = createMockModel({
        content: "import lodash from 'lodash';",
      });
      mockMonaco.monaco._addModel(model);

      service.startWatching();

      // Fire content change
      fireContentChange();

      // Fetch should not be called yet (within debounce window)
      vi.advanceTimersByTime(200);
      expect(vi.mocked(globalThis.fetch)).not.toHaveBeenCalled();

      // After 500ms debounce, scan should trigger
      vi.advanceTimersByTime(400);
      // Note: scan is async but fetch should be called
    });

    it('should reset debounce on rapid changes', () => {
      const { model, fireContentChange } = createMockModel({
        content: "import lodash from 'lodash';",
      });
      mockMonaco.monaco._addModel(model);

      service.startWatching();

      // Rapid changes
      fireContentChange();
      vi.advanceTimersByTime(300);
      fireContentChange();
      vi.advanceTimersByTime(300);
      fireContentChange();

      // Only 300ms after last change, should not have triggered scan
      expect(vi.mocked(globalThis.fetch)).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Import scanning and dedup
  // =========================================================================

  describe('import scanning', () => {
    beforeEach(() => {
      service.initialize(mockMonaco.monaco, { staticTypes: [staticReplicad] });
    });

    it('should extract package name from subpath imports', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: { get: () => null },
      });
      vi.stubGlobal('fetch', mockFetch);

      const { model } = createMockModel({
        content: "import debounce from 'lodash/debounce';",
      });
      mockMonaco.monaco._addModel(model);

      service.startWatching();
      vi.advanceTimersByTime(600);
      await vi.advanceTimersByTimeAsync(10);

      // Should fetch 'lodash' not 'lodash/debounce'
      expect(mockFetch).toHaveBeenCalledWith(
        'https://esm.sh/lodash',
        // oxlint-disable-next-line @typescript-eslint/no-unsafe-assignment -- expected AbortSignal
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });

    it('should handle scoped package subpaths', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: { get: () => null },
      });
      vi.stubGlobal('fetch', mockFetch);

      const { model } = createMockModel({
        content: "import booleans from '@jscad/modeling/booleans';",
      });
      // Note: @jscad/modeling is NOT in static types for this test
      service.dispose();
      service = new TypeAcquisitionService();
      service.initialize(mockMonaco.monaco, { staticTypes: [] });

      mockMonaco.monaco._addModel(model);
      service.startWatching();
      vi.advanceTimersByTime(600);
      await vi.advanceTimersByTimeAsync(10);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://esm.sh/@jscad/modeling',
        // oxlint-disable-next-line @typescript-eslint/no-unsafe-assignment -- expected AbortSignal
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });

    it('should skip relative imports', async () => {
      const mockFetch = vi.fn();
      vi.stubGlobal('fetch', mockFetch);

      const { model } = createMockModel({
        content: "import { helper } from './utils';",
      });
      mockMonaco.monaco._addModel(model);

      service.startWatching();
      vi.advanceTimersByTime(600);
      await vi.advanceTimersByTimeAsync(10);

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should skip already-acquired types', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: { get: () => null },
      });
      vi.stubGlobal('fetch', mockFetch);

      const { model, fireContentChange } = createMockModel({
        content: "import lodash from 'lodash';",
      });
      mockMonaco.monaco._addModel(model);

      service.startWatching();

      // First scan
      vi.advanceTimersByTime(600);
      await vi.advanceTimersByTimeAsync(10);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Trigger another scan
      mockFetch.mockClear();
      fireContentChange();
      vi.advanceTimersByTime(600);
      await vi.advanceTimersByTimeAsync(10);

      // Should NOT fetch again (already acquired)
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should dedup in-flight fetch requests', async () => {
      let resolveFirst: (() => void) | undefined;
      const mockFetch = vi.fn().mockImplementation(
        async () =>
          new Promise<{ ok: boolean; headers: { get: () => undefined } }>((resolve) => {
            resolveFirst = () => {
              resolve({ ok: true, headers: { get: () => undefined } });
            };
          }),
      );
      vi.stubGlobal('fetch', mockFetch);

      const { model: model1 } = createMockModel({
        content: "import lodash from 'lodash';",
        uri: 'file:///a.ts',
      });
      const { model: model2 } = createMockModel({
        content: "import lodash from 'lodash';",
        uri: 'file:///b.ts',
      });
      mockMonaco.monaco._addModel(model1);
      mockMonaco.monaco._addModel(model2);

      service.startWatching();
      vi.advanceTimersByTime(600);
      await vi.advanceTimersByTimeAsync(10);

      // Both models import lodash, but fetch should only be called once
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Resolve to clean up
      resolveFirst?.();
    });
  });

  // =========================================================================
  // CDN fetching
  // =========================================================================

  describe('CDN fetching', () => {
    beforeEach(() => {
      service.initialize(mockMonaco.monaco, { staticTypes: [] });
    });

    it('should fetch from esm.sh without version', async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          headers: {
            get: (header: string) => (header === 'X-TypeScript-Types' ? '/v135/lodash@4.17.21/index.d.ts' : null),
          },
        })
        .mockResolvedValueOnce({
          ok: true,
          text: async () => 'export function debounce(): void;',
        });
      vi.stubGlobal('fetch', mockFetch);

      const { model } = createMockModel({
        content: "import lodash from 'lodash';",
      });
      mockMonaco.monaco._addModel(model);

      service.startWatching();
      vi.advanceTimersByTime(600);
      await vi.advanceTimersByTimeAsync(10);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://esm.sh/lodash',
        // oxlint-disable-next-line @typescript-eslint/no-unsafe-assignment -- expected AbortSignal
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });

    it('should fetch types from X-TypeScript-Types header URL', async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          headers: {
            get: (header: string) => (header === 'X-TypeScript-Types' ? '/v135/lodash@4.17.21/index.d.ts' : null),
          },
        })
        .mockResolvedValueOnce({
          ok: true,
          text: async () => 'export function debounce(): void;',
        });
      vi.stubGlobal('fetch', mockFetch);

      const { model } = createMockModel({
        content: "import lodash from 'lodash';",
      });
      mockMonaco.monaco._addModel(model);

      service.startWatching();
      vi.advanceTimersByTime(600);
      await vi.advanceTimersByTimeAsync(10);

      // Second fetch should be the types URL
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(mockFetch).toHaveBeenNthCalledWith(
        2,
        'https://esm.sh/v135/lodash@4.17.21/index.d.ts',
        // oxlint-disable-next-line @typescript-eslint/no-unsafe-assignment -- expected AbortSignal
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });

    it('should inject types via addExtraLib on both defaults', async () => {
      const typesContent = 'export function debounce(): void;';
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          headers: {
            get: (header: string) => (header === 'X-TypeScript-Types' ? 'https://esm.sh/types/lodash.d.ts' : null),
          },
        })
        .mockResolvedValueOnce({
          ok: true,
          text: async () => typesContent,
        });
      vi.stubGlobal('fetch', mockFetch);

      const { model } = createMockModel({
        content: "import lodash from 'lodash';",
      });
      mockMonaco.monaco._addModel(model);

      service.startWatching();
      vi.advanceTimersByTime(600);
      await vi.advanceTimersByTimeAsync(50);

      const tsDefaults = mockMonaco.monaco.typescript.typescriptDefaults;
      const jsDefaults = mockMonaco.monaco.typescript.javascriptDefaults;

      // Should inject on both defaults
      expect(tsDefaults.addExtraLib).toHaveBeenCalledWith(
        expect.stringContaining("declare module 'lodash'"),
        'file:///node_modules/lodash/index.d.ts',
      );
      expect(jsDefaults.addExtraLib).toHaveBeenCalledWith(
        expect.stringContaining("declare module 'lodash'"),
        'file:///node_modules/lodash/index.d.ts',
      );
    });

    it('should use cached types on subsequent sessions', async () => {
      const typesContent = 'export function debounce(): void;';
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          headers: {
            get: (header: string) => (header === 'X-TypeScript-Types' ? 'https://esm.sh/types/lodash.d.ts' : null),
          },
        })
        .mockResolvedValueOnce({
          ok: true,
          text: async () => typesContent,
        });
      vi.stubGlobal('fetch', mockFetch);

      const { model, fireContentChange } = createMockModel({
        content: "import lodash from 'lodash';",
      });
      mockMonaco.monaco._addModel(model);

      service.startWatching();
      vi.advanceTimersByTime(600);
      await vi.advanceTimersByTimeAsync(50);

      // Verify initial fetch happened
      expect(mockFetch).toHaveBeenCalledTimes(2);

      // Session change
      mockFetch.mockClear();
      service.onProjectSessionChange();

      // Re-trigger scan
      vi.advanceTimersByTime(100); // RequestIdleCallback deferred
      fireContentChange();
      vi.advanceTimersByTime(600);
      await vi.advanceTimersByTimeAsync(50);

      // Should NOT fetch again (cached)
      expect(mockFetch).not.toHaveBeenCalled();

      // But should re-inject via addExtraLib
      const tsDefaults = mockMonaco.monaco.typescript.typescriptDefaults;
      expect(tsDefaults.addExtraLib).toHaveBeenCalledWith(
        expect.stringContaining("declare module 'lodash'"),
        'file:///node_modules/lodash/index.d.ts',
      );
    });
  });

  // =========================================================================
  // Epoch / session safety
  // =========================================================================

  describe('epoch / session safety', () => {
    beforeEach(() => {
      service.initialize(mockMonaco.monaco, { staticTypes: [staticReplicad] });
    });

    it('should discard in-flight fetches when session changes', async () => {
      let resolveFetch: ((value: unknown) => void) | undefined;
      const mockFetch = vi.fn().mockImplementation(
        async () =>
          new Promise((resolve) => {
            resolveFetch = resolve;
          }),
      );
      vi.stubGlobal('fetch', mockFetch);

      const { model } = createMockModel({
        content: "import lodash from 'lodash';",
      });
      mockMonaco.monaco._addModel(model);

      service.startWatching();
      vi.advanceTimersByTime(600);
      await vi.advanceTimersByTimeAsync(10);

      // Fetch is in-flight
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Change session
      service.onProjectSessionChange();

      // Resolve the stale fetch
      resolveFetch?.({
        ok: true,
        headers: { get: (header: string) => (header === 'X-TypeScript-Types' ? 'https://esm.sh/types.d.ts' : null) },
      });
      await vi.advanceTimersByTimeAsync(10);

      // Types should NOT have been injected (epoch mismatch)
      const tsDefaults = mockMonaco.monaco.typescript.typescriptDefaults;
      // Only the static replicad registrations (index + package.json), not lodash
      expect(tsDefaults.addExtraLib).toHaveBeenCalledTimes(2); // Only replicad static
    });

    it('should dispose dynamic types on session change', async () => {
      const typesContent = 'export function debounce(): void;';
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          headers: { get: (header: string) => (header === 'X-TypeScript-Types' ? 'https://esm.sh/types.d.ts' : null) },
        })
        .mockResolvedValueOnce({
          ok: true,
          text: async () => typesContent,
        });
      vi.stubGlobal('fetch', mockFetch);

      const { model } = createMockModel({
        content: "import lodash from 'lodash';",
      });
      mockMonaco.monaco._addModel(model);

      service.startWatching();
      vi.advanceTimersByTime(600);
      await vi.advanceTimersByTimeAsync(50);

      // Get the disposables created for lodash
      const tsDefaults = mockMonaco.monaco.typescript.typescriptDefaults;
      const jsDefaults = mockMonaco.monaco.typescript.javascriptDefaults;
      const lodashTsCallIndex = tsDefaults.addExtraLib.mock.calls.findIndex(
        (call) => call[1] === 'file:///node_modules/lodash/index.d.ts',
      );
      const lodashJsCallIndex = jsDefaults.addExtraLib.mock.calls.findIndex(
        (call) => call[1] === 'file:///node_modules/lodash/index.d.ts',
      );
      const tsDisposable = tsDefaults.addExtraLib.mock.results[lodashTsCallIndex]!.value as MockDisposable;
      const jsDisposable = jsDefaults.addExtraLib.mock.results[lodashJsCallIndex]!.value as MockDisposable;

      // Session change
      service.onProjectSessionChange();

      expect(tsDisposable.dispose).toHaveBeenCalled();
      expect(jsDisposable.dispose).toHaveBeenCalled();
    });

    it('should keep static types across session changes', () => {
      const tsDisposable = mockMonaco.monaco.typescript.typescriptDefaults.addExtraLib.mock.results[0]!
        .value as MockDisposable;

      service.onProjectSessionChange();

      // Static type disposable should NOT be disposed
      expect(tsDisposable.dispose).not.toHaveBeenCalled();
    });

    it('should pass AbortController signal to all fetch calls', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: { get: () => null },
      });
      vi.stubGlobal('fetch', mockFetch);

      const { model } = createMockModel({
        content: "import lodash from 'lodash';",
      });
      mockMonaco.monaco._addModel(model);

      service.startWatching();
      vi.advanceTimersByTime(600);
      await vi.advanceTimersByTimeAsync(10);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        // oxlint-disable-next-line @typescript-eslint/no-unsafe-assignment -- expected AbortSignal
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });
  });

  // =========================================================================
  // Retry and backoff
  // =========================================================================

  describe('retry and backoff', () => {
    beforeEach(() => {
      service.initialize(mockMonaco.monaco, { staticTypes: [] });
    });

    it('should track failed packages with timestamp', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'));
      vi.stubGlobal('fetch', mockFetch);

      const { model, fireContentChange } = createMockModel({
        content: "import lodash from 'lodash';",
      });
      mockMonaco.monaco._addModel(model);

      service.startWatching();
      vi.advanceTimersByTime(600);
      await vi.advanceTimersByTimeAsync(10);

      // First attempt should have happened
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Trigger another scan immediately
      mockFetch.mockClear();
      fireContentChange();
      vi.advanceTimersByTime(600);
      await vi.advanceTimersByTimeAsync(10);

      // Should NOT retry (within 60s window)
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should allow retry after RETRY_DELAY_MS', async () => {
      const mockFetch = vi
        .fn()
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          headers: { get: () => null },
        });
      vi.stubGlobal('fetch', mockFetch);

      const { model, fireContentChange } = createMockModel({
        content: "import lodash from 'lodash';",
      });
      mockMonaco.monaco._addModel(model);

      // Trigger session change to reset acquiredTypes (failed packages are added to acquiredTypes)
      service.startWatching();
      vi.advanceTimersByTime(600);
      await vi.advanceTimersByTimeAsync(10);

      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Session change to clear acquiredTypes (but failedPackages timestamp remains)
      mockFetch.mockClear();
      service.onProjectSessionChange();

      // Advance past retry delay
      vi.advanceTimersByTime(61_000);
      fireContentChange();
      vi.advanceTimersByTime(600);
      await vi.advanceTimersByTimeAsync(10);

      // FailedPackages was cleared by onProjectSessionChange, so it should retry
      expect(mockFetch).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Offline / CDN failure
  // =========================================================================

  describe('offline / CDN failure', () => {
    beforeEach(() => {
      service.initialize(mockMonaco.monaco, { staticTypes: [staticReplicad] });
    });

    it('should not throw on fetch errors', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error('Failed to fetch'));
      vi.stubGlobal('fetch', mockFetch);

      const { model } = createMockModel({
        content: "import lodash from 'lodash';",
      });
      mockMonaco.monaco._addModel(model);

      // Should not throw
      service.startWatching();
      vi.advanceTimersByTime(600);
      await vi.advanceTimersByTimeAsync(10);
    });

    it('should handle 404 responses gracefully', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        headers: { get: () => null },
      });
      vi.stubGlobal('fetch', mockFetch);

      const { model } = createMockModel({
        content: "import nonexistent from 'nonexistent-pkg';",
      });
      mockMonaco.monaco._addModel(model);

      // Should not throw
      service.startWatching();
      vi.advanceTimersByTime(600);
      await vi.advanceTimersByTimeAsync(10);
    });

    it('should handle missing X-TypeScript-Types header', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: { get: () => null },
      });
      vi.stubGlobal('fetch', mockFetch);

      const { model } = createMockModel({
        content: "import pkg from 'no-types-pkg';",
      });
      mockMonaco.monaco._addModel(model);

      service.startWatching();
      vi.advanceTimersByTime(600);
      await vi.advanceTimersByTimeAsync(10);

      // Only one fetch (module itself), no types fetch
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should keep static types available when offline', () => {
      // Static types are injected during initialize, before any network calls
      const tsDefaults = mockMonaco.monaco.typescript.typescriptDefaults;
      expect(tsDefaults.addExtraLib).toHaveBeenCalledWith(
        expect.stringContaining("declare module 'replicad'"),
        'file:///node_modules/replicad/index.d.ts',
      );
    });

    it('should handle AbortError silently without recording failure', async () => {
      const abortError = new DOMException('The operation was aborted', 'AbortError');
      const mockFetch = vi.fn().mockRejectedValue(abortError);
      vi.stubGlobal('fetch', mockFetch);

      const { model, fireContentChange } = createMockModel({
        content: "import lodash from 'lodash';",
      });
      mockMonaco.monaco._addModel(model);

      service.startWatching();
      vi.advanceTimersByTime(600);
      await vi.advanceTimersByTimeAsync(10);

      // Session change to clear state
      mockFetch.mockClear();
      mockFetch.mockResolvedValue({
        ok: true,
        headers: { get: () => null },
      });
      service.onProjectSessionChange();

      // Retry should work immediately (AbortError doesn't count as failure)
      fireContentChange();
      vi.advanceTimersByTime(600);
      await vi.advanceTimersByTimeAsync(10);

      expect(mockFetch).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // CDN URL type acquisition
  // =========================================================================

  describe('CDN URL type acquisition', () => {
    beforeEach(() => {
      service.initialize(mockMonaco.monaco, { staticTypes: [staticReplicad] });
    });

    it('should acquire types for jsdelivr CDN URL imports', async () => {
      const typesContent = 'export function drawSVG(): void;';
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          headers: {
            get: (header: string) =>
              header === 'X-TypeScript-Types' ? '/v135/replicad-decorate@1.0.0/index.d.ts' : null,
          },
        })
        .mockResolvedValueOnce({
          ok: true,
          text: async () => typesContent,
        });
      vi.stubGlobal('fetch', mockFetch);

      const { model } = createMockModel({
        content:
          "import { drawSVG } from 'https://cdn.jsdelivr.net/npm/replicad-decorate/dist/studio/replicad-decorate.js';",
      });
      mockMonaco.monaco._addModel(model);

      service.startWatching();
      vi.advanceTimersByTime(600);
      await vi.advanceTimersByTimeAsync(50);

      // Should have fetched types for the package
      expect(mockFetch).toHaveBeenCalledWith(
        'https://esm.sh/replicad-decorate',
        // oxlint-disable-next-line @typescript-eslint/no-unsafe-assignment -- expected AbortSignal
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });

    it('should inject types under the CDN URL module specifier', async () => {
      const typesContent = 'export function drawSVG(): void;';
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          headers: {
            get: (header: string) =>
              header === 'X-TypeScript-Types' ? 'https://esm.sh/types/replicad-decorate.d.ts' : null,
          },
        })
        .mockResolvedValueOnce({
          ok: true,
          text: async () => typesContent,
        });
      vi.stubGlobal('fetch', mockFetch);

      const cdnUrl = 'https://cdn.jsdelivr.net/npm/replicad-decorate/dist/studio/replicad-decorate.js';
      const { model } = createMockModel({
        content: `import { drawSVG } from '${cdnUrl}';`,
      });
      mockMonaco.monaco._addModel(model);

      service.startWatching();
      vi.advanceTimersByTime(600);
      await vi.advanceTimersByTimeAsync(50);

      const tsDefaults = mockMonaco.monaco.typescript.typescriptDefaults;

      // Should inject types under the CDN URL module specifier
      expect(tsDefaults.addExtraLib).toHaveBeenCalledWith(
        expect.stringContaining(`declare module '${cdnUrl}'`),
        expect.any(String),
      );
    });

    it('should also inject types under the package name for CDN URL imports', async () => {
      const typesContent = 'export function drawSVG(): void;';
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          headers: {
            get: (header: string) =>
              header === 'X-TypeScript-Types' ? 'https://esm.sh/types/replicad-decorate.d.ts' : null,
          },
        })
        .mockResolvedValueOnce({
          ok: true,
          text: async () => typesContent,
        });
      vi.stubGlobal('fetch', mockFetch);

      const cdnUrl = 'https://cdn.jsdelivr.net/npm/replicad-decorate/dist/studio/replicad-decorate.js';
      const { model } = createMockModel({
        content: `import { drawSVG } from '${cdnUrl}';`,
      });
      mockMonaco.monaco._addModel(model);

      service.startWatching();
      vi.advanceTimersByTime(600);
      await vi.advanceTimersByTimeAsync(50);

      const tsDefaults = mockMonaco.monaco.typescript.typescriptDefaults;

      // Should also inject under the bare package name
      expect(tsDefaults.addExtraLib).toHaveBeenCalledWith(
        expect.stringContaining("declare module 'replicad-decorate'"),
        'file:///node_modules/replicad-decorate/index.d.ts',
      );
    });

    it('should only fetch once for multiple CDN URLs of the same package', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: { get: () => null },
      });
      vi.stubGlobal('fetch', mockFetch);

      const { model } = createMockModel({
        content: [
          "import { drawSVG } from 'https://cdn.jsdelivr.net/npm/replicad-decorate/dist/studio/replicad-decorate.js';",
          "import { otherFunc } from 'https://esm.sh/replicad-decorate';",
        ].join('\n'),
      });
      mockMonaco.monaco._addModel(model);

      service.startWatching();
      vi.advanceTimersByTime(600);
      await vi.advanceTimersByTimeAsync(50);

      // Should only fetch once for replicad-decorate
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://esm.sh/replicad-decorate',
        // oxlint-disable-next-line @typescript-eslint/no-unsafe-assignment -- expected AbortSignal
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });

    it('should handle scoped packages in CDN URLs', async () => {
      // Use a fresh service without @jscad/modeling in static types
      service.dispose();
      service = new TypeAcquisitionService();
      service.initialize(mockMonaco.monaco, { staticTypes: [] });

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: { get: () => null },
      });
      vi.stubGlobal('fetch', mockFetch);

      const { model } = createMockModel({
        content: "import booleans from 'https://cdn.jsdelivr.net/npm/@jscad/modeling@2.12.6/booleans';",
      });
      mockMonaco.monaco._addModel(model);

      service.startWatching();
      vi.advanceTimersByTime(600);
      await vi.advanceTimersByTimeAsync(50);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://esm.sh/@jscad/modeling',
        // oxlint-disable-next-line @typescript-eslint/no-unsafe-assignment -- expected AbortSignal
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });

    it('should skip non-CDN URL imports', async () => {
      const mockFetch = vi.fn();
      vi.stubGlobal('fetch', mockFetch);

      const { model } = createMockModel({
        content: "import { helper } from 'https://example.com/not-a-cdn/module.js';",
      });
      mockMonaco.monaco._addModel(model);

      service.startWatching();
      vi.advanceTimersByTime(600);
      await vi.advanceTimersByTimeAsync(10);

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should not re-fetch CDN package if already acquired via bare import', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: { get: () => null },
      });
      vi.stubGlobal('fetch', mockFetch);

      // First: bare import acquires the package
      const { model, fireContentChange } = createMockModel({
        content: "import lodash from 'lodash';",
      });
      mockMonaco.monaco._addModel(model);

      service.startWatching();
      vi.advanceTimersByTime(600);
      await vi.advanceTimersByTimeAsync(10);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Then: CDN URL import for same package
      mockFetch.mockClear();
      model._setContent("import lodash from 'https://cdn.jsdelivr.net/npm/lodash';");
      fireContentChange();
      vi.advanceTimersByTime(600);
      await vi.advanceTimersByTimeAsync(10);

      // Should NOT fetch again
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should clear CDN URL aliases on session change', async () => {
      const typesContent = 'export function drawSVG(): void;';
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          headers: {
            get: (header: string) =>
              header === 'X-TypeScript-Types' ? 'https://esm.sh/types/replicad-decorate.d.ts' : null,
          },
        })
        .mockResolvedValueOnce({
          ok: true,
          text: async () => typesContent,
        });
      vi.stubGlobal('fetch', mockFetch);

      const cdnUrl = 'https://cdn.jsdelivr.net/npm/replicad-decorate/dist/studio/replicad-decorate.js';
      const { model } = createMockModel({
        content: `import { drawSVG } from '${cdnUrl}';`,
      });
      mockMonaco.monaco._addModel(model);

      service.startWatching();
      vi.advanceTimersByTime(600);
      await vi.advanceTimersByTimeAsync(50);

      // Get the CDN URL alias disposable (injected after the package name + static replicad)
      const tsDefaults = mockMonaco.monaco.typescript.typescriptDefaults;
      const cdnUrlCall = tsDefaults.addExtraLib.mock.calls.find(
        (call: unknown[]) => typeof call[0] === 'string' && call[0].includes(`declare module '${cdnUrl}'`),
      );
      expect(cdnUrlCall).toBeDefined();

      // Session change should dispose CDN alias libs
      service.onProjectSessionChange();

      // The CDN URL lib disposable should have been disposed
      const cdnUrlCallIndex = tsDefaults.addExtraLib.mock.calls.indexOf(cdnUrlCall!);
      const cdnUrlDisposable = tsDefaults.addExtraLib.mock.results[cdnUrlCallIndex]!.value as MockDisposable;
      expect(cdnUrlDisposable.dispose).toHaveBeenCalled();
    });

    it('should acquire types for Skypack CDN URL imports', async () => {
      const typesContent = 'export function qrcode(): void;';
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          headers: {
            get: (header: string) =>
              header === 'X-TypeScript-Types' ? '/v135/qrcode-generator@2.0.4/index.d.ts' : null,
          },
        })
        .mockResolvedValueOnce({
          ok: true,
          text: async () => typesContent,
        });
      vi.stubGlobal('fetch', mockFetch);

      const skypackUrl = 'https://cdn.skypack.dev/qrcode-generator@2.0.4';
      const { model } = createMockModel({
        content: `import { qrcode } from '${skypackUrl}';`,
      });
      mockMonaco.monaco._addModel(model);

      service.startWatching();
      vi.advanceTimersByTime(600);
      await vi.advanceTimersByTimeAsync(50);

      // Should have fetched types for the package via esm.sh
      expect(mockFetch).toHaveBeenCalledWith(
        'https://esm.sh/qrcode-generator',
        // oxlint-disable-next-line @typescript-eslint/no-unsafe-assignment -- expected AbortSignal
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );

      const tsDefaults = mockMonaco.monaco.typescript.typescriptDefaults;

      // Should inject types under the Skypack CDN URL module specifier
      expect(tsDefaults.addExtraLib).toHaveBeenCalledWith(
        expect.stringContaining(`declare module '${skypackUrl}'`),
        expect.any(String),
      );

      // Should also inject types under the bare package name
      expect(tsDefaults.addExtraLib).toHaveBeenCalledWith(
        expect.stringContaining("declare module 'qrcode-generator'"),
        'file:///node_modules/qrcode-generator/index.d.ts',
      );
    });
  });

  // =========================================================================
  // Stub type generation (JS-only packages)
  // =========================================================================

  describe('stub type generation', () => {
    beforeEach(() => {
      service.initialize(mockMonaco.monaco, { staticTypes: [] });
    });

    it('should generate stub types when X-TypeScript-Types header is missing but X-ESM-Path is present', async () => {
      const jsSource = 'var a=1,b=2;export{a as addGrid,b as addHoneycomb};';
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          headers: {
            get: (header: string) => (header === 'X-ESM-Path' ? '/pkg@1.0.0/es2022/pkg.mjs' : null),
          },
        })
        .mockResolvedValueOnce({
          ok: true,
          text: async () => jsSource,
        });
      vi.stubGlobal('fetch', mockFetch);

      const { model } = createMockModel({
        content: "import { addGrid } from 'pure-js-pkg';",
      });
      mockMonaco.monaco._addModel(model);

      service.startWatching();
      vi.advanceTimersByTime(600);
      await vi.advanceTimersByTimeAsync(50);

      // Should have fetched the actual module source via X-ESM-Path
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(mockFetch).toHaveBeenNthCalledWith(
        2,
        'https://esm.sh/pkg@1.0.0/es2022/pkg.mjs',
        expect.objectContaining({ signal: expect.any(AbortSignal) as AbortSignal }),
      );

      // Should inject stub types
      const tsDefaults = mockMonaco.monaco.typescript.typescriptDefaults;
      expect(tsDefaults.addExtraLib).toHaveBeenCalledWith(
        expect.stringContaining("declare module 'pure-js-pkg'"),
        'file:///node_modules/pure-js-pkg/index.d.ts',
      );

      // Stub should contain the export names
      const call = tsDefaults.addExtraLib.mock.calls.find(
        (c: unknown[]) => typeof c[0] === 'string' && c[0].includes("declare module 'pure-js-pkg'"),
      );
      expect(call).toBeDefined();
      const content = call![0] as string;
      expect(content).toContain('export const addGrid: any;');
      expect(content).toContain('export const addHoneycomb: any;');
    });

    it('should handle default exports in stub types', async () => {
      const jsSource = 'var a=1;export default a;export{a as named};';
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          headers: {
            get: (header: string) => (header === 'X-ESM-Path' ? '/pkg@1.0.0/es2022/pkg.mjs' : null),
          },
        })
        .mockResolvedValueOnce({
          ok: true,
          text: async () => jsSource,
        });
      vi.stubGlobal('fetch', mockFetch);

      const { model } = createMockModel({
        content: "import pkg from 'default-export-pkg';",
      });
      mockMonaco.monaco._addModel(model);

      service.startWatching();
      vi.advanceTimersByTime(600);
      await vi.advanceTimersByTimeAsync(50);

      const tsDefaults = mockMonaco.monaco.typescript.typescriptDefaults;
      const call = tsDefaults.addExtraLib.mock.calls.find(
        (c: unknown[]) => typeof c[0] === 'string' && c[0].includes("declare module 'default-export-pkg'"),
      );
      expect(call).toBeDefined();
      const content = call![0] as string;
      expect(content).toContain('export default _default;');
      expect(content).toContain('export const named: any;');
    });

    it('should fall back to entry module body when X-ESM-Path is missing', async () => {
      const jsSource = 'var x=1;export{x as myExport};';
      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        headers: { get: () => null },
        text: async () => jsSource,
      });
      vi.stubGlobal('fetch', mockFetch);

      const { model } = createMockModel({
        content: "import { myExport } from 'no-path-pkg';",
      });
      mockMonaco.monaco._addModel(model);

      service.startWatching();
      vi.advanceTimersByTime(600);
      await vi.advanceTimersByTimeAsync(50);

      // Only one fetch (no X-ESM-Path to follow)
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const tsDefaults = mockMonaco.monaco.typescript.typescriptDefaults;
      const call = tsDefaults.addExtraLib.mock.calls.find(
        (c: unknown[]) => typeof c[0] === 'string' && c[0].includes("declare module 'no-path-pkg'"),
      );
      expect(call).toBeDefined();
      expect(call![0] as string).toContain('export const myExport: any;');
    });

    it('should mark as acquired without injection when no exports found', async () => {
      const jsSource = 'console.log("side effect only");';
      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        headers: { get: () => null },
        text: async () => jsSource,
      });
      vi.stubGlobal('fetch', mockFetch);

      const { model, fireContentChange } = createMockModel({
        content: "import 'side-effect-pkg';",
      });
      mockMonaco.monaco._addModel(model);

      service.startWatching();
      vi.advanceTimersByTime(600);
      await vi.advanceTimersByTimeAsync(50);

      // No types should be injected
      const tsDefaults = mockMonaco.monaco.typescript.typescriptDefaults;
      expect(tsDefaults.addExtraLib).not.toHaveBeenCalled();

      // Should not re-fetch on subsequent scans
      mockFetch.mockClear();
      fireContentChange();
      vi.advanceTimersByTime(600);
      await vi.advanceTimersByTimeAsync(50);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should cache stub types across sessions', async () => {
      const jsSource = 'var a=1;export{a as cachedExport};';
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          headers: {
            get: (header: string) => (header === 'X-ESM-Path' ? '/pkg@1.0.0/es2022/pkg.mjs' : null),
          },
        })
        .mockResolvedValueOnce({
          ok: true,
          text: async () => jsSource,
        });
      vi.stubGlobal('fetch', mockFetch);

      const { model, fireContentChange } = createMockModel({
        content: "import { cachedExport } from 'cached-stub-pkg';",
      });
      mockMonaco.monaco._addModel(model);

      service.startWatching();
      vi.advanceTimersByTime(600);
      await vi.advanceTimersByTimeAsync(50);

      expect(mockFetch).toHaveBeenCalledTimes(2);

      // Session change
      mockFetch.mockClear();
      service.onProjectSessionChange();

      // Re-trigger scan
      vi.advanceTimersByTime(100);
      fireContentChange();
      vi.advanceTimersByTime(600);
      await vi.advanceTimersByTimeAsync(50);

      // Should NOT fetch again (cached)
      expect(mockFetch).not.toHaveBeenCalled();

      // But should re-inject
      const tsDefaults = mockMonaco.monaco.typescript.typescriptDefaults;
      expect(tsDefaults.addExtraLib).toHaveBeenCalledWith(
        expect.stringContaining("declare module 'cached-stub-pkg'"),
        'file:///node_modules/cached-stub-pkg/index.d.ts',
      );
    });

    it('should inject stub types for CDN URL imports of typeless packages', async () => {
      const jsSource = 'var a=1;export{a as cdnExport};';
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          headers: {
            get: (header: string) => (header === 'X-ESM-Path' ? '/pkg@1.0.0/es2022/pkg.mjs' : null),
          },
        })
        .mockResolvedValueOnce({
          ok: true,
          text: async () => jsSource,
        });
      vi.stubGlobal('fetch', mockFetch);

      const cdnUrl = 'https://cdn.jsdelivr.net/npm/cdn-js-pkg/dist/index.js';
      const { model } = createMockModel({
        content: `import { cdnExport } from '${cdnUrl}';`,
      });
      mockMonaco.monaco._addModel(model);

      service.startWatching();
      vi.advanceTimersByTime(600);
      await vi.advanceTimersByTimeAsync(50);

      const tsDefaults = mockMonaco.monaco.typescript.typescriptDefaults;

      // Should inject under the CDN URL
      expect(tsDefaults.addExtraLib).toHaveBeenCalledWith(
        expect.stringContaining(`declare module '${cdnUrl}'`),
        expect.any(String),
      );

      // Should also inject under the bare package name
      expect(tsDefaults.addExtraLib).toHaveBeenCalledWith(
        expect.stringContaining("declare module 'cdn-js-pkg'"),
        'file:///node_modules/cdn-js-pkg/index.d.ts',
      );
    });

    it('should respect epoch during stub generation', async () => {
      let resolveSourceFetch: ((value: unknown) => void) | undefined;
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          headers: {
            get: (header: string) => (header === 'X-ESM-Path' ? '/pkg@1.0.0/es2022/pkg.mjs' : null),
          },
        })
        .mockImplementationOnce(
          async () =>
            new Promise((resolve) => {
              resolveSourceFetch = resolve;
            }),
        );
      vi.stubGlobal('fetch', mockFetch);

      const { model } = createMockModel({
        content: "import { fn } from 'epoch-pkg';",
      });
      mockMonaco.monaco._addModel(model);

      service.startWatching();
      vi.advanceTimersByTime(600);
      await vi.advanceTimersByTimeAsync(50);

      // Source fetch is in-flight -- change session
      service.onProjectSessionChange();

      // Resolve the stale source fetch
      resolveSourceFetch?.({
        ok: true,
        text: async () => 'var a=1;export{a as fn};',
      });
      await vi.advanceTimersByTimeAsync(50);

      // Types should NOT have been injected (epoch mismatch)
      const tsDefaults = mockMonaco.monaco.typescript.typescriptDefaults;
      const epochCall = tsDefaults.addExtraLib.mock.calls.find(
        (c: unknown[]) => typeof c[0] === 'string' && c[0].includes("declare module 'epoch-pkg'"),
      );
      expect(epochCall).toBeUndefined();
    });

    it('should mark as acquired when X-ESM-Path fetch fails', async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          headers: {
            get: (header: string) => (header === 'X-ESM-Path' ? '/pkg@1.0.0/es2022/pkg.mjs' : null),
          },
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 404,
        });
      vi.stubGlobal('fetch', mockFetch);

      const { model, fireContentChange } = createMockModel({
        content: "import { fn } from 'missing-source-pkg';",
      });
      mockMonaco.monaco._addModel(model);

      service.startWatching();
      vi.advanceTimersByTime(600);
      await vi.advanceTimersByTimeAsync(50);

      // No types should be injected
      const tsDefaults = mockMonaco.monaco.typescript.typescriptDefaults;
      expect(tsDefaults.addExtraLib).not.toHaveBeenCalled();

      // Should not re-fetch
      mockFetch.mockClear();
      fireContentChange();
      vi.advanceTimersByTime(600);
      await vi.advanceTimersByTimeAsync(50);
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Disposal
  // =========================================================================

  describe('disposal', () => {
    it('should dispose all static type libs', () => {
      service.initialize(mockMonaco.monaco, {
        staticTypes: [staticReplicad, staticJscad],
      });

      const disposables = [
        ...mockMonaco.monaco.typescript.typescriptDefaults.addExtraLib.mock.results,
        ...mockMonaco.monaco.typescript.javascriptDefaults.addExtraLib.mock.results,
      ].map((r) => r.value as MockDisposable);

      service.dispose();

      for (const disposable of disposables) {
        expect(disposable.dispose).toHaveBeenCalled();
      }
    });

    it('should detach all model listeners', () => {
      service.initialize(mockMonaco.monaco, { staticTypes: [] });

      const { model } = createMockModel({ languageId: 'typescript' });
      mockMonaco.monaco._addModel(model);

      service.startWatching();

      const listenerDisposable = model.onDidChangeContent.mock.results[0]!.value as MockDisposable;

      service.dispose();

      expect(listenerDisposable.dispose).toHaveBeenCalled();
    });

    it('should dispose global model create/dispose listeners', () => {
      service.initialize(mockMonaco.monaco, { staticTypes: [] });
      service.startWatching();

      const createDisposable = mockMonaco.monaco.editor.onDidCreateModel.mock.results[0]!.value as MockDisposable;
      const disposeDisposable = mockMonaco.monaco.editor.onWillDisposeModel.mock.results[0]!.value as MockDisposable;

      service.dispose();

      expect(createDisposable.dispose).toHaveBeenCalled();
      expect(disposeDisposable.dispose).toHaveBeenCalled();
    });

    it('should clear debounce timers', () => {
      service.initialize(mockMonaco.monaco, { staticTypes: [] });
      vi.stubGlobal('fetch', vi.fn());

      const { model, fireContentChange } = createMockModel({
        content: "import lodash from 'lodash';",
      });
      mockMonaco.monaco._addModel(model);

      service.startWatching();
      fireContentChange(); // Start debounce timer

      // Dispose before timer fires
      service.dispose();

      // Advance past debounce -- should not trigger errors
      vi.advanceTimersByTime(1000);
    });
  });
});

// =============================================================================
// generateStubDeclarations
// =============================================================================

describe('generateStubDeclarations', () => {
  const jsdoc = '  /** This package does not provide type declarations. Exported as `any`. */';

  it('should generate export const declarations with JSDoc for named exports', () => {
    const result = generateStubDeclarations(['addGrid', 'addHoneycomb']);
    expect(result).toBe([jsdoc, '  export const addGrid: any;', jsdoc, '  export const addHoneycomb: any;'].join('\n'));
  });

  it('should generate export default with JSDoc for default export', () => {
    const result = generateStubDeclarations(['default']);
    expect(result).toContain(jsdoc);
    expect(result).toContain('const _default: any;');
    expect(result).toContain('export default _default;');
  });

  it('should handle mix of named and default exports', () => {
    const result = generateStubDeclarations(['foo', 'default', 'bar']);
    expect(result).toContain('export const foo: any;');
    expect(result).toContain('export const bar: any;');
    expect(result).toContain('export default _default;');
    expect(result).not.toContain('export const default');
  });

  it('should include JSDoc on every export', () => {
    const result = generateStubDeclarations(['a', 'b']);
    const jsdocCount = result.split(jsdoc).length - 1;
    expect(jsdocCount).toBe(2);
  });

  it('should return empty string for empty export list', () => {
    const result = generateStubDeclarations([]);
    expect(result).toBe('');
  });
});
