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
import { isCeilingRefusal, isGithubRemoteUrl } from '@taucad/revisions';
import type { RemoteFacet, RevisionStatusProjection, SyncFacet } from '@taucad/revisions';
import type { SidebarMark } from '#hooks/use-sidebar-status.js';
import type { ProjectAccessRole } from '#hooks/use-cloud-projects.js';
import { useRevisionCards, useRevisions } from '#hooks/use-revisions.js';
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
 * @param remote - The connection, so a refusal names who refused.
 * @returns What the backup line reads, or `undefined` with no remote.
 * @public
 */
export const syncCopy = (sync: SyncFacet, remote?: RemoteFacet): string | undefined => {
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
      if (sync.pendingCount > 0) {
        return `Not backed up · ${String(sync.pendingCount)} revision${sync.pendingCount === 1 ? '' : 's'}`;
      }
      if (isRefusedWhileBackedUp(sync)) {
        const refuser =
          remote === undefined
            ? 'The remote'
            : isGithubRemote(remote)
              ? 'GitHub'
              : remote.kind === 'tau'
                ? 'Tau Cloud'
                : 'The remote';
        return `Backed up · ${refuser} refused access`;
      }
      return 'Not backed up';
    }
  }
};

/**
 * Whether the remote refused access after acknowledging everything (D68).
 *
 * *Not backed up* is reserved for revisions the server has not acknowledged
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
 * push (HQ3).
 *
 * @param sync - The settled sync facet.
 * @param role - The viewer's role on the cloud project.
 * @param remote - The connection, so a refusal names who refused.
 * @returns The sentence, or `undefined` with no remote.
 * @public
 */
export const backupCopy = (
  sync: SyncFacet,
  role: ProjectAccessRole | undefined,
  remote?: RemoteFacet,
): string | undefined => (role === 'revoked' && sync.state !== 'noRemote' ? accessRemoved : syncCopy(sync, remote));

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
  const backup = backupCopy(status.sync, where.role, status.remote);
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
 * The canvas's arrival line (RS28, RS29): `Rev N arrived from <who>`. It shows
 * while a turn holds the files, because a checkout a turn holds is never
 * re-based (rule 9); the revision applies when the turn settles. Who is
 * History's attribution (HQ4) on its remote (`Tau agent on Tau Cloud`), except
 * for the viewer's own work, which is said as `another session`: attribution
 * here is the revision's own provenance, which its author asserts, and this
 * client can read neither the server's per-push attribution (EQ11's
 * `committedBy`/`viaDevice`) nor a device id on the revision — so it claims no
 * other *device* it cannot prove (RV-W5b F11). A second tab is a session too.
 *
 * @param card - The arrived revision's card, once History has read it.
 * @param remote - The remote it arrived from.
 * @returns The sentence; before the card is read it still says something arrived (I6).
 * @public
 */
export const arrivedSentence = (card: RevisionCard | undefined, remote?: RemoteFacet): string => {
  const name = revisionName(card?.n) ?? 'A new revision';
  if (card === undefined) {
    return `${name} arrived`;
  }
  if (card.actor === 'You') {
    return `${name} arrived from another session`;
  }
  return remote?.kind === 'tau'
    ? `${name} arrived from ${card.actor} on Tau Cloud`
    : `${name} arrived from ${card.actor}`;
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
    return { icon: arrivedGlyph, tone: '', mark: 'none', sentence: arrivedSentence(arrived, status.remote) };
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
  const arrivedId = status?.sync.arrived;
  const arrived = useRevisionCards(arrivedId === undefined ? [] : [arrivedId]).get(arrivedId ?? '');
  const where: RevisionWhere = {
    branch: line.kind === 'unknown' ? undefined : line.name,
    head: head?.n,
    isDirty,
    isLoading,
    role,
  };
  return { where, facts: selectRevisionFacts(status, where, arrived), head, status };
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
export type StripVerb = 'Save revision' | 'Undo restore' | 'Undo' | 'Back up' | 'Sync now' | 'Sign in' | 'Upgrade';

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
  if (status === undefined || !canWrite || status.conflicts.length > 0 || status.sync.state === 'conflicted') {
    return { primary: undefined, secondary: [] };
  }
  const secondary: StripVerb[] = where.isDirty ? [] : undoable ? ['Undo restore'] : canUndo ? ['Undo'] : [];
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
