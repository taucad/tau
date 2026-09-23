/**
 * `publish.machine` — one project's publication, over the synced graph (S32, A21, D11).
 *
 * Publishing is four facts in order, not an upload: the graph up to the
 * revision is on the Tau Hosted Remote, the revision has a name, the
 * publication row points at that name, and the server materializes the named
 * tree into the blob store the viewer already reads. Nothing this machine does
 * moves a file's bytes: the bytes travelled with the push (LFS included), which
 * is why the multipart upload path is deleted rather than kept beside it (A31,
 * I15).
 *
 * The order here is `choosingVersion → tagging → pushing → publishing`, which
 * inverts the two middle states of the architecture's row. The row cannot be
 * taken literally: a name the person just chose does not exist until `tagging`
 * runs, so a `pushing` state placed before it has no tag to offer and the named
 * version never reaches the remote — and the queue's final amendment says
 * `pushing` pushes "`main` + the new tag" with the last-observed heads, which
 * is only true in this order.
 *
 * `pushing` waits for a **correlated** `pushSettled`, not for its own actor's
 * completion, because `sync.machine` owns the push: the injected `push` actor
 * resolves with the `pushId` and this machine then asks the root for
 * `syncNow { pushId }`, whose settlement comes back through the same root.
 * The bound is the reason the state exists at all — a push that never answers
 * has to land in `error`, never hang (A38: every effect has a failure edge).
 */

import { createAsyncLogic, setup, types } from 'xstate';
import type { AnyActorRef, EnqueueObject, SnapshotFrom } from 'xstate';

import { eventSchemas } from '#machine-schemas.js';
import type { MachineActors } from '#machine-schemas.js';

import type { RevisionTag } from '#revision-port.js';
import type { SyncPushOutcome } from '#sync.machine.js';

/** How long `pushing` waits for the settlement that names its push. @public */
export const publishPushMilliseconds = 60_000;

/** Who may see a publication, in the API's own words. @public */
export type PublishVisibility = 'private' | 'public';

/** What the dialog and `tau publish` collect before anything is written. @public */
export type PublishDraft = Readonly<{
  /** The named version. Existing name re-points it; a new one creates it. */
  tag: string;
  /** Why this version has a name (the annotated tag's message). */
  note?: string;
  /** The project's own name, which the publication's project mirror records. */
  projectName: string;
  /** The file a viewer opens with. Must be in the named version's tree. */
  entryPath: string;
  visibility: PublishVisibility;
  title: string;
  description?: string;
  /** Private publications only. */
  sharedEmails?: readonly string[];
  notifyRecipients?: boolean;
}>;

/** Input accepted when creating the publishMachine actor. @public */
export type PublishMachineInput = Readonly<{
  projectId: string;
  /** The branch whose head is published. Defaults to `main`. */
  branch?: string;
  /**
   * The `project-revisions` root, which routes `syncNow` to the scheduler.
   *
   * Siblings speak through the parent (A38), so the dialog asks the root for
   * the push and hears the answer back through it as `pushSettled` (P39).
   */
  parentRef?: AnyActorRef;
}>;

/** What a settled push reports, in `sync.machine`'s own words (P39). @public */
export type PublishPushSettledOutcome = SyncPushOutcome;

/** Serializable state owned by publishMachine. @public */
export type PublishMachineContext = Readonly<{
  projectId: string;
  branch: string;
  /** Names this project already has, for the dialog's picker. */
  tags: readonly RevisionTag[];
  /** The revision being published — the branch head when the dialog opened. */
  revisionId: string | undefined;
  /** What the remote last advertised for the branch, which is the push lease. */
  expected: string | undefined;
  /** What the remote last advertised for each name it holds (P38). */
  remoteTags: Readonly<Record<string, string>>;
  /** Pre-filled name, when a caller opened the dialog on one. */
  tag: string | undefined;
  draft: PublishDraft | undefined;
  /** The push this state is waiting for the settlement of. */
  pushId: string | undefined;
  publicationId: string | undefined;
  shareUrl: string | undefined;
  error: string | undefined;
  /** The root this dialog asks for its push (P39). */
  parentRef: AnyActorRef | undefined;
}>;

/** Events accepted by publishMachine. @public */
export type PublishMachineEvent =
  | Readonly<{ type: 'publish'; tag?: string }>
  | Readonly<{ type: 'confirm'; draft: PublishDraft }>
  | Readonly<{ type: 'cancel' }>
  | Readonly<{ type: 'pushSettled'; pushId: string; outcome: SyncPushOutcome }>
  | Readonly<{ type: 'reset' }>;

/** Facts publishMachine emits for a host that holds only the root. @public */
export type PublishMachineEmitted =
  | Readonly<{ type: 'published'; publicationId: string; url: string; tag: string }>
  | Readonly<{ type: 'toast.info'; message: string }>
  | Readonly<{ type: 'toast.error'; message: string }>;

/** What `listVersions` answers: the names, and the revision being published. @public */
export type PublishVersionsActorOutput = Readonly<{
  tags: readonly RevisionTag[];
  /** The branch head. `undefined` in a project with no revisions yet. */
  revisionId: string | undefined;
  /** The remote's last-advertised branch head, used as the push lease (P18). */
  expected: string | undefined;
  /**
   * What the remote last advertised for each name it holds (P38).
   *
   * A name this project publishes again is offered with its own lease, so a
   * name somebody else moved is rejected as `leaseLost` rather than forced.
   * A name the remote does not hold is absent, which is the "must not exist"
   * lease a first publish needs.
   */
  remoteTags: Readonly<Record<string, string>>;
}>;

/** What `createTag` is asked to name. @public */
export type PublishTagActorInput = Readonly<{ name: string; revisionId: string; note?: string }>;

/** What `push` is asked to offer: the history set, tag included. @public */
export type PublishPushActorInput = Readonly<{
  branch: string;
  tag: string;
  /** The lease on the branch (P18); `undefined` means the ref must not exist. */
  expected: string | undefined;
  /**
   * The lease on `refs/tags/<tag>` (P18, P38).
   *
   * The revision the remote last advertised for this name, or `undefined` for a
   * name it does not hold. Never a force: a name moved under this publish is a
   * refusal the person is told about, and `atomic` takes the branch down with
   * it so the remote never holds half of what was offered.
   */
  expectedTag: string | undefined;
}>;

/** What `push` answers: the id the settlement will name and the remote that accepted it. @public */
export type PublishPushActorOutput = Readonly<{ pushId: string; remote: string }>;

/** What `createPublication` is asked to record. @public */
export type PublishPublicationActorInput = Readonly<{
  projectId: string;
  tag: string;
  revisionId: string;
}> &
  PublishDraft;

/** What `createPublication` answers: the row, and the link to copy. @public */
export type PublishPublicationActorOutput = Readonly<{ publicationId: string; url: string }>;

const defaultBranch = 'main';

const unsupported = async (): Promise<never> => {
  await Promise.resolve();
  throw new Error('This host provided no publish actors; `publishMachine.provide` supplies them.');
};

const reason = (error: unknown): string =>
  error instanceof Error ? error.message : 'This project could not be published.';

type PublishEnqueue = EnqueueObject<PublishMachineEvent, PublishMachineEmitted>;

/* Every entry into the dialog starts from nothing: a draft left over from
 * the last publish would be applied to this one's read (row 11). */
const startPublish = (event: Extract<PublishMachineEvent, { type: 'publish' }>): Partial<PublishMachineContext> => ({
  tag: event.tag,
  draft: undefined,
  pushId: undefined,
  publicationId: undefined,
  shareUrl: undefined,
  error: undefined,
});

/* A refusal is remembered for the dialog and said once as a toast. */
const failWith = (enq: PublishEnqueue, error: string): Partial<PublishMachineContext> => {
  enq.emit({ type: 'toast.error', message: error });
  return { error };
};

const noRevisionsYet = 'This project has no revisions yet, so there is nothing to publish.';

/**
 * Headless publication of one project's named version.
 *
 * @public
 * @example <caption>Publish the head of `main` as `v1`</caption>
 * ```typescript
 * import { createActor } from 'xstate';
 * import { publishMachine } from '@taucad/revisions/publish-machine';
 * import type { PublishActors } from '@taucad/revisions/publish-machine';
 *
 * declare const hostActors: PublishActors;
 * const actor = createActor(publishMachine.provide({ actors: hostActors }), { input: { projectId: 'p1' } });
 * actor.start();
 * actor.send({ type: 'publish' });
 * actor.send({
 *   type: 'confirm',
 *   draft: { tag: 'v1', projectName: 'bracket', entryPath: 'main.ts', visibility: 'public', title: 'Bracket' },
 * });
 * ```
 */
export const publishMachine = setup({
  schemas: {
    context: types<PublishMachineContext>(),
    events: eventSchemas<PublishMachineEvent>(),
    emitted: eventSchemas<PublishMachineEmitted>(),
    input: types<PublishMachineInput>(),
  },
  actors: {
    listVersions: createAsyncLogic<PublishVersionsActorOutput, Readonly<{ projectId: string; branch: string }>>({
      run: unsupported,
    }),
    createTag: createAsyncLogic<RevisionTag, PublishTagActorInput>({ run: unsupported }),
    push: createAsyncLogic<PublishPushActorOutput, PublishPushActorInput>({ run: unsupported }),
    createPublication: createAsyncLogic<PublishPublicationActorOutput, PublishPublicationActorInput>({
      run: unsupported,
    }),
  },
  delays: {
    pushSettlement: publishPushMilliseconds,
  },
}).createMachine({
  id: 'publish',
  context: ({ input }) => ({
    projectId: input.projectId,
    branch: input.branch ?? defaultBranch,
    tags: [],
    revisionId: undefined,
    expected: undefined,
    remoteTags: {},
    tag: undefined,
    draft: undefined,
    pushId: undefined,
    publicationId: undefined,
    shareUrl: undefined,
    error: undefined,
    parentRef: input.parentRef,
  }),
  initial: 'idle',
  states: {
    idle: {
      on: {
        publish: { target: 'choosingVersion', context: ({ event }) => startPublish(event) },
      },
    },

    /**
     * The names this project already has, and the revision about to get one.
     *
     * Read from the graph rather than remembered: a name created from History
     * since the dialog was last open is a name the picker has to offer, and the
     * head moves under a dialog left open (D29 — records, not snapshots).
     *
     * Two children, because *Publish* is one gesture: a surface that opens the
     * dialog and confirms in the same breath — the panel's button, `tau publish
     * <name>` — must not race the read. A `confirm` that arrives while the read
     * is in flight is held and applied when it lands, instead of being answered
     * "this project has no revisions yet".
     */
    choosingVersion: {
      initial: 'reading',
      states: {
        reading: {
          invoke: {
            src: 'listVersions',
            input: ({ context }) => ({ projectId: context.projectId, branch: context.branch }),
            onDone: ({ context, event }, enq) => {
              if (event.output.revisionId === undefined) {
                return {
                  target: '#publish.error',
                  context: { tags: event.output.tags, ...failWith(enq, noRevisionsYet) },
                };
              }
              const read = {
                tags: event.output.tags,
                revisionId: event.output.revisionId,
                expected: event.output.expected,
                remoteTags: event.output.remoteTags,
              };
              /* A name was confirmed while the read was in flight. */
              return context.draft === undefined
                ? { target: 'ready', context: read }
                : { target: '#publish.tagging', context: read };
            },
            onError: ({ event }, enq) => ({ target: '#publish.error', context: failWith(enq, reason(event.error)) }),
          },
          on: {
            /* Held, not refused: the read decides where it goes next. */
            confirm: { context: ({ event }) => ({ draft: event.draft }) },
          },
        },
        ready: {
          on: {
            confirm: ({ context, event }, enq) =>
              context.revisionId === undefined
                ? { target: '#publish.error', context: failWith(enq, noRevisionsYet) }
                : { target: '#publish.tagging', context: { draft: event.draft } },
          },
        },
      },
      on: {
        cancel: { target: 'idle' },
      },
    },

    /**
     * The name, on the revision that already exists (W6's port members).
     *
     * Never a cut: the root declines a trigger-only cut while a turn or a lease
     * is live, and a publication names the revision the person is looking at,
     * not a new one made behind them (W6-a2).
     */
    tagging: {
      invoke: {
        src: 'createTag',
        input: ({ context }) => ({
          name: context.draft?.tag ?? '',
          revisionId: context.revisionId ?? '',
          ...(context.draft?.note === undefined ? {} : { note: context.draft.note }),
        }),
        onDone: { target: 'pushing' },
        onError: ({ event }, enq) => ({ target: 'error', context: failWith(enq, reason(event.error)) }),
      },
      on: { cancel: { target: 'idle' } },
    },

    /**
     * The history set — the branch and the new name — under the branch's lease.
     *
     * `leaseLost` on the branch is an error with A22's words rather than a
     * retry: something else moved the line this publication would name, and
     * republishing over it silently would publish a tree nobody chose.
     */
    pushing: {
      invoke: {
        src: 'push',
        input: ({ context }) => ({
          branch: context.branch,
          tag: context.draft?.tag ?? '',
          expected: context.expected,
          /* Absent for a name the remote does not hold, which is the lease that
             says "this ref must not exist" (P18, P38). */
          expectedTag: context.remoteTags[context.draft?.tag ?? ''],
        }),
        /*
         * Not a transition: the push is settled when the settlement that names
         * it arrives (P39).
         *
         * The ask goes to the scheduler, which is the only thing that pushes —
         * through the root, because siblings speak through the parent (A38).
         * It used to `raise` its own `pushSettled { backedUp }` here, which
         * declared success the moment the *request* resolved: `queued`,
         * `failed` and `superseded` were then unreachable outside a restored
         * snapshot, so a publication could name a ref the remote never received
         * (W22 DEF-W22-2). A dialog with no parent keeps waiting for a
         * settlement nobody will send, and `pushSettlement` is what ends it.
         */
        onDone: ({ context, event }, enq) => {
          if (context.parentRef !== undefined) {
            enq.sendTo(context.parentRef, {
              type: 'syncNow',
              pushId: event.output.pushId,
              remote: event.output.remote,
            });
          }
          return { context: { pushId: event.output.pushId } };
        },
        onError: ({ event }, enq) => ({ target: 'error', context: failWith(enq, reason(event.error)) }),
      },
      after: {
        pushSettlement: (_, enq) => ({
          target: 'error',
          context: failWith(enq, 'Tau could not confirm this project reached the cloud. Try publishing again.'),
        }),
      },
      on: {
        pushSettled: ({ context, event }, enq) => {
          if (context.pushId !== event.pushId) {
            return undefined;
          }
          if (event.outcome === 'backedUp') {
            return { target: 'publishing' };
          }
          /* `queued`, `conflicted` and `failed` all mean the remote does not
             have this name yet, and a row that points at a name the remote
             does not hold is a publication whose viewer opens nothing (P39). */
          return {
            target: 'error',
            context: failWith(
              enq,
              event.outcome === 'conflicted'
                ? 'Someone else changed this project in the cloud. Open it, resolve the conflict, then publish again.'
                : 'This project has not reached the cloud yet. Try publishing again when you are back online.',
            ),
          };
        },
        cancel: { target: 'idle' },
      },
    },

    /**
     * The row: `{ projectId, tag, revisionId }` plus what only a person
     * decides. The server materializes the named tree from the pack it just
     * received, so nothing is uploaded twice (A21).
     */
    publishing: {
      invoke: {
        src: 'createPublication',
        input: ({ context }) => ({
          /* The draft is set before `tagging` is entered and `publishing` is
           * only reachable through it; the fallback keeps the type honest. */
          ...(context.draft ??
            ({
              tag: '',
              projectName: '',
              entryPath: '',
              visibility: 'private',
              title: '',
            } satisfies PublishDraft)),
          projectId: context.projectId,
          revisionId: context.revisionId ?? '',
        }),
        onDone: ({ context, event }, enq) => {
          enq.emit({
            type: 'published',
            publicationId: event.output.publicationId,
            url: event.output.url,
            tag: context.draft?.tag ?? '',
          });
          return {
            target: 'success',
            context: { publicationId: event.output.publicationId, shareUrl: event.output.url, error: undefined },
          };
        },
        onError: ({ event }, enq) => ({ target: 'error', context: failWith(enq, reason(event.error)) }),
      },
    },

    success: {
      on: {
        reset: { target: 'idle' },
        publish: { target: 'choosingVersion', context: ({ event }) => startPublish(event) },
      },
    },

    error: {
      on: {
        reset: { target: 'idle', context: { error: undefined } },
        publish: { target: 'choosingVersion', context: ({ event }) => startPublish(event) },
      },
    },
  },
});

/** The actor set `publishMachine.provide` needs. @public */
export type PublishActors = MachineActors<typeof publishMachine>;

/** Where a publication is, for the dialog and the projection. @public */
export type PublishFacet = Readonly<{
  phase: 'idle' | 'choosingVersion' | 'working' | 'success' | 'error';
  /** Names this project already has, newest first as the port answers. */
  tags: readonly RevisionTag[];
  publicationId: string | undefined;
  shareUrl: string | undefined;
  error: string | undefined;
}>;

const phaseOf = (value: unknown): PublishFacet['phase'] => {
  /* `choosingVersion` has children, so the snapshot value is an object there. */
  const name = typeof value === 'string' ? value : Object.keys(value as Record<string, unknown>)[0];
  switch (name) {
    case 'idle':
    case 'choosingVersion':
    case 'success':
    case 'error': {
      return name;
    }
    default: {
      return 'working';
    }
  }
};

/**
 * The Publish dialog's whole input, read where it lives.
 *
 * @param snapshot - Current publish snapshot.
 * @returns The facet the dialog and the projection carry.
 * @public
 */
export const selectPublishFacet = (snapshot: SnapshotFrom<typeof publishMachine>): PublishFacet => ({
  phase: phaseOf(snapshot.value),
  tags: snapshot.context.tags,
  publicationId: snapshot.context.publicationId,
  shareUrl: snapshot.context.shareUrl,
  error: snapshot.context.error,
});
