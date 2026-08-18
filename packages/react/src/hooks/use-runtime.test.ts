import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import type { Geometry, JSONSchema7 } from '@taucad/runtime/types';
import type {
  RuntimeClient,
  HashedGeometryResult,
  GetParametersResult,
  KernelIssue,
  RenderStatus,
} from '@taucad/runtime';
import { createRuntimeClient } from '@taucad/runtime/client';
import { defineRuntime } from '@taucad/runtime/worker';
import { inProcessTransport } from '@taucad/runtime/transport/in-process';
import { fromMemoryFs } from '@taucad/runtime/filesystem';
import { createMockRuntimeClient } from '@taucad/runtime/testing';
import { replicad } from '@taucad/runtime/kernels/replicad';
import { esbuild } from '@taucad/runtime/bundler/esbuild';
import { useRuntime } from '#hooks/use-runtime.js';
import type { UseRuntimeClientOptionsProvider, UseRuntimeOptions } from '#hooks/use-runtime.js';

vi.mock('@taucad/runtime/client', async (importOriginal) => {
  // oxlint-disable-next-line typescript/consistent-type-imports -- dynamic import required for vi.mock factory
  const original: typeof import('@taucad/runtime/client') = await importOriginal();
  return {
    ...original,
    createRuntimeClient: vi.fn(),
  };
});

const testRuntime = defineRuntime({
  kernels: [replicad()],
  bundlers: [esbuild()],
});
/* `createRuntimeClient` is mocked above so the transport never actually
 * opens — it only needs to satisfy the typed `transport` field on the
 * runtime client options. */
const stubTransport = inProcessTransport({ runtime: testRuntime, fileSystem: fromMemoryFs() });

const testClientOptions = {
  transport: stubTransport,
};

const successGeometry: Geometry = { format: 'gltf', content: new Uint8Array([1, 2, 3]), hash: 'abc123' };

const successResult: HashedGeometryResult = {
  success: true,
  data: successGeometry,
  issues: [],
};

const errorResult: HashedGeometryResult = {
  success: false,
  issues: [{ message: 'Kernel error: invalid geometry', code: 'RUNTIME', severity: 'error' }],
};

type EventHandlerMap = {
  geometry?: (result: HashedGeometryResult) => void;
  error?: (issues: KernelIssue[]) => void;
  parametersResolved?: (result: GetParametersResult) => void;
  renderStatus?: (status: RenderStatus) => void;
};

function createConfiguredMockClient(result: HashedGeometryResult = successResult): {
  client: RuntimeClient;
  handlers: EventHandlerMap;
} {
  const client = createMockRuntimeClient();
  const handlers: EventHandlerMap = {};
  const unsubscribe = vi.fn();
  vi.mocked(client.on).mockImplementation((event: string, handler: (...args: never[]) => void) => {
    switch (event) {
      case 'geometry': {
        handlers.geometry = handler as (result: HashedGeometryResult) => void;
        break;
      }
      case 'error': {
        handlers.error = handler as (issues: KernelIssue[]) => void;
        break;
      }
      case 'parametersResolved': {
        handlers.parametersResolved = handler as (result: GetParametersResult) => void;
        break;
      }
      case 'renderStatus': {
        handlers.renderStatus = handler as (status: RenderStatus) => void;
        break;
      }
      default: {
        break;
      }
    }
    return unsubscribe;
  });
  vi.mocked(client.render).mockImplementation(async () => {
    handlers.renderStatus?.('rendering');
    queueMicrotask(() => {
      handlers.geometry?.(result);
      handlers.renderStatus?.(result.success ? 'ready' : 'error');
    });
    return { superseded: false, geometry: result };
  });
  vi.mocked(client.updateParameters).mockImplementation(async () => {
    handlers.renderStatus?.('rendering');
    queueMicrotask(() => {
      handlers.geometry?.(result);
      handlers.renderStatus?.(result.success ? 'ready' : 'error');
    });
    return { superseded: false, geometry: result };
  });
  vi.mocked(createRuntimeClient).mockReturnValue(client);
  return { client, handlers };
}

type TestSourceFiles = { 'main.ts': string };
type TestSourceOptions = UseRuntimeOptions<typeof testRuntime, typeof stubTransport, TestSourceFiles>;
type TestFileOptions = UseRuntimeOptions<typeof testRuntime, typeof stubTransport>;

function defaultOptions(overrides: Partial<TestSourceOptions> = {}): TestSourceOptions {
  return {
    clientOptions: testClientOptions,
    // eslint-disable-next-line @typescript-eslint/naming-convention -- file path key
    source: { files: { 'main.ts': 'export default () => ({})' } },
    ...overrides,
  };
}

function defaultFileOptions(overrides: Partial<TestFileOptions> = {}): TestFileOptions {
  return {
    clientOptions: testClientOptions,
    source: { path: '/project/main.scad' },
    ...overrides,
  };
}

const deferred = <T>(): {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
  readonly reject: (reason: unknown) => void;
} => {
  let resolveDeferred!: (value: T) => void;
  let rejectDeferred!: (reason: unknown) => void;
  const promise = new Promise<T>((resolve, reject) => {
    resolveDeferred = resolve;
    rejectDeferred = reject;
  });
  return { promise, resolve: resolveDeferred, reject: rejectDeferred };
};

describe('useRuntime', () => {
  beforeEach(() => {
    vi.mocked(createRuntimeClient).mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── Initial state ─────────────────────────────────────────────────────────

  describe('initial state', () => {
    it('should return idle status with undefined geometry when disabled', async () => {
      createConfiguredMockClient();

      const { result } = renderHook(() => useRuntime(defaultOptions({ enabled: false })));

      expect(result.current.status).toBe('idle');
      expect(result.current.geometry).toBeUndefined();

      await waitFor(() => {
        expect(createRuntimeClient).toHaveBeenCalledOnce();
      });
    });

    it('should return undefined error and empty defaults when disabled', async () => {
      createConfiguredMockClient();

      const { result } = renderHook(() => useRuntime(defaultOptions({ enabled: false })));

      expect(result.current.error).toBeUndefined();
      expect(result.current.defaultParameters).toEqual({});
      expect(result.current.jsonSchema).toBeUndefined();

      await waitFor(() => {
        expect(createRuntimeClient).toHaveBeenCalledOnce();
      });
    });
  });

  // ── Rendering lifecycle ───────────────────────────────────────────────────

  describe('rendering lifecycle', () => {
    it('should create a RuntimeClient with the provided client options', async () => {
      createConfiguredMockClient();

      renderHook(() => useRuntime(defaultOptions({ enabled: false })));

      await waitFor(() => {
        expect(createRuntimeClient).toHaveBeenCalledWith(testClientOptions);
      });
    });

    it('should call client.render with source and initial parameters when enabled', async () => {
      const { client } = createConfiguredMockClient();
      const parameters = { width: 42 };

      renderHook(() => useRuntime(defaultOptions({ initialParameters: parameters })));

      await waitFor(() => {
        expect(client.render).toHaveBeenCalledWith(
          expect.objectContaining({
            // eslint-disable-next-line @typescript-eslint/naming-convention -- file path key in assertion
            source: { files: { 'main.ts': 'export default () => ({})' } },
            parameters,
          }),
        );
      });
    });

    it('should forward single-file inline source without synthesizing an entry path', async () => {
      const { client } = createConfiguredMockClient();

      renderHook(() => useRuntime(defaultOptions()));

      await waitFor(() => {
        expect(client.render).toHaveBeenCalledWith({
          // eslint-disable-next-line @typescript-eslint/naming-convention -- file path key in assertion
          source: { files: { 'main.ts': 'export default () => ({})' } },
        });
      });
    });

    it('should forward filesystem source without an inline file map', async () => {
      const { client } = createConfiguredMockClient();
      const parameters = { len: 200 };

      renderHook(() => useRuntime(defaultFileOptions({ initialParameters: parameters })));

      await waitFor(() => {
        expect(client.render).toHaveBeenCalledWith({
          source: { path: '/project/main.scad' },
          parameters,
        });
      });
    });

    it('should reject dynamic empty inline source maps before calling client.render', async () => {
      const { client } = createConfiguredMockClient();
      const invalidOptions = {
        ...defaultOptions(),
        source: { files: {} },
      } as unknown as TestSourceOptions;

      const { result } = renderHook(() => useRuntime(invalidOptions));

      await waitFor(() => {
        expect(result.current.status).toBe('error');
      });
      expect(result.current.error?.message).toBe('Runtime source.files must contain at least one file.');
      expect(client.render).not.toHaveBeenCalled();
    });

    it('should reject legacy controlled parameters before calling client.render', async () => {
      const { client } = createConfiguredMockClient();
      const invalidOptions = {
        ...defaultOptions(),
        parameters: { width: 20 },
      } as unknown as TestSourceOptions;

      const { result } = renderHook(() => useRuntime(invalidOptions));

      await waitFor(() => {
        expect(result.current.status).toBe('error');
      });
      expect(result.current.error?.message).toBe(
        'useRuntime parameters input was removed; use initialParameters or setParameters.',
      );
      expect(client.render).not.toHaveBeenCalled();
    });

    it('should mirror runtime renderStatus events', async () => {
      const { handlers } = createConfiguredMockClient();

      const { result } = renderHook(() => useRuntime(defaultOptions({ enabled: false })));

      await waitFor(() => {
        expect(handlers.renderStatus).toBeDefined();
      });

      act(() => {
        handlers.renderStatus?.('connecting');
      });
      expect(result.current.status).toBe('connecting');

      act(() => {
        handlers.renderStatus?.('rendering');
      });
      expect(result.current.status).toBe('rendering');
    });

    it('should transition status to ready on successful render', async () => {
      createConfiguredMockClient();

      const { result } = renderHook(() => useRuntime(defaultOptions()));

      await waitFor(() => {
        expect(result.current.status).toBe('ready');
      });
    });

    it('should return geometry from successful render result', async () => {
      createConfiguredMockClient(successResult);

      const { result } = renderHook(() => useRuntime(defaultOptions()));

      await waitFor(() => {
        expect(result.current.status).toBe('ready');
      });

      expect(result.current.geometry).toEqual(successGeometry);
      expect(result.current.error).toBeUndefined();
    });

    it('should transition status to error when geometry event reports an unsuccessful result', async () => {
      createConfiguredMockClient(errorResult);

      const { result } = renderHook(() => useRuntime(defaultOptions()));

      await waitFor(() => {
        expect(result.current.status).toBe('error');
      });
    });

    it('should set error with issue message from unsuccessful geometry event', async () => {
      createConfiguredMockClient(errorResult);

      const { result } = renderHook(() => useRuntime(defaultOptions()));

      await waitFor(() => {
        expect(result.current.status).toBe('error');
      });

      expect(result.current.error).toBeInstanceOf(Error);
      expect(result.current.error?.message).toBe('Kernel error: invalid geometry');
    });

    it('should transition status to error when client.render rejects with an exception', async () => {
      const client = createMockRuntimeClient();
      vi.mocked(client.render).mockRejectedValue(new Error('Worker crashed'));
      vi.mocked(createRuntimeClient).mockReturnValue(client);

      const { result } = renderHook(() => useRuntime(defaultOptions()));

      await waitFor(() => {
        expect(result.current.status).toBe('error');
      });
    });

    it('should set error from the rejected exception', async () => {
      const client = createMockRuntimeClient();
      vi.mocked(client.render).mockRejectedValue(new Error('Worker crashed'));
      vi.mocked(createRuntimeClient).mockReturnValue(client);

      const { result } = renderHook(() => useRuntime(defaultOptions()));

      await waitFor(() => {
        expect(result.current.status).toBe('error');
      });

      expect(result.current.error).toBeInstanceOf(Error);
      expect(result.current.error?.message).toBe('Worker crashed');
    });

    it('should use fallback message when error event has empty issues array', async () => {
      const emptyIssuesResult: HashedGeometryResult = {
        success: false,
        issues: [],
      };
      createConfiguredMockClient(emptyIssuesResult);

      const { result } = renderHook(() => useRuntime(defaultOptions()));

      await waitFor(() => {
        expect(result.current.status).toBe('error');
      });

      expect(result.current.error?.message).toBe('Render failed');
    });

    it('should wrap non-Error rejection values in an Error', async () => {
      const client = createMockRuntimeClient();
      vi.mocked(client.render).mockRejectedValue('string error');
      vi.mocked(createRuntimeClient).mockReturnValue(client);

      const { result } = renderHook(() => useRuntime(defaultOptions()));

      await waitFor(() => {
        expect(result.current.status).toBe('error');
      });

      expect(result.current.error).toBeInstanceOf(Error);
      expect(result.current.error?.message).toBe('string error');
    });

    it('should subscribe to the standalone error event so kernel issues surface independently of the geometry channel', async () => {
      const { client } = createConfiguredMockClient();

      renderHook(() => useRuntime(defaultOptions({ enabled: false })));

      await waitFor(() => {
        expect(client.on).toHaveBeenCalledWith('error', expect.any(Function));
      });
    });
  });

  // ── Parameter resolution ──────────────────────────────────────────────────

  describe('parameter resolution', () => {
    it('should subscribe to parametersResolved event on client creation', async () => {
      const { client } = createConfiguredMockClient();

      renderHook(() => useRuntime(defaultOptions({ enabled: false })));

      await waitFor(() => {
        expect(client.on).toHaveBeenCalledWith('parametersResolved', expect.any(Function));
      });
    });

    it('should expose defaultParameters when parametersResolved fires with success', async () => {
      const { handlers } = createConfiguredMockClient();

      const { result } = renderHook(() => useRuntime(defaultOptions({ enabled: false })));

      await waitFor(() => {
        expect(handlers.parametersResolved).toBeDefined();
      });

      act(() => {
        handlers.parametersResolved?.({
          success: true,
          data: {
            defaultParameters: { width: 10, height: 20 },
            jsonSchema: { type: 'object', properties: { width: { type: 'number' } } },
          },
          issues: [],
        });
      });

      expect(result.current.defaultParameters).toEqual({ width: 10, height: 20 });
    });

    it('should expose effective parameters from defaults and initial overrides', async () => {
      const { handlers } = createConfiguredMockClient();

      const { result } = renderHook(() =>
        useRuntime(defaultOptions({ enabled: false, initialParameters: { width: 12 } })),
      );

      expect(result.current.parameters).toEqual({ width: 12 });

      await waitFor(() => {
        expect(handlers.parametersResolved).toBeDefined();
      });

      act(() => {
        handlers.parametersResolved?.({
          success: true,
          data: {
            defaultParameters: { width: 10, height: 20 },
            jsonSchema: { type: 'object', properties: { width: { type: 'number' }, height: { type: 'number' } } },
          },
          issues: [],
        });
      });

      expect(result.current.parameters).toEqual({ width: 12, height: 20 });
    });

    it('should prune overrides when resolved defaults change shape', async () => {
      const { handlers } = createConfiguredMockClient();

      const { result } = renderHook(() =>
        useRuntime(defaultOptions({ enabled: false, initialParameters: { width: 12, stale: true } })),
      );

      await waitFor(() => {
        expect(handlers.parametersResolved).toBeDefined();
      });

      act(() => {
        handlers.parametersResolved?.({
          success: true,
          data: {
            defaultParameters: { width: 10 },
            jsonSchema: { type: 'object', properties: { width: { type: 'number' } } },
          },
          issues: [],
        });
      });

      expect(result.current.parameters).toEqual({ width: 12 });

      act(() => {
        handlers.parametersResolved?.({
          success: true,
          data: {
            defaultParameters: { height: 20 },
            jsonSchema: { type: 'object', properties: { height: { type: 'number' } } },
          },
          issues: [],
        });
      });

      expect(result.current.parameters).toEqual({ height: 20 });
    });

    it('should update effective parameters from full values and reset to defaults', async () => {
      const { handlers } = createConfiguredMockClient();

      const { result } = renderHook(() => useRuntime(defaultOptions({ enabled: false })));

      await waitFor(() => {
        expect(handlers.parametersResolved).toBeDefined();
      });

      act(() => {
        handlers.parametersResolved?.({
          success: true,
          data: {
            defaultParameters: { width: 10, height: 20 },
            jsonSchema: { type: 'object', properties: { width: { type: 'number' }, height: { type: 'number' } } },
          },
          issues: [],
        });
      });

      act(() => {
        result.current.setParameters({ width: 10, height: 24 });
      });

      expect(result.current.parameters).toEqual({ width: 10, height: 24 });

      act(() => {
        result.current.setParameters((current) => ({ ...current, width: 12 }));
      });

      expect(result.current.parameters).toEqual({ width: 12, height: 24 });

      act(() => {
        result.current.resetParameters();
      });

      expect(result.current.parameters).toEqual({ width: 10, height: 20 });
    });

    it('should notify parameter changes with effective values', async () => {
      const { handlers } = createConfiguredMockClient();
      const onParametersChange = vi.fn();

      const { result } = renderHook(() =>
        useRuntime(defaultOptions({ enabled: false, initialParameters: { width: 12 }, onParametersChange })),
      );

      await waitFor(() => {
        expect(handlers.parametersResolved).toBeDefined();
      });

      act(() => {
        handlers.parametersResolved?.({
          success: true,
          data: {
            defaultParameters: { width: 10, height: 20 },
            jsonSchema: { type: 'object', properties: { width: { type: 'number' }, height: { type: 'number' } } },
          },
          issues: [],
        });
      });

      await waitFor(() => {
        expect(onParametersChange).toHaveBeenLastCalledWith({ width: 12, height: 20 });
      });

      act(() => {
        result.current.setParameters({ width: 10, height: 24 });
      });

      await waitFor(() => {
        expect(onParametersChange).toHaveBeenLastCalledWith({ width: 10, height: 24 });
      });

      act(() => {
        result.current.resetParameters();
      });

      await waitFor(() => {
        expect(onParametersChange).toHaveBeenLastCalledWith({ width: 10, height: 20 });
      });
    });

    it('should expose jsonSchema when parametersResolved fires with success', async () => {
      const { handlers } = createConfiguredMockClient();

      const { result } = renderHook(() => useRuntime(defaultOptions({ enabled: false })));

      const schema: JSONSchema7 = { type: 'object', properties: { size: { type: 'number' } } };

      await waitFor(() => {
        expect(handlers.parametersResolved).toBeDefined();
      });

      act(() => {
        handlers.parametersResolved?.({
          success: true,
          data: { defaultParameters: {}, jsonSchema: schema },
          issues: [],
        });
      });

      expect(result.current.jsonSchema).toBe(schema);
    });

    it('should not update parameters state when parametersResolved fires with failure', async () => {
      const { handlers } = createConfiguredMockClient();

      const { result } = renderHook(() => useRuntime(defaultOptions({ enabled: false })));

      await waitFor(() => {
        expect(handlers.parametersResolved).toBeDefined();
      });

      act(() => {
        handlers.parametersResolved?.({
          success: false,
          issues: [{ message: 'parse error', code: 'RUNTIME', severity: 'error' }],
        });
      });

      expect(result.current.defaultParameters).toEqual({});
      expect(result.current.jsonSchema).toBeUndefined();
    });
  });

  // ── Reactive updates ──────────────────────────────────────────────────────

  describe('reactive updates', () => {
    it('should re-render when source reference changes', async () => {
      const { client } = createConfiguredMockClient();

      // eslint-disable-next-line @typescript-eslint/naming-convention -- file path key
      const source1 = { files: { 'main.ts': 'version 1' } };
      // eslint-disable-next-line @typescript-eslint/naming-convention -- file path key
      const source2 = { files: { 'main.ts': 'version 2' } };

      const { rerender } = renderHook(({ source }) => useRuntime(defaultOptions({ source })), {
        initialProps: { source: source1 },
      });

      await waitFor(() => {
        expect(client.render).toHaveBeenCalledTimes(1);
      });

      rerender({ source: source2 });

      await waitFor(() => {
        expect(client.render).toHaveBeenCalledTimes(2);
      });

      expect(client.render).toHaveBeenLastCalledWith(expect.objectContaining({ source: source2 }));
    });

    it('should update active render parameters without calling render again', async () => {
      const { client } = createConfiguredMockClient();

      const { result } = renderHook(() => useRuntime(defaultOptions({ initialParameters: { width: 10 } })));

      await waitFor(() => {
        expect(result.current.status).toBe('ready');
      });

      act(() => {
        result.current.setParameters({ width: 20 });
      });

      await waitFor(() => {
        expect(client.updateParameters).toHaveBeenCalledWith({ width: 20 });
      });
      expect(client.render).toHaveBeenCalledTimes(1);
    });

    it('should not call client.render when enabled is false', async () => {
      const { client } = createConfiguredMockClient();

      renderHook(() => useRuntime(defaultOptions({ enabled: false })));

      await waitFor(() => {
        expect(createRuntimeClient).toHaveBeenCalledOnce();
      });
      expect(client.render).not.toHaveBeenCalled();
    });

    it('should call client.render when enabled transitions from false to true', async () => {
      const { client } = createConfiguredMockClient();

      const { rerender } = renderHook(({ enabled }) => useRuntime(defaultOptions({ enabled })), {
        initialProps: { enabled: false },
      });

      expect(client.render).not.toHaveBeenCalled();

      rerender({ enabled: true });

      await waitFor(() => {
        expect(client.render).toHaveBeenCalled();
      });
    });

    it('should display latest geometry when supersession arrives via the geometry event', async () => {
      const { client, handlers } = createConfiguredMockClient();

      // Override client.render so it does NOT auto-fire `geometry` -- we control
      // settlement order manually below, mirroring real supersession.
      vi.mocked(client.render).mockResolvedValue({ superseded: true });

      // eslint-disable-next-line @typescript-eslint/naming-convention -- file path key
      const source1 = { files: { 'main.ts': 'v1' } };
      // eslint-disable-next-line @typescript-eslint/naming-convention -- file path key
      const source2 = { files: { 'main.ts': 'v2' } };

      const { result, rerender } = renderHook(({ source }) => useRuntime(defaultOptions({ source })), {
        initialProps: { source: source1 },
      });

      await waitFor(() => {
        expect(handlers.geometry).toBeDefined();
      });

      rerender({ source: source2 });

      await act(async () => {
        handlers.geometry?.(successResult);
        handlers.renderStatus?.('ready');
      });

      await waitFor(() => {
        expect(result.current.status).toBe('ready');
      });

      expect(result.current.geometry).toEqual(successGeometry);
    });
  });

  // ── Cleanup ───────────────────────────────────────────────────────────────

  describe('cleanup', () => {
    it('should terminate the client on unmount', async () => {
      const { client } = createConfiguredMockClient();

      const { unmount } = renderHook(() => useRuntime(defaultOptions({ enabled: false })));

      await waitFor(() => {
        expect(createRuntimeClient).toHaveBeenCalledOnce();
      });

      unmount();

      expect(client.terminate).toHaveBeenCalledOnce();
    });

    it('should not update state after unmount', async () => {
      const client = createMockRuntimeClient();

      let resolveOpen: ((value: { superseded: false; geometry: HashedGeometryResult }) => void) | undefined;
      vi.mocked(client.render).mockReturnValue(
        new Promise((resolve) => {
          resolveOpen = resolve;
        }),
      );
      vi.mocked(createRuntimeClient).mockReturnValue(client);

      const { result, unmount } = renderHook(() => useRuntime(defaultOptions()));

      unmount();

      await act(async () => {
        resolveOpen?.({ superseded: false, geometry: successResult });
      });

      expect(result.current.geometry).toBeUndefined();
      expect(result.current.status).not.toBe('ready');
    });

    it('should unsubscribe from every event subscription on unmount', async () => {
      const unsubscribe = vi.fn();
      const client = createMockRuntimeClient();
      vi.mocked(client.on).mockReturnValue(unsubscribe);
      vi.mocked(client.render).mockResolvedValue({ superseded: false, geometry: successResult });
      vi.mocked(createRuntimeClient).mockReturnValue(client);

      const { unmount } = renderHook(() => useRuntime(defaultOptions({ enabled: false })));

      await waitFor(() => {
        expect(client.on).toHaveBeenCalled();
      });

      // `useRuntime` subscribes to: renderStatus, parametersResolved, capabilities, geometry, error
      const subscriptionCount = vi.mocked(client.on).mock.calls.length;

      unmount();

      expect(unsubscribe).toHaveBeenCalledTimes(subscriptionCount);
    });

    it('should terminate the old client and create a new one when client options change', async () => {
      const client1 = createMockRuntimeClient();
      const client2 = createMockRuntimeClient();
      vi.mocked(client1.render).mockResolvedValue({ superseded: false, geometry: successResult });
      vi.mocked(client2.render).mockResolvedValue({ superseded: false, geometry: successResult });

      vi.mocked(createRuntimeClient).mockReturnValueOnce(client1).mockReturnValueOnce(client2);

      const runtime1 = defineRuntime({ kernels: [replicad()], bundlers: [esbuild()] });
      const runtime2 = defineRuntime({ kernels: [replicad()], bundlers: [esbuild()] });
      const options1 = { transport: inProcessTransport({ runtime: runtime1 }) };
      const options2 = { transport: inProcessTransport({ runtime: runtime2 }) };

      const { rerender } = renderHook(
        ({ clientOptions }) => useRuntime(defaultOptions({ clientOptions, enabled: false })),
        {
          initialProps: { clientOptions: options1 },
        },
      );

      await waitFor(() => {
        expect(createRuntimeClient).toHaveBeenCalledTimes(1);
      });

      rerender({ clientOptions: options2 });

      await waitFor(() => {
        expect(createRuntimeClient).toHaveBeenCalledTimes(2);
      });
      expect(client1.terminate).toHaveBeenCalledOnce();
    });
  });

  // ── Client options providers ─────────────────────────────────────────────

  describe('client options providers', () => {
    it('should resolve a synchronous client options provider before creating the runtime client', async () => {
      createConfiguredMockClient();
      const provider: UseRuntimeClientOptionsProvider<typeof testRuntime, typeof stubTransport> = () =>
        testClientOptions;

      renderHook(() => useRuntime(defaultOptions({ clientOptions: provider, enabled: false })));

      await waitFor(() => {
        expect(createRuntimeClient).toHaveBeenCalledWith(testClientOptions);
      });
    });

    it('should await an asynchronous client options provider before creating the runtime client', async () => {
      createConfiguredMockClient();
      const options = deferred<typeof testClientOptions>();
      const provider = vi.fn(async () => options.promise);

      renderHook(() => useRuntime(defaultOptions({ clientOptions: provider, enabled: false })));

      expect(provider).toHaveBeenCalledOnce();
      expect(createRuntimeClient).not.toHaveBeenCalled();

      await act(async () => {
        options.resolve(testClientOptions);
      });

      await waitFor(() => {
        expect(createRuntimeClient).toHaveBeenCalledWith(testClientOptions);
      });
    });

    it('should surface provider rejection as a hook error without creating a client', async () => {
      const provider = vi.fn(async () => {
        throw new Error('bridge unavailable');
      });

      const { result } = renderHook(() => useRuntime(defaultOptions({ clientOptions: provider })));

      await waitFor(() => {
        expect(result.current.status).toBe('error');
      });
      expect(result.current.error?.message).toBe('bridge unavailable');
      expect(createRuntimeClient).not.toHaveBeenCalled();
    });

    it('should ignore an asynchronous provider that resolves after unmount', async () => {
      createConfiguredMockClient();
      const options = deferred<typeof testClientOptions>();
      const provider = vi.fn(async () => options.promise);

      const { unmount } = renderHook(() => useRuntime(defaultOptions({ clientOptions: provider })));
      unmount();

      await act(async () => {
        options.resolve(testClientOptions);
      });

      expect(createRuntimeClient).not.toHaveBeenCalled();
    });

    it('should ignore stale provider resolution after a newer provider identity wins', async () => {
      const client = createMockRuntimeClient();
      vi.mocked(client.render).mockResolvedValue({ superseded: false, geometry: successResult });
      vi.mocked(createRuntimeClient).mockReturnValue(client);
      const staleOptions = deferred<typeof testClientOptions>();
      const freshOptions = deferred<typeof testClientOptions>();
      const staleProvider = vi.fn(async () => staleOptions.promise);
      const freshProvider = vi.fn(async () => freshOptions.promise);

      const { rerender } = renderHook(
        ({ provider }) => useRuntime(defaultOptions({ clientOptions: provider, enabled: false })),
        {
          initialProps: { provider: staleProvider },
        },
      );

      rerender({ provider: freshProvider });

      await act(async () => {
        freshOptions.resolve(testClientOptions);
        staleOptions.resolve(testClientOptions);
      });

      await waitFor(() => {
        expect(createRuntimeClient).toHaveBeenCalledTimes(1);
      });
    });

    it('should replay the current source on a newly resolved client when options identity changes', async () => {
      const client1 = createMockRuntimeClient();
      const client2 = createMockRuntimeClient();
      vi.mocked(client1.render).mockResolvedValue({ superseded: false, geometry: successResult });
      vi.mocked(client2.render).mockResolvedValue({ superseded: false, geometry: successResult });
      vi.mocked(createRuntimeClient).mockReturnValueOnce(client1).mockReturnValueOnce(client2);

      const provider1 = (): typeof testClientOptions => testClientOptions;
      const provider2 = (): typeof testClientOptions => testClientOptions;
      const { rerender } = renderHook(({ provider }) => useRuntime(defaultOptions({ clientOptions: provider })), {
        initialProps: { provider: provider1 },
      });

      await waitFor(() => {
        expect(client1.render).toHaveBeenCalledOnce();
      });

      rerender({ provider: provider2 });

      await waitFor(() => {
        expect(client2.render).toHaveBeenCalledOnce();
      });
      expect(client2.render).toHaveBeenCalledWith({
        // eslint-disable-next-line @typescript-eslint/naming-convention -- file path key in assertion
        source: { files: { 'main.ts': 'export default () => ({})' } },
      });
    });
  });

  // ── Export helpers ───────────────────────────────────────────────────────

  describe('exportGeometry', () => {
    it('should export the settled preview with nested export options', async () => {
      const { client } = createConfiguredMockClient();
      const { result } = renderHook(() => useRuntime(defaultOptions()));

      await waitFor(() => {
        expect(result.current.status).toBe('ready');
      });

      await act(async () => {
        await result.current.exportGeometry('stl', { exportOptions: { binary: true } });
      });

      expect(client.export).toHaveBeenCalledWith('stl', { exportOptions: { binary: true } });
    });

    it('should forward route-scoped content when exporting the settled preview', async () => {
      const { client } = createConfiguredMockClient();
      const { result } = renderHook(() => useRuntime(defaultOptions()));

      await waitFor(() => {
        expect(result.current.status).toBe('ready');
      });

      await act(async () => {
        await result.current.exportGeometry('glb', { content: { includeEdges: true } });
      });

      expect(client.export).toHaveBeenCalledWith('glb', { content: { includeEdges: true } });
    });

    it('should request-scope export the hook source when preview rendering is disabled', async () => {
      const { client } = createConfiguredMockClient();
      const { result } = renderHook(() => useRuntime(defaultOptions({ enabled: false })));

      await waitFor(() => {
        expect(createRuntimeClient).toHaveBeenCalledOnce();
      });

      await act(async () => {
        await result.current.exportGeometry('stl', { exportOptions: { binary: true } });
      });

      expect(client.render).not.toHaveBeenCalled();
      expect(client.export).toHaveBeenCalledWith('stl', {
        // eslint-disable-next-line @typescript-eslint/naming-convention -- file path key in assertion
        source: { files: { 'main.ts': 'export default () => ({})' } },
        exportOptions: { binary: true },
      });
    });

    it('should not leak preview content or render options into a request-scoped export', async () => {
      const { client } = createConfiguredMockClient();
      const { result } = renderHook(() =>
        useRuntime(
          defaultOptions({
            enabled: false,
            content: { includeEdges: true, includeTopology: true },
            renderOptions: { tessellation: { linearTolerance: 0.1, angularTolerance: 12 } },
          }),
        ),
      );

      await waitFor(() => {
        expect(createRuntimeClient).toHaveBeenCalledOnce();
      });

      await act(async () => {
        await result.current.exportGeometry('glb', { content: { includeEdges: false } });
      });

      expect(client.export).toHaveBeenCalledWith('glb', {
        // eslint-disable-next-line @typescript-eslint/naming-convention -- file path key in assertion
        source: { files: { 'main.ts': 'export default () => ({})' } },
        content: { includeEdges: false },
      });
    });

    it('should request-scope export the hook source when the current preview has not settled', async () => {
      const { client } = createConfiguredMockClient();
      vi.mocked(client.render).mockResolvedValue({ superseded: true });
      const { result } = renderHook(() => useRuntime(defaultOptions()));

      await waitFor(() => {
        expect(client.render).toHaveBeenCalledOnce();
      });

      await act(async () => {
        await result.current.exportGeometry('glb');
      });

      expect(client.export).toHaveBeenCalledWith('glb', {
        // eslint-disable-next-line @typescript-eslint/naming-convention -- file path key in assertion
        source: { files: { 'main.ts': 'export default () => ({})' } },
      });
    });
  });

  // ── Return value stability ────────────────────────────────────────────────

  describe('return value stability', () => {
    it('should return a stable geometry reference when geometry has not changed', async () => {
      createConfiguredMockClient();

      const { result, rerender } = renderHook(() => useRuntime(defaultOptions()));

      await waitFor(() => {
        expect(result.current.status).toBe('ready');
      });

      const firstRef = result.current.geometry;

      rerender();

      expect(result.current.geometry).toBe(firstRef);
    });
  });
});
