import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import type { Geometry } from '@taucad/types';
import type { RuntimeClient, HashedGeometryResult, GetParametersResult, KernelIssue } from '@taucad/runtime';
import { createRuntimeClient } from '@taucad/runtime/client';
import { defineRuntime } from '@taucad/runtime/worker';
import { inProcessTransport } from '@taucad/runtime/transport/in-process';
import { fromMemoryFs } from '@taucad/runtime/filesystem';
import { createMockRuntimeClient } from '@taucad/runtime/testing';
import { replicad } from '@taucad/runtime/kernels/replicad';
import { esbuild } from '@taucad/runtime/bundler/esbuild';
import { useRuntime } from '#hooks/use-runtime.js';
import type { UseRuntimeOptions } from '#hooks/use-runtime.js';

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

const successGeometries: Geometry[] = [{ format: 'gltf', content: new Uint8Array([1, 2, 3]), hash: 'abc123' }];

const successResult: HashedGeometryResult = {
  success: true,
  data: successGeometries,
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
      default: {
        break;
      }
    }
    return unsubscribe;
  });
  vi.mocked(client.openFile).mockImplementation(async () => {
    queueMicrotask(() => handlers.geometry?.(result));
    return { superseded: false, geometry: result };
  });
  vi.mocked(createRuntimeClient).mockReturnValue(client);
  return { client, handlers };
}

function defaultOptions(overrides: Partial<UseRuntimeOptions> = {}): UseRuntimeOptions {
  return {
    clientOptions: testClientOptions,
    // eslint-disable-next-line @typescript-eslint/naming-convention -- file path key
    code: { 'main.ts': 'export default () => ({})' },
    ...overrides,
  };
}

describe('useRuntime', () => {
  beforeEach(() => {
    vi.mocked(createRuntimeClient).mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── Initial state ─────────────────────────────────────────────────────────

  describe('initial state', () => {
    it('should return idle status with empty geometries when disabled', () => {
      createConfiguredMockClient();

      const { result } = renderHook(() => useRuntime(defaultOptions({ enabled: false })));

      expect(result.current.status).toBe('idle');
      expect(result.current.geometries).toEqual([]);
    });

    it('should return undefined error and empty defaults when disabled', () => {
      createConfiguredMockClient();

      const { result } = renderHook(() => useRuntime(defaultOptions({ enabled: false })));

      expect(result.current.error).toBeUndefined();
      expect(result.current.defaultParameters).toEqual({});
      expect(result.current.jsonSchema).toBeUndefined();
    });
  });

  // ── Rendering lifecycle ───────────────────────────────────────────────────

  describe('rendering lifecycle', () => {
    it('should create a RuntimeClient with the provided client options', () => {
      createConfiguredMockClient();

      renderHook(() => useRuntime(defaultOptions({ enabled: false })));

      expect(createRuntimeClient).toHaveBeenCalledWith(testClientOptions);
    });

    it('should call client.openFile with code and parameters when enabled', async () => {
      const { client } = createConfiguredMockClient();
      const parameters = { width: 42 };

      renderHook(() => useRuntime(defaultOptions({ parameters })));

      await waitFor(() => {
        expect(client.openFile).toHaveBeenCalledWith(
          expect.objectContaining({
            // eslint-disable-next-line @typescript-eslint/naming-convention -- file path key in assertion
            code: { 'main.ts': 'export default () => ({})' },
            parameters,
          }),
        );
      });
    });

    it('should transition status to loading then success on successful render', async () => {
      createConfiguredMockClient();

      const { result } = renderHook(() => useRuntime(defaultOptions()));

      await waitFor(() => {
        expect(result.current.status).toBe('success');
      });
    });

    it('should return geometries from successful render result', async () => {
      createConfiguredMockClient(successResult);

      const { result } = renderHook(() => useRuntime(defaultOptions()));

      await waitFor(() => {
        expect(result.current.status).toBe('success');
      });

      expect(result.current.geometries).toEqual(successGeometries);
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

    it('should transition status to error when openFile rejects with an exception', async () => {
      const client = createMockRuntimeClient();
      vi.mocked(client.openFile).mockRejectedValue(new Error('Worker crashed'));
      vi.mocked(createRuntimeClient).mockReturnValue(client);

      const { result } = renderHook(() => useRuntime(defaultOptions()));

      await waitFor(() => {
        expect(result.current.status).toBe('error');
      });
    });

    it('should set error from the rejected exception', async () => {
      const client = createMockRuntimeClient();
      vi.mocked(client.openFile).mockRejectedValue(new Error('Worker crashed'));
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
      vi.mocked(client.openFile).mockRejectedValue('string error');
      vi.mocked(createRuntimeClient).mockReturnValue(client);

      const { result } = renderHook(() => useRuntime(defaultOptions()));

      await waitFor(() => {
        expect(result.current.status).toBe('error');
      });

      expect(result.current.error).toBeInstanceOf(Error);
      expect(result.current.error?.message).toBe('string error');
    });

    it('should subscribe to the standalone error event so kernel issues surface independently of the geometry channel', () => {
      const { client } = createConfiguredMockClient();

      renderHook(() => useRuntime(defaultOptions({ enabled: false })));

      expect(client.on).toHaveBeenCalledWith('error', expect.any(Function));
    });
  });

  // ── Parameter resolution ──────────────────────────────────────────────────

  describe('parameter resolution', () => {
    it('should subscribe to parametersResolved event on client creation', () => {
      const { client } = createConfiguredMockClient();

      renderHook(() => useRuntime(defaultOptions({ enabled: false })));

      expect(client.on).toHaveBeenCalledWith('parametersResolved', expect.any(Function));
    });

    it('should expose defaultParameters when parametersResolved fires with success', async () => {
      const { handlers } = createConfiguredMockClient();

      const { result } = renderHook(() => useRuntime(defaultOptions({ enabled: false })));

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

    it('should expose jsonSchema when parametersResolved fires with success', async () => {
      const { handlers } = createConfiguredMockClient();

      const { result } = renderHook(() => useRuntime(defaultOptions({ enabled: false })));

      const schema = { type: 'object', properties: { size: { type: 'number' } } };

      act(() => {
        handlers.parametersResolved?.({
          success: true,
          data: { defaultParameters: {}, jsonSchema: schema },
          issues: [],
        });
      });

      expect(result.current.jsonSchema).toEqual(schema);
    });

    it('should not update parameters state when parametersResolved fires with failure', async () => {
      const { handlers } = createConfiguredMockClient();

      const { result } = renderHook(() => useRuntime(defaultOptions({ enabled: false })));

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
    it('should re-render when code reference changes', async () => {
      const { client } = createConfiguredMockClient();

      // eslint-disable-next-line @typescript-eslint/naming-convention -- file path key
      const code1 = { 'main.ts': 'version 1' };
      // eslint-disable-next-line @typescript-eslint/naming-convention -- file path key
      const code2 = { 'main.ts': 'version 2' };

      const { rerender } = renderHook(({ code }) => useRuntime(defaultOptions({ code })), {
        initialProps: { code: code1 },
      });

      await waitFor(() => {
        expect(client.openFile).toHaveBeenCalledTimes(1);
      });

      rerender({ code: code2 });

      await waitFor(() => {
        expect(client.openFile).toHaveBeenCalledTimes(2);
      });

      expect(client.openFile).toHaveBeenLastCalledWith(expect.objectContaining({ code: code2 }));
    });

    it('should re-render when parameters reference changes', async () => {
      const { client } = createConfiguredMockClient();

      const params1 = { width: 10 };
      const params2 = { width: 20 };

      const { result, rerender } = renderHook(({ parameters }) => useRuntime(defaultOptions({ parameters })), {
        initialProps: { parameters: params1 },
      });

      await waitFor(() => {
        expect(result.current.status).toBe('success');
      });

      rerender({ parameters: params2 });

      await waitFor(() => {
        expect(client.openFile).toHaveBeenLastCalledWith(expect.objectContaining({ parameters: params2 }));
      });
    });

    it('should not call client.openFile when enabled is false', () => {
      const { client } = createConfiguredMockClient();

      renderHook(() => useRuntime(defaultOptions({ enabled: false })));

      expect(client.openFile).not.toHaveBeenCalled();
    });

    it('should call client.openFile when enabled transitions from false to true', async () => {
      const { client } = createConfiguredMockClient();

      const { rerender } = renderHook(({ enabled }) => useRuntime(defaultOptions({ enabled })), {
        initialProps: { enabled: false },
      });

      expect(client.openFile).not.toHaveBeenCalled();

      rerender({ enabled: true });

      await waitFor(() => {
        expect(client.openFile).toHaveBeenCalled();
      });
    });

    it('should display latest geometry when supersession arrives via the geometry event', async () => {
      const { client, handlers } = createConfiguredMockClient();

      // Override openFile so it does NOT auto-fire `geometry` -- we control
      // settlement order manually below, mirroring real supersession.
      vi.mocked(client.openFile).mockResolvedValue({ superseded: true });

      // eslint-disable-next-line @typescript-eslint/naming-convention -- file path key
      const code1 = { 'main.ts': 'v1' };
      // eslint-disable-next-line @typescript-eslint/naming-convention -- file path key
      const code2 = { 'main.ts': 'v2' };

      const { result, rerender } = renderHook(({ code }) => useRuntime(defaultOptions({ code })), {
        initialProps: { code: code1 },
      });

      rerender({ code: code2 });

      await act(async () => {
        handlers.geometry?.(successResult);
      });

      await waitFor(() => {
        expect(result.current.status).toBe('success');
      });

      expect(result.current.geometries).toEqual(successGeometries);
    });
  });

  // ── Cleanup ───────────────────────────────────────────────────────────────

  describe('cleanup', () => {
    it('should terminate the client on unmount', () => {
      const { client } = createConfiguredMockClient();

      const { unmount } = renderHook(() => useRuntime(defaultOptions({ enabled: false })));

      unmount();

      expect(client.terminate).toHaveBeenCalledOnce();
    });

    it('should not update state after unmount', async () => {
      const client = createMockRuntimeClient();

      let resolveOpen: ((value: { superseded: false; geometry: HashedGeometryResult }) => void) | undefined;
      vi.mocked(client.openFile).mockReturnValue(
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

      expect(result.current.geometries).toEqual([]);
      expect(result.current.status).not.toBe('success');
    });

    it('should unsubscribe from every event subscription on unmount', () => {
      const unsubscribe = vi.fn();
      const client = createMockRuntimeClient();
      vi.mocked(client.on).mockReturnValue(unsubscribe);
      vi.mocked(client.openFile).mockResolvedValue({ superseded: false, geometry: successResult });
      vi.mocked(createRuntimeClient).mockReturnValue(client);

      const { unmount } = renderHook(() => useRuntime(defaultOptions({ enabled: false })));

      // `useRuntime` subscribes to: parametersResolved, capabilities, geometry, error
      const subscriptionCount = vi.mocked(client.on).mock.calls.length;

      unmount();

      expect(unsubscribe).toHaveBeenCalledTimes(subscriptionCount);
    });

    it('should terminate the old client and create a new one when client options change', () => {
      const client1 = createMockRuntimeClient();
      const client2 = createMockRuntimeClient();
      vi.mocked(client1.openFile).mockResolvedValue({ superseded: false, geometry: successResult });
      vi.mocked(client2.openFile).mockResolvedValue({ superseded: false, geometry: successResult });

      vi.mocked(createRuntimeClient).mockReturnValueOnce(client1).mockReturnValueOnce(client2);

      const runtime1 = defineRuntime({ kernels: [replicad()] });
      const runtime2 = defineRuntime({ kernels: [replicad()] });
      const options1 = { transport: inProcessTransport({ runtime: runtime1 }) };
      const options2 = { transport: inProcessTransport({ runtime: runtime2 }) };

      const { rerender } = renderHook(
        ({ clientOptions }) => useRuntime(defaultOptions({ clientOptions, enabled: false })),
        {
          initialProps: { clientOptions: options1 },
        },
      );

      rerender({ clientOptions: options2 });

      expect(client1.terminate).toHaveBeenCalledOnce();
      expect(createRuntimeClient).toHaveBeenCalledTimes(2);
    });
  });

  // ── Return value stability ────────────────────────────────────────────────

  describe('return value stability', () => {
    it('should return a stable geometries reference when geometries have not changed', async () => {
      createConfiguredMockClient();

      const { result, rerender } = renderHook(() => useRuntime(defaultOptions()));

      await waitFor(() => {
        expect(result.current.status).toBe('success');
      });

      const firstRef = result.current.geometries;

      rerender();

      expect(result.current.geometries).toBe(firstRef);
    });
  });
});
