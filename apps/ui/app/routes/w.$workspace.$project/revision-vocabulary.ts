/**
 * The revision surfaces' one vocabulary (charter D7, RA3, RA11).
 *
 * Every revision surface — the header trigger, its hover card and accessible
 * name, the Revisions pane's strip, History, Sync, the chat marker and the
 * palette — reads its sentence and its glyph here, so one state is said one way
 * everywhere (I12). The glyph family is the header trigger's, most urgent first:
 * `CircleAlert` red when something failed, `GitMerge` and `CloudAlert` amber
 * when a decision or an ask waits on the person, `CircleDashed` while work is in
 * flight, `FileDiff` amber when the files are modified, `ArrowDownToLine` for
 * work that arrived, and `History` at rest. Purple stays with the chat's own soft
 * errors, which are not revision states (HQ5).
 */
import { ArrowDownToLine, CircleAlert, CircleDashed, CloudAlert, FileDiff, GitMerge, History } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { isGithubRemoteUrl } from '@taucad/revisions';
import type { RemoteFacet, RevisionStatusProjection, SyncFacet } from '@taucad/revisions';
import type { SidebarMark } from '#hooks/use-sidebar-status.js';
import type { ProjectAccessRole } from '#hooks/use-cloud-projects.js';
import { useRevisions } from '#hooks/use-revisions.js';
import type { RevisionCard } from '#hooks/use-revisions.js';
import { useProjectRole, useRevisionStatus } from '#hooks/use-revision-status.js';
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
  /** The revision the files are at. */
  head: number | undefined;
  isDirty: boolean;
  /** History has not answered yet: loading is not empty (I6). */
  isLoading?: boolean;
  /** The viewer's role on the cloud project, which makes view-only and removed access calm states (HQ3). */
  role?: ProjectAccessRole | undefined;
}>;

/** A decision waiting on the person, said one way on every surface (HQ1, HQ6). @public */
export const needsDecision = 'Needs your decision';

/** The calm state of a person whose access the owner removed (HQ3). @public */
export const accessRemoved = 'Access removed';

/**
 * What a person whose access was removed can do about it (D17's owner-directed
 * sentence): the owner decides, and nothing on this device is lost.
 *
 * @public
 */
export const accessRemovedSentence =
  'The owner removed your access to this project’s cloud copy. Ask them to add you again; every revision stays on this device.';

/**
 * A revision's public name: `Rev N`, a first-parent ordinal on its line (EQ9).
 *
 * @param n - The ordinal, or `undefined` for a revision off the line.
 * @returns `Rev N`, or `undefined` when the revision has no number to show.
 * @public
 */
export const revisionName = (n: number | undefined): string | undefined =>
  n === undefined ? undefined : `Rev ${String(n)}`;

/**
 * A revision's title: its name when it has one; a restore's, what it restored
 * (A9), never its trigger; otherwise what it says.
 *
 * @param revision - The revision.
 * @param revisions - The line's history, which names the revision a restore brought back.
 * @returns The title.
 * @public
 */
export const revisionTitle = (revision: RevisionCard, revisions: readonly RevisionCard[]): string => {
  const named = revision.tags?.[0];
  if (named !== undefined) {
    return named;
  }
  if (revision.restoredFrom === undefined) {
    return revision.summary;
  }
  const restored = revisionName(revisions.find((entry) => entry.revisionId === revision.restoredFrom)?.n);
  return restored === undefined ? 'Restored an earlier revision' : `Restored ${restored}`;
};

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
 * The backup's own sentence: whether this project's work is on its remote.
 *
 * `Checking…` is the open pull's first window. A conflict is the one decision a
 * backup can wait on, and it says so in the words every surface uses (HQ1).
 *
 * @param sync - The settled sync facet.
 * @returns What the backup line reads, or `undefined` with no remote.
 * @public
 */
export const syncCopy = (sync: SyncFacet): string | undefined => {
  switch (sync.state) {
    case 'noRemote': {
      return undefined;
    }
    case 'checking': {
      return 'Checking…';
    }
    case 'backedUp': {
      return 'Backed up';
    }
    case 'pending': {
      return sync.pendingCount > 0
        ? `Backing up… ${String(sync.pendingCount)} revision${sync.pendingCount === 1 ? '' : 's'}`
        : 'Backing up…';
    }
    case 'conflicted': {
      return needsDecision;
    }
    default: {
      /* `queued` and `failed` read the same to a person: their work is not on
       * the server. Whether this device retries by itself is the Sync line's. */
      return sync.pendingCount > 0
        ? `Not backed up · ${String(sync.pendingCount)} revision${sync.pendingCount === 1 ? '' : 's'}`
        : 'Not backed up';
    }
  }
};

/**
 * The backup line for this viewer: removed access is a calm fact, not a failed
 * push (HQ3).
 *
 * @param sync - The settled sync facet.
 * @param role - The viewer's role on the cloud project.
 * @returns The sentence, or `undefined` with no remote.
 * @public
 */
export const backupCopy = (sync: SyncFacet, role: ProjectAccessRole | undefined): string | undefined =>
  role === 'revoked' && sync.state !== 'noRemote' ? accessRemoved : syncCopy(sync);

const operationWords: Record<NonNullable<RevisionStatusProjection['branchVerb']['operation']>, string> = {
  switch: 'Switching',
  merge: 'Merging',
  discard: 'Discarding',
  create: 'Creating',
  rename: 'Renaming',
};

/** Backup refusals only the pane can repair, or nobody can; the rest ask the person for something. */
const failedBackupReasons: ReadonlySet<string> = new Set(['rejected', 'forbidden', 'notFound', 'damaged', 'unknown']);

/**
 * What a failed backup asks the person for (R-U4). Only Tau Cloud is reached
 * with this device's own session, so only it asks to *Sign in* (D18).
 *
 * @param status - The revision status projection.
 * @returns The ask, or `undefined` when the backup needs nothing from the person.
 */
const backupAsk = ({ sync, remote }: RevisionStatusProjection): string | undefined => {
  if (sync.state !== 'failed') {
    return undefined;
  }
  switch (sync.reason) {
    case 'unauthorized': {
      return remote.kind === 'tau' ? 'Sign in' : isGithubRemote(remote) ? 'Reconnect GitHub' : 'Remote refused access';
    }
    case 'quota': {
      return 'Over your plan';
    }
    case 'notEntitled': {
      return 'Backup is a Pro feature';
    }
    case 'largeFiles': {
      return 'Files too large for this remote';
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
 * The line a conflict is decided on (HQ2): the line the resolution lands on,
 * which is the branch merged into, or the line both devices changed.
 *
 * @param status - The revision status projection.
 * @param where - Where the checkout is.
 * @returns The line's name, when one is known.
 * @public
 */
export const conflictLine = (status: RevisionStatusProjection, where: RevisionWhere): string | undefined => {
  const conflict = status.conflicts[0];
  return conflict?.labels?.ours ?? where.branch ?? conflict?.branch;
};

/** Failed, then needs you: the two tiers that interrupt. */
const interruptingFacts = (status: RevisionStatusProjection, where: RevisionWhere): RevisionFacts | undefined => {
  const { sync } = status;
  // `attention` counts conflicts too, and a conflict saved everything it was asked to (review R5).
  if (status.attention - status.conflicts.length > 0) {
    return { icon: CircleAlert, tone: 'text-destructive', mark: 'failed', sentence: 'Save not confirmed' };
  }
  /* HQ3: an owner's revoke is the calm resting state below, never a red failure. */
  if (where.role !== 'revoked' && sync.state === 'failed' && failedBackupReasons.has(sync.reason ?? 'unknown')) {
    return { icon: CircleAlert, tone: 'text-destructive', mark: 'failed', sentence: 'Backup failed' };
  }
  if (status.conflicts.length > 0 || sync.state === 'conflicted') {
    const line = conflictLine(status, where);
    return {
      icon: GitMerge,
      tone: 'text-warning',
      mark: 'attention',
      sentence: line === undefined ? needsDecision : `${needsDecision} on ${line}`,
    };
  }
  const ask = where.role === 'revoked' ? undefined : backupAsk(status);
  return ask === undefined
    ? undefined
    : { icon: CloudAlert, tone: 'text-warning', mark: 'attention', sentence: `Not backed up · ${ask}` };
};

/** Work the person started, while it runs. */
const runningSentence = (status: RevisionStatusProjection, where: RevisionWhere): string | undefined => {
  if (status.minting) {
    return where.branch === undefined ? 'Setting up history' : 'Saving…';
  }
  if (status.restore.busy) {
    const target = revisionName(status.restore.revisionNumber);
    return `Restoring${target === undefined ? '' : ` ${target}`}…`;
  }
  const { busy, operation, branch } = status.branchVerb;
  return busy && operation !== undefined
    ? `${operationWords[operation]}${branch === undefined ? '' : ` ${branch}`}…`
    : undefined;
};

/** At rest: what the files are. */
const restingFacts = (status: RevisionStatusProjection, where: RevisionWhere): RevisionFacts => {
  if (where.isDirty) {
    const since = revisionName(where.head);
    return {
      icon: FileDiff,
      tone: 'text-warning',
      mark: 'none',
      sentence: since === undefined ? 'Not saved yet' : `Modified since ${since}`,
    };
  }
  if (where.head === undefined) {
    return { icon: History, tone: '', mark: 'none', sentence: 'Nothing saved yet' };
  }
  if (where.role === 'read') {
    return { icon: History, tone: '', mark: 'none', sentence: 'Saved · View only' };
  }
  const backup = backupCopy(status.sync, where.role);
  return {
    icon: History,
    tone: '',
    mark: 'none',
    sentence: backup === undefined ? 'Saved on this device' : `Saved · ${backup}`,
  };
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
 * @returns The glyph, its tone, the mark it stands for and the sentence.
 * @public
 */
export const selectRevisionFacts = (
  status: RevisionStatusProjection | undefined,
  where: RevisionWhere,
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
  const head = revisions.find((revision) => revision.revisionId === headRevisionId);
  const where: RevisionWhere = {
    branch: line.kind === 'unknown' ? undefined : line.name,
    head: head?.n,
    isDirty,
    isLoading,
    role,
  };
  return { where, facts: selectRevisionFacts(status, where), head, status };
};

/**
 * The trigger's name, which carries what the card shows at a glance, because
 * a hover card is not reachable by a screen reader.
 *
 * @param where - Where the checkout is.
 * @param sentence - The status sentence.
 * @returns `Open Revisions. You are on main, Rev 12. Modified since Rev 12.`
 * @public
 */
export const revisionAccessibleName = (where: RevisionWhere, sentence: string): string => {
  const head = revisionName(where.head);
  const place =
    where.branch === undefined ? 'Setting up' : `You are on ${where.branch}${head === undefined ? '' : `, ${head}`}`;
  const status = sentence.replaceAll(' · ', ', ');
  return `Open Revisions. ${place}. ${status}${status.endsWith('…') ? '' : '.'}`;
};

/** The strip's verbs, in the words the palette and the rows use. @public */
export type StripVerb = 'Save revision' | 'Undo restore' | 'Back up' | 'Sync now' | 'Sign in' | 'Upgrade';

/**
 * The strip's verbs for this state: at most one primary, and the decisions and
 * recoveries that stay visible beside it. A conflict names no strip verb: its
 * card sits directly below the strip.
 *
 * @param input - The projection, where the checkout is, and what the viewer may do.
 * @returns The primary verb, when one applies, and the secondary verbs.
 * @public
 */
export const selectStripVerbs = ({
  status,
  where,
  isHeadRestore,
  canWrite,
}: Readonly<{
  status: RevisionStatusProjection | undefined;
  where: RevisionWhere;
  /** The head is the row a restore minted, so *Undo restore* still applies (D2). */
  isHeadRestore: boolean;
  canWrite: boolean;
}>): Readonly<{ primary: StripVerb | undefined; secondary: readonly StripVerb[] }> => {
  if (status === undefined || !canWrite || status.conflicts.length > 0 || status.sync.state === 'conflicted') {
    return { primary: undefined, secondary: [] };
  }
  const secondary: StripVerb[] = isHeadRestore && !where.isDirty ? ['Undo restore'] : [];
  if (where.isDirty) {
    return { primary: 'Save revision', secondary };
  }
  if (where.head === undefined) {
    return { primary: undefined, secondary };
  }
  const { sync, remote } = status;
  if (sync.state === 'noRemote') {
    return { primary: 'Back up', secondary };
  }
  if (sync.state === 'queued') {
    return { primary: 'Sync now', secondary };
  }
  if (sync.state === 'failed' && sync.reason === 'unauthorized' && remote.kind === 'tau') {
    return { primary: 'Sign in', secondary };
  }
  if (sync.state === 'failed' && (sync.reason === 'quota' || sync.reason === 'notEntitled')) {
    return { primary: 'Upgrade', secondary };
  }
  return { primary: undefined, secondary };
};

/**
 * The chat marker's glyph for its turn's state, from the trigger's family (HQ5):
 * a failed or unconfirmed save is the trigger's red, a conflict its amber, and
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
    case 'notSaved':
    case 'unconfirmed': {
      return { icon: CircleAlert, tone: 'text-destructive' };
    }
    case 'hidden': {
      return { icon: History, tone: 'text-muted-foreground' };
    }
  }
};

/** Work that arrived from elsewhere: the family's arrival glyph (RS28, gated on W5). @public */
export const arrivedGlyph: LucideIcon = ArrowDownToLine;

/**
 * What asked for a revision, in a person's words, for its Details.
 *
 * @param trigger - The recorded trigger, when the store recorded one.
 * @returns The label.
 * @public
 */
export const revisionTriggerLabel = (trigger: string | undefined): string => {
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
      return 'Save revision';
    }
    default: {
      return 'Not recorded';
    }
  }
};
