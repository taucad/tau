// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { createActor, waitFor } from 'xstate';
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
import { cadMachine, disposeCadRuntime, selectCadFailureIssues } from '#machines/cad.machine.js';
import type { CadContext } from '#machines/cad.machine.js';
import type { AppRuntimeClient, KernelOptionsFactory, LazyKernelOptionsFactory } from '#types/runtime-client.alias.js';

const kernelOptionsFactory: LazyKernelOptionsFactory = async () => () =>
  mock<ReturnType<KernelOptionsFactory>>({
    config: { tauApiUrl: 'https://api.test', tauWebSocketUrl: 'wss://api.test' },
  });

function fixture() {
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
    { input: { shouldInitializeKernelOnStart: false, fileSystemRoot: '/projects/test', kernelOptionsFactory } },
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

describe('cadMachine watched document', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

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
});
