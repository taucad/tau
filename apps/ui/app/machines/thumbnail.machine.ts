import { assign, fromPromise, setup } from 'xstate';

export type ThumbnailKind = 'automatic-thumbnail' | 'manual-thumbnail';

export type ThumbnailRenderRequest = {
  readonly kind: ThumbnailKind;
  /** Exact settled identity for automatic work; manual work reads the latest model. */
  readonly identity?: string;
};

/** Injected side effects + tuning for {@link thumbnailMachine}. */
export type ThumbnailInput = {
  /** Render the requested automatic or manual thumbnail to encoded bytes. */
  render: (request: ThumbnailRenderRequest) => Promise<ThumbnailArtifact>;
  /** Persist the bytes. */
  store: (artifact: ThumbnailArtifact) => Promise<void>;
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

/** Milliseconds. */
const defaultDebounceDelay = 1000;

export const thumbnailMachine = setup({
  types: {
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate setup
    input: {} as ThumbnailInput,
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate setup
    context: {} as ThumbnailContext,
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate setup
    events: {} as ThumbnailEvent,
  },
  actors: {
    renderAndStore: fromPromise<
      ThumbnailArtifact,
      Pick<ThumbnailContext, 'render' | 'store' | 'activeKind' | 'activeHash'>
    >(async ({ input }) => {
      if (!input.activeKind) {
        throw new Error('Thumbnail render started without an active kind');
      }
      const artifact = await input.render({
        kind: input.activeKind,
        ...(input.activeKind === 'automatic-thumbnail' && input.activeHash ? { identity: input.activeHash } : {}),
      });
      await input.store(artifact);
      return artifact;
    }),
  },
  actions: {
    rememberLatestAutomatic: assign(({ context, event }) => {
      if (event.type !== 'settled') {
        return {};
      }
      if (event.hash === context.activeHash || event.hash === context.lastRenderedHash) {
        return { pendingAutomaticHash: undefined };
      }
      return { pendingAutomaticHash: event.hash };
    }),
    clearAutomatic: assign({ pendingAutomaticHash: undefined }),
    startAutomatic: assign(({ context }) => ({
      activeHash: context.pendingAutomaticHash,
      activeKind: 'automatic-thumbnail',
      pendingAutomaticHash: undefined,
    })),
    startManual: assign({ activeHash: undefined, activeKind: 'manual-thumbnail' }),
    queueManual: assign(({ context }) => ({ pendingManualCount: context.pendingManualCount + 1 })),
    startQueuedManual: assign(({ context }) => ({
      activeHash: undefined,
      activeKind: 'manual-thumbnail',
      pendingManualCount: context.pendingManualCount - 1,
    })),
    commitRendered: assign((_, params: { readonly identity: string }) => ({
      activeHash: undefined,
      activeKind: undefined,
      lastRenderedHash: params.identity,
    })),
    clearActive: assign({ activeHash: undefined, activeKind: undefined }),
  },
  guards: {
    isNewAutomatic: ({ context, event }) => event.type === 'settled' && event.hash !== context.lastRenderedHash,
    isAlreadyRendered: ({ context, event }) => event.type === 'settled' && event.hash === context.lastRenderedHash,
    hasPendingManual: ({ context }) => context.pendingManualCount > 0,
    hasPendingAutomatic: ({ context }) =>
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
        settled: {
          guard: 'isNewAutomatic',
          target: 'debouncing',
          actions: 'rememberLatestAutomatic',
        },
        regenerate: { target: 'rendering', actions: 'startManual' },
      },
    },
    debouncing: {
      on: {
        settled: [
          {
            guard: 'isAlreadyRendered',
            target: 'idle',
            actions: 'clearAutomatic',
          },
          {
            target: 'debouncing',
            reenter: true,
            actions: 'rememberLatestAutomatic',
          },
        ],
        regenerate: { target: 'rendering', actions: 'startManual' },
      },
      after: {
        debounce: { target: 'rendering', actions: 'startAutomatic' },
      },
    },
    rendering: {
      on: {
        settled: { actions: 'rememberLatestAutomatic' },
        regenerate: { actions: 'queueManual' },
      },
      invoke: {
        src: 'renderAndStore',
        input: ({ context }) => ({
          render: context.render,
          store: context.store,
          activeKind: context.activeKind,
          activeHash: context.activeHash,
        }),
        onDone: {
          target: 'routing',
          actions: {
            type: 'commitRendered',
            params: ({ event }) => ({ identity: event.output.identity }),
          },
        },
        onError: { target: 'routing', actions: 'clearActive' },
      },
    },
    routing: {
      always: [
        { guard: 'hasPendingManual', target: 'rendering', actions: 'startQueuedManual' },
        { guard: 'hasPendingAutomatic', target: 'debouncing' },
        { target: 'idle', actions: 'clearAutomatic' },
      ],
    },
  },
});
