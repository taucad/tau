/* eslint-disable @typescript-eslint/naming-convention -- file-system path keys (e.g. '/projects/test/main.ts') are not camelCase identifiers. */
/**
 * Tests for KernelWorker lifecycle, watch subscription, and cache invalidation.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { z } from 'zod';
import { coordinateSystemSchema, unitSchema } from '#types/export-option-schemas.js';
import type { OnWorkerLog } from '@taucad/types';
import { SharedPool } from '@taucad/memory';
import type { CapabilitiesManifest, CreateGeometryResult, ExportGeometryResult } from '#types/runtime.types.js';
import type { KernelRuntime, CreateGeometryInput } from '#types/runtime-kernel.types.js';
import type { TranscoderDefinition, TranscoderEdge } from '#types/runtime-transcoder.types.js';
import type { MockKernelWorkerOptions } from '#testing/kernel-testing.utils.js';
import { MockKernelWorker, createMockFileSystem, createGeometryFile } from '#testing/kernel-testing.utils.js';
import { defineMiddleware } from '#middleware/runtime-middleware.js';
import { attachRuntimePluginDefinition } from '#plugins/plugin-runtime-definition.js';
import { checkAbort } from '#framework/cooperative-abort.js';
import { signalSlot } from '#types/runtime-protocol.types.js';
import { signalBufferByteLength } from '#framework/runtime-framework.constants.js';

const tessellationSchema = z.object({
  tessellation: z
    .object({
      linearTolerance: z.number().positive().default(0.1),
      angularTolerance: z.number().positive().default(15),
    })
    .default({ linearTolerance: 0.1, angularTolerance: 15 }),
});

// =============================================================================
// Test Helpers
// =============================================================================

async function flushMicrotasks(iterations = 100): Promise<void> {
  for (let i = 0; i < iterations; i++) {
    // oxlint-disable-next-line no-await-in-loop -- Intentionally draining microtask queue
    await Promise.resolve();
  }
}

const noopLog: OnWorkerLog = () => {
  /* No-op */
};

function createConfiguredWorker(overrides?: Partial<MockKernelWorkerOptions>) {
  const filesystem = createMockFileSystem();
  filesystem.mocks.readFiles.mockResolvedValue({
    '/projects/test/main.ts': new Uint8Array([1, 2, 3]),
  });

  return new MockKernelWorker({
    middleware: [],
    onLog: noopLog,
    filesystem,
    ...overrides,
  });
}

class FailingKernelWorker extends MockKernelWorker {
  protected override async onCreateGeometry(
    _input: CreateGeometryInput,
    _runtime: KernelRuntime,
  ): Promise<CreateGeometryResult> {
    throw new Error('Build failed: syntax error');
  }
}

// =============================================================================
// Tests
// =============================================================================

describe('KernelWorker lifecycle', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ---------------------------------------------------------------------------
  // Watch subscription on error path
  // ---------------------------------------------------------------------------

  describe('watch subscription on error', () => {
    it('should call updateWatchSet even when createGeometry fails', async () => {
      const filesystem = createMockFileSystem();
      filesystem.mocks.readFiles.mockResolvedValue({
        '/projects/test/main.ts': new Uint8Array([1, 2, 3]),
      });

      const worker = new FailingKernelWorker({
        middleware: [],
        onLog: noopLog,
        filesystem,
      });

      const updateWatchSetSpy = vi.spyOn(worker, 'updateWatchSet');

      const renderComplete = new Promise<void>((resolve) => {
        worker.onStateChanged = (state) => {
          if (state === 'error' || state === 'idle') {
            resolve();
          }
        };
      });

      worker.handleOpenFile(createGeometryFile('main.ts'), {});
      await renderComplete;

      expect(updateWatchSetSpy).toHaveBeenCalled();
    });

    it('should include entry file in watch set when build produces empty dependencies', () => {
      const worker = createConfiguredWorker();

      // @ts-expect-error - accessing private method for test verification
      worker.setBasePath(createGeometryFile('main.ts'));

      // @ts-expect-error - accessing private for test verification
      worker.bundleResultCache.set('/projects/test/main.ts', {
        code: '',
        dependencies: [],
        unresolvedPaths: [],
        issues: [],
        success: false,
      });

      const spy = vi.spyOn(worker, 'updateWatchSet');

      // @ts-expect-error - accessing private for test verification
      worker._updateWatchSetFromCaches();

      expect(spy).toHaveBeenCalled();
      const watchedPaths = spy.mock.calls[0]![0];
      expect(watchedPaths).toContain('/projects/test/main.ts');
    });
  });

  // ---------------------------------------------------------------------------
  // Render generation and _renderInProgress correctness
  // ---------------------------------------------------------------------------

  describe('_renderInProgress correctness', () => {
    it('should not allow an older aborted render to clear isRendering while a newer render is active', async () => {
      vi.useFakeTimers();
      try {
        let resolveGateA!: () => void;
        const gateA = new Promise<void>((resolve) => {
          resolveGateA = resolve;
        });
        let resolveGateB!: () => void;
        const gateB = new Promise<void>((resolve) => {
          resolveGateB = resolve;
        });
        let createGeometryCallCount = 0;

        class GatedKernelWorker extends MockKernelWorker {
          protected override async onCreateGeometry(): Promise<CreateGeometryResult> {
            createGeometryCallCount++;
            // Render A blocks in createGeometry on first call; render B on second
            await (createGeometryCallCount === 1 ? gateA : gateB);
            return { success: true, data: [], issues: [] };
          }
        }

        const filesystem = createMockFileSystem();
        filesystem.mocks.readFiles.mockResolvedValue({
          '/projects/test/main.ts': new Uint8Array([1, 2, 3]),
        });

        const worker = new GatedKernelWorker({
          middleware: [],
          onLog: noopLog,
          filesystem,
        });

        worker.onStateChanged = vi.fn();
        worker.onGeometryComputed = vi.fn();
        worker.onError = vi.fn();

        // Start render A — blocks in createGeometry
        worker.handleOpenFile(createGeometryFile('main.ts'), {});
        await flushMicrotasks();
        await vi.advanceTimersByTimeAsync(0);
        await flushMicrotasks();

        expect(worker.isRendering).toBe(true);

        // Start render B — also blocks in createGeometry (second call)
        worker.handleOpenFile(createGeometryFile('main.ts'), {});
        await flushMicrotasks();
        await vi.advanceTimersByTimeAsync(0);
        await flushMicrotasks();

        // Unblock render A — it will detect isAborted and its finally block runs.
        // The bug: A's finally unconditionally sets _renderInProgress = false,
        // even though B (the current render) is still active.
        resolveGateA();
        await flushMicrotasks();
        await vi.advanceTimersByTimeAsync(0);
        await flushMicrotasks();

        // B is still blocked in createGeometry, so isRendering must be true.
        expect(worker.isRendering).toBe(true);

        // Cleanup: unblock render B
        resolveGateB();
        await flushMicrotasks();
        await vi.advanceTimersByTimeAsync(0);
        await flushMicrotasks();
      } finally {
        vi.useRealTimers();
      }
    });
  });

  // ---------------------------------------------------------------------------
  // bundleResultCache invalidation
  // ---------------------------------------------------------------------------

  describe('bundleResultCache invalidation', () => {
    it('should invalidate bundleResultCache entry when changed path matches the entry key directly', async () => {
      const worker = createConfiguredWorker();

      // @ts-expect-error - accessing private for test verification
      worker.bundleResultCache.set('/projects/test/main.ts', {
        code: '',
        dependencies: [],
        unresolvedPaths: [],
        issues: [
          {
            message: 'Unterminated regular expression',
            code: 'BUNDLER_FAILED',
            type: 'compilation',
            severity: 'error',
          },
        ],
        success: false,
      });

      await worker.notifyFileChanged(['/projects/test/main.ts']);

      // @ts-expect-error - accessing private for test verification
      expect(worker.bundleResultCache.has('/projects/test/main.ts')).toBe(false);
    });

    it('should invalidate bundleResultCache via watch handler when changed path matches entry key', () => {
      const worker = createConfiguredWorker();

      // @ts-expect-error - accessing private method for test verification
      worker.setBasePath(createGeometryFile('main.ts'));

      // @ts-expect-error - accessing private for test verification
      worker.bundleResultCache.set('/projects/test/main.ts', {
        code: '',
        dependencies: [],
        unresolvedPaths: [],
        issues: [{ message: 'Syntax error', code: 'BUNDLER_FAILED', type: 'compilation', severity: 'error' }],
        success: false,
      });

      let capturedWatchCallback: ((event: { type: string; path: string }) => void) | undefined;
      const mockWatch = vi
        .fn()
        .mockImplementation((_request: unknown, callback: (event: { type: string; path: string }) => void) => {
          capturedWatchCallback = callback;
          return () => {
            capturedWatchCallback = undefined;
          };
        });

      // @ts-expect-error - accessing private for test verification
      worker.fileSystem = { watch: mockWatch, dispose: vi.fn(), listen: vi.fn() };

      worker.updateWatchSet(['/projects/test/main.ts']);
      expect(capturedWatchCallback).toBeDefined();

      capturedWatchCallback!({ type: 'change', path: '/projects/test/main.ts' });

      // @ts-expect-error - accessing private for test verification
      expect(worker.bundleResultCache.has('/projects/test/main.ts')).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // render() error cleanup
  // ---------------------------------------------------------------------------

  describe('render error cleanup', () => {
    it('should clear the internal onProgress phase callback when render() throws', async () => {
      const filesystem = createMockFileSystem();
      filesystem.mocks.readFiles.mockResolvedValue({
        '/projects/test/main.ts': new Uint8Array([1, 2, 3]),
      });

      const worker = new FailingKernelWorker({
        middleware: [],
        onLog: noopLog,
        filesystem,
      });

      // Phase 6a-tail: per-call `onProgress` is gone; progress is fanned out via
      // the worker-level `onProgressUpdate` callback (`(phase, rgen, detail?)`)
      // which the channel server relays as a `progress` notify. The internal
      // phase relay (`worker.onProgress`) is wired during render and must be
      // cleared in the failure path so superseded renders cannot leak frames.
      worker.onProgressUpdate = vi.fn();

      await expect(
        worker.render({
          file: createGeometryFile('main.ts'),
          parameters: {},
        }),
      ).rejects.toThrow();

      // @ts-expect-error - accessing private for test verification
      expect(worker.onProgress).toBeUndefined();
    });

    it('should call _updateWatchSetFromCaches when render() throws', async () => {
      const filesystem = createMockFileSystem();
      filesystem.mocks.readFiles.mockResolvedValue({
        '/projects/test/main.ts': new Uint8Array([1, 2, 3]),
      });

      const worker = new FailingKernelWorker({
        middleware: [],
        onLog: noopLog,
        filesystem,
      });

      const updateWatchSetSpy = vi.spyOn(worker, 'updateWatchSet');

      await expect(
        worker.render({
          file: createGeometryFile('main.ts'),
          parameters: {},
        }),
      ).rejects.toThrow();

      expect(updateWatchSetSpy).toHaveBeenCalled();
    });

    it('should refresh filesystem watches after request-scoped exportModel()', async () => {
      const filesystem = createMockFileSystem();
      filesystem.mocks.readFiles.mockResolvedValue({
        '/projects/test/main.ts': new Uint8Array([1, 2, 3]),
      });
      const unsubscribe = vi.fn();
      const watch = vi.fn(() => unsubscribe);
      const worker = new MockKernelWorker({
        middleware: [],
        onLog: noopLog,
        filesystem: {
          ...filesystem,
          watch,
        },
      });
      // @ts-expect-error - accessing private bridge filesystem for watch verification
      worker.fileSystem = {
        ...filesystem,
        watch,
      };

      const result = await worker.exportModel({
        file: createGeometryFile('main.ts'),
        parameters: {},
        format: 'glb',
      });

      expect(result.success).toBe(true);
      expect(watch).toHaveBeenCalledOnce();
      const watchRequest = watch.mock.calls[0]?.[0] as { paths: readonly string[] } | undefined;
      expect(watchRequest?.paths).toContain('/projects/test/main.ts');
    });

    it('should clear onProgress when executeRender fails via handleOpenFile', async () => {
      const filesystem = createMockFileSystem();
      filesystem.mocks.readFiles.mockResolvedValue({
        '/projects/test/main.ts': new Uint8Array([1, 2, 3]),
      });

      const worker = new FailingKernelWorker({
        middleware: [],
        onLog: noopLog,
        filesystem,
      });

      worker.onProgressUpdate = vi.fn();

      const renderComplete = new Promise<void>((resolve) => {
        worker.onStateChanged = (state) => {
          if (state === 'error' || state === 'idle') {
            resolve();
          }
        };
      });

      worker.handleOpenFile(createGeometryFile('main.ts'), {});
      await renderComplete;

      // @ts-expect-error - accessing private for test verification
      expect(worker.onProgress).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // Bundler cache efficiency
  // ---------------------------------------------------------------------------

  describe('bundler cache efficiency', () => {
    it('should return cached dependencies from resolveDependencies when bundleResultCache has a hit', async () => {
      const worker = createConfiguredWorker();

      // @ts-expect-error - accessing private method for test verification
      worker.setBasePath(createGeometryFile('main.ts'));

      const expectedDependencies = ['/projects/test/main.ts', '/projects/test/lib/box.ts'];

      // Pre-populate the bundle cache with a known result
      // @ts-expect-error - accessing private for test verification
      worker.bundleResultCache.set('/projects/test/main.ts', {
        code: 'bundled-code',
        dependencies: expectedDependencies,
        unresolvedPaths: [],
        issues: [],
        success: true,
      });

      const rawResolveDependenciesSpy = vi.fn().mockResolvedValue(['/projects/test/main.ts']);
      const mockBundlerDefinition = {
        name: 'MockBundler',
        version: '1.0.0',
        extensions: ['ts'],
        initialize: vi.fn(),
        detectImports: vi.fn(),
        bundle: vi.fn(),
        execute: vi.fn(),
        registerModule: vi.fn(),
        resolveDependencies: rawResolveDependenciesSpy,
      };

      // Inject mock bundler directly into loadedBundlers
      // @ts-expect-error - accessing protected for test verification
      worker.loadedBundlers.set('ts', { definition: mockBundlerDefinition, ctx: {} });

      // Clear any cached facade so it rebuilds with our mock bundler
      // @ts-expect-error - accessing private for test verification
      worker.cachedBundlerFacade = undefined;
      // @ts-expect-error - accessing private for test verification
      worker.cachedRuntime = undefined;

      // @ts-expect-error - accessing private for test verification
      const facade = worker.createBundlerFacade();
      const result = await facade.resolveDependencies('/projects/test/main.ts');

      expect(result).toEqual({ resolved: expectedDependencies, unresolved: [] });
      // The raw bundler's resolveDependencies should NOT have been called
      expect(rawResolveDependenciesSpy).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // Bundler invalidation on project switch
  // ---------------------------------------------------------------------------

  describe('bundler invalidation on project switch', () => {
    it('should invalidate cached bundler facade when basePath changes', () => {
      const worker = createConfiguredWorker();

      // @ts-expect-error - accessing private method for test verification
      worker.setBasePath(createGeometryFile('main.ts', '/projects/project-a'));

      // @ts-expect-error - accessing private for test verification
      const runtime1 = worker.createRuntime();
      const bundler1 = runtime1.bundler;

      // @ts-expect-error - accessing private method for test verification
      worker.setBasePath(createGeometryFile('main.ts', '/projects/project-b'));

      // @ts-expect-error - accessing private for test verification
      const runtime2 = worker.createRuntime();
      const bundler2 = runtime2.bundler;

      expect(bundler1).not.toBe(bundler2);
    });
  });

  // ---------------------------------------------------------------------------
  // registerWatchPath
  // ---------------------------------------------------------------------------

  describe('registerWatchPath', () => {
    it('should include middleware-registered paths in watch set', () => {
      const worker = createConfiguredWorker();

      // @ts-expect-error - accessing private method for test verification
      worker.setBasePath(createGeometryFile('main.ts'));

      // Simulate middleware registering a watch path
      // @ts-expect-error - accessing private for test verification
      worker.handleRegisterWatchPath('/projects/test/.tau/parameters/main.ts.json', { watchDebounce: 200 });

      const spy = vi.spyOn(worker, 'updateWatchSet');

      // @ts-expect-error - accessing private for test verification
      worker._updateWatchSetFromCaches();

      expect(spy).toHaveBeenCalled();
      const watchedPaths = spy.mock.calls[0]![0];
      expect(watchedPaths).toContain('/projects/test/.tau/parameters/main.ts.json');
      expect(watchedPaths).toContain('/projects/test/main.ts');
    });

    it('should select shortest debounce tier when middleware-watched paths change', async () => {
      vi.useFakeTimers();
      try {
        const worker = createConfiguredWorker();

        // @ts-expect-error - accessing private method for test verification
        worker.setBasePath(createGeometryFile('main.ts'));

        worker.onStateChanged = vi.fn();
        worker.onGeometryComputed = vi.fn();

        // @ts-expect-error - accessing private for test verification
        worker.handleRegisterWatchPath('/projects/test/.tau/parameters/main.ts.json', { watchDebounce: 200 });

        // @ts-expect-error - accessing private for test verification
        worker.currentFile = createGeometryFile('main.ts');

        let capturedWatchCallback: ((event: { type: string; path: string }) => void) | undefined;
        const mockWatch = vi
          .fn()
          .mockImplementation((_request: unknown, callback: (event: { type: string; path: string }) => void) => {
            capturedWatchCallback = callback;
            return () => {
              capturedWatchCallback = undefined;
            };
          });

        // @ts-expect-error - accessing private for test verification
        worker.fileSystem = { watch: mockWatch, dispose: vi.fn(), listen: vi.fn() };

        worker.updateWatchSet(['/projects/test/main.ts', '/projects/test/.tau/parameters/main.ts.json']);

        capturedWatchCallback!({ type: 'change', path: '/projects/test/.tau/parameters/main.ts.json' });

        // Buffering should be emitted immediately
        expect(worker.onStateChanged).toHaveBeenCalledWith('buffering');

        // At 199ms, render should not have started (200ms debounce)
        await vi.advanceTimersByTimeAsync(199);
        expect(worker.onStateChanged).not.toHaveBeenCalledWith('rendering');

        // At 201ms, render should have been triggered
        await vi.advanceTimersByTimeAsync(2);
        expect(worker.onStateChanged).toHaveBeenCalledWith('rendering');
      } finally {
        vi.useRealTimers();
      }
    });

    it('should use default fileChangeDebounce when non-middleware path changes', async () => {
      vi.useFakeTimers();
      try {
        const worker = createConfiguredWorker();

        // @ts-expect-error - accessing private method for test verification
        worker.setBasePath(createGeometryFile('main.ts'));

        worker.onStateChanged = vi.fn();
        worker.onGeometryComputed = vi.fn();

        // @ts-expect-error - accessing private for test verification
        worker.handleRegisterWatchPath('/projects/test/.tau/parameters/main.ts.json', { watchDebounce: 200 });

        // @ts-expect-error - accessing private for test verification
        worker.currentFile = createGeometryFile('main.ts');

        let capturedWatchCallback: ((event: { type: string; path: string }) => void) | undefined;
        const mockWatch = vi
          .fn()
          .mockImplementation((_request: unknown, callback: (event: { type: string; path: string }) => void) => {
            capturedWatchCallback = callback;
            return () => {
              capturedWatchCallback = undefined;
            };
          });

        // @ts-expect-error - accessing private for test verification
        worker.fileSystem = { watch: mockWatch, dispose: vi.fn(), listen: vi.fn() };

        worker.updateWatchSet(['/projects/test/main.ts', '/projects/test/.tau/parameters/main.ts.json']);

        capturedWatchCallback!({ type: 'change', path: '/projects/test/main.ts' });

        // Buffering should be emitted immediately
        expect(worker.onStateChanged).toHaveBeenCalledWith('buffering');

        // At 100ms, render should not have started yet (200ms default debounce)
        await vi.advanceTimersByTimeAsync(100);
        expect(worker.onStateChanged).not.toHaveBeenCalledWith('rendering');

        // At 201ms, render should have been triggered
        await vi.advanceTimersByTimeAsync(101);
        expect(worker.onStateChanged).toHaveBeenCalledWith('rendering');
      } finally {
        vi.useRealTimers();
      }
    });

    it('should update debounce value on re-registration (idempotent)', () => {
      const worker = createConfiguredWorker();

      // @ts-expect-error - accessing private for test verification
      worker.handleRegisterWatchPath('/projects/test/.tau/parameters/main.ts.json', { watchDebounce: 100 });

      expect(worker.getMiddlewareWatchPaths().get('/projects/test/.tau/parameters/main.ts.json')).toBe(100);

      // @ts-expect-error - accessing private for test verification
      worker.handleRegisterWatchPath('/projects/test/.tau/parameters/main.ts.json', { watchDebounce: 200 });

      expect(worker.getMiddlewareWatchPaths().get('/projects/test/.tau/parameters/main.ts.json')).toBe(200);
    });

    it('should clear middleware watch paths on cleanup', async () => {
      const worker = createConfiguredWorker();

      // @ts-expect-error - accessing private for test verification
      worker.handleRegisterWatchPath('/projects/test/.tau/parameters/main.ts.json', { watchDebounce: 200 });

      expect(worker.getMiddlewareWatchPaths().size).toBe(1);

      await worker.cleanup();

      expect(worker.getMiddlewareWatchPaths().size).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Buffering state emission
  // ---------------------------------------------------------------------------

  describe('buffering state', () => {
    it('should not emit duplicate buffering on repeated scheduleRender calls', async () => {
      vi.useFakeTimers();
      try {
        const worker = createConfiguredWorker();

        // @ts-expect-error - accessing private method for test verification
        worker.setBasePath(createGeometryFile('main.ts'));

        worker.onStateChanged = vi.fn();
        worker.onGeometryComputed = vi.fn();

        // @ts-expect-error - accessing private for test verification
        worker.currentFile = createGeometryFile('main.ts');

        // Call scheduleRender 3x rapidly via handleUpdateParameters
        worker.handleUpdateParameters({ width: 1 });
        worker.handleUpdateParameters({ width: 2 });
        worker.handleUpdateParameters({ width: 3 });

        const bufferingCalls = (worker.onStateChanged as ReturnType<typeof vi.fn>).mock.calls.filter(
          ([state]) => state === 'buffering',
        );
        expect(bufferingCalls).toHaveLength(1);
      } finally {
        vi.useRealTimers();
      }
    });

    it('should emit idle when render completes with no pending timer', async () => {
      const worker = createConfiguredWorker();

      const stateChanges: string[] = [];
      const renderComplete = new Promise<void>((resolve) => {
        worker.onStateChanged = (state) => {
          stateChanges.push(state);
          if (state === 'idle' || state === 'error') {
            resolve();
          }
        };
      });

      worker.handleOpenFile(createGeometryFile('main.ts'));
      await renderComplete;

      expect(stateChanges).toContain('rendering');
      expect(stateChanges).toContain('idle');
    });

    it('should emit buffering instead of idle when render completes with pending timer', async () => {
      vi.useFakeTimers();
      try {
        let resolveGate!: () => void;
        const gate = new Promise<void>((resolve) => {
          resolveGate = resolve;
        });

        class GatedKernelWorker extends MockKernelWorker {
          protected override async onCreateGeometry(
            _input: CreateGeometryInput,
            _runtime: KernelRuntime,
          ): Promise<CreateGeometryResult> {
            await gate;
            return { success: true, data: [], issues: [] };
          }
        }

        const filesystem = createMockFileSystem();
        filesystem.mocks.readFiles.mockResolvedValue({
          '/projects/test/main.ts': new Uint8Array([1, 2, 3]),
        });

        const worker = new GatedKernelWorker({
          middleware: [],
          onLog: noopLog,
          filesystem,
        });

        const stateChanges: string[] = [];
        worker.onStateChanged = (state) => {
          stateChanges.push(state);
        };
        worker.onGeometryComputed = vi.fn();

        worker.handleOpenFile(createGeometryFile('main.ts'), {});

        // Simulate a watch event arriving during the render by directly
        // setting paramDebounceTimer (scheduleRender would normally do this)
        // @ts-expect-error - accessing private for test verification
        // oxlint-disable-next-line no-empty-function -- noop timer for test
        worker.paramDebounceTimer = setTimeout(() => {}, 500);

        resolveGate();
        await flushMicrotasks();
        await vi.advanceTimersByTimeAsync(0);
        await flushMicrotasks();

        expect(stateChanges).toContain('rendering');
        expect(stateChanges).toContain('buffering');
        expect(stateChanges).not.toContain('idle');
      } finally {
        vi.useRealTimers();
      }
    });
  });

  // ---------------------------------------------------------------------------
  // handleOpenFile with optional parameters
  // ---------------------------------------------------------------------------

  describe('handleOpenFile optional parameters', () => {
    it('should default parameters to empty object when omitted', async () => {
      const worker = createConfiguredWorker();

      const renderComplete = new Promise<void>((resolve) => {
        worker.onStateChanged = (state) => {
          if (state === 'idle' || state === 'error') {
            resolve();
          }
        };
      });

      worker.handleOpenFile(createGeometryFile('main.ts'));
      await renderComplete;

      // @ts-expect-error - accessing private for test verification
      expect(worker.currentParameters).toEqual({});
    });

    it('should use provided parameters when given', async () => {
      const worker = createConfiguredWorker();

      const renderComplete = new Promise<void>((resolve) => {
        worker.onStateChanged = (state) => {
          if (state === 'idle' || state === 'error') {
            resolve();
          }
        };
      });

      worker.handleOpenFile(createGeometryFile('main.ts'), { width: 10 });
      await renderComplete;

      // @ts-expect-error - accessing private for test verification
      expect(worker.currentParameters).toEqual({ width: 10 });
    });
  });

  // ---------------------------------------------------------------------------
  // handleStageAndOpenFile (TR7: bytes ride the wire)
  // ---------------------------------------------------------------------------

  describe('handleStageAndOpenFile', () => {
    it('writes every staged byte payload to the worker filesystem before opening the entry', async () => {
      const filesystem = createMockFileSystem();
      filesystem.mocks.readFiles.mockResolvedValue({
        '/projects/test/main.ts': new Uint8Array([1, 2, 3]),
      });
      const worker = new MockKernelWorker({ middleware: [], onLog: noopLog, filesystem });

      const callOrder: string[] = [];
      filesystem.mocks.writeFile.mockImplementation(async (path: string) => {
        callOrder.push(`writeFile:${path}`);
      });
      const handleOpenFileSpy = vi.spyOn(worker, 'handleOpenFile').mockImplementation((): void => {
        callOrder.push('handleOpenFile');
      });

      const stage: Record<string, Uint8Array<ArrayBuffer>> = {
        '/projects/test/main.ts': new Uint8Array([10, 20, 30]),
        '/projects/test/lib.ts': new Uint8Array([40, 50]),
      };

      await worker.handleStageAndOpenFile({
        stage,
        file: createGeometryFile('main.ts'),
        parameters: { width: 5 },
        options: { coordinateSystem: 'z-up' },
      });

      expect(filesystem.mocks.writeFile).toHaveBeenCalledTimes(2);
      expect(filesystem.mocks.writeFile).toHaveBeenCalledWith('/projects/test/main.ts', new Uint8Array([10, 20, 30]));
      expect(filesystem.mocks.writeFile).toHaveBeenCalledWith('/projects/test/lib.ts', new Uint8Array([40, 50]));

      // Strict ordering: every write must complete before handleOpenFile is invoked.
      expect(callOrder).toEqual([
        'writeFile:/projects/test/main.ts',
        'writeFile:/projects/test/lib.ts',
        'handleOpenFile',
      ]);

      expect(handleOpenFileSpy).toHaveBeenCalledTimes(1);
      expect(handleOpenFileSpy).toHaveBeenCalledWith(
        createGeometryFile('main.ts'),
        { width: 5 },
        { coordinateSystem: 'z-up' },
      );
    });

    it('creates parent directories (recursive) once per unique parent before staging', async () => {
      const filesystem = createMockFileSystem();
      filesystem.mocks.readFiles.mockResolvedValue({});
      const worker = new MockKernelWorker({ middleware: [], onLog: noopLog, filesystem });
      vi.spyOn(worker, 'handleOpenFile').mockReturnValue(undefined);

      await worker.handleStageAndOpenFile({
        stage: {
          '/projects/test/a.ts': new Uint8Array([1]),
          '/projects/test/b.ts': new Uint8Array([2]),
          '/projects/test/sub/c.ts': new Uint8Array([3]),
        },
        file: createGeometryFile('a.ts'),
      });

      expect(filesystem.mocks.mkdir).toHaveBeenCalledTimes(2);
      expect(filesystem.mocks.mkdir).toHaveBeenCalledWith('/projects/test', { recursive: true });
      expect(filesystem.mocks.mkdir).toHaveBeenCalledWith('/projects/test/sub', { recursive: true });
    });

    it('opens the entry without staging when the stage map is empty', async () => {
      const filesystem = createMockFileSystem();
      filesystem.mocks.readFiles.mockResolvedValue({
        '/projects/test/main.ts': new Uint8Array([1, 2, 3]),
      });
      const worker = new MockKernelWorker({ middleware: [], onLog: noopLog, filesystem });
      const handleOpenFileSpy = vi.spyOn(worker, 'handleOpenFile').mockReturnValue(undefined);

      await worker.handleStageAndOpenFile({
        stage: {},
        file: createGeometryFile('main.ts'),
        parameters: {},
      });

      expect(filesystem.mocks.writeFile).not.toHaveBeenCalled();
      expect(filesystem.mocks.mkdir).not.toHaveBeenCalled();
      expect(handleOpenFileSpy).toHaveBeenCalledWith(createGeometryFile('main.ts'), {}, undefined);
    });

    it('does not invoke handleOpenFile if a writeFile failure aborts staging', async () => {
      const filesystem = createMockFileSystem();
      filesystem.mocks.writeFile.mockRejectedValueOnce(new Error('disk full'));
      const worker = new MockKernelWorker({ middleware: [], onLog: noopLog, filesystem });
      const handleOpenFileSpy = vi.spyOn(worker, 'handleOpenFile').mockReturnValue(undefined);

      await expect(
        worker.handleStageAndOpenFile({
          stage: { '/projects/test/main.ts': new Uint8Array([1]) },
          file: createGeometryFile('main.ts'),
        }),
      ).rejects.toThrow('disk full');

      expect(handleOpenFileSpy).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // Immediate entry-file watch
  // ---------------------------------------------------------------------------

  describe('immediate entry-file watch', () => {
    it('should watch the entry file immediately on handleOpenFile so edits during a long render are not missed', async () => {
      vi.useFakeTimers();
      try {
        let resolveGate!: () => void;
        const gate = new Promise<void>((resolve) => {
          resolveGate = resolve;
        });

        class GatedKernelWorker extends MockKernelWorker {
          protected override async onCreateGeometry(
            _input: CreateGeometryInput,
            _runtime: KernelRuntime,
          ): Promise<CreateGeometryResult> {
            await gate;
            return {
              success: true,
              data: [],
              issues: [],
            };
          }
        }

        const filesystem = createMockFileSystem();
        filesystem.mocks.readFiles.mockResolvedValue({
          '/projects/test/main.ts': new Uint8Array([1, 2, 3]),
        });

        const worker = new GatedKernelWorker({
          middleware: [],
          onLog: noopLog,
          filesystem,
        });

        const updateWatchSetSpy = vi.spyOn(worker, 'updateWatchSet');
        worker.onStateChanged = vi.fn();
        worker.onGeometryComputed = vi.fn();

        // Starts executeRender via handleOpenFile, which blocks in createGeometry
        worker.handleOpenFile(createGeometryFile('main.ts'), {});

        // `updateWatchSet` must fire immediately, BEFORE createGeometry completes
        expect(updateWatchSetSpy).toHaveBeenCalled();
        const firstCallArgs = updateWatchSetSpy.mock.calls[0]![0];
        expect(firstCallArgs).toContain('/projects/test/main.ts');

        // Unblock the gate so the render completes
        resolveGate();
        await flushMicrotasks();
        await vi.advanceTimersByTimeAsync(0);
        await flushMicrotasks();
      } finally {
        vi.useRealTimers();
      }
    });
  });

  // ---------------------------------------------------------------------------
  // middleware getDependencies hook
  // ---------------------------------------------------------------------------

  describe('middleware getDependencies', () => {
    it('should include middleware dependency files in the dependency hash', async () => {
      const parameterFileContent = new Uint8Array([10, 20, 30]);

      const middlewareWithDeps = defineMiddleware({
        id: 'test-deps',
        name: 'test-deps',
        getDependencies({ basePath }) {
          return [`${basePath}/.tau/parameters/main.ts.json`];
        },
      });

      const filesystem = createMockFileSystem();
      filesystem.mocks.readFiles.mockResolvedValue({
        '/projects/test/main.ts': new Uint8Array([1, 2, 3]),
      });
      filesystem.mocks.readFile.mockResolvedValue(parameterFileContent);

      const worker = createConfiguredWorker({
        middleware: [middlewareWithDeps],
        filesystem,
      });

      worker.onStateChanged = vi.fn();
      worker.onGeometryComputed = vi.fn();

      const result1 = await worker.runCreateGeometry('main.ts');
      expect(result1.success).toBe(true);
      const hash1 = result1.success ? result1.data[0]?.hash : undefined;

      // Change the parameter file content and invalidate caches
      // (simulates a watch-triggered file change between render cycles)
      filesystem.mocks.readFile.mockResolvedValue(new Uint8Array([99, 99, 99]));
      // @ts-expect-error - accessing private for test verification
      worker._invalidateCachesForPaths(['/projects/test/.tau/parameters/main.ts.json']);
      // @ts-expect-error - accessing private for test verification
      worker.renderDependencyCache = undefined;

      const result2 = await worker.runCreateGeometry('main.ts');
      expect(result2.success).toBe(true);
      const hash2 = result2.success ? result2.data[0]?.hash : undefined;

      expect(hash1).toBeDefined();
      expect(hash2).toBeDefined();
      expect(hash1).not.toBe(hash2);
    });

    it('should produce identical hashes when middleware dependency file is unchanged', async () => {
      const parameterFileContent = new Uint8Array([10, 20, 30]);

      const middlewareWithDeps = defineMiddleware({
        id: 'test-deps',
        name: 'test-deps',
        getDependencies({ basePath }) {
          return [`${basePath}/.tau/parameters/main.ts.json`];
        },
      });

      const filesystem = createMockFileSystem();
      filesystem.mocks.readFiles.mockResolvedValue({
        '/projects/test/main.ts': new Uint8Array([1, 2, 3]),
      });
      filesystem.mocks.readFile.mockResolvedValue(parameterFileContent);

      const worker = createConfiguredWorker({
        middleware: [middlewareWithDeps],
        filesystem,
      });

      worker.onStateChanged = vi.fn();
      worker.onGeometryComputed = vi.fn();

      const result1 = await worker.runCreateGeometry('main.ts');
      const hash1 = result1.success ? result1.data[0]?.hash : undefined;

      const result2 = await worker.runCreateGeometry('main.ts');
      const hash2 = result2.success ? result2.data[0]?.hash : undefined;

      expect(hash1).toBeDefined();
      expect(hash1).toBe(hash2);
    });

    it('should use sentinel hash when middleware dependency file is missing', async () => {
      const middlewareWithDeps = defineMiddleware({
        id: 'test-deps',
        name: 'test-deps',
        getDependencies({ basePath }) {
          return [`${basePath}/.tau/missing.json`];
        },
      });

      const filesystem = createMockFileSystem();
      filesystem.mocks.readFiles.mockResolvedValue({
        '/projects/test/main.ts': new Uint8Array([1, 2, 3]),
      });
      filesystem.mocks.readFile.mockRejectedValue(new Error('ENOENT'));

      const worker = createConfiguredWorker({
        middleware: [middlewareWithDeps],
        filesystem,
      });

      worker.onStateChanged = vi.fn();
      worker.onGeometryComputed = vi.fn();

      const result = await worker.runCreateGeometry('main.ts');
      expect(result.success).toBe(true);
    });

    it('should call getDependencies with correct input and resolved options', async () => {
      const getDependenciesSpy = vi.fn().mockReturnValue([]);

      const middlewareWithDeps = defineMiddleware({
        id: 'test-deps',
        name: 'test-deps',
        getDependencies: getDependenciesSpy,
      });

      const filesystem = createMockFileSystem();
      filesystem.mocks.readFiles.mockResolvedValue({
        '/projects/test/main.ts': new Uint8Array([1, 2, 3]),
      });

      const middlewareOptions = { parametersFile: '.tau/params.json' };
      const worker = createConfiguredWorker({
        middleware: [middlewareWithDeps],
        middlewareConfigs: [middlewareOptions],
        filesystem,
      });

      worker.onStateChanged = vi.fn();
      worker.onGeometryComputed = vi.fn();

      await worker.runCreateGeometry('main.ts');

      expect(getDependenciesSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          filePath: '/projects/test/main.ts',
          basePath: '/projects/test',
        }),
        middlewareOptions,
      );
    });

    it('should skip getDependencies for disabled middleware', async () => {
      const getDependenciesSpy = vi.fn().mockReturnValue([]);

      const middlewareWithDeps = defineMiddleware({
        id: 'test-deps',
        name: 'test-deps',
        getDependencies: getDependenciesSpy,
      });

      const filesystem = createMockFileSystem();
      filesystem.mocks.readFiles.mockResolvedValue({
        '/projects/test/main.ts': new Uint8Array([1, 2, 3]),
      });

      const worker = createConfiguredWorker({
        middleware: [middlewareWithDeps],
        middlewareEnabled: [false],
        filesystem,
      });

      worker.onStateChanged = vi.fn();
      worker.onGeometryComputed = vi.fn();

      await worker.runCreateGeometry('main.ts');

      expect(getDependenciesSpy).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // Unresolved dependency path tracking
  // ---------------------------------------------------------------------------

  describe('unresolved dependency path tracking', () => {
    it('should include unresolvedDependencyPaths in watch set via _updateWatchSetFromCaches', () => {
      const worker = createConfiguredWorker();

      // @ts-expect-error - accessing private method for test verification
      worker.setBasePath(createGeometryFile('main.ts'));

      // @ts-expect-error - accessing private for test verification
      worker.unresolvedDependencyPaths = new Set(['/projects/test/lib/foundation.ts', '/projects/test/lib/posts.ts']);

      const spy = vi.spyOn(worker, 'updateWatchSet');

      // @ts-expect-error - accessing private for test verification
      worker._updateWatchSetFromCaches();

      expect(spy).toHaveBeenCalled();
      const watchedPaths = spy.mock.calls[0]![0];
      expect(watchedPaths).toContain('/projects/test/lib/foundation.ts');
      expect(watchedPaths).toContain('/projects/test/lib/posts.ts');
      expect(watchedPaths).toContain('/projects/test/main.ts');
    });

    it('should include bundleResultCache unresolvedPaths in watch set via _updateWatchSetFromCaches', () => {
      const worker = createConfiguredWorker();

      // @ts-expect-error - accessing private method for test verification
      worker.setBasePath(createGeometryFile('main.ts'));

      // @ts-expect-error - accessing private for test verification
      worker.bundleResultCache.set('/projects/test/main.ts', {
        code: '',
        dependencies: ['/projects/test/main.ts'],
        unresolvedPaths: ['/projects/test/lib/box.ts', '/projects/test/lib/cylinder.ts'],
        issues: [],
        success: false,
      });

      const spy = vi.spyOn(worker, 'updateWatchSet');

      // @ts-expect-error - accessing private for test verification
      worker._updateWatchSetFromCaches();

      expect(spy).toHaveBeenCalled();
      const watchedPaths = spy.mock.calls[0]![0];
      expect(watchedPaths).toContain('/projects/test/lib/box.ts');
      expect(watchedPaths).toContain('/projects/test/lib/cylinder.ts');
      expect(watchedPaths).toContain('/projects/test/main.ts');
    });
  });
});

// ---------------------------------------------------------------------------
// Render timeout
// ---------------------------------------------------------------------------

describe('abort reason propagation', () => {
  it('should transition to error state when abortReason is timeout', async () => {
    const sab = new SharedArrayBuffer(signalBufferByteLength);
    const view = new Int32Array(sab);

    class TimeoutKernelWorker extends MockKernelWorker {
      protected override async onCreateGeometry(): Promise<CreateGeometryResult> {
        // Simulate main-thread timeout firing during WASM: set reason then increment generation
        Atomics.store(view, signalSlot.abortReason, 2);
        Atomics.add(view, signalSlot.abortGeneration, 1);
        checkAbort();
        return { success: true, data: [], issues: [] };
      }
    }

    const filesystem = createMockFileSystem();
    filesystem.mocks.readFiles.mockResolvedValue({
      '/projects/test/main.ts': new Uint8Array([1, 2, 3]),
    });

    const worker = new TimeoutKernelWorker({
      middleware: [],
      onLog: noopLog,
      filesystem,
    });

    worker.setSignalBuffer(sab);
    worker.onError = vi.fn();

    const renderComplete = new Promise<void>((resolve) => {
      worker.onStateChanged = (state) => {
        if (state === 'error' || state === 'idle') {
          resolve();
        }
      };
    });

    worker.handleOpenFile(createGeometryFile('main.ts'), {});
    await renderComplete;

    // Phase 6a-tail (R18): onError is invoked as `(issues, rgen)` so the
    // dispatcher can attach the originating render generation to the
    // `errorEvent` notify. Match both arguments.
    expect(worker.onError).toHaveBeenCalledWith(
      // oxlint-disable-next-line @typescript-eslint/no-unsafe-assignment -- vitest asymmetric matchers are untyped
      expect.arrayContaining([expect.objectContaining({ message: expect.stringContaining('timed out') })]),
      expect.any(Number),
    );
  });

  it('should transition to idle when abortReason is superseded', async () => {
    const sab = new SharedArrayBuffer(signalBufferByteLength);
    const view = new Int32Array(sab);

    class SupersededKernelWorker extends MockKernelWorker {
      protected override async onCreateGeometry(): Promise<CreateGeometryResult> {
        // Simulate main-thread supersession: set reason then increment generation
        Atomics.store(view, signalSlot.abortReason, 1);
        Atomics.add(view, signalSlot.abortGeneration, 1);
        checkAbort();
        return { success: true, data: [], issues: [] };
      }
    }

    const filesystem = createMockFileSystem();
    filesystem.mocks.readFiles.mockResolvedValue({
      '/projects/test/main.ts': new Uint8Array([1, 2, 3]),
    });

    const worker = new SupersededKernelWorker({
      middleware: [],
      onLog: noopLog,
      filesystem,
    });

    worker.setSignalBuffer(sab);
    worker.onError = vi.fn();

    const renderComplete = new Promise<void>((resolve) => {
      worker.onStateChanged = (state) => {
        if (state === 'error' || state === 'idle') {
          resolve();
        }
      };
    });

    worker.handleOpenFile(createGeometryFile('main.ts'), {});
    await renderComplete;

    expect(worker.onError).not.toHaveBeenCalled();
  });
});

describe('shared pools', () => {
  it('should accept geometry pool buffer via setGeometryPoolBuffer', () => {
    const worker = createConfiguredWorker();
    const buffer = new SharedArrayBuffer(4096);

    expect(() => {
      worker.setGeometryPoolBuffer(buffer);
    }).not.toThrow();
  });

  it('should accept file pool buffer via setFilePoolBuffer', () => {
    const worker = createConfiguredWorker();
    const buffer = new SharedArrayBuffer(8192);

    expect(() => {
      worker.setFilePoolBuffer(buffer);
    }).not.toThrow();
  });

  it('should expose geometryPool after setGeometryPoolBuffer and initialize', async () => {
    const worker = createConfiguredWorker();
    const buffer = new SharedArrayBuffer(256 * 1024);
    worker.setGeometryPoolBuffer(buffer);

    expect(worker.geometryPool).toBeUndefined();

    await worker.initialize({
      callbacks: { onLog: vi.fn() },
      transferables: {},
      options: {},
    });

    expect(worker.geometryPool).toBeDefined();
    expect(worker.geometryPool).toBeInstanceOf(SharedPool);
  });

  it('should expose filePool after setFilePoolBuffer and initialize', async () => {
    const worker = createConfiguredWorker();
    const buffer = new SharedArrayBuffer(256 * 1024);
    worker.setFilePoolBuffer(buffer);

    expect(worker.filePool).toBeUndefined();

    await worker.initialize({
      callbacks: { onLog: vi.fn() },
      transferables: {},
      options: {},
    });

    expect(worker.filePool).toBeDefined();
    expect(worker.filePool).toBeInstanceOf(SharedPool);
  });
});

// ---------------------------------------------------------------------------
// Transcoder loading and capabilities manifest
// ---------------------------------------------------------------------------

describe('transcoder loading', () => {
  function createMockTranscoderModule(edges: TranscoderEdge[]) {
    return {
      name: 'MockTranscoder',
      version: '1.0.0',
      edges,
      initialize: vi.fn().mockResolvedValue({ initialized: true }),
      transcode: vi.fn().mockResolvedValue({
        success: true,
        data: [{ bytes: new Uint8Array([1, 2, 3]), name: 'output.usdz', mimeType: 'model/vnd.usdz+zip' }],
        issues: [],
      }),
      cleanup: vi.fn().mockResolvedValue(undefined),
    } satisfies TranscoderDefinition<{ initialized: boolean }>;
  }

  const createMockTranscoderPlugin = (id: string, module: ReturnType<typeof createMockTranscoderModule>) =>
    attachRuntimePluginDefinition({ id }, () => module);

  it('should include kernel-direct routes in manifest even without transcoders', async () => {
    const worker = createConfiguredWorker();

    await worker.initialize({
      callbacks: { onLog: vi.fn() },
      transferables: {},
      options: {},
    });

    const manifest = worker.capabilitiesManifest;
    const transcodedRoutes = manifest.routes.filter((r) => r.transcoderId);
    const directRoutes = manifest.routes.filter((r) => !r.transcoderId);
    expect(transcodedRoutes).toEqual([]);
    expect(directRoutes.length).toBeGreaterThan(0);
    expect(directRoutes.every((entry) => entry.kernelId === 'mock-kernel')).toBe(true);
    expect(manifest.routes.length).toBe(directRoutes.length);
    expect(directRoutes.every((r) => r.sourceFormat === r.targetFormat)).toBe(true);
  });

  it('should load transcoder modules and populate transcodeEdges in capabilities manifest', async () => {
    const mockModule = createMockTranscoderModule([
      { from: 'glb', to: 'usdz', fidelity: 'mesh' },
      { from: 'glb', to: '3mf', fidelity: 'mesh' },
    ]);

    const worker = createConfiguredWorker({
      transcoders: [createMockTranscoderPlugin('test-transcoder', mockModule)],
    });

    await worker.initialize({
      callbacks: { onLog: vi.fn() },
      transferables: {},
      options: {},
    });

    const transcodedRoutes = worker.capabilitiesManifest.routes.filter((r) => r.transcoderId === 'test-transcoder');
    expect(transcodedRoutes).toHaveLength(2);
    const usdzRoute = transcodedRoutes.find((r) => r.targetFormat === 'usdz');
    const threeMfRoute = transcodedRoutes.find((r) => r.targetFormat === '3mf');
    expect(usdzRoute).toEqual(
      expect.objectContaining({
        transcoderId: 'test-transcoder',
        sourceFormat: 'glb',
        targetFormat: 'usdz',
        fidelity: 'mesh',
      }),
    );
    expect(usdzRoute!.schema).toHaveProperty('type', 'object');
    expect(threeMfRoute).toEqual(
      expect.objectContaining({
        transcoderId: 'test-transcoder',
        sourceFormat: 'glb',
        targetFormat: '3mf',
        fidelity: 'mesh',
      }),
    );
    expect(threeMfRoute!.schema).toHaveProperty('type', 'object');
  });

  it('should route export through transcoder when format matches an edge', async () => {
    const transcoderResult: ExportGeometryResult = {
      success: true,
      data: [{ bytes: new Uint8Array([10, 20, 30]), name: 'output.usdz', mimeType: 'model/vnd.usdz+zip' }],
      issues: [],
    };

    const mockModule = createMockTranscoderModule([{ from: 'glb', to: 'usdz', fidelity: 'mesh' }]);
    mockModule.transcode.mockResolvedValue(transcoderResult);

    const kernelExportResult: ExportGeometryResult = {
      success: true,
      data: [{ bytes: new Uint8Array([1, 2, 3]), name: 'export.glb', mimeType: 'model/gltf-binary' }],
      issues: [],
    };

    const worker = createConfiguredWorker({
      exportResult: kernelExportResult,
      nativeHandle: { kind: 'mock-native-handle' },
      transcoders: [createMockTranscoderPlugin('route-transcoder', mockModule)],
    });

    await worker.initialize({
      callbacks: { onLog: vi.fn() },
      transferables: {},
      options: {},
    });

    const result = await worker.runExportGeometry('usdz');

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data[0]!.mimeType).toBe('model/vnd.usdz+zip');
    }

    expect(mockModule.transcode).toHaveBeenCalledWith(
      expect.objectContaining({ from: 'glb', to: 'usdz' }),
      expect.any(Object),
      expect.any(Object),
    );
  });

  it('should fall through to direct kernel export when no transcoder route matches', async () => {
    const mockModule = createMockTranscoderModule([{ from: 'glb', to: 'usdz', fidelity: 'mesh' }]);

    const kernelExportResult: ExportGeometryResult = {
      success: true,
      data: [{ bytes: new Uint8Array([1, 2, 3]), name: 'export.stl', mimeType: 'model/stl' }],
      issues: [],
    };

    const worker = createConfiguredWorker({
      exportResult: kernelExportResult,
      nativeHandle: { kind: 'mock-native-handle' },
      exportZodSchemas: {
        glb: z.object({}),
        gltf: z.object({}),
        stl: z.object({}),
      },
      transcoders: [createMockTranscoderPlugin('fallthrough-transcoder', mockModule)],
    });

    await worker.initialize({
      callbacks: { onLog: vi.fn() },
      transferables: {},
      options: {},
    });

    const result = await worker.runExportGeometry('stl');

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data[0]!.mimeType).toBe('model/stl');
    }

    expect(mockModule.transcode).not.toHaveBeenCalled();
  });

  it('should clean up transcoders during cleanup', async () => {
    const mockModule = createMockTranscoderModule([{ from: 'glb', to: 'usdz', fidelity: 'mesh' }]);

    const worker = createConfiguredWorker({
      transcoders: [createMockTranscoderPlugin('cleanup-transcoder', mockModule)],
    });

    await worker.initialize({
      callbacks: { onLog: vi.fn() },
      transferables: {},
      options: {},
    });

    await worker.cleanup();

    expect(mockModule.cleanup).toHaveBeenCalled();
  });

  it('should propagate kernel export failure without calling transcoder', async () => {
    const mockModule = createMockTranscoderModule([{ from: 'glb', to: 'usdz', fidelity: 'mesh' }]);

    const worker = createConfiguredWorker({
      exportResult: {
        success: false,
        issues: [{ message: 'No geometry available', code: 'RUNTIME', type: 'runtime', severity: 'error' }],
      },
      nativeHandle: { kind: 'mock-native-handle' },
      transcoders: [createMockTranscoderPlugin('error-transcoder', mockModule)],
    });

    await worker.initialize({
      callbacks: { onLog: vi.fn() },
      transferables: {},
      options: {},
    });

    const result = await worker.runExportGeometry('usdz');

    expect(result.success).toBe(false);
    expect(mockModule.transcode).not.toHaveBeenCalled();
  });

  it('should validate transcoder edge options before transcoding', async () => {
    const optionsSchema = z.object({ quality: z.number().min(0).max(1) });
    const mockModule = createMockTranscoderModule([{ from: 'glb', to: 'usdz', fidelity: 'mesh', optionsSchema }]);

    const worker = createConfiguredWorker({
      nativeHandle: { kind: 'mock-native-handle' },
      transcoders: [createMockTranscoderPlugin('validated-transcoder', mockModule)],
    });

    await worker.initialize({
      callbacks: { onLog: vi.fn() },
      transferables: {},
      options: {},
    });

    const result = await worker.runExportGeometry('usdz', { quality: 0.5 });
    expect(result.success).toBe(true);
  });

  it('should hard-fail when transcoder edge options are invalid', async () => {
    const optionsSchema = z.object({ quality: z.number().min(0).max(1) });
    const mockModule = createMockTranscoderModule([{ from: 'glb', to: 'usdz', fidelity: 'mesh', optionsSchema }]);

    const worker = createConfiguredWorker({
      transcoders: [createMockTranscoderPlugin('invalid-opts-transcoder', mockModule)],
    });

    await worker.initialize({
      callbacks: { onLog: vi.fn() },
      transferables: {},
      options: {},
    });

    const result = await worker.runExportGeometry('usdz', { quality: 5 });
    expect(result.success).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'error',
          message: expect.stringContaining('Transcoder edge option validation failed') as string,
        }),
      ]),
    );
    expect(mockModule.transcode).not.toHaveBeenCalled();
  });

  it('should populate manifest schema and defaults from kernel exportSchemas', async () => {
    const worker = createConfiguredWorker();

    await worker.initialize({
      callbacks: { onLog: vi.fn() },
      transferables: {},
      options: {},
    });

    const manifest = worker.capabilitiesManifest;
    const glbExport = manifest.routes.find((r) => r.targetFormat === 'glb' && !r.transcoderId);
    expect(glbExport).toBeDefined();
    expect(glbExport!.kernelId).toBe('mock-kernel');
    expect(glbExport!.fidelity).toBe('mesh');
  });

  it('should derive JSON Schema from default Zod schemas when no custom exportSchemas declared', async () => {
    const worker = createConfiguredWorker();

    await worker.initialize({
      callbacks: { onLog: vi.fn() },
      transferables: {},
      options: {},
    });

    const manifest = worker.capabilitiesManifest;
    const glbExport = manifest.routes.find((r) => r.targetFormat === 'glb' && !r.transcoderId);
    expect(glbExport).toBeDefined();
    expect(glbExport!.schema).toHaveProperty('type', 'object');
    expect(glbExport!.defaults).toEqual({});
  });

  it('should invoke transcoder.transcode exactly once for a matching route without any runtime guard', async () => {
    const mockModule = createMockTranscoderModule([{ from: 'glb', to: 'usdz', fidelity: 'mesh' }]);

    const worker = createConfiguredWorker({
      exportZodSchemas: {
        glb: z.object({}),
      },
      nativeHandle: { kind: 'mock-native-handle' },
      transcoders: [createMockTranscoderPlugin('single-call-transcoder', mockModule)],
    });

    await worker.initialize({
      callbacks: { onLog: vi.fn() },
      transferables: {},
      options: {},
    });

    const result = await worker.runExportGeometry('usdz');

    expect(result.success).toBe(true);
    expect(mockModule.transcode).toHaveBeenCalledTimes(1);
    expect(mockModule.transcode).toHaveBeenCalledWith(
      expect.objectContaining({ from: 'glb', to: 'usdz' }),
      expect.anything(),
      expect.anything(),
    );
  });

  it('should return actionable error with native formats when no route matches', async () => {
    const worker = createConfiguredWorker();

    await worker.initialize({
      callbacks: { onLog: vi.fn() },
      transferables: {},
      options: {},
    });

    const result = await worker.runExportGeometry('bvh');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.issues[0]!.message).toContain('No export route found');
      expect(result.issues[0]!.message).toContain('Register a transcoder');
    }
  });

  it('should prefer brep routes over mesh routes via manifest order', async () => {
    const brepModule = createMockTranscoderModule([{ from: 'step', to: 'iges', fidelity: 'brep' }]);
    const meshModule = createMockTranscoderModule([{ from: 'glb', to: 'iges', fidelity: 'mesh' }]);

    const worker = createConfiguredWorker({
      exportZodSchemas: {
        glb: z.object({}),
        gltf: z.object({}),
        step: z.object({}),
      },
      transcoders: [
        createMockTranscoderPlugin('brep-transcoder', brepModule),
        createMockTranscoderPlugin('mesh-transcoder', meshModule),
      ],
    });

    await worker.initialize({
      callbacks: { onLog: vi.fn() },
      transferables: {},
      options: {},
    });

    const manifest = worker.capabilitiesManifest;
    const igesRoutes = manifest.routes.filter((r) => r.targetFormat === 'iges');
    expect(igesRoutes.length).toBe(2);
  });

  it('should include schema and defaults on direct export routes when kernel declares exportSchemas', async () => {
    const glbSchema = tessellationSchema.extend(coordinateSystemSchema.shape);

    const worker = createConfiguredWorker({
      exportZodSchemas: {
        glb: glbSchema,
      },
    });

    await worker.initialize({
      callbacks: { onLog: vi.fn() },
      transferables: {},
      options: {},
    });

    const manifest = worker.capabilitiesManifest;
    const glbRoute = manifest.routes.find((r) => r.targetFormat === 'glb');
    expect(glbRoute).toBeDefined();
    expect(glbRoute!.schema).toHaveProperty('properties');

    const { properties } = glbRoute!.schema as { properties: Record<string, unknown> };
    expect(properties).toHaveProperty('tessellation');
    expect(properties).toHaveProperty('coordinateSystem');

    expect(glbRoute!.defaults).toEqual(
      expect.objectContaining({
        tessellation: { linearTolerance: 0.1, angularTolerance: 15 },
        coordinateSystem: 'z-up',
      }),
    );
  });

  it('should include ALL declared properties on every direct export route (replicad-like scenario)', async () => {
    const stlSchema = z
      .object({ binary: z.boolean().default(true) })
      .extend(tessellationSchema.shape)
      .extend(coordinateSystemSchema.shape);
    const stepSchema = z
      .object({ assemblyMode: z.enum(['single', 'assembly']).default('single') })
      .extend(coordinateSystemSchema.shape);
    const glbSchema = tessellationSchema.extend(coordinateSystemSchema.shape);

    const worker = createConfiguredWorker({
      exportZodSchemas: {
        stl: stlSchema,
        step: stepSchema,
        glb: glbSchema,
        gltf: glbSchema,
      },
    });

    await worker.initialize({
      callbacks: { onLog: vi.fn() },
      transferables: {},
      options: {},
    });

    const manifest = worker.capabilitiesManifest;

    const stlRoute = manifest.routes.find((r) => r.targetFormat === 'stl')!;
    expect(stlRoute).toBeDefined();
    const stlProps = Object.keys((stlRoute.schema as { properties: Record<string, unknown> }).properties);
    expect(stlProps).toEqual(expect.arrayContaining(['binary', 'tessellation', 'coordinateSystem']));
    expect(stlRoute.defaults).toEqual(
      // oxlint-disable-next-line @typescript-eslint/no-unsafe-assignment -- vitest asymmetric matchers are untyped
      expect.objectContaining({ binary: true, tessellation: expect.any(Object), coordinateSystem: 'z-up' }),
    );

    const stepRoute = manifest.routes.find((r) => r.targetFormat === 'step')!;
    expect(stepRoute).toBeDefined();
    const stepProps = Object.keys((stepRoute.schema as { properties: Record<string, unknown> }).properties);
    expect(stepProps).toEqual(expect.arrayContaining(['assemblyMode', 'coordinateSystem']));
    expect(stepProps).not.toContain('tessellation');

    const glbRoute = manifest.routes.find((r) => r.targetFormat === 'glb')!;
    expect(glbRoute).toBeDefined();
    const glbProps = Object.keys((glbRoute.schema as { properties: Record<string, unknown> }).properties);
    expect(glbProps).toEqual(expect.arrayContaining(['tessellation', 'coordinateSystem']));

    const gltfRoute = manifest.routes.find((r) => r.targetFormat === 'gltf')!;
    expect(gltfRoute).toBeDefined();
    const gltfProps = Object.keys((gltfRoute.schema as { properties: Record<string, unknown> }).properties);
    expect(gltfProps).toEqual(expect.arrayContaining(['tessellation', 'coordinateSystem']));
  });

  it('should include merged schema and defaults on transcoded export routes', async () => {
    const mockModule = createMockTranscoderModule([{ from: 'glb', to: 'usdz', fidelity: 'mesh' }]);
    const glbSchema = tessellationSchema.extend(coordinateSystemSchema.shape);

    const worker = createConfiguredWorker({
      exportZodSchemas: {
        glb: glbSchema,
      },
      transcoders: [createMockTranscoderPlugin('schema-merge-transcoder', mockModule)],
    });

    await worker.initialize({
      callbacks: { onLog: vi.fn() },
      transferables: {},
      options: {},
    });

    const manifest = worker.capabilitiesManifest;
    const usdzRoute = manifest.routes.find((r) => r.targetFormat === 'usdz');
    expect(usdzRoute).toBeDefined();
    expect(usdzRoute!.transcoderId).toBe('schema-merge-transcoder');
    expect(usdzRoute!.schema).toHaveProperty('properties');

    const { properties } = usdzRoute!.schema as { properties: Record<string, unknown> };
    expect(properties).toHaveProperty('tessellation');
    expect(properties).toHaveProperty('coordinateSystem');

    expect(usdzRoute!.defaults).toEqual(
      expect.objectContaining({
        tessellation: { linearTolerance: 0.1, angularTolerance: 15 },
        coordinateSystem: 'z-up',
      }),
    );
  });

  it('should not duplicate enum values in transcoded route schemas', async () => {
    const edgeSchema = coordinateSystemSchema;
    const mockModule = createMockTranscoderModule([
      { from: 'glb', to: 'usdz', fidelity: 'mesh', optionsSchema: edgeSchema },
    ]);
    const glbSchema = tessellationSchema.extend(coordinateSystemSchema.shape);

    const worker = createConfiguredWorker({
      exportZodSchemas: {
        glb: glbSchema,
      },
      transcoders: [createMockTranscoderPlugin('dedup-transcoder', mockModule)],
    });

    await worker.initialize({
      callbacks: { onLog: vi.fn() },
      transferables: {},
      options: {},
    });

    const manifest = worker.capabilitiesManifest;
    const usdzRoute = manifest.routes.find((r) => r.targetFormat === 'usdz');
    expect(usdzRoute).toBeDefined();

    const coordSchema = (usdzRoute!.schema as { properties: { coordinateSystem: { enum: string[] } } }).properties
      .coordinateSystem;
    expect(coordSchema.enum).toEqual(['y-up', 'z-up']);
    expect(coordSchema.enum).toHaveLength(2);
  });

  it('should merge kernel-specific options into transcoded route schema', async () => {
    const qualitySchema = z.object({
      quality: z.number().min(0).max(1).default(0.8).describe('Transcoding quality'),
    });

    const mockModule = {
      name: 'QualityTranscoder',
      version: '1.0.0',
      edges: [{ from: 'glb', to: 'usdz', fidelity: 'mesh', optionsSchema: qualitySchema }],
      initialize: vi.fn().mockResolvedValue({ initialized: true }),
      transcode: vi.fn().mockResolvedValue({
        success: true,
        data: [{ bytes: new Uint8Array([1, 2, 3]), name: 'output.usdz', mimeType: 'model/vnd.usdz+zip' }],
        issues: [],
      }),
      cleanup: vi.fn().mockResolvedValue(undefined),
    } satisfies TranscoderDefinition<{ initialized: boolean }>;

    const glbSchema = tessellationSchema.extend(coordinateSystemSchema.shape);

    const worker = createConfiguredWorker({
      exportZodSchemas: {
        glb: glbSchema,
      },
      transcoders: [createMockTranscoderPlugin('quality-transcoder', mockModule)],
    });

    await worker.initialize({
      callbacks: { onLog: vi.fn() },
      transferables: {},
      options: {},
    });

    const manifest = worker.capabilitiesManifest;
    const usdzRoute = manifest.routes.find((r) => r.targetFormat === 'usdz');
    expect(usdzRoute).toBeDefined();

    const { properties } = usdzRoute!.schema as { properties: Record<string, unknown> };
    expect(properties).toHaveProperty('tessellation');
    expect(properties).toHaveProperty('coordinateSystem');
    expect(properties).toHaveProperty('quality');

    expect(usdzRoute!.defaults).toEqual(
      expect.objectContaining({
        tessellation: { linearTolerance: 0.1, angularTolerance: 15 },
        coordinateSystem: 'z-up',
        quality: 0.8,
      }),
    );
  });

  it('should merge edge transcoder JSON Schema properties with kernel JSON Schema', async () => {
    const qualitySchema = z.object({
      quality: z.number().min(0).max(1).default(0.8).describe('Transcoding quality'),
    });

    const mockModule = createMockTranscoderModule([
      { from: 'glb', to: 'usdz', fidelity: 'mesh', optionsSchema: qualitySchema },
    ]);

    const glbSchema = tessellationSchema.extend(coordinateSystemSchema.shape);

    const worker = createConfiguredWorker({
      exportZodSchemas: {
        glb: glbSchema,
      },
      transcoders: [createMockTranscoderPlugin('edge-merge-transcoder', mockModule)],
    });

    await worker.initialize({
      callbacks: { onLog: vi.fn() },
      transferables: {},
      options: {},
    });

    const manifest = worker.capabilitiesManifest;
    const usdzRoute = manifest.routes.find((r) => r.targetFormat === 'usdz');
    expect(usdzRoute).toBeDefined();

    const { properties } = usdzRoute!.schema as { properties: Record<string, unknown> };
    expect(properties).toHaveProperty('tessellation');
    expect(properties).toHaveProperty('coordinateSystem');
    expect(properties).toHaveProperty('quality');

    expect(usdzRoute!.defaults).toEqual(
      expect.objectContaining({
        tessellation: { linearTolerance: 0.1, angularTolerance: 15 },
        coordinateSystem: 'z-up',
        quality: 0.8,
      }),
    );
  });

  it('should propagate replicad-like kernel GLB schema into transcoded USDZ route without Zod schemas', async () => {
    const stlSchema = z
      .object({ binary: z.boolean().default(true).describe('Binary STL format') })
      .extend(tessellationSchema.shape)
      .extend(coordinateSystemSchema.shape)
      .extend(unitSchema.shape);
    const stepSchema = z
      .object({ assemblyMode: z.enum(['single', 'assembly']).default('single').describe('Assembly mode') })
      .extend(coordinateSystemSchema.shape);
    const glbSchema = tessellationSchema.extend(coordinateSystemSchema.shape).extend(unitSchema.shape);
    const gltfSchema = tessellationSchema.extend(coordinateSystemSchema.shape).extend(unitSchema.shape);

    const mockModule = createMockTranscoderModule([
      { from: 'glb', to: 'usdz', fidelity: 'mesh' },
      { from: 'glb', to: '3mf', fidelity: 'mesh' },
      { from: 'glb', to: 'obj', fidelity: 'mesh' },
    ]);

    const worker = createConfiguredWorker({
      exportZodSchemas: {
        stl: stlSchema,
        step: stepSchema,
        glb: glbSchema,
        gltf: gltfSchema,
      },
      transcoders: [createMockTranscoderPlugin('replicad-converter', mockModule)],
    });

    await worker.initialize({
      callbacks: { onLog: vi.fn() },
      transferables: {},
      options: {},
    });

    const manifest = worker.capabilitiesManifest;

    // Direct routes for all 4 native formats
    const directRoutes = manifest.routes.filter((r) => !r.transcoderId);
    expect(directRoutes).toHaveLength(4);
    expect(directRoutes.map((r) => r.targetFormat).sort()).toEqual(['glb', 'gltf', 'step', 'stl']);

    // Transcoded routes: 3 edges × 4 source-matching-GLB = 3 (only GLB matches 'from: glb')
    const transcodedRoutes = manifest.routes.filter((r) => r.transcoderId);
    expect(transcodedRoutes).toHaveLength(3);

    // USDZ route should carry the kernel's GLB tessellation + coordinateSystem + unit
    const usdzRoute = manifest.routes.find((r) => r.targetFormat === 'usdz');
    expect(usdzRoute).toBeDefined();
    expect(usdzRoute!.sourceFormat).toBe('glb');
    expect(usdzRoute!.transcoderId).toBe('replicad-converter');
    expect(usdzRoute!.schema).toHaveProperty('properties');

    const usdzProps = (usdzRoute!.schema as { properties: Record<string, unknown> }).properties;
    expect(usdzProps).toHaveProperty('tessellation');
    expect(usdzProps).toHaveProperty('coordinateSystem');
    expect(usdzProps).toHaveProperty('unit');

    expect(usdzRoute!.defaults).toEqual({
      tessellation: { linearTolerance: 0.1, angularTolerance: 15 },
      coordinateSystem: 'z-up',
      unit: { length: 'meter' },
    });

    // 3MF route should also carry the kernel's GLB options
    const threeMfRoute = manifest.routes.find((r) => r.targetFormat === '3mf');
    expect(threeMfRoute).toBeDefined();
    const threeMfProps = (threeMfRoute!.schema as { properties: Record<string, unknown> }).properties;
    expect(threeMfProps).toHaveProperty('tessellation');
    expect(threeMfProps).toHaveProperty('coordinateSystem');
    expect(threeMfProps).toHaveProperty('unit');

    // OBJ route should also carry the kernel's GLB options
    const objectRoute = manifest.routes.find((r) => r.targetFormat === 'obj');
    expect(objectRoute).toBeDefined();
    const objectProperties = (objectRoute!.schema as { properties: Record<string, unknown> }).properties;
    expect(objectProperties).toHaveProperty('tessellation');
    expect(objectProperties).toHaveProperty('coordinateSystem');
    expect(objectProperties).toHaveProperty('unit');

    // Direct STL route should have its own schema (binary + tessellation + coordinateSystem)
    const stlRoute = manifest.routes.find((r) => r.targetFormat === 'stl' && !r.transcoderId);
    expect(stlRoute).toBeDefined();
    const stlProps = (stlRoute!.schema as { properties: Record<string, unknown> }).properties;
    expect(stlProps).toHaveProperty('binary');
    expect(stlProps).toHaveProperty('tessellation');
    expect(stlProps).toHaveProperty('coordinateSystem');
    expect(stlProps).toHaveProperty('unit');

    // Direct STEP route should have assemblyMode + coordinateSystem but NOT tessellation
    const stepRoute = manifest.routes.find((r) => r.targetFormat === 'step' && !r.transcoderId);
    expect(stepRoute).toBeDefined();
    const stepProps = (stepRoute!.schema as { properties: Record<string, unknown> }).properties;
    expect(stepProps).toHaveProperty('assemblyMode');
    expect(stepProps).toHaveProperty('coordinateSystem');
    expect(stepProps).not.toHaveProperty('tessellation');
  });

  it('should apply source format Zod defaults when exporting via transcoded route with empty options', async () => {
    const glbSchema = z.object({
      tessellation: z
        .object({
          linearTolerance: z.number().positive().default(0.01),
          angularTolerance: z.number().positive().default(30),
        })
        .default({ linearTolerance: 0.01, angularTolerance: 30 }),
    });

    const mockModule = createMockTranscoderModule([{ from: 'glb', to: 'usdz', fidelity: 'mesh' }]);

    const worker = createConfiguredWorker({
      exportZodSchemas: { glb: glbSchema },
      nativeHandle: { kind: 'mock-native-handle' },
      transcoders: [createMockTranscoderPlugin('defaults-transcoder', mockModule)],
    });

    await worker.initialize({
      callbacks: { onLog: vi.fn() },
      transferables: {},
      options: {},
    });

    const result = await worker.runExportGeometry('usdz', {});

    expect(result.success).toBe(true);

    const kernelInput = worker.exportGeometrySpy.mock.calls[0]![0];
    expect(kernelInput.format).toBe('glb');
    expect(kernelInput.options).toEqual(
      expect.objectContaining({
        tessellation: { linearTolerance: 0.01, angularTolerance: 30 },
      }),
    );
  });
});

// =============================================================================
// rebuildAndPushCapabilities
// =============================================================================

describe('rebuildAndPushCapabilities', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should update capabilitiesManifest and invoke onCapabilitiesUpdated callback', () => {
    const worker = createConfiguredWorker();
    const callback = vi.fn();
    worker.onCapabilitiesUpdated = callback;

    // @ts-expect-error - accessing protected method for test verification
    worker.rebuildAndPushCapabilities();

    expect(callback).toHaveBeenCalledOnce();
    const manifest = callback.mock.calls[0]![0]! as CapabilitiesManifest;
    expect(manifest).toBe(worker.capabilitiesManifest);
    expect(manifest.routes.filter((r) => !r.transcoderId).length).toBeGreaterThan(0);
  });

  it('should not throw when onCapabilitiesUpdated is not set', () => {
    const worker = createConfiguredWorker();

    expect(() => {
      // @ts-expect-error - accessing protected method for test verification
      worker.rebuildAndPushCapabilities();
    }).not.toThrow();
  });

  it('should reflect updated kernel export formats in the rebuilt manifest', () => {
    const worker = createConfiguredWorker();
    const callback = vi.fn();
    worker.onCapabilitiesUpdated = callback;

    // @ts-expect-error - accessing protected method for test verification
    worker.rebuildAndPushCapabilities();
    const initialDirectRoutes = worker.capabilitiesManifest.routes.filter((r) => !r.transcoderId).length;

    // @ts-expect-error - accessing protected field for test verification
    worker.kernelExportZodSchemasMap.set('new-kernel', { step: z.object({}), iges: z.object({}) });

    // @ts-expect-error - accessing protected method for test verification
    worker.rebuildAndPushCapabilities();

    const manifest = worker.capabilitiesManifest;
    const directRoutes = manifest.routes.filter((r) => !r.transcoderId);
    expect(directRoutes.length).toBe(initialDirectRoutes + 2);
    expect(directRoutes.some((route) => route.kernelId === 'new-kernel' && route.targetFormat === 'step')).toBe(true);
    expect(directRoutes.some((route) => route.kernelId === 'new-kernel' && route.targetFormat === 'iges')).toBe(true);
  });
});

// =============================================================================
// ensureNativeHandle
// =============================================================================

describe('ensureNativeHandle', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should be a no-op when nativeHandle is already set', async () => {
    const worker = createConfiguredWorker({
      nativeHandle: { meshData: new Float32Array(3) },
    });

    worker.handleOpenFile(createGeometryFile('test.ts'), {});
    await flushMicrotasks();

    const callsAfterRender = worker.createGeometryCalls;
    const result = await worker.runExportGeometry('gltf');

    expect(result.success).toBe(true);
    // No additional createGeometry calls — nativeHandle was already set
    expect(worker.createGeometryCalls).toBe(callsAfterRender);
  });

  it('should reheat instead of restoring a snapshot without kernel hooks', async () => {
    const serializedData = { brep: 'BREP_DATA', meta: { name: 'part' } };
    const worker = createConfiguredWorker({
      computeResult: {
        success: true,
        data: [{ format: 'gltf', content: new Uint8Array([1, 2, 3]) }],
        issues: [],
        serializedNativeHandle: serializedData,
      },
    });

    worker.handleOpenFile(createGeometryFile('test.ts'), {});
    await flushMicrotasks();

    const callsAfterRender = worker.createGeometryCalls;
    const internals = worker as unknown as { nativeHandle: unknown };
    internals.nativeHandle = undefined;

    const result = await worker.runExportGeometry('gltf');

    expect(result.success).toBe(true);
    expect(worker.createGeometryCalls).toBeGreaterThan(callsAfterRender);
  });

  it('should fall back to re-running createGeometry when no handle data exists', async () => {
    const worker = createConfiguredWorker();

    worker.handleOpenFile(createGeometryFile('test.ts'), {});
    await flushMicrotasks();

    const initialCalls = worker.createGeometryCalls;
    const result = await worker.runExportGeometry('gltf');

    expect(result.success).toBe(true);
    expect(worker.createGeometryCalls).toBeGreaterThan(initialCalls);
  });

  it('should use lastRenderParameters for reheat when available', async () => {
    const worker = createConfiguredWorker();

    const customParams = { radius: 42, height: 10 };
    worker.handleOpenFile(createGeometryFile('test.ts'), customParams);
    await flushMicrotasks();

    const result = await worker.runExportGeometry('gltf');
    expect(result.success).toBe(true);
  });
});

// =============================================================================
// Render option validation
// =============================================================================

describe('render option validation', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return error result when render options fail validation', async () => {
    const renderSchema = z.object({ quality: z.number().min(0).max(1) });
    const worker = createConfiguredWorker({ renderZodSchema: renderSchema });

    worker.handleOpenFile(createGeometryFile('test.ts'), {}, { quality: 'invalid' });
    await flushMicrotasks();

    const result = await worker.runCreateGeometry('test.ts');
    expect(result.success).toBe(false);
    expect(result.issues).toEqual(expect.arrayContaining([expect.objectContaining({ severity: 'error' })]));
  });

  it('should return validated options when render options pass validation', async () => {
    const renderSchema = z.object({ quality: z.number().default(0.8) });
    const worker = createConfiguredWorker({ renderZodSchema: renderSchema });

    worker.handleOpenFile(createGeometryFile('test.ts'), {}, { quality: 0.5 });
    await flushMicrotasks();

    const result = await worker.runCreateGeometry('test.ts');
    expect(result.success).toBe(true);
  });

  it('should pass through options when no render schema exists', async () => {
    const worker = createConfiguredWorker();

    worker.handleOpenFile(createGeometryFile('test.ts'), {}, { arbitrary: 'value' });
    await flushMicrotasks();

    const result = await worker.runCreateGeometry('test.ts');
    expect(result.success).toBe(true);
  });
});

// =============================================================================
// Export schema hard-fail
// =============================================================================

describe('export schema hard-fail', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should fail export when kernel has schemas but format is undeclared and options are provided', async () => {
    const worker = createConfiguredWorker({
      exportZodSchemas: { glb: z.object({ binary: z.boolean().default(true) }) },
    });

    worker.handleOpenFile(createGeometryFile('test.ts'), {});
    await flushMicrotasks();

    const result = await worker.runExportGeometry('stl', { someOption: true });
    expect(result.success).toBe(false);
    expect(result.issues[0]!.message).toContain('No export schema for format');
    expect(result.issues[0]!.message).toContain('glb');
  });

  it('should allow export without options for undeclared format (transcoder route)', async () => {
    const worker = createConfiguredWorker({
      exportZodSchemas: { glb: z.object({}) },
    });

    worker.handleOpenFile(createGeometryFile('test.ts'), {});
    await flushMicrotasks();

    const result = await worker.runExportGeometry('stl');
    expect(result.success).toBe(false);
    expect(result.issues[0]!.message).toContain('No export route found');
  });
});

// =============================================================================
// Capabilities Manifest target shape
// =============================================================================

describe('CapabilitiesManifest target shape', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should expose manifest with only routes and renderSchemas required fields', async () => {
    const worker = createConfiguredWorker();

    await worker.initialize({
      callbacks: { onLog: vi.fn() },
      transferables: {},
      options: {},
    });

    const manifest = worker.capabilitiesManifest;
    expect(Object.keys(manifest).sort()).toEqual(['renderSchemas', 'routes']);
    expect('kernelExports' in manifest).toBe(false);
    expect('transcodeEdges' in manifest).toBe(false);
    expect('exportRoutes' in manifest).toBe(false);
    expect('renderOptions' in manifest).toBe(false);
  });

  it('should not include routeId on any route', async () => {
    const worker = createConfiguredWorker();

    await worker.initialize({
      callbacks: { onLog: vi.fn() },
      transferables: {},
      options: {},
    });

    const manifest = worker.capabilitiesManifest;
    expect(manifest.routes.length).toBeGreaterThan(0);
    for (const route of manifest.routes) {
      expect('routeId' in route).toBe(false);
    }
  });

  it('should derive route fidelity from @taucad/types lookup table', async () => {
    const worker = createConfiguredWorker({
      exportZodSchemas: {
        step: z.object({}),
        iges: z.object({}),
        brep: z.object({}),
        glb: z.object({}),
      },
    });

    await worker.initialize({
      callbacks: { onLog: vi.fn() },
      transferables: {},
      options: {},
    });

    const manifest = worker.capabilitiesManifest;
    const stepRoute = manifest.routes.find((route) => route.targetFormat === 'step');
    const igesRoute = manifest.routes.find((route) => route.targetFormat === 'iges');
    const brepRoute = manifest.routes.find((route) => route.targetFormat === 'brep');
    const glbRoute = manifest.routes.find((route) => route.targetFormat === 'glb');

    expect(stepRoute?.fidelity).toBe('brep');
    expect(igesRoute?.fidelity).toBe('brep');
    expect(brepRoute?.fidelity).toBe('brep');
    expect(glbRoute?.fidelity).toBe('mesh');
  });

  it('should expose renderSchemas indexed by kernelId when render schemas are registered', async () => {
    const worker = createConfiguredWorker({
      renderZodSchema: tessellationSchema,
    });

    await worker.initialize({
      callbacks: { onLog: vi.fn() },
      transferables: {},
      options: {},
    });

    const manifest = worker.capabilitiesManifest;
    /* oxlint-disable @typescript-eslint/no-unsafe-assignment -- expect.objectContaining/expect.any matchers return any */
    expect(manifest.renderSchemas['mock-kernel']).toEqual(
      expect.objectContaining({
        schema: expect.any(Object),
        defaults: expect.objectContaining({
          tessellation: expect.objectContaining({
            linearTolerance: 0.1,
            angularTolerance: 15,
          }),
        }),
      }),
    );
    /* oxlint-enable @typescript-eslint/no-unsafe-assignment */
  });
});
