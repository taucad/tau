/* eslint-disable @typescript-eslint/naming-convention -- file-system path keys are not camelCase identifiers. */
/**
 * Tests for KernelWorker lifecycle, watch subscription, and cache invalidation.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { z } from 'zod';
import { coordinateSystemSchema, unitSchema } from '#types/export-option-schemas.js';
import type { OnWorkerLog } from '@taucad/types';
import type { WatchEvent } from '@taucad/filesystem';
import { SharedPool } from '@taucad/memory';
import type {
  CapabilitiesManifest,
  CreateGeometryResult,
  ExportGeometryResult,
  HashedGeometryResult,
  KernelIssue,
} from '#types/runtime.types.js';
import type {
  KernelRuntime,
  CreateGeometryInput,
  GetDependenciesInput,
  GetParametersInput,
} from '#types/runtime-kernel.types.js';
import type { GetDependenciesResult } from '#types/runtime-dependency.types.js';
import type { TranscoderDefinition, TranscoderEdge } from '#types/runtime-transcoder.types.js';
import type { MaterializedRender, OperationOwner } from '#framework/render-artifact.js';
import type { MockKernelWorkerOptions } from '#testing/kernel-testing.utils.js';
import { MockKernelWorker, createMockFileSystem, createGeometryFile } from '#testing/kernel-testing.utils.js';
import { defineMiddleware } from '#middleware/runtime-middleware.js';
import { attachRuntimePluginDefinition } from '#plugins/plugin-runtime-definition.js';
import { checkAbort } from '#framework/cooperative-abort.js';
import type { RuntimeStateChangedArgs } from '#types/runtime-protocol.types.js';
import { signalSlot, abortReason } from '#types/runtime-protocol.types.js';
import { signalBufferByteLength } from '#framework/runtime-framework.constants.js';
import { imageEdgeSchemas } from '#transcoders/image/image-export-options.js';

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

const previewId = (suffix: number): string => `550e8400-e29b-41d4-a716-${suffix.toString().padStart(12, '0')}`;

const observePreview = (
  worker: MockKernelWorker,
): {
  readonly states: RuntimeStateChangedArgs[];
  readonly geometries: Array<{ readonly result: HashedGeometryResult; readonly renderId: string }>;
  readonly errors: Array<{ readonly issues: readonly KernelIssue[]; readonly renderId?: string }>;
  readonly waitForState: (predicate: (event: RuntimeStateChangedArgs) => boolean) => Promise<RuntimeStateChangedArgs>;
} => {
  const states: RuntimeStateChangedArgs[] = [];
  const geometries: Array<{ readonly result: HashedGeometryResult; readonly renderId: string }> = [];
  const errors: Array<{ readonly issues: readonly KernelIssue[]; readonly renderId?: string }> = [];
  const waiters: Array<{
    readonly predicate: (event: RuntimeStateChangedArgs) => boolean;
    readonly resolve: (event: RuntimeStateChangedArgs) => void;
  }> = [];

  worker.onStateChanged = (event) => {
    states.push(event);
    for (const waiter of waiters) {
      if (waiter.predicate(event)) {
        waiter.resolve(event);
      }
    }
  };
  worker.onGeometryComputed = (event) => geometries.push(event);
  worker.onError = (event) => errors.push(event);

  return {
    states,
    geometries,
    errors,
    waitForState: async (predicate) => {
      const existing = states.find((state) => predicate(state));
      if (existing) {
        return existing;
      }
      const slot = Promise.withResolvers<RuntimeStateChangedArgs>();
      waiters.push({ predicate, resolve: slot.resolve });
      return slot.promise;
    },
  };
};

function createConfiguredWorker(overrides?: Partial<MockKernelWorkerOptions>) {
  const filesystem = createMockFileSystem();
  filesystem.mocks.readFiles.mockResolvedValue({
    '/main.ts': new Uint8Array([1, 2, 3]),
  });

  return new MockKernelWorker({
    middleware: [],
    onLog: noopLog,
    filesystem,
    ...overrides,
  });
}

async function openAndWaitForRender(
  worker: MockKernelWorker,
  file = createGeometryFile('test.ts'),
  parameters: Record<string, unknown> = {},
): Promise<void> {
  const settled = new Promise<void>((resolve) => {
    worker.onStateChanged = ({ state }) => {
      if (state === 'idle' || state === 'error') {
        resolve();
      }
    };
  });
  worker.handleOpenFile({ renderId: previewId(100), file, parameters });
  await settled;
}

class FailingKernelWorker extends MockKernelWorker {
  protected override async onCreateGeometry(
    _input: CreateGeometryInput,
    _runtime: KernelRuntime,
  ): Promise<CreateGeometryResult> {
    throw new Error('Build failed: syntax error');
  }
}

class DependencyKernelWorker extends MockKernelWorker {
  protected override async onGetDependencies(
    { entryPath }: GetDependenciesInput,
    _runtime: KernelRuntime,
  ): Promise<GetDependenciesResult> {
    return { resolved: [entryPath, '/dep.ts'], unresolved: [] };
  }
}

/** Records the handles the framework released, standing in for a kernel that frees WASM memory. */
class DisposingKernelWorker extends MockKernelWorker {
  public readonly disposedHandles: unknown[] = [];

  /** Handle returned by every build. Left undefined to hand out a fresh handle per build. */
  public stableHandle: unknown;

  private builds = 0;

  protected override async onCreateGeometryForOwner(
    owner: OperationOwner,
    _input: CreateGeometryInput,
    _runtime: KernelRuntime,
  ): Promise<CreateGeometryResult> {
    this.builds++;
    this.captureNativeHandle(this.stableHandle ?? { build: this.builds }, owner);
    return {
      success: true,
      data: { format: 'gltf', content: new Uint8Array([1, 2, 3]) },
      issues: [],
    };
  }

  protected override disposeNativeHandleForOwner(_owner: OperationOwner, nativeHandle: unknown): void {
    this.disposedHandles.push(nativeHandle);
  }
}

// =============================================================================
// Tests
// =============================================================================

describe('KernelWorker lifecycle', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  // ---------------------------------------------------------------------------
  // Watch subscription on error path
  // ---------------------------------------------------------------------------

  describe('watch subscription on error', () => {
    it('should retain the entry subscription when createGeometry fails', async () => {
      const filesystem = createMockFileSystem();
      filesystem.mocks.readFiles.mockResolvedValue({
        '/main.ts': new Uint8Array([1, 2, 3]),
      });

      const worker = new FailingKernelWorker({
        middleware: [],
        onLog: noopLog,
        filesystem,
      });

      const renderComplete = new Promise<void>((resolve) => {
        worker.onStateChanged = ({ state }) => {
          if (state === 'error' || state === 'idle') {
            resolve();
          }
        };
      });

      worker.handleOpenFile({ renderId: previewId(201), file: createGeometryFile('main.ts'), parameters: {} });
      await renderComplete;

      expect(worker.getWatchedPaths()).toContain('/main.ts');
    });

    it('should include entry path in watch set when build produces empty dependencies', async () => {
      const worker = createConfiguredWorker();
      const settled = new Promise<void>((resolve) => {
        worker.onStateChanged = ({ state }) => {
          if (state === 'idle' || state === 'error') {
            resolve();
          }
        };
      });

      worker.handleOpenFile({ renderId: previewId(202), file: createGeometryFile('main.ts'), parameters: {} });
      await settled;

      expect(worker.getWatchedPaths()).toContain('/main.ts');
    });

    it('does not publish when an added dependency changes during acknowledged watch replacement', async () => {
      const filesystem = createMockFileSystem();
      let dependencyBytes = new Uint8Array([2]);
      filesystem.mocks.readFiles.mockImplementation(async () => ({
        '/main.ts': new Uint8Array([1]),
        '/dep.ts': dependencyBytes,
      }));
      filesystem.mocks.readFile.mockImplementation(async (path) =>
        path === '/dep.ts' ? dependencyBytes : new Uint8Array([1]),
      );

      let registrationCount = 0;
      let replacementHandler: ((event: { type: 'change'; path: string }) => void) | undefined;
      let acknowledgeReplacement!: () => void;
      let replacementInstalled!: () => void;
      const replacementStarted = new Promise<void>((resolve) => {
        replacementInstalled = resolve;
      });
      const replacementUnsubscribed = Promise.withResolvers<void>();
      const unsubscriptions = [
        vi.fn(),
        vi.fn(() => {
          replacementUnsubscribed.resolve();
        }),
      ];
      Object.assign(filesystem, {
        watch: vi.fn(),
        watchReady(_request: unknown, handler: (event: { type: 'change'; path: string }) => void) {
          const index = registrationCount++;
          if (index === 0) {
            return { unsubscribe: unsubscriptions[0], ready: Promise.resolve() };
          }
          if (index > 1) {
            // The rejected commit unwinds through a plain resubscribe; only the replacement
            // under test is held for acknowledgement.
            return { unsubscribe: vi.fn(), ready: Promise.resolve() };
          }
          replacementHandler = handler;
          replacementInstalled();
          return {
            unsubscribe: unsubscriptions[1],
            ready: new Promise<void>((resolve) => {
              acknowledgeReplacement = resolve;
            }),
          };
        },
      });

      const worker = new DependencyKernelWorker({ middleware: [], onLog: noopLog, filesystem });
      // @ts-expect-error - install the watch-capable proxy seam exercised by production initialization
      worker.fileSystem = filesystem;
      const onGeometry = vi.fn();
      worker.onGeometryComputed = onGeometry;
      worker.onStateChanged = vi.fn();

      worker.handleOpenFile({ renderId: previewId(203), file: createGeometryFile('main.ts'), parameters: {} });
      await replacementStarted;
      dependencyBytes = new Uint8Array([3]);
      replacementHandler!({ type: 'change', path: '/dep.ts' });
      acknowledgeReplacement();
      await replacementUnsubscribed.promise;

      expect(unsubscriptions[1]).toHaveBeenCalledOnce();
      expect(onGeometry).not.toHaveBeenCalled();
      expect(worker.getWatchedPaths()).toEqual(new Set(['/main.ts']));
      expect(unsubscriptions[0]).not.toHaveBeenCalled();
      await worker.cleanup();
    });
  });

  // ---------------------------------------------------------------------------
  // Render generation and execution ownership correctness
  // ---------------------------------------------------------------------------

  describe('render execution ownership', () => {
    it('serializes a superseding render behind the active render', async () => {
      let resolveGateA!: () => void;
      const gateA = new Promise<void>((resolve) => {
        resolveGateA = resolve;
      });
      let resolveGateB!: () => void;
      const gateB = new Promise<void>((resolve) => {
        resolveGateB = resolve;
      });
      let enteredA!: () => void;
      const renderAEntered = new Promise<void>((resolve) => {
        enteredA = resolve;
      });
      let enteredB!: () => void;
      const renderBEntered = new Promise<void>((resolve) => {
        enteredB = resolve;
      });
      let createGeometryCallCount = 0;

      class GatedKernelWorker extends MockKernelWorker {
        protected override async onCreateGeometry(): Promise<CreateGeometryResult> {
          createGeometryCallCount++;
          const isFirst = createGeometryCallCount === 1;
          (isFirst ? enteredA : enteredB)();
          await (isFirst ? gateA : gateB);
          return { success: true, data: { format: 'gltf', content: new Uint8Array([1]) }, issues: [] };
        }
      }

      const filesystem = createMockFileSystem();
      filesystem.mocks.readFiles.mockResolvedValue({
        '/main.ts': new Uint8Array([1, 2, 3]),
      });

      const worker = new GatedKernelWorker({
        middleware: [],
        onLog: noopLog,
        filesystem,
      });

      worker.onStateChanged = vi.fn();
      worker.onGeometryComputed = vi.fn();
      worker.onError = vi.fn();

      // Start render A — blocks in createGeometry.
      worker.handleOpenFile({
        renderId: previewId(301),
        file: createGeometryFile('main.ts'),
        parameters: { revision: 1 },
      });
      await renderAEntered;

      expect(worker.isRendering).toBe(true);

      // Render B is admitted immediately but cannot overlap worker-owned state.
      worker.handleOpenFile({
        renderId: previewId(302),
        file: createGeometryFile('main.ts'),
        parameters: { revision: 2 },
      });
      await flushMicrotasks();
      expect(createGeometryCallCount).toBe(1);
      expect(worker.isRendering).toBe(true);

      // B starts only after A leaves the serialized lane.
      resolveGateA();
      await renderBEntered;
      expect(createGeometryCallCount).toBe(2);
      expect(worker.isRendering).toBe(true);

      resolveGateB();
      await flushMicrotasks();
    });
  });

  // ---------------------------------------------------------------------------
  // bundleResultCache invalidation
  // ---------------------------------------------------------------------------

  describe('native handle ownership', () => {
    const createDisposingWorker = (): DisposingKernelWorker =>
      new DisposingKernelWorker({ middleware: [], onLog: noopLog, filesystem: createMockFileSystem() });

    it('releases the replaced handle when a rebuild publishes a new one', async () => {
      const worker = createDisposingWorker();

      await worker.runCreateGeometry('test.kcl', { size: 1 });
      expect(worker.disposedHandles).toEqual([]);

      await worker.runCreateGeometry('test.kcl', { size: 2 });

      expect(worker.disposedHandles).toEqual([{ build: 1 }]);
    });

    it('retains a handle reused across builds and releases it once on cleanup', async () => {
      const worker = createDisposingWorker();
      const sharedHandle = { shared: true };
      worker.stableHandle = sharedHandle;

      await worker.runCreateGeometry('test.kcl', { size: 1 });
      await worker.runCreateGeometry('test.kcl', { size: 2 });
      expect(worker.disposedHandles).toEqual([]);

      await worker.cleanup();

      expect(worker.disposedHandles).toEqual([sharedHandle]);
    });

    it('disposes a superseded materialization handle after unwind without publishing it', async () => {
      const entered = Promise.withResolvers<void>();
      const gate = Promise.withResolvers<void>();

      class SupersededHandleWorker extends DisposingKernelWorker {
        private calls = 0;

        protected override async onCreateGeometryForOwner(
          owner: OperationOwner,
          input: CreateGeometryInput,
          runtime: KernelRuntime,
        ): Promise<CreateGeometryResult> {
          this.calls++;
          if (this.calls !== 1) {
            return super.onCreateGeometryForOwner(owner, input, runtime);
          }

          const handle = { superseded: true };
          this.captureNativeHandle(handle, owner);
          entered.resolve();
          await gate.promise;
          runtime.signal.throwIfAborted();
          return {
            success: true,
            data: { format: 'gltf', content: new Uint8Array([1]) },
            issues: [],
          };
        }
      }

      const worker = new SupersededHandleWorker({ middleware: [], onLog: noopLog, filesystem: createMockFileSystem() });
      const observed = observePreview(worker);
      const firstId = previewId(401);
      const secondId = previewId(402);

      worker.handleOpenFile({ renderId: firstId, file: createGeometryFile('main.ts'), parameters: {} });
      await entered.promise;
      worker.handleOpenFile({ renderId: secondId, file: createGeometryFile('main.ts'), parameters: {} });
      gate.resolve();
      await observed.waitForState((event) => event.renderId === secondId && event.state === 'idle');

      expect(observed.geometries.map(({ renderId }) => renderId)).toEqual([secondId]);
      expect(worker.disposedHandles).toEqual([{ superseded: true }]);
    });
  });

  describe('bundleResultCache invalidation', () => {
    it('should invalidate bundleResultCache entry when changed path matches the entry key directly', async () => {
      const worker = createConfiguredWorker();

      // @ts-expect-error - accessing private for test verification
      worker.bundleResultCache.set('/main.ts', {
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

      await worker.notifyFileChanged(['/main.ts']);

      // @ts-expect-error - accessing private for test verification
      expect(worker.bundleResultCache.has('/main.ts')).toBe(false);
    });

    it('should invalidate bundleResultCache via watch handler when changed path matches entry key', async () => {
      const worker = createConfiguredWorker();

      // @ts-expect-error - accessing private method for test verification
      worker.setActiveFile(createGeometryFile('main.ts'));

      // @ts-expect-error - accessing private for test verification
      worker.bundleResultCache.set('/main.ts', {
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

      // @ts-expect-error - exercising the private observation handoff seam
      void worker.reconcileWatchSet(new Map([['/main.ts', 50]]));
      await vi.waitFor(() => {
        expect(capturedWatchCallback).toBeDefined();
      });

      capturedWatchCallback!({ type: 'change', path: '/main.ts' });

      await vi.waitFor(() => {
        // @ts-expect-error - accessing private for test verification
        expect(worker.bundleResultCache.has('/main.ts')).toBe(false);
      });
    });
  });

  describe('exact and loss invalidation routing', () => {
    it('should schedule only exact paths in the active preview watch set', async () => {
      const worker = createConfiguredWorker();
      try {
        await openAndWaitForRender(worker, createGeometryFile('main.ts'));
        const states: string[] = [];
        worker.onStateChanged = ({ state }) => states.push(state);

        await worker.notifyFileChanged(['/thumbnail.webp']);
        await worker.notifyFileChanged(['/main.geospec.ts']);
        expect(states).toEqual([]);

        await worker.notifyFileChanged(['/main.ts']);
        expect(states).toEqual(['buffering']);
      } finally {
        await worker.cleanup();
      }
    });

    it('should route staged peer writes exactly without scheduling the active preview', async () => {
      const worker = createConfiguredWorker();
      try {
        await openAndWaitForRender(worker, createGeometryFile('main.ts'));
        const states: string[] = [];
        worker.onStateChanged = ({ state }) => states.push(state);

        const result = await worker.exportModel({
          stage: { '/main.geospec.ts': new Uint8Array([1]) },
          file: createGeometryFile('main.ts'),
          parameters: {},
          format: 'glb',
        });

        expect(result.success).toBe(true);
        expect(states).toEqual([]);
      } finally {
        await worker.cleanup();
      }
    });

    it('should invalidate changed dependencies and schedule one recovery for reset', async () => {
      const filesystem = createMockFileSystem();
      filesystem.mocks.readFiles.mockResolvedValue({
        '/main.ts': new Uint8Array([1, 2, 3]),
      });
      let watchHandler: ((event: WatchEvent) => void) | undefined;
      Object.assign(filesystem, {
        watch: vi.fn((_request: unknown, handler: (event: WatchEvent) => void) => {
          watchHandler = handler;
          return () => {
            watchHandler = undefined;
          };
        }),
      });
      const worker = new MockKernelWorker({ middleware: [], onLog: noopLog, filesystem });
      // @ts-expect-error - install the watch-capable proxy seam exercised by production initialization
      worker.fileSystem = filesystem;

      try {
        await openAndWaitForRender(worker, createGeometryFile('main.ts'));
        await vi.waitFor(() => {
          expect(watchHandler).toBeDefined();
        });
        // @ts-expect-error - seed volatile state to verify conservative loss recovery
        worker.bundleResultCache.set('/cached.ts', {
          code: '',
          dependencies: ['/main.ts'],
          unresolvedPaths: [],
          issues: [],
          success: true,
        });
        const states: string[] = [];
        worker.onStateChanged = ({ state }) => states.push(state);

        watchHandler!({ type: 'reset' });
        await vi.waitFor(() => {
          expect(states).toEqual(['buffering']);
        });

        // @ts-expect-error - changed dependencies are invalidated without clearing unrelated caches
        expect(worker.bundleResultCache.size).toBe(0);
      } finally {
        await worker.cleanup();
      }
    });

    it('should ignore an exact event and reset when watched bytes are unchanged', async () => {
      const bytes = new Uint8Array([1, 2, 3]);
      const filesystem = createMockFileSystem({ readFileResult: bytes });
      filesystem.mocks.readFiles.mockResolvedValue({ '/main.ts': bytes });
      let watchHandler: ((event: WatchEvent) => void) | undefined;
      Object.assign(filesystem, {
        watch: vi.fn((_request: unknown, handler: (event: WatchEvent) => void) => {
          watchHandler = handler;
          return vi.fn();
        }),
      });
      const worker = new MockKernelWorker({ middleware: [], onLog: noopLog, filesystem });
      // @ts-expect-error - install the watch-capable proxy seam exercised by production initialization
      worker.fileSystem = filesystem;

      try {
        await openAndWaitForRender(worker, createGeometryFile('main.ts'));
        const states: string[] = [];
        worker.onStateChanged = ({ state }) => states.push(state);
        watchHandler!({ type: 'change', path: '/main.ts' });
        watchHandler!({ type: 'reset' });
        await vi.waitFor(() => {
          expect(filesystem.mocks.readFile).toHaveBeenCalledTimes(2);
        });
        expect(states).toEqual([]);
        expect(worker.createGeometryCalls).toBe(1);
      } finally {
        await worker.cleanup();
      }
    });

    it('should collapse duplicate watch records for one changed revision', async () => {
      const initial = new Uint8Array([1]);
      const changed = new Uint8Array([2]);
      const filesystem = createMockFileSystem({ readFileResult: changed });
      filesystem.mocks.readFiles.mockResolvedValue({ '/main.ts': initial });
      let watchHandler: ((event: WatchEvent) => void) | undefined;
      Object.assign(filesystem, {
        watch: vi.fn((_request: unknown, handler: (event: WatchEvent) => void) => {
          watchHandler = handler;
          return vi.fn();
        }),
      });
      const worker = new MockKernelWorker({ middleware: [], onLog: noopLog, filesystem });
      // @ts-expect-error - install the watch-capable proxy seam exercised by production initialization
      worker.fileSystem = filesystem;

      try {
        await openAndWaitForRender(worker, createGeometryFile('main.ts'));
        watchHandler!({ type: 'change', path: '/main.ts' });
        watchHandler!({ type: 'change', path: '/main.ts' });
        await vi.waitFor(() => {
          expect(worker.createGeometryCalls).toBe(2);
        });
        expect(filesystem.mocks.readFile).toHaveBeenCalledTimes(2);
        await new Promise((resolve) => {
          setTimeout(resolve, 75);
        });
        expect(worker.createGeometryCalls).toBe(2);
      } finally {
        await worker.cleanup();
      }
    });

    it('should conservatively render after an observer read failure', async () => {
      const filesystem = createMockFileSystem();
      filesystem.mocks.readFiles.mockResolvedValue({ '/main.ts': new Uint8Array([1]) });
      filesystem.mocks.readFile.mockRejectedValue(new Error('read failed'));
      let watchHandler: ((event: WatchEvent) => void) | undefined;
      Object.assign(filesystem, {
        watch: vi.fn((_request: unknown, handler: (event: WatchEvent) => void) => {
          watchHandler = handler;
          return vi.fn();
        }),
      });
      const worker = new MockKernelWorker({ middleware: [], onLog: noopLog, filesystem });
      // @ts-expect-error - install the watch-capable proxy seam exercised by production initialization
      worker.fileSystem = filesystem;

      try {
        await openAndWaitForRender(worker, createGeometryFile('main.ts'));
        watchHandler!({ type: 'change', path: '/main.ts' });
        await vi.waitFor(() => {
          expect(worker.createGeometryCalls).toBe(2);
        });
        expect(worker.createGeometryCalls).toBe(2);
      } finally {
        await worker.cleanup();
      }
    });

    it('should render both present-to-missing and missing-to-present revisions', async () => {
      const filesystem = createMockFileSystem();
      filesystem.mocks.readFiles.mockResolvedValue({ '/main.ts': new Uint8Array([1]) });
      let missing = false;
      let bytes = new Uint8Array([1]);
      filesystem.mocks.readFile.mockImplementation(async () => {
        if (missing) {
          throw Object.assign(new Error('missing'), { code: 'ENOENT' });
        }
        return bytes;
      });
      let watchHandler: ((event: WatchEvent) => void) | undefined;
      Object.assign(filesystem, {
        watch: vi.fn((_request: unknown, handler: (event: WatchEvent) => void) => {
          watchHandler = handler;
          return vi.fn();
        }),
      });
      const worker = new MockKernelWorker({ middleware: [], onLog: noopLog, filesystem });
      // @ts-expect-error - install the watch-capable proxy seam exercised by production initialization
      worker.fileSystem = filesystem;

      try {
        await openAndWaitForRender(worker, createGeometryFile('main.ts'));
        missing = true;
        watchHandler!({ type: 'delete', path: '/main.ts' });
        await vi.waitFor(() => {
          expect(worker.createGeometryCalls).toBe(2);
        });

        missing = false;
        bytes = new Uint8Array([2]);
        watchHandler!({ type: 'change', path: '/main.ts' });
        await vi.waitFor(() => {
          expect(worker.createGeometryCalls).toBe(3);
        });
      } finally {
        await worker.cleanup();
      }
    });

    it('should render the latest authoritative revision once across local, external, and echo records', async () => {
      const initial = new Uint8Array([1]);
      const local = new Uint8Array([2]);
      const external = new Uint8Array([3]);
      const filesystem = createMockFileSystem();
      filesystem.mocks.readFiles.mockResolvedValue({ '/main.ts': initial });
      filesystem.mocks.readFile
        .mockResolvedValueOnce(local)
        .mockResolvedValueOnce(external)
        .mockResolvedValueOnce(external);
      let watchHandler: ((event: WatchEvent) => void) | undefined;
      Object.assign(filesystem, {
        watch: vi.fn((_request: unknown, handler: (event: WatchEvent) => void) => {
          watchHandler = handler;
          return vi.fn();
        }),
      });
      const worker = new MockKernelWorker({ middleware: [], onLog: noopLog, filesystem });
      // @ts-expect-error - install the watch-capable proxy seam exercised by production initialization
      worker.fileSystem = filesystem;

      try {
        await openAndWaitForRender(worker, createGeometryFile('main.ts'));
        watchHandler!({ type: 'change', path: '/main.ts' });
        watchHandler!({ type: 'change', path: '/main.ts' });
        watchHandler!({ type: 'change', path: '/main.ts' });

        await vi.waitFor(() => {
          expect(worker.createGeometryCalls).toBe(2);
        });
        await new Promise((resolve) => {
          setTimeout(resolve, 75);
        });
        expect(worker.createGeometryCalls).toBe(2);
        // @ts-expect-error - verify the existing runtime revision cache owns the final authoritative bytes
        expect(worker.fileHashCache.get('/main.ts')).toBe(await worker.hashContent(external));
      } finally {
        await worker.cleanup();
      }
    });

    it('should reject a stale watch reread after a newer staged write owns the same path', async () => {
      const initial = new Uint8Array([1]);
      const latest = new Uint8Array([2]);
      let diskBytes = initial;
      const renderReads: number[][] = [];
      const staleRead = Promise.withResolvers<Uint8Array<ArrayBuffer>>();
      const watchReadStarted = Promise.withResolvers<void>();
      let parkNextRead = false;
      const filesystem = createMockFileSystem();
      filesystem.mocks.readFiles.mockImplementation(async () => {
        const snapshot = new Uint8Array(diskBytes);
        renderReads.push([...snapshot]);
        return { '/main.ts': snapshot };
      });
      filesystem.mocks.readFile.mockImplementation(async () => {
        if (parkNextRead) {
          parkNextRead = false;
          watchReadStarted.resolve();
          return staleRead.promise;
        }
        return new Uint8Array(diskBytes);
      });
      filesystem.mocks.writeFile.mockImplementation(async (_path, data) => {
        if (typeof data === 'string') {
          diskBytes = new TextEncoder().encode(data);
          return;
        }
        if (data instanceof Uint8Array) {
          diskBytes = Uint8Array.from(data);
        }
      });
      let watchHandler: ((event: WatchEvent) => void) | undefined;
      Object.assign(filesystem, {
        watch: vi.fn((_request: unknown, handler: (event: WatchEvent) => void) => {
          watchHandler = handler;
          return vi.fn();
        }),
      });
      const worker = new MockKernelWorker({ middleware: [], onLog: noopLog, filesystem });
      // @ts-expect-error - install the watch-capable proxy seam exercised by production initialization
      worker.fileSystem = filesystem;

      try {
        await openAndWaitForRender(worker, createGeometryFile('main.ts'));
        parkNextRead = true;
        watchHandler!({ type: 'change', path: '/main.ts' });
        await watchReadStarted.promise;

        // @ts-expect-error - drive the production staged-write path during the parked observer reread
        await worker.writeFilesAndInvalidate({ '/main.ts': latest });
        // @ts-expect-error - verify the staged revision owns the cache before the stale read settles
        expect(worker.fileHashCache.get('/main.ts')).toBe(await worker.hashContent(latest));

        staleRead.resolve(initial);
        // @ts-expect-error - wait for the production routeWatchEvent reconciliation lane to settle
        await worker.watchReconciliationTail;
        // @ts-expect-error - the stale observer revision must never be installed
        expect(worker.fileHashCache.get('/main.ts')).not.toBe(await worker.hashContent(initial));

        await vi.waitFor(() => {
          expect(worker.createGeometryCalls).toBeGreaterThan(1);
          expect(renderReads.at(-1)).toEqual([2]);
        });
        // @ts-expect-error - the recovery render restores the current staged revision
        expect(worker.fileHashCache.get('/main.ts')).toBe(await worker.hashContent(latest));
      } finally {
        await worker.cleanup();
      }
    });

    it('should discard a stale observed revision when a newer same-path revision already owns the cache', () => {
      const worker = createConfiguredWorker();
      // @ts-expect-error - pin the private revision-commit guard at its single install site
      worker.fileHashCache.set('/main.ts', 'newer');
      // @ts-expect-error - pin the paired content cache behavior at the same private seam
      worker.fileContentCache.set('/main.ts', new Uint8Array([2]));

      // @ts-expect-error - exercise the private compare-and-set commit used by observer reconciliation
      worker._applyObservedRevisions(
        ['/main.ts'],
        new Map([['/main.ts', { hash: 'stale', content: new Uint8Array([1]), expectedPrior: { hash: 'older' } }]]),
      );

      // @ts-expect-error - verify stale observer data was conservatively evicted, not installed
      expect(worker.fileHashCache.has('/main.ts')).toBe(false);
      // @ts-expect-error - verify the paired stale content was also evicted
      expect(worker.fileContentCache.has('/main.ts')).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // render() error cleanup
  // ---------------------------------------------------------------------------

  describe('render error cleanup', () => {
    it('should clear the internal onProgress phase callback when render() throws', async () => {
      const filesystem = createMockFileSystem();
      filesystem.mocks.readFiles.mockResolvedValue({
        '/main.ts': new Uint8Array([1, 2, 3]),
      });

      const worker = new FailingKernelWorker({
        middleware: [],
        onLog: noopLog,
        filesystem,
      });

      // Phase 6a-tail: per-call `onProgress` is gone; progress is fanned out via
      // the worker-level `onProgressUpdate` callback (phase + internal generation + renderId)
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

    it('should reconcile observed paths when render() throws', async () => {
      const filesystem = createMockFileSystem();
      filesystem.mocks.readFiles.mockResolvedValue({
        '/main.ts': new Uint8Array([1, 2, 3]),
      });

      const worker = new FailingKernelWorker({
        middleware: [],
        onLog: noopLog,
        filesystem,
      });

      await expect(
        worker.render({
          file: createGeometryFile('main.ts'),
          parameters: {},
        }),
      ).rejects.toThrow();

      expect(worker.getWatchedPaths()).toContain('/main.ts');
    });

    it('should refresh filesystem watches after request-scoped exportModel()', async () => {
      const filesystem = createMockFileSystem();
      filesystem.mocks.readFiles.mockResolvedValue({
        '/main.ts': new Uint8Array([1, 2, 3]),
      });
      const unsubscribe = vi.fn();
      const watch = vi.fn((_request: { paths: readonly string[] }, _handler: unknown) => unsubscribe);
      const worker = new MockKernelWorker({
        middleware: [],
        onLog: noopLog,
        filesystem,
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
      expect(watchRequest?.paths).toContain('/main.ts');
    });

    it('should clear onProgress when executeRender fails via handleOpenFile', async () => {
      const filesystem = createMockFileSystem();
      filesystem.mocks.readFiles.mockResolvedValue({
        '/main.ts': new Uint8Array([1, 2, 3]),
      });

      const worker = new FailingKernelWorker({
        middleware: [],
        onLog: noopLog,
        filesystem,
      });

      worker.onProgressUpdate = vi.fn();

      const renderComplete = new Promise<void>((resolve) => {
        worker.onStateChanged = ({ state }) => {
          if (state === 'error' || state === 'idle') {
            resolve();
          }
        };
      });

      worker.handleOpenFile({ renderId: previewId(900), file: createGeometryFile('main.ts'), parameters: {} });
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
      worker.setActiveFile(createGeometryFile('main.ts'));

      const expectedDependencies = ['/main.ts', '/lib/box.ts'];

      // Pre-populate the bundle cache with a known result
      // @ts-expect-error - accessing private for test verification
      worker.bundleResultCache.set('/main.ts', {
        code: 'bundled-code',
        dependencies: expectedDependencies,
        unresolvedPaths: [],
        issues: [],
        success: true,
      });

      const mockBundlerDefinition = {
        name: 'MockBundler',
        version: '1.0.0',
        extensions: ['ts'],
        initialize: vi.fn(),
        detectImports: vi.fn(),
        bundle: vi.fn(),
        execute: vi.fn(),
        registerModule: vi.fn(),
      };

      // Inject mock bundler directly into loadedBundlers
      // @ts-expect-error - accessing protected for test verification
      worker.loadedBundlers.set('ts', { definition: mockBundlerDefinition, ctx: {} });

      // @ts-expect-error - accessing private for test verification
      const facade = worker.createBundlerFacade(new AbortController().signal);
      const result = await facade.resolveDependencies('/main.ts');

      expect(result).toEqual({ resolved: expectedDependencies, unresolved: [] });
    });
  });

  // ---------------------------------------------------------------------------
  // Bundler invalidation on active-file switch
  // ---------------------------------------------------------------------------

  describe('operation-scoped runtime facade', () => {
    it('should create a fresh bundler facade for each runtime operation', () => {
      const worker = createConfiguredWorker();

      // @ts-expect-error - accessing private method for test verification
      worker.setActiveFile(createGeometryFile('project-a/main.ts'));

      // @ts-expect-error - accessing private for test verification
      const runtime1 = worker.createRuntime();
      const bundler1 = runtime1.bundler;

      // @ts-expect-error - accessing private method for test verification
      worker.setActiveFile(createGeometryFile('project-b/main.ts'));

      // @ts-expect-error - accessing private for test verification
      const runtime2 = worker.createRuntime();
      const bundler2 = runtime2.bundler;

      expect(bundler1).not.toBe(bundler2);
    });
  });

  // ---------------------------------------------------------------------------
  // Buffering state emission
  // ---------------------------------------------------------------------------

  describe('buffering state', () => {
    it('should coalesce repeated parameter updates into the latest scoped buffering state', async () => {
      vi.useFakeTimers();
      try {
        const worker = createConfiguredWorker();

        // @ts-expect-error - accessing private method for test verification
        worker.setActiveFile(createGeometryFile('main.ts'));

        worker.onStateChanged = vi.fn();
        worker.onGeometryComputed = vi.fn();

        // @ts-expect-error - accessing private for test verification
        worker.currentFile = createGeometryFile('main.ts');

        // Call scheduleRender 3x rapidly via handleUpdateParameters
        worker.handleUpdateParameters({ renderId: previewId(1001), parameters: { width: 1 } });
        worker.handleUpdateParameters({ renderId: previewId(1002), parameters: { width: 2 } });
        worker.handleUpdateParameters({ renderId: previewId(1003), parameters: { width: 3 } });
        await flushMicrotasks();

        const bufferingCalls = (worker.onStateChanged as ReturnType<typeof vi.fn>).mock.calls.filter(
          ([event]) => event.state === 'buffering',
        );
        expect(bufferingCalls).toEqual([[expect.objectContaining({ renderId: previewId(1003) })]]);
      } finally {
        vi.useRealTimers();
      }
    });

    it('should emit idle when render completes with no pending timer', async () => {
      const worker = createConfiguredWorker();

      const stateChanges: string[] = [];
      const renderComplete = new Promise<void>((resolve) => {
        worker.onStateChanged = ({ state }) => {
          stateChanges.push(state);
          if (state === 'idle' || state === 'error') {
            resolve();
          }
        };
      });

      worker.handleOpenFile({ renderId: previewId(1004), file: createGeometryFile('main.ts'), parameters: {} });
      await renderComplete;

      expect(stateChanges).toContain('rendering');
      expect(stateChanges).toContain('idle');
    });

    it('should serialize parameter buffering behind an active render', async () => {
      let resolveGate!: () => void;
      const gate = new Promise<void>((resolve) => {
        resolveGate = resolve;
      });
      let enterGate!: () => void;
      const gateEntered = new Promise<void>((resolve) => {
        enterGate = resolve;
      });

      class GatedKernelWorker extends MockKernelWorker {
        protected override async onCreateGeometry(
          _input: CreateGeometryInput,
          _runtime: KernelRuntime,
        ): Promise<CreateGeometryResult> {
          enterGate();
          await gate;
          return { success: true, data: { format: 'gltf', content: new Uint8Array([1]) }, issues: [] };
        }
      }

      const filesystem = createMockFileSystem();
      filesystem.mocks.readFiles.mockResolvedValue({
        '/main.ts': new Uint8Array([1, 2, 3]),
      });

      const worker = new GatedKernelWorker({ middleware: [], onLog: noopLog, filesystem });

      const stateChanges: string[] = [];
      worker.onStateChanged = ({ state }) => {
        stateChanges.push(state);
      };
      worker.onGeometryComputed = vi.fn();

      worker.handleOpenFile({ renderId: previewId(1005), file: createGeometryFile('main.ts'), parameters: {} });
      await gateEntered;
      worker.handleUpdateParameters({ renderId: previewId(1006), parameters: { width: 2 } });
      await flushMicrotasks();
      expect(stateChanges).not.toContain('buffering');

      resolveGate();
      await flushMicrotasks();

      expect(stateChanges).toContain('rendering');
      expect(stateChanges).toContain('buffering');
      await worker.cleanup();
    });
  });

  // ---------------------------------------------------------------------------
  // handleOpenFile parameters
  // ---------------------------------------------------------------------------

  describe('handleOpenFile parameters', () => {
    it('should use an explicit empty parameters object', async () => {
      const worker = createConfiguredWorker();

      const renderComplete = new Promise<void>((resolve) => {
        worker.onStateChanged = ({ state }) => {
          if (state === 'idle' || state === 'error') {
            resolve();
          }
        };
      });

      worker.handleOpenFile({ renderId: previewId(1007), file: createGeometryFile('main.ts'), parameters: {} });
      await renderComplete;

      // @ts-expect-error - accessing private for test verification
      expect(worker.currentParameters).toEqual({});
    });

    it('should use provided parameters when given', async () => {
      const worker = createConfiguredWorker();

      const renderComplete = new Promise<void>((resolve) => {
        worker.onStateChanged = ({ state }) => {
          if (state === 'idle' || state === 'error') {
            resolve();
          }
        };
      });

      worker.handleOpenFile({
        renderId: previewId(1008),
        file: createGeometryFile('main.ts'),
        parameters: { width: 10 },
      });
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
        '/main.ts': new Uint8Array([1, 2, 3]),
      });
      const callOrder: string[] = [];
      class RecordingWorker extends MockKernelWorker {
        protected override async onCreateGeometry(
          input: CreateGeometryInput,
          runtime: KernelRuntime,
        ): Promise<CreateGeometryResult> {
          callOrder.push('createGeometry');
          return super.onCreateGeometry(input, runtime);
        }
      }
      const worker = new RecordingWorker({ middleware: [], onLog: noopLog, filesystem });
      filesystem.mocks.writeFile.mockImplementation(async (path: string) => {
        callOrder.push(`writeFile:${path}`);
      });

      const stage: Record<string, Uint8Array<ArrayBuffer>> = {
        '/main.ts': new Uint8Array([10, 20, 30]),
        '/lib.ts': new Uint8Array([40, 50]),
      };

      await worker.handleStageAndOpenFile({
        renderId: '550e8400-e29b-41d4-a716-446655440001',
        stage,
        file: createGeometryFile('main.ts'),
        parameters: { width: 5 },
        options: { coordinateSystem: 'z-up' },
      });

      expect(filesystem.mocks.writeFile).toHaveBeenCalledTimes(2);
      expect(filesystem.mocks.writeFile).toHaveBeenCalledWith('/main.ts', new Uint8Array([10, 20, 30]));
      expect(filesystem.mocks.writeFile).toHaveBeenCalledWith('/lib.ts', new Uint8Array([40, 50]));

      // Strict ordering: every write completes before geometry work starts.
      expect(callOrder).toEqual(['writeFile:/main.ts', 'writeFile:/lib.ts', 'createGeometry']);
    });

    it('creates parent directories (recursive) once per unique parent before staging', async () => {
      const filesystem = createMockFileSystem();
      filesystem.mocks.readFiles.mockResolvedValue({});
      const worker = new MockKernelWorker({ middleware: [], onLog: noopLog, filesystem });

      await worker.handleStageAndOpenFile({
        renderId: '550e8400-e29b-41d4-a716-446655440002',
        stage: {
          '/a.ts': new Uint8Array([1]),
          '/b.ts': new Uint8Array([2]),
          '/sub/c.ts': new Uint8Array([3]),
        },
        file: createGeometryFile('a.ts'),
        parameters: {},
      });

      expect(filesystem.mocks.mkdir).toHaveBeenCalledTimes(1);
      expect(filesystem.mocks.mkdir).toHaveBeenCalledWith('/sub', { recursive: true });
    });

    it('opens the entry without staging when the stage map is empty', async () => {
      const filesystem = createMockFileSystem();
      filesystem.mocks.readFiles.mockResolvedValue({
        '/main.ts': new Uint8Array([1, 2, 3]),
      });
      const worker = new MockKernelWorker({ middleware: [], onLog: noopLog, filesystem });
      const onGeometryComputed = vi.fn();
      worker.onGeometryComputed = onGeometryComputed;

      await worker.handleStageAndOpenFile({
        renderId: '550e8400-e29b-41d4-a716-446655440003',
        stage: {},
        file: createGeometryFile('main.ts'),
        parameters: {},
      });

      expect(filesystem.mocks.writeFile).not.toHaveBeenCalled();
      expect(filesystem.mocks.mkdir).not.toHaveBeenCalled();
      expect(onGeometryComputed).toHaveBeenCalledOnce();
    });

    it('does not render if a writeFile failure aborts staging', async () => {
      const filesystem = createMockFileSystem();
      filesystem.mocks.writeFile.mockRejectedValueOnce(new Error('disk full'));
      const worker = new MockKernelWorker({ middleware: [], onLog: noopLog, filesystem });
      const onGeometryComputed = vi.fn();
      const onError = vi.fn<NonNullable<typeof worker.onError>>();
      worker.onGeometryComputed = onGeometryComputed;
      worker.onError = onError;

      await worker.handleStageAndOpenFile({
        renderId: '550e8400-e29b-41d4-a716-446655440004',
        stage: { '/main.ts': new Uint8Array([1]) },
        file: createGeometryFile('main.ts'),
        parameters: {},
      });

      expect(onGeometryComputed).not.toHaveBeenCalled();
      expect(onError).toHaveBeenCalledOnce();
      expect(onError.mock.calls[0]?.[0].issues.some((issue) => issue.message.includes('disk full'))).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Immediate entry-path watch
  // ---------------------------------------------------------------------------

  describe('immediate entry-path watch', () => {
    it('should emit idle for an aborted preview before buffering its watched successor (T23)', async () => {
      let resolveGate!: () => void;
      const gate = new Promise<void>((resolve) => {
        resolveGate = resolve;
      });
      let enterGate!: () => void;
      const gateEntered = new Promise<void>((resolve) => {
        enterGate = resolve;
      });
      const renderAborted = Promise.withResolvers<void>();

      class GatedKernelWorker extends MockKernelWorker {
        protected override async onCreateGeometry(
          _input: CreateGeometryInput,
          runtime: KernelRuntime,
        ): Promise<CreateGeometryResult> {
          runtime.signal.addEventListener(
            'abort',
            () => {
              renderAborted.resolve();
            },
            { once: true },
          );
          enterGate();
          await gate;
          return {
            success: true,
            data: { format: 'gltf', content: new Uint8Array([1]) },
            issues: [],
          };
        }
      }

      const filesystem = createMockFileSystem();
      filesystem.mocks.readFiles.mockResolvedValue({
        '/main.ts': new Uint8Array([1, 2, 3]),
      });
      let watchHandler: ((event: WatchEvent) => void) | undefined;
      Object.assign(filesystem, {
        watch: vi.fn((_request: unknown, handler: (event: WatchEvent) => void) => {
          watchHandler = handler;
          return vi.fn();
        }),
      });

      const worker = new GatedKernelWorker({ middleware: [], onLog: noopLog, filesystem });
      // @ts-expect-error - install the watch-capable proxy seam exercised by production initialization
      worker.fileSystem = filesystem;

      const states: Array<{ state: string; renderId: string }> = [];
      worker.onStateChanged = ({ state, renderId }) => {
        states.push({ state, renderId });
      };
      worker.onGeometryComputed = vi.fn();

      // Starts executeRender via handleOpenFile, which blocks in createGeometry.
      worker.handleOpenFile({ renderId: previewId(1301), file: createGeometryFile('main.ts'), parameters: {} });
      await gateEntered;

      expect(worker.getWatchedPaths()).toContain('/main.ts');
      if (!watchHandler) {
        throw new Error('Expected the entry watch to be installed before geometry creation');
      }

      watchHandler({ type: 'change', path: '/main.ts' });
      await renderAborted.promise;

      resolveGate();
      await flushMicrotasks();

      expect(states.slice(0, 3).map(({ state }) => state)).toEqual(['rendering', 'idle', 'buffering']);
      expect(states[0]?.renderId).toBe(states[1]?.renderId);
      expect(states[2]?.renderId).not.toBe(states[0]?.renderId);
      await worker.cleanup();
    });

    it('should terminally settle a buffered preview before buffering the next watched successor', async () => {
      let revision = new Uint8Array([1, 2, 3]);
      const filesystem = createMockFileSystem();
      filesystem.mocks.readFiles.mockImplementation(async () => ({ '/main.ts': revision }));
      filesystem.mocks.readFile.mockImplementation(async () => revision);
      let watchHandler: ((event: WatchEvent) => void) | undefined;
      Object.assign(filesystem, {
        watch: vi.fn((_request: unknown, handler: (event: WatchEvent) => void) => {
          watchHandler = handler;
          return vi.fn();
        }),
      });
      const worker = new MockKernelWorker({ middleware: [], onLog: noopLog, filesystem });
      // @ts-expect-error - install the watch-capable proxy seam exercised by production initialization
      worker.fileSystem = filesystem;
      const states: Array<{ state: string; renderId: string }> = [];
      const initialSettled = Promise.withResolvers<void>();
      worker.onStateChanged = ({ state, renderId }) => {
        states.push({ state, renderId });
        if (state === 'idle' && states.length === 2) {
          initialSettled.resolve();
        }
      };
      worker.onGeometryComputed = vi.fn();

      worker.handleOpenFile({ renderId: previewId(1302), file: createGeometryFile('main.ts'), parameters: {} });
      await initialSettled.promise;
      if (!watchHandler) {
        throw new Error('Expected the entry watch to be installed');
      }

      revision = new Uint8Array([4]);
      watchHandler({ type: 'change', path: '/main.ts' });
      await vi.waitFor(() => {
        expect(states.at(-1)?.state).toBe('buffering');
      });
      const firstBuffered = states.at(-1);
      expect(firstBuffered?.state).toBe('buffering');

      revision = new Uint8Array([5]);
      watchHandler({ type: 'change', path: '/main.ts' });
      await vi.waitFor(() => {
        expect(states.slice(-3).map(({ state }) => state)).toEqual(['buffering', 'idle', 'buffering']);
      });
      const handoff = states.slice(-3);

      expect(handoff.map(({ state }) => state)).toEqual(['buffering', 'idle', 'buffering']);
      expect(handoff[0]?.renderId).toBe(handoff[1]?.renderId);
      expect(handoff[2]?.renderId).not.toBe(handoff[0]?.renderId);
      await worker.cleanup();
    });

    it('should terminally settle a queued preview superseded before execution', async () => {
      const gate = Promise.withResolvers<void>();
      const gateEntered = Promise.withResolvers<void>();
      class GatedKernelWorker extends MockKernelWorker {
        protected override async onCreateGeometry(): Promise<CreateGeometryResult> {
          gateEntered.resolve();
          await gate.promise;
          return { success: true, data: { format: 'gltf', content: new Uint8Array([1]) }, issues: [] };
        }
      }

      const filesystem = createMockFileSystem();
      filesystem.mocks.readFiles.mockResolvedValue({ '/main.ts': new Uint8Array([1, 2, 3]) });
      filesystem.mocks.readFile.mockResolvedValueOnce(new Uint8Array([4])).mockResolvedValueOnce(new Uint8Array([5]));
      let watchHandler: ((event: WatchEvent) => void) | undefined;
      Object.assign(filesystem, {
        watch: vi.fn((_request: unknown, handler: (event: WatchEvent) => void) => {
          watchHandler = handler;
          return vi.fn();
        }),
      });
      const worker = new GatedKernelWorker({ middleware: [], onLog: noopLog, filesystem });
      // @ts-expect-error - install the watch-capable proxy seam exercised by production initialization
      worker.fileSystem = filesystem;
      const states: Array<{ state: string; renderId: string }> = [];
      worker.onStateChanged = ({ state, renderId }) => {
        states.push({ state, renderId });
      };
      worker.onGeometryComputed = vi.fn();

      worker.handleOpenFile({ renderId: previewId(1303), file: createGeometryFile('main.ts'), parameters: {} });
      await gateEntered.promise;
      if (!watchHandler) {
        throw new Error('Expected the entry watch to be installed');
      }

      watchHandler({ type: 'change', path: '/main.ts' });
      watchHandler({ type: 'change', path: '/main.ts' });
      gate.resolve();
      await vi.waitFor(() => {
        expect(states.slice(-3).map(({ state }) => state)).toEqual(['buffering', 'idle', 'buffering']);
      });
      const queuedTerminal = states.at(-2);
      expect(queuedTerminal?.state).toBe('idle');
      const successor = states.at(-1);
      expect(successor?.state).toBe('buffering');
      expect(successor?.renderId).not.toBe(queuedTerminal?.renderId);
      await worker.cleanup();
    });

    it('should acknowledge a buffered timeout without entering geometry', async () => {
      const filesystem = createMockFileSystem();
      filesystem.mocks.readFiles.mockResolvedValue({ '/main.ts': new Uint8Array([1, 2, 3]) });
      filesystem.mocks.readFile.mockResolvedValue(new Uint8Array([4]));
      let watchHandler: ((event: WatchEvent) => void) | undefined;
      Object.assign(filesystem, {
        watch: vi.fn((_request: unknown, handler: (event: WatchEvent) => void) => {
          watchHandler = handler;
          return vi.fn();
        }),
      });
      const worker = new MockKernelWorker({ middleware: [], onLog: noopLog, filesystem });
      // @ts-expect-error - install the watch-capable proxy seam exercised by production initialization
      worker.fileSystem = filesystem;
      const states: Array<{ state: string; renderId: string; abortGeneration: number }> = [];
      const errors: Array<{ code: string; renderId?: string }> = [];
      const initialSettled = Promise.withResolvers<void>();
      worker.onStateChanged = ({ state, renderId, abortGeneration }) => {
        states.push({ state, renderId, abortGeneration });
        if (state === 'idle' && states.length === 2) {
          initialSettled.resolve();
        }
      };
      worker.onError = ({ issues, renderId }) => {
        errors.push(...issues.map((issue) => ({ code: issue.code, renderId })));
      };
      worker.onGeometryComputed = vi.fn();

      worker.handleOpenFile({ renderId: previewId(1304), file: createGeometryFile('main.ts'), parameters: {} });
      await initialSettled.promise;
      if (!watchHandler) {
        throw new Error('Expected the entry watch to be installed');
      }

      watchHandler({ type: 'change', path: '/main.ts' });
      await vi.waitFor(() => {
        expect(states.at(-1)?.state).toBe('buffering');
      });
      const buffered = states.at(-1);
      if (buffered?.state !== 'buffering') {
        throw new Error('Expected a buffered watched preview');
      }
      worker.handleWireAbort({
        renderId: buffered.renderId,
        reason: abortReason.timeout,
      });

      expect(errors).toEqual([{ code: 'RENDER_TIMEOUT', renderId: buffered.renderId }]);
      expect(states.at(-1)).toMatchObject({ state: 'error', renderId: buffered.renderId });
      expect(worker.createGeometryCalls).toBe(1);
      await worker.cleanup();
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
        getDependencies() {
          return [{ path: '/.tau/parameters/main.ts.json' }];
        },
      });

      const filesystem = createMockFileSystem();
      filesystem.mocks.readFiles.mockResolvedValue({
        '/main.ts': new Uint8Array([1, 2, 3]),
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
      const hash1 = result1.success ? result1.data.hash : undefined;

      // Change the parameter file content and invalidate caches
      // (simulates a watch-triggered file change between render cycles)
      filesystem.mocks.readFile.mockResolvedValue(new Uint8Array([99, 99, 99]));
      // @ts-expect-error - accessing private for test verification
      worker._invalidateCachesForPaths(['/.tau/parameters/main.ts.json']);
      // @ts-expect-error - accessing private for test verification
      worker.renderDependencyCache = undefined;

      const result2 = await worker.runCreateGeometry('main.ts');
      expect(result2.success).toBe(true);
      const hash2 = result2.success ? result2.data.hash : undefined;

      expect(hash1).toBeDefined();
      expect(hash2).toBeDefined();
      expect(hash1).not.toBe(hash2);
    });

    it('should produce identical hashes when middleware dependency file is unchanged', async () => {
      const parameterFileContent = new Uint8Array([10, 20, 30]);

      const middlewareWithDeps = defineMiddleware({
        id: 'test-deps',
        name: 'test-deps',
        getDependencies() {
          return [{ path: '/.tau/parameters/main.ts.json' }];
        },
      });

      const filesystem = createMockFileSystem();
      filesystem.mocks.readFiles.mockResolvedValue({
        '/main.ts': new Uint8Array([1, 2, 3]),
      });
      filesystem.mocks.readFile.mockResolvedValue(parameterFileContent);

      const worker = createConfiguredWorker({
        middleware: [middlewareWithDeps],
        filesystem,
      });

      worker.onStateChanged = vi.fn();
      worker.onGeometryComputed = vi.fn();

      const result1 = await worker.runCreateGeometry('main.ts');
      const hash1 = result1.success ? result1.data.hash : undefined;

      const result2 = await worker.runCreateGeometry('main.ts');
      const hash2 = result2.success ? result2.data.hash : undefined;

      expect(hash1).toBeDefined();
      expect(hash1).toBe(hash2);
    });

    it('should use sentinel hash when middleware dependency file is missing', async () => {
      const middlewareWithDeps = defineMiddleware({
        id: 'test-deps',
        name: 'test-deps',
        getDependencies() {
          return [{ path: '/.tau/missing.json' }];
        },
      });

      const filesystem = createMockFileSystem();
      filesystem.mocks.readFiles.mockResolvedValue({
        '/main.ts': new Uint8Array([1, 2, 3]),
      });
      filesystem.mocks.readFile.mockRejectedValue(Object.assign(new Error('missing'), { code: 'ENOENT' }));

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
        '/main.ts': new Uint8Array([1, 2, 3]),
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
          entryPath: '/main.ts',
        }),
        expect.objectContaining({
          options: middlewareOptions,
        }),
      );
      const dependencyRuntime = getDependenciesSpy.mock.calls[0]?.[1] as { readonly signal?: unknown } | undefined;
      expect(dependencyRuntime?.signal).toBeInstanceOf(AbortSignal);
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
        '/main.ts': new Uint8Array([1, 2, 3]),
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

    it('rejects invalid middleware dependency paths before provider access with a middleware issue', async () => {
      const middlewareWithInvalidDependency = defineMiddleware({
        id: 'invalid-dependency',
        name: 'invalid-dependency',
        getDependencies() {
          return [{ path: '../outside.json' }];
        },
      });
      const filesystem = createMockFileSystem();
      filesystem.mocks.readFiles.mockResolvedValue({ '/main.ts': new Uint8Array([1]) });
      const worker = createConfiguredWorker({ middleware: [middlewareWithInvalidDependency], filesystem });

      await expect(worker.runCreateGeometry('main.ts')).rejects.toMatchObject({
        issues: [expect.objectContaining({ code: 'MIDDLEWARE_FAILED' })],
      });
      expect(filesystem.mocks.readFile).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // Unresolved dependency path tracking
  // ---------------------------------------------------------------------------

  describe('unresolved dependency path tracking', () => {
    it('should include bundleResultCache unresolvedPaths in the observed path set', async () => {
      const worker = createConfiguredWorker();

      // @ts-expect-error - accessing private method for test verification
      worker.setActiveFile(createGeometryFile('main.ts'));

      // @ts-expect-error - accessing private for test verification
      worker.bundleResultCache.set('/main.ts', {
        code: '',
        dependencies: ['/main.ts'],
        unresolvedPaths: ['/lib/box.ts', '/lib/cylinder.ts'],
        issues: [],
        success: false,
      });

      // @ts-expect-error - accessing private for test verification
      await worker.reconcileObservedPaths();

      expect(worker.getWatchedPaths()).toContain('/lib/box.ts');
      expect(worker.getWatchedPaths()).toContain('/lib/cylinder.ts');
      expect(worker.getWatchedPaths()).toContain('/main.ts');
    });
  });

  it('closes admission synchronously, aborts active work, and runs cleanup once', async () => {
    let releaseRender!: () => void;
    const renderGate = new Promise<void>((resolve) => {
      releaseRender = resolve;
    });
    let renderStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      renderStarted = resolve;
    });
    const cleanupHook = vi.fn();

    class CleanupWorker extends MockKernelWorker {
      protected override async onCreateGeometry(): Promise<CreateGeometryResult> {
        renderStarted();
        await renderGate;
        return { success: true, data: { format: 'gltf', content: new Uint8Array([1]) }, issues: [] };
      }

      protected override async onCleanup(): Promise<void> {
        cleanupHook();
      }
    }

    const filesystem = createMockFileSystem();
    filesystem.mocks.readFiles.mockResolvedValue({ '/main.ts': new Uint8Array([1]) });
    const worker = new CleanupWorker({ middleware: [], onLog: noopLog, filesystem });
    const dispose = vi.fn();
    const unsubscribe = vi.fn();
    // @ts-expect-error - install production lifecycle seams for focused verification
    worker.fileSystem = { ...filesystem, dispose };
    // @ts-expect-error - focused verification of post-drain watch teardown
    worker.watchUnsubscribe = unsubscribe;
    // @ts-expect-error - the preview already observes its entry, so reconciliation leaves the subscription alone
    worker.watchedPaths = new Set(['/main.ts']);

    // The active preview record is the only cancellable work: request-scoped `render()`/
    // `exportModel()` calls are drained, not aborted.
    const observed = observePreview(worker);
    const activeId = previewId(1401);
    worker.handleOpenFile({ renderId: activeId, file: createGeometryFile('main.ts'), parameters: {} });
    await started;
    const firstCleanup = worker.cleanup();
    const secondCleanup = worker.cleanup();

    expect(firstCleanup).toBe(secondCleanup);
    expect(unsubscribe).not.toHaveBeenCalled();
    await expect(worker.render({ file: createGeometryFile('other.ts'), parameters: {} })).rejects.toThrow(
      'Runtime worker is closing',
    );
    expect(cleanupHook).not.toHaveBeenCalled();

    releaseRender();
    await firstCleanup;
    expect(observed.states.at(-1)).toMatchObject({ renderId: activeId, state: 'idle' });
    expect(observed.geometries).toEqual([]);
    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(dispose).toHaveBeenCalledOnce();
    expect(cleanupHook).toHaveBeenCalledOnce();
  });
});

describe('preview admission invariants', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('rejects SAB ingress without its captured generation without replacing the active preview (T8)', async () => {
    const entered = Promise.withResolvers<void>();
    const gate = Promise.withResolvers<void>();

    class GatedWorker extends MockKernelWorker {
      protected override async onCreateGeometry(
        input: CreateGeometryInput,
        runtime: KernelRuntime,
      ): Promise<CreateGeometryResult> {
        entered.resolve();
        await gate.promise;
        return super.onCreateGeometry(input, runtime);
      }
    }

    const worker = new GatedWorker({ middleware: [], onLog: noopLog, filesystem: createMockFileSystem() });
    const observed = observePreview(worker);
    const signalBuffer = new SharedArrayBuffer(signalBufferByteLength);
    const signalView = new Int32Array(signalBuffer);
    Atomics.store(signalView, signalSlot.abortGeneration, 1);
    worker.setSignalBuffer(signalBuffer);

    const activeId = previewId(801);
    worker.handleOpenFile({
      renderId: activeId,
      abortGeneration: 1,
      file: createGeometryFile('main.ts'),
      parameters: {},
    });
    await entered.promise;

    expect(() => {
      worker.handleOpenFile({ renderId: previewId(802), file: createGeometryFile('main.ts'), parameters: {} });
    }).toThrow('abortGeneration');

    gate.resolve();
    await observed.waitForState((event) => event.renderId === activeId && event.state === 'idle');
    expect(observed.geometries.map(({ renderId }) => renderId)).toEqual([activeId]);
  });

  it('allocates one generation for wire-only ingress and preserves the supplied ID (T9)', async () => {
    const worker = createConfiguredWorker();
    const observed = observePreview(worker);
    const renderId = previewId(901);

    worker.handleOpenFile({ renderId, file: createGeometryFile('main.ts'), parameters: {} });
    await observed.waitForState((event) => event.renderId === renderId && event.state === 'idle');

    expect(observed.states.map(({ abortGeneration }) => abortGeneration)).toEqual([1, 1]);
    expect(observed.geometries.map((event) => event.renderId)).toEqual([renderId]);
  });

  it('rejects a supplied generation on wire-only ingress without mutating worker state (T10)', async () => {
    const worker = createConfiguredWorker();
    const observed = observePreview(worker);

    expect(() => {
      worker.handleOpenFile({
        renderId: previewId(1001),
        abortGeneration: 9,
        file: createGeometryFile('main.ts'),
        parameters: {},
      });
    }).toThrow('abortGeneration');
    expect(observed.states).toEqual([]);

    const validId = previewId(1002);
    worker.handleOpenFile({ renderId: validId, file: createGeometryFile('main.ts'), parameters: {} });
    await observed.waitForState((event) => event.renderId === validId && event.state === 'idle');
    expect(observed.states.at(0)).toMatchObject({ renderId: validId, abortGeneration: 1 });
  });

  it('does not let delayed SAB ingress replace a newer autonomous preview (T11)', async () => {
    const worker = createConfiguredWorker();
    const observed = observePreview(worker);
    const signalBuffer = new SharedArrayBuffer(signalBufferByteLength);
    const signalView = new Int32Array(signalBuffer);
    Atomics.store(signalView, signalSlot.abortGeneration, 1);
    worker.setSignalBuffer(signalBuffer);

    const initialId = previewId(1101);
    worker.handleOpenFile({
      renderId: initialId,
      abortGeneration: 1,
      file: createGeometryFile('main.ts'),
      parameters: {},
    });
    await observed.waitForState((event) => event.renderId === initialId && event.state === 'idle');
    // @ts-expect-error - remove debounce while retaining the production autonomous-watch route
    worker.currentPreviewWatchPaths.set('/main.ts', 0);

    const delayedGeneration = Atomics.add(new Uint32Array(signalBuffer), signalSlot.abortGeneration, 1) + 1;
    const autonomousChange = worker.notifyFileChanged(['/main.ts']);
    await autonomousChange;
    const autonomous = observed.states.find((event) => event.renderId !== initialId && event.state === 'buffering');
    expect(autonomous).toMatchObject({ abortGeneration: 3 });

    const delayedId = previewId(1102);
    worker.handleOpenFile({
      renderId: delayedId,
      abortGeneration: delayedGeneration,
      file: createGeometryFile('main.ts'),
      parameters: {},
    });

    expect(observed.states.slice(-2)).toEqual([
      { renderId: delayedId, abortGeneration: delayedGeneration, state: 'idle' },
      { renderId: autonomous?.renderId, abortGeneration: 3, state: 'buffering' },
    ]);

    await observed.waitForState((event) => event.renderId === autonomous?.renderId && event.state === 'idle');
    expect(observed.geometries.at(-1)?.renderId).toBe(autonomous?.renderId);
  });

  it('re-publishes no successor frame when the successor is completed but unreleased (T31)', async () => {
    const reconcileEntered = Promise.withResolvers<void>();
    const reconcileGate = Promise.withResolvers<void>();
    let gateArmed = false;
    const filesystem = createMockFileSystem();
    filesystem.mocks.readFiles.mockResolvedValue({ '/main.ts': new Uint8Array([1, 2, 3]) });
    filesystem.mocks.readFile.mockResolvedValue(new Uint8Array([1, 2, 3]));
    const worker = new MockKernelWorker({ middleware: [], onLog: noopLog, filesystem });
    // @ts-expect-error - install the watch-capable production seam so the terminal push and the record
    // release are separated by real reconciliation IO
    worker.fileSystem = {
      ...filesystem,
      watch: () => () => {
        /* No-op */
      },
      watchReady: () => ({
        unsubscribe: () => {
          /* No-op */
        },
        ready: (async () => {
          if (gateArmed) {
            reconcileEntered.resolve();
            await reconcileGate.promise;
          }
        })(),
      }),
    };

    const observed = observePreview(worker);
    const signalBuffer = new SharedArrayBuffer(signalBufferByteLength);
    const signalView = new Int32Array(signalBuffer);
    Atomics.store(signalView, signalSlot.abortGeneration, 1);
    worker.setSignalBuffer(signalBuffer);

    const successorId = previewId(3101);
    const staleId = previewId(3102);
    const relay = worker.onStateChanged!;
    worker.onStateChanged = (event) => {
      relay(event);
      if (event.renderId === successorId && event.state === 'idle') {
        gateArmed = true;
        // @ts-expect-error - force the finally-path resubscribe that spans the terminal push and the release
        worker.watchedPaths = new Set();
      }
    };

    // The client reserved generation 1 for the stale command, then reserved 2 for the successor.
    Atomics.store(signalView, signalSlot.abortGeneration, 2);
    worker.handleOpenFile({
      renderId: successorId,
      abortGeneration: 2,
      file: createGeometryFile('main.ts'),
      parameters: {},
    });
    await reconcileEntered.promise;

    const beforeStale = observed.states.length;
    worker.handleOpenFile({
      renderId: staleId,
      abortGeneration: 1,
      file: createGeometryFile('main.ts'),
      parameters: {},
    });

    expect(observed.states.slice(beforeStale)).toEqual([{ renderId: staleId, abortGeneration: 1, state: 'idle' }]);

    reconcileGate.resolve();
    await worker.cleanup();
  });

  it('rejects duplicate live IDs without replacing the original record (T12)', async () => {
    const entered = Promise.withResolvers<void>();
    const gate = Promise.withResolvers<void>();

    class GatedWorker extends MockKernelWorker {
      protected override async onCreateGeometry(
        input: CreateGeometryInput,
        runtime: KernelRuntime,
      ): Promise<CreateGeometryResult> {
        entered.resolve();
        await gate.promise;
        return super.onCreateGeometry(input, runtime);
      }
    }

    const worker = new GatedWorker({ middleware: [], onLog: noopLog, filesystem: createMockFileSystem() });
    const observed = observePreview(worker);
    const renderId = previewId(1201);
    worker.handleOpenFile({ renderId, file: createGeometryFile('main.ts'), parameters: {} });
    await entered.promise;

    expect(() => {
      worker.handleOpenFile({ renderId, file: createGeometryFile('main.ts'), parameters: { duplicate: true } });
    }).toThrow('Duplicate');

    gate.resolve();
    await observed.waitForState((event) => event.renderId === renderId && event.state === 'idle');
    expect(observed.errors).toEqual([]);
    expect(observed.geometries.map((event) => event.renderId)).toEqual([renderId]);
  });

  it('keeps the direct render() helper request-scoped alongside a live preview (T36)', async () => {
    const entered = Promise.withResolvers<void>();
    const gate = Promise.withResolvers<void>();

    class GatedWorker extends MockKernelWorker {
      protected override async onCreateGeometry(
        input: CreateGeometryInput,
        runtime: KernelRuntime,
      ): Promise<CreateGeometryResult> {
        entered.resolve();
        await gate.promise;
        return super.onCreateGeometry(input, runtime);
      }
    }

    const filesystem = createMockFileSystem();
    filesystem.mocks.readFiles.mockResolvedValue({ '/main.ts': new Uint8Array([1, 2, 3]) });
    const worker = new GatedWorker({ middleware: [], onLog: noopLog, filesystem });
    const observed = observePreview(worker);
    const previewRenderId = previewId(3601);
    worker.handleOpenFile({ renderId: previewRenderId, file: createGeometryFile('main.ts'), parameters: {} });
    await entered.promise;

    // @ts-expect-error - the admitted preview record is the ownership the helper must not touch
    const admitted = worker.activeRenderRecord as { readonly controller: AbortController } | undefined;
    const direct = worker.render({ file: createGeometryFile('main.ts'), parameters: {} });

    // @ts-expect-error - accessing private for test verification
    expect(worker.activeRenderRecord).toBe(admitted);
    expect(admitted?.controller.signal.aborted).toBe(false);

    gate.resolve();
    await expect(direct).resolves.toMatchObject({ success: true });
    await observed.waitForState((event) => event.renderId === previewRenderId && event.state === 'idle');

    expect(observed.geometries.map((event) => event.renderId)).toEqual([previewRenderId]);
    // @ts-expect-error - accessing private for test verification
    expect(worker.renderCancellationRecords.size).toBe(0);
  });

  it('does not admit a preview for an unrelated worker-local file change (T17)', async () => {
    const worker = createConfiguredWorker();
    const observed = observePreview(worker);
    const renderId = previewId(1701);
    worker.handleOpenFile({ renderId, file: createGeometryFile('main.ts'), parameters: {} });
    await observed.waitForState((event) => event.renderId === renderId && event.state === 'idle');
    observed.states.length = 0;
    observed.geometries.length = 0;

    await worker.notifyFileChanged(['/unrelated.ts']);

    expect(observed.states).toEqual([]);
    expect(observed.geometries).toEqual([]);
  });

  it('stages an admitted preview without scheduling a second lifecycle (T19)', async () => {
    const worker = createConfiguredWorker();
    const observed = observePreview(worker);
    const initialId = previewId(1901);
    worker.handleOpenFile({ renderId: initialId, file: createGeometryFile('main.ts'), parameters: {} });
    await observed.waitForState((event) => event.renderId === initialId && event.state === 'idle');
    observed.states.length = 0;
    observed.geometries.length = 0;

    const stagedId = previewId(1902);
    await worker.handleStageAndOpenFile({
      renderId: stagedId,
      stage: { '/main.ts': new Uint8Array([4, 5, 6]) },
      file: createGeometryFile('main.ts'),
      parameters: {},
    });
    await observed.waitForState((event) => event.renderId === stagedId && event.state === 'idle');
    await flushMicrotasks();

    expect(observed.states.map((event) => ({ renderId: event.renderId, state: event.state }))).toEqual([
      { renderId: stagedId, state: 'rendering' },
      { renderId: stagedId, state: 'idle' },
    ]);
    expect(observed.geometries.map((event) => event.renderId)).toEqual([stagedId]);
  });

  it('keeps a watched-path staged export outside preview admission and scheduling (T20)', async () => {
    const initial = new Uint8Array([1]);
    const staged = new Uint8Array([7, 8, 9]);
    let diskBytes = initial;
    let watchHandler: ((event: WatchEvent) => void) | undefined;
    const watchInstalled = Promise.withResolvers<void>();
    const stageWriteEntered = Promise.withResolvers<void>();
    const releaseStageWrite = Promise.withResolvers<void>();
    const filesystem = createMockFileSystem();
    filesystem.mocks.readFiles.mockImplementation(async () => ({ '/main.ts': new Uint8Array(diskBytes) }));
    filesystem.mocks.readFile.mockImplementation(async () => new Uint8Array(diskBytes));
    filesystem.mocks.writeFile.mockImplementation(async (_path, data) => {
      if (typeof data === 'string') {
        diskBytes = new TextEncoder().encode(data);
      } else if (data instanceof Uint8Array) {
        diskBytes = Uint8Array.from(data);
      }
      watchHandler?.({ type: 'change', path: '/main.ts' });
      stageWriteEntered.resolve();
      await releaseStageWrite.promise;
    });
    Object.assign(filesystem, {
      watch: vi.fn((_request: unknown, handler: (event: WatchEvent) => void) => {
        watchHandler = handler;
        watchInstalled.resolve();
        return vi.fn();
      }),
    });
    const worker = new MockKernelWorker({ middleware: [], onLog: noopLog, filesystem });
    // @ts-expect-error - install the watch-capable proxy seam exercised by production initialization
    worker.fileSystem = filesystem;
    const observed = observePreview(worker);

    try {
      const initialId = previewId(2001);
      worker.handleOpenFile({ renderId: initialId, file: createGeometryFile('main.ts'), parameters: {} });
      await observed.waitForState((event) => event.renderId === initialId && event.state === 'idle');
      await watchInstalled.promise;
      await flushMicrotasks();
      observed.states.length = 0;
      observed.geometries.length = 0;
      filesystem.mocks.readFile.mockClear();
      vi.useFakeTimers();

      const bufferedId = previewId(2002);
      worker.handleUpdateParameters({ renderId: bufferedId, parameters: { size: 2 } });
      await observed.waitForState((event) => event.renderId === bufferedId && event.state === 'buffering');

      const result = worker.exportModel({
        stage: { '/main.ts': staged },
        file: createGeometryFile('main.ts'),
        parameters: {},
        format: 'gltf',
      });
      await stageWriteEntered.promise;
      await flushMicrotasks();

      expect(filesystem.mocks.readFile).not.toHaveBeenCalled();
      releaseStageWrite.resolve();
      await expect(result).resolves.toMatchObject({ success: true });
      // @ts-expect-error - wait for the production watch reconciliation lane to settle
      await worker.watchReconciliationTail;

      expect(observed.states.map((event) => ({ renderId: event.renderId, state: event.state }))).toEqual([
        { renderId: bufferedId, state: 'buffering' },
      ]);
      expect(observed.geometries).toEqual([]);
    } finally {
      releaseStageWrite.resolve();
      await worker.cleanup();
    }
  });

  it('keeps a pre-write reconciliation from superseding the staged record (T40)', async () => {
    let diskBytes = new Uint8Array([1, 2, 3]);
    let watchHandler: ((event: WatchEvent) => void) | undefined;
    let revisionGateArmed = false;
    const watchInstalled = Promise.withResolvers<void>();
    const revisionEntered = Promise.withResolvers<void>();
    const revisionGate = Promise.withResolvers<void>();
    const stageWriteEntered = Promise.withResolvers<void>();
    const releaseStageWrite = Promise.withResolvers<void>();

    const filesystem = createMockFileSystem();
    filesystem.mocks.readFiles.mockImplementation(async () => ({ '/main.ts': new Uint8Array(diskBytes) }));
    filesystem.mocks.readFile.mockImplementation(async () => {
      const snapshot = new Uint8Array(diskBytes);
      if (revisionGateArmed) {
        revisionGateArmed = false;
        revisionEntered.resolve();
        await revisionGate.promise;
      }
      return snapshot;
    });
    filesystem.mocks.writeFile.mockImplementation(async (_path, data) => {
      diskBytes = data instanceof Uint8Array ? Uint8Array.from(data) : new TextEncoder().encode(String(data));
      stageWriteEntered.resolve();
      await releaseStageWrite.promise;
    });
    Object.assign(filesystem, {
      watch: vi.fn((_request: unknown, handler: (event: WatchEvent) => void) => {
        watchHandler = handler;
        watchInstalled.resolve();
        return vi.fn();
      }),
    });

    const worker = new MockKernelWorker({ middleware: [], onLog: noopLog, filesystem });
    // @ts-expect-error - install the watch-capable proxy seam exercised by production initialization
    worker.fileSystem = filesystem;
    const observed = observePreview(worker);

    try {
      const initialId = previewId(4001);
      worker.handleOpenFile({ renderId: initialId, file: createGeometryFile('main.ts'), parameters: {} });
      await observed.waitForState((event) => event.renderId === initialId && event.state === 'idle');
      await watchInstalled.promise;
      await flushMicrotasks();
      observed.states.length = 0;
      observed.geometries.length = 0;

      // An external write lands first; its reconciliation reads the pre-stage revision.
      diskBytes = new Uint8Array([4, 4, 4]);
      revisionGateArmed = true;
      watchHandler?.({ type: 'change', path: '/main.ts' });
      await revisionEntered.promise;

      const stagedId = previewId(4002);
      const staged = worker.handleStageAndOpenFile({
        renderId: stagedId,
        stage: { '/main.ts': new Uint8Array([7, 8, 9]) },
        file: createGeometryFile('main.ts'),
        parameters: {},
      });
      await stageWriteEntered.promise;

      revisionGate.resolve();
      // A macrotask boundary lets the reconciliation finish hashing and park on the barrier
      // before the staged write clears it.
      await new Promise((resolve) => {
        setTimeout(resolve, 10);
      });
      releaseStageWrite.resolve();
      await staged;
      await observed.waitForState((event) => event.renderId === stagedId && event.state === 'idle');
      // @ts-expect-error - wait for the production watch reconciliation lane to settle
      await worker.watchReconciliationTail;
      await flushMicrotasks();

      expect(observed.states.map((event) => ({ renderId: event.renderId, state: event.state }))).toEqual([
        { renderId: stagedId, state: 'rendering' },
        { renderId: stagedId, state: 'idle' },
      ]);
      expect(observed.geometries.map((event) => event.renderId)).toEqual([stagedId]);
    } finally {
      revisionGate.resolve();
      releaseStageWrite.resolve();
      await worker.cleanup();
    }
  });

  it('validates an open-file locator before replacing the active preview (T26)', async () => {
    const entered = Promise.withResolvers<void>();
    const gate = Promise.withResolvers<void>();

    class GatedWorker extends MockKernelWorker {
      protected override async onCreateGeometry(
        input: CreateGeometryInput,
        runtime: KernelRuntime,
      ): Promise<CreateGeometryResult> {
        entered.resolve();
        await gate.promise;
        return super.onCreateGeometry(input, runtime);
      }
    }

    const worker = new GatedWorker({ middleware: [], onLog: noopLog, filesystem: createMockFileSystem() });
    const observed = observePreview(worker);
    const activeId = previewId(2601);
    worker.handleOpenFile({ renderId: activeId, file: createGeometryFile('main.ts'), parameters: {} });
    await entered.promise;

    expect(() => {
      worker.handleOpenFile({
        renderId: previewId(2602),
        file: { path: 'relative', filename: 'bad.ts' },
        parameters: {},
      });
    }).toThrow('absolute path');

    gate.resolve();
    await observed.waitForState((event) => event.renderId === activeId && event.state === 'idle');
    expect(observed.geometries.map((event) => event.renderId)).toEqual([activeId]);
  });

  it('terminates and releases no-file parameter and option admissions (T27)', async () => {
    const worker = createConfiguredWorker();
    const observed = observePreview(worker);
    const parametersId = previewId(2701);
    const optionsId = previewId(2702);

    worker.handleUpdateParameters({ renderId: parametersId, parameters: { size: 2 } });
    await observed.waitForState((event) => event.renderId === parametersId && event.state === 'error');
    worker.handleUpdateParameters({ renderId: parametersId, parameters: { size: 3 } });
    await observed.waitForState(
      (event) =>
        event.renderId === parametersId &&
        event.state === 'error' &&
        observed.states.filter((candidate) => candidate.renderId === parametersId).length === 2,
    );

    worker.handleSetOptions({ renderId: optionsId, options: { quality: 'high' } });
    await observed.waitForState((event) => event.renderId === optionsId && event.state === 'error');
    worker.handleSetOptions({ renderId: optionsId, options: { quality: 'low' } });
    await observed.waitForState(
      (event) =>
        event.renderId === optionsId &&
        event.state === 'error' &&
        observed.states.filter((candidate) => candidate.renderId === optionsId).length === 2,
    );
  });

  it('does not commit the watch candidate of a render an SAB reservation superseded (T39)', async () => {
    const entered = Promise.withResolvers<void>();
    const gate = Promise.withResolvers<void>();

    class GatedDependencyWorker extends DependencyKernelWorker {
      protected override async onCreateGeometry(
        input: CreateGeometryInput,
        runtime: KernelRuntime,
      ): Promise<CreateGeometryResult> {
        entered.resolve();
        await gate.promise;
        return super.onCreateGeometry(input, runtime);
      }
    }

    const filesystem = createMockFileSystem();
    filesystem.mocks.readFiles.mockResolvedValue({
      '/main.ts': new Uint8Array([1, 2, 3]),
      '/dep.ts': new Uint8Array([4, 5, 6]),
    });
    const worker = new GatedDependencyWorker({ middleware: [], onLog: noopLog, filesystem });
    const observed = observePreview(worker);
    const signalBuffer = new SharedArrayBuffer(signalBufferByteLength);
    const signalView = new Int32Array(signalBuffer);
    Atomics.store(signalView, signalSlot.abortGeneration, 1);
    worker.setSignalBuffer(signalBuffer);

    const renderId = previewId(3901);
    worker.handleOpenFile({
      renderId,
      abortGeneration: 1,
      file: createGeometryFile('main.ts'),
      parameters: {},
    });
    await entered.promise;

    // The client reserves the next generation; only the atomic carries that supersession.
    Atomics.add(signalView, signalSlot.abortGeneration, 1);
    gate.resolve();
    await observed.waitForState(
      (event) => event.renderId === renderId && (event.state === 'idle' || event.state === 'error'),
    );
    await flushMicrotasks();

    // @ts-expect-error - accessing private for test verification
    expect([...worker.currentPreviewWatchPaths.keys()]).not.toContain('/dep.ts');
  });

  it('terminalizes an abandoned SAB reservation at the render early return (T38)', async () => {
    const worker = createConfiguredWorker();
    const observed = observePreview(worker);
    const signalBuffer = new SharedArrayBuffer(signalBufferByteLength);
    const signalView = new Int32Array(signalBuffer);
    Atomics.store(signalView, signalSlot.abortGeneration, 1);
    worker.setSignalBuffer(signalBuffer);

    const openedId = previewId(3801);
    worker.handleOpenFile({
      renderId: openedId,
      abortGeneration: 1,
      file: createGeometryFile('main.ts'),
      parameters: {},
    });
    await observed.waitForState((event) => event.renderId === openedId && event.state === 'idle');

    const parametersId = previewId(3802);
    Atomics.store(signalView, signalSlot.abortGeneration, 2);
    worker.handleUpdateParameters({ renderId: parametersId, abortGeneration: 2, parameters: { size: 2 } });
    await observed.waitForState((event) => event.renderId === parametersId && event.state === 'buffering');

    // The client reserves the next generation for a command that never arrives.
    Atomics.add(signalView, signalSlot.abortGeneration, 1);
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
    await flushMicrotasks();

    expect(observed.states.filter((event) => event.renderId === parametersId).map((event) => event.state)).toEqual([
      'buffering',
      'idle',
    ]);
    await worker.cleanup();
    // @ts-expect-error - accessing private for test verification
    expect(worker.renderCancellationRecords.size).toBe(0);
  });

  it('releases a shutdown-window notifyFileChanged admission (T38)', async () => {
    const worker = createConfiguredWorker();
    const observed = observePreview(worker);
    const openedId = previewId(3803);
    worker.handleOpenFile({ renderId: openedId, file: createGeometryFile('main.ts'), parameters: {} });
    await observed.waitForState((event) => event.renderId === openedId && event.state === 'idle');

    const cleanup = worker.cleanup();
    await expect(worker.notifyFileChanged(['/main.ts'])).rejects.toThrow('Runtime worker is closing');
    await cleanup;

    // @ts-expect-error - accessing private for test verification
    expect(worker.renderCancellationRecords.size).toBe(0);
  });

  it('releases a watch-routing admission that fails after admission closed (T38)', async () => {
    let watchHandler: ((event: WatchEvent) => void) | undefined;
    const watchInstalled = Promise.withResolvers<void>();
    let diskBytes = new Uint8Array([1, 2, 3]);
    const filesystem = createMockFileSystem();
    filesystem.mocks.readFiles.mockImplementation(async () => ({ '/main.ts': new Uint8Array(diskBytes) }));
    filesystem.mocks.readFile.mockImplementation(async () => new Uint8Array(diskBytes));
    Object.assign(filesystem, {
      watch: vi.fn((_request: unknown, handler: (event: WatchEvent) => void) => {
        watchHandler = handler;
        watchInstalled.resolve();
        return vi.fn();
      }),
    });

    class ClosingRoutingWorker extends MockKernelWorker {
      public failRouting = false;

      protected override onFileChanged(changedPaths: readonly string[]): void {
        if (this.failRouting) {
          this.failRouting = false;
          // @ts-expect-error - close admission between the watch admission and its routing
          this.operationAdmissionOpen = false;
          throw new Error('watch routing failed');
        }
        super.onFileChanged(changedPaths);
      }
    }

    const worker = new ClosingRoutingWorker({ middleware: [], onLog: noopLog, filesystem });
    // @ts-expect-error - install the watch-capable proxy seam exercised by production initialization
    worker.fileSystem = filesystem;
    const observed = observePreview(worker);
    const openedId = previewId(3804);
    worker.handleOpenFile({ renderId: openedId, file: createGeometryFile('main.ts'), parameters: {} });
    await observed.waitForState((event) => event.renderId === openedId && event.state === 'idle');
    await watchInstalled.promise;
    await flushMicrotasks();

    worker.failRouting = true;
    diskBytes = new Uint8Array([9, 9, 9]);
    watchHandler?.({ type: 'change', path: '/main.ts' });
    // @ts-expect-error - wait for the production watch reconciliation lane to settle
    await worker.watchReconciliationTail;
    await flushMicrotasks();

    // @ts-expect-error - accessing private for test verification
    expect(worker.renderCancellationRecords.size).toBe(0);
  });

  it('does not let preview timeout cancellation leak into request-scoped export work (T29)', async () => {
    const exportEntered = Promise.withResolvers<void>();
    const exportGate = Promise.withResolvers<void>();
    const exportSignals: AbortSignal[] = [];

    class ExportIsolationWorker extends MockKernelWorker {
      public exportInProgress = false;

      protected override async onGetParameters(input: GetParametersInput, runtime: KernelRuntime) {
        if (this.exportInProgress) {
          exportSignals.push(runtime.signal);
          exportEntered.resolve();
          await exportGate.promise;
        }
        return super.onGetParameters(input, runtime);
      }

      protected override async onCreateGeometry(input: CreateGeometryInput, runtime: KernelRuntime) {
        if (this.exportInProgress) {
          exportSignals.push(runtime.signal);
        }
        return super.onCreateGeometry(input, runtime);
      }
    }

    const worker = new ExportIsolationWorker({ middleware: [], onLog: noopLog, filesystem: createMockFileSystem() });
    const observed = observePreview(worker);
    const initialId = previewId(2901);
    worker.handleOpenFile({ renderId: initialId, file: createGeometryFile('main.ts'), parameters: {} });
    await observed.waitForState((event) => event.renderId === initialId && event.state === 'idle');

    worker.exportInProgress = true;
    const exported = worker.exportModel({ file: createGeometryFile('main.ts'), parameters: {}, format: 'gltf' });
    await exportEntered.promise;

    const timedOutId = previewId(2902);
    worker.handleOpenFile({ renderId: timedOutId, file: createGeometryFile('main.ts'), parameters: {} });
    worker.handleWireAbort({ renderId: timedOutId, reason: abortReason.timeout });
    exportGate.resolve();

    await expect(exported).resolves.toMatchObject({ success: true });
    expect(exportSignals.length).toBeGreaterThan(1);
    expect(exportSignals.every((signal) => !signal.aborted)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Render timeout
// ---------------------------------------------------------------------------

describe('abort reason propagation', () => {
  it('wire-only supersession publishes only the latest render without an error', async () => {
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    let markFirstStarted!: () => void;
    const firstStarted = new Promise<void>((resolve) => {
      markFirstStarted = resolve;
    });
    let createGeometryCalls = 0;

    class WireSupersessionWorker extends MockKernelWorker {
      protected override async onCreateGeometry(): Promise<CreateGeometryResult> {
        createGeometryCalls++;
        if (createGeometryCalls === 1) {
          markFirstStarted();
          await firstGate;
        }
        return { success: true, data: { format: 'gltf', content: new Uint8Array([createGeometryCalls]) }, issues: [] };
      }
    }

    const filesystem = createMockFileSystem();
    filesystem.mocks.readFiles.mockResolvedValue({ '/main.ts': new Uint8Array([1]) });
    const worker = new WireSupersessionWorker({ middleware: [], onLog: noopLog, filesystem });
    const firstRenderId = '550e8400-e29b-41d4-a716-446655440001';
    const secondRenderId = '550e8400-e29b-41d4-a716-446655440002';
    const publishedRenderIds: string[] = [];
    worker.onGeometryComputed = ({ renderId }) => {
      publishedRenderIds.push(renderId);
    };
    worker.onError = vi.fn();
    const secondSettled = new Promise<void>((resolve) => {
      worker.onStateChanged = ({ state, renderId }) => {
        if (state === 'idle' && renderId === secondRenderId) {
          resolve();
        }
      };
    });

    worker.handleOpenFile({ renderId: firstRenderId, file: createGeometryFile('main.ts'), parameters: {} });
    await firstStarted;
    worker.handleOpenFile({ renderId: secondRenderId, file: createGeometryFile('main.ts'), parameters: {} });
    releaseFirst();
    await secondSettled;

    expect(publishedRenderIds).toEqual([secondRenderId]);
    expect(worker.onError).not.toHaveBeenCalled();
  });

  it('retains captured SAB generations across rapid preview admissions and publishes only the latest', async () => {
    const sab = new SharedArrayBuffer(signalBufferByteLength);
    const view = new Int32Array(sab);
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    let markFirstStarted!: () => void;
    const firstStarted = new Promise<void>((resolve) => {
      markFirstStarted = resolve;
    });
    let createGeometryCalls = 0;

    class SabAdmissionWorker extends MockKernelWorker {
      protected override async onCreateGeometry(): Promise<CreateGeometryResult> {
        createGeometryCalls++;
        if (createGeometryCalls === 1) {
          markFirstStarted();
          await firstGate;
        }
        return { success: true, data: { format: 'gltf', content: new Uint8Array([createGeometryCalls]) }, issues: [] };
      }
    }

    const filesystem = createMockFileSystem();
    filesystem.mocks.readFiles.mockResolvedValue({ '/main.ts': new Uint8Array([1]) });
    const worker = new SabAdmissionWorker({ middleware: [], onLog: noopLog, filesystem });
    worker.setSignalBuffer(sab);
    const firstRenderId = '550e8400-e29b-41d4-a716-446655440003';
    const secondRenderId = '550e8400-e29b-41d4-a716-446655440004';
    const firstGeneration = Atomics.add(view, signalSlot.abortGeneration, 1) + 1;
    const observedRenderingGenerations: number[] = [];
    const publishedRenderIds: string[] = [];
    worker.onGeometryComputed = ({ renderId }) => {
      publishedRenderIds.push(renderId);
    };
    const secondSettled = new Promise<void>((resolve) => {
      worker.onStateChanged = ({ state, renderId, abortGeneration }) => {
        if (state === 'rendering') {
          observedRenderingGenerations.push(abortGeneration);
        }
        if (state === 'idle' && renderId === secondRenderId) {
          resolve();
        }
      };
    });

    worker.handleOpenFile({
      renderId: firstRenderId,
      abortGeneration: firstGeneration,
      file: createGeometryFile('main.ts'),
      parameters: {},
    });
    await firstStarted;
    const secondGeneration = Atomics.add(view, signalSlot.abortGeneration, 1) + 1;
    worker.handleOpenFile({
      renderId: secondRenderId,
      abortGeneration: secondGeneration,
      file: createGeometryFile('main.ts'),
      parameters: {},
    });
    releaseFirst();
    await secondSettled;

    expect(firstGeneration).not.toBe(secondGeneration);
    expect(observedRenderingGenerations).toEqual([firstGeneration, secondGeneration]);
    expect(publishedRenderIds).toEqual([secondRenderId]);
  });

  it('ignores a timeout whose target does not match the active render', async () => {
    let releaseRender!: () => void;
    const renderGate = new Promise<void>((resolve) => {
      releaseRender = resolve;
    });
    let markRenderStarted!: () => void;
    const renderStarted = new Promise<void>((resolve) => {
      markRenderStarted = resolve;
    });

    class MismatchedTimeoutWorker extends MockKernelWorker {
      protected override async onCreateGeometry(): Promise<CreateGeometryResult> {
        markRenderStarted();
        await renderGate;
        return { success: true, data: { format: 'gltf', content: new Uint8Array([1]) }, issues: [] };
      }
    }

    const filesystem = createMockFileSystem();
    filesystem.mocks.readFiles.mockResolvedValue({ '/main.ts': new Uint8Array([1]) });
    const worker = new MismatchedTimeoutWorker({ middleware: [], onLog: noopLog, filesystem });
    const activeRenderId = '550e8400-e29b-41d4-a716-446655440005';
    const mismatchedRenderId = '550e8400-e29b-41d4-a716-446655440006';
    worker.onError = vi.fn();
    worker.onGeometryComputed = vi.fn();
    const settled = new Promise<void>((resolve) => {
      worker.onStateChanged = ({ state, renderId }) => {
        if (state === 'idle' && renderId === activeRenderId) {
          resolve();
        }
      };
    });

    worker.handleOpenFile({ renderId: activeRenderId, file: createGeometryFile('main.ts'), parameters: {} });
    await renderStarted;
    worker.handleWireAbort({ renderId: mismatchedRenderId, reason: abortReason.timeout });
    releaseRender();
    await settled;

    expect(worker.onError).not.toHaveBeenCalled();
    expect(worker.onGeometryComputed).toHaveBeenCalledWith(expect.objectContaining({ renderId: activeRenderId }));
  });

  it('shares one operation signal across middleware, kernel, and bundler without aliasing the successor', async () => {
    const kernelSignals: AbortSignal[] = [];
    const middlewareSignals: AbortSignal[] = [];
    const bundlerSignals: AbortSignal[] = [];
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    let markFirstStarted!: () => void;
    const firstStarted = new Promise<void>((resolve) => {
      markFirstStarted = resolve;
    });

    const middleware = defineMiddleware({
      id: 'signal-capture',
      name: 'signal-capture',
      async wrapCreateGeometry(input, handler, runtime) {
        middlewareSignals.push(runtime.signal);
        return handler(input);
      },
    });

    class SignalIdentityWorker extends MockKernelWorker {
      protected override async onCreateGeometry(
        _input: CreateGeometryInput,
        runtime: KernelRuntime,
      ): Promise<CreateGeometryResult> {
        kernelSignals.push(runtime.signal);
        await runtime.execute('export default undefined;');
        if (kernelSignals.length === 1) {
          markFirstStarted();
          await firstGate;
        }
        return { success: true, data: { format: 'gltf', content: new Uint8Array([1]) }, issues: [] };
      }
    }

    const filesystem = createMockFileSystem();
    filesystem.mocks.readFiles.mockResolvedValue({ '/main.ts': new Uint8Array([1]) });
    const worker = new SignalIdentityWorker({ middleware: [middleware], onLog: noopLog, filesystem });
    const bundlerDefinition = {
      name: 'signal bundler',
      version: '1.0.0',
      extensions: ['ts'],
      initialize: vi.fn(async () => ({})),
      detectImports: vi.fn(async () => ({ detectedModules: [], dependencies: [] })),
      bundle: vi.fn(async () => ({
        code: '',
        dependencies: [],
        unresolvedPaths: [],
        issues: [],
        success: true,
      })),
      execute: vi.fn(async (_code: string, runtime: { readonly signal: AbortSignal }) => {
        bundlerSignals.push(runtime.signal);
        return { success: true, value: undefined };
      }),
      registerModule: vi.fn(),
    };
    // @ts-expect-error - install the already-loaded bundler seam used by the production runtime facade
    worker.loadedBundlers.set('ts', { definition: bundlerDefinition, ctx: {} });
    const firstRenderId = '550e8400-e29b-41d4-a716-446655440007';
    const secondRenderId = '550e8400-e29b-41d4-a716-446655440008';
    const secondSettled = new Promise<void>((resolve) => {
      worker.onStateChanged = ({ state, renderId }) => {
        if (state === 'idle' && renderId === secondRenderId) {
          resolve();
        }
      };
    });

    worker.handleOpenFile({ renderId: firstRenderId, file: createGeometryFile('main.ts'), parameters: {} });
    await firstStarted;
    expect(middlewareSignals[0]).toBe(kernelSignals[0]);
    expect(bundlerSignals[0]).toBe(kernelSignals[0]);

    worker.handleOpenFile({ renderId: secondRenderId, file: createGeometryFile('main.ts'), parameters: {} });
    const retainedFirstSignal = kernelSignals[0]!;
    expect(retainedFirstSignal.aborted).toBe(true);
    releaseFirst();
    await secondSettled;

    expect(kernelSignals).toHaveLength(2);
    expect(middlewareSignals[1]).toBe(kernelSignals[1]);
    expect(bundlerSignals[1]).toBe(kernelSignals[1]);
    expect(kernelSignals[1]).not.toBe(retainedFirstSignal);
    expect(kernelSignals[1]?.aborted).toBe(false);
    expect(retainedFirstSignal.aborted).toBe(true);
  });

  it('should transition to error state when abortReason is timeout', async () => {
    const sab = new SharedArrayBuffer(signalBufferByteLength);
    const view = new Int32Array(sab);

    class TimeoutKernelWorker extends MockKernelWorker {
      protected override async onCreateGeometry(): Promise<CreateGeometryResult> {
        // Simulate main-thread timeout firing during WASM: set reason then increment generation
        Atomics.store(view, signalSlot.abortReason, 2);
        Atomics.add(view, signalSlot.abortGeneration, 1);
        checkAbort();
        return { success: true, data: { format: 'gltf', content: new Uint8Array([1]) }, issues: [] };
      }
    }

    const filesystem = createMockFileSystem();
    filesystem.mocks.readFiles.mockResolvedValue({
      '/main.ts': new Uint8Array([1, 2, 3]),
    });

    const worker = new TimeoutKernelWorker({
      middleware: [],
      onLog: noopLog,
      filesystem,
    });

    worker.setSignalBuffer(sab);
    const onError = vi.fn<NonNullable<typeof worker.onError>>();
    worker.onError = onError;
    const renderId = previewId(2401);
    const abortGeneration = Atomics.add(new Uint32Array(sab), signalSlot.abortGeneration, 1) + 1;

    const renderComplete = new Promise<void>((resolve) => {
      worker.onStateChanged = ({ state }) => {
        if (state === 'error' || state === 'idle') {
          resolve();
        }
      };
    });

    worker.handleOpenFile({ renderId, abortGeneration, file: createGeometryFile('main.ts'), parameters: {} });
    await renderComplete;

    expect(onError).toHaveBeenCalledOnce();
    expect(onError.mock.calls[0]?.[0].renderId).toBe(renderId);
    expect(onError.mock.calls[0]?.[0].issues.some((issue) => issue.message.includes('timed out'))).toBe(true);
  });

  it('should report a wire-notified timeout without a SharedArrayBuffer', async () => {
    let releaseRender!: () => void;
    const renderGate = new Promise<void>((resolve) => {
      releaseRender = resolve;
    });
    let markRenderStarted!: () => void;
    const renderStarted = new Promise<void>((resolve) => {
      markRenderStarted = resolve;
    });

    class WireTimeoutKernelWorker extends MockKernelWorker {
      protected override async onCreateGeometry(): Promise<CreateGeometryResult> {
        markRenderStarted();
        await renderGate;
        return { success: true, data: { format: 'gltf', content: new Uint8Array([1]) }, issues: [] };
      }
    }

    const filesystem = createMockFileSystem();
    filesystem.mocks.readFiles.mockResolvedValue({
      '/main.ts': new Uint8Array([1, 2, 3]),
    });
    const worker = new WireTimeoutKernelWorker({
      middleware: [],
      onLog: noopLog,
      filesystem,
    });
    const renderId = '550e8400-e29b-41d4-a716-446655440000';
    const onError = vi.fn<NonNullable<typeof worker.onError>>();
    worker.onError = onError;
    const states: string[] = [];
    const renderComplete = new Promise<void>((resolve) => {
      worker.onStateChanged = ({ state }) => {
        states.push(state);
        if (state === 'error' || state === 'idle') {
          resolve();
        }
      };
    });

    worker.handleOpenFile({ renderId, file: createGeometryFile('main.ts'), parameters: {} });
    await renderStarted;
    worker.handleWireAbort({ renderId, reason: abortReason.timeout });
    releaseRender();
    await renderComplete;

    expect(onError).toHaveBeenCalledOnce();
    expect(onError.mock.calls[0]?.[0].renderId).toBe(renderId);
    expect(onError.mock.calls[0]?.[0].issues).toContainEqual({
      message: 'Render timed out.',
      code: 'RENDER_TIMEOUT',
      type: 'runtime',
      severity: 'error',
    });
    expect(states.at(-1)).toBe('error');
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
        return { success: true, data: { format: 'gltf', content: new Uint8Array([1]) }, issues: [] };
      }
    }

    const filesystem = createMockFileSystem();
    filesystem.mocks.readFiles.mockResolvedValue({
      '/main.ts': new Uint8Array([1, 2, 3]),
    });

    const worker = new SupersededKernelWorker({
      middleware: [],
      onLog: noopLog,
      filesystem,
    });

    worker.setSignalBuffer(sab);
    const onError = vi.fn<NonNullable<typeof worker.onError>>();
    worker.onError = onError;
    const renderId = previewId(2501);
    const abortGeneration = Atomics.add(new Uint32Array(sab), signalSlot.abortGeneration, 1) + 1;

    const renderComplete = new Promise<void>((resolve) => {
      worker.onStateChanged = ({ state }) => {
        if (state === 'error' || state === 'idle') {
          resolve();
        }
      };
    });

    worker.handleOpenFile({ renderId, abortGeneration, file: createGeometryFile('main.ts'), parameters: {} });
    await renderComplete;

    expect(onError).not.toHaveBeenCalled();
  });
});

describe('shared pools', () => {
  it('should close an unused bridge port when an inline filesystem takes precedence', async () => {
    const worker = createConfiguredWorker();
    const close = vi.fn();
    const fileSystemPort = { close } as unknown as MessagePort;

    await worker.initialize({
      callbacks: { onLog: vi.fn() },
      transferables: { inlineFileSystem: createMockFileSystem(), fileSystemPort },
      options: {},
    });

    expect(close).toHaveBeenCalledOnce();
  });

  it('should accept geometry pool buffer via setGeometryPoolBuffer', () => {
    const worker = createConfiguredWorker();
    const buffer = new SharedArrayBuffer(4096);

    expect(() => {
      worker.setGeometryPoolBuffer(buffer);
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
      transcode: vi.fn<TranscoderDefinition<{ initialized: boolean }>['transcode']>().mockResolvedValue({
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
    expect(usdzRoute!.exportOptions.schema).toHaveProperty('type', 'object');
    expect(threeMfRoute).toEqual(
      expect.objectContaining({
        transcoderId: 'test-transcoder',
        sourceFormat: 'glb',
        targetFormat: '3mf',
        fidelity: 'mesh',
      }),
    );
    expect(threeMfRoute!.exportOptions.schema).toHaveProperty('type', 'object');
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
      expect.objectContaining({ signal: expect.any(AbortSignal) as unknown as AbortSignal }),
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

  it('should populate manifest schema and defaults from kernel export formats', async () => {
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

  it('should derive JSON Schema from default Zod schemas when no custom export formats are declared', async () => {
    const worker = createConfiguredWorker();

    await worker.initialize({
      callbacks: { onLog: vi.fn() },
      transferables: {},
      options: {},
    });

    const manifest = worker.capabilitiesManifest;
    const glbExport = manifest.routes.find((r) => r.targetFormat === 'glb' && !r.transcoderId);
    expect(glbExport).toBeDefined();
    expect(glbExport!.exportOptions.schema).toHaveProperty('type', 'object');
    expect(glbExport!.exportOptions.defaults).toEqual({});
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

  it('should include schema and defaults on direct export routes when a kernel declares export formats', async () => {
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
    expect(glbRoute!.exportOptions.schema).toHaveProperty('properties');

    const { properties } = glbRoute!.exportOptions.schema as { properties: Record<string, unknown> };
    expect(properties).toHaveProperty('tessellation');
    expect(properties).toHaveProperty('coordinateSystem');

    expect(glbRoute!.exportOptions.defaults).toEqual(
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
    const stlProps = Object.keys((stlRoute.exportOptions.schema as { properties: Record<string, unknown> }).properties);
    expect(stlProps).toEqual(expect.arrayContaining(['binary', 'tessellation', 'coordinateSystem']));
    expect(stlRoute.exportOptions.defaults).toEqual(
      // oxlint-disable-next-line @typescript-eslint/no-unsafe-assignment -- vitest asymmetric matchers are untyped
      expect.objectContaining({ binary: true, tessellation: expect.any(Object), coordinateSystem: 'z-up' }),
    );

    const stepRoute = manifest.routes.find((r) => r.targetFormat === 'step')!;
    expect(stepRoute).toBeDefined();
    const stepProps = Object.keys(
      (stepRoute.exportOptions.schema as { properties: Record<string, unknown> }).properties,
    );
    expect(stepProps).toEqual(expect.arrayContaining(['assemblyMode', 'coordinateSystem']));
    expect(stepProps).not.toContain('tessellation');

    const glbRoute = manifest.routes.find((r) => r.targetFormat === 'glb')!;
    expect(glbRoute).toBeDefined();
    const glbProps = Object.keys((glbRoute.exportOptions.schema as { properties: Record<string, unknown> }).properties);
    expect(glbProps).toEqual(expect.arrayContaining(['tessellation', 'coordinateSystem']));

    const gltfRoute = manifest.routes.find((r) => r.targetFormat === 'gltf')!;
    expect(gltfRoute).toBeDefined();
    const gltfProps = Object.keys(
      (gltfRoute.exportOptions.schema as { properties: Record<string, unknown> }).properties,
    );
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
    expect(usdzRoute!.exportOptions.schema).toHaveProperty('properties');

    const { properties } = usdzRoute!.exportOptions.schema as { properties: Record<string, unknown> };
    expect(properties).toHaveProperty('tessellation');
    expect(properties).toHaveProperty('coordinateSystem');

    expect(usdzRoute!.exportOptions.defaults).toEqual(
      expect.objectContaining({
        tessellation: { linearTolerance: 0.1, angularTolerance: 15 },
        coordinateSystem: 'z-up',
      }),
    );
  });

  it('should preserve discriminated edge branches when merging source export options', async () => {
    const edgeSchema = z.union([
      z
        .object({
          mode: z.literal('single').default('single'),
          phi: z.number().default(60),
        })
        .strict()
        .meta({ title: 'Single' }),
      z
        .object({
          mode: z.literal('batch'),
          views: z.array(z.object({ id: z.string(), phi: z.number(), theta: z.number() }).strict()).min(1),
        })
        .strict()
        .meta({ title: 'Batch' }),
    ]);
    const mockModule = createMockTranscoderModule([
      { from: 'glb', to: 'webp', fidelity: 'mesh', optionsSchema: edgeSchema },
    ]);
    const worker = createConfiguredWorker({
      nativeHandle: { kind: 'mock-native-handle' },
      exportZodSchemas: { glb: tessellationSchema },
      transcoders: [createMockTranscoderPlugin('image-transcoder', mockModule)],
    });

    await worker.initialize({ callbacks: { onLog: vi.fn() }, transferables: {}, options: {} });

    const route = worker.capabilitiesManifest.routes.find((candidate) => candidate.targetFormat === 'webp');
    expect(route?.exportOptions.defaults).toMatchObject({ mode: 'single', phi: 60 });
    const branches = route?.exportOptions.schema.anyOf;
    expect(branches).toHaveLength(2);
    for (const branch of branches ?? []) {
      expect(branch).not.toBe(false);
      expect(branch).not.toBe(true);
      if (typeof branch !== 'object') {
        throw new TypeError('Expected an object JSON Schema branch.');
      }
      expect(branch.type).toBe('object');
      expect(branch.properties).toHaveProperty('mode');
      expect(branch.properties).toHaveProperty('tessellation');
    }

    const result = await worker.runExportGeometry('webp', {
      mode: 'batch',
      views: [{ id: 'front', phi: 90, theta: 0 }],
    });

    expect(result.success).toBe(true);
    expect(mockModule.transcode).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'webp',
        options: { mode: 'batch', views: [{ id: 'front', phi: 90, theta: 0 }] },
      }),
      expect.any(Object),
      expect.any(Object),
    );
  });

  it('should pin image source semantics while exposing only consumer-controlled route options', async () => {
    const glbSchema = tessellationSchema.extend(coordinateSystemSchema.shape).extend(unitSchema.shape);
    const imageModule = createMockTranscoderModule(
      (Object.keys(imageEdgeSchemas) as Array<keyof typeof imageEdgeSchemas>).map((target) => ({
        from: 'glb',
        to: target,
        fidelity: 'mesh',
        optionsSchema: imageEdgeSchemas[target],
        content: ['includeEdges'] as const,
        sourceOptions: { coordinateSystem: 'z-up', unit: { length: 'meter' } },
      })),
    );
    const worker = createConfiguredWorker({
      exportZodSchemas: { glb: glbSchema },
      nativeHandle: { kind: 'mock-native-handle' },
      transcoders: [createMockTranscoderPlugin('image-transcoder', imageModule)],
    });
    // @ts-expect-error -- route-planner contract test configures the mock kernel's protected declaration map.
    worker.kernelExportContentMap.set('mock-kernel', { glb: ['includeEdges'] });

    await worker.initialize({ callbacks: { onLog: vi.fn() }, transferables: {}, options: {} });

    for (const target of Object.keys(imageEdgeSchemas)) {
      const route = worker.capabilitiesManifest.routes.find((candidate) => candidate.targetFormat === target);
      expect(route?.content?.defaults).toEqual({ includeEdges: false });
      expect(route?.content?.schema).toMatchObject({
        additionalProperties: false,
        properties: { includeEdges: { type: 'boolean' } },
      });
      expect(route?.exportOptions.defaults).not.toHaveProperty('coordinateSystem');
      expect(route?.exportOptions.defaults).not.toHaveProperty('unit');

      const branches = route?.exportOptions.schema.anyOf;
      expect(branches).toHaveLength(2);
      for (const branch of branches ?? []) {
        if (typeof branch !== 'object') {
          throw new TypeError('Expected an object JSON Schema branch.');
        }
        expect(branch.properties).toHaveProperty('tessellation');
        expect(branch.properties).toHaveProperty('mode');
        expect(branch.properties).toHaveProperty('width');
        expect(branch.properties).toHaveProperty('includeAxes');
        expect(branch.properties).toHaveProperty('includeLabel');
        expect(branch.properties).toHaveProperty('includeScale');
        expect(branch.properties).not.toHaveProperty('coordinateSystem');
        expect(branch.properties).not.toHaveProperty('unit');
      }
    }

    await worker.runCreateGeometry();
    const result = await worker.exportGeometry('webp', { mode: 'single' }, { includeEdges: true });

    expect(result.success).toBe(true);
    expect(worker.exportGeometrySpy).toHaveBeenCalledWith(
      expect.objectContaining({
        format: 'glb',
        options: {
          tessellation: { linearTolerance: 0.1, angularTolerance: 15 },
          coordinateSystem: 'z-up',
          unit: { length: 'meter' },
        },
        content: { includeEdges: true },
      }),
      expect.any(Object),
    );
    expect(imageModule.transcode).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'webp',
      }),
      expect.any(Object),
      expect.any(Object),
    );
    const transcodeInput = imageModule.transcode.mock.calls[0]?.[0];
    expect(transcodeInput?.options).not.toHaveProperty('coordinateSystem');
    expect(transcodeInput?.options).not.toHaveProperty('unit');
  });

  it('should not duplicate enum values in transcoded route schemas', async () => {
    const edgeSchema = coordinateSystemSchema;
    const mockModule = createMockTranscoderModule([
      {
        from: 'glb',
        to: 'usdz',
        fidelity: 'mesh',
        optionsSchema: edgeSchema,
        sourceOptions: { coordinateSystem: 'y-up' },
      },
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

    const coordSchema = (usdzRoute!.exportOptions.schema as { properties: { coordinateSystem: { enum: string[] } } })
      .properties.coordinateSystem;
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

    const { properties } = usdzRoute!.exportOptions.schema as { properties: Record<string, unknown> };
    expect(properties).toHaveProperty('tessellation');
    expect(properties).toHaveProperty('coordinateSystem');
    expect(properties).toHaveProperty('quality');

    expect(usdzRoute!.exportOptions.defaults).toEqual(
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

    const { properties } = usdzRoute!.exportOptions.schema as { properties: Record<string, unknown> };
    expect(properties).toHaveProperty('tessellation');
    expect(properties).toHaveProperty('coordinateSystem');
    expect(properties).toHaveProperty('quality');

    expect(usdzRoute!.exportOptions.defaults).toEqual(
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
    expect(usdzRoute!.exportOptions.schema).toHaveProperty('properties');

    const usdzProps = (usdzRoute!.exportOptions.schema as { properties: Record<string, unknown> }).properties;
    expect(usdzProps).toHaveProperty('tessellation');
    expect(usdzProps).toHaveProperty('coordinateSystem');
    expect(usdzProps).toHaveProperty('unit');

    expect(usdzRoute!.exportOptions.defaults).toEqual({
      tessellation: { linearTolerance: 0.1, angularTolerance: 15 },
      coordinateSystem: 'z-up',
      unit: { length: 'meter' },
    });

    // 3MF route should also carry the kernel's GLB options
    const threeMfRoute = manifest.routes.find((r) => r.targetFormat === '3mf');
    expect(threeMfRoute).toBeDefined();
    const threeMfProps = (threeMfRoute!.exportOptions.schema as { properties: Record<string, unknown> }).properties;
    expect(threeMfProps).toHaveProperty('tessellation');
    expect(threeMfProps).toHaveProperty('coordinateSystem');
    expect(threeMfProps).toHaveProperty('unit');

    // OBJ route should also carry the kernel's GLB options
    const objectRoute = manifest.routes.find((r) => r.targetFormat === 'obj');
    expect(objectRoute).toBeDefined();
    const objectProperties = (objectRoute!.exportOptions.schema as { properties: Record<string, unknown> }).properties;
    expect(objectProperties).toHaveProperty('tessellation');
    expect(objectProperties).toHaveProperty('coordinateSystem');
    expect(objectProperties).toHaveProperty('unit');

    // Direct STL route should have its own schema (binary + tessellation + coordinateSystem)
    const stlRoute = manifest.routes.find((r) => r.targetFormat === 'stl' && !r.transcoderId);
    expect(stlRoute).toBeDefined();
    const stlProps = (stlRoute!.exportOptions.schema as { properties: Record<string, unknown> }).properties;
    expect(stlProps).toHaveProperty('binary');
    expect(stlProps).toHaveProperty('tessellation');
    expect(stlProps).toHaveProperty('coordinateSystem');
    expect(stlProps).toHaveProperty('unit');

    // Direct STEP route should have assemblyMode + coordinateSystem but NOT tessellation
    const stepRoute = manifest.routes.find((r) => r.targetFormat === 'step' && !r.transcoderId);
    expect(stepRoute).toBeDefined();
    const stepProps = (stepRoute!.exportOptions.schema as { properties: Record<string, unknown> }).properties;
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
// Native-handle materialization
// =============================================================================

describe('native-handle materialization', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should be a no-op when nativeHandle is already set', async () => {
    const worker = createConfiguredWorker({
      nativeHandle: { meshData: new Float32Array(3) },
    });

    const renderComplete = new Promise<void>((resolve) => {
      worker.onStateChanged = ({ state }) => {
        if (state === 'idle' || state === 'error') {
          resolve();
        }
      };
    });
    worker.handleOpenFile({ renderId: previewId(3501), file: createGeometryFile('test.ts'), parameters: {} });
    await renderComplete;

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
        data: { format: 'gltf', content: new Uint8Array([1, 2, 3]) },
        issues: [],
        serializedNativeHandle: serializedData,
      },
    });

    await openAndWaitForRender(worker);

    const callsAfterRender = worker.createGeometryCalls;
    const artifact = (worker as unknown as { currentPublishedRender?: MaterializedRender }).currentPublishedRender;
    expect(artifact).toBeDefined();
    artifact!.liveNativeHandleSlot = undefined;

    const result = await worker.runExportGeometry('gltf');

    expect(result.success).toBe(true);
    expect(worker.createGeometryCalls).toBeGreaterThan(callsAfterRender);
  });

  it('should fall back to re-running createGeometry when no handle data exists', async () => {
    const worker = createConfiguredWorker();

    await openAndWaitForRender(worker);

    const initialCalls = worker.createGeometryCalls;
    const artifact = (worker as unknown as { currentPublishedRender?: MaterializedRender }).currentPublishedRender;
    expect(artifact).toBeDefined();
    artifact!.liveNativeHandleSlot = undefined;
    artifact!.serializedNativeHandleSlot = undefined;
    const result = await worker.runExportGeometry('gltf');

    expect(result.success).toBe(true);
    expect(worker.createGeometryCalls).toBeGreaterThan(initialCalls);
  });

  it('should reuse the stored native build input for reheat', async () => {
    const worker = createConfiguredWorker();

    const customParams = { radius: 42, height: 10 };
    await openAndWaitForRender(worker, createGeometryFile('test.ts'), customParams);

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

    worker.handleOpenFile({
      renderId: previewId(3601),
      file: createGeometryFile('test.ts'),
      parameters: {},
      options: { quality: 'invalid' },
    });
    await flushMicrotasks();

    const result = await worker.runCreateGeometry('test.ts');
    expect(result.success).toBe(false);
    expect(result.issues).toEqual(expect.arrayContaining([expect.objectContaining({ severity: 'error' })]));
  });

  it('should return validated options when render options pass validation', async () => {
    const renderSchema = z.object({ quality: z.number().default(0.8) });
    const worker = createConfiguredWorker({ renderZodSchema: renderSchema });

    worker.handleOpenFile({
      renderId: previewId(3602),
      file: createGeometryFile('test.ts'),
      parameters: {},
      options: { quality: 0.5 },
    });
    await flushMicrotasks();

    const result = await worker.runCreateGeometry('test.ts');
    expect(result.success).toBe(true);
  });

  it('should pass through options when no render schema exists', async () => {
    const worker = createConfiguredWorker();

    worker.handleOpenFile({
      renderId: previewId(3603),
      file: createGeometryFile('test.ts'),
      parameters: {},
      options: { arbitrary: 'value' },
    });
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

    await openAndWaitForRender(worker);

    const result = await worker.runExportGeometry('stl', { someOption: true });
    expect(result.success).toBe(false);
    expect(result.issues[0]!.message).toContain('No export schema for format');
    expect(result.issues[0]!.message).toContain('glb');
  });

  it('should allow export without options for undeclared format (transcoder route)', async () => {
    const worker = createConfiguredWorker({
      exportZodSchemas: { glb: z.object({}) },
    });

    await openAndWaitForRender(worker);

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

  it('should expose only the settled manifest fields', async () => {
    const worker = createConfiguredWorker();

    await worker.initialize({
      callbacks: { onLog: vi.fn() },
      transferables: {},
      options: {},
    });

    const manifest = worker.capabilitiesManifest;
    expect(Object.keys(manifest).sort()).toEqual(['plugins', 'renderCapabilities', 'routes']);
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

  it('should expose renderCapabilities indexed by kernelId when render schemas are registered', async () => {
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
    expect(manifest.renderCapabilities['mock-kernel']).toEqual(
      expect.objectContaining({
        renderOptions: expect.objectContaining({
          schema: expect.any(Object),
          defaults: expect.objectContaining({
            tessellation: expect.objectContaining({
              linearTolerance: 0.1,
              angularTolerance: 15,
            }),
          }),
        }),
      }),
    );
    /* oxlint-enable @typescript-eslint/no-unsafe-assignment */
  });
});
