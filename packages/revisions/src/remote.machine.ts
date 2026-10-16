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
import type { SyncFailureReason } from '#sync.types.js';
import type { RemoteKind, RemoteReauthorizationCode } from '#remotes.js';
import type { RemoteStorageRefusal } from '#revision-port.js';
import type {
  RemoteFacet,
  RemoteMachineEvent,
  RemoteRefusedReplacement,
  RemoteStorage,
  RevisionChildToast,
} from '#remote.types.js';

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

/* The fields of {@link RemoteMachineContext}, named by the interface below. */
type RemoteMachineContextFields = Readonly<{
  projectId: string;
  parentRef: AnyActorRef | undefined;
  branch: string;
  kind: RemoteKind | 'none';
  remote: RemoteRecord | undefined;
  storage: RemoteStorage | undefined;
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
  /**
   * The destination the person picked, carried from `connect` to `choosing`
   * across the R2 probe, which is not a `connect` event.
   */
  candidate: RemoteCandidate | undefined;
  /** Where a refused or cancelled probe returns: the remote that stays this project's backup (R2). */
  probeReturn: 'connected' | 'reconnectRequired';
  /** The last replacement the new remote refused; the old remote stayed (R2). */
  refusedReplacement: RemoteRefusedReplacement | undefined;
  /** How many replacements have been refused, so each refusal carries its own `attempt`. */
  refusals: number;
}>;

/** The destination a `connect` names. @public */
export type RemoteCandidate = Readonly<{
  kind: RemoteKind;
  url?: string;
  provider?: 'github';
  repositoryId?: string;
  fetchOnly?: boolean;
}>;

/** Serializable state owned by remoteMachine. @public */
// oxlint-disable-next-line typescript/no-empty-interface, typescript/no-empty-object-type, typescript/consistent-type-definitions -- an interface, not a type alias: declarations reference it by name, where an alias is expanded into every transition of this machine and of any machine that holds it (K-17, TS7056)
export interface RemoteMachineContext extends RemoteMachineContextFields {}

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
export type RemoteValidateActorOutput = Readonly<{ storage?: RemoteStorage }>;

/** Which connected remote `readStorage` asks about. @public */
export type RemoteReadStorageActorInput = Readonly<{ remote: string; kind: RemoteKind | 'none' }>;

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

/* Everything a previous destination said about room (L2-F10): a replaced
 * remote must not render the refused files of the one it replaced. */
const forgetQuota = {
  storage: undefined,
  quota: undefined,
  overQuota: [],
} satisfies Partial<RemoteMachineContext>;

/** Everything this abandoned attempt wrote, forgotten; the reason stays. */
const forgetAttempt = {
  remote: undefined,
  kind: 'none',
  ...forgetQuota,
  attemptWroteRemote: false,
} satisfies Partial<RemoteMachineContext>;

type ConnectEvent = Extract<RemoteMachineEvent, { type: 'connect' }>;

/* What a `connect` names, without its `type`. */
const candidateOf = (event: ConnectEvent, kind: RemoteKind): RemoteCandidate => ({
  kind,
  ...(event.url === undefined ? {} : { url: event.url }),
  ...(event.provider === undefined ? {} : { provider: event.provider }),
  ...(event.repositoryId === undefined ? {} : { repositoryId: event.repositoryId }),
  ...(event.fetchOnly === true ? { fetchOnly: true } : {}),
});

/* An attempt starts: `choosing` records the picked destination. */
const startAttempt = (event: ConnectEvent, kind: RemoteKind) => ({
  target: 'choosing',
  context: { kind, error: undefined, candidate: candidateOf(event, kind), refusedReplacement: undefined },
});

/* `connect` from a settled state: choosing *No remote* disconnects, anything else starts an attempt. */
const reconnect = (event: ConnectEvent) =>
  event.kind === 'none' ? { target: 'disconnecting' } : startAttempt(event, event.kind);

/* The same destination, picked again: a re-grant or an access change, never a replacement. */
const isSameDestination = (remote: RemoteRecord, event: ConnectEvent): boolean =>
  event.kind === remote.kind &&
  (event.kind === 'tau' ||
    (event.url === remote.url && event.provider === remote.provider && event.repositoryId === remote.repositoryId));

/*
 * R2: `connect` while a remote is recorded and backing this project up.
 *
 * `choosing` writes the new remote over the old one before anything has asked
 * the new one a question, so a refused address used to cost the backup that
 * worked. A different destination is probed first — `validate`'s question, on
 * this host's own transport, with nothing recorded — and the old remote is
 * replaced only once it answers. The same destination is a re-grant or an
 * access change and goes straight to `choosing`, as it always has.
 */
const replaceOrReconnect = (
  context: RemoteMachineContext,
  event: ConnectEvent,
  from: RemoteMachineContext['probeReturn'],
) => {
  if (event.kind === 'none' || context.remote === undefined || isSameDestination(context.remote, event)) {
    return reconnect(event);
  }
  return {
    target: 'probing',
    context: {
      kind: event.kind,
      candidate: candidateOf(event, event.kind),
      probeReturn: from,
      refusedReplacement: undefined,
    },
  };
};

/* A refused push's file list and figures: the root's handler and `connected`'s share it. */
const quotaRefusedContext = (
  context: RemoteMachineContext,
  event: Extract<RemoteMachineEvent, { type: 'quotaRefused' }>,
): Partial<RemoteMachineContext> => ({
  overQuota: event.paths,
  quota: event.storage ?? context.quota,
  storage:
    event.used === undefined || event.quota === undefined
      ? context.storage
      : { ...context.storage, used: event.used, quota: event.quota },
});

/* A connect gesture before any remote is recorded: *No remote* is already the answer. */
const firstConnect = (event: ConnectEvent) => (event.kind === 'none' ? {} : startAttempt(event, event.kind));

/* A connection step that failed: a stale credential asks for reauthorization, an
 * attempt that already wrote its remote undoes that write, anything else fails. */
const connectionFailed = (context: RemoteMachineContext, error: unknown) => {
  if (isReauthorizationRequired(error)) {
    return { target: 'reconnectRequired', context: failWith(error) };
  }
  return { target: context.attemptWroteRemote ? 'abandoning' : 'failed', context: failWith(error) };
};

/* Emitted for a host that holds this child, and sent to the root for every
 * host that holds only the root (L2-F8). */
const toast = (
  context: RemoteMachineContext,
  enq: RemoteEnqueue,
  { tone, message }: Pick<RevisionChildToast, 'tone' | 'message'>,
): void => {
  enq.emit(tone === 'info' ? { type: 'toast.info', message } : { type: 'toast.error', message });
  if (context.parentRef !== undefined) {
    enq.sendTo(context.parentRef, {
      type: 'childToast',
      subject: 'remote',
      tone,
      message,
    } satisfies RevisionChildToast);
  }
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
      automaticPush: context.remote.provider !== 'github' && context.remote.fetchOnly !== true,
    });
  }
};

/* What `writeRemote` and the R2 probe are asked for: the destination the person picked. */
const writeInputOf = (context: RemoteMachineContext): RemoteWriteActorInput => {
  const { candidate } = context;
  return {
    projectId: context.projectId,
    kind: candidate?.kind ?? (context.kind === 'none' ? 'tau' : context.kind),
    url: candidate?.url,
    ...(candidate?.provider === undefined ? {} : { provider: candidate.provider }),
    ...(candidate?.repositoryId === undefined ? {} : { repositoryId: candidate.repositoryId }),
    ...(candidate?.fetchOnly === true ? { fetchOnly: true } : {}),
  };
};

/*
 * A refused or cancelled R2 probe: the recorded remote is still the backup.
 *
 * The root retires `sync` on every `connect` (it cannot know the attempt will
 * not replace anything), so a remote that was backing the project up is
 * announced again and `sync` resumes its paused queue (policy rule 9). One
 * waiting on `reconnectRequired` was never handed to `sync` and stays so.
 */
const keepCurrentRemote = (
  context: RemoteMachineContext,
  enq: RemoteEnqueue,
  refusal: Omit<RemoteRefusedReplacement, 'attempt'> | undefined,
) => {
  const kept = { ...context, kind: context.remote?.kind ?? context.kind };
  if (context.probeReturn === 'connected') {
    announceConnected(kept, enq);
  }
  const refusals = refusal === undefined ? context.refusals : context.refusals + 1;
  return {
    target: context.probeReturn,
    context: {
      kind: kept.kind,
      candidate: undefined,
      refusals,
      refusedReplacement: refusal === undefined ? undefined : { ...refusal, attempt: refusals },
    },
  };
};

const remoteMachineDefinition = setup({
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
    /** R2: `validate`'s question of a destination not recorded yet; writes nothing. */
    probe: createAsyncLogic<void, RemoteWriteActorInput>({ run: unsupported }),
    /** Resolves the *reference* the host will authenticate with, never a secret (I8). */
    authorize: createAsyncLogic<void, RemoteAuthorizeActorInput>({ run: unsupported }),
    validate: createAsyncLogic<RemoteValidateActorOutput, RemoteValidateActorInput>({ run: unsupported }),
    /** What a connected remote says this project costs (D18); `undefined` when it cannot say. */
    readStorage: createAsyncLogic<RemoteStorage | undefined, RemoteReadStorageActorInput>({ run: unsupported }),
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
    candidate: undefined,
    probeReturn: 'connected',
    refusedReplacement: undefined,
    refusals: 0,
  }),
  /* A fact about the remote, not about where the connect sequence is (L2-F10):
   * `sync` forwards a refusal from whichever push it was making, and one that
   * arrived while this machine was reading, reconnecting or failed used to be
   * dropped with the only copy of its file list. `choosing` clears it for a new
   * destination. */
  on: {
    quotaRefused: { context: ({ context, event }) => quotaRefusedContext(context, event) },
  },
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

    /**
     * R2: does the new remote answer before it replaces the recorded one?
     *
     * Nothing is written here, so failing, cancelling or a refusal leaves the
     * recorded remote exactly as it was and returns to it.
     */
    probing: {
      invoke: {
        src: 'probe',
        input: ({ context }) => writeInputOf(context),
        onDone: { target: 'choosing', context: { error: undefined } },
        onError: ({ context, event }, enq) =>
          keepCurrentRemote(context, enq, {
            kind: context.candidate?.kind ?? 'git',
            ...(context.candidate?.url === undefined ? {} : { url: context.candidate.url }),
            error: reason(event.error),
            reason: syncFailureReason(event.error),
          }),
      },
      on: {
        cancel: ({ context }, enq) => keepCurrentRemote(context, enq, undefined),
        /* A newer pick wins, and is probed in turn; *No remote* or the recorded remote itself need no probe. */
        connect: ({ context, event }) => {
          const next = replaceOrReconnect(context, event, context.probeReturn);
          return next.target === 'probing' ? { ...next, reenter: true } : next;
        },
        /* Disconnecting is about the recorded remote, which nothing here touched. */
        disconnect: { target: 'disconnecting' },
      },
    },

    /** The choice, recorded in git's remotes list before anything is asked of it. */
    choosing: {
      entry: () => ({ context: forgetQuota }),
      invoke: {
        src: 'writeRemote',
        input: ({ context }) => writeInputOf(context),
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
             * here and handled at the root, which is also the event W13's
             * `sync.machine` forwards for every later push (P19). */
            toast(context, enq, {
              tone: 'error',
              message: event.output.message ?? 'Some files are over this project’s storage plan.',
            });
            enq.raise({
              type: 'quotaRefused',
              paths: event.output.overQuota ?? [],
              ...(event.output.storage === undefined ? {} : { storage: event.output.storage }),
            });
            return { target: 'connected' };
          }
          toast(context, enq, {
            tone: 'info',
            message:
              context.remote?.fetchOnly === true ? 'This project is linked read-only.' : 'This project is backed up.',
          });
          return { target: 'connected' };
        },
        onError: ({ context, event }, enq) => {
          if (!isReauthorizationRequired(event.error)) {
            toast(context, enq, { tone: 'error', message: reason(event.error) });
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
      /*
       * D18: the figure the Sync region renders, read on every arrival here —
       * a reopened project included, which reaches `connected` from `reading`
       * without ever validating. A host that cannot say leaves the row out, and
       * a failed read is no reason to doubt a connection that already stands.
       */
      initial: 'reading',
      states: {
        reading: {
          invoke: {
            src: 'readStorage',
            input: ({ context }) => ({ remote: context.remote?.name ?? '', kind: context.kind }),
            onDone: ({ context, event }) => ({
              target: 'settled',
              context: { storage: event.output ?? context.storage },
            }),
            onError: { target: 'settled' },
          },
        },
        settled: {},
      },
      on: {
        disconnect: { target: 'disconnecting' },
        connect: ({ context, event }) => replaceOrReconnect(context, event, 'connected'),
        /* F9: a push changed what is stored; read it again, dropping any read in flight. */
        pushed: { target: '.reading', reenter: true },
        /* F9: a refusal's own figures are newer than a read still in flight, so
           leaving `reading` stops that read before its answer can overwrite them. */
        quotaRefused: ({ context, event }) =>
          event.used === undefined || event.quota === undefined
            ? { context: quotaRefusedContext(context, event) }
            : { target: '.settled', context: quotaRefusedContext(context, event) },
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
              ...forgetQuota,
              error: undefined,
              refusedReplacement: undefined,
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
        connect: ({ context, event }) => replaceOrReconnect(context, event, 'reconnectRequired'),
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

/**
 * Public events a state drops on purpose, for the event-coverage checks (D13, MC-R17).
 *
 * - `authorized` and `validated` in `probing` (R2): each finishes a step of a
 *   recorded remote's own connect, and a probe records nothing either could finish.
 *
 * @public
 */
export const remoteIgnoredEvents: ReadonlyArray<readonly [state: string, eventType: string]> = [
  ['probing', 'authorized'],
  ['probing', 'validated'],
];

type RemoteMachineDefinition = typeof remoteMachineDefinition;

/**
 * The type of {@link remoteMachine}, named so declarations reference it rather than inline it.
 *
 * @public
 */
// oxlint-disable-next-line typescript/no-empty-interface, typescript/no-empty-object-type, typescript/consistent-type-definitions -- an interface, not a type alias: declarations reference an interface by name and would expand an alias (K-17)
export interface RemoteMachine extends RemoteMachineDefinition {}

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
export const remoteMachine: RemoteMachine = remoteMachineDefinition;

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
  /* `connected` has children (F9); the phase is the top-level state either way. */
  phase: phaseOf(typeof snapshot.value === 'string' ? snapshot.value : (Object.keys(snapshot.value)[0] ?? '')),
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
  ...(snapshot.context.refusedReplacement === undefined
    ? {}
    : { refusedReplacement: snapshot.context.refusedReplacement }),
});
