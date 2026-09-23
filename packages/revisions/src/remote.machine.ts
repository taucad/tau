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

import { createAsyncLogic, setup, types } from 'xstate';
import type { AnyActorRef, EnqueueObject, SnapshotFrom } from 'xstate';

import { eventSchemas } from '#machine-schemas.js';
import type { MachineActors } from '#machine-schemas.js';
import { syncFailureReason } from '#sync.machine.js';
import type { SyncFailureReason } from '#sync.machine.js';
import type { RemoteKind, RemoteReauthorizationCode } from '#remotes.js';
import type { RemoteStorageRefusal } from '#revision-port.js';

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
  /**
   * The numbers that came with that refusal, when the remote sent them (C13).
   *
   * Distinct from {@link RemoteFacet.storage}, which is a `{ used, quota }`
   * pair no host has ever filled in: these are what the Tau API's LFS batch
   * refusal actually carries, and they were parsed and then dropped one hop
   * before the Sync region could render them.
   */
  quota: RemoteStorageRefusal | undefined;
  /** The last failure, already safe to render. */
  error: string | undefined;
  /**
   * What class of failure that was, from `sync.machine`'s own classifier.
   *
   * Rule 19 asks every surface showing a remote failure for exactly one action
   * matching its class. Without this the *connect* path had only a sentence, so
   * the `403 GIT_SYNC_NOT_ENTITLED` that opened this closeout could offer only
   * *Retry* on connect where the identical refusal on a push offered *Upgrade*.
   * `undefined` whenever {@link RemoteFacet.error} is, so a surface never shows
   * a class with no sentence beside it.
   */
  reason: SyncFailureReason | undefined;
  /** True when this project may fetch but must never push to the remote. */
  fetchOnly: boolean;
  provider: 'github' | undefined;
  repositoryId: string | undefined;
}>;

/** One remote as this machine records it. @public */
export type RemoteRecord = Readonly<{
  name: string;
  url: string;
  kind: RemoteKind;
  provider?: 'github';
  repositoryId?: string;
  fetchOnly?: boolean;
}>;

/** Input accepted when creating the remoteMachine actor. @public */
export type RemoteMachineInput = Readonly<{
  projectId: string;
  /** The branch the initial sync pushes. Defaults to `main`. */
  branch?: string;
  /** The root, so `sync` hears connect/disconnect through it (A38, P53). */
  parentRef?: AnyActorRef;
}>;

/** Serializable state owned by remoteMachine. @public */
export type RemoteMachineContext = Readonly<{
  projectId: string;
  parentRef: AnyActorRef | undefined;
  branch: string;
  kind: RemoteKind | 'none';
  remote: RemoteRecord | undefined;
  storage: Readonly<{ used: number; quota: number }> | undefined;
  quota: RemoteStorageRefusal | undefined;
  overQuota: readonly string[];
  error: string | undefined;
  /** The class of {@link RemoteMachineContext.error}, for the facet (rule 19). */
  reason: SyncFailureReason | undefined;
  /**
   * This attempt wrote the remote into git's config and has not finished (C10).
   *
   * The config write happens in `choosing`, before `authorize`, `validate` or
   * the first sync has asked the remote anything — which is what makes the
   * connect sequence recoverable. What it also made possible was a *failed*
   * attempt leaving that remote behind: the next open read it back as
   * **connected** and `sync.machine`, which finds the remote through git's
   * config and not through this machine's phase, started pushing to a remote
   * nobody had validated. This bit is what lets the failure edges undo exactly
   * their own write, and nothing else's.
   */
  attemptWroteRemote: boolean;
}>;

/** Events accepted by remoteMachine. @public */
export type RemoteMachineEvent =
  /** The user picked a kind. `'none'` disconnects whatever is connected. */
  | Readonly<{
      type: 'connect';
      kind: RemoteKind | 'none';
      url?: string;
      provider?: 'github';
      repositoryId?: string;
      fetchOnly?: boolean;
    }>
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
  | Readonly<{
      type: 'quotaRefused';
      paths: readonly string[];
      used?: number;
      quota?: number;
      /** What the remote said about room, when it said anything (C13). */
      storage?: RemoteStorageRefusal;
    }>;

/** Facts remoteMachine emits for a host that holds only the root. @public */
export type RemoteMachineEmitted =
  | Readonly<{ type: 'remoteConnected'; kind: RemoteKind; url: string }>
  | Readonly<{ type: 'remoteDisconnected' }>
  | Readonly<{ type: 'toast.info'; message: string }>
  | Readonly<{ type: 'toast.error'; message: string }>;

/** What `readRemote` answers: the remote git's config already holds. @public */
export type RemoteReadActorOutput = Readonly<{ remote: RemoteRecord | undefined }>;

/** What `writeRemote` is asked to record. @public */
export type RemoteWriteActorInput = Readonly<{
  projectId: string;
  kind: RemoteKind;
  url: string | undefined;
  provider?: 'github';
  repositoryId?: string;
  fetchOnly?: boolean;
}>;

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
  /** What it said about room, when it said anything (C13). */
  storage?: RemoteStorageRefusal;
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

type RemoteEnqueue = EnqueueObject<RemoteMachineEvent, RemoteMachineEmitted>;

/* One place converts a rejection into what a surface renders: the sentence
 * and the class beside it, from the classifier `sync.machine` owns. */
const failWith = (error: unknown): Partial<RemoteMachineContext> => ({
  error: reason(error),
  reason: syncFailureReason(error),
});

/** Everything this abandoned attempt wrote, forgotten; the reason stays. */
const forgetAttempt = {
  remote: undefined,
  kind: 'none',
  storage: undefined,
  quota: undefined,
  overQuota: [],
  attemptWroteRemote: false,
} satisfies Partial<RemoteMachineContext>;

/* `connect` from a settled state: choosing *No remote* disconnects, anything else starts an attempt. */
const reconnect = (event: Extract<RemoteMachineEvent, { type: 'connect' }>) =>
  event.kind === 'none'
    ? { target: 'disconnecting' }
    : { target: 'choosing', context: { kind: event.kind, error: undefined } };

/* A connect gesture before any remote is recorded: *No remote* is already the answer. */
const firstConnect = (event: Extract<RemoteMachineEvent, { type: 'connect' }>) =>
  event.kind === 'none' ? {} : { target: 'choosing', context: { kind: event.kind, error: undefined } };

/* A connection step that failed: a stale credential asks for reauthorization, an
 * attempt that already wrote its remote undoes that write, anything else fails. */
const connectionFailed = (context: RemoteMachineContext, error: unknown) => {
  if (isReauthorizationRequired(error)) {
    return { target: 'reconnectRequired', context: failWith(error) };
  }
  return { target: context.attemptWroteRemote ? 'abandoning' : 'failed', context: failWith(error) };
};

const announceConnected = (context: RemoteMachineContext, enq: RemoteEnqueue): void => {
  enq.emit({
    type: 'remoteConnected',
    /* A kind was chosen to reach `connected`, so `'none'` is not
     * reachable here; the fallback keeps the type honest. */
    kind: context.kind === 'none' ? 'tau' : context.kind,
    url: context.remote?.url ?? '',
  });
  /* Siblings hear it through the parent (A38): `sync` starts on
   * this fact, not on the next open (W18 review DEF-6b, P53). */
  if (context.parentRef !== undefined && context.remote !== undefined) {
    enq.sendTo(context.parentRef, {
      type: 'remoteConnected',
      kind: context.remote.kind,
      url: context.remote.url,
      name: context.remote.name,
    });
  }
};

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
  schemas: {
    context: types<RemoteMachineContext>(),
    events: eventSchemas<RemoteMachineEvent>(),
    emitted: eventSchemas<RemoteMachineEmitted>(),
    input: types<RemoteMachineInput>(),
  },
  actors: {
    /** What git's own remotes list already says (D29: rehydrate from records). */
    readRemote: createAsyncLogic<RemoteReadActorOutput, Readonly<{ projectId: string }>>({ run: unsupported }),
    writeRemote: createAsyncLogic<RemoteWriteActorOutput, RemoteWriteActorInput>({ run: unsupported }),
    removeRemote: createAsyncLogic<void, Readonly<{ name: string }>>({ run: unsupported }),
    /** Resolves the *reference* the host will authenticate with, never a secret (I8). */
    authorize: createAsyncLogic<void, RemoteAuthorizeActorInput>({ run: unsupported }),
    validate: createAsyncLogic<RemoteValidateActorOutput, RemoteValidateActorInput>({ run: unsupported }),
    initialSync: createAsyncLogic<RemoteInitialSyncActorOutput, RemoteInitialSyncActorInput>({ run: unsupported }),
  },
}).createMachine({
  id: 'remote',
  context: ({ input }) => ({
    projectId: input.projectId,
    parentRef: input.parentRef,
    branch: input.branch ?? defaultBranch,
    kind: 'none',
    remote: undefined,
    storage: undefined,
    quota: undefined,
    overQuota: [],
    error: undefined,
    reason: undefined,
    attemptWroteRemote: false,
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
        onDone: ({ event }) =>
          event.output.remote === undefined
            ? { target: 'none' }
            : {
                target: 'connected',
                context: { remote: event.output.remote, kind: event.output.remote.kind },
              },
        onError: {
          target: 'failed',
          context: ({ event }) => failWith(event.error),
        },
      },
      /* A route can carry a connect gesture into the project before this
       * first config read settles. The gesture is newer than the read, so it
       * wins instead of being dropped. */
      on: {
        connect: ({ event }) => firstConnect(event),
      },
    },

    none: {
      on: {
        connect: ({ event }) => firstConnect(event),
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
          ...(event.type === 'connect' && event.provider !== undefined ? { provider: event.provider } : {}),
          ...(event.type === 'connect' && event.repositoryId !== undefined ? { repositoryId: event.repositoryId } : {}),
          ...(event.type === 'connect' && event.fetchOnly === true ? { fetchOnly: true } : {}),
        }),
        onDone: {
          target: 'authorizing',
          context: ({ event }) => ({ remote: event.output.remote, attemptWroteRemote: true }),
        },
        onError: {
          target: 'failed',
          context: ({ event }) => failWith(event.error),
        },
      },
      /* Nothing has been written yet, so there is nothing to remove: going
       * through `disconnecting` would ask the port to remove a remote with no
       * name and land the person in `failed` over their own Cancel. */
      on: { cancel: { target: 'none', context: { kind: 'none', error: undefined } } },
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
        onError: ({ context, event }) => connectionFailed(context, event.error),
      },
      on: { authorized: { target: 'validating' }, cancel: { target: 'disconnecting' } },
    },

    /** Does the remote answer, and what does it say this project costs? */
    validating: {
      invoke: {
        src: 'validate',
        input: ({ context }) => ({ remote: context.remote?.name ?? '', url: context.remote?.url ?? '' }),
        onDone: { target: 'initialSync', context: ({ event }) => ({ storage: event.output.storage }) },
        onError: ({ context, event }) => connectionFailed(context, event.error),
      },
      on: {
        validated: { target: 'initialSync', context: ({ event }) => ({ storage: event.storage }) },
        cancel: { target: 'disconnecting' },
      },
    },

    /** Once, at connect time: everything after this is `sync.machine`'s debounce (W13). */
    initialSync: {
      invoke: {
        src: 'initialSync',
        input: ({ context }) => ({ remote: context.remote?.name ?? '', branch: context.branch }),
        onDone: ({ context, event }, enq) => {
          announceConnected(context, enq);
          if ((event.output.overQuota ?? []).length > 0) {
            /* The history landed and some files did not fit. The connection is
             * real, so this is `connected` with the list — and it arrives the
             * one way `overQuota` is ever written: as `quotaRefused`, raised
             * here and handled in `connected`, which is also the event W13's
             * `sync.machine` forwards for every later push (P19). */
            enq.emit({
              type: 'toast.error',
              message: event.output.message ?? 'Some files are over this project’s storage plan.',
            });
            enq.raise({
              type: 'quotaRefused',
              paths: event.output.overQuota ?? [],
              ...(event.output.storage === undefined ? {} : { storage: event.output.storage }),
            });
            return { target: 'connected' };
          }
          enq.emit({
            type: 'toast.info',
            message:
              context.remote?.fetchOnly === true ? 'This project is linked read-only.' : 'This project is backed up.',
          });
          return { target: 'connected' };
        },
        onError: ({ context, event }, enq) => {
          if (!isReauthorizationRequired(event.error)) {
            enq.emit({ type: 'toast.error', message: reason(event.error) });
          }
          return connectionFailed(context, event.error);
        },
      },
      on: { cancel: { target: 'disconnecting' } },
    },

    /**
     * Undo the config write a failed attempt made, and keep its reason (C10).
     *
     * Not `disconnecting`: that is the verb for a remote that *was* connected,
     * it announces `remoteDisconnected` to every sibling and it lands in
     * `none`. Nothing here was ever connected and nobody was told it was, so
     * the only thing to undo is the one config line `choosing` wrote — and the
     * person is left in `failed`, where the reason is rendered and *Retry* is
     * the same `connect` it always was. This is what the module header has
     * always promised: never a half-connected project.
     */
    abandoning: {
      invoke: {
        src: 'removeRemote',
        input: ({ context }) => ({ name: context.remote?.name ?? '' }),
        /* A remote this host could not even remove is still not one it will
         * push to, so both edges land in the same place. */
        onDone: { target: 'failed', context: forgetAttempt },
        onError: { target: 'failed', context: forgetAttempt },
      },
    },

    connected: {
      entry: () => ({ context: { attemptWroteRemote: false } }),
      on: {
        disconnect: { target: 'disconnecting' },
        connect: ({ event }) => reconnect(event),
        /* A refused push is the one thing that makes a connected remote say
         * something: which files would not fit (D16, AC16). */
        quotaRefused: {
          context: ({ context, event }) => ({
            overQuota: event.paths,
            quota: event.storage ?? context.quota,
            storage:
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
        onDone: ({ context }, enq) => {
          enq.emit({ type: 'remoteDisconnected' });
          if (context.parentRef !== undefined) {
            enq.sendTo(context.parentRef, { type: 'remoteDisconnected' });
          }
          return {
            target: 'none',
            context: {
              remote: undefined,
              kind: 'none',
              storage: undefined,
              quota: undefined,
              overQuota: [],
              error: undefined,
            },
          };
        },
        onError: {
          target: 'failed',
          context: ({ event }) => failWith(event.error),
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
        /* The remote here is an established one, not this attempt's write, so a
         * later validate failure must not remove it (C10). */
        authorized: { target: 'validating', context: { error: undefined, attemptWroteRemote: false } },
        connect: ({ event }) => reconnect(event),
        disconnect: { target: 'disconnecting' },
      },
    },

    failed: {
      on: {
        connect: ({ event }) => reconnect(event),
        disconnect: { target: 'disconnecting' },
      },
    },
  },
});

/** The actor set `remoteMachine.provide` needs. @public */
export type RemoteActors = MachineActors<typeof remoteMachine>;

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
    /* Undoing a failed attempt's own config write is still the failure the
     * person is looking at, not a phase of its own (C10). */
    case 'abandoning': {
      return 'failed';
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
  quota: snapshot.context.quota,
  error: snapshot.context.error,
  /* Never a class with no sentence: the reset edges clear `error`, and this
   * keeps the two halves of one failure from drifting apart. */
  reason: snapshot.context.error === undefined ? undefined : snapshot.context.reason,
  fetchOnly: snapshot.context.remote?.fetchOnly === true,
  provider: snapshot.context.remote?.provider,
  repositoryId: snapshot.context.remote?.repositoryId,
});
