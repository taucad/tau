/**
 * The history surfaces' one vocabulary (charter D7, RA3, RA11; blueprint C1, C8).
 *
 * Every history surface — the header trigger, its tooltip and accessible name,
 * the History pane's strip, the backup line, the chat marker and the palette —
 * reads its sentence and its glyph here, so one state is said one way
 * everywhere (I12). The words are History, Version and Revision (M11): a save
 * is a history entry with no number, a named point is a version, `V3`, once per
 * project, and "revision" and "Rev" are reserved for a future release workflow. The glyph family is the header trigger's, most urgent first:
 * `CircleAlert` red when something failed, `GitMerge` and `CloudAlert` amber
 * when a decision or an ask waits on the person, `CircleDashed` while work is in
 * flight, `FileDiff` amber when the files are modified, `ArrowDownToLine` for
 * work that arrived, and `History` at rest. Purple stays with the chat's own soft
 * errors, which are not revision states (HQ5).
 */
import { ArrowDownToLine, CircleAlert, CircleDashed, CloudAlert, FileDiff, GitMerge, History } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { isCeilingRefusal, isGithubRemoteUrl } from '@taucad/revisions';
import type { RemoteFacet, RevisionStatusProjection, SyncFacet } from '@taucad/revisions';
import type { SidebarMark } from '#hooks/use-sidebar-status.js';
import type { ProjectAccessRole } from '#hooks/use-cloud-projects.js';
import { useRevisionCards, useRevisions } from '#hooks/use-revisions.js';
import type { RevisionCard } from '#hooks/use-revisions.js';
import { useProjectRole, useRevisionStatus } from '#hooks/use-revision-status.js';
import { useRevisionSessionUser } from '#lib/revision-actor.js';
import { entryTitleOf } from '#lib/revision-entry-title.js';
import type { TurnRevisionState } from '#routes/w.$workspace.$project/chat-turn-revision-state.js';

/** What a surface draws for one state: one glyph in one tone, the mark it stands for, and the sentence. @public */
export type RevisionFacts = Readonly<{
  icon: LucideIcon;
  tone: string;
  mark: SidebarMark;
  /** The trigger's card line, its accessible name's last clause and the pane's status sentence. */
  sentence: string;
}>;

/** Where the checkout is, as every surface names it. @public */
export type RevisionWhere = Readonly<{
  /** The line the checkout is on; `undefined` until the projection says (D3). */
  branch: string | undefined;
  /**
   * The first-parent ordinal of the entry the files are at, which only says
   * whether anything is saved yet: no surface shows it (M11).
   */
  head: number | undefined;
  isDirty: boolean;
  /** History has not answered yet: loading is not empty (I6). */
  isLoading?: boolean;
  /** The viewer's role on the cloud project, which makes view-only and removed access calm states (HQ3). */
  role?: ProjectAccessRole | undefined;
  /** The viewer is signed out of Tau, so this device withholds its GitHub credential (D100). */
  isSignedOut?: boolean;
}>;

/**
 * What a sentence needs to name an entry: a History card, or the one row a
 * toast read for an entry off the loaded page. @public
 */
export type EntryNaming = Readonly<{
  summary: string;
  createdAt: number;
  capture?: RevisionCard['capture'];
  turnCut?: RevisionCard['turnCut'];
  start?: RevisionCard['start'];
  versions?: RevisionCard['versions'];
  restoredFrom?: RevisionCard['restoredFrom'];
}>;

/** A decision waiting on the person, said one way on every surface (HQ1, HQ6). @public */
export const needsDecision = 'Needs your decision';

/** The action on a toast for a verb that acted at once (I11). @public */
export const undoLabel = 'Undo';

/** What an *Undo restore* says: one more entry on top that put the files back. @public */
export const undidRestoreSentence = 'Undid the restore';

/**
 * What a *Switch* says once it has moved: whether it saved unsaved work first,
 * and on which branch, because that is where its Undo goes back to (I11).
 *
 * @param to - The branch switched to.
 * @param from - The branch left, when known.
 * @param saved - The switch saved unsaved changes on `from` first.
 * @returns The toast's sentence.
 * @public
 */
export const switchedSentence = (to: string, from: string | undefined, saved: boolean): string =>
  saved && from !== undefined ? `Saved your changes on ${from}, then switched to ${to}` : `Switched to ${to}`;

/** A *Switch* that was refused, in the words the branch menu uses (M4, M5). @public */
export const switchRefusedSentence = (branch: string): string => `Couldn’t switch to ${branch}`;

/** A settled missing cloud listing does not distinguish deletion from removed access. @public */
export const cloudUnavailable = 'Cloud copy unavailable';

/**
 * An absent cloud listing proves unavailability, not who removed access or
 * whether the cloud copy still exists. Local history remains available.
 *
 * @public
 */
export const cloudUnavailableSentence =
  'The cloud copy was deleted or your access changed. Your history is still on this device.';

/**
 * A version's number as every surface writes it: `V3` (M11, B6). An entry has
 * no number, so there is no counterpart for one.
 *
 * @param number - The version's project-wide number.
 * @returns `V<n>`.
 * @public
 */
export const versionLabel = (number: number): string => `V${String(number)}`;

/**
 * A version written in a sentence: `V3 · Ready for print`. The number comes
 * first because it is the stable part; a name can be changed.
 *
 * @param version - The version's number and name.
 * @returns The phrase.
 * @public
 */
export const versionPhrase = (version: Readonly<{ number: number; name: string }>): string =>
  `${versionLabel(version.number)} · ${version.name}`;

/**
 * The version an entry is, when it is one: the Start entry is V1 (A6), and a
 * named entry carries its number from its tag (B6).
 *
 * @param revision - The entry.
 * @returns Its number and name, or `undefined` for an entry that is not a version.
 * @public
 */
export const versionOf = (revision: EntryNaming): Readonly<{ number: number; name: string }> | undefined => {
  if (revision.start !== undefined) {
    return { number: 1, name: startTitle };
  }
  return revision.versions?.[0];
};

/** The Start version's name (A6, blueprint Q8). @public */
export const startTitle = 'Start';

/** The Start version's number, in the column where other rows show their time (A6). @public */
export const startVersionName = versionLabel(1);

const startFacts: Readonly<Record<NonNullable<RevisionCard['start']>, string>> = {
  created: 'project created',
  github: 'imported from GitHub',
  folder: 'imported from a folder',
  zip: 'imported from a zip',
  imported: 'imported',
};

/**
 * The Start version's second line: "Version · project created".
 *
 * @param start - How the entry reads as Start.
 * @returns The line, in the words the blueprint's copy table gives.
 * @public
 */
export const startFact = (start: NonNullable<RevisionCard['start']>): string => `Version · ${startFacts[start]}`;

/** Captures History folds as autosaves (A20). */
const autosaveCaptures: ReadonlySet<string | undefined> = new Set(['idle', 'hidden', 'close']);

/**
 * The short local time History prints beside an entry.
 *
 * @param createdAt - Milliseconds since the Unix epoch.
 * @returns `10:31 AM`, or nothing for an entry with no time.
 * @public
 */
export const entryTime = (createdAt: number): string =>
  createdAt > 0 ? new Date(createdAt).toLocaleTimeString(undefined, { timeStyle: 'short' }) : '';

/**
 * How a sentence refers to one entry (blueprint "Referring to an entry"): a
 * version by its number, an autosave by its time, any other entry by its
 * title. There is no number to quote for an entry (M11).
 *
 * @param revision - The entry, when this page has read it.
 * @returns `V2`, `the 10:31 AM autosave` or `“Add vent slots”`, or `undefined` when nothing names it.
 * @public
 */
export const entryReference = (revision: EntryNaming | undefined): string | undefined => {
  if (revision === undefined) {
    return undefined;
  }
  const version = versionOf(revision);
  if (version !== undefined) {
    return versionLabel(version.number);
  }
  if (revision.turnCut === 'base' || autosaveCaptures.has(revision.capture)) {
    const time = entryTime(revision.createdAt);
    return time === '' ? 'an autosave' : `the ${time} autosave`;
  }
  return revision.summary === '' ? undefined : `“${revision.summary}”`;
};

/**
 * What a restore toast or row says it brought back: `Restored V2`,
 * `Restored “Add vent slots”`, `Restored the 10:31 AM autosave`.
 *
 * @param target - The entry it restored, when this page has read it.
 * @returns The sentence.
 * @public
 */
export const restoredSentence = (target: EntryNaming | undefined): string => {
  const reference = entryReference(target);
  return reference === undefined ? 'Restored an earlier point' : `Restored ${reference}`;
};

/**
 * What an undo toast says it reversed: `Undid “Thicker walls for the lid”`.
 * A restore's own title only repeats what it restored, so undoing one says
 * {@link undidRestoreSentence}, as the row the undo records does.
 *
 * @param target - The entry it undid, when this page has read it.
 * @returns The sentence.
 * @public
 */
export const undidSentence = (target: EntryNaming | undefined): string => {
  if (target?.restoredFrom !== undefined) {
    return undidRestoreSentence;
  }
  const reference = entryReference(target);
  return reference === undefined ? 'Undid an earlier change' : `Undid ${reference}`;
};

/**
 * An entry's title: a version's name; a restore's, what it restored (A9),
 * never its trigger; otherwise what it says.
 *
 * @param revision - The entry.
 * @param revisions - The line's history, which names the entry a restore brought back.
 * @returns The title.
 * @public
 */
export const revisionTitle = (revision: RevisionCard, revisions: readonly RevisionCard[]): string => {
  /* A6: the first entry is the Start version, V1, whatever its commit says. */
  if (revision.start !== undefined) {
    return startTitle;
  }
  const named = revision.tags?.[0];
  if (named !== undefined) {
    return named;
  }
  if (revision.restoredFrom === undefined) {
    return revision.summary;
  }
  return restoredSentence(revisions.find((entry) => entry.revisionId === revision.restoredFrom));
};

/**
 * The title of an entry read as a bare row, as the agent's `history` tool
 * returns it: what {@link revisionTitle} shows for the same entry in History.
 * A version reads by its name; anything else by the one entry title rule (M6, Q9).
 *
 * @param entry - The row's title and its version.
 * @returns The title.
 * @public
 */
export const entryTitle = (entry: Readonly<{ summary: string; version?: Readonly<{ name: string }> }>): string =>
  entry.version === undefined ? entryTitleOf(entry.summary) : entry.version.name;

/**
 * Whether a credential refusal on this remote is GitHub's to fix (D18): a
 * repository picked from a connected account, or a github.com address typed
 * into the Advanced form.
 *
 * @param remote - The connection.
 * @returns Whether *Reconnect GitHub* is the answer.
 * @public
 */
export const isGithubRemote = (remote: RemoteFacet): boolean =>
  remote.provider === 'github' || (remote.kind === 'git' && remote.url !== undefined && isGithubRemoteUrl(remote.url));

/**
 * Whether a credential refusal is the viewer's Tau sign-in to fix (D18, D100):
 * Tau Cloud is reached with this device's own session, and signed out, this
 * device withholds its GitHub credential, so GitHub refused nothing.
 *
 * @param sync - The failure's class.
 * @param remote - The connection.
 * @param isSignedOut - Whether the viewer is signed out of Tau.
 * @returns Whether *Sign in* is the answer.
 * @public
 */
export const asksTauSignIn = (
  { reason }: Readonly<{ reason?: SyncFacet['reason'] }>,
  remote: RemoteFacet,
  isSignedOut: boolean | undefined,
): boolean => reason === 'unauthorized' && (remote.kind === 'tau' || (isSignedOut === true && isGithubRemote(remote)));

/**
 * The backup's own sentence: whether this project's work is on its remote.
 *
 * `Checking…` is the open pull's first window. A conflict is the one decision a
 * backup can wait on, and it says so in the words every surface uses (HQ1).
 *
 * @param sync - The settled sync facet.
 * @param remote - The connection, so a refusal names who refused.
 * @returns What the backup line reads, or `undefined` with no remote.
 * @public
 */
export const syncCopy = (sync: SyncFacet, remote?: RemoteFacet): string | undefined => {
  switch (sync.state) {
    case 'noRemote': {
      return undefined;
    }
    case 'manual': {
      return 'Saved · Not pushed to GitHub';
    }
    case 'checking': {
      return 'Checking for changes…';
    }
    case 'backedUp': {
      return 'Backed up';
    }
    case 'pending': {
      return sync.pendingCount > 0 ? `Backing up ${changeCount(sync.pendingCount)}…` : 'Backing up…';
    }
    case 'conflicted': {
      return needsDecision;
    }
    default: {
      /* `queued` and `failed` read the same to a person: their work is not on
       * the server. Whether this device retries by itself is the Sync line's. */
      if (sync.pendingCount > 0) {
        return `Not backed up · ${changeCount(sync.pendingCount)}`;
      }
      if (isRefusedWhileBackedUp(sync)) {
        /* Tau Cloud is reached with this device's own session: signing in again is the whole fix (M5). */
        if (remote?.kind === 'tau') {
          return 'Backed up · Sign in again to keep backing up';
        }
        return `Backed up · ${remote !== undefined && isGithubRemote(remote) ? 'GitHub' : 'Your Git host'} refused access`;
      }
      return 'Not backed up';
    }
  }
};

/**
 * The count a status line gives what is not backed up: changes, never revisions (M11).
 *
 * @param count - How many entries are waiting.
 * @returns `1 change`, `2 changes`.
 * @public
 */
export const changeCount = (count: number): string => `${String(count)} change${count === 1 ? '' : 's'}`;

/**
 * Whether the remote refused access after acknowledging everything (D68).
 *
 * *Not backed up* is reserved for entries the server has not acknowledged
 * (revisions policy), so a refused credential with nothing waiting has lost
 * no work. `notFound` is not this: a deleted repository answers exactly as an
 * unshared one does, and only the first has lost its copy.
 *
 * @param sync - The settled sync facet.
 * @returns Whether the backup line may still say *Backed up*.
 * @public
 */
export const isRefusedWhileBackedUp = (sync: SyncFacet): boolean =>
  sync.state === 'failed' && sync.pendingCount === 0 && (sync.reason === 'unauthorized' || sync.reason === 'forbidden');

/**
 * The backup line for this viewer: removed access is a calm fact, not a failed
 * push (HQ3), and a GitHub credential withheld while signed out is no refusal (D100).
 *
 * @param sync - The settled sync facet.
 * @param viewer - The viewer's role on the cloud project and whether they are signed out of Tau.
 * @param remote - The connection, so a refusal names who refused.
 * @returns The sentence, or `undefined` with no remote.
 * @public
 */
export const backupCopy = (
  sync: SyncFacet,
  { role, isSignedOut }: Pick<RevisionWhere, 'role' | 'isSignedOut'>,
  remote?: RemoteFacet,
): string | undefined => {
  if (role === 'revoked' && sync.state !== 'noRemote') {
    return cloudUnavailable;
  }
  if (
    remote !== undefined &&
    remote.kind !== 'tau' &&
    isRefusedWhileBackedUp(sync) &&
    asksTauSignIn(sync, remote, isSignedOut)
  ) {
    return 'Backed up';
  }
  return syncCopy(sync, remote);
};

const operationWords: Record<NonNullable<RevisionStatusProjection['branchVerb']['operation']>, string> = {
  switch: 'Switching',
  merge: 'Merging',
  /* M4: follows "Close branch". */
  discard: 'Closing',
  create: 'Creating',
  rename: 'Renaming',
};

/** Backup refusals only the pane can repair, or nobody can; the rest ask the person for something. */
const failedBackupReasons: ReadonlySet<string> = new Set(['rejected', 'forbidden', 'notFound', 'damaged', 'unknown']);

/**
 * What a failed backup asks the person for (R-U4). Only Tau Cloud is reached
 * with this device's own session, so only it, or GitHub while signed out, asks
 * to *Sign in* (D18, D100).
 *
 * @param status - The revision status projection.
 * @param isSignedOut - Whether the viewer is signed out of Tau.
 * @returns The ask, or `undefined` when the backup needs nothing from the person.
 */
const backupAsk = (
  { sync, remote }: RevisionStatusProjection,
  isSignedOut: boolean | undefined,
): string | undefined => {
  if (sync.state !== 'failed') {
    return undefined;
  }
  switch (sync.reason) {
    case 'unauthorized': {
      /* M5: Tau Cloud already holds everything, so signing in again is all it asks. */
      if (remote.kind === 'tau' && isRefusedWhileBackedUp(sync)) {
        return 'Sign in again to keep backing up';
      }
      return asksTauSignIn(sync, remote, isSignedOut)
        ? 'Sign in to back up'
        : isGithubRemote(remote)
          ? 'Reconnect GitHub'
          : 'Your Git host refused access';
    }
    case 'quota': {
      return 'Storage is full';
    }
    case 'notEntitled': {
      return 'Backup is a Pro feature';
    }
    case 'largeFiles': {
      return `Some files are too large for ${isGithubRemote(remote) ? 'GitHub' : 'your Git host'}`;
    }
    case 'moved': {
      return 'Repository moved';
    }
    default: {
      return undefined;
    }
  }
};

/**
 * The line a conflict is decided on (HQ2, D14): the line the resolution lands
 * on, which every device names the same, however the conflict reached it.
 *
 * @param status - The revision status projection.
 * @param where - Where the checkout is.
 * @returns The line's name, when one is known.
 * @public
 */
export const conflictLine = (status: RevisionStatusProjection, where: RevisionWhere): string | undefined =>
  status.conflicts[0]?.into ?? where.branch;

/**
 * Whether a conflict waits on the person's decision: a merge or pull that stopped on conflicting files.
 *
 * @param status - The revision status projection.
 * @returns Whether a decision is waiting.
 * @public
 */
export const hasRevisionConflict = (status: RevisionStatusProjection): boolean =>
  status.conflicts.length > 0 || status.sync.state === 'conflicted';

/**
 * The sentence that names a waiting conflict's decision and its line (HQ2, D14).
 *
 * @param status - The revision status projection.
 * @param where - Where the checkout is.
 * @returns *Needs your decision*, on the line the resolution lands on when one is known.
 * @public
 */
export const conflictSentence = (status: RevisionStatusProjection, where: RevisionWhere): string => {
  const line = conflictLine(status, where);
  return line === undefined ? needsDecision : `${needsDecision} on ${line}`;
};

/** Failed, then needs you: the two tiers that interrupt. */
const interruptingFacts = (status: RevisionStatusProjection, where: RevisionWhere): RevisionFacts | undefined => {
  const { sync } = status;
  // `attention` counts conflicts too, and a conflict saved everything it was asked to (review R5).
  if (status.attention - status.conflicts.length > 0) {
    return { icon: CircleAlert, tone: 'text-feature', mark: 'failed', sentence: 'Couldn’t confirm the save' };
  }
  /* HQ3: an owner's revoke is the calm resting state below, never a red failure. */
  if (where.role !== 'revoked' && sync.state === 'failed' && failedBackupReasons.has(sync.reason ?? 'unknown')) {
    return { icon: CircleAlert, tone: 'text-feature', mark: 'failed', sentence: 'Couldn’t back up' };
  }
  if (hasRevisionConflict(status)) {
    return { icon: GitMerge, tone: 'text-warning', mark: 'attention', sentence: conflictSentence(status, where) };
  }
  const ask = where.role === 'revoked' ? undefined : backupAsk(status, where.isSignedOut);
  return ask === undefined
    ? undefined
    : {
        icon: CloudAlert,
        tone: 'text-warning',
        mark: 'attention',
        /* D68: a refusal with nothing waiting has lost no work. */
        sentence: `${isRefusedWhileBackedUp(sync) ? 'Backed up' : 'Not backed up'} · ${ask}`,
      };
};

/** Work the person started, while it runs. */
const runningSentence = (status: RevisionStatusProjection, where: RevisionWhere): string | undefined => {
  if (status.minting) {
    return where.branch === undefined ? 'Setting up…' : 'Saving…';
  }
  if (status.restore.busy) {
    return 'Restoring…';
  }
  const { busy, operation, branch } = status.branchVerb;
  return busy && operation !== undefined
    ? `${operationWords[operation]}${branch === undefined ? '' : ` ${branch}`}…`
    : undefined;
};

/** At rest: what the files are. */
const restingFacts = (status: RevisionStatusProjection, where: RevisionWhere): RevisionFacts => {
  if (where.isDirty) {
    return {
      icon: FileDiff,
      tone: 'text-warning',
      mark: 'none',
      sentence: where.head === undefined ? 'Nothing saved yet' : 'Unsaved changes',
    };
  }
  if (where.head === undefined) {
    return { icon: History, tone: '', mark: 'none', sentence: 'Nothing saved yet' };
  }
  if (where.role === 'read') {
    return { icon: History, tone: '', mark: 'none', sentence: 'Saved · View only' };
  }
  const backup = backupCopy(status.sync, where, status.remote);
  return {
    icon: History,
    tone: '',
    mark: 'none',
    sentence: backup === undefined ? 'Saved on this device' : `Saved · ${backup}`,
  };
};

/**
 * Work another device pushed that these files have not taken yet (RA4, D12).
 *
 * The canvas's arrival line (RS28, RS29): `Changes from Maya are ready`. It
 * shows while a turn holds the files, because a checkout a turn holds is never
 * re-based (rule 9); the changes apply when the turn settles. Who is History's
 * who line, except for the viewer's own work, which is said as `your other
 * device`. A row with no who line names nobody (M11, M1).
 *
 * @param card - The arrived entry's card, once History has read it.
 * @returns The sentence; before the card is read it still says something arrived (I6).
 * @public
 */
export const arrivedSentence = (card: RevisionCard | undefined): string => {
  if (card?.isYours === true) {
    return 'Changes from your other device are ready';
  }
  if (card === undefined || card.actor === '') {
    return 'New changes are ready';
  }
  return `Changes from ${card.actor} are ready`;
};

/** Before the projection or the graph answers: loading, never empty (I6, S20). */
const loadingFacts: RevisionFacts = { icon: CircleDashed, tone: '', mark: 'none', sentence: 'Loading history…' };

/**
 * The one glyph and sentence for a checkout.
 *
 * Most urgent first — failed, then needs you, then in flight — and otherwise
 * the glyph says what the files are: at a revision, or modified since one.
 * Before the projection or the graph has answered, the sentence says History is
 * loading rather than that nothing was saved (I6). Backup transfer, a queued or
 * offline backup, and the asks a pane dialog is already showing stay calm here.
 *
 * @param status - The revision status projection, `undefined` before the root answers.
 * @param where - Where the checkout is.
 * @param arrived - The card of the revision `status.sync.arrived` names, once read.
 * @returns The glyph, its tone, the mark it stands for and the sentence.
 * @public
 */
export const selectRevisionFacts = (
  status: RevisionStatusProjection | undefined,
  where: RevisionWhere,
  arrived?: RevisionCard,
): RevisionFacts => {
  if (status === undefined) {
    return loadingFacts;
  }
  const interrupting = interruptingFacts(status, where);
  if (interrupting !== undefined) {
    return interrupting;
  }
  const running = runningSentence(status, where);
  if (running !== undefined) {
    return { icon: CircleDashed, tone: '', mark: 'running', sentence: running };
  }
  /* Calm: nothing is asked of the person, and the arrival applies on its own. */
  if (status.sync.arrived !== undefined) {
    return { icon: arrivedGlyph, tone: '', mark: 'none', sentence: arrivedSentence(arrived) };
  }
  return where.isLoading === true && where.head === undefined && !where.isDirty
    ? loadingFacts
    : restingFacts(status, where);
};

/**
 * Where the checkout is and what every surface says about it, read once from
 * the owners so the header, its card and the pane cannot disagree (RA11).
 *
 * @returns Where the checkout is, its facts, the head's card and the projection.
 * @public
 */
export const useRevisionFacts = (): Readonly<{
  where: RevisionWhere;
  facts: RevisionFacts;
  head: RevisionCard | undefined;
  status: RevisionStatusProjection | undefined;
}> => {
  const { line, headRevisionId, revisions, isDirty, isLoading } = useRevisions();
  const status = useRevisionStatus();
  const role = useProjectRole();
  const isSignedOut = useRevisionSessionUser() === undefined;
  const head = revisions.find((revision) => revision.revisionId === headRevisionId);
  const arrivedId = status?.sync.arrived;
  const arrived = useRevisionCards(arrivedId === undefined ? [] : [arrivedId]).get(arrivedId ?? '');
  const where: RevisionWhere = {
    branch: line.kind === 'unknown' ? undefined : line.name,
    head: head?.n,
    isDirty,
    isLoading,
    role,
    isSignedOut,
  };
  return { where, facts: selectRevisionFacts(status, where, arrived), head, status };
};

/**
 * The trigger's name, which is also its tooltip: where the person is and the
 * status sentence (M11). No number: an entry has none.
 *
 * @param where - Where the checkout is.
 * @param sentence - The status sentence.
 * @returns `Open History. You are on main. Unsaved changes.`
 * @public
 */
export const revisionAccessibleName = (where: RevisionWhere, sentence: string): string => {
  const place = where.branch === undefined ? 'Setting up' : `You are on ${where.branch}`;
  const status = sentence.replaceAll(' · ', ', ');
  return `Open History. ${place}. ${status}${status.endsWith('…') ? '' : '.'}`;
};

/** The strip's verbs, in the words the palette and the rows use. @public */
export type StripVerb = 'Discard' | 'Save' | 'Undo restore' | 'Undo' | 'Try again' | 'Sign in' | 'Upgrade';

/** The header's sentence while the agent's turn holds these files (C2). @public */
export const agentWorkingSentence = 'Agent is working · saves when it finishes';

/**
 * The header's verbs for this state: at most two, one of them primary (C2).
 * A conflict names no verb: its card sits directly below the header. Backing
 * up is the backup line's, and sync is continuous, so neither *Back up* nor
 * *Sync now* is a header verb; a save that was not confirmed offers *Try
 * again*, which saves the files again. Unsaved changes offer *Discard* beside *Save*: it acts at once and
 * can be undone.
 *
 * @param input - The projection, where the checkout is, and what the viewer may do.
 * @returns The primary verb, when one applies, and the secondary verbs.
 * @public
 */
export const selectStripVerbs = ({
  status,
  where,
  undoable,
  canUndo = false,
  canWrite,
  canUpgrade = true,
}: Readonly<{
  status: RevisionStatusProjection | undefined;
  where: RevisionWhere;
  /**
   * *Undo restore* would succeed: the selected head is the row a restore this
   * session made, so a reload or another device's restore never offers it (D2).
   */
  undoable: boolean;
  /**
   * *Undo* has an operation of this device's to reverse on the line (D15).
   * *Undo restore* wins when both apply: on an unmoved line they make the same files.
   */
  canUndo?: boolean;
  canWrite: boolean;
  /**
   * *Upgrade* is this viewer's to take (D17): the owner, on a plan a larger one
   * exists for. A collaborator's and a top-tier owner's storage refusal names
   * no plan action, on this strip as in the Sync row.
   */
  canUpgrade?: boolean;
}>): Readonly<{ primary: StripVerb | undefined; secondary: readonly StripVerb[] }> => {
  if (status === undefined || !canWrite || hasRevisionConflict(status)) {
    return { primary: undefined, secondary: [] };
  }
  if (status.attention - status.conflicts.length > 0) {
    return { primary: 'Try again', secondary: [] };
  }
  if (where.isDirty) {
    /* Discard restores the files to the entry they are at, so with no entry there is nothing to go back to. */
    return { primary: 'Save', secondary: where.head === undefined ? [] : ['Discard'] };
  }
  const secondary: StripVerb[] = undoable ? ['Undo restore'] : canUndo ? ['Undo'] : [];
  if (where.head === undefined) {
    return { primary: undefined, secondary };
  }
  const { sync, remote } = status;
  if (sync.state === 'failed' && asksTauSignIn(sync, remote, where.isSignedOut)) {
    return { primary: 'Sign in', secondary };
  }
  if (sync.state === 'failed' && (sync.reason === 'quota' || sync.reason === 'notEntitled')) {
    /* F2: no plan clears D20's per-repository ceiling. */
    return { primary: canUpgrade && !isCeilingRefusal(sync.error) ? 'Upgrade' : undefined, secondary };
  }
  return { primary: undefined, secondary };
};

/**
 * The chat marker's glyph for its turn's state, from the trigger's family (HQ5):
 * an unconfirmed save is the trigger's red, a conflict its amber, and
 * only an interrupted turn — the chat's own soft error — is purple.
 *
 * @param state - A visible turn revision state.
 * @returns The glyph and its tone.
 * @public
 */
export const turnRevisionGlyph = (state: TurnRevisionState): Readonly<{ icon: LucideIcon; tone: string }> => {
  switch (state.kind) {
    case 'working':
    case 'saving': {
      return { icon: CircleDashed, tone: 'text-muted-foreground' };
    }
    case 'saved': {
      return state.isInterrupted
        ? { icon: CircleAlert, tone: 'text-feature' }
        : { icon: History, tone: 'text-muted-foreground' };
    }
    case 'conflicted': {
      return { icon: GitMerge, tone: 'text-warning' };
    }
    case 'unconfirmed': {
      return { icon: CircleAlert, tone: 'text-feature' };
    }
    case 'hidden': {
      return { icon: History, tone: 'text-muted-foreground' };
    }
  }
};

/** Work that arrived from elsewhere: the family's arrival glyph (RS28, gated on W5). @public */
export const arrivedGlyph: LucideIcon = ArrowDownToLine;

/**
 * What asked for an entry, in a person's words, for its Details.
 *
 * A turn's base cut is recorded under the turn's trigger, but it holds the
 * person's own edits, saved before the agent started (A5): it says so.
 *
 * @param trigger - The recorded trigger, when the store recorded one.
 * @param turnCut - Which of a turn's two entries it is, when a turn minted it.
 * @returns The label.
 * @public
 */
export const revisionTriggerLabel = (trigger: string | undefined, turnCut?: RevisionCard['turnCut']): string => {
  if (turnCut === 'base') {
    return 'Your edits, saved before the agent started';
  }
  switch (trigger) {
    case 'turn': {
      return 'Agent turn';
    }
    case 'restore': {
      return 'Restore';
    }
    case 'merge': {
      return 'Merge';
    }
    case 'switch': {
      return 'Branch switch';
    }
    case 'idle':
    case 'hidden':
    case 'close': {
      return 'Autosave';
    }
    case 'save': {
      return 'Save';
    }
    case 'create': {
      return 'Project created';
    }
    case 'import': {
      return 'Import';
    }
    default: {
      return 'Not recorded';
    }
  }
};
