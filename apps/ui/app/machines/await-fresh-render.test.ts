import { describe, expect, it, vi } from 'vitest';
import { createActor, setup, types } from 'xstate';
import type { ActorRefFrom } from 'xstate';
import type { Rendering, RuntimeDocument, ViewSubscription } from '@taucad/runtime';
import { createMockRuntimeDocument } from '@taucad/runtime-testing';
import { eventSchemas } from '#lib/xstate.lib.js';
import { defaultOperationTimeout } from '#constants/editor.constants.js';
import { awaitFreshRender, AwaitFreshOperationTimeoutError } from '#machines/await-fresh-render.js';
import type { CadAssemblyDisplay, CadContext, cadMachine } from '#machines/cad.machine.js';
import { mock } from 'vitest-mock-extended';
import { contentDigest } from '@taucad/cache-core';
import type { AdmittedAssembly, PublishedAssembly, PublishedPartAsset } from '@taucad/runtime/types';
import { publishedPartRecordSchema } from '@taucad/runtime/types';

type Context = Pick<
  CadContext,
  | 'document'
  | 'defaultView'
  | 'lastProjection'
  | 'latestRenderingOutcome'
  | 'entryPath'
  | 'rendering'
  | 'committedRendering'
  | 'committedAssemblyDisplay'
  | 'publishedAssemblyRoot'
  | 'admittedAssembly'
  | 'publishedAssembly'
  | 'publishedAssemblyEntryPath'
  | 'lastRequestedRenderId'
  | 'lastSettledRenderId'
  | 'parkWhenIdle'
>;
type Event =
  | { type: 'open'; document: RuntimeDocument; view?: ViewSubscription }
  | { type: 'projection'; rendering: Rendering }
  | { type: 'fail' }
  | { type: 'assembly'; context: Partial<Context> }
  | { type: 'park' }
  | { type: 'request' };

const fakeCadMachine = setup({
  schemas: { context: types<Context>(), events: eventSchemas<Event>() },
}).createMachine({
  id: 'fakeCad',
  initial: 'idle',
  context: {
    document: undefined,
    defaultView: undefined,
    lastProjection: undefined,
    latestRenderingOutcome: undefined,
    entryPath: 'assembly.json',
    rendering: undefined,
    committedRendering: undefined,
    lastRequestedRenderId: 0,
    lastSettledRenderId: 0,
    parkWhenIdle: false,
  },
  states: {
    idle: {
      on: {
        open: ({ event }) => ({
          context: { document: event.document, defaultView: event.view, lastProjection: undefined },
        }),
        projection: ({ event }) => ({
          context: {
            lastProjection: event.rendering,
            latestRenderingOutcome: event.rendering.success ? 'success' : 'failure',
          },
        }),
        assembly: ({ event }) => ({ context: event.context }),
        park: { target: 'parked' },
        request: { target: 'rendering' },
        fail: { target: 'error' },
      },
    },
    error: {},
    parked: {},
    rendering: {},
  },
});

const actorFixture = () => {
  const actor = createActor(fakeCadMachine).start();
  const asCadActor = actor as unknown as ActorRefFrom<typeof cadMachine>;
  const runtime = createMockRuntimeDocument();
  vi.mocked(runtime.view.rendering).mockImplementation(async () => {
    actor.send({ type: 'projection', rendering: runtime.rendering });
    return { superseded: false, rendering: runtime.rendering };
  });
  return { actor, asCadActor, runtime };
};

describe('awaitFreshRender document settlement', () => {
  it('waits for a pending document evaluation and its default view', async () => {
    const { actor, asCadActor, runtime } = actorFixture();
    let resolveEvaluation: ((value: { superseded: false; evaluation: typeof runtime.evaluation }) => void) | undefined;
    vi.mocked(runtime.document.evaluation).mockReturnValue(
      new Promise((resolve) => {
        resolveEvaluation = resolve;
      }),
    );
    actor.send({ type: 'open', document: runtime.document, view: runtime.view });

    const pending = awaitFreshRender(asCadActor, { awaitTimeout: 1000 });
    await vi.waitFor(() => {
      expect(runtime.document.evaluation).toHaveBeenCalledOnce();
    });
    expect(runtime.view.rendering).not.toHaveBeenCalled();
    resolveEvaluation?.({ superseded: false, evaluation: runtime.evaluation });
    const settled = await pending;

    expect(runtime.view.rendering).toHaveBeenCalledOnce();
    expect(settled.context.document).toBe(runtime.document);
    actor.stop();
  });

  it('settles a successful empty evaluation without pulling a view', async () => {
    const { actor, asCadActor, runtime } = actorFixture();
    const empty = { ...runtime.evaluation, views: [] };
    vi.mocked(runtime.document.evaluation).mockResolvedValue({ superseded: false, evaluation: empty });
    actor.send({ type: 'open', document: runtime.document });

    await expect(awaitFreshRender(asCadActor, { awaitTimeout: 100 })).resolves.toMatchObject({
      context: { document: runtime.document },
    });
    expect(runtime.view.rendering).not.toHaveBeenCalled();
    actor.stop();
  });

  it('returns a failed evaluation without waiting for a projection', async () => {
    const { actor, asCadActor, runtime } = actorFixture();
    vi.mocked(runtime.document.evaluation).mockResolvedValue({
      superseded: false,
      evaluation: { success: false, id: runtime.evaluation.id, transient: false, issues: [] },
    });
    actor.send({ type: 'open', document: runtime.document, view: runtime.view });

    await awaitFreshRender(asCadActor, { awaitTimeout: 100 });
    expect(runtime.view.rendering).not.toHaveBeenCalled();
    actor.stop();
  });

  it('settles a failed view and preserves the actor failure outcome', async () => {
    const { actor, asCadActor, runtime } = actorFixture();
    vi.mocked(runtime.view.rendering).mockImplementation(async () => {
      const outcome = {
        superseded: false,
        rendering: {
          success: false,
          requestId: 'failed',
          evaluationId: runtime.evaluation.id,
          transient: false,
          issues: [],
        },
      } as const;
      actor.send({ type: 'projection', rendering: outcome.rendering });
      return outcome;
    });
    actor.send({ type: 'open', document: runtime.document, view: runtime.view });

    const settled = await awaitFreshRender(asCadActor, { awaitTimeout: 100 });
    expect(settled.context.latestRenderingOutcome).toBe('failure');
    actor.stop();
  });

  it('returns the exact presented rendering source revision', async () => {
    const { actor, asCadActor, runtime } = actorFixture();
    const rendering: Rendering = {
      ...runtime.rendering,
      sourceRevision: { entry: 'main.ts', files: { 'main.ts': 'missing' } },
    };
    vi.mocked(runtime.view.rendering).mockImplementation(async () => {
      actor.send({ type: 'projection', rendering });
      return { superseded: false, rendering };
    });
    actor.send({ type: 'open', document: runtime.document, view: runtime.view });

    const settled = await awaitFreshRender(asCadActor, { awaitTimeout: 100 });
    expect(settled.context.lastProjection?.sourceRevision).toEqual(rendering.sourceRevision);
    actor.stop();
  });

  it('retries when the source document is replaced during evaluation', async () => {
    const { actor, asCadActor, runtime: first } = actorFixture();
    const second = createMockRuntimeDocument();
    vi.mocked(second.view.rendering).mockImplementation(async () => {
      actor.send({ type: 'projection', rendering: second.rendering });
      return { superseded: false, rendering: second.rendering };
    });
    let resolveFirst: ((value: { superseded: false; evaluation: typeof first.evaluation }) => void) | undefined;
    vi.mocked(first.document.evaluation).mockReturnValue(
      new Promise((resolve) => {
        resolveFirst = resolve;
      }),
    );
    actor.send({ type: 'open', document: first.document, view: first.view });

    const pending = awaitFreshRender(asCadActor, { awaitTimeout: 1000 });
    await vi.waitFor(() => {
      expect(first.document.evaluation).toHaveBeenCalledOnce();
    });
    actor.send({ type: 'open', document: second.document, view: second.view });
    resolveFirst?.({ superseded: false, evaluation: first.evaluation });
    const settled = await pending;

    expect(first.view.rendering).not.toHaveBeenCalled();
    expect(second.view.rendering).toHaveBeenCalledOnce();
    expect(settled.context.document).toBe(second.document);
    actor.stop();
  });

  it('rejects a closed document instead of presenting an old result', async () => {
    const { actor, asCadActor, runtime } = actorFixture();
    vi.mocked(runtime.document.evaluation).mockRejectedValue(new Error('document closed'));
    actor.send({ type: 'open', document: runtime.document, view: runtime.view });
    await expect(awaitFreshRender(asCadActor, { awaitTimeout: 100 })).rejects.toThrow('document closed');
    actor.stop();
  });

  it('classifies a missing document deadline with the operation timeout code', async () => {
    const { actor, asCadActor } = actorFixture();
    await expect(awaitFreshRender(asCadActor, { awaitTimeout: 10 })).rejects.toMatchObject({
      name: 'AwaitFreshOperationTimeoutError',
      code: 'OPERATION_TIMEOUT',
    });
    actor.stop();
  });

  it('uses the shared operation deadline by default', async () => {
    vi.useFakeTimers();
    const { actor, asCadActor } = actorFixture();
    try {
      const pending = awaitFreshRender(asCadActor);
      const assertion = expect(pending).rejects.toBeInstanceOf(AwaitFreshOperationTimeoutError);
      await vi.advanceTimersByTimeAsync(defaultOperationTimeout);
      await assertion;
    } finally {
      actor.stop();
      vi.useRealTimers();
    }
  });
});

const assemblyFixture = (): Context => {
  const root = {
    path: '.tau/artifacts/scene.json',
    digest: contentDigest({ value: `sha256:${'a'.repeat(64)}`, name: 'settled assembly root' }),
    byteLength: 123,
  };
  const record = publishedPartRecordSchema.parse({
    schemaVersion: 1,
    variants: { default: { source: { entry: 'part.ts', files: { 'part.ts': root.digest } }, glb: root } },
  });
  const variant = record.variants['default'];
  if (!variant) {
    throw new Error('Missing parsed assembly fixture variant');
  }
  const publication: PublishedAssembly = { schemaVersion: 1, parts: { part: record }, occurrences: [] };
  const admitted = Object.assign(mock<AdmittedAssembly>(), { publication, readAsset: vi.fn() });
  const document: CadAssemblyDisplay['document'] = {
    projection: 'assembly',
    root: variant.glb,
    admitted,
    exportPublished: vi.fn(),
    close: vi.fn(),
  };
  return {
    document: undefined,
    defaultView: undefined,
    lastProjection: undefined,
    latestRenderingOutcome: 'success',
    entryPath: 'assembly.json',
    rendering: undefined,
    committedRendering: undefined,
    committedAssemblyDisplay: { root, admitted, document },
    publishedAssemblyRoot: root,
    admittedAssembly: admitted,
    publishedAssembly: publication,
    publishedAssemblyEntryPath: 'assembly.json',
    lastRequestedRenderId: 1,
    lastSettledRenderId: 1,
    parkWhenIdle: false,
  };
};

describe('awaitFreshRender assembly settlement', () => {
  it('should return the actual current assembly snapshot without pulling an ordinary document or view', async () => {
    const { actor, asCadActor, runtime } = actorFixture();
    const context = assemblyFixture();
    actor.send({ type: 'assembly', context });
    try {
      const settled = await awaitFreshRender(asCadActor);
      expect(settled).toBe(actor.getSnapshot());
      expect(settled.context.committedAssemblyDisplay).toBe(context.committedAssemblyDisplay);
      expect(settled.context.document).toBeUndefined();
      expect(context.committedAssemblyDisplay?.document.root).not.toBe(context.publishedAssemblyRoot);
      expect(context.committedAssemblyDisplay?.document.root).toEqual(context.publishedAssemblyRoot);
      expect(runtime.document.evaluation).not.toHaveBeenCalled();
      expect(runtime.view.rendering).not.toHaveBeenCalled();
      expect(context.committedAssemblyDisplay?.document.exportPublished).not.toHaveBeenCalled();
      expect(context.committedAssemblyDisplay?.document.close).not.toHaveBeenCalled();
    } finally {
      actor.stop();
    }
  });

  it('should wait for the new request to settle instead of returning a retained assembly picture', async () => {
    const { actor, asCadActor } = actorFixture();
    const previous = assemblyFixture();
    actor.send({ type: 'assembly', context: { ...previous, lastRequestedRenderId: 2 } });
    const pending = awaitFreshRender(asCadActor);
    const current = assemblyFixture();
    actor.send({ type: 'assembly', context: { ...current, lastRequestedRenderId: 2, lastSettledRenderId: 2 } });
    try {
      const settled = await pending;
      expect(settled).toBe(actor.getSnapshot());
      expect(settled.context.committedAssemblyDisplay).toBe(current.committedAssemblyDisplay);
      expect(settled.context.committedAssemblyDisplay).not.toBe(previous.committedAssemblyDisplay);
    } finally {
      actor.stop();
    }
  });

  const invalidContexts: Array<{ name: string; invalidate(context: Context): Partial<Context> }> = [
    { name: 'pending request', invalidate: () => ({ lastRequestedRenderId: 2 }) },
    { name: 'unrequested picture', invalidate: () => ({ lastRequestedRenderId: 0, lastSettledRenderId: 0 }) },
    { name: 'failed outcome', invalidate: () => ({ latestRenderingOutcome: 'failure' }) },
    { name: 'missing outcome', invalidate: () => ({ latestRenderingOutcome: undefined }) },
    {
      name: 'replaced root',
      invalidate: (context) => {
        const { publishedAssemblyRoot: root } = context;
        if (!root) {
          throw new Error('Missing assembly fixture root');
        }
        return { publishedAssemblyRoot: { ...root } };
      },
    },
    { name: 'replaced admission', invalidate: () => ({ admittedAssembly: mock<AdmittedAssembly>() }) },
    {
      name: 'replaced publication',
      invalidate: () => ({ publishedAssembly: { schemaVersion: 1, parts: {}, occurrences: [] } }),
    },
    { name: 'changed entry', invalidate: () => ({ entryPath: 'replacement.json' }) },
    { name: 'missing entry', invalidate: () => ({ entryPath: undefined, publishedAssemblyEntryPath: undefined }) },
    { name: 'mismatched publication entry', invalidate: () => ({ publishedAssemblyEntryPath: 'replacement.json' }) },
    { name: 'released display', invalidate: () => ({ committedAssemblyDisplay: undefined }) },
    { name: 'pending park', invalidate: () => ({ parkWhenIdle: true }) },
    ...[
      { name: 'changed document path', root: { path: '.tau/artifacts/replaced.json' } },
      {
        name: 'changed document digest',
        root: {
          digest: contentDigest({ value: `sha256:${'b'.repeat(64)}`, name: 'changed document root' }),
        },
      },
      { name: 'changed document length', root: { byteLength: 124 } },
    ].map(({ name, root }: { name: string; root: Partial<PublishedPartAsset> }) => ({
      name,
      invalidate(context: Context): Partial<Context> {
        const { committedAssemblyDisplay: display } = context;
        if (!display) {
          throw new Error('Missing assembly fixture');
        }
        return {
          committedAssemblyDisplay: {
            ...display,
            document: { ...display.document, root: { ...display.document.root, ...root } },
          },
        };
      },
    })),
    {
      name: 'foreign document admission',
      invalidate: (context) => {
        const { committedAssemblyDisplay: display } = context;
        if (!display) {
          throw new Error('Missing assembly fixture');
        }
        return {
          committedAssemblyDisplay: {
            ...display,
            document: { ...display.document, admitted: mock<AdmittedAssembly>() },
          },
        };
      },
    },
  ];

  it.each(invalidContexts)('should deny a $name despite a retained assembly', async ({ invalidate }) => {
    vi.useFakeTimers();
    const { actor, asCadActor, runtime } = actorFixture();
    const context = assemblyFixture();
    actor.send({ type: 'assembly', context: { ...context, ...invalidate(context) } });
    try {
      const pending = awaitFreshRender(asCadActor);
      const assertion = expect(pending).rejects.toBeInstanceOf(AwaitFreshOperationTimeoutError);
      await vi.advanceTimersByTimeAsync(defaultOperationTimeout);
      await assertion;
      expect(runtime.document.evaluation).not.toHaveBeenCalled();
      expect(runtime.view.rendering).not.toHaveBeenCalled();
    } finally {
      actor.stop();
      vi.useRealTimers();
    }
  });

  it.each([
    { event: 'park', state: 'parked' },
    { event: 'request', state: 'rendering' },
  ])('should deny a retained assembly while $state', async ({ event }) => {
    vi.useFakeTimers();
    const { actor, asCadActor } = actorFixture();
    actor.send({ type: 'assembly', context: assemblyFixture() });
    if (event === 'park') {
      actor.send({ type: 'park' });
    } else {
      actor.send({ type: 'request' });
    }
    try {
      const pending = awaitFreshRender(asCadActor);
      const assertion = expect(pending).rejects.toBeInstanceOf(AwaitFreshOperationTimeoutError);
      await vi.advanceTimersByTimeAsync(defaultOperationTimeout);
      await assertion;
    } finally {
      actor.stop();
      vi.useRealTimers();
    }
  });

  it('should reject a stopped owner even when its last snapshot retained a settled assembly', async () => {
    const { actor, asCadActor } = actorFixture();
    actor.send({ type: 'assembly', context: assemblyFixture() });
    actor.stop();
    await expect(awaitFreshRender(asCadActor)).rejects.toThrow('The current CAD owner is inactive.');
  });

  it('should recheck the live pin when the initially settled snapshot is replaced before return', async () => {
    vi.useFakeTimers();
    const { actor, asCadActor } = actorFixture();
    const context = assemblyFixture();
    const { publishedAssemblyRoot: root } = context;
    if (!root) {
      throw new Error('Missing assembly fixture root');
    }
    actor.send({ type: 'assembly', context });
    try {
      const pending = awaitFreshRender(asCadActor);
      actor.send({ type: 'assembly', context: { publishedAssemblyRoot: { ...root } } });
      const assertion = expect(pending).rejects.toBeInstanceOf(AwaitFreshOperationTimeoutError);
      await vi.advanceTimersByTimeAsync(defaultOperationTimeout);
      await assertion;
    } finally {
      actor.stop();
      vi.useRealTimers();
    }
  });

  it('should preserve the actual error snapshot when a retained assembly fails', async () => {
    const { actor, asCadActor } = actorFixture();
    actor.send({ type: 'assembly', context: assemblyFixture() });
    actor.send({ type: 'fail' });
    try {
      expect(await awaitFreshRender(asCadActor)).toBe(actor.getSnapshot());
      expect(actor.getSnapshot().matches('error')).toBe(true);
    } finally {
      actor.stop();
    }
  });

  it('should honor an aborted caller even when the assembly is settled', async () => {
    const { actor, asCadActor } = actorFixture();
    actor.send({ type: 'assembly', context: assemblyFixture() });
    const controller = new AbortController();
    const reason = new Error('export caller aborted');
    controller.abort(reason);
    try {
      await expect(awaitFreshRender(asCadActor, { signal: controller.signal })).rejects.toBe(reason);
    } finally {
      actor.stop();
    }
  });
});
