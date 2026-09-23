import { createAsyncLogic, setup, types } from 'xstate';
import type { EnqueueObject, EventObject } from 'xstate';

import { eventSchemas } from '#lib/xstate.lib.js';

export type ThumbnailKind = 'automatic-thumbnail' | 'manual-thumbnail';
export type ThumbnailSkipReason = 'svg-source' | 'superseded' | 'locator-changed';

export type ThumbnailResult =
  | Readonly<{ status: 'stored'; kind: ThumbnailKind; identity: string }>
  | Readonly<{ status: 'skipped'; kind: ThumbnailKind; identity: string; reason: ThumbnailSkipReason }>
  | Readonly<{ status: 'failed'; kind: ThumbnailKind; error: unknown }>;

export type ThumbnailRenderRequest = {
  readonly kind: ThumbnailKind;
  /** Exact settled identity for automatic work; manual work reads the latest model. */
  readonly identity?: string;
  /** Actor-owned cancellation for render and downstream service work. */
  readonly signal: AbortSignal;
};

/** Injected side effects + tuning for {@link thumbnailMachine}. */
export type ThumbnailInput = {
  /** Render the requested automatic or manual thumbnail to encoded bytes. */
  render: (
    request: ThumbnailRenderRequest,
  ) => Promise<ThumbnailArtifact | Readonly<{ status: 'skipped'; identity: string; reason: 'svg-source' }>>;
  /** Persist the bytes. */
  store: (
    artifact: ThumbnailArtifact,
  ) => Promise<
    Readonly<{ status: 'stored' }> | Readonly<{ status: 'skipped'; reason: 'superseded' | 'locator-changed' }>
  >;
  /** Reports the terminal result of each explicitly requested regeneration. */
  onManualResult?: (result: ThumbnailResult) => void;
  /** Debounce window after the latest automatic settle. Milliseconds (default 1000). */
  debounceDelay?: number;
};

export type ThumbnailArtifact = {
  readonly bytes: Uint8Array<ArrayBuffer>;
  readonly identity: string;
  readonly generation: number;
  /** Filesystem route captured before rendering; rechecked immediately before commit. */
  readonly locatorIdentity: string;
};

type ThumbnailContext = Required<Omit<ThumbnailInput, 'debounceDelay'>> & {
  readonly debounceDelay: number;
  pendingAutomaticHash: string | undefined;
  activeHash: string | undefined;
  activeKind: ThumbnailKind | undefined;
  pendingManualCount: number;
  lastRenderedHash: string | undefined;
};

/** Events driving {@link thumbnailMachine}. */
export type ThumbnailEvent = { type: 'settled'; hash: string } | { type: 'regenerate' };

type ThumbnailEnqueue = EnqueueObject<ThumbnailEvent, EventObject>;

const rememberLatestAutomatic = (
  context: ThumbnailContext,
  event: Extract<ThumbnailEvent, { type: 'settled' }>,
): Partial<ThumbnailContext> =>
  event.hash === context.activeHash || event.hash === context.lastRenderedHash
    ? { pendingAutomaticHash: undefined }
    : { pendingAutomaticHash: event.hash };

const startManual = { activeHash: undefined, activeKind: 'manual-thumbnail' } satisfies Partial<ThumbnailContext>;
const clearActive = { activeHash: undefined, activeKind: undefined } satisfies Partial<ThumbnailContext>;

const reportManualResult = (context: ThumbnailContext, enq: ThumbnailEnqueue, result: ThumbnailResult): void => {
  if (result.kind === 'manual-thumbnail') {
    enq(() => context.onManualResult(result));
  }
};

/** Milliseconds. */
const defaultDebounceDelay = 1000;

export const thumbnailMachine = setup({
  schemas: {
    input: types<ThumbnailInput>(),
    context: types<ThumbnailContext>(),
    events: eventSchemas<ThumbnailEvent>(),
  },
  actors: {
    renderAndStore: createAsyncLogic<
      Exclude<ThumbnailResult, { readonly status: 'failed' }>,
      Pick<ThumbnailContext, 'render' | 'store' | 'activeKind' | 'activeHash'>
    >({
      run: async ({ input, signal }) => {
        if (!input.activeKind) {
          throw new Error('Thumbnail render started without an active kind');
        }
        const rendered = await input.render({
          kind: input.activeKind,
          signal,
          ...(input.activeKind === 'automatic-thumbnail' && input.activeHash ? { identity: input.activeHash } : {}),
        });
        signal.throwIfAborted();
        if ('status' in rendered) {
          return { ...rendered, kind: input.activeKind };
        }
        const stored = await input.store(rendered);
        return stored.status === 'stored'
          ? { status: 'stored', kind: input.activeKind, identity: rendered.identity }
          : { status: 'skipped', kind: input.activeKind, identity: rendered.identity, reason: stored.reason };
      },
    }),
  },
  guards: {
    hasPendingManual: (context: ThumbnailContext) => context.pendingManualCount > 0,
    hasPendingAutomatic: (context: ThumbnailContext) =>
      context.pendingAutomaticHash !== undefined && context.pendingAutomaticHash !== context.lastRenderedHash,
  },
  delays: {
    debounce: ({ context }) => context.debounceDelay,
  },
}).createMachine({
  id: 'thumbnail',
  context: ({ input }) => ({
    render: input.render,
    store: input.store,
    onManualResult: input.onManualResult ?? (() => undefined),
    debounceDelay: input.debounceDelay ?? defaultDebounceDelay,
    pendingAutomaticHash: undefined,
    activeHash: undefined,
    activeKind: undefined,
    pendingManualCount: 0,
    lastRenderedHash: undefined,
  }),
  initial: 'idle',
  states: {
    idle: {
      on: {
        settled: ({ context, event }) =>
          event.hash === context.lastRenderedHash
            ? undefined
            : { target: 'debouncing', context: rememberLatestAutomatic(context, event) },
        regenerate: { target: 'rendering', context: startManual },
      },
    },
    debouncing: {
      on: {
        settled: ({ context, event }) =>
          event.hash === context.lastRenderedHash
            ? { target: 'idle', context: { pendingAutomaticHash: undefined } }
            : { target: 'debouncing', reenter: true, context: rememberLatestAutomatic(context, event) },
        regenerate: { target: 'rendering', context: startManual },
      },
      after: {
        debounce: {
          target: 'rendering',
          context: ({ context }) => ({
            activeHash: context.pendingAutomaticHash,
            activeKind: 'automatic-thumbnail',
            pendingAutomaticHash: undefined,
          }),
        },
      },
    },
    rendering: {
      on: {
        settled: { context: ({ context, event }) => rememberLatestAutomatic(context, event) },
        regenerate: { context: ({ context }) => ({ pendingManualCount: context.pendingManualCount + 1 }) },
      },
      invoke: {
        src: 'renderAndStore',
        input: ({ context }) => ({
          render: context.render,
          store: context.store,
          activeKind: context.activeKind,
          activeHash: context.activeHash,
        }),
        onDone: ({ context, event }, enq) => {
          reportManualResult(context, enq, event.output);
          return event.output.status === 'stored'
            ? {
                target: 'routing',
                context: { activeHash: undefined, activeKind: undefined, lastRenderedHash: event.output.identity },
              }
            : { target: 'routing', context: clearActive };
        },
        onError: ({ context, event }, enq) => {
          if (context.activeKind === 'manual-thumbnail') {
            enq(() => context.onManualResult({ status: 'failed', kind: 'manual-thumbnail', error: event.error }));
          }
          return { target: 'routing', context: clearActive };
        },
      },
    },
    routing: {
      always: ({ context, guards }) => {
        if (guards.hasPendingManual(context)) {
          return {
            target: 'rendering',
            context: {
              activeHash: undefined,
              activeKind: 'manual-thumbnail',
              pendingManualCount: context.pendingManualCount - 1,
            },
          };
        }
        if (guards.hasPendingAutomatic(context)) {
          return { target: 'debouncing' };
        }
        return { target: 'idle', context: { pendingAutomaticHash: undefined } };
      },
    },
  },
});
