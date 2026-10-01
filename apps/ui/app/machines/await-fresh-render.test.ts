import { describe, expect, it, vi } from 'vitest';
import { createActor, setup, types } from 'xstate';
import type { ActorRefFrom } from 'xstate';
import type { Rendering, RuntimeDocument, ViewSubscription } from '@taucad/runtime';
import { createMockRuntimeDocument } from '@taucad/runtime-testing';
import { eventSchemas } from '#lib/xstate.lib.js';
import { defaultOperationTimeout } from '#constants/editor.constants.js';
import { awaitFreshRender, AwaitFreshOperationTimeoutError } from '#machines/await-fresh-render.js';
import type { cadMachine } from '#machines/cad.machine.js';

type Context = {
  document: RuntimeDocument | undefined;
  defaultView: ViewSubscription | undefined;
  lastProjection: Rendering | undefined;
  latestRenderingOutcome: 'success' | 'failure' | undefined;
};
type Event =
  | { type: 'open'; document: RuntimeDocument; view?: ViewSubscription }
  | { type: 'projection'; rendering: Rendering }
  | { type: 'fail' };

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
        fail: { target: 'error' },
      },
    },
    error: {},
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
