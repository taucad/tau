import { act, renderHook, waitFor } from '@testing-library/react';
import { createElement, StrictMode } from 'react';
import type { PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRuntimeClient } from '@taucad/runtime/client';
import { defineRuntime } from '@taucad/runtime/worker';
import { inProcessTransport } from '@taucad/runtime/transport/in-process';
import { fromMemoryFs } from '@taucad/runtime/filesystem';
import { replicad } from '@taucad/replicad';
import { esbuild } from '@taucad/esbuild';
import { compileParameterManifest } from '@taucad/parameters';
import type { CompileParameterManifestInput } from '@taucad/parameters';
import type { Description, DocumentStatus, Evaluation, Rendering, ViewStatus } from '@taucad/runtime';
import { useRuntime } from '#hooks/use-runtime.js';
import type { UseRuntimeOptions } from '#hooks/use-runtime.js';

vi.mock('@taucad/runtime/client', async (importOriginal) => {
  // oxlint-disable-next-line typescript/consistent-type-imports -- vi.mock factory needs the runtime module type.
  const original: typeof import('@taucad/runtime/client') = await importOriginal();
  return { ...original, createRuntimeClient: vi.fn() };
});

const source = { path: 'main.ts' };
const runtime = defineRuntime({ plugins: [replicad(), esbuild()] });
const transport = inProcessTransport({ runtime, fileSystem: fromMemoryFs() });
const clientOptions = { transport };
type Handlers = {
  status?: (value: DocumentStatus) => void;
  described?: (value: Description) => void;
  evaluated?: (value: Evaluation) => void;
  rendered?: (value: Rendering) => void;
  viewStatus?: (value: ViewStatus) => void;
};

const fixture = () => {
  const handlers: Handlers = {};
  const closeView = vi.fn();
  const close = vi.fn();
  const terminate = vi.fn();
  const update = vi.fn().mockResolvedValue({ superseded: true });
  const exportResult = {
    success: true,
    exportId: 'model',
    evaluationId: 'eval-1',
    files: [{ name: 'model.glb', mimeType: 'model/gltf-binary', content: new Uint8Array([1]) }],
    issues: [],
  };
  const exportModel = vi.fn().mockResolvedValue(exportResult);
  const view = vi.fn(() => ({
    on: vi.fn((event: string, handler: (value: never) => void) => {
      if (event === 'rendered') {
        handlers.rendered = handler as (value: Rendering) => void;
      }
      if (event === 'status') {
        handlers.viewStatus = handler as (value: ViewStatus) => void;
      }
      return vi.fn();
    }),
    close: closeView,
  }));
  const document = {
    id: 'mock-document',
    view,
    update,
    evaluation: vi.fn().mockResolvedValue({ superseded: true }),
    export: exportModel,
    close,
    on: vi.fn((event: keyof Handlers, handler: (value: never) => void) => {
      switch (event) {
        case 'status': {
          handlers.status = handler as (value: DocumentStatus) => void;
          break;
        }
        case 'described': {
          handlers.described = handler as (value: Description) => void;
          break;
        }
        case 'evaluated': {
          handlers.evaluated = handler as (value: Evaluation) => void;
          break;
        }
        default: {
          break;
        }
      }
      return vi.fn();
    }),
  };
  const open = vi.fn(() => document);
  vi.mocked(createRuntimeClient).mockReturnValue({
    // @ts-expect-error -- lifecycle test supplies only the document methods the hook exercises.
    open,
    terminate,
    on: vi.fn(() => vi.fn()),
  });
  return { handlers, open, view, update, closeView, close, terminate, exportModel, exportResult };
};

const renderSuccess: Rendering = {
  success: true,
  view: 'pcb',
  artifact: { mimeType: 'image/svg+xml', content: '<svg />' },
  hash: 'hash',
  requestId: 'request-1',
  evaluationId: 'eval-1',
  transient: false,
  issues: [],
};

describe('useRuntime document lifecycle', () => {
  beforeEach(() => vi.mocked(createRuntimeClient).mockReset());

  it('opens once, changes views without evaluating, and exports from the committed document', async () => {
    const mock = fixture();
    const options: UseRuntimeOptions<typeof runtime, typeof transport> = {
      clientOptions,
      source,
      view: { id: 'drawing', instance: 'front' },
    };
    const { result, rerender, unmount } = renderHook((props) => useRuntime(props), { initialProps: options });
    await waitFor(() => {
      expect(mock.open).toHaveBeenCalled();
    });
    const initialOpenCount = mock.open.mock.calls.length;
    const initialCloseCount = mock.close.mock.calls.length;
    const initialTerminateCount = mock.terminate.mock.calls.length;
    expect(mock.open).toHaveBeenCalledWith({
      source,
      parameters: {},
      watch: true,
    });
    expect(mock.view).toHaveBeenCalledWith('drawing', { instance: 'front' });
    expect(mock.update).not.toHaveBeenCalled();
    act(() => {
      mock.handlers.evaluated?.({
        success: true,
        id: 'eval-1',
        transient: false,
        views: [],
        exports: [],
        issues: [],
      });
      mock.handlers.rendered?.(renderSuccess);
    });
    expect(result.current.artifactStatus).toBe('current');
    await expect(result.current.exportModel('glb')).resolves.toEqual(mock.exportResult);
    expect(mock.exportModel).toHaveBeenCalledWith('glb', undefined);
    rerender({ ...options, view: { id: 'drawing', instance: 'rear' } });
    expect(mock.open).toHaveBeenCalledTimes(initialOpenCount);
    expect(mock.update).not.toHaveBeenCalled();
    expect(mock.closeView).toHaveBeenCalled();
    expect(result.current.artifactStatus).toBe('stale');
    unmount();
    expect(mock.close).toHaveBeenCalledTimes(initialCloseCount + 1);
    expect(mock.terminate).toHaveBeenCalledTimes(initialTerminateCount + 1);
  });

  it('retains the last artifact as stale after failure and clears it on a new successful empty model', async () => {
    const mock = fixture();
    const { result } = renderHook(() => useRuntime({ clientOptions, source }));
    await waitFor(() => {
      expect(mock.open).toHaveBeenCalled();
    });
    act(() => {
      mock.handlers.evaluated?.({
        success: true,
        id: 'eval-1',
        transient: false,
        views: [],
        exports: [],
        issues: [],
      });
      mock.handlers.rendered?.(renderSuccess);
    });
    expect(result.current.artifactStatus).toBe('current');
    act(() => {
      mock.handlers.status?.('evaluating');
      mock.handlers.evaluated?.({
        success: false,
        id: 'eval-2',
        transient: false,
        issues: [{ code: 'RUNTIME', severity: 'error', message: 'Bad model' }],
      });
    });
    expect(result.current.artifactStatus).toBe('stale');
    expect(result.current.artifactHash).toBe('hash');
    expect(result.current.error?.message).toBe('Bad model');
    act(() => {
      mock.handlers.evaluated?.({
        success: true,
        id: 'eval-3',
        transient: false,
        views: [],
        exports: [],
        issues: [],
      });
      mock.handlers.rendered?.({
        ...renderSuccess,
        evaluationId: 'eval-3',
        artifact: { mimeType: 'model/gltf-binary', content: new Uint8Array() },
      });
    });
    expect(result.current.artifact?.content).toEqual(new Uint8Array());
    expect(result.current.artifactHash).toBe('hash');
    expect(result.current.artifactStatus).toBe('current');
    expect(result.current.error).toBeUndefined();
  });

  it('closes the previous document when the source changes or the hook is disabled', async () => {
    const first = fixture();
    const initial = { clientOptions, source, enabled: true };
    const { rerender, result } = renderHook((props) => useRuntime(props), { initialProps: initial });
    await waitFor(() => {
      expect(first.open).toHaveBeenCalled();
    });
    act(() => {
      first.handlers.evaluated?.({ success: true, id: 'eval-1', transient: false, views: [], exports: [], issues: [] });
      first.handlers.rendered?.(renderSuccess);
    });
    expect(result.current.artifactStatus).toBe('current');
    const initialOpenCount = first.open.mock.calls.length;
    const initialCloseCount = first.close.mock.calls.length;
    rerender({ ...initial, source: { path: 'other.ts' } });
    expect(first.close).toHaveBeenCalledTimes(initialCloseCount + 1);
    expect(first.open).toHaveBeenCalledTimes(initialOpenCount + 1);
    expect(result.current.artifact).toEqual(renderSuccess.artifact);
    expect(result.current.artifactHash).toBe(renderSuccess.hash);
    expect(result.current.artifactStatus).toBe('stale');
    rerender({ ...initial, enabled: false });
    expect(first.close).toHaveBeenCalledTimes(initialCloseCount + 2);
  });

  it('reports a view timeout while retaining the previous artifact', async () => {
    const mock = fixture();
    const { result } = renderHook(() => useRuntime({ clientOptions, source }));
    await waitFor(() => {
      expect(mock.open).toHaveBeenCalled();
    });
    act(() => {
      mock.handlers.evaluated?.({ success: true, id: 'eval-1', transient: false, views: [], exports: [], issues: [] });
      mock.handlers.rendered?.(renderSuccess);
      mock.handlers.viewStatus?.('error');
    });
    expect(result.current.artifact).toEqual(renderSuccess.artifact);
    expect(result.current.artifactStatus).toBe('stale');
    expect(result.current.status).toBe('error');
    expect(result.current.error?.message).toBe('View rendering failed');
  });

  it('keeps initial edits over discovered defaults and resets to those defaults', async () => {
    const mock = fixture();
    const onParametersChange = vi.fn();
    const { result } = renderHook(() =>
      useRuntime({
        clientOptions,
        source,
        initialParameters: { size: 20 },
        onParametersChange,
      }),
    );
    await waitFor(() => {
      expect(mock.open).toHaveBeenCalled();
    });
    const initialOpenCount = mock.open.mock.calls.length;
    const manifest = await compileParameterManifest({
      declaration: {
        schema: {
          $schema: 'https://json-structure.org/meta/extended/v0/#',
          $id: 'urn:taucad:test:react-parameters',
          $uses: ['JSONSchemaUnits'],
          name: 'ReactParameters',
          type: 'object',
          properties: { size: { type: 'number' } },
        },
        defaults: { size: 10 },
      },
      scope: { kind: 'source', authority: 'test', root: '', entry: 'main.ts' },
      source: { id: 'test', version: '1', revision: 'react-parameters', capability: 'json-structure' },
      dependency: `sha256:${'1'.repeat(64)}` as CompileParameterManifestInput['dependency'],
      middleware: `sha256:${'2'.repeat(64)}` as CompileParameterManifestInput['middleware'],
    });
    act(() => {
      mock.handlers.described?.({ success: true, parameters: manifest, kernelId: 'replicad', issues: [] });
    });
    expect(result.current.defaultParameters).toEqual({ size: 10 });
    expect(result.current.parameters).toEqual({ size: 20 });
    act(() => {
      result.current.setParameters({ size: 30 });
    });
    expect(result.current.parameters).toEqual({ size: 30 });
    act(() => {
      result.current.resetParameters();
    });
    expect(result.current.parameters).toEqual({ size: 10 });
    expect(onParametersChange).toHaveBeenLastCalledWith({ size: 10 });
    expect(mock.open).toHaveBeenCalledTimes(initialOpenCount);
    expect(mock.update).toHaveBeenCalled();
  });

  it('ignores a provider that resolves after replacement', async () => {
    const mock = fixture();
    let resolveFirst: ((options: typeof clientOptions) => void) | undefined;
    const first = async (): Promise<typeof clientOptions> =>
      new Promise((resolve) => {
        resolveFirst = resolve;
      });
    const second = async (): Promise<typeof clientOptions> => clientOptions;
    const { rerender, unmount } = renderHook(
      ({ provider }: { provider: () => Promise<typeof clientOptions> }) =>
        useRuntime({ clientOptions: provider, source }),
      { initialProps: { provider: first } },
    );
    rerender({ provider: second });
    resolveFirst?.(clientOptions);
    await waitFor(() => {
      expect(mock.open).toHaveBeenCalled();
    });
    expect(createRuntimeClient).toHaveBeenCalledOnce();
    unmount();
    expect(mock.terminate).toHaveBeenCalledOnce();
  });

  it('closes every StrictMode document and client on unmount', async () => {
    const mock = fixture();
    const wrapper = ({ children }: PropsWithChildren): ReturnType<typeof createElement> =>
      createElement(StrictMode, undefined, children);
    const { unmount } = renderHook(() => useRuntime({ clientOptions, source }), { wrapper });
    await waitFor(() => {
      expect(mock.open).toHaveBeenCalled();
    });
    unmount();
    expect(mock.close).toHaveBeenCalledTimes(mock.open.mock.calls.length);
    expect(mock.terminate).toHaveBeenCalledTimes(vi.mocked(createRuntimeClient).mock.calls.length);
  });
});
