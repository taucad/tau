// @vitest-environment node
import * as cache from '@taucad/cache-core';
import { FileNotFoundError } from '@taucad/fs-client/file-content-errors';
import { createFileSystemBridgePort } from '@taucad/fs-bridge';
import type { FileSystemBridgeRuntimeService } from '@taucad/fs-bridge';
import { FileContentService } from '@taucad/fs-client/file-content-service';
import type { ContentChangeEvent } from '@taucad/fs-client/file-content-service';
import type { ComposedViewClient } from '@taucad/fs-client/composed-view-client';
import { WorkerChangeChannel } from '@taucad/fs-client/worker-change-channel';
import type { WorkerChangeChannelTransport } from '@taucad/fs-client/worker-change-channel';
import { WorkspacePathResolver } from '@taucad/fs-client/workspace-path-resolver';
import { RefreshGenerationGuard } from '@taucad/fs-client/refresh-generation-guard';
import type * as RuntimeFileSystem from '@taucad/runtime/filesystem';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { createActor, setup, waitFor } from 'xstate';
import type { AnyRuntimeDefinition, Evaluation, KernelIssue, Rendering, RuntimeContentInput } from '@taucad/runtime';
import { createRuntimeClient, defineRuntime } from '@taucad/runtime';
import { defineKernel, createKernelSuccess } from '@taucad/runtime/kernel';
import { inProcessTransport } from '@taucad/runtime/transport/in-process';
import { fromMemoryFs } from '@taucad/runtime/filesystem';
import { gltfEdgeDetection } from '@taucad/middleware';
import { writeGlb } from '@taucad/geometry-core';
import { z } from 'zod';
import { createMockRuntimeClient, createMockRuntimeDocument } from '@taucad/runtime-testing';
import { defaultOperationTimeout } from '#constants/editor.constants.js';
import { fromSafeAsync } from '#lib/xstate.lib.js';
import {
  cadMachine,
  disposeCadRuntime,
  selectCadFailureIssues,
  selectCadCommittedRendering,
  selectCadHasTransientPreview,
} from '#machines/cad.machine.js';
import type { CadContext } from '#machines/cad.machine.js';
import type {
  AppRuntimeClient,
  KernelOptionsFactory,
  LazyKernelOptionsFactory,
  PageKernelOptionsFactory,
} from '#types/runtime-client.alias.js';

const kernelOptionsFactory: LazyKernelOptionsFactory = async () => () =>
  mock<ReturnType<KernelOptionsFactory>>({
    config: { tauApiUrl: 'https://api.test', tauWebSocketUrl: 'wss://api.test' },
  });

const kernelBridgeOpens = vi.hoisted(
  () => new Array<Parameters<(typeof RuntimeFileSystem)['fromFileSystemBridge']>[0]>(),
);
vi.mock('@taucad/runtime/filesystem', async (importOriginal) => {
  const original = await importOriginal<typeof RuntimeFileSystem>();
  return {
    ...original,
    fromFileSystemBridge: (open: Parameters<(typeof RuntimeFileSystem)['fromFileSystemBridge']>[0]) => {
      kernelBridgeOpens.push(open);
      return original.fromFileSystemBridge(open);
    },
  };
});
const createMockAppRuntimeClient = () => ({
  ...createMockRuntimeClient(),
  openAssembly: vi.fn<AppRuntimeClient['openAssembly']>(),
  publishAssembly: vi.fn<AppRuntimeClient['publishAssembly']>(),
});
const openContentWatch = () => ({
  ready: Promise.resolve(),
  closed: Promise.withResolvers<void>().promise,
  dispose: vi.fn(),
});
const createKernelOptionsFactory = (): LazyKernelOptionsFactory => kernelOptionsFactory;

function fixture(options: { fileManagerRef?: CadContext['fileManagerRef']; fileSystemRoot?: string } = {}) {
  const client = createMockRuntimeClient();
  const runtime = createMockRuntimeDocument();
  vi.mocked(client.open).mockReturnValue(runtime.document);
  const cleanup = vi.fn();
  const connectWork = async (): Promise<{
    type: 'kernelConnected';
    client: AppRuntimeClient;
    cleanups: Array<() => void>;
  }> => ({ type: 'kernelConnected', client, cleanups: [cleanup] });
  const actor = createActor(
    cadMachine.provide({
      actors: {
        connectKernelActor: fromSafeAsync(connectWork),
      },
    }),
    {
      input: {
        shouldInitializeKernelOnStart: false,
        fileSystemRoot: options.fileSystemRoot ?? '/projects/test',
        fileManagerRef: options.fileManagerRef,
        kernelOptionsFactory,
      },
    },
  );
  actor.start();
  return { client, runtime, cleanup, actor };
}

async function connected(f: ReturnType<typeof fixture>) {
  await waitFor(f.actor, (snapshot) => snapshot.value === 'idle');
  return f;
}

async function opened(f: ReturnType<typeof fixture>, entryPath = 'main.ts') {
  await connected(f);
  f.actor.send({ type: 'initializeModel', entryPath });
  await vi.waitFor(() => {
    expect(f.client.open).toHaveBeenCalledOnce();
  });
  await waitFor(f.actor, (snapshot) => snapshot.context.document === f.runtime.document);
  return f;
}

const failure: Rendering = {
  success: false,
  requestId: 'failed-view',
  evaluationId: 'eval-2',
  transient: false,
  view: 'model',
  issues: [{ code: 'RUNTIME', type: 'runtime', severity: 'error', message: 'projection failed' }],
};

const noViews: Evaluation = {
  success: true,
  id: 'empty-evaluation',
  transient: false,
  views: [],
  exports: [],
  issues: [],
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('cadMachine watched document', () => {
  it('opens one watched source and subscribes the default view', async () => {
    const f = await opened(fixture());
    expect(f.client.open).toHaveBeenCalledWith({
      source: { path: 'main.ts' },
      watch: true,
    });
    expect(f.runtime.viewSpy).toHaveBeenLastCalledWith('model', {});
    expect(f.actor.getSnapshot().context.defaultView).toBe(f.runtime.view);
    f.actor.stop();
  });

  it('follows changing default offers and closes an export-only projection', async () => {
    const f = await opened(fixture());
    const initialCalls = f.runtime.viewSpy.mock.calls.length;
    f.runtime.emitEvaluated({
      ...f.runtime.evaluation,
      id: 'same-offer-next-evaluation',
    });
    expect(f.runtime.viewSpy).toHaveBeenCalledTimes(initialCalls);
    f.runtime.emitEvaluated({
      ...noViews,
      views: [{ id: 'drawing', title: 'Drawing', mimeType: 'image/svg+xml' }],
    });
    expect(f.runtime.viewSpy).toHaveBeenLastCalledWith('drawing', {});
    f.runtime.emitEvaluated(noViews);
    expect(f.actor.getSnapshot().context.defaultView).toBeUndefined();
    f.runtime.emitEvaluated(f.runtime.evaluation);
    expect(f.runtime.viewSpy).toHaveBeenLastCalledWith('model', {});
    expect(f.actor.getSnapshot().context.defaultView).toBe(f.runtime.view);
    f.actor.stop();
  });

  it.each(['native', 'middleware'] as const)(
    'requests %s GLB edges through the actual CAD subscription',
    async (provider) => {
      const kernel = defineKernel({
        id: 'interactive-edges',
        name: 'Interactive edges',
        version: '1.0.0',
        extensions: ['edges'],
        views: {
          model: {
            title: 'Model',
            mimeType: 'model/gltf-binary',
            ...(provider === 'native' ? { content: ['includeEdges'] as const } : {}),
          },
        },
        exports: {},
        async initialize() {
          return {};
        },
        async resolve({ entryPath }) {
          return { resolved: [entryPath], unresolved: [] };
        },
        async describe() {
          return createKernelSuccess({
            parameters: {
              schema: {
                $schema: 'https://json-structure.org/meta/extended/v0/#',
                $id: 'urn:taucad:test:interactive-edges',
                $uses: ['JSONSchemaUnits'],
                name: 'InteractiveEdgesParameters',
                type: 'object',
              },
              defaults: {},
            },
          });
        },
        async evaluate() {
          return { handle: {}, views: ['model'] };
        },
        async render({ content }: { handle: Record<string, unknown>; content?: RuntimeContentInput }) {
          return {
            content: writeGlb({
              nodes: [
                {
                  primitives: [
                    {
                      mode: 4,
                      positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
                      material: {},
                    },
                    ...(content?.includeEdges
                      ? [
                          {
                            mode: 1,
                            positions: new Float32Array([0, 0, 0, 1, 0, 0]),
                            material: {},
                          },
                        ]
                      : []),
                  ],
                },
              ],
            }),
          };
        },
      })();
      const runtime: AnyRuntimeDefinition = defineRuntime({
        kernels: [kernel],
        middleware: provider === 'middleware' ? [gltfEdgeDetection()] : [],
      });
      const client = createRuntimeClient({
        transport: inProcessTransport({
          runtime,
          fileSystem: fromMemoryFs({ 'main.edges': '' }),
        }),
      });
      const actor = createActor(
        cadMachine.provide({
          actors: {
            connectKernelActor: fromSafeAsync(
              async (): Promise<{
                type: 'kernelConnected';
                client: AppRuntimeClient;
                cleanups: Array<() => void>;
              }> => {
                await client.connect();
                return { type: 'kernelConnected', client, cleanups: [] };
              },
            ),
          },
        }),
        {
          input: {
            shouldInitializeKernelOnStart: false,
            fileSystemRoot: '',
            kernelOptionsFactory,
            operationTimeout: 0,
          },
        },
      );
      actor.start();
      try {
        await waitFor(actor, (snapshot) => snapshot.value === 'idle');
        actor.send({ type: 'initializeModel', entryPath: 'main.edges' });
        const snapshot = await waitFor(
          actor,
          (state) =>
            state.context.rendering?.success === true &&
            state.context.defaultView?.request.content?.includeEdges === true,
        );
        const { rendering } = snapshot.context;
        if (!rendering?.success || rendering.artifact.mimeType !== 'model/gltf-binary') {
          throw new Error('Expected an edge-enabled GLB rendering');
        }
        const bytes = rendering.artifact.content;
        if (typeof bytes === 'string') {
          throw new TypeError('Expected binary GLB');
        }
        const jsonLength = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(12, true);
        const json = z
          .object({ meshes: z.array(z.object({ primitives: z.array(z.object({ mode: z.number().optional() })) })) })
          .parse(JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength))));
        expect(json.meshes.some((mesh) => mesh.primitives.some((primitive) => primitive.mode === 1))).toBe(true);
      } finally {
        disposeCadRuntime(actor.getSnapshot().context);
        actor.stop();
      }
    },
  );

  it('commits preview parameters on the existing document', async () => {
    const f = await opened(fixture());
    f.actor.send({ type: 'setPreviewParameters', parameters: { width: 42 } });
    await vi.waitFor(() => {
      expect(f.runtime.document.update).toHaveBeenCalledWith({
        parameters: { width: 42 },
      });
    });
    expect(f.client.open).toHaveBeenCalledOnce();
    f.actor.stop();
  });

  it('sends drag parameters transiently and keeps staged commit bytes separate', async () => {
    const f = await opened(fixture());
    f.actor.send({ type: 'scrubParameters', parameters: { width: 20 } });
    await vi.waitFor(() => {
      expect(f.runtime.document.update).toHaveBeenCalledWith({ parameters: { width: 20 }, transient: true });
    });
    const stage = { 'main.params.json': new Uint8Array([1]) };
    f.actor.send({ type: 'commitParameters', stage });
    await vi.waitFor(() => {
      expect(f.runtime.document.update).toHaveBeenCalledWith({ stage });
    });
    expect(f.client.open).toHaveBeenCalledOnce();
    f.actor.stop();
  });

  it('should retain committed inspection facts during transient rendering and replace them only on commit', async () => {
    const f = await opened(fixture());
    const committed = f.runtime.rendering;
    if (!committed.success) {
      throw new Error('Expected successful committed rendering');
    }
    const preview: Rendering = { ...committed, requestId: 'preview', transient: true };
    const next: Rendering = { ...committed, requestId: 'next-commit' };
    try {
      f.runtime.emitRendered(committed);
      expect(selectCadCommittedRendering(f.actor.getSnapshot())).toBe(committed);
      f.runtime.emitRendered(preview);
      expect(f.actor.getSnapshot().context.rendering).toBe(preview);
      expect(selectCadCommittedRendering(f.actor.getSnapshot())).toBe(committed);
      expect(selectCadHasTransientPreview(f.actor.getSnapshot())).toBe(true);
      f.runtime.emitRendered(failure);
      expect(selectCadCommittedRendering(f.actor.getSnapshot())).toBe(committed);
      f.runtime.emitRendered(next);
      expect(selectCadCommittedRendering(f.actor.getSnapshot())).toBe(next);
      expect(selectCadHasTransientPreview(f.actor.getSnapshot())).toBe(false);
      f.runtime.emitEvaluated(noViews);
      expect(selectCadCommittedRendering(f.actor.getSnapshot())).toBeUndefined();
    } finally {
      disposeCadRuntime(f.actor.getSnapshot().context);
      f.actor.stop();
    }
  });

  it('keeps the last successful rendering and its source revision after a failed view', async () => {
    const f = await opened(fixture());
    const sourceRevision: NonNullable<Rendering['sourceRevision']> = {
      entry: 'main.ts',
      files: { 'main.ts': 'missing' },
    };
    const good: Rendering = { ...f.runtime.rendering, sourceRevision };
    f.runtime.emitRendered(good);
    expect(f.actor.getSnapshot().context.rendering).toBe(good);
    f.runtime.emitRendered(failure);
    expect(f.actor.getSnapshot().context.rendering).toBe(good);
    expect(selectCadFailureIssues(f.actor.getSnapshot())?.[0]?.message).toBe('projection failed');
    f.actor.stop();
  });

  it('clears a retained image only after a successful empty evaluation', async () => {
    const f = await opened(fixture());
    f.runtime.emitRendered(f.runtime.rendering);
    f.runtime.emitEvaluated({ ...noViews, success: false, issues: failure.issues });
    expect(f.actor.getSnapshot().context.rendering).toBe(f.runtime.rendering);
    f.runtime.emitEvaluated(noViews);
    expect(f.actor.getSnapshot().context.rendering).toBeUndefined();
    expect(f.actor.getSnapshot().context.evaluation).toBe(noViews);
    f.actor.stop();
  });

  it('keeps an export-only success after the automatic default reports VIEW_UNAVAILABLE', async () => {
    const f = await opened(fixture());
    f.runtime.emitRendered(f.runtime.rendering);
    f.runtime.emitEvaluated(noViews);
    f.runtime.emitRendered({
      ...failure,
      evaluationId: noViews.id,
      issues: [{ code: 'VIEW_UNAVAILABLE', type: 'runtime', severity: 'error', message: 'No default view is offered' }],
    });
    f.runtime.emitViewStatus('error');

    const snapshot = f.actor.getSnapshot();
    expect(snapshot.matches('error')).toBe(false);
    expect(snapshot.context.evaluation).toBe(noViews);
    expect(snapshot.context.rendering).toBeUndefined();
    expect(snapshot.context.latestRenderingOutcome).toBe('success');
    expect(snapshot.context.kernelIssues.get('main.ts')).toBeUndefined();
    f.actor.stop();
  });

  it('records evaluated diagnostics with no visible projection', async () => {
    const f = await opened(fixture());
    const diagnostic: Evaluation = {
      ...noViews,
      issues: [{ code: 'RUNTIME', type: 'runtime', severity: 'warning', message: 'source warning' }],
    };
    f.runtime.emitEvaluated(diagnostic);
    expect(f.actor.getSnapshot().context.evaluation).toBe(diagnostic);
    expect(f.actor.getSnapshot().context.kernelIssues.get('main.ts')?.[0]?.message).toBe('source warning');
    f.actor.stop();
  });

  it('keeps evaluation diagnostics after a successful default rendering', async () => {
    const f = await opened(fixture());
    const diagnostic: KernelIssue = {
      code: 'RUNTIME',
      type: 'runtime',
      severity: 'warning',
      message: 'source warning',
    };
    const { evaluation, rendering } = f.runtime;
    if (!evaluation.success || !rendering.success) {
      throw new Error('Expected successful runtime fixtures');
    }
    f.runtime.emitEvaluated({ ...evaluation, issues: [diagnostic] });
    f.runtime.emitRendered({ ...rendering, issues: [] });

    expect(f.actor.getSnapshot().context.kernelIssues.get('main.ts')).toEqual([diagnostic]);
    f.actor.stop();
  });

  it('replaces source documents and closes the old view', async () => {
    const f = await opened(fixture());
    const replacement = createMockRuntimeDocument();
    vi.mocked(f.client.open).mockReturnValue(replacement.document);
    f.actor.send({ type: 'setEntryPath', entryPath: 'other.ts' });
    await vi.waitFor(() => {
      expect(f.client.open).toHaveBeenCalledTimes(2);
    });
    expect(f.runtime.view.close).toHaveBeenCalledOnce();
    expect(f.runtime.document.close).toHaveBeenCalledOnce();
    expect(f.client.open).toHaveBeenLastCalledWith({ source: { path: 'other.ts' }, watch: true });
    f.actor.stop();
  });

  it('ignores late events from a replaced source', async () => {
    const f = await opened(fixture());
    const replacement = createMockRuntimeDocument();
    vi.mocked(f.client.open).mockReturnValue(replacement.document);
    f.actor.send({ type: 'setEntryPath', entryPath: 'other.ts' });
    await waitFor(f.actor, (snapshot) => snapshot.context.document === replacement.document);
    f.runtime.emitRendered(f.runtime.rendering);
    f.runtime.emitEvaluated(noViews);
    expect(f.actor.getSnapshot().context.rendering).toBeUndefined();
    expect(f.actor.getSnapshot().context.evaluation).toBeUndefined();
    replacement.emitRendered(replacement.rendering);
    expect(f.actor.getSnapshot().context.rendering).toBe(replacement.rendering);
    f.actor.stop();
  });

  it('releases a document on filesystem binding replacement before reconnecting', async () => {
    const f = await opened(fixture());
    f.actor.send({ type: 'filesystemBindingChanged' });
    await vi.waitFor(() => {
      expect(f.client.terminate).toHaveBeenCalledOnce();
    });
    expect(f.runtime.document.close).toHaveBeenCalledOnce();
    expect(f.runtime.view.close).toHaveBeenCalledOnce();
    expect(f.cleanup).toHaveBeenCalledOnce();
    f.actor.stop();
  });

  it('parks the watched document and client while retaining the last frame', async () => {
    const f = await opened(fixture());
    f.runtime.emitRendered(f.runtime.rendering);
    await waitFor(f.actor, (snapshot) => snapshot.value === 'idle');
    f.actor.send({ type: 'parkRuntime' });
    await waitFor(f.actor, (snapshot) => snapshot.value === 'parked');
    expect(f.runtime.view.close).toHaveBeenCalledOnce();
    expect(f.runtime.document.close).toHaveBeenCalledOnce();
    expect(f.client.terminate).toHaveBeenCalledOnce();
    expect(f.actor.getSnapshot().context.rendering).toBe(f.runtime.rendering);
    f.actor.stop();
  });

  it('reopens a watched document on reveal while keeping the parked frame until replacement', async () => {
    const f = await opened(fixture());
    f.runtime.emitRendered(f.runtime.rendering);
    await waitFor(f.actor, (snapshot) => snapshot.value === 'idle');
    f.actor.send({ type: 'parkRuntime' });
    await waitFor(f.actor, (snapshot) => snapshot.value === 'parked');
    const revealed = createMockRuntimeDocument();
    vi.mocked(f.client.open).mockReturnValue(revealed.document);
    f.actor.send({ type: 'resumeRuntime' });
    await vi.waitFor(() => {
      expect(f.client.open).toHaveBeenCalledTimes(2);
    });
    expect(f.actor.getSnapshot().context.rendering).toBe(f.runtime.rendering);
    revealed.emitRendered(revealed.rendering);
    expect(f.actor.getSnapshot().context.rendering).toBe(revealed.rendering);
    f.actor.stop();
  });

  it('reports a failed default view without discarding its prior frame', async () => {
    const f = await opened(fixture());
    f.runtime.emitRendered(f.runtime.rendering);
    f.runtime.emitViewStatus('error');
    expect(f.actor.getSnapshot().value).toBe('error');
    expect(f.actor.getSnapshot().context.rendering).toBe(f.runtime.rendering);
    f.runtime.emitRendered(failure);
    expect(selectCadFailureIssues(f.actor.getSnapshot())?.[0]?.message).toBe('projection failed');
    f.actor.stop();
  });

  it('applies operation timeout before opening and updates a live client', async () => {
    const f = await connected(fixture());
    expect(f.client.setOperationTimeout).toHaveBeenCalledWith(defaultOperationTimeout);
    f.actor.send({ type: 'setOperationTimeout', operationTimeout: 12_000 });
    expect(f.client.setOperationTimeout).toHaveBeenCalledWith(12_000);
    f.actor.stop();
  });

  it('uses one shared cleanup for document and client at the React boundary', async () => {
    const f = await opened(fixture());
    const context: CadContext = f.actor.getSnapshot().context;
    disposeCadRuntime(context);
    expect(f.runtime.view.close).toHaveBeenCalledOnce();
    expect(f.runtime.document.close).toHaveBeenCalledOnce();
    expect(f.client.terminate).toHaveBeenCalledOnce();
    expect(f.cleanup).toHaveBeenCalledOnce();
    f.actor.stop();
  });
  it.each(['first', 'both'] as const)('should retain only refused real view subscriptions: %s', async (mode) => {
    const f = fixture();
    const firstError = new Error('rendered subscription refused');
    const secondError = new Error('status subscription refused');
    const first = vi.fn<() => void>(() => {
      throw firstError;
    });
    const second = vi.fn<() => void>(() => {
      if (mode === 'both') {
        throw secondError;
      }
    });
    vi.mocked(f.runtime.view.on).mockReturnValueOnce(first).mockReturnValueOnce(second);
    await opened(f);
    try {
      f.actor.send({ type: 'closeRuntime' });
      await waitFor(f.actor, (state) => state.matches('runtimeCloseFailed'));
      expect(first).toHaveBeenCalledOnce();
      expect(second).toHaveBeenCalledOnce();
      expect(f.actor.getSnapshot().matches('runtimeClosed')).toBe(false);
      const error = f.actor.getSnapshot().context.runtimeCloseError;
      if (mode === 'both') {
        expect(error).toBeInstanceOf(AggregateError);
        if (!(error instanceof AggregateError)) {
          throw new Error('Expected both subscription failures');
        }
        expect(error.errors).toEqual([firstError, secondError]);
      } else {
        expect(error).toBe(firstError);
      }
      first.mockImplementation(() => undefined);
      second.mockImplementation(() => undefined);
      f.actor.send({ type: 'closeRuntime' });
      await waitFor(f.actor, (state) => state.matches('runtimeClosed'));
      expect(first).toHaveBeenCalledTimes(2);
      expect(second).toHaveBeenCalledTimes(mode === 'both' ? 2 : 1);
      expect(f.client.shutdown).toHaveBeenCalledOnce();
    } finally {
      f.actor.stop();
    }
  });

  it('should not leave closing on late document, view or worker status', async () => {
    const f = await opened(fixture());
    const release = Promise.withResolvers<void>();
    vi.mocked(f.client.shutdown).mockImplementation(async () => release.promise);
    try {
      f.actor.send({ type: 'closeRuntime' });
      await vi.waitFor(() => {
        expect(f.client.shutdown).toHaveBeenCalledOnce();
      });
      for (const event of [
        { type: 'documentStatusChanged', status: 'ready' },
        { type: 'defaultViewStatusChanged', status: 'rendering' },
        { type: 'stateChanged', state: 'error' },
      ] as const) {
        f.actor.send(event);
        expect(f.actor.getSnapshot().matches('runtimeClosing')).toBe(true);
      }
    } finally {
      release.resolve();
      f.actor.stop();
    }
  });

  it('should attempt document, view and all subscriptions and retry only failed owners', async () => {
    const f = await opened(fixture());
    const refusal = new Error('document listener refused');
    const failed = vi.fn<() => void>(() => {
      throw refusal;
    });
    const successful = vi.fn();
    f.actor.send({
      type: 'documentOpened',
      document: f.runtime.document,
      defaultView: f.runtime.view,
      cleanups: [failed, successful],
      requestId: f.actor.getSnapshot().context.openAttempt,
    });
    try {
      f.actor.send({ type: 'closeRuntime' });
      await waitFor(f.actor, (state) => state.matches('runtimeCloseFailed'));
      expect(f.actor.getSnapshot().context.runtimeCloseError).toBe(refusal);
      expect(f.actor.getSnapshot().context.documentCleanups).toEqual([failed]);
      expect(successful).toHaveBeenCalledOnce();
      expect(f.runtime.document.close).toHaveBeenCalledOnce();
      expect(f.runtime.view.close).toHaveBeenCalledOnce();
      expect(f.cleanup).toHaveBeenCalledOnce();
      failed.mockImplementation(() => undefined);
      f.actor.send({ type: 'closeRuntime' });
      await waitFor(f.actor, (state) => state.matches('runtimeClosed'));
      expect(failed).toHaveBeenCalledTimes(2);
      expect(successful).toHaveBeenCalledOnce();
      expect(f.client.shutdown).toHaveBeenCalledOnce();
      expect(f.runtime.document.close).toHaveBeenCalledOnce();
      expect(f.runtime.view.close).toHaveBeenCalledOnce();
    } finally {
      f.actor.stop();
    }
  });

  it('should drain late document ownership without replacing the closing document', async () => {
    const f = await opened(fixture());
    const release = Promise.withResolvers<void>();
    vi.mocked(f.client.shutdown).mockImplementation(async () => release.promise);
    const late = createMockRuntimeDocument();
    const refusal = new Error('late listener refused');
    const failed = vi.fn<() => void>(() => {
      throw refusal;
    });
    const successful = vi.fn();
    try {
      f.actor.send({ type: 'closeRuntime' });
      await vi.waitFor(() => {
        expect(f.client.shutdown).toHaveBeenCalledOnce();
      });
      f.actor.send({
        type: 'documentOpened',
        document: late.document,
        defaultView: late.view,
        cleanups: [failed, successful],
        requestId: f.actor.getSnapshot().context.openAttempt,
      });
      expect(f.actor.getSnapshot().context.document).toBe(f.runtime.document);
      release.resolve();
      await waitFor(f.actor, (state) => state.matches('runtimeCloseFailed'));
      expect(f.actor.getSnapshot().context.runtimeCloseError).toBe(refusal);
      expect(f.actor.getSnapshot().context.documentCleanups).toEqual([failed]);
      expect(successful).toHaveBeenCalledOnce();
      expect(late.view.close).toHaveBeenCalledOnce();
      expect(late.document.close).toHaveBeenCalledOnce();
      failed.mockImplementation(() => undefined);
      f.actor.send({ type: 'closeRuntime' });
      await waitFor(f.actor, (state) => state.matches('runtimeClosed'));
      expect(f.client.shutdown).toHaveBeenCalledOnce();
      expect(failed).toHaveBeenCalledTimes(2);
      expect(successful).toHaveBeenCalledOnce();
    } finally {
      release.resolve();
      f.actor.stop();
    }
  });

  it.each(['connected', 'parked', 'refused'] as const)(
    'should acknowledge repeated close of a %s owner without projection success',
    async (mode) => {
      const f =
        mode === 'refused'
          ? (() => {
              const actor = createActor(
                cadMachine.provide({
                  actors: {
                    connectKernelActor: fromSafeAsync(async () => {
                      throw new Error('initialization refused');
                    }),
                  },
                }),
                { input: { shouldInitializeKernelOnStart: false, fileSystemRoot: '', kernelOptionsFactory } },
              ).start();
              return { actor, client: createMockRuntimeClient() };
            })()
          : await connected(fixture());
      try {
        if (mode === 'refused') {
          await waitFor(f.actor, (state) => state.matches('error'));
        }
        if (mode === 'parked') {
          f.actor.send({ type: 'parkRuntime' });
        }
        f.actor.send({ type: 'closeRuntime' });
        await waitFor(f.actor, (state) => state.matches('runtimeClosed'));
        f.actor.send({ type: 'closeRuntime' });
        expect(f.actor.getSnapshot().matches('runtimeClosed')).toBe(true);
        expect(f.client.shutdown).toHaveBeenCalledTimes(mode === 'connected' ? 1 : 0);
        expect(f.actor.getSnapshot().context.kernelClient).toBeUndefined();
      } finally {
        f.actor.stop();
      }
    },
  );

  it('should await the privately connecting client and fence binding and restore intents', async () => {
    const runtime = await import('@taucad/runtime/client');
    const client = createMockRuntimeClient();
    const ready = Promise.withResolvers<void>();
    const closed = Promise.withResolvers<void>();
    vi.mocked(client.connect).mockImplementation(async () => ready.promise);
    vi.mocked(client.shutdown).mockImplementation(async () => closed.promise);
    vi.spyOn(runtime, 'createRuntimeClient').mockReturnValue(client);
    const fileManager = createActor(
      setup({}).createMachine({
        initial: 'ready',
        context: {
          rootDirectory: '/projects/test',
          contentService: { id: 'original' },
          openFileSystemBridge: () =>
            createFileSystemBridgePort({
              ...mock<FileSystemBridgeRuntimeService>(),
              id: 'private-connecting-authority',
              capabilities: { writable: false, persistent: false, quotaBased: false, durability: 'ephemeral' },
            }),
        },
        on: { replace: { context: { contentService: { id: 'replacement' } } } },
        states: { ready: {} },
      }),
    ).start();
    const actor = createActor(cadMachine, {
      input: {
        shouldInitializeKernelOnStart: false,
        // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- real ready actor supplies the connection owner's read-only filesystem seam
        fileManagerRef: fileManager as unknown as NonNullable<CadContext['fileManagerRef']>,
        kernelOptionsFactory,
        fileSystemRoot: '/projects/test',
      },
    }).start();
    try {
      await vi.waitFor(() => {
        expect(client.connect).toHaveBeenCalledOnce();
      });
      expect(actor.getSnapshot().context.kernelClient).toBeUndefined();
      actor.send({ type: 'closeRuntime' });
      await vi.waitFor(() => {
        expect(client.shutdown).toHaveBeenCalledOnce();
      });
      fileManager.send({ type: 'replace' });
      actor.send({ type: 'restoreParameters' });
      expect(actor.getSnapshot().matches('runtimeClosed')).toBe(false);
      expect(client.terminate).not.toHaveBeenCalled();
      expect(client.open).not.toHaveBeenCalled();
      closed.resolve();
      await waitFor(actor, (state) => state.matches('runtimeClosed'));
      ready.resolve();
      await Promise.resolve();
      expect(actor.getSnapshot().context.kernelClient).toBeUndefined();
      actor.send({ type: 'filesystemBindingChanged' });
      expect(actor.getSnapshot().matches('runtimeClosed')).toBe(true);
      expect(runtime.createRuntimeClient).toHaveBeenCalledOnce();
    } finally {
      closed.resolve();
      ready.resolve();
      actor.stop();
      fileManager.stop();
    }
  });

  it.each(['client', 'subscription', 'both'] as const)(
    'should retain exact %s failures and retry only failed cleanup ownership',
    async (owner) => {
      const f = await connected(fixture());
      const clientFailure = new Error('shutdown refused');
      const callbackFailure = new Error('subscription refused');
      const failed = vi.fn(() => undefined);
      const successful = vi.fn();
      if (owner !== 'subscription') {
        vi.mocked(f.client.shutdown).mockRejectedValue(clientFailure);
      }
      if (owner !== 'client') {
        failed.mockImplementation(() => {
          throw callbackFailure;
        });
      }
      f.actor.send({ type: 'kernelAllocated', client: f.client, cleanups: [failed, successful] });
      try {
        f.actor.send({ type: 'closeRuntime' });
        await waitFor(f.actor, (state) => state.matches('runtimeCloseFailed'));
        const error = f.actor.getSnapshot().context.runtimeCloseError;
        if (owner === 'both') {
          expect(error).toBeInstanceOf(AggregateError);
          if (!(error instanceof AggregateError)) {
            throw new Error('Expected both failures');
          }
          expect(error.errors).toEqual([clientFailure, callbackFailure]);
        } else {
          expect(error).toBe(owner === 'client' ? clientFailure : callbackFailure);
        }
        expect(successful).toHaveBeenCalledOnce();
        expect(f.actor.getSnapshot().context.eventCleanups).toEqual(owner === 'client' ? [] : [failed]);
        vi.mocked(f.client.shutdown).mockResolvedValue(undefined);
        failed.mockImplementation(() => undefined);
        f.actor.send({ type: 'closeRuntime' });
        await waitFor(f.actor, (state) => state.matches('runtimeClosed'));
        expect(successful).toHaveBeenCalledOnce();
        expect(f.client.shutdown).toHaveBeenCalledTimes(owner === 'subscription' ? 1 : 2);
        expect(failed).toHaveBeenCalledTimes(owner === 'client' ? 1 : 2);
      } finally {
        f.actor.stop();
      }
    },
  );
});

describe('published assembly authority and connection lifecycle', () => {
  describe('the surface the kernel reads', () => {
    /* The kernel executes project code the agent wrote, so its filesystem is the
     * agent's view of the checkout and not the working copy (CI1, W14). */
    it('should open the kernel filesystem as the agent consumer', async () => {
      const methods = mock<FileSystemBridgeRuntimeService>();
      const provider: FileSystemBridgeRuntimeService = {
        id: 'cad-test-authority',
        capabilities: { writable: true, persistent: false, quotaBased: false, durability: 'ephemeral' },
        readFile: methods.readFile,
        writeFile: methods.writeFile,
        writeFileChecked: methods.writeFileChecked,
        stat: methods.stat,
        lstat: methods.lstat,
        exists: methods.exists,
        readdir: methods.readdir,
        mkdir: methods.mkdir,
        unlink: methods.unlink,
        rmdir: methods.rmdir,
        rename: methods.rename,
        dispose: methods.dispose,
      };
      const openFileSystemBridge = vi.fn(() => createFileSystemBridgePort(provider));
      const readyFileManager = createActor(
        setup({}).createMachine({
          initial: 'ready',
          context: {
            rootDirectory: '/projects/test',
            contentService: { subscribe: () => () => undefined },
            openFileSystemBridge,
          },
          states: { ready: {} },
        }),
      ).start();
      kernelBridgeOpens.length = 0;

      /* The thunk is captured while the kernel options are built, before the real
       * client is created over them — so how that connection settles is not this
       * row's subject, only which surface it asked for. */
      const actor = createActor(cadMachine, {
        input: {
          shouldInitializeKernelOnStart: false,
          fileManagerRef: readyFileManager as unknown as NonNullable<CadContext['fileManagerRef']>,
          kernelOptionsFactory: createKernelOptionsFactory(),
          fileSystemRoot: '/projects/test',
        },
      }).start();
      await waitFor(actor, (state) => state.value !== 'connecting');

      const open = kernelBridgeOpens.at(-1);
      if (!open) {
        throw new TypeError(
          `Expected the kernel to hold a bridge opener: ${JSON.stringify([...actor.getSnapshot().context.kernelIssues])}`,
        );
      }
      const connection = open();
      connection.dispose();

      expect(openFileSystemBridge).toHaveBeenCalledWith('/projects/test', 'user');
      expect(openFileSystemBridge).toHaveBeenCalledWith('/projects/test', 'agent');
      expect(openFileSystemBridge).toHaveBeenCalledTimes(2);
      actor.stop();
      readyFileManager.stop();
    });
  });

  describe('kernel connection start-up', () => {
    it('does not acquire a filesystem binding after deferred modules resolve following abort', async () => {
      const openFileSystemBridge = vi.fn();
      const snapshot = mock<ReturnType<NonNullable<CadContext['fileManagerRef']>['getSnapshot']>>({
        context: mock<ReturnType<NonNullable<CadContext['fileManagerRef']>['getSnapshot']>['context']>({
          rootDirectory: '/projects/test',
          contentService: mock<FileContentService>(),
          openFileSystemBridge,
        }),
      });
      vi.mocked(snapshot.matches).mockReturnValue(true);
      const readyFileManager = mock<NonNullable<CadContext['fileManagerRef']>>({
        getSnapshot: () => snapshot,
        subscribe: () => ({ unsubscribe: vi.fn() }),
      });
      let resolveModules!: (factory: PageKernelOptionsFactory) => void;
      const modules = new Promise<PageKernelOptionsFactory>((resolve) => {
        resolveModules = resolve;
      });
      const resolveOptions = vi.fn<PageKernelOptionsFactory>(() => mock<ReturnType<PageKernelOptionsFactory>>());
      const actor = createActor(cadMachine, {
        input: {
          shouldInitializeKernelOnStart: false,
          fileManagerRef: readyFileManager,
          kernelOptionsFactory: async () => modules,
          fileSystemRoot: '/projects/test',
        },
      }).start();
      await new Promise((resolve) => {
        setTimeout(resolve, 0);
      });
      actor.stop();
      resolveModules(resolveOptions);
      await new Promise((resolve) => {
        setTimeout(resolve, 0);
      });
      expect(openFileSystemBridge).not.toHaveBeenCalled();
      expect(resolveOptions).not.toHaveBeenCalled();
      expect(actor.getSnapshot().context.kernelClient).toBeUndefined();
    });
    it('loads the kernel modules while the file manager is still opening', async () => {
      const pendingFileManager = createActor(
        setup({}).createMachine({ initial: 'opening', states: { opening: {}, ready: {} } }),
      ).start();
      let factoryCalled = false;
      const kernelOptionsFactory: LazyKernelOptionsFactory = async () => {
        factoryCalled = true;
        return () => mock<ReturnType<KernelOptionsFactory>>();
      };

      const actor = createActor(cadMachine, {
        input: {
          shouldInitializeKernelOnStart: false,
          fileManagerRef: pendingFileManager as unknown as NonNullable<CadContext['fileManagerRef']>,
          kernelOptionsFactory,
          fileSystemRoot: '/projects/test',
        },
      }).start();

      // The module graph does not depend on the filesystem, so it must already be loading.
      await new Promise((resolve) => {
        setTimeout(resolve, 0);
      });
      expect(factoryCalled).toBe(true);
      expect(actor.getSnapshot().value).toBe('connecting');

      actor.stop();
      pendingFileManager.stop();
    });
  });
  describe('cached assembly resume ownership', () => {
    it.each([
      ['entry', 'ordinary'],
      ['root', 'ordinary'],
      ['entry', 'local-write'],
      ['entry', 'external-write'],
      ['entry', 'external-delete'],
      ['entry', 'external-reset'],
      ['entry', 'external-nested-write'],
      ['entry', 'watch-refused'],
    ] as const)(
      'watches changed %s bytes without replacing admission for initial or equal content outcomes (%s)',
      async (watched, mutation) => {
        const runtime = await import('@taucad/runtime/client');
        const { sha256String } = await import('@taucad/utils/hash');
        const client = createMockAppRuntimeClient();
        vi.spyOn(runtime, 'createRuntimeClient').mockReturnValue(client);
        const publicationPath = `.tau/artifacts/reusable-parts/${await sha256String('assembly.json')}/scene.json`;
        const encode = (value: unknown): Uint8Array<ArrayBuffer> => new TextEncoder().encode(JSON.stringify(value));
        const source = { schemaVersion: 1, parts: {}, occurrences: [] };
        const published = { ...source, generation: 1 };
        const files = new Map([
          ['/projects/test/assembly.json', encode(source)],
          [`/projects/test/${publicationPath}`, encode(published)],
        ]);
        const proxy = mock<ComposedViewClient>();
        proxy.readFile.mockImplementation(async (path) => {
          const bytes = files.get(path);
          if (!bytes) {
            throw Object.assign(new Error('Missing fixture file'), { code: 'ENOENT' });
          }
          return new Uint8Array(bytes);
        });
        proxy.stat.mockImplementation(async (path) => {
          const bytes = files.get(path);
          if (!bytes) {
            throw Object.assign(new Error('Missing fixture file'), { code: 'ENOENT' });
          }
          return { type: 'file', contentKind: 'text', lineCount: 1, size: bytes.byteLength, mtimeMs: 0 };
        });
        proxy.writeFile.mockImplementation(async (path, data) => {
          files.set(path, typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data));
        });
        proxy.unlink.mockImplementation(async (path) => {
          files.delete(path);
        });
        const listen = vi.fn<WorkerChangeChannelTransport['listen']>(() => () => undefined);
        const channel = new WorkerChangeChannel({ transport: { listen } });
        const nested = mutation === 'external-nested-write';
        const contentRoot = nested ? '/projects' : '/projects/test';
        const contentService = new FileContentService({
          proxy,
          channel,
          paths: new WorkspacePathResolver(contentRoot),
          refreshGuard: new RefreshGenerationGuard(),
        });
        const watchRegistration = Promise.withResolvers<void>();
        if (mutation === 'watch-refused') {
          vi.spyOn(contentService, 'watchReady').mockReturnValue({
            ready: watchRegistration.promise,
            closed: Promise.withResolvers<void>().promise,
            dispose: vi.fn(),
          });
        }
        const read = vi.spyOn(contentService, 'readRawBytes');
        const admitted = mock<Awaited<ReturnType<AppRuntimeClient['openAssembly']>>['admitted']>();
        const rootBytes = encode(published);
        const root = {
          path: publicationPath,
          digest: await cache.digestContent({ bytes: rootBytes }),
          byteLength: rootBytes.byteLength,
        };
        const document = mock<Awaited<ReturnType<AppRuntimeClient['openAssembly']>>>({ root, admitted });
        client.publishAssembly.mockResolvedValue(
          mock<Awaited<ReturnType<AppRuntimeClient['publishAssembly']>>>({
            status: 'published',
            root,
            admitted,
            document,
          }),
        );
        client.openAssembly.mockImplementation(async ({ root }) =>
          mock<Awaited<ReturnType<AppRuntimeClient['openAssembly']>>>({ root, admitted }),
        );
        const methods = mock<FileSystemBridgeRuntimeService>();
        const manager = createActor(
          setup({}).createMachine({
            initial: 'ready',
            context: {
              rootDirectory: contentRoot,
              contentService,
              openFileSystemBridge: () =>
                createFileSystemBridgePort({
                  id: 'assembly-watch-authority',
                  capabilities: { writable: true, persistent: false, quotaBased: false, durability: 'ephemeral' },
                  readFile: methods.readFile,
                  writeFile: methods.writeFile,
                  writeFileChecked: methods.writeFileChecked,
                  stat: methods.stat,
                  lstat: methods.lstat,
                  exists: methods.exists,
                  readdir: methods.readdir,
                  mkdir: methods.mkdir,
                  unlink: methods.unlink,
                  rmdir: methods.rmdir,
                  rename: methods.rename,
                  dispose: methods.dispose,
                }),
            },
            states: { ready: {} },
          }),
        ).start();
        const actor = createActor(cadMachine, {
          input: {
            shouldInitializeKernelOnStart: false,
            fileManagerRef: manager as unknown as NonNullable<CadContext['fileManagerRef']>,
            kernelOptionsFactory: createKernelOptionsFactory(),
            fileSystemRoot: '/projects/test',
          },
        }).start();
        const selectedPath = watched === 'entry' ? 'assembly.json' : publicationPath;
        const contentPath = nested ? `test/${selectedPath}` : selectedPath;
        const initialBytes = watched === 'entry' ? encode(source) : rootBytes;
        try {
          await waitFor(actor, (state) => state.matches('idle') || state.matches('error'));
          expect(selectCadFailureIssues(actor.getSnapshot())).toBeUndefined();
          expect(actor.getSnapshot().matches('idle')).toBe(true);
          if (mutation === 'watch-refused') {
            const late = Promise.withResolvers<Awaited<ReturnType<AppRuntimeClient['publishAssembly']>>>();
            client.publishAssembly.mockImplementationOnce(async () => late.promise);
            actor.send({ type: 'initializeModel', entryPath: 'assembly.json' });
            await vi.waitFor(() => {
              expect(contentService.watchReady).toHaveBeenCalledOnce();
              expect(client.publishAssembly).toHaveBeenCalledOnce();
            });
            watchRegistration.reject(new Error('captured watch refused'));
            await waitFor(actor, (state) => state.matches('error'));
            late.resolve(
              mock<Awaited<ReturnType<AppRuntimeClient['publishAssembly']>>>({
                status: 'published',
                root,
                admitted,
                document,
              }),
            );
            await late.promise;
            await Promise.resolve();
            expect(actor.getSnapshot().context.entryPath).toBe('assembly.json');
            expect(actor.getSnapshot().matches('error')).toBe(true);
            expect(actor.getSnapshot().context.committedAssemblyDisplay).toBeUndefined();
            await contentService.write(contentPath, encode({ ...source, name: 'after refused watch' }), 'user');
            await Promise.resolve();
            expect(actor.getSnapshot().matches('error')).toBe(true);
            expect(actor.getSnapshot().context.lastRequestedRenderId).toBe(1);
            expect(client.publishAssembly).toHaveBeenCalledOnce();
            return;
          }
          if (mutation !== 'ordinary') {
            const first = Promise.withResolvers<Awaited<ReturnType<AppRuntimeClient['publishAssembly']>>>();
            const second = Promise.withResolvers<Awaited<ReturnType<AppRuntimeClient['publishAssembly']>>>();
            client.publishAssembly.mockImplementationOnce(async () => first.promise);
            client.publishAssembly.mockImplementationOnce(async () => second.promise);
            actor.send({ type: 'initializeModel', entryPath: 'assembly.json' });
            await vi.waitFor(() => {
              expect(client.publishAssembly).toHaveBeenCalledOnce();
            });
            const latest = encode({ ...source, name: 'latest edit' });
            if (mutation === 'local-write') {
              await contentService.write(contentPath, latest, 'user');
            } else {
              const registration = listen.mock.calls.find(([event]) => event === 'fileChanged');
              if (!registration) {
                throw new Error('Expected the real worker change subscription.');
              }
              if (mutation === 'external-delete') {
                files.delete('/projects/test/assembly.json');
                registration[1]({ type: 'fileDeleted', path: contentPath, backend: 'indexeddb' });
                await waitFor(actor, (state) => state.context.lastSettledRenderId === 2);
                first.reject(new Error('stale initial publication failed'));
                expect(actor.getSnapshot().context.lastRequestedRenderId).toBe(2);
                expect(client.publishAssembly).toHaveBeenCalledOnce();
                expect(selectCadFailureIssues(actor.getSnapshot())).toBeDefined();
                return;
              }
              files.set('/projects/test/assembly.json', latest);
              registration[1](
                mutation === 'external-reset'
                  ? { type: 'backendChanged', backend: 'indexeddb' }
                  : { type: 'fileWritten', path: contentPath, backend: 'indexeddb' },
              );
            }
            await vi.waitFor(() => {
              expect(client.publishAssembly).toHaveBeenCalledTimes(2);
            });
            first.reject(new Error('stale initial publication failed'));
            second.resolve(
              mock<Awaited<ReturnType<AppRuntimeClient['publishAssembly']>>>({
                status: 'published',
                root,
                admitted,
                document,
              }),
            );
            await waitFor(actor, (state) => state.matches('idle') && state.context.lastSettledRenderId === 2);
            expect(actor.getSnapshot().context.lastRequestedRenderId).toBe(2);
            expect(actor.getSnapshot().context.committedAssemblyDisplay?.entryRead).toEqual({
              path: 'assembly.json',
              digest: await cache.digestContent({ bytes: latest }),
              byteLength: latest.byteLength,
            });
            expect(selectCadFailureIssues(actor.getSnapshot())).toBeUndefined();
            return;
          }
          actor.send({ type: 'initializeModel', entryPath: 'assembly.json' });
          await waitFor(
            actor,
            (state) => state.matches('error') || (state.matches('idle') && state.context.lastSettledRenderId === 1),
          );
          expect(selectCadFailureIssues(actor.getSnapshot())).toBeUndefined();
          expect(actor.getSnapshot().matches('idle')).toBe(true);
          const display = actor.getSnapshot().context.committedAssemblyDisplay;
          expect(display?.entryRead).toEqual({
            path: 'assembly.json',
            digest: await cache.digestContent({ bytes: encode(source) }),
            byteLength: encode(source).byteLength,
          });
          read.mockClear();
          await contentService.resolve(contentPath);
          expect(read).not.toHaveBeenCalled();
          expect(actor.getSnapshot().context.lastRequestedRenderId).toBe(1);
          expect(actor.getSnapshot().context.committedAssemblyDisplay).toBe(display);
          await contentService.write(contentPath, initialBytes, 'user');
          expect(read).not.toHaveBeenCalled();
          expect(client.publishAssembly).toHaveBeenCalledOnce();
          expect(client.openAssembly).not.toHaveBeenCalled();

          const refreshExternal = async (bytes: Uint8Array<ArrayBuffer>): Promise<void> => {
            const refreshed = Promise.withResolvers<Extract<ContentChangeEvent, { type: 'read' }>>();
            const unsubscribe = contentService.onDidContentChange((event) => {
              if (event.type === 'read' && event.path === selectedPath) {
                refreshed.resolve(event);
              }
            });
            try {
              // The external writer bypasses this content service, as another rooted worker port does.
              files.set(`/projects/test/${selectedPath}`, new Uint8Array(bytes));
              const registration = listen.mock.calls.find(([event]) => event === 'fileChanged');
              if (!registration) {
                throw new Error('Expected the real worker change subscription.');
              }
              registration[1]({ type: 'fileWritten', path: selectedPath, backend: 'indexeddb' });
              expect(await refreshed.promise).toEqual({ type: 'read', path: selectedPath, data: bytes });
            } finally {
              unsubscribe();
            }
          };
          await refreshExternal(initialBytes);
          expect(read).not.toHaveBeenCalled();
          expect(actor.getSnapshot().context.lastRequestedRenderId).toBe(1);
          expect(actor.getSnapshot().context.committedAssemblyDisplay).toBe(display);
          const externalBytes =
            watched === 'entry' ? encode({ ...source, name: 'external' }) : encode({ ...published, generation: 2 });
          await refreshExternal(externalBytes);
          await waitFor(actor, (state) => state.matches('idle') && state.context.lastSettledRenderId === 2);
          expect(actor.getSnapshot().context.lastRequestedRenderId).toBe(2);
          expect(client.publishAssembly).toHaveBeenCalledTimes(watched === 'entry' ? 2 : 1);
          expect(client.openAssembly).toHaveBeenCalledTimes(watched === 'root' ? 1 : 0);

          const changedBytes =
            watched === 'entry' ? encode({ ...source, name: 'changed' }) : encode({ ...published, generation: 3 });
          await contentService.write(selectedPath, changedBytes, 'user');
          await waitFor(actor, (state) => state.matches('idle') && state.context.lastSettledRenderId === 3);
          expect(actor.getSnapshot().context.lastRequestedRenderId).toBe(3);
          expect(client.publishAssembly).toHaveBeenCalledTimes(watched === 'entry' ? 3 : 1);
          expect(client.openAssembly).toHaveBeenCalledTimes(watched === 'root' ? 2 : 0);

          await contentService.delete(selectedPath, 'user');
          await waitFor(
            actor,
            (state) => state.context.lastSettledRenderId === 4 && state.matches(watched === 'entry' ? 'idle' : 'error'),
          );
          expect(actor.getSnapshot().context.lastRequestedRenderId).toBe(4);
          expect(client.publishAssembly).toHaveBeenCalledTimes(watched === 'entry' ? 3 : 1);
          expect(client.openAssembly).toHaveBeenCalledTimes(watched === 'entry' ? 1 : 2);
          if (watched === 'root') {
            // Restoring exactly the admitted bytes clears the real missing-root refusal.
            await contentService.write(selectedPath, changedBytes, 'user');
            await waitFor(actor, (state) => state.matches('idle') && state.context.lastSettledRenderId === 5);
            expect(client.openAssembly).toHaveBeenCalledTimes(3);
          }
          const settled = actor.getSnapshot().context.lastSettledRenderId;
          const publishedCalls = client.publishAssembly.mock.calls.length;
          const openedCalls = client.openAssembly.mock.calls.length;
          const pendingStat = Promise.withResolvers<Awaited<ReturnType<ComposedViewClient['stat']>>>();
          proxy.stat.mockImplementationOnce(async () => pendingStat.promise);
          await contentService.write(selectedPath, encode({ ...published, generation: 4 }), 'user');
          const stale = read.mock.results.at(-1);
          if (stale?.type !== 'return') {
            throw new Error('Expected the pending owned content read.');
          }
          actor.send({ type: 'parkRuntime' });
          expect(actor.getSnapshot().matches('parked')).toBe(true);
          pendingStat.resolve({
            type: 'file',
            contentKind: 'text',
            lineCount: 1,
            size: changedBytes.byteLength,
            mtimeMs: 0,
          });
          await stale.value;
          expect(actor.getSnapshot().context.lastRequestedRenderId).toBe(settled);
          expect(client.publishAssembly).toHaveBeenCalledTimes(publishedCalls);
          expect(client.openAssembly).toHaveBeenCalledTimes(openedCalls);
          read.mockClear();
          await contentService.delete(selectedPath, 'user');
          expect(read).not.toHaveBeenCalled();
        } finally {
          actor.stop();
          manager.stop();
          contentService.dispose();
          channel.dispose();
        }
      },
    );

    it.each(['authored', 'published', 'readonly', 'deleted', 'other-error'] as const)(
      'retains the %s entry contract after root refresh, park and resume',
      async (route) => {
        const runtime = await import('@taucad/runtime/client');
        const { sha256String } = await import('@taucad/utils/hash');
        const firstClient = createMockAppRuntimeClient();
        const firstTerminate = vi.fn<AppRuntimeClient['terminate']>(firstClient.terminate);
        firstClient.terminate = firstTerminate;
        const secondClient = createMockAppRuntimeClient();
        vi.spyOn(runtime, 'createRuntimeClient').mockReturnValueOnce(firstClient).mockReturnValueOnce(secondClient);
        const publicationPath = `.tau/artifacts/reusable-parts/${await sha256String('assembly.json')}/scene.json`;
        const isAuthored = route !== 'published';
        const entryPath = isAuthored ? 'assembly.json' : publicationPath;
        let authoredBytes = new TextEncoder().encode('{"schemaVersion":1,"parts":{},"occurrences":[]}');
        let publishedBytes = new TextEncoder().encode(
          '{"schemaVersion":2,"generation":1,"manifest":{"path":"roots/sha256/a.json","digest":"a","byteLength":1}}',
        );
        const root = {
          path: publicationPath,
          digest: await cache.digestContent({ bytes: publishedBytes }),
          byteLength: publishedBytes.byteLength,
        };
        const admitted = mock<Awaited<ReturnType<AppRuntimeClient['openAssembly']>>['admitted']>();
        const document = mock<Awaited<ReturnType<AppRuntimeClient['openAssembly']>>>({ root, admitted });
        firstClient.publishAssembly.mockResolvedValue(
          mock<Awaited<ReturnType<AppRuntimeClient['publishAssembly']>>>({
            status: 'published',
            root,
            admitted,
            document,
          }),
        );
        firstClient.openAssembly.mockResolvedValue(document);
        secondClient.publishAssembly.mockResolvedValue(
          mock<Awaited<ReturnType<AppRuntimeClient['publishAssembly']>>>({
            status: 'published',
            root,
            admitted,
            document,
          }),
        );
        secondClient.openAssembly.mockResolvedValue(document);
        const listeners = new Map<string, Set<() => void>>();
        const contentService = mock<FileContentService>();
        contentService.onDidContentChange.mockReturnValue(() => undefined);
        contentService.watchReady.mockImplementation(openContentWatch);
        let sourceUnavailable = false;
        contentService.readRawBytes.mockImplementation(async (path) => {
          if (sourceUnavailable && path === 'assembly.json') {
            if (route === 'deleted') {
              throw new FileNotFoundError('Authored source deleted', { path });
            }
            throw new Error('Authored source permission refused');
          }
          return path === 'assembly.json' ? authoredBytes : publishedBytes;
        });
        contentService.subscribe.mockImplementation((path, listener) => {
          if (path === undefined) {
            throw new TypeError('Expected a selected content subscription path');
          }
          const selected = listeners.get(path) ?? new Set<() => void>();
          selected.add(listener);
          listeners.set(path, selected);
          return () => selected.delete(listener);
        });
        const methods = mock<FileSystemBridgeRuntimeService>();
        const provider: FileSystemBridgeRuntimeService = {
          id: 'cached-assembly-authority',
          capabilities: { writable: true, persistent: false, quotaBased: false, durability: 'ephemeral' },
          readFile: methods.readFile,
          writeFile: methods.writeFile,
          writeFileChecked: methods.writeFileChecked,
          stat: methods.stat,
          lstat: methods.lstat,
          exists: methods.exists,
          readdir: methods.readdir,
          mkdir: methods.mkdir,
          unlink: methods.unlink,
          rmdir: methods.rmdir,
          rename: methods.rename,
          dispose: methods.dispose,
        };
        let writable = true;
        const manager = createActor(
          setup({}).createMachine({
            initial: 'ready',
            context: {
              rootDirectory: '/projects/test',
              contentService,
              openFileSystemBridge: () =>
                createFileSystemBridgePort({
                  ...provider,
                  capabilities: { ...provider.capabilities, writable },
                }),
            },
            states: { ready: {} },
          }),
        ).start();
        const actor = createActor(cadMachine, {
          input: {
            shouldInitializeKernelOnStart: false,
            fileManagerRef: manager as unknown as NonNullable<CadContext['fileManagerRef']>,
            kernelOptionsFactory: createKernelOptionsFactory(),
            fileSystemRoot: '/projects/test',
          },
        }).start();
        try {
          await waitFor(actor, (state) => state.matches('idle'));
          actor.send({ type: 'initializeModel', entryPath });
          await waitFor(actor, (state) => state.matches('idle') && state.context.lastSettledRenderId === 1);
          expect(isAuthored ? firstClient.publishAssembly : firstClient.openAssembly).toHaveBeenCalledOnce();
          if (isAuthored) {
            const rootListeners = listeners.get(publicationPath);
            expect(rootListeners?.size).toBe(1);
            publishedBytes = new TextEncoder().encode(
              '{"schemaVersion":2,"generation":2,"manifest":{"path":"roots/sha256/b.json","digest":"b","byteLength":1}}',
            );
            for (const listener of rootListeners ?? []) {
              listener();
            }
            await waitFor(actor, (state) => state.matches('idle') && state.context.lastSettledRenderId === 2);
            expect(actor.getSnapshot().context.assemblyRootReadPath).toBe(publicationPath);
            expect(firstClient.openAssembly).toHaveBeenCalledOnce();
          }
          actor.send({ type: 'parkRuntime' });
          expect(actor.getSnapshot().matches('parked')).toBe(true);
          expect(firstClient.terminate).toHaveBeenCalledOnce();
          expect([...listeners.values()].every((selected) => selected.size === 0)).toBe(true);
          const readsBeforeResume = contentService.readRawBytes.mock.calls.length;
          writable = route !== 'readonly';
          sourceUnavailable = route === 'deleted' || route === 'other-error';
          actor.send({ type: 'resumeRuntime' });
          await waitFor(actor, (state) => state.matches(route === 'other-error' ? 'error' : 'idle'));
          expect(actor.getSnapshot().context.kernelClient).toBe(secondClient);
          if (route === 'authored') {
            expect(
              secondClient.publishAssembly,
              JSON.stringify({
                resumedReadOverride: actor.getSnapshot().context.assemblyRootReadPath,
                resumedOpenRoots: secondClient.openAssembly.mock.calls.map(([request]) => request.root.path),
                firstClientTerminations: firstTerminate.mock.calls.length,
                remainingSubscriptions: [...listeners.values()].map((selected) => selected.size),
              }),
            ).toHaveBeenCalledWith(expect.objectContaining({ authoredPath: 'assembly.json' }));
            expect(secondClient.openAssembly).not.toHaveBeenCalled();
            const entryListeners = listeners.get('assembly.json');
            expect(entryListeners?.size).toBe(1);
            const requested = actor.getSnapshot().context.lastRequestedRenderId;
            authoredBytes = new TextEncoder().encode(
              '{"schemaVersion":1,"parts":{},"occurrences":[],"name":"Changed source"}',
            );
            for (const listener of entryListeners ?? []) {
              listener();
            }
            await waitFor(actor, (state) => state.matches('idle') && state.context.lastSettledRenderId > requested);
            expect(secondClient.publishAssembly).toHaveBeenCalledTimes(2);
            expect(secondClient.openAssembly).not.toHaveBeenCalled();
          } else if (route === 'other-error') {
            expect(secondClient.openAssembly).not.toHaveBeenCalled();
            expect(secondClient.publishAssembly).not.toHaveBeenCalled();
          } else {
            expect(secondClient.openAssembly).toHaveBeenCalledOnce();
            expect(secondClient.publishAssembly).not.toHaveBeenCalled();
            const resumedReads = contentService.readRawBytes.mock.calls.slice(readsBeforeResume);
            expect(resumedReads.map(([path]) => path)).toEqual([
              route === 'deleted' ? 'assembly.json' : publicationPath,
            ]);
            if (route === 'readonly') {
              expect(actor.getSnapshot().context.assemblyPublicationWritable).toBe(false);
            }
          }
          expect(firstClient.open).not.toHaveBeenCalled();
          expect(secondClient.open).not.toHaveBeenCalled();
        } finally {
          actor.stop();
          manager.stop();
        }
      },
    );
  });
});

describe('selected assembly admission ownership', () => {
  function authority(contentService: FileContentService, rootDirectory = '/projects/test') {
    const snapshot = mock<ReturnType<NonNullable<CadContext['fileManagerRef']>['getSnapshot']>>({
      context: mock<ReturnType<NonNullable<CadContext['fileManagerRef']>['getSnapshot']>['context']>({
        rootDirectory,
        contentService,
      }),
    });
    vi.mocked(snapshot.matches).mockReturnValue(true);
    return mock<NonNullable<CadContext['fileManagerRef']>>({ getSnapshot: () => snapshot });
  }
  it('keeps pending pin admission independent of old document events and cancels it on source selection', async () => {
    const contentService = mock<FileContentService>();
    contentService.onDidContentChange.mockReturnValue(() => undefined);
    contentService.watchReady.mockImplementation(openContentWatch);
    const read = Promise.withResolvers<Uint8Array<ArrayBuffer>>();
    contentService.readRawBytes.mockReturnValue(read.promise);
    const f = await connected(fixture({ fileManagerRef: authority(contentService) }));
    try {
      f.actor.send({ type: 'setEntryPath', entryPath: 'scene.json' });
      expect(f.actor.getSnapshot().context.pendingAssemblyEntryPath).toBe('scene.json');
      f.actor.send({
        type: 'documentEvaluated',
        evaluation: { ...f.runtime.evaluation, success: false, issues: failure.issues },
      });
      expect(f.actor.getSnapshot().context.latestRenderingOutcome).toBeUndefined();
      f.actor.send({ type: 'setEntryPath', entryPath: 'main.ts' });
      read.resolve(new TextEncoder().encode('{"schemaVersion":1,"generation":1,"parts":{},"occurrences":[]}'));
      await vi.waitFor(() => {
        expect(f.client.open).toHaveBeenCalledOnce();
      });
      expect(f.client.openAssembly).not.toHaveBeenCalled();
      expect(f.actor.getSnapshot().context.entryPath).toBe('main.ts');
      expect(f.actor.getSnapshot().context.publishedAssemblyRoot).toBeUndefined();
    } finally {
      f.actor.stop();
    }
  });
  it('denies an entry outside captured content authority before reading bytes', async () => {
    const contentService = mock<FileContentService>();
    contentService.onDidContentChange.mockReturnValue(() => undefined);
    contentService.watchReady.mockImplementation(openContentWatch);
    const f = await connected(
      fixture({ fileManagerRef: authority(contentService), fileSystemRoot: '/projects/foreign' }),
    );
    try {
      f.actor.send({ type: 'setEntryPath', entryPath: 'scene.json' });
      await waitFor(f.actor, (state) => state.matches('error'));
      expect(contentService.readRawBytes).not.toHaveBeenCalled();
      expect(f.client.openAssembly).not.toHaveBeenCalled();
      expect(f.client.open).not.toHaveBeenCalled();
    } finally {
      f.actor.stop();
    }
  });
  it('denies pin admission while the content authority is unavailable', async () => {
    const f = await connected(fixture());
    try {
      f.actor.send({ type: 'setEntryPath', entryPath: 'scene.json' });
      await waitFor(f.actor, (state) => state.matches('error'));
      expect(f.client.openAssembly).not.toHaveBeenCalled();
      expect(f.client.open).not.toHaveBeenCalled();
    } finally {
      f.actor.stop();
    }
  });
  it.each(['{"ordinary":true}', '{', '{"generation":1}'])(
    'retains the ordinary document route for JSON %s',
    async (text) => {
      const contentService = mock<FileContentService>();
      contentService.onDidContentChange.mockReturnValue(() => undefined);
      contentService.watchReady.mockImplementation(openContentWatch);
      contentService.readRawBytes.mockResolvedValue(new TextEncoder().encode(text));
      const f = await connected(fixture({ fileManagerRef: authority(contentService) }));
      try {
        f.actor.send({ type: 'setEntryPath', entryPath: 'ordinary.json' });
        await vi.waitFor(() => {
          expect(f.client.open).toHaveBeenCalledOnce();
        });
        expect(f.client.openAssembly).not.toHaveBeenCalled();
        expect(f.actor.getSnapshot().context.publishedAssemblyRoot).toBeUndefined();
      } finally {
        f.actor.stop();
      }
    },
  );
});

describe('current published document cleanup ownership', () => {
  it.each(['replace', 'park', 'destroy'] as const)(
    'retains only the current pin cleanup across repeated publication and %s',
    async (finish) => {
      const f = await opened(fixture());
      const connectionCleanups = [...f.actor.getSnapshot().context.eventCleanups];
      const displays = [0, 1, 2].map(() => {
        const document = mock<NonNullable<CadContext['committedAssemblyDisplay']>['document']>();
        return {
          root: mock<NonNullable<CadContext['publishedAssemblyRoot']>>(),
          admitted: mock<NonNullable<CadContext['admittedAssembly']>>(),
          document,
        };
      });
      try {
        for (const display of displays) {
          f.actor.send({ type: 'assemblyComputed', entryPath: 'main.ts', assemblyDisplay: display, issues: [] });
          expect(f.actor.getSnapshot().context.eventCleanups).toEqual(connectionCleanups);
          expect(f.actor.getSnapshot().context.documentCleanups).toHaveLength(1);
        }
        expect(displays[0]!.document.close).toHaveBeenCalledOnce();
        expect(displays[1]!.document.close).toHaveBeenCalledOnce();
        expect(displays[2]!.document.close).not.toHaveBeenCalled();
        const stale = mock<NonNullable<CadContext['committedAssemblyDisplay']>>({
          document: mock<NonNullable<CadContext['committedAssemblyDisplay']>['document']>(),
        });
        f.actor.send({ type: 'assemblyComputed', entryPath: 'foreign.json', assemblyDisplay: stale, issues: [] });
        expect(stale.document.close).toHaveBeenCalledOnce();
        expect(f.actor.getSnapshot().context.committedAssemblyDisplay).toBe(displays[2]);
        if (finish === 'replace') {
          f.actor.send({ type: 'setEntryPath', entryPath: 'other.ts' });
        } else if (finish === 'park') {
          f.actor.send({ type: 'parkRuntime' });
        } else {
          disposeCadRuntime(f.actor.getSnapshot().context);
        }
        expect(displays[2]!.document.close).toHaveBeenCalledOnce();
        expect(displays[0]!.document.close).toHaveBeenCalledOnce();
        expect(displays[1]!.document.close).toHaveBeenCalledOnce();
      } finally {
        f.actor.stop();
      }
    },
  );
});
