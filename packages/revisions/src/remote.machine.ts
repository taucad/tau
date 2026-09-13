/**
 * `remote.machine` — one project's remote connection (S34, A23, architecture L2).
 *
 * A project has at most one remote at a time and connecting to it is a
 * sequence, not a setting: choose a kind, get the authority the kind needs,
 * check the remote actually answers, bring the two graphs together once, and
 * only then say *Backed up*. Every step can fail on its own, and failing leaves
 * the user with a remote they can retry or remove — never a half-connected
 * project that silently stops syncing.
 *
 * Two things this machine deliberately does not hold:
 *
 * - **A credential.** `authorize` resolves a *reference* the host understands
 *   (I8); the `Authorization` header is set by the `HttpClient` from the
 *   session at request time and never stored, never put in a URL, never
 *   written under a project.
 * - **A second copy of the remotes list.** `readRemote` rehydrates from git's
 *   own config (D29: records, not snapshots), which is also what a stock `git
 *   remote -v` shows.
 *
 * All three kinds are live: *No remote*, *Tau Cloud* and a third-party *Git
 * remote*, whose credential is the GitHub sign-in on the session and whose
 * requests reach the remote only through the API's git proxy (S34, P17).
 */

import { assign, emit, fromPromise, raise, setup } from 'xstate';
import type { SnapshotFrom } from 'xstate';

import type { RemoteKind, RemoteReauthorizationCode } from '#remotes.js';

/** Which remote a project is connected to, and what it costs. @public */
export type RemoteFacet = Readonly<{
  kind: RemoteKind | 'none';
  url: string | undefined;
  /** Where the connection is, for the Sync row's own copy. */
  phase: 'none' | 'connecting' | 'connected' | 'failed' | 'disconnecting' | 'reconnectRequired';
  /** Bytes stored and allowed, when the remote reports them (S35). */
  storage: Readonly<{ used: number; quota: number }> | undefined;
  /** Files a refused push named as over the plan (D16, AC16). */
  overQuota: readonly string[];
  /** The last failure, already safe to render. */
  error: string | undefined;
}>;

/** One remote as this machine records it. @public */
export type RemoteRecord = Readonly<{ name: string; url: string; kind: RemoteKind }>;

/** Input accepted when creating the remoteMachine actor. @public */
export type RemoteMachineInput = Readonly<{
  projectId: string;
  /** The branch the initial sync pushes. Defaults to `main`. */
  branch?: string;
}>;

/** Serializable state owned by remoteMachine. @public */
export type RemoteMachineContext = Readonly<{
  projectId: string;
  branch: string;
  kind: RemoteKind | 'none';
  remote: RemoteRecord | undefined;
  storage: Readonly<{ used: number; quota: number }> | undefined;
  overQuota: readonly string[];
  error: string | undefined;
}>;

/** Events accepted by remoteMachine. @public */
export type RemoteMachineEvent =
  /** The user picked a kind. `'none'` disconnects whatever is connected. */
  | Readonly<{ type: 'connect'; kind: RemoteKind | 'none'; url?: string }>
  /**
   * A host whose authorization finished out of band says so (P22).
   *
   * The browser does not send it: it takes consent in a pop-up *before* it
   * sends `connect`, because a SharedWorker with no clients is terminable and
   * the actor tree cannot be relied on to survive a redirect. The senders this
   * seam exists for are the ones the architecture names — the desktop keychain
   * actor and the CLI credential helper, whose `authorize` actor resolves out
   * of band — and W13's Node remote wiring. It is also how
   * `reconnectRequired` is retried without rewriting the remote.
   */
  | Readonly<{ type: 'authorized' }>
  /** A host that validated the remote itself says so. */
  | Readonly<{ type: 'validated'; storage?: Readonly<{ used: number; quota: number }> }>
  | Readonly<{ type: 'disconnect' }>
  | Readonly<{ type: 'cancel' }>
  /**
   * A push the remote refused for storage (D16).
   *
   * Not in the architecture's event list, and needed by it: the Sync region
   * renders the over-quota file list, and the refusal happens during a push
   * (`sync.machine`, W13), not during a connection.
   */
  | Readonly<{ type: 'quotaRefused'; paths: readonly string[]; used?: number; quota?: number }>;

/** Facts remoteMachine emits for a host that holds only the root. @public */
export type RemoteMachineEmitted =
  | Readonly<{ type: 'remoteConnected'; kind: RemoteKind; url: string }>
  | Readonly<{ type: 'remoteDisconnected' }>
  | Readonly<{ type: 'toast.info'; message: string }>
  | Readonly<{ type: 'toast.error'; message: string }>;

/** What `readRemote` answers: the remote git's config already holds. @public */
export type RemoteReadActorOutput = Readonly<{ remote: RemoteRecord | undefined }>;

/** What `writeRemote` is asked to record. @public */
export type RemoteWriteActorInput = Readonly<{ projectId: string; kind: RemoteKind; url: string | undefined }>;

/** What `writeRemote` answers: the remote as it was recorded. @public */
export type RemoteWriteActorOutput = Readonly<{ remote: RemoteRecord }>;

/** What `authorize` is asked for, and what it may answer. @public */
export type RemoteAuthorizeActorInput = Readonly<{ kind: RemoteKind; url: string }>;

/** What `validate` is asked for. @public */
export type RemoteValidateActorInput = Readonly<{ remote: string; url: string }>;

/** What `validate` answers: the remote answered, and what it costs. @public */
export type RemoteValidateActorOutput = Readonly<{ storage?: Readonly<{ used: number; quota: number }> }>;

/** What the initial sync is asked to do. @public */
export type RemoteInitialSyncActorInput = Readonly<{ remote: string; branch: string }>;

/**
 * What the initial sync answers.
 *
 * A remote that refused *large objects* for storage did not refuse the
 * connection: the history is on the remote, the files that did not fit are
 * named, and the project stays connected with the list in front of the person
 * (D16, AC16, P19). A refusal the person cannot act on is a failure; this one
 * they can, by upgrading the plan or removing the file.
 *
 * @public
 */
export type RemoteInitialSyncActorOutput = Readonly<{
  /** Project-relative paths the remote would not store. */
  overQuota?: readonly string[];
  /** The server's own words, for the toast. */
  message?: string;
}>;

const defaultBranch = 'main';

/*
 * The failure that means "grant the credential again", not "the remote is
 * broken". The literal is written here rather than imported because a machine
 * may import only *types* from this package's contracts (I20, AC22); the
 * `RemoteReauthorizationCode` annotation is what keeps the two spellings from
 * drifting.
 */
const reauthorizationRequiredCode: RemoteReauthorizationCode = 'REMOTE_REAUTHORIZATION_REQUIRED';

const isReauthorizationRequired = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && (error as { code?: unknown }).code === reauthorizationRequiredCode;

const unsupported = async (): Promise<never> => {
  await Promise.resolve();
  throw new Error('This host provided no remote actors; `remoteMachine.provide` supplies them.');
};

const reason = (error: unknown): string =>
  error instanceof Error ? error.message : 'The remote could not be reached.';

/**
 * Headless remote connection for one project.
 *
 * @public
 * @example <caption>Connect a project to Tau Cloud</caption>
 * ```typescript
 * import { createActor } from 'xstate';
 * import { remoteMachine } from '@taucad/revisions/remote-machine';
 * import type { RemoteActors } from '@taucad/revisions/remote-machine';
 *
 * declare const hostActors: RemoteActors;
 * const actor = createActor(remoteMachine.provide({ actors: hostActors }), { input: { projectId: 'p1' } });
 * actor.start();
 * actor.send({ type: 'connect', kind: 'tau' });
 * ```
 */
export const remoteMachine = setup({
  types: {
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- XState setup typing.
    context: {} as RemoteMachineContext,
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- XState setup typing.
    events: {} as RemoteMachineEvent,
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- XState setup typing.
    emitted: {} as RemoteMachineEmitted,
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- XState setup typing.
    input: {} as RemoteMachineInput,
  },
  actors: {
    /** What git's own remotes list already says (D29: rehydrate from records). */
    readRemote: fromPromise<RemoteReadActorOutput, Readonly<{ projectId: string }>>(unsupported),
    writeRemote: fromPromise<RemoteWriteActorOutput, RemoteWriteActorInput>(unsupported),
    removeRemote: fromPromise<void, Readonly<{ name: string }>>(unsupported),
    /** Resolves the *reference* the host will authenticate with, never a secret (I8). */
    authorize: fromPromise<void, RemoteAuthorizeActorInput>(unsupported),
    validate: fromPromise<RemoteValidateActorOutput, RemoteValidateActorInput>(unsupported),
    initialSync: fromPromise<RemoteInitialSyncActorOutput, RemoteInitialSyncActorInput>(unsupported),
  },
  guards: {
    choseNone: (_, params: Readonly<{ kind: RemoteKind | 'none' }>) => params.kind === 'none',
  },
  actions: {
    failWith: assign({ error: (_, params: Readonly<{ error: string }>) => params.error }),
  },
}).createMachine({
  id: 'remote',
  context: ({ input }) => ({
    projectId: input.projectId,
    branch: input.branch ?? defaultBranch,
    kind: 'none',
    remote: undefined,
    storage: undefined,
    overQuota: [],
    error: undefined,
  }),
  initial: 'reading',
  states: {
    /**
     * What this project is already connected to.
     *
     * The remotes list is the record, so a reopened project is connected
     * without anybody replaying a snapshot — and a `git remote add` somebody
     * typed by hand is picked up for free.
     */
    reading: {
      invoke: {
        src: 'readRemote',
        input: ({ context }) => ({ projectId: context.projectId }),
        onDone: [
          {
            guard: ({ event }) => event.output.remote !== undefined,
            target: 'connected',
            actions: assign({
              remote: ({ event }) => event.output.remote,
              kind: ({ event }) => event.output.remote?.kind ?? 'none',
            }),
          },
          { target: 'none' },
        ],
        onError: {
          target: 'failed',
          actions: { type: 'failWith', params: ({ event }) => ({ error: reason(event.error) }) },
        },
      },
    },

    none: {
      on: {
        connect: [
          { guard: { type: 'choseNone', params: ({ event }) => ({ kind: event.kind }) } },
          { target: 'choosing', actions: assign({ kind: ({ event }) => event.kind, error: undefined }) },
        ],
      },
    },

    /** The choice, recorded in git's remotes list before anything is asked of it. */
    choosing: {
      invoke: {
        src: 'writeRemote',
        input: ({ context, event }) => ({
          projectId: context.projectId,
          kind: context.kind === 'none' ? 'tau' : context.kind,
          url: event.type === 'connect' ? event.url : context.remote?.url,
        }),
        onDone: { target: 'authorizing', actions: assign({ remote: ({ event }) => event.output.remote }) },
        onError: {
          target: 'failed',
          actions: { type: 'failWith', params: ({ event }) => ({ error: reason(event.error) }) },
        },
      },
      /* Nothing has been written yet, so there is nothing to remove: going
       * through `disconnecting` would ask the port to remove a remote with no
       * name and land the person in `failed` over their own Cancel. */
      on: { cancel: { target: 'none', actions: assign({ kind: 'none', error: undefined }) } },
    },

    /**
     * The authority this kind of remote needs.
     *
     * Tau Cloud already has one — the session the `HttpClient` carries — and a
     * GitHub remote has one by the time `connect` arrives, because the page
     * opens its consent popup *before* it sends the event (W12). `authorized`
     * stays an event as well as a completion for a host whose consent finishes
     * out of band, and it is how `reconnectRequired` is retried.
     */
    authorizing: {
      invoke: {
        src: 'authorize',
        input: ({ context }) => ({
          kind: context.kind === 'none' ? 'tau' : context.kind,
          url: context.remote?.url ?? '',
        }),
        onDone: { target: 'validating' },
        onError: [
          {
            guard: ({ event }) => isReauthorizationRequired(event.error),
            target: 'reconnectRequired',
            actions: { type: 'failWith', params: ({ event }) => ({ error: reason(event.error) }) },
          },
          { target: 'failed', actions: { type: 'failWith', params: ({ event }) => ({ error: reason(event.error) }) } },
        ],
      },
      on: { authorized: { target: 'validating' }, cancel: { target: 'disconnecting' } },
    },

    /** Does the remote answer, and what does it say this project costs? */
    validating: {
      invoke: {
        src: 'validate',
        input: ({ context }) => ({ remote: context.remote?.name ?? '', url: context.remote?.url ?? '' }),
        onDone: { target: 'initialSync', actions: assign({ storage: ({ event }) => event.output.storage }) },
        onError: [
          {
            guard: ({ event }) => isReauthorizationRequired(event.error),
            target: 'reconnectRequired',
            actions: { type: 'failWith', params: ({ event }) => ({ error: reason(event.error) }) },
          },
          { target: 'failed', actions: { type: 'failWith', params: ({ event }) => ({ error: reason(event.error) }) } },
        ],
      },
      on: {
        validated: { target: 'initialSync', actions: assign({ storage: ({ event }) => event.storage }) },
        cancel: { target: 'disconnecting' },
      },
    },

    /** Once, at connect time: everything after this is `sync.machine`'s debounce (W13). */
    initialSync: {
      invoke: {
        src: 'initialSync',
        input: ({ context }) => ({ remote: context.remote?.name ?? '', branch: context.branch }),
        onDone: [
          {
            /* The history landed and some files did not fit. The connection is
             * real, so this is `connected` with the list — and it arrives the
             * one way `overQuota` is ever written: as `quotaRefused`, raised
             * here and handled in `connected`, which is also the event W13's
             * `sync.machine` forwards for every later push (P19). */
            guard: ({ event }) => (event.output.overQuota ?? []).length > 0,
            target: 'connected',
            actions: [
              emit(
                ({ context }): RemoteMachineEmitted => ({
                  type: 'remoteConnected',
                  kind: context.kind === 'none' ? 'tau' : context.kind,
                  url: context.remote?.url ?? '',
                }),
              ),
              emit(
                ({ event }): RemoteMachineEmitted => ({
                  type: 'toast.error',
                  message: event.output.message ?? 'Some files are over this project’s storage plan.',
                }),
              ),
              raise(({ event }): RemoteMachineEvent => ({ type: 'quotaRefused', paths: event.output.overQuota ?? [] })),
            ],
          },
          {
            target: 'connected',
            actions: [
              emit(
                ({ context }): RemoteMachineEmitted => ({
                  type: 'remoteConnected',
                  /* A kind was chosen to reach `connected`, so `'none'` is not
                   * reachable here; the fallback keeps the type honest. */
                  kind: context.kind === 'none' ? 'tau' : context.kind,
                  url: context.remote?.url ?? '',
                }),
              ),
              emit((): RemoteMachineEmitted => ({ type: 'toast.info', message: 'This project is backed up.' })),
            ],
          },
        ],
        onError: [
          {
            guard: ({ event }) => isReauthorizationRequired(event.error),
            target: 'reconnectRequired',
            actions: { type: 'failWith', params: ({ event }) => ({ error: reason(event.error) }) },
          },
          {
            target: 'failed',
            actions: [
              { type: 'failWith', params: ({ event }) => ({ error: reason(event.error) }) },
              emit(({ event }): RemoteMachineEmitted => ({ type: 'toast.error', message: reason(event.error) })),
            ],
          },
        ],
      },
      on: { cancel: { target: 'disconnecting' } },
    },

    connected: {
      on: {
        disconnect: { target: 'disconnecting' },
        connect: [
          { guard: { type: 'choseNone', params: ({ event }) => ({ kind: event.kind }) }, target: 'disconnecting' },
          { target: 'choosing', actions: assign({ kind: ({ event }) => event.kind, error: undefined }) },
        ],
        /* A refused push is the one thing that makes a connected remote say
         * something: which files would not fit (D16, AC16). */
        quotaRefused: {
          actions: assign({
            overQuota: ({ event }) => event.paths,
            storage: ({ context, event }) =>
              event.used === undefined || event.quota === undefined
                ? context.storage
                : { used: event.used, quota: event.quota },
          }),
        },
      },
    },

    /** Disconnecting keeps every revision: only the name for the remote goes. */
    disconnecting: {
      invoke: {
        src: 'removeRemote',
        input: ({ context }) => ({ name: context.remote?.name ?? '' }),
        onDone: {
          target: 'none',
          actions: [
            assign({ remote: undefined, kind: 'none', storage: undefined, overQuota: [], error: undefined }),
            emit((): RemoteMachineEmitted => ({ type: 'remoteDisconnected' })),
          ],
        },
        onError: {
          target: 'failed',
          actions: { type: 'failWith', params: ({ event }) => ({ error: reason(event.error) }) },
        },
      },
    },

    /**
     * The remote is right; the credential for it is not any more.
     *
     * Separate from `failed` because the answer is different: the remote stays
     * recorded, nothing is retried behind the person's back, and the row asks
     * for the one thing that fixes it. `authorized` is what a host sends once
     * the consent it opened came back — the credential is resolved per request,
     * so re-validating is the whole retry.
     */
    reconnectRequired: {
      on: {
        authorized: { target: 'validating', actions: assign({ error: undefined }) },
        connect: [
          { guard: { type: 'choseNone', params: ({ event }) => ({ kind: event.kind }) }, target: 'disconnecting' },
          { target: 'choosing', actions: assign({ kind: ({ event }) => event.kind, error: undefined }) },
        ],
        disconnect: { target: 'disconnecting' },
      },
    },

    failed: {
      on: {
        connect: [
          { guard: { type: 'choseNone', params: ({ event }) => ({ kind: event.kind }) }, target: 'disconnecting' },
          { target: 'choosing', actions: assign({ kind: ({ event }) => event.kind, error: undefined }) },
        ],
        disconnect: { target: 'disconnecting' },
      },
    },
  },
});

/** The actor set `remoteMachine.provide` needs. @public */
export type RemoteActors = NonNullable<Parameters<typeof remoteMachine.provide>[0]['actors']>;

const phaseOf = (value: string): RemoteFacet['phase'] => {
  switch (value) {
    case 'connected': {
      return 'connected';
    }
    case 'failed': {
      return 'failed';
    }
    case 'reconnectRequired': {
      return 'reconnectRequired';
    }
    case 'disconnecting': {
      return 'disconnecting';
    }
    case 'none':
    case 'reading': {
      return 'none';
    }
    default: {
      return 'connecting';
    }
  }
};

/**
 * The Sync region's whole input, read where it lives.
 *
 * @param snapshot - Current remote snapshot.
 * @returns The facet the pane and the projection carry.
 * @public
 */
export const selectRemoteFacet = (snapshot: SnapshotFrom<typeof remoteMachine>): RemoteFacet => ({
  kind: snapshot.context.kind,
  url: snapshot.context.remote?.url,
  phase: phaseOf(String(snapshot.value)),
  storage: snapshot.context.storage,
  overQuota: snapshot.context.overQuota,
  error: snapshot.context.error,
});
