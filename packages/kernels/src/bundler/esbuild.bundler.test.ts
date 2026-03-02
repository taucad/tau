/**
 * ESBuild Bundler – HTTP URL handler tests
 *
 * Validates the safeguards on the `http-url` onLoad handler:
 * - Fetch timeout via AbortSignal
 * - Response size limit enforcement
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { PluginBuild } from 'esbuild-wasm';
import type { KernelFileSystem } from '#types/kernel-worker.types.js';
import { createZenFsPlugin, httpFetchMaxSizeBytes } from '#bundler/esbuild-core.js';
import { ModuleManager } from '#bundler/module-manager.js';

// Mock esbuild-wasm to prevent its environment invariant check from failing in jsdom
vi.mock('esbuild-wasm', () => ({
  initialize: vi.fn(),
  build: vi.fn(),
}));

// =============================================================================
// Mock Filesystem
// =============================================================================

type MockFilesystem = {
  [K in keyof KernelFileSystem]: ReturnType<typeof vi.fn>;
};

function createMockFilesystem(): MockFilesystem {
  return {
    readFile: vi.fn<KernelFileSystem['readFile']>().mockRejectedValue(new Error('File not found')),
    exists: vi.fn<KernelFileSystem['exists']>().mockResolvedValue(false),
    readdir: vi.fn<KernelFileSystem['readdir']>().mockResolvedValue([]),
    writeFile: vi.fn<KernelFileSystem['writeFile']>().mockResolvedValue(undefined),
    mkdir: vi.fn<KernelFileSystem['mkdir']>().mockResolvedValue(undefined),
    unlink: vi.fn<KernelFileSystem['unlink']>().mockResolvedValue(undefined),
    stat: vi.fn<KernelFileSystem['stat']>().mockRejectedValue(new Error('Not found')),
  };
}

// =============================================================================
// Mock Fetch Helpers
// =============================================================================

const mockFetch = vi.fn<typeof fetch>();

function createSuccessResponse(body: string, headers?: Record<string, string>): Response {
  const headerMap = new Headers(headers);
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: headerMap,
    text: vi.fn<() => Promise<string>>().mockResolvedValue(body),
    json: vi.fn<() => Promise<unknown>>().mockResolvedValue({}),
    clone: vi.fn<() => Response>(),
    body: undefined,
    bodyUsed: false,
    arrayBuffer: vi.fn<() => Promise<ArrayBuffer>>(),
    blob: vi.fn<() => Promise<Blob>>(),
    formData: vi.fn<() => Promise<FormData>>(),
    bytes: vi.fn<() => Promise<Uint8Array<ArrayBuffer>>>(),
    redirected: false,
    type: 'basic' as ResponseType,
    url: '',
  } as unknown as Response;
}

// =============================================================================
// Plugin Handler Capture Utility
// =============================================================================

type HandlerArgs = {
  path: string;
  namespace: string;
  suffix: string;
  pluginData: unknown;
  with: Record<string, string>;
};

type OnLoadArgs = HandlerArgs;

type OnResolveArgs = HandlerArgs & {
  importer: string;
  resolveDir: string;
  kind: string;
};

type CapturedHandler = (args: OnLoadArgs) => Promise<unknown>;
type CapturedResolveHandler = (args: OnResolveArgs) => Promise<unknown>;

type CapturedHandlers = {
  httpUrlOnLoad: CapturedHandler;
  mainOnResolve: CapturedResolveHandler;
};

/**
 * Create the ZenFS plugin with mocks and capture key handlers
 * so they can be invoked directly in tests without requiring esbuild-wasm.
 */
function capturePluginHandlers(filesystem: MockFilesystem): CapturedHandlers {
  let httpUrlOnLoad: CapturedHandler | undefined;
  let mainOnResolve: CapturedResolveHandler | undefined;

  const mockBuild = {
    onResolve: vi
      .fn()
      .mockImplementation((options: { filter?: RegExp; namespace?: string }, callback: CapturedResolveHandler) => {
        if (!options.namespace && options.filter?.source === '.*') {
          mainOnResolve = callback;
        }
      }),
    onLoad: vi.fn().mockImplementation((options: { namespace?: string }, callback: CapturedHandler) => {
      if (options.namespace === 'http-url') {
        httpUrlOnLoad = callback;
      }
    }),
    onStart: vi.fn(),
    onEnd: vi.fn(),
    onDispose: vi.fn(),
    resolve: vi.fn(),
    esbuild: {},
    initialOptions: {},
  };

  const plugin = createZenFsPlugin({
    filesystem: filesystem as unknown as KernelFileSystem,
    moduleManager: new ModuleManager(filesystem as unknown as KernelFileSystem),
    builtinModules: new Map(),
    projectPath: '/project',
    entryPath: '/project/main.ts',
    autoExportNames: ['main'],
  });

  void plugin.setup(mockBuild as unknown as PluginBuild);

  if (!httpUrlOnLoad) {
    throw new Error('http-url onLoad handler was not registered');
  }

  if (!mainOnResolve) {
    throw new Error('main onResolve handler was not registered');
  }

  return { httpUrlOnLoad, mainOnResolve };
}

// =============================================================================
// Test Suite
// =============================================================================

describe('ESBuild Bundler – http-url onLoad handler', () => {
  let filesystem: MockFilesystem;
  let handler: CapturedHandler;

  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
    filesystem = createMockFilesystem();
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
      mockFetch.mockResolvedValue(createSuccessResponse('export default 42;'));

      await handler({
        path: 'https://esm.sh/lodash',
        namespace: 'http-url',
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
        namespace: 'http-url',
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
      mockFetch.mockResolvedValue(createSuccessResponse('export default 42;', { 'Content-Length': oversizedLength }));

      const result = (await handler({
        path: 'https://esm.sh/huge-package',
        namespace: 'http-url',
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
      mockFetch.mockResolvedValue(createSuccessResponse(oversizedBody));

      const result = (await handler({
        path: 'https://esm.sh/sneaky-large-package',
        namespace: 'http-url',
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
      mockFetch.mockResolvedValue(createSuccessResponse('export default 42;'));

      const result = (await handler({
        path: 'https://esm.sh/small-package/index.js',
        namespace: 'http-url',
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

describe('ESBuild Bundler – CDN absolute-path resolution', () => {
  let filesystem: MockFilesystem;
  let mainOnResolve: CapturedResolveHandler;

  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
    filesystem = createMockFilesystem();
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
      namespace: 'zenfs',
      kind: 'import-statement',
      resolveDir: '/node_modules/@thi.ng/geom-voronoi',
      suffix: '',
      pluginData: undefined,
      with: {},
    })) as { path: string; namespace: string };

    expect(result.path).toBe('https://esm.sh/@thi.ng/vectors@^8.6.20/defopvn?target=es2022');
    expect(result.namespace).toBe('http-url');
  });

  it('should resolve Node.js polyfill paths from CDN-cached modules to esm.sh URLs', async () => {
    const result = (await mainOnResolve({
      path: '/node/process.mjs',
      importer: '/node_modules/some-package/index.js',
      namespace: 'zenfs',
      kind: 'import-statement',
      resolveDir: '/node_modules/some-package',
      suffix: '',
      pluginData: undefined,
      with: {},
    })) as { path: string; namespace: string };

    expect(result.path).toBe('https://esm.sh/node/process.mjs');
    expect(result.namespace).toBe('http-url');
  });

  it('should resolve CDN bundle entry paths from CDN-cached modules', async () => {
    const result = (await mainOnResolve({
      path: '/poisson-disk-sampling@2.3.1/es2022/poisson-disk-sampling.bundle.mjs',
      importer: '/node_modules/poisson-disk-sampling/index.js',
      namespace: 'zenfs',
      kind: 'import-statement',
      resolveDir: '/node_modules/poisson-disk-sampling',
      suffix: '',
      pluginData: undefined,
      with: {},
    })) as { path: string; namespace: string };

    expect(result.path).toBe('https://esm.sh/poisson-disk-sampling@2.3.1/es2022/poisson-disk-sampling.bundle.mjs');
    expect(result.namespace).toBe('http-url');
  });

  it('should NOT redirect absolute-path imports from project files', async () => {
    filesystem.exists.mockResolvedValue(true);
    filesystem.readFile.mockResolvedValue('export default 42;');

    const result = (await mainOnResolve({
      path: '/utils/helpers.ts',
      importer: 'main.ts',
      namespace: 'zenfs',
      kind: 'import-statement',
      resolveDir: '/project',
      suffix: '',
      pluginData: undefined,
      with: {},
    })) as { path: string; namespace: string };

    expect(result.namespace).toBe('zenfs');
    expect(result.path).not.toContain('esm.sh');
  });
});
