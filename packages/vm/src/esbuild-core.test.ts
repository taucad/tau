/**
 * ESBuild VM – HTTP URL handler tests
 *
 * Validates the safeguards on the `http-url` onLoad handler:
 * - Fetch timeout via AbortSignal
 * - Response size limit enforcement
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type { PluginBuild, Metafile } from 'esbuild-wasm';
import { createVfsPlugin, extractProjectDependencies, extractExternalImports } from '#esbuild-core.js';
import { esbuildNamespace, httpFetchMaxSizeBytes } from '#esbuild.constants.js';
import { ModuleManager } from '#module-manager.js';
import { createMockFileSystem, createMockResponse } from '#testing/test-utils.js';
import type { MockFileSystem } from '#testing/test-utils.js';

// Mock esbuild-wasm to prevent its environment invariant check from failing in jsdom
vi.mock('esbuild-wasm', () => ({
  initialize: vi.fn(),
  build: vi.fn(),
}));

// =============================================================================
// Mock Fetch Helpers
// =============================================================================

const mockFetch = vi.fn<typeof fetch>();

// =============================================================================
// Plugin Handler Capture Utility
// =============================================================================

type HandlerArguments = {
  path: string;
  namespace: string;
  suffix: string;
  pluginData: unknown;
  with: Record<string, string>;
};

type OnLoadArguments = HandlerArguments;

type OnResolveArguments = HandlerArguments & {
  importer: string;
  resolveDir: string;
  kind: string;
};

type CapturedHandler = (args: OnLoadArguments) => Promise<unknown>;
type CapturedResolveHandler = (args: OnResolveArguments) => Promise<unknown>;

type CapturedHandlers = {
  httpUrlOnLoad: CapturedHandler;
  mainOnResolve: CapturedResolveHandler;
  vfsOnLoad: CapturedHandler;
};

/**
 * Create the file plugin with mocks and capture key handlers
 * so they can be invoked directly in tests without requiring esbuild-wasm.
 */
function capturePluginHandlers(filesystem: MockFileSystem): CapturedHandlers {
  let httpUrlOnLoad: CapturedHandler | undefined;
  let mainOnResolve: CapturedResolveHandler | undefined;
  let vfsOnLoad: CapturedHandler | undefined;

  const mockBuild = {
    onResolve: vi
      .fn()
      .mockImplementation((options: { filter?: RegExp; namespace?: string }, callback: CapturedResolveHandler) => {
        if (!options.namespace && options.filter?.source === '.*') {
          mainOnResolve = callback;
        }
      }),
    onLoad: vi.fn().mockImplementation((options: { namespace?: string }, callback: CapturedHandler) => {
      if (options.namespace === esbuildNamespace.httpUrl) {
        httpUrlOnLoad = callback;
      } else if (options.namespace === esbuildNamespace.vfs) {
        vfsOnLoad = callback;
      }
    }),
    onStart: vi.fn(),
    onEnd: vi.fn(),
    onDispose: vi.fn(),
    resolve: vi.fn(),
    esbuild: {},
    initialOptions: {},
  };

  const plugin = createVfsPlugin({
    filesystem,
    moduleManager: new ModuleManager(filesystem),
    builtinModules: new Map(),
    projectPath: '/project',
    entryPath: '/project/main.ts',
    autoExportNames: ['main'],
  });

  void plugin.setup(mock<PluginBuild>(mockBuild));

  if (!httpUrlOnLoad) {
    throw new Error('http-url onLoad handler was not registered');
  }

  if (!mainOnResolve) {
    throw new Error('main onResolve handler was not registered');
  }

  if (!vfsOnLoad) {
    throw new Error('vfs onLoad handler was not registered');
  }

  return { httpUrlOnLoad, mainOnResolve, vfsOnLoad };
}

// =============================================================================
// Test Suite
// =============================================================================

describe('ESBuild VM – http-url onLoad handler', () => {
  let filesystem: MockFileSystem;
  let handler: CapturedHandler;

  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
    filesystem = createMockFileSystem();
    handler = capturePluginHandlers(filesystem).httpUrlOnLoad;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ===========================================================================
  // Timeout Signal
  // ===========================================================================

  describe('timeout signal', () => {
    it('should pass an AbortSignal to fetch', async () => {
      mockFetch.mockResolvedValue(createMockResponse('export default 42;'));

      await handler({
        path: 'https://esm.sh/lodash',
        namespace: esbuildNamespace.httpUrl,
        suffix: '',
        pluginData: undefined,
        with: {},
      });

      expect(mockFetch).toHaveBeenCalledOnce();
      const [, fetchOptions] = mockFetch.mock.calls[0]!;
      expect(fetchOptions).toBeDefined();
      expect(fetchOptions!.signal).toBeInstanceOf(AbortSignal);
    });

    it('should return an error when fetch times out', async () => {
      const timeoutError = new DOMException('The operation was aborted due to timeout', 'TimeoutError');
      mockFetch.mockRejectedValue(timeoutError);

      const result = (await handler({
        path: 'https://esm.sh/slow-package',
        namespace: esbuildNamespace.httpUrl,
        suffix: '',
        pluginData: undefined,
        with: {},
      })) as { errors: Array<{ text: string }> };

      expect(result.errors).toBeDefined();
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]!.text).toContain('slow-package');
      expect(result.errors[0]!.text).toContain('aborted');
    });
  });

  // ===========================================================================
  // Response Size Limit
  // ===========================================================================

  describe('response size limit', () => {
    it('should reject responses when content-length exceeds the limit', async () => {
      const oversizedLength = String(httpFetchMaxSizeBytes + 1);
      mockFetch.mockResolvedValue(
        createMockResponse('export default 42;', {
          'Content-Length': oversizedLength,
        }),
      );

      const result = (await handler({
        path: 'https://esm.sh/huge-package',
        namespace: esbuildNamespace.httpUrl,
        suffix: '',
        pluginData: undefined,
        with: {},
      })) as { errors: Array<{ text: string }> };

      expect(result.errors).toBeDefined();
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]!.text).toContain('exceeds maximum size');
      expect(result.errors[0]!.text).toContain('huge-package');
    });

    it('should reject responses when actual body exceeds the limit', async () => {
      // No content-length header, but the body itself is too large
      const oversizedBody = 'x'.repeat(httpFetchMaxSizeBytes + 1);
      mockFetch.mockResolvedValue(createMockResponse(oversizedBody));

      const result = (await handler({
        path: 'https://esm.sh/sneaky-large-package',
        namespace: esbuildNamespace.httpUrl,
        suffix: '',
        pluginData: undefined,
        with: {},
      })) as { errors: Array<{ text: string }> };

      expect(result.errors).toBeDefined();
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]!.text).toContain('exceeds maximum size');
      expect(result.errors[0]!.text).toContain('sneaky-large-package');
    });

    it('should allow responses within the size limit', async () => {
      mockFetch.mockResolvedValue(createMockResponse('export default 42;'));

      const result = (await handler({
        path: 'https://esm.sh/small-package/index.js',
        namespace: esbuildNamespace.httpUrl,
        suffix: '',
        pluginData: undefined,
        with: {},
      })) as { contents: string; loader: string };

      expect(result.contents).toBe('export default 42;');
      expect(result.loader).toBe('js');
    });
  });
});

// =============================================================================
// CDN Absolute-Path Resolution
// =============================================================================

describe('ESBuild VM – CDN absolute-path resolution', () => {
  let filesystem: MockFileSystem;
  let mainOnResolve: CapturedResolveHandler;

  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
    filesystem = createMockFileSystem();
    const handlers = capturePluginHandlers(filesystem);
    mainOnResolve = handlers.mainOnResolve;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should resolve absolute-path imports from CDN-cached modules to esm.sh URLs', async () => {
    const result = (await mainOnResolve({
      path: '/@thi.ng/vectors@^8.6.20/defopvn?target=es2022',
      importer: '/node_modules/@thi.ng/geom-voronoi/index.js',
      namespace: esbuildNamespace.vfs,
      kind: 'import-statement',
      resolveDir: '/node_modules/@thi.ng/geom-voronoi',
      suffix: '',
      pluginData: undefined,
      with: {},
    })) as { path: string; namespace: string };

    expect(result.path).toBe('https://esm.sh/@thi.ng/vectors@^8.6.20/defopvn?target=es2022');
    expect(result.namespace).toBe(esbuildNamespace.httpUrl);
  });

  it('should resolve Node.js polyfill paths from CDN-cached modules to esm.sh URLs', async () => {
    const result = (await mainOnResolve({
      path: '/node/process.mjs',
      importer: '/node_modules/some-package/index.js',
      namespace: esbuildNamespace.vfs,
      kind: 'import-statement',
      resolveDir: '/node_modules/some-package',
      suffix: '',
      pluginData: undefined,
      with: {},
    })) as { path: string; namespace: string };

    expect(result.path).toBe('https://esm.sh/node/process.mjs');
    expect(result.namespace).toBe(esbuildNamespace.httpUrl);
  });

  it('should resolve CDN bundle entry paths from CDN-cached modules', async () => {
    const result = (await mainOnResolve({
      path: '/poisson-disk-sampling@2.3.1/es2022/poisson-disk-sampling.bundle.mjs',
      importer: '/node_modules/poisson-disk-sampling/index.js',
      namespace: esbuildNamespace.vfs,
      kind: 'import-statement',
      resolveDir: '/node_modules/poisson-disk-sampling',
      suffix: '',
      pluginData: undefined,
      with: {},
    })) as { path: string; namespace: string };

    expect(result.path).toBe('https://esm.sh/poisson-disk-sampling@2.3.1/es2022/poisson-disk-sampling.bundle.mjs');
    expect(result.namespace).toBe(esbuildNamespace.httpUrl);
  });

  it('should NOT redirect absolute-path imports from project files', async () => {
    filesystem.mocks.exists.mockResolvedValue(true);
    filesystem.mocks.readFile.mockResolvedValue('export default 42;');

    const result = (await mainOnResolve({
      path: '/utils/helpers.ts',
      importer: 'main.ts',
      namespace: esbuildNamespace.vfs,
      kind: 'import-statement',
      resolveDir: '/project',
      suffix: '',
      pluginData: undefined,
      with: {},
    })) as { path: string; namespace: string };

    expect(result.namespace).toBe(esbuildNamespace.vfs);
    expect(result.path).not.toContain('esm.sh');
  });
});

// =============================================================================
// extractProjectDependencies
// =============================================================================

/* eslint-disable @typescript-eslint/naming-convention -- Metafile input/output keys use esbuild's namespace:path format */

describe('extractProjectDependencies', () => {
  it('should extract vfs-namespace project files as absolute paths', () => {
    const metafile: Metafile = {
      inputs: {
        'vfs:main.ts': { bytes: 100, imports: [], format: undefined },
        'vfs:utils/helpers.ts': { bytes: 50, imports: [], format: undefined },
      },
      outputs: {},
    };

    const result = extractProjectDependencies(metafile, '/projects/project');
    expect(result).toEqual(['/projects/project/main.ts', '/projects/project/utils/helpers.ts']);
  });

  it('should exclude node_modules paths that start with /', () => {
    const metafile: Metafile = {
      inputs: {
        'vfs:main.ts': { bytes: 100, imports: [], format: undefined },
        'vfs:/node_modules/lodash/index.js': { bytes: 500, imports: [], format: undefined },
      },
      outputs: {},
    };

    const result = extractProjectDependencies(metafile, '/projects/project');
    expect(result).toEqual(['/projects/project/main.ts']);
  });

  it('should exclude non-vfs namespace entries', () => {
    const metafile: Metafile = {
      inputs: {
        'vfs:main.ts': { bytes: 100, imports: [], format: undefined },
        'builtin:replicad': { bytes: 200, imports: [], format: undefined },
        'http-url:https://esm.sh/lodash': { bytes: 300, imports: [], format: undefined },
      },
      outputs: {},
    };

    const result = extractProjectDependencies(metafile, '/projects/project');
    expect(result).toEqual(['/projects/project/main.ts']);
  });

  it('should return empty array for undefined metafile', () => {
    const result = extractProjectDependencies(undefined, '/projects/project');
    expect(result).toEqual([]);
  });

  it('should return empty array when no vfs-namespace inputs exist', () => {
    const metafile: Metafile = {
      inputs: {
        'builtin:replicad': { bytes: 200, imports: [], format: undefined },
      },
      outputs: {},
    };

    const result = extractProjectDependencies(metafile, '/projects/project');
    expect(result).toEqual([]);
  });

  it('should handle projectPath with trailing slash', () => {
    const metafile: Metafile = {
      inputs: {
        'vfs:main.ts': { bytes: 100, imports: [], format: undefined },
      },
      outputs: {},
    };

    const result = extractProjectDependencies(metafile, '/projects/project/');
    expect(result).toEqual(['/projects/project/main.ts']);
  });
});

// =============================================================================
// extractExternalImports
// =============================================================================

describe('extractExternalImports', () => {
  it('should collect external import specifiers from metafile outputs', () => {
    const metafile: Metafile = {
      inputs: {},
      outputs: {
        'out.js': {
          bytes: 1000,
          inputs: {},
          imports: [
            { path: 'replicad', kind: 'import-statement', external: true },
            { path: 'vfs:utils.ts', kind: 'import-statement', external: false },
          ],
          exports: [],
          entryPoint: 'main.ts',
        },
      },
    };

    const result = extractExternalImports(metafile);
    expect(result).toEqual(['replicad']);
  });

  it('should deduplicate external specifiers', () => {
    const metafile: Metafile = {
      inputs: {},
      outputs: {
        'out.js': {
          bytes: 1000,
          inputs: {},
          imports: [
            { path: 'replicad', kind: 'import-statement', external: true },
            { path: 'replicad', kind: 'import-statement', external: true },
          ],
          exports: [],
          entryPoint: 'main.ts',
        },
      },
    };

    const result = extractExternalImports(metafile);
    expect(result).toEqual(['replicad']);
  });

  it('should collect externals from multiple output chunks', () => {
    const metafile: Metafile = {
      inputs: {},
      outputs: {
        'chunk-a.js': {
          bytes: 500,
          inputs: {},
          imports: [{ path: 'replicad', kind: 'import-statement', external: true }],
          exports: [],
        },
        'chunk-b.js': {
          bytes: 500,
          inputs: {},
          imports: [{ path: 'manifold-3d', kind: 'import-statement', external: true }],
          exports: [],
        },
      },
    };

    const result = extractExternalImports(metafile);
    expect(result).toEqual(expect.arrayContaining(['replicad', 'manifold-3d']));
    expect(result).toHaveLength(2);
  });

  it('should return empty array for undefined metafile', () => {
    const result = extractExternalImports(undefined);
    expect(result).toEqual([]);
  });

  it('should return empty array when no external imports exist', () => {
    const metafile: Metafile = {
      inputs: {},
      outputs: {
        'out.js': {
          bytes: 1000,
          inputs: {},
          imports: [{ path: 'vfs:utils.ts', kind: 'import-statement', external: false }],
          exports: [],
          entryPoint: 'main.ts',
        },
      },
    };

    const result = extractExternalImports(metafile);
    expect(result).toEqual([]);
  });
});

/* eslint-enable @typescript-eslint/naming-convention -- re-enable after metafile fixture blocks */

// =============================================================================
// Unresolved Path Tracking
// =============================================================================

describe('ESBuild VM – unresolved path tracking', () => {
  let filesystem: MockFileSystem;
  let mainOnResolve: CapturedResolveHandler;
  let vfsOnLoad: CapturedHandler;
  let unresolvedPaths: Set<string>;

  function capturePluginHandlersWithUnresolved(fs: MockFileSystem): {
    mainOnResolve: CapturedResolveHandler;
    vfsOnLoad: CapturedHandler;
    unresolvedPaths: Set<string>;
  } {
    let resolveHandler: CapturedResolveHandler | undefined;
    let loadHandler: CapturedHandler | undefined;
    const tracked = new Set<string>();

    const mockBuild = {
      onResolve: vi
        .fn()
        .mockImplementation((options: { filter?: RegExp; namespace?: string }, callback: CapturedResolveHandler) => {
          if (!options.namespace && options.filter?.source === '.*') {
            resolveHandler = callback;
          }
        }),
      onLoad: vi.fn().mockImplementation((options: { namespace?: string }, callback: CapturedHandler) => {
        if (options.namespace === esbuildNamespace.vfs) {
          loadHandler = callback;
        }
      }),
      onStart: vi.fn(),
      onEnd: vi.fn(),
      onDispose: vi.fn(),
      resolve: vi.fn(),
      esbuild: {},
      initialOptions: {},
    };

    const plugin = createVfsPlugin({
      filesystem: fs,
      moduleManager: new ModuleManager(fs),
      builtinModules: new Map(),
      projectPath: '/project',
      entryPath: '/project/main.ts',
      autoExportNames: ['main'],
      unresolvedPaths: tracked,
    });

    void plugin.setup(mock<PluginBuild>(mockBuild));

    if (!resolveHandler) {
      throw new Error('main onResolve handler was not registered');
    }
    if (!loadHandler) {
      throw new Error('vfs onLoad handler was not registered');
    }

    return { mainOnResolve: resolveHandler, vfsOnLoad: loadHandler, unresolvedPaths: tracked };
  }

  beforeEach(() => {
    filesystem = createMockFileSystem();
    const handlers = capturePluginHandlersWithUnresolved(filesystem);
    mainOnResolve = handlers.mainOnResolve;
    vfsOnLoad = handlers.vfsOnLoad;
    unresolvedPaths = handlers.unresolvedPaths;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('onResolve extension variant tracking', () => {
    it('should add extension variants to unresolvedPaths when file cannot be resolved', async () => {
      filesystem.mocks.exists.mockResolvedValue(false);

      await mainOnResolve({
        path: './lib/foundation',
        importer: 'main.ts',
        namespace: esbuildNamespace.vfs,
        kind: 'import-statement',
        resolveDir: '/project',
        suffix: '',
        pluginData: undefined,
        with: {},
      });

      expect(unresolvedPaths).toContain('/project/lib/foundation.ts');
      expect(unresolvedPaths).toContain('/project/lib/foundation.tsx');
      expect(unresolvedPaths).toContain('/project/lib/foundation.js');
      expect(unresolvedPaths).toContain('/project/lib/foundation.jsx');
    });

    it('should not add extension variants when file resolves successfully', async () => {
      filesystem.mocks.exists.mockImplementation(async (path: string) => path === '/project/lib/foundation.ts');

      await mainOnResolve({
        path: './lib/foundation',
        importer: 'main.ts',
        namespace: esbuildNamespace.vfs,
        kind: 'import-statement',
        resolveDir: '/project',
        suffix: '',
        pluginData: undefined,
        with: {},
      });

      expect(unresolvedPaths.size).toBe(0);
    });

    it('should not add extension variants for imports that already have an extension', async () => {
      filesystem.mocks.exists.mockResolvedValue(false);

      await mainOnResolve({
        path: './lib/foundation.ts',
        importer: 'main.ts',
        namespace: esbuildNamespace.vfs,
        kind: 'import-statement',
        resolveDir: '/project',
        suffix: '',
        pluginData: undefined,
        with: {},
      });

      expect(unresolvedPaths.has('/project/lib/foundation.ts.ts')).toBe(false);
      expect(unresolvedPaths.has('/project/lib/foundation.ts.tsx')).toBe(false);
    });
  });

  describe('TypeScript ESM extension resolution (.js -> .ts)', () => {
    it('should resolve .js import to .ts file when .js does not exist but .ts does', async () => {
      filesystem.mocks.exists.mockImplementation(async (path: string) => path === '/project/lib/nozzle.ts');

      const result = await mainOnResolve({
        path: './lib/nozzle.js',
        importer: 'main.ts',
        namespace: esbuildNamespace.vfs,
        kind: 'import-statement',
        resolveDir: '/project',
        suffix: '',
        pluginData: undefined,
        with: {},
      });

      expect(result).toEqual(
        expect.objectContaining({
          path: 'lib/nozzle.ts',
          namespace: esbuildNamespace.vfs,
        }),
      );
    });

    it('should resolve .jsx import to .tsx file when .jsx does not exist but .tsx does', async () => {
      filesystem.mocks.exists.mockImplementation(async (path: string) => path === '/project/components/button.tsx');

      const result = await mainOnResolve({
        path: './components/button.jsx',
        importer: 'main.ts',
        namespace: esbuildNamespace.vfs,
        kind: 'import-statement',
        resolveDir: '/project',
        suffix: '',
        pluginData: undefined,
        with: {},
      });

      expect(result).toEqual(
        expect.objectContaining({
          path: 'components/button.tsx',
          namespace: esbuildNamespace.vfs,
        }),
      );
    });

    it('should return .js path as-is when .js file exists', async () => {
      filesystem.mocks.exists.mockImplementation(async (path: string) => path === '/project/lib/utils.js');

      const result = await mainOnResolve({
        path: './lib/utils.js',
        importer: 'main.ts',
        namespace: esbuildNamespace.vfs,
        kind: 'import-statement',
        resolveDir: '/project',
        suffix: '',
        pluginData: undefined,
        with: {},
      });

      expect(result).toEqual(
        expect.objectContaining({
          path: 'lib/utils.js',
          namespace: esbuildNamespace.vfs,
        }),
      );
    });

    it('should return .ts path as-is when .ts file exists', async () => {
      filesystem.mocks.exists.mockImplementation(async (path: string) => path === '/project/lib/utils.ts');

      const result = await mainOnResolve({
        path: './lib/utils.ts',
        importer: 'main.ts',
        namespace: esbuildNamespace.vfs,
        kind: 'import-statement',
        resolveDir: '/project',
        suffix: '',
        pluginData: undefined,
        with: {},
      });

      expect(result).toEqual(
        expect.objectContaining({
          path: 'lib/utils.ts',
          namespace: esbuildNamespace.vfs,
        }),
      );
    });
  });

  describe('onLoad failed path tracking', () => {
    it('should add failed absolute path to unresolvedPaths when readFile throws', async () => {
      filesystem.mocks.readFile.mockRejectedValue(new Error('ENOENT: no such file or directory'));

      await vfsOnLoad({
        path: 'lib/foundation.ts',
        namespace: esbuildNamespace.vfs,
        suffix: '',
        pluginData: undefined,
        with: {},
      });

      expect(unresolvedPaths).toContain('/project/lib/foundation.ts');
    });

    it('should not add node_modules paths to unresolvedPaths on failure', async () => {
      filesystem.mocks.readFile.mockRejectedValue(new Error('ENOENT'));

      await vfsOnLoad({
        path: '/node_modules/missing-pkg/index.js',
        namespace: esbuildNamespace.vfs,
        suffix: '',
        pluginData: undefined,
        with: {},
      });

      expect(unresolvedPaths.size).toBe(0);
    });

    it('should not add path to unresolvedPaths when readFile succeeds', async () => {
      filesystem.mocks.readFile.mockResolvedValue('export const x = 1;');

      await vfsOnLoad({
        path: 'lib/foundation.ts',
        namespace: esbuildNamespace.vfs,
        suffix: '',
        pluginData: undefined,
        with: {},
      });

      expect(unresolvedPaths.has('/project/lib/foundation.ts')).toBe(false);
    });
  });
});

// =============================================================================
// Query Suffix + Import Attribute Handling
// =============================================================================

describe('ESBuild VM – query suffix + import attribute handling', () => {
  let filesystem: MockFileSystem;
  let mainOnResolve: CapturedResolveHandler;
  let vfsOnLoad: CapturedHandler;

  beforeEach(() => {
    filesystem = createMockFileSystem();
    const handlers = capturePluginHandlers(filesystem);
    mainOnResolve = handlers.mainOnResolve;
    vfsOnLoad = handlers.vfsOnLoad;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ===========================================================================
  // onResolve: query suffix is round-tripped through OnResolveResult.suffix
  // ===========================================================================

  describe('onResolve query-suffix round-trip', () => {
    it.each([
      ['?raw', './lib/cube.step?raw', 'lib/cube.step'],
      ['?text', './lib/cube.step?text', 'lib/cube.step'],
      ['?binary', './lib/data.bin?binary', 'lib/data.bin'],
      ['?base64', './lib/data.bin?base64', 'lib/data.bin'],
      ['?dataurl', './lib/icon.png?dataurl', 'lib/icon.png'],
      ['?file', './lib/big.bin?file', 'lib/big.bin'],
    ])(
      'should strip %s and round-trip it via OnResolveResult.suffix',
      async (expectedSuffix, importPath, expectedPath) => {
        filesystem.mocks.exists.mockResolvedValue(true);

        const result = (await mainOnResolve({
          path: importPath,
          importer: 'main.ts',
          namespace: esbuildNamespace.vfs,
          kind: 'import-statement',
          resolveDir: '/project',
          suffix: '',
          pluginData: undefined,
          with: {},
        })) as { path: string; namespace: string; suffix: string };

        expect(result.path).toBe(expectedPath);
        expect(result.namespace).toBe(esbuildNamespace.vfs);
        expect(result.suffix).toBe(expectedSuffix);
      },
    );

    it('should leave imports without a recognised query untouched (no suffix field)', async () => {
      filesystem.mocks.exists.mockImplementation(async (path: string) => path === '/project/lib/utils.ts');

      const result = (await mainOnResolve({
        path: './lib/utils.ts',
        importer: 'main.ts',
        namespace: esbuildNamespace.vfs,
        kind: 'import-statement',
        resolveDir: '/project',
        suffix: '',
        pluginData: undefined,
        with: {},
      })) as { path: string; namespace: string; suffix?: string };

      expect(result.path).toBe('lib/utils.ts');
      expect(result.namespace).toBe(esbuildNamespace.vfs);
      expect(result.suffix).toBeUndefined();
    });

    it('should leave unrecognised query strings untouched so unrelated suffixes flow through unchanged', async () => {
      filesystem.mocks.exists.mockResolvedValue(false);

      const result = (await mainOnResolve({
        path: './lib/foo.bin?weird',
        importer: 'main.ts',
        namespace: esbuildNamespace.vfs,
        kind: 'import-statement',
        resolveDir: '/project',
        suffix: '',
        pluginData: undefined,
        with: {},
      })) as { path: string; namespace: string; suffix?: string };

      expect(result.suffix).toBeUndefined();
      expect(result.path).toContain('foo.bin?weird');
    });
  });

  // ===========================================================================
  // onLoad: Vite-style query suffix dispatches to esbuild's built-in loaders
  // ===========================================================================

  describe('onLoad query-suffix dispatch', () => {
    it.each([
      ['?raw', 'text'],
      ['?text', 'text'],
      ['?binary', 'binary'],
      ['?base64', 'base64'],
      ['?dataurl', 'dataurl'],
      ['?file', 'file'],
    ])('should map %s to esbuild loader %s and pass raw bytes through', async (suffix, expectedLoader) => {
      const bytes = new TextEncoder().encode('ISO-10303-21;\n');
      filesystem.mocks.readFile.mockResolvedValue(bytes);

      const result = (await vfsOnLoad({
        path: 'lib/cube.step',
        namespace: esbuildNamespace.vfs,
        suffix,
        pluginData: undefined,
        with: {},
      })) as { contents: Uint8Array<ArrayBuffer>; loader: string };

      expect(result.loader).toBe(expectedLoader);
      expect(result.contents).toBeInstanceOf(Uint8Array);
      expect(result.contents).toEqual(bytes);
      // Confirms we read raw bytes (no 'utf8' arg) so esbuild's loader handles decoding.
      const readArgs = filesystem.mocks.readFile.mock.calls[0]!;
      expect(readArgs[0]).toBe('/project/lib/cube.step');
      expect(readArgs[1]).toBeUndefined();
    });

    it('should fall through to the default loader when no suffix or attribute is present', async () => {
      filesystem.mocks.readFile.mockResolvedValue('export const x = 1;');

      const result = (await vfsOnLoad({
        path: 'lib/utils.ts',
        namespace: esbuildNamespace.vfs,
        suffix: '',
        pluginData: undefined,
        with: {},
      })) as { contents: string; loader: string };

      expect(result.loader).toBe('ts');
      expect(typeof result.contents).toBe('string');
      expect(filesystem.mocks.readFile).toHaveBeenCalledWith('/project/lib/utils.ts', 'utf8');
    });
  });

  // ===========================================================================
  // onLoad: TC39 import attributes (`with { type: 'text' | 'bytes' }`)
  // ===========================================================================

  describe('onLoad TC39 import-attribute dispatch', () => {
    it.each([
      ['text', 'text'],
      ['bytes', 'binary'],
    ])('should map with { type: %s } to esbuild loader %s', async (attributeType, expectedLoader) => {
      const bytes = new TextEncoder().encode('ISO-10303-21;\n');
      filesystem.mocks.readFile.mockResolvedValue(bytes);

      const result = (await vfsOnLoad({
        path: 'lib/cube.step',
        namespace: esbuildNamespace.vfs,
        suffix: '',
        pluginData: undefined,
        with: { type: attributeType },
      })) as { contents: Uint8Array<ArrayBuffer>; loader: string };

      expect(result.loader).toBe(expectedLoader);
      expect(result.contents).toBeInstanceOf(Uint8Array);
      expect(result.contents).toEqual(bytes);
    });

    it('should ignore unsupported with { type } values and use the default loader', async () => {
      filesystem.mocks.readFile.mockResolvedValue('{"x":1}');

      const result = (await vfsOnLoad({
        path: 'data/config.json',
        namespace: esbuildNamespace.vfs,
        suffix: '',
        pluginData: undefined,
        with: { type: 'json' },
      })) as { contents: string; loader: string };

      expect(result.loader).toBe('json');
      expect(filesystem.mocks.readFile).toHaveBeenCalledWith('/project/data/config.json', 'utf8');
    });
  });
});

// =============================================================================
// extractProjectDependencies — query/fragment stripping
// =============================================================================

/* eslint-disable @typescript-eslint/naming-convention -- Metafile keys use esbuild's namespace:path format */

describe('extractProjectDependencies — query/fragment stripping', () => {
  it('should collapse `?raw`-suffixed metafile keys onto their underlying file path', () => {
    const metafile: Metafile = {
      inputs: {
        'vfs:main.ts': { bytes: 100, imports: [], format: undefined },
        'vfs:lib/cube.step?raw': { bytes: 4675, imports: [], format: undefined },
      },
      outputs: {},
    };

    const result = extractProjectDependencies(metafile, '/projects/project');
    expect(result).toEqual(['/projects/project/main.ts', '/projects/project/lib/cube.step']);
  });

  it('should collapse `#fragment` metafile keys onto their underlying file path', () => {
    const metafile: Metafile = {
      inputs: {
        'vfs:lib/cube.step#fragment': { bytes: 4675, imports: [], format: undefined },
      },
      outputs: {},
    };

    const result = extractProjectDependencies(metafile, '/projects/project');
    expect(result).toEqual(['/projects/project/lib/cube.step']);
  });
});

/* eslint-enable @typescript-eslint/naming-convention -- re-enable after metafile fixture blocks */
