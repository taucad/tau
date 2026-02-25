/**
 * ModuleManager Tests
 *
 * Tests for the CDN cache manager including:
 * - Cache hit / miss behavior
 * - Subpath caching
 * - Concurrent request deduplication
 * - Retry backoff for failed fetches
 * - Fetch safeguards (timeout, size limit, domain allowlist)
 * - Offline resilience
 * - CDN fallback (esm.sh -> jsdelivr)
 * - Atomic write ordering (code first, package.json last)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { KernelFileSystem } from '#types/kernel-worker.types.js';
import { ModuleManager } from '#bundler/module-manager.js';

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
// Test Suite
// =============================================================================

describe('ModuleManager', () => {
  let filesystem: MockFilesystem;
  let manager: ModuleManager;

  beforeEach(() => {
    vi.useFakeTimers();
    mockFetch.mockReset();
    vi.stubGlobal('fetch', mockFetch);
    filesystem = createMockFilesystem();
    manager = new ModuleManager(filesystem as unknown as KernelFileSystem);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    manager.clearCaches();
  });

  // ===========================================================================
  // Cache Hit / Miss
  // ===========================================================================

  describe('cache hit / miss', () => {
    it('should skip fetch when module is already cached', async () => {
      // Module file already exists
      filesystem.exists.mockResolvedValue(true);

      await manager.ensureCdnModule('lodash');

      expect(mockFetch).not.toHaveBeenCalled();
      expect(filesystem.writeFile).not.toHaveBeenCalled();
    });

    it('should fetch and cache when module is not cached', async () => {
      filesystem.exists.mockResolvedValue(false);
      mockFetch.mockResolvedValue(createSuccessResponse('/* esm.sh - lodash@4.17.21 */\nexport default {};'));

      await manager.ensureCdnModule('lodash');

      // Should have fetched from esm.sh
      expect(mockFetch).toHaveBeenCalledWith(
        'https://esm.sh/lodash?bundle',
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- vitest matcher returns `any`
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );

      // Should have written code file and package.json
      expect(filesystem.writeFile).toHaveBeenCalledWith('/node_modules/lodash/index.js', expect.any(String));
      expect(filesystem.writeFile).toHaveBeenCalledWith('/node_modules/lodash/package.json', expect.any(String));
    });

    it('should skip fetch on subsequent calls after caching', async () => {
      // First call: not cached
      filesystem.exists.mockResolvedValue(false);
      mockFetch.mockResolvedValue(createSuccessResponse('/* esm.sh - lodash@4.17.21 */\nexport default {};'));

      await manager.ensureCdnModule('lodash');
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Second call: now cached
      filesystem.exists.mockResolvedValue(true);
      await manager.ensureCdnModule('lodash');

      // Should NOT have fetched again
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  // ===========================================================================
  // Subpath Caching
  // ===========================================================================

  describe('subpath caching', () => {
    it('should cache subpath modules independently from main module', async () => {
      filesystem.exists.mockResolvedValue(false);
      mockFetch.mockResolvedValue(createSuccessResponse('/* esm.sh - lodash@4.17.21 */\nexport default {};'));

      await manager.ensureCdnModule('lodash', 'debounce');

      // Should fetch the subpath-specific URL
      expect(mockFetch).toHaveBeenCalledWith(
        'https://esm.sh/lodash/debounce?bundle',
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- vitest matcher returns `any`
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );

      // Should write to the subpath-specific cache path
      expect(filesystem.writeFile).toHaveBeenCalledWith('/node_modules/lodash/debounce.js', expect.any(String));
    });

    it('should handle scoped packages with subpaths', async () => {
      filesystem.exists.mockResolvedValue(false);
      mockFetch.mockResolvedValue(createSuccessResponse('/* esm.sh - @jscad/modeling@2.12.6 */\nexport {};'));

      await manager.ensureCdnModule('@jscad/modeling', 'primitives');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://esm.sh/@jscad/modeling/primitives?bundle',
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- vitest matcher returns `any`
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );

      expect(filesystem.writeFile).toHaveBeenCalledWith(
        '/node_modules/@jscad/modeling/primitives.js',
        expect.any(String),
      );
    });

    it('should handle nested subpaths and ensure parent directories', async () => {
      filesystem.exists.mockResolvedValue(false);
      mockFetch.mockResolvedValue(createSuccessResponse('/* esm.sh - three@0.160.0 */\nexport {};'));

      await manager.ensureCdnModule('three', 'examples/jsm/controls/OrbitControls');

      // Should ensure the nested subdirectory exists via mkdir with recursive
      expect(filesystem.mkdir).toHaveBeenCalledWith('/node_modules/three/examples/jsm/controls', { recursive: true });

      expect(filesystem.writeFile).toHaveBeenCalledWith(
        '/node_modules/three/examples/jsm/controls/OrbitControls.js',
        expect.any(String),
      );
    });
  });

  // ===========================================================================
  // Concurrent Deduplication
  // ===========================================================================

  describe('concurrent deduplication', () => {
    it('should deduplicate concurrent requests for the same package', async () => {
      filesystem.exists.mockResolvedValue(false);

      // Create a delayed fetch that we can control
      let fetchResolve!: (value: Response) => void;
      const fetchPromise = new Promise<Response>((resolve) => {
        fetchResolve = resolve;
      });
      mockFetch.mockReturnValue(fetchPromise);

      // Fire two concurrent requests
      const promise1 = manager.ensureCdnModule('lodash');
      const promise2 = manager.ensureCdnModule('lodash');

      // Resolve the fetch
      fetchResolve(createSuccessResponse('/* esm.sh - lodash@4.17.21 */\nexport default {};'));

      await Promise.all([promise1, promise2]);

      // Should only have called fetch ONCE
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should NOT deduplicate requests for different packages', async () => {
      filesystem.exists.mockResolvedValue(false);
      mockFetch.mockResolvedValue(createSuccessResponse('/* esm.sh - pkg@1.0.0 */\nexport {};'));

      await Promise.all([manager.ensureCdnModule('lodash'), manager.ensureCdnModule('three')]);

      // Should have called fetch for each package
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should NOT deduplicate subpath vs main module', async () => {
      filesystem.exists.mockResolvedValue(false);
      mockFetch.mockResolvedValue(createSuccessResponse('/* esm.sh - lodash@4.17.21 */\nexport {};'));

      await Promise.all([manager.ensureCdnModule('lodash'), manager.ensureCdnModule('lodash', 'debounce')]);

      // Should have called fetch for both
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  // ===========================================================================
  // Retry Backoff
  // ===========================================================================

  describe('retry backoff', () => {
    it('should skip fetch for recently failed packages', async () => {
      filesystem.exists.mockResolvedValue(false);
      mockFetch.mockRejectedValue(new Error('Network error'));

      // First call: fails (esm.sh + jsdelivr fallback = 2 fetches)
      await manager.ensureCdnModule('bad-package');
      const firstCallCount = mockFetch.mock.calls.length;
      expect(firstCallCount).toBe(2);

      // Second call: should be skipped (within retry delay)
      await manager.ensureCdnModule('bad-package');
      expect(mockFetch).toHaveBeenCalledTimes(firstCallCount); // No new calls
    });

    it('should allow retry after retry delay expires', async () => {
      filesystem.exists.mockResolvedValue(false);
      mockFetch.mockRejectedValue(new Error('Network error'));

      // First call: fails (esm.sh + jsdelivr fallback)
      await manager.ensureCdnModule('bad-package');
      const firstCallCount = mockFetch.mock.calls.length;

      // Advance past retry delay (60 seconds)
      vi.advanceTimersByTime(61_000);

      // Now set fetch to succeed
      mockFetch.mockResolvedValue(createSuccessResponse('/* esm.sh - bad-package@1.0.0 */\nexport {};'));

      // Second call: should retry
      await manager.ensureCdnModule('bad-package');
      expect(mockFetch).toHaveBeenCalledTimes(firstCallCount + 1);
    });

    it('should clear failed state on successful fetch after retry', async () => {
      filesystem.exists.mockResolvedValue(false);
      mockFetch.mockRejectedValue(new Error('Network error'));

      // First call: fails
      await manager.ensureCdnModule('recovered-package');
      const firstCallCount = mockFetch.mock.calls.length;

      // Advance past retry delay
      vi.advanceTimersByTime(61_000);

      // Succeed on retry
      mockFetch.mockResolvedValue(createSuccessResponse('/* esm.sh - recovered-package@1.0.0 */\nexport {};'));

      await manager.ensureCdnModule('recovered-package');
      const secondCallCount = mockFetch.mock.calls.length;
      expect(secondCallCount).toBe(firstCallCount + 1);

      // Now the file should be cached, so next call should check FS
      filesystem.exists.mockResolvedValue(true);
      await manager.ensureCdnModule('recovered-package');

      // Should not have fetched again
      expect(mockFetch).toHaveBeenCalledTimes(secondCallCount);
    });
  });

  // ===========================================================================
  // Fetch Timeout
  // ===========================================================================

  describe('fetch timeout', () => {
    it('should pass an AbortSignal to fetch for timeout control', async () => {
      filesystem.exists.mockResolvedValue(false);

      // Record the signal passed to fetch, then reject immediately
      let capturedSignal: AbortSignal | undefined;
      mockFetch.mockImplementation(async (_url, options) => {
        capturedSignal = options!.signal!;
        throw new Error('Simulated timeout');
      });

      await manager.ensureCdnModule('slow-package');

      // Verify fetch was called with an AbortSignal
      expect(mockFetch).toHaveBeenCalled();
      expect(capturedSignal).toBeInstanceOf(AbortSignal);
    });

    it('should handle aborted fetch gracefully', async () => {
      filesystem.exists.mockResolvedValue(false);

      // Simulate an abort error (what happens when timeout fires)
      mockFetch.mockRejectedValue(new DOMException('The operation was aborted', 'AbortError'));

      // Should not throw
      await expect(manager.ensureCdnModule('aborted-package')).resolves.toBeUndefined();

      // Should not have written anything
      expect(filesystem.writeFile).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // Response Size Limit
  // ===========================================================================

  describe('response size limit', () => {
    it('should reject responses exceeding size limit', async () => {
      filesystem.exists.mockResolvedValue(false);

      // Respond with Content-Length exceeding 10 MB
      mockFetch.mockResolvedValue(createSuccessResponse('huge module', { 'Content-Length': '20000000' }));

      await manager.ensureCdnModule('huge-package');

      // Should not have written anything (both esm.sh and jsdelivr will fail)
      expect(filesystem.writeFile).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // Domain Allowlist
  // ===========================================================================

  describe('domain allowlist', () => {
    it('should only fetch from allowed CDN domains', async () => {
      // The ModuleManager constructs URLs internally using esm.sh and jsdelivr,
      // which are in the allowlist. This test verifies the safeFetch validation
      // works by checking that esm.sh URLs pass validation.
      filesystem.exists.mockResolvedValue(false);
      mockFetch.mockResolvedValue(createSuccessResponse('/* esm.sh - lodash@4.17.21 */\nexport {};'));

      await manager.ensureCdnModule('lodash');

      // Should have successfully fetched
      expect(mockFetch).toHaveBeenCalled();
      expect(filesystem.writeFile).toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // Offline Resilience
  // ===========================================================================

  describe('offline resilience', () => {
    it('should not throw when fetch fails', async () => {
      filesystem.exists.mockResolvedValue(false);
      mockFetch.mockRejectedValue(new TypeError('Failed to fetch'));

      // Should not throw
      await expect(manager.ensureCdnModule('any-package')).resolves.toBeUndefined();
    });

    it('should not write to filesystem when fetch fails', async () => {
      filesystem.exists.mockResolvedValue(false);
      mockFetch.mockRejectedValue(new TypeError('Failed to fetch'));

      await manager.ensureCdnModule('offline-package');

      expect(filesystem.writeFile).not.toHaveBeenCalled();
    });

    it('should record failure for retry backoff', async () => {
      filesystem.exists.mockResolvedValue(false);
      mockFetch.mockRejectedValue(new TypeError('Failed to fetch'));

      await manager.ensureCdnModule('offline-package');

      // Immediate retry should be skipped
      mockFetch.mockClear();
      await manager.ensureCdnModule('offline-package');
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // CDN Fallback
  // ===========================================================================

  describe('CDN fallback', () => {
    it('should fall back to jsdelivr when esm.sh fails', async () => {
      filesystem.exists.mockResolvedValue(false);

      // First call (esm.sh) fails
      mockFetch
        .mockRejectedValueOnce(new Error('esm.sh down'))
        // Second call (jsdelivr) succeeds
        .mockResolvedValueOnce(createSuccessResponse('/* jsdelivr - lodash@4.17.21 */\nexport {};'));

      await manager.ensureCdnModule('lodash');

      // Should have tried both CDNs
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(mockFetch).toHaveBeenNthCalledWith(
        1,
        'https://esm.sh/lodash?bundle',
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- vitest matcher returns `any`
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
      expect(mockFetch).toHaveBeenNthCalledWith(
        2,
        'https://cdn.jsdelivr.net/npm/lodash/+esm',
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- vitest matcher returns `any`
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );

      // Should have written the module from jsdelivr
      expect(filesystem.writeFile).toHaveBeenCalled();
    });

    it('should record failure when both CDNs fail', async () => {
      filesystem.exists.mockResolvedValue(false);

      mockFetch.mockRejectedValueOnce(new Error('esm.sh down')).mockRejectedValueOnce(new Error('jsdelivr down'));

      await manager.ensureCdnModule('unreachable-package');

      // Should not have written anything
      expect(filesystem.writeFile).not.toHaveBeenCalled();

      // Immediate retry should be skipped
      mockFetch.mockClear();
      await manager.ensureCdnModule('unreachable-package');
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // Atomic Write Ordering
  // ===========================================================================

  describe('atomic write ordering', () => {
    it('should write code file before package.json', async () => {
      filesystem.exists.mockResolvedValue(false);
      mockFetch.mockResolvedValue(createSuccessResponse('/* esm.sh - lodash@4.17.21 */\nexport default {};'));

      const writeOrder: string[] = [];
      filesystem.writeFile.mockImplementation(async (path: string) => {
        writeOrder.push(path);
      });

      await manager.ensureCdnModule('lodash');

      // Code should be written before package.json
      expect(writeOrder).toEqual(['/node_modules/lodash/index.js', '/node_modules/lodash/package.json']);
    });

    it('should not overwrite package.json for subpath fetches', async () => {
      // First fetch the main module
      filesystem.exists.mockResolvedValue(false);
      mockFetch.mockResolvedValue(createSuccessResponse('/* esm.sh - lodash@4.17.21 */\nexport default {};'));

      await manager.ensureCdnModule('lodash');

      // Now package.json exists
      filesystem.exists.mockImplementation(async (path: string) => {
        if (path === '/node_modules/lodash/package.json') {
          return true;
        }

        return false;
      });

      // Fetch a subpath
      await manager.ensureCdnModule('lodash', 'debounce');

      // Package.json should only have been written once (during main fetch)
      const packageJsonWrites = filesystem.writeFile.mock.calls.filter(
        (call) => call[0] === '/node_modules/lodash/package.json',
      );
      expect(packageJsonWrites).toHaveLength(1);
    });
  });

  // ===========================================================================
  // clearCaches
  // ===========================================================================

  describe('clearCaches', () => {
    it('should allow retrying after clearCaches', async () => {
      filesystem.exists.mockResolvedValue(false);
      mockFetch.mockRejectedValue(new Error('Network error'));

      // First call: fails (esm.sh + jsdelivr fallback)
      await manager.ensureCdnModule('clear-test');
      const firstCallCount = mockFetch.mock.calls.length;
      expect(firstCallCount).toBe(2);

      // Clear caches
      manager.clearCaches();

      // Now succeed
      mockFetch.mockResolvedValue(createSuccessResponse('/* esm.sh - clear-test@1.0.0 */\nexport {};'));

      // Should retry immediately (no backoff after clear)
      await manager.ensureCdnModule('clear-test');
      expect(mockFetch).toHaveBeenCalledTimes(firstCallCount + 1);
    });
  });

  // ===========================================================================
  // Version Extraction
  // ===========================================================================

  describe('version extraction', () => {
    it('should extract version from esm.sh comment', async () => {
      filesystem.exists.mockResolvedValue(false);
      mockFetch.mockResolvedValue(
        createSuccessResponse('/* esm.sh - lodash@4.17.21 */\nconst x = 1;\nexport default x;'),
      );

      await manager.ensureCdnModule('lodash');

      // Verify the package.json contains the extracted version
      const packageJsonCall = filesystem.writeFile.mock.calls.find((call) =>
        (call[0] as string).endsWith('package.json'),
      );
      expect(packageJsonCall).toBeDefined();
      const packageJson = JSON.parse(packageJsonCall![1] as string) as { version: string };
      expect(packageJson.version).toBe('4.17.21');
    });

    it('should use "unknown" when version cannot be extracted', async () => {
      filesystem.exists.mockResolvedValue(false);
      mockFetch.mockResolvedValue(
        createSuccessResponse('export default {};'), // No version comment
      );

      await manager.ensureCdnModule('no-version');

      const packageJsonCall = filesystem.writeFile.mock.calls.find((call) =>
        (call[0] as string).endsWith('package.json'),
      );
      expect(packageJsonCall).toBeDefined();
      const packageJson = JSON.parse(packageJsonCall![1] as string) as { version: string };
      expect(packageJson.version).toBe('unknown');
    });
  });
});
