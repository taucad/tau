/**
 * The one place a revision refusal becomes words a person reads (P4, Rule 1).
 *
 * A machine that refuses names a `RevisionPortErrorCode`; the worker relays it
 * beside its diagnostic. The diagnostic is for the console and for tests — it
 * says things like "Branch x is unborn; a checkout of it needs an explicit base
 * revision.", which is banned product vocabulary and unactionable besides. So
 * the page chooses the sentence from the code, here, and nowhere else.
 *
 * Codes are `string` rather than `RevisionPortErrorCode` because that is what
 * crosses the worker boundary; an unknown one is a per-subject fallback, which
 * is also what a failure carrying no code at all gets (E5). They are entries of
 * a `Map` rather than an object's keys because a code is SCREAMING_SNAKE and an
 * object property here may not be (`@typescript-eslint/naming-convention`).
 */

/**
 * The three verbs whose refusals reach the tree's one error channel, the turn,
 * which announces its own (`turn.failed`), the backup, whose terminal refusal
 * the Sync line says, and removing a version name, which the Hosted Remote's
 * audited verb answers (D24).
 */
export type RevisionFailureSubject = 'restore' | 'branch' | 'save' | 'turn' | 'backup' | 'removeName';

/** What Tau Cloud's own budgets answer (D22, I11): one sentence each, each saying when to try again. */
const hostedRemoteCopy: ReadonlyArray<readonly [string, string]> = [
  ['GIT_RATE_LIMITED', 'Tau Cloud is getting too many requests for this project. Wait a minute, then try again.'],
  ['GIT_LEASE_OWNER_BUSY', 'Tau Cloud is still busy with this account’s other projects. Try again in a moment.'],
  [
    'GIT_HYDRATE_BUDGET_EXHAUSTED',
    'This account has reached today’s limit for opening projects on Tau Cloud. Try again tomorrow.',
  ],
];

/** Whatever the engine itself could not do, said the same way for every verb. */
const engineCopy: ReadonlyArray<readonly [string, string]> = [
  ['ENGINE_FAILED', 'Tau could not read this project’s history. Reload the page and try again.'],
  ['ENGINE_UNAVAILABLE', 'This project’s history is not ready yet. Wait a moment and try again.'],
  ['MISSING_LARGE_OBJECT', 'A file this revision needs is not on this device. Sync this project, then try again.'],
  ['UNSUPPORTED_OPERATION', 'Tau cannot do that to this project.'],
];

/**
 * Subject → title, per-code description, and the sentence for everything else.
 *
 * The titles were `revision-restore.tsx`'s own; they moved here so that one
 * module owns every word of a failure rather than two (A18, I12).
 */
export const revisionFailureCopy: Readonly<
  Record<
    RevisionFailureSubject,
    Readonly<{
      title: string;
      fallback: string;
      codes: ReadonlyMap<string, string>;
      /** A title for a code whose outcome is not the subject's failure, e.g. files that are back but unrecorded. */
      titles?: ReadonlyMap<string, string>;
    }>
  >
> = {
  restore: {
    title: 'Restore failed',
    fallback: 'Tau could not restore that revision. Reload the page and try again.',
    codes: new Map([
      ...engineCopy,
      /* A1: a turn holds the files, so the restore wrote nothing — Switch's words. */
      ['LEASE_UNAVAILABLE', 'An agent is working in this project’s files.'],
      /* One of the restore's two revisions lost its race with another writer (A7). */
      ['CAS_LOST', 'Something else changed this project first. Try again.'],
      /* A3: the files moved between the revision before the restore and its write. */
      ['CHECKOUT_CONFLICT', 'These files changed while the restore was being prepared. Try again.'],
      ['UNKNOWN_REVISION', 'That revision is not in this project any more.'],
      /* W0 N1: the files are the target's, but the restore's own revision lost its race; a retry would find nothing to save. */
      [
        'RESTORE_UNRECORDED',
        'The earlier files are back, but something else changed this project at the same time, so this restore is not in History as its own revision. Your files are kept.',
      ],
      /* W0 M1: Undo pressed after the selection left the line the restore was made on. */
      ['UNDO_UNAVAILABLE', 'That restore was made on another branch. Open it there to undo it.'],
    ]),
    titles: new Map([
      ['RESTORE_UNRECORDED', 'Files restored'],
      ['UNDO_UNAVAILABLE', 'Nothing to undo here'],
    ]),
  },
  branch: {
    title: 'That branch change did not go through',
    fallback: 'Tau could not finish that branch change. Reload the page and try again.',
    codes: new Map([
      ...engineCopy,
      /* A fresh project: nothing recorded, and nothing unrecorded to record. */
      ['BRANCH_NEEDS_REVISION', 'There is nothing to branch from yet. Add a file, then try again.'],
      /* The verb was dropped or nothing answered it inside its bound. */
      ['BRANCH_UNANSWERED', 'This project did not answer in time. Try making that branch again.'],
      /* Made, with nowhere for a chat to work in it. */
      ['BRANCH_UNPLACED', 'Tau made that branch but could not open its files. Reload the page and try again.'],
      ['CAS_LOST', 'Something else changed this project at the same time. Try again.'],
      ['CHECKOUT_CONFLICT', 'That branch already exists. Pick another name.'],
      /* Asked before the project has anything selected to branch from; it used
       * to be reported as a name collision, which is not what happened. */
      ['CHECKOUT_UNKNOWN', 'This project has nothing open to branch from yet. Wait a moment and try again.'],
      ['UNKNOWN_REVISION', 'The revision this branch would start from is not in this project any more.'],
    ]),
  },
  save: {
    title: 'That change could not be saved',
    fallback: 'Tau could not record this change. Reload the page and try again.',
    codes: new Map([
      ...engineCopy,
      /* D3: another writer moved the line first; the files stay as they are, unsaved. */
      ['CAS_LOST', 'Something else changed this project first. Your changes are still here; save again.'],
      ['UNKNOWN_REVISION', 'The revision this change builds on is not in this project any more.'],
    ]),
  },
  backup: {
    title: 'Not backed up',
    fallback: 'Tau could not back this project up. It will try again.',
    codes: new Map([
      ...hostedRemoteCopy,
      /* Terminal (W2a): no retry and no verb clears it; only a repair of the cloud copy does. */
      [
        'REMOTE_DAMAGED',
        'Tau has to repair this project’s copy on Tau Cloud before it can back it up again. Nothing on this device is lost.',
      ],
    ]),
  },
  removeName: {
    title: 'That name was not removed',
    fallback: 'Tau Cloud could not remove that name. Try again.',
    codes: new Map([
      ...hostedRemoteCopy,
      ['GIT_REF_REMOVAL_OWNER_ONLY', 'Only the project’s owner can remove a version name.'],
      ['GIT_REF_NOT_REMOVABLE', 'Only a version name can be removed.'],
    ]),
  },
  turn: {
    title: 'Nothing was saved for that change',
    fallback: 'Tau could not record what that change produced. Try sending it again.',
    codes: new Map([
      ...engineCopy,
      /* Another document of this project is mid-change on the same files. */
      ['LEASE_UNAVAILABLE', 'Another window has this project open. Wait for it to finish, then try again.'],
      ['BASE_CUT_TIMED_OUT', 'Tau took too long to save this project’s earlier edits. Try sending that again.'],
      ['CAS_LOST', 'Something else changed this project at the same time. Try sending that again.'],
      ['CUT_TIMED_OUT', 'Tau took too long to record that change. Try sending it again.'],
      /* No files to run in: the worker client refuses one placement this way
       * and the page's authority the other, from this one row. */
      ['PLACEMENT_UNROOTED', 'This chat’s files could not be found.'],
      ['UNKNOWN_REVISION', 'The version that change built on is not in this project any more.'],
      /* Let go before it recorded anything — a stop, a reload, an abandonment. */
      ['TURN_RELEASED', 'The turn ended before it recorded a revision.'],
    ]),
  },
};

/**
 * What to tell a person about a refused revision verb.
 *
 * @param subject Which verb refused.
 * @param code The refusal's `RevisionPortErrorCode`, when it carried one.
 * @param branch The branch the verb named, for the sentences that can say it.
 * @returns The toast's title and description.
 */
export const describeRevisionFailure = (
  subject: RevisionFailureSubject,
  code: string | undefined,
  branch?: string,
): Readonly<{ title: string; description: string }> => {
  const copy = revisionFailureCopy[subject];
  const description = (code === undefined ? undefined : copy.codes.get(code)) ?? copy.fallback;
  return {
    title: (code === undefined ? undefined : copy.titles?.get(code)) ?? copy.title,
    description:
      branch === undefined || code !== 'CHECKOUT_CONFLICT'
        ? description
        : `${branch} already exists. Pick another name.`,
  };
};
