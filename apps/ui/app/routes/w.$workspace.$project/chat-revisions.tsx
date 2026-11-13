import {
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import type { KeyboardEvent } from 'react';
import { ChevronDown, CircleAlert, CircleDashed, Cloud, GitBranch, History, Plus, Undo2, XIcon } from 'lucide-react';
import { Link } from 'react-router';
import { useSelector } from '@xstate/react';
import { Button } from '@taucad/ui/components/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@taucad/ui/components/collapsible';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@taucad/ui/components/dropdown-menu';
import { WaitIndicator } from '@taucad/ui/components/wait-indicator';
import { useWaitStart } from '#components/code/editor-pane-placeholder.js';
import { ToggleGroup, ToggleGroupItem } from '@taucad/ui/components/toggle-group';
import { cn } from '@taucad/ui/utils/cn';
import {
  FloatingPanel,
  FloatingPanelClose,
  FloatingPanelContent,
  FloatingPanelContentBody,
  FloatingPanelContentHeader,
  FloatingPanelContentHeaderActions,
  FloatingPanelContentTitle,
} from '#components/ui/floating-panel.js';
import { PanelEmptyState } from '@taucad/ui/components/panel-empty-state';
import { Spinner } from '@taucad/ui-kit/components/spinner';
import { ActionButton, disclosureMotion } from '@taucad/ui/components/actions';
import { NamePopover } from '#components/revisions/name-popover.js';
import { RevisionRegion } from '#components/revisions/revision-region.js';
import { graphGeometry, gutterWidth, layoutRevisionGraph } from '#components/revisions/revision-graph-layout.js';
import type { GraphNode, GraphRow, MarkerKind } from '#components/revisions/revision-graph-layout.js';
import { HistoryGraph, HistoryLanesContext, useRowBoxes } from '#components/revisions/revision-graph-view.js';
import type { BranchSlot } from '#components/revisions/revision-graph-view.js';
import { conflictLinesOf, historyLanesOf, listedBranchesOf } from '#routes/w.$workspace.$project/history-lanes.js';
import type { HistoryFilter, HistoryLanes } from '#routes/w.$workspace.$project/history-lanes.js';
import { LaneStepRow, laneGraphRowOf, pendingStepsOf } from '#routes/w.$workspace.$project/history-lanes-rows.js';
import type { LaneStep } from '#routes/w.$workspace.$project/history-lanes-rows.js';
import {
  timelineGutter,
  timelineList,
  timelineMoreGutter,
  timelineRow,
  timelineRowButton,
  timelineRowContent,
  timelineRowHover,
  timelineMarker,
} from '#components/revisions/revision-timeline.js';
import { RevisionRow, isAutosave, nextVersionNumber } from '#routes/w.$workspace.$project/revision-marker.js';
import { ConflictDecision } from '#routes/w.$workspace.$project/revision-branches.js';
import type { ConflictMaterialization } from '#routes/w.$workspace.$project/revision-branches.js';
import { RevisionSyncRegion } from '#routes/w.$workspace.$project/revision-sync-region.js';
import {
  agentWorkingSentence,
  needsDecision,
  revisionTitle,
  selectStripVerbs,
  useRevisionFacts,
  versionOf,
  versionPhrase,
} from '#routes/w.$workspace.$project/revision-vocabulary.js';
import type { StripVerb } from '#routes/w.$workspace.$project/revision-vocabulary.js';
import type { RevisionStatusProjection } from '@taucad/revisions';
import { useChatSessionStore } from '#hooks/chat-session-store-provider.js';
import { selectRunPhase } from '#machines/chat-projection.logic.js';
import {
  consumeBranchControl,
  useBranchControlRequest,
  useReportHistoryPaneShown,
} from '#routes/w.$workspace.$project/revision-pane-requests.js';
import { useRevisionGraph, useRevisions, useRevisionsOnLine, useWithRestoreTargets } from '#hooks/use-revisions.js';
import type { RevisionCard, RevisionsView } from '#hooks/use-revisions.js';
import { useRestoreToPoint } from '#hooks/use-restore-to-point.js';
import {
  useProjectRole,
  useRevisionClient,
  useRevisionCommands,
  useRevisionStatus,
} from '#hooks/use-revision-status.js';
import { describeRevisionFailure } from '@taucad/ui-core/lib/revision-failure-copy';
import { useRevisionSessionUser } from '#lib/revision-actor.js';
import { clearTurnOutcome, useTurnOutcomes } from '#routes/w.$workspace.$project/revision-outcomes.js';
import { useRevisionReveal } from '@taucad/project-workspace/utils/revision-reveal';
import { useChatRecords } from '#hooks/use-chat-records.js';
import { useProject } from '#hooks/use-project.js';
import { useSaveRevisionRequest } from '#routes/w.$workspace.$project/revision-save-shortcut.js';
import { useAuthLinks } from '#hooks/use-auth-links.js';
import { useCommercialFeatures } from '#cloud/commercial-features.js';
import { useProjectManager } from '#hooks/use-project-manager.js';
import { toast } from '@taucad/ui/components/sonner';

/** Sync settings live in tau.json, which Tau refuses to write while it needs repair (R4). */
const reportSyncSettingError = (error: unknown): void => {
  toast.error('Could not change sync settings', {
    description: error instanceof Error ? error.message : undefined,
  });
};

/**
 * The Revisions pane (S26, A18, A29), as a mobile `FloatingPanel` around the
 * shared body, so a phone gets the pane's own title and Close (L3-F15).
 *
 * @param props - Whether the panel is open, and how to change it.
 * @returns The panel.
 */
export function ChatRevisions({
  isExpanded = true,
  setIsExpanded,
}: {
  readonly isExpanded?: boolean;
  readonly setIsExpanded?: (value: boolean | ((current: boolean) => boolean)) => void;
}): React.JSX.Element {
  const { projectId } = useProject();
  /* The toolbar chip reads as pressed while History is on screen (C2). */
  useReportHistoryPaneShown(projectId, isExpanded);
  return (
    <FloatingPanel isOpen={isExpanded} side='right' onOpenChange={setIsExpanded}>
      <FloatingPanelContent>
        <FloatingPanelContentHeader>
          <FloatingPanelContentTitle>History</FloatingPanelContentTitle>
          <FloatingPanelContentHeaderActions>
            <FloatingPanelClose
              label='Close History'
              icon={XIcon}
              tooltipContent={(isOpen) => (
                <div className='flex items-center gap-2'>{isOpen ? 'Close' : 'Open'} History</div>
              )}
            />
          </FloatingPanelContentHeaderActions>
        </FloatingPanelContentHeader>
        <FloatingPanelContentBody className='p-0'>
          <RevisionsPanelBody />
        </FloatingPanelContentBody>
      </FloatingPanelContent>
    </FloatingPanel>
  );
}

/** The run phases in which the agent's turn holds its files. */
const workingPhases: ReadonlySet<string> = new Set(['admitted', 'running', 'paused']);

/**
 * Whether an agent's turn is running on the files this pane shows (C2).
 *
 * Read from each observed chat's projection, the same store History's
 * finalized turns are read from: a chat placed on this checkout, or an
 * unplaced one on the live checkout, whose current run has not settled.
 *
 * @param status - The revision status projection.
 * @returns The working chat's name while such a turn runs (empty when it has none), else `undefined`.
 */
const useAgentWorkHere = (status: RevisionStatusProjection | undefined): string | undefined => {
  const { projectId } = useProject();
  const store = useChatSessionStore();
  const { chats } = useChatRecords(projectId);
  const checkoutId = status?.checkoutId;
  const liveCheckoutId = status?.liveCheckoutId ?? status?.checkoutId;
  const subscribe = useCallback(
    (listener: () => void): (() => void) => {
      let unsubscribes: Array<() => void> = [];
      const bind = (): void => {
        for (const unsubscribe of unsubscribes) {
          unsubscribe();
        }
        unsubscribes = store.observedChatIdsOf(projectId).map((chatId) => store.subscribeProjection(chatId, listener));
      };
      const unsubscribeMembership = store.subscribeMembership(() => {
        bind();
        listener();
      });
      bind();
      return () => {
        unsubscribeMembership();
        for (const unsubscribe of unsubscribes) {
          unsubscribe();
        }
      };
    },
    [projectId, store],
  );
  const working = useSyncExternalStore(
    subscribe,
    () =>
      store
        .observedChatIdsOf(projectId)
        .filter((chatId) => {
          const projection = store.getProjection(chatId);
          return projection !== undefined && workingPhases.has(selectRunPhase(projection));
        })
        .join('|'),
    () => '',
  );
  if (working === '' || checkoutId === undefined) {
    return undefined;
  }
  const chatId = working
    .split('|')
    .find((id) => (chats.find((chat) => chat.id === id)?.checkoutId ?? liveCheckoutId) === checkoutId);
  return chatId === undefined ? undefined : (chats.find((chat) => chat.id === chatId)?.name ?? '');
};

/**
 * Where you are (C2, canvas `pane-header-states`): the branch chip, which is
 * the branch menu; the version, only while the files are exactly at one; one
 * status sentence; at most two verbs. No number, no ⋮, no Details.
 *
 * @returns The header.
 */
function WhereYouAre(): React.JSX.Element {
  const { projectId } = useProject();
  const { line } = useRevisions();
  const { where, facts, head, status } = useRevisionFacts();
  const role = useProjectRole();
  const commands = useRevisionCommands();
  const { restore, undo, isBusy } = useRestoreToPoint();
  const saveRevision = useSaveRevisionRequest();
  const { requestUpgrade, canUpgradePlan } = useCommercialFeatures();
  const { signIn } = useAuthLinks();
  const isAgentWorking = useAgentWorkHere(status) !== undefined;
  const isUnknown = line.kind === 'unknown';
  const canWrite = role !== 'read' && role !== 'revoked';
  /* No head, no branch point; and nothing is offered over a line nobody has located yet (HQ7). */
  const canBranch = head !== undefined && canWrite && !isUnknown;
  /* The agent's turn outranks unsaved changes, which are its own; a failure or a decision still outranks the turn. */
  const isAgentSentence = isAgentWorking && facts.mark !== 'failed' && facts.mark !== 'attention';
  const verbs = isAgentSentence
    ? { primary: undefined, secondary: [] }
    : selectStripVerbs({
        status,
        where,
        undoable: status?.restore.undoable === true,
        canUndo: status?.restore.canUndo === true,
        canWrite,
        /* D17: the plan is the owner's, and only a plan with a larger one to buy. */
        canUpgrade: canUpgradePlan && role !== 'write',
      });
  const sentence = isAgentSentence ? agentWorkingSentence : facts.sentence;
  const StatusIcon = isAgentSentence ? CircleDashed : facts.icon;
  const tone = isAgentSentence ? '' : facts.tone;
  /* M11: an entry has no number; a version shows only while the files are exactly at it, and nothing waits. */
  const headVersion =
    head === undefined || where.isDirty || isAgentWorking || facts.mark !== 'none' ? undefined : versionOf(head);
  const act = (verb: StripVerb): void => {
    switch (verb) {
      case 'Save':
      case 'Try again': {
        void saveRevision();
        break;
      }
      case 'Discard': {
        /* A restore of the entry the files are at, which saves the changes first, so a discard can be undone (I11). */
        if (head !== undefined) {
          restore(head.revisionId);
        }
        break;
      }
      case 'Undo restore': {
        undo();
        break;
      }
      case 'Undo': {
        commands.undoOperation();
        break;
      }
      case 'Upgrade': {
        requestUpgrade();
        break;
      }
      case 'Sign in': {
        break;
      }
    }
  };
  const renderVerb = (verb: StripVerb, isPrimary: boolean): React.JSX.Element =>
    verb === 'Sign in' ? (
      <Button key={verb} asChild size='xs' variant='default'>
        <Link to={signIn}>Sign in</Link>
      </Button>
    ) : (
      <ActionButton
        key={verb}
        verb={verb}
        icon={verb === 'Undo restore' || verb === 'Undo' ? Undo2 : undefined}
        variant={isPrimary ? 'default' : verb === 'Discard' ? 'ghost' : 'outline'}
        className={verb === 'Discard' ? 'text-foreground' : undefined}
        disabled={isBusy}
        onClick={() => {
          act(verb);
        }}
      />
    );

  return (
    <section aria-label='Where you are' className='flex shrink-0 flex-col gap-1 border-b bg-sidebar px-3 py-1.5'>
      <div data-slot='where-line' className='flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1'>
        {isUnknown ? (
          /* The chip's own box, empty until the line is located: nothing is drawn for a branch nobody knows yet. */
          <span data-slot='branch-chip-pending' aria-hidden className='h-6 w-24' />
        ) : (
          <BranchChip projectId={projectId} branch={line.name} isBranchable={canBranch} />
        )}
        {headVersion === undefined ? null : (
          <span data-slot='at-version' className='min-w-0 text-xs text-muted-foreground'>
            {versionPhrase(headVersion)}
          </span>
        )}
        {verbs.primary === undefined && verbs.secondary.length === 0 ? null : (
          <span data-slot='where-verbs' className='ml-auto flex items-center gap-2'>
            {verbs.secondary.map((verb) => renderVerb(verb, false))}
            {verbs.primary === undefined ? null : renderVerb(verbs.primary, true)}
          </span>
        )}
      </div>
      <p
        role='status'
        aria-label='History status'
        aria-busy={facts.mark === 'running' || sentence === 'Loading history…' ? true : undefined}
        className='flex items-start gap-1.5 text-xs'
      >
        <StatusIcon
          aria-hidden
          data-slot='status-glyph'
          className={cn('mt-px size-3.5 shrink-0', tone === '' ? 'text-muted-foreground' : tone)}
        />
        <span className='min-w-0'>{sentence}</span>
      </p>
    </section>
  );
}

/**
 * The branch chip, which is the branch menu (C2, D3): every branch to switch
 * to, then New branch…, whose form opens under the chip. A conflict line is a
 * decision in flight, never a place to switch to (D14).
 *
 * @param props - The project, the branch the files are on, and whether a branch can start here.
 * @returns The chip.
 */
function BranchChip({
  projectId,
  branch,
  isBranchable,
}: {
  readonly projectId: string;
  readonly branch: string;
  readonly isBranchable: boolean;
}): React.JSX.Element {
  const status = useRevisionStatus();
  const { branchFacts } = useRevisions();
  const commands = useRevisionCommands();
  const request = useBranchControlRequest(projectId);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isNaming, setIsNaming] = useState(false);
  const chipRef = useRef<HTMLButtonElement>(null);
  /* New branch… opens its form once the menu has closed, so the menu's focus trap does not take focus back. */
  const willName = useRef(false);
  const branches = listedBranchesOf(status);
  const isBusy = status?.branchVerb.busy ?? false;
  /* A palette item asked for the menu or the form: open it here, once. */
  useEffect(() => {
    if (request === undefined) {
      return;
    }
    consumeBranchControl(projectId);
    if (request === 'new-branch' && isBranchable) {
      // oxlint-disable-next-line react/set-state-in-effect -- the palette's request is an external event this header answers once.
      setIsNaming(true);
    } else if (request === 'switch-branch') {
      setIsMenuOpen(true);
    }
  }, [request, projectId, isBranchable]);

  return (
    <DropdownMenu open={isMenuOpen} onOpenChange={setIsMenuOpen}>
      <NamePopover
        anchor={
          <DropdownMenuTrigger asChild>
            <Button
              ref={chipRef}
              variant='outline'
              size='xs'
              data-slot='branch-chip'
              aria-label={`Branch: ${branch}. Switch branch`}
              className='max-w-full min-w-0 rounded-full pr-1.5 pl-2 text-sm'
            >
              <GitBranch aria-hidden className='size-3.5 text-muted-foreground' />
              <span className='truncate'>{branch}</span>
              <ChevronDown aria-hidden className='size-3 text-muted-foreground' />
            </Button>
          </DropdownMenuTrigger>
        }
        isOpen={isNaming}
        returnFocus={chipRef}
        onOpenChange={setIsNaming}
        label='Branch name'
        placeholder='enclosure-v2'
        note={`Starts from where you are now. ${branch} stays as it is.`}
        saveLabel='Create branch'
        isBusy={isBusy}
        onSave={(name) => {
          // oxlint-disable-next-line promise/prefer-await-to-then, tau-lint/no-async-iife -- the toast channel owns this refusal; only the loose rejection is ours
          void commands.createBranch(name).catch(() => undefined);
        }}
      />
      <DropdownMenuContent
        align='start'
        className='max-w-[calc(100vw-2rem)] min-w-56'
        onCloseAutoFocus={(event) => {
          if (willName.current) {
            willName.current = false;
            event.preventDefault();
            setIsNaming(true);
          }
        }}
      >
        <DropdownMenuLabel>Switch branch</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={branch}
          onValueChange={(name) => {
            if (name !== branch) {
              commands.switchTo(name);
            }
          }}
        >
          {branches.map((entry) => {
            const fact = branchFacts?.get(entry.name);
            const counts = [
              fact !== undefined && fact.ahead > 0 ? `${String(fact.ahead)} ahead` : '',
              fact !== undefined && fact.behind > 0 ? `${String(fact.behind)} behind` : '',
            ].filter(Boolean);
            /* M4: a branch Tau Cloud has and this device has no files for (D93); one only this device has says nothing. */
            const note =
              entry.checkoutId === undefined && entry.onRemote === true ? 'Not on this device' : counts.join(', ');
            return (
              <DropdownMenuRadioItem key={entry.name} value={entry.name} disabled={isBusy}>
                <span className='min-w-0 flex-1 truncate'>{entry.name}</span>
                {note === '' ? null : <span className='text-xs text-muted-foreground tabular-nums'>{note}</span>}
              </DropdownMenuRadioItem>
            );
          })}
        </DropdownMenuRadioGroup>
        {isBranchable ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              disabled={isBusy}
              onSelect={() => {
                willName.current = true;
              }}
            >
              <Plus aria-hidden />
              New branch…
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** One row or fold of History. @public */
export type HistoryGroup =
  | Readonly<{ kind: 'revision'; revision: RevisionCard }>
  | Readonly<{ kind: 'autosaves'; revisions: readonly RevisionCard[] }>
  | Readonly<{ kind: 'setup'; revisions: readonly RevisionCard[] }>;

/* Tau's own setup changes, one compact line (A4): flagged at read, never named or conflicted. */
const isSetupCard = (revision: RevisionCard): boolean =>
  revision.isSetup === true && (revision.tags?.length ?? 0) === 0 && !revision.conflicted;

/**
 * Fold only consecutive, unnamed autosaves; meaningful revisions stay visible.
 * Consecutive entries of Tau's own setup are one compact line, the head among
 * them: Current never marks them ({@link currentRevisionOf}).
 *
 * The newest backed-up entry starts a group of its own, so *Backed up to here*
 * sits between groups and never inside a fold (D4). On History's lanes a fold
 * never joins entries of two lines (D2).
 *
 * @param revisions - The line's history, newest first.
 * @param headRevisionId - The revision the checkout reflects, which never folds into autosaves.
 * @param options - `backedUpTo`, the newest entry the remote holds, which no newer entry folds with; `lineOf`, the line each entry is drawn on when History draws lanes.
 * @returns The rows and folds History renders.
 */
export const groupRevisionHistory = (
  revisions: readonly RevisionCard[],
  headRevisionId: string | undefined,
  { backedUpTo, lineOf }: Readonly<{ backedUpTo?: string; lineOf?: ReadonlyMap<string, string> }> = {},
): readonly HistoryGroup[] => {
  const groups: HistoryGroup[] = [];
  const isSameLine = (group: HistoryGroup | undefined, revision: RevisionCard): boolean =>
    lineOf === undefined ||
    group === undefined ||
    lineOf.get(group.kind === 'revision' ? group.revision.revisionId : group.revisions[0]!.revisionId) ===
      lineOf.get(revision.revisionId);
  for (const revision of revisions) {
    const startsGroup = revision.revisionId === backedUpTo;
    if (isSetupCard(revision)) {
      const previous = groups.at(-1);
      if (previous?.kind === 'setup' && !startsGroup && isSameLine(previous, revision)) {
        groups[groups.length - 1] = { kind: 'setup', revisions: [...previous.revisions, revision] };
      } else {
        groups.push({ kind: 'setup', revisions: [revision] });
      }
      continue;
    }
    const foldable =
      revision.revisionId !== headRevisionId &&
      (revision.tags?.length ?? 0) === 0 &&
      !revision.conflicted &&
      isAutosave(revision);
    const previous = groups.at(-1);
    if (foldable && previous?.kind === 'autosaves' && !startsGroup && isSameLine(previous, revision)) {
      groups[groups.length - 1] = { kind: 'autosaves', revisions: [...previous.revisions, revision] };
    } else if (foldable) {
      groups.push({ kind: 'autosaves', revisions: [revision] });
    } else {
      groups.push({ kind: 'revision', revision });
    }
  }
  return groups.map((group) =>
    group.kind === 'autosaves' && group.revisions.length === 1
      ? { kind: 'revision', revision: group.revisions[0]! }
      : group,
  );
};

/**
 * The entry that reads Current: the newest one at or below the head that is
 * not Tau's own setup (A4). Tau's housekeeping on top of an entry never takes
 * the most prominent mark in the list; the files do include it.
 *
 * @param revisions - The line's history, newest first.
 * @param headRevisionId - The revision the checkout reflects.
 * @returns The id that reads Current.
 */
export const currentRevisionOf = (
  revisions: readonly RevisionCard[],
  headRevisionId: string | undefined,
): string | undefined => {
  const byId = new Map(revisions.map((revision) => [revision.revisionId, revision] as const));
  let current = headRevisionId === undefined ? undefined : byId.get(headRevisionId);
  while (current !== undefined && isSetupCard(current) && current.parent !== undefined) {
    const parent = byId.get(current.parent);
    if (parent === undefined) {
      return headRevisionId;
    }
    current = parent;
  }
  return current?.revisionId ?? headRevisionId;
};

/** History shows this many rows (revisions and folds) before Show older (round 4). */
const rowLimit = 12;

const firstOf = (group: HistoryGroup): RevisionCard =>
  group.kind === 'revision' ? group.revision : group.revisions[0]!;
const keyOf = (group: HistoryGroup): string =>
  group.kind === 'revision'
    ? group.revision.revisionId
    : `${group.kind === 'setup' ? 'setup' : 'fold'}-${group.revisions[0]!.revisionId}`;
const holds = (group: HistoryGroup, revisionId: string | undefined): boolean =>
  revisionId !== undefined &&
  (group.kind === 'revision'
    ? group.revision.revisionId === revisionId
    : group.revisions.some((revision) => revision.revisionId === revisionId));

const startOfDay = (time: number): number => {
  const day = new Date(time);
  return new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime();
};

/** The day a revision was recorded, as a day divider reads it. */
const dayOf = (revision: RevisionCard): string => {
  if (revision.createdAt <= 0) {
    return 'Earlier';
  }
  const days = Math.round((startOfDay(Date.now()) - startOfDay(revision.createdAt)) / 86_400_000);
  return days === 0
    ? 'Today'
    : days === 1
      ? 'Yesterday'
      : new Date(revision.createdAt).toLocaleDateString(undefined, { dateStyle: 'medium' });
};

const clockOf = (revision: RevisionCard): string =>
  revision.createdAt > 0 ? new Date(revision.createdAt).toLocaleTimeString(undefined, { timeStyle: 'short' }) : '';

/**
 * A day divider: a row of the timeline, the line passing through its gutter and
 * the day in the content column.
 *
 * @param props - The day, and whether the line passes through.
 * @returns The divider.
 */
function DayDivider({
  label,
  hasLine,
  graphKey,
}: {
  readonly label: string;
  readonly hasLine: boolean;
  readonly graphKey?: string;
}): React.JSX.Element {
  /* On History's lanes the graph's rails pass through the divider, and it is measured as one of the graph's rows. */
  const isOnLanes = useContext(HistoryLanesContext);
  return (
    <li className={timelineRow} data-graph-key={isOnLanes ? graphKey : undefined}>
      <span
        aria-hidden
        className={cn(
          'relative flex justify-center',
          hasLine && !isOnLanes && 'before:absolute before:-top-0.5 before:bottom-0 before:w-px before:bg-border',
        )}
      />
      <span className='pt-1.5 pl-1 text-xs text-muted-foreground'>{label}</span>
    </li>
  );
}

/**
 * How far the backup has reached (D4, canvas `state-offline`): one dashed line
 * under the entries that are not backed up yet. Nothing above it is at risk on
 * this device; it is simply not backed up yet.
 *
 * @param props - The key it is measured by on History's lanes.
 * @returns The boundary row.
 */
function BackupBoundary({ graphKey }: { readonly graphKey?: string }): React.JSX.Element {
  /* On History's lanes the graph's rails pass through the boundary, and it is measured as one of the graph's rows. */
  const isOnLanes = useContext(HistoryLanesContext);
  return (
    <li data-row='boundary' className={timelineRow} data-graph-key={isOnLanes ? graphKey : undefined}>
      <span
        aria-hidden
        className={cn(
          'relative flex justify-center',
          !isOnLanes && 'before:absolute before:-top-0.5 before:bottom-0 before:w-px before:bg-border',
        )}
      />
      <span className='flex min-w-0 items-center gap-1.5 py-1 pr-2 pl-1 text-xs leading-5 text-muted-foreground'>
        <Cloud aria-hidden className='size-3.5 shrink-0' />
        Backed up to here
        <span aria-hidden className='h-px min-w-4 flex-1 border-t border-dashed' />
      </span>
    </li>
  );
}

/**
 * Roving keyboard navigation over the composite History list (L3 S27): rows,
 * autosave folds and Show older are one list; Right opens, Left closes.
 *
 * @param event - The key press inside the list.
 */
const onHistoryKeyDown = (event: KeyboardEvent<HTMLElement>): void => {
  const { target } = event;
  if (!(target instanceof HTMLButtonElement) || target.dataset['revisionRow'] === undefined) {
    return;
  }
  const rows = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button[data-revision-row]')];
  const index = rows.indexOf(target);
  const focus = (next: number): void => {
    rows[Math.min(rows.length - 1, Math.max(0, next))]?.focus();
    event.preventDefault();
  };
  switch (event.key) {
    case 'ArrowDown': {
      focus(index + 1);
      break;
    }
    case 'ArrowUp': {
      focus(index - 1);
      break;
    }
    case 'Home': {
      focus(0);
      break;
    }
    case 'End': {
      focus(rows.length - 1);
      break;
    }
    case 'ArrowRight': {
      if (target.getAttribute('aria-expanded') === 'false') {
        target.click();
      }
      event.preventDefault();
      break;
    }
    case 'ArrowLeft': {
      if (target.getAttribute('aria-expanded') === 'true') {
        target.click();
      }
      event.preventDefault();
      break;
    }
    default: {
      break;
    }
  }
};

/**
 * Tau's own setup changes as one compact line (A4, canvas "Tau's own setup
 * changes"): 24 px, muted text, a 6 px hollow marker, no fill and no Current.
 * The chevron opens the individual entries in place.
 *
 * @param props - The entries, where the line sits, and its disclosure.
 * @returns The line.
 */
function SetupLine({
  rowKey,
  revisions,
  isFirst,
  isLast,
  isOpen,
  onOpenChange,
  children,
}: {
  readonly rowKey: string;
  readonly revisions: readonly RevisionCard[];
  readonly isFirst: boolean;
  readonly isLast: boolean;
  readonly isOpen: boolean;
  readonly onOpenChange: (isOpen: boolean) => void;
  readonly children: React.ReactNode;
}): React.JSX.Element {
  const newest = revisions[0]!;
  const oldest = revisions.at(-1)!;
  const span = [...new Set([clockOf(oldest), clockOf(newest)].filter(Boolean))].join('–');
  const label = `Tau updated project setup${revisions.length > 1 ? ` · ${String(revisions.length)} changes` : ''}`;
  const isOnLanes = useContext(HistoryLanesContext);
  return (
    <Collapsible asChild open={isOpen} onOpenChange={onOpenChange}>
      <li className='flex flex-col'>
        <CollapsibleTrigger asChild>
          <button
            type='button'
            data-revision-row={rowKey}
            aria-label={`${label}${span === '' ? '' : ` · ${span}`}`}
            className={cn(timelineRowButton, timelineRowHover, 'h-6')}
          >
            {isOnLanes ? (
              <span aria-hidden />
            ) : (
              <span
                aria-hidden
                className={cn(
                  timelineGutter({ hasTop: !isFirst, hasBottom: !isLast || isOpen }),
                  'before:h-1.5 after:top-5',
                )}
              >
                <span className='relative mt-1 flex size-4 items-center justify-center'>
                  <span className='size-1.5 rounded-full border border-muted-foreground' />
                </span>
              </span>
            )}
            <span className={timelineRowContent}>
              <span className='min-w-0 flex-1 truncate text-xs leading-4 text-muted-foreground'>{label}</span>
              <span className='flex shrink-0 items-center gap-1.5 text-xs leading-4 text-muted-foreground'>
                <span className='hidden whitespace-nowrap tabular-nums @[22rem]:inline'>{span}</span>
                <ChevronDown
                  aria-hidden
                  className='size-3 transition-transform group-data-[state=open]/row:rotate-180 motion-reduce:transition-none'
                />
              </span>
            </span>
          </button>
        </CollapsibleTrigger>
        {/* The entries mount only while the line is open: each one's files are a query of its own (C52). */}
        <CollapsibleContent className={disclosureMotion}>
          <ol className={cn(timelineList, 'pt-0.5')}>{children}</ol>
        </CollapsibleContent>
      </li>
    </Collapsible>
  );
}

/** One display step of the list: a day, *Backed up to here*, a step of the lanes, or a row or fold. */
type HistoryStep =
  | Readonly<{ kind: 'day'; key: string; label: string }>
  | Readonly<{ kind: 'backup'; key: string }>
  | LaneStep
  | Readonly<{ kind: 'group'; group: HistoryGroup; isLast: boolean }>;

/** The list's frame on History's lanes: the gutter is as wide as the lanes in view. */
type TimelineFrameStyle = React.CSSProperties & Record<'--timeline-gutter', string>;

/**
 * The chips that go above one row or fold: its line's, the first time the line
 * shows, and each branch with no entries yet that starts from an entry it holds.
 *
 * @param group - The row or fold.
 * @param lanes - What History shows of the graph.
 * @param chipped - The branches already given a chip, which this adds to.
 * @returns The chip steps, in order.
 */
const chipStepsBefore = (group: HistoryGroup, lanes: HistoryLanes, chipped: Set<string>): HistoryStep[] => {
  const steps: HistoryStep[] = [];
  const owner = lanes.lineOf.get(firstOf(group).revisionId) ?? '';
  if (lanes.chips.has(owner) && !chipped.has(owner)) {
    chipped.add(owner);
    steps.push({ kind: 'chip', key: `chip:${owner}`, branch: owner });
  }
  /* A branch with no entries of its own: its chip and open end sit directly above the entry it starts from. */
  const members = group.kind === 'revision' ? [group.revision] : group.revisions;
  for (const member of members) {
    const empties = (lanes.emptyAt.get(member.revisionId) ?? []).filter((empty) => !chipped.has(empty));
    for (const empty of empties) {
      chipped.add(empty);
      steps.push({ kind: 'chip', key: `chip:${empty}`, branch: empty, startsFrom: member.revisionId });
    }
  }
  return steps;
};

/* Where a row's marker sits, from the row's top: the centre of its first line. */
const rowAnchor = 14;
const setupAnchor = 12;

/**
 * The marker one row carries on History's lanes.
 *
 * @param revision - The entry.
 * @param currentRevisionId - The entry that reads Current.
 * @returns Its marker.
 */
const markerOf = (revision: RevisionCard, currentRevisionId: string | undefined): MarkerKind => {
  if (revision.conflicted) {
    return 'conflict';
  }
  if (revision.revisionId === currentRevisionId) {
    return 'current';
  }
  if (revision.start !== undefined || (revision.tags?.length ?? 0) > 0) {
    return 'version';
  }
  return isSetupCard(revision) ? 'setup' : 'entry';
};

/**
 * The graph's rows for the steps History shows, in the order it renders them.
 *
 * @param input - The steps, which folds are open, the lines, Current and whether Show older follows.
 * @returns One graph row per rendered row, keyed as the row's element is.
 */
const graphRowsOf = ({
  steps,
  openFolds,
  lineOf,
  currentRevisionId,
  hasOlderRow,
}: Readonly<{
  steps: readonly HistoryStep[];
  openFolds: ReadonlySet<string>;
  lineOf: ReadonlyMap<string, string>;
  currentRevisionId: string | undefined;
  hasOlderRow: boolean;
}>): GraphRow[] => {
  const rows: GraphRow[] = [];
  const entryRow = (revision: RevisionCard): GraphRow => {
    const marker = markerOf(revision, currentRevisionId);
    const isCompact = marker === 'setup';
    const node: GraphNode = {
      branch: lineOf.get(revision.revisionId) ?? '',
      marker,
      ids: [revision.revisionId],
      parent: revision.parent,
      otherParents: revision.otherParents,
    };
    return { key: revision.revisionId, node, anchor: isCompact ? setupAnchor : rowAnchor, height: isCompact ? 24 : 30 };
  };
  for (const step of steps) {
    if (step.kind === 'day' || step.kind === 'backup') {
      rows.push({ key: step.key, anchor: 12, height: step.kind === 'day' ? 26 : 28 });
      continue;
    }
    if (step.kind === 'chip' || step.kind === 'pending' || step.kind === 'working') {
      rows.push(laneGraphRowOf(step));
      continue;
    }
    const { group } = step;
    if (group.kind === 'revision') {
      rows.push(entryRow(group.revision));
      continue;
    }
    const key = keyOf(group);
    const isOpen = openFolds.has(key);
    const newest = group.revisions[0]!;
    const oldest = group.revisions.at(-1)!;
    const isSetup = group.kind === 'setup';
    /* An open fold keeps its header and lists its entries; the header then stands for none of them. */
    rows.push({
      key,
      anchor: isSetup ? setupAnchor : rowAnchor,
      height: isSetup ? 26 : 30,
      node: {
        branch: lineOf.get(newest.revisionId) ?? '',
        marker: isSetup ? 'setup' : 'fold',
        ids: isOpen ? [] : group.revisions.map((revision) => revision.revisionId),
        parent: isOpen ? newest.revisionId : oldest.parent,
      },
    });
    if (isOpen) {
      rows.push(...group.revisions.map(entryRow));
    }
  }
  if (hasOlderRow) {
    rows.push({ key: 'older', role: 'older', anchor: rowAnchor, height: 30 });
  }
  return rows;
};

/**
 * An autosave fold's gutter: its dashed segments and marker, or nothing on
 * History's lanes, where the graph draws them.
 *
 * @param props - Which segments to draw.
 * @returns The gutter.
 */
function FoldGutter({
  hasTop,
  hasBottom,
}: {
  readonly hasTop: boolean;
  readonly hasBottom: boolean;
}): React.JSX.Element {
  if (useContext(HistoryLanesContext)) {
    return <span aria-hidden />;
  }
  return (
    <span aria-hidden className={timelineGutter({ hasTop, hasBottom, isDashed: true })}>
      <span className={timelineMarker}>
        <span className='size-2.5 rounded-full border border-dashed border-muted-foreground' />
      </span>
    </span>
  );
}

/**
 * Show older's row: the rest of the line, dashed, in its gutter; on History's
 * lanes the graph fades each rail into it instead.
 *
 * @param props - The button.
 * @returns The row.
 */
function OlderRow({ children }: { readonly children: React.ReactNode }): React.JSX.Element {
  const isOnLanes = useContext(HistoryLanesContext);
  return (
    <li className={timelineRow} data-graph-key={isOnLanes ? 'older' : undefined}>
      <span aria-hidden className={isOnLanes ? undefined : timelineMoreGutter} />
      <span className='py-0.5'>{children}</span>
    </li>
  );
}

/**
 * The branch a row's line belongs to when that branch was merged into another
 * in view and so has no chip: the row names it (D2).
 *
 * @param lanes - What History shows of the graph, when it draws lanes.
 * @param revisionId - The row's entry.
 * @returns The branch's name and slot, or nothing.
 */
const mergedBranchOf = (
  lanes: HistoryLanes | undefined,
  revisionId: string,
): Readonly<{ name: string; slot: BranchSlot | undefined }> | undefined => {
  const owner = lanes?.lineOf.get(revisionId);
  return owner === undefined || lanes?.merged.has(owner) !== true
    ? undefined
    : { name: owner, slot: lanes.slots.get(owner) };
};

/**
 * Where History's rows come from: the selected branch's log, or with a second
 * branch every branch's graph when a fork is in view (D2), and the filter.
 *
 * @param view - The selected branch's history.
 * @param branch - The branch the files are on.
 * @returns The rows, how to read older ones, the lanes when drawn, and the filter.
 */
const useHistorySource = (
  view: Pick<RevisionsView, 'revisions' | 'hasOlder' | 'loadOlder'>,
  branch: string | undefined,
  conflicts: RevisionStatusProjection['conflicts'] | undefined,
): Readonly<{
  filter: HistoryFilter;
  setFilter: (filter: HistoryFilter) => void;
  hasFilter: boolean;
  lanes: HistoryLanes | undefined;
  revisions: readonly RevisionCard[];
  hasOlder: boolean;
  loadOlder: () => Promise<void>;
}> => {
  const graph = useRevisionGraph();
  const [filter, setFilter] = useState<HistoryFilter>('this');
  const lanes = useMemo(
    () => (graph === undefined ? undefined : historyLanesOf({ ...graph, current: branch, filter, conflicts })),
    [branch, filter, graph, conflicts],
  );
  /* A conflict line is not a branch (D3), so it never makes the filter appear. */
  const conflictLines = conflictLinesOf(conflicts);
  const hasFilter = graph !== undefined && graph.branches.filter((entry) => !conflictLines.has(entry.name)).length > 1;
  const { loadOlder: loadOlderOnBranch } = view;
  const pageBoth = useCallback(async (): Promise<void> => {
    await Promise.all([loadOlderOnBranch(), graph?.hasOlder === true ? graph.loadOlder() : undefined]);
  }, [graph, loadOlderOnBranch]);
  if (graph === undefined) {
    return { filter, setFilter, hasFilter, lanes: undefined, ...view };
  }
  if (lanes?.hasLanes !== true) {
    /* One lane on this page so far: the branch's own list, but the graph keeps paging, so a fork further down still draws its lanes. */
    return {
      filter,
      setFilter,
      hasFilter,
      lanes: undefined,
      revisions: view.revisions,
      hasOlder: view.hasOlder || graph.hasOlder,
      loadOlder: pageBoth,
    };
  }
  return {
    filter,
    setFilter,
    hasFilter,
    lanes,
    revisions: lanes.revisions,
    hasOlder: graph.hasOlder,
    loadOlder: graph.loadOlder,
  };
};

/**
 * The list's frame. On History's lanes it widens the gutter to the lanes in
 * view, measures the rows and lays the graph over them (D2); otherwise it is a
 * plain wrapper and the rows draw their own line.
 *
 * @param props - The lanes when drawn, the steps shown, the open folds, Current, and whether Show older follows.
 * @returns The frame around the list.
 */
function HistoryGraphFrame({
  lanes,
  steps,
  openFolds,
  currentRevisionId,
  hasOlderRow,
  children,
}: {
  readonly lanes: HistoryLanes | undefined;
  readonly steps: readonly HistoryStep[];
  readonly openFolds: ReadonlySet<string>;
  readonly currentRevisionId: string | undefined;
  readonly hasOlderRow: boolean;
  readonly children: React.ReactNode;
}): React.JSX.Element {
  const frameRef = useRef<HTMLDivElement>(null);
  /* ponytail: laid out every render; a few lanes over one page of rows is a handful of drafts. */
  const graphRows =
    lanes === undefined ? [] : graphRowsOf({ steps, openFolds, lineOf: lanes.lineOf, currentRevisionId, hasOlderRow });
  const layout = lanes === undefined ? undefined : layoutRevisionGraph(graphRows, lanes.lanePreference);
  const boxes = useRowBoxes(
    frameRef,
    graphRows.map((row) => row.key),
  );
  const geometry =
    layout !== undefined && boxes.length === graphRows.length && boxes.length > 0
      ? graphGeometry(layout, graphRows, boxes)
      : undefined;
  const frameStyle: TimelineFrameStyle | undefined =
    layout === undefined ? undefined : { '--timeline-gutter': `${String(gutterWidth(layout.lanes.length))}px` };
  const lastBox = boxes.at(-1);
  return (
    <div
      ref={frameRef}
      data-slot='history-graph-frame'
      data-lanes={layout?.lanes.join(',')}
      className='relative'
      style={frameStyle}
    >
      <HistoryLanesContext.Provider value={lanes !== undefined}>{children}</HistoryLanesContext.Provider>
      {lanes === undefined || geometry === undefined ? null : (
        <HistoryGraph geometry={geometry} slots={lanes.slots} height={(lastBox?.top ?? 0) + (lastBox?.height ?? 0)} />
      )}
    </div>
  );
}

/**
 * History's rows: twelve, then Show older, with the row you are on, the one
 * opened for you and any conflicted row never behind it; consecutive autosaves
 * fold; days divide. The list is one Tab stop (A1 item 14).
 *
 * The hook holds one page (B4): once the loaded rows are all shown, Show older
 * reads the next page. A row that must stay in view but sits below the page —
 * one opened for you from a chat — is read on its own and kept at the end of
 * the timeline, below Show older, until a page reaches it.
 *
 * With a second branch, *This branch / All branches* appears, and where a fork
 * is in view the list draws a lane per branch (D2): every branch's history in
 * one read, a name chip above each lane, and the graph over the gutter. With one
 * lane in view the list is exactly the one-branch list.
 *
 * @returns The list.
 */
function HistoryList(): React.JSX.Element {
  const { projectId } = useProject();
  const status = useRevisionStatus();
  const view = useRevisions();
  const { headRevisionId, line, isDirty } = view;
  const { restore, isBusy } = useRestoreToPoint();
  const revealed = useRevisionReveal(projectId);
  const branch = line.kind === 'unknown' ? undefined : line.name;
  const {
    filter,
    setFilter,
    hasFilter,
    lanes: onLanes,
    revisions,
    hasOlder,
    loadOlder,
  } = useHistorySource(view, branch, status?.conflicts);
  const agentWork = useAgentWorkHere(status);
  const lineOf = onLanes?.lineOf;
  /* D4: the newest entry any branch's remote head names; the entries above it are the ones not backed up. */
  const backedUpTo = useMemo(() => {
    const remoteHeads = new Set((status?.branches ?? []).flatMap((facet) => facet.remoteHead ?? []));
    return revisions.find((revision) => remoteHeads.has(revision.revisionId))?.revisionId;
  }, [revisions, status?.branches]);
  const groups = useMemo(
    () => groupRevisionHistory(revisions, headRevisionId, { backedUpTo, lineOf }),
    [revisions, headRevisionId, backedUpTo, lineOf],
  );
  const currentRevisionId = useMemo(() => currentRevisionOf(revisions, headRevisionId), [revisions, headRevisionId]);
  const nextVersion = useMemo(() => nextVersionNumber(revisions), [revisions]);
  const [openRows, setOpenRows] = useState<ReadonlySet<string>>(() => new Set());
  const [openFolds, setOpenFolds] = useState<ReadonlySet<string>>(() => new Set());
  const [isAllShown, setIsAllShown] = useState(false);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  /* *View revision* reaches its row wherever it is: behind Show older, inside a fold, below the loaded page, and opened (DESIGN: a reveal expands to its target). */
  if (revealed !== undefined) {
    const holder = groups.find((group) => holds(group, revealed));
    if (holder !== undefined && holder.kind !== 'revision' && !openFolds.has(keyOf(holder))) {
      setOpenFolds((current) => new Set(current).add(keyOf(holder)));
    }
    if (!openRows.has(revealed)) {
      setOpenRows((current) => new Set(current).add(revealed));
    }
  }
  /* B4: what must stay in view but the page does not hold — the head, a row opened for you, a conflict on this
     line — read on its own and kept only if this line's head holds it; and the revisions restore rows name.
     ponytail: on History's lanes only the graph's own page is drawn; a row below it waits for Show older. */
  const loaded = useMemo(() => new Set(revisions.map((revision) => revision.revisionId)), [revisions]);
  const unloaded = (ids: ReadonlyArray<string | undefined>): string[] =>
    onLanes === undefined ? [...new Set(ids.filter((id): id is string => id !== undefined && !loaded.has(id)))] : [];
  const older = useRevisionsOnLine(
    unloaded([
      headRevisionId,
      ...openRows,
      ...(status?.conflicts ?? [])
        .filter((conflict) => conflict.branch === branch)
        .map((conflict) => conflict.revisionId),
    ]),
  ).toSorted((left, right) => right.createdAt - left.createdAt);
  const named = useWithRestoreTargets(revisions);
  /* A revealed row stays in `openRows` once its reveal is consumed, so it stays in view too. */
  const pinned = groups.findLastIndex(
    (group) =>
      holds(group, headRevisionId) ||
      holds(group, revealed) ||
      [...openRows].some((id) => holds(group, id)) ||
      (group.kind === 'revision' && group.revision.conflicted),
  );
  const shown = isAllShown ? groups : groups.slice(0, Math.max(rowLimit, pinned + 1));
  const hidden = groups.slice(shown.length);
  const [active, setActive] = useState<string | undefined>(headRevisionId);
  /* Show older unmounts under focus, so the first row it reveals takes focus. */
  const revealFocus = useRef<string>(undefined);
  /* A page read by Show older lands a render later: the first row after the last one shown takes focus then. */
  const focusAfter = useRef<string>(undefined);
  const listRef = useRef<HTMLDivElement>(null);
  // ponytail: tab stops set on the DOM after each render, so rows, folds and Show older need no tabIndex plumbing.
  useLayoutEffect(() => {
    const rows = [...(listRef.current?.querySelectorAll<HTMLElement>('[data-revision-row]') ?? [])];
    const stop = rows.find((row) => row.dataset['revisionRow'] === active) ?? rows[0];
    for (const row of rows) {
      row.tabIndex = row === stop ? 0 : -1;
    }
    if (revealFocus.current !== undefined) {
      rows.find((row) => row.dataset['revisionRow'] === revealFocus.current)?.focus();
      revealFocus.current = undefined;
    }
    const firstNew = groups[groups.findIndex((group) => keyOf(group) === focusAfter.current) + 1];
    if (focusAfter.current !== undefined && firstNew !== undefined) {
      focusAfter.current = undefined;
      rows.find((row) => row.dataset['revisionRow'] === keyOf(firstNew))?.focus();
    }
  });
  const showOlder = async (): Promise<void> => {
    const last = groups.at(-1);
    focusAfter.current = last === undefined ? undefined : keyOf(last);
    setIsLoadingOlder(true);
    try {
      await loadOlder();
    } finally {
      setIsLoadingOlder(false);
    }
  };
  const toggle =
    (setter: typeof setOpenRows, key: string) =>
    (isOpen: boolean): void => {
      setter((current) => {
        const next = new Set(current);
        if (isOpen) {
          next.add(key);
        } else {
          next.delete(key);
        }
        return next;
      });
    };

  const renderGroup = (group: HistoryGroup, isFirst: boolean, isLast: boolean): React.JSX.Element => {
    if (group.kind === 'setup') {
      const key = keyOf(group);
      const isFoldOpen = openFolds.has(key);
      return (
        <SetupLine
          key={key}
          rowKey={key}
          revisions={group.revisions}
          isFirst={isFirst}
          isLast={isLast}
          isOpen={isFoldOpen}
          onOpenChange={toggle(setOpenFolds, key)}
        >
          {group.revisions.map((revision, index) =>
            renderGroup({ kind: 'revision', revision }, false, isLast && index === group.revisions.length - 1),
          )}
        </SetupLine>
      );
    }
    if (group.kind === 'autosaves') {
      const newest = group.revisions[0]!;
      const oldest = group.revisions.at(-1)!;
      const key = keyOf(group);
      const isFoldOpen = openFolds.has(key);
      const span = [clockOf(oldest), clockOf(newest)].filter(Boolean).join('–');
      return (
        <Collapsible key={key} asChild open={isFoldOpen} onOpenChange={toggle(setOpenFolds, key)}>
          <li className='flex flex-col'>
            <CollapsibleTrigger asChild>
              <button
                type='button'
                data-revision-row={key}
                aria-label={`${String(group.revisions.length)} autosaves${span === '' ? '' : ` · ${span}`}`}
                className={cn(timelineRowButton, timelineRowHover)}
              >
                <FoldGutter hasTop={!isFirst} hasBottom={!isLast || isFoldOpen} />
                <span className={timelineRowContent}>
                  <span className='min-w-0 flex-1 text-sm text-muted-foreground'>
                    {group.revisions.length} autosaves
                  </span>
                  <span className='flex shrink-0 items-center gap-1.5 pt-0.5 text-xs text-muted-foreground'>
                    <span className='hidden whitespace-nowrap tabular-nums @[22rem]:inline'>{span}</span>
                    <ChevronDown
                      aria-hidden
                      className='size-3 transition-transform group-data-[state=open]/row:rotate-180 motion-reduce:transition-none'
                    />
                  </span>
                </span>
              </button>
            </CollapsibleTrigger>
            {/* Rows inside a fold mount only while it is open: each one's files are a query of its own (C52). */}
            <CollapsibleContent className={disclosureMotion}>
              <ol className={cn(timelineList, 'pt-0.5')}>
                {group.revisions.map((revision, index) =>
                  renderGroup({ kind: 'revision', revision }, false, isLast && index === group.revisions.length - 1),
                )}
              </ol>
            </CollapsibleContent>
          </li>
        </Collapsible>
      );
    }
    const { revision } = group;
    const mergedBranch = mergedBranchOf(onLanes, revision.revisionId);
    return (
      <RevisionRow
        key={revision.revisionId}
        revision={revision}
        title={revisionTitle(revision, named)}
        isCurrent={revision.revisionId === currentRevisionId}
        isAtFiles={revision.revisionId === headRevisionId && !isDirty}
        branch={branch}
        nextVersion={nextVersion}
        isOpen={openRows.has(revision.revisionId)}
        isBusy={isBusy}
        isFirst={isFirst}
        isLast={isLast}
        onOpenChange={toggle(setOpenRows, revision.revisionId)}
        onRestore={restore}
        {...(mergedBranch === undefined ? {} : { mergedBranch })}
      />
    );
  };

  /* Days, chips and rows in the order they render; the graph's rows follow the same order. */
  const steps: HistoryStep[] = [];
  const chipped = new Set<string>();
  if (onLanes !== undefined) {
    steps.push(...pendingStepsOf({ lanes: onLanes, branch, agentChat: agentWork }, chipped));
  }
  for (const [index, group] of shown.entries()) {
    const day = dayOf(firstOf(group));
    const previous = shown[index - 1];
    if (previous === undefined || dayOf(firstOf(previous)) !== day) {
      steps.push({ kind: 'day', key: `day-${day}`, label: day });
    }
    if (index > 0 && holds(group, backedUpTo)) {
      steps.push({ kind: 'backup', key: 'backup-boundary' });
    }
    if (onLanes !== undefined) {
      steps.push(...chipStepsBefore(group, onLanes, chipped));
    }
    steps.push({
      kind: 'group',
      group,
      isLast: index === shown.length - 1 && hidden.length === 0 && !hasOlder && older.length === 0,
    });
  }
  const firstHidden = hidden[0];
  const canShowOlder = firstHidden === undefined && hasOlder;

  const items: React.JSX.Element[] = [];
  for (const step of steps) {
    switch (step.kind) {
      case 'day': {
        items.push(<DayDivider key={step.key} label={step.label} hasLine={items.length > 0} graphKey={step.key} />);
        break;
      }
      case 'backup': {
        items.push(<BackupBoundary key={step.key} graphKey={step.key} />);
        break;
      }
      case 'chip':
      case 'pending':
      case 'working': {
        items.push(<LaneStepRow key={step.key} step={step} lanes={onLanes} currentBranch={branch} />);
        break;
      }
      case 'group': {
        items.push(renderGroup(step.group, step.group === shown[0], step.isLast));
        break;
      }
    }
  }
  /* Below Show older: kept rows older than the page, each under its own day. */
  const kept: React.JSX.Element[] = [];
  for (const [index, revision] of older.entries()) {
    const day = dayOf(revision);
    if (index === 0 || dayOf(older[index - 1]!) !== day) {
      kept.push(<DayDivider key={`kept-day-${revision.revisionId}`} label={day} hasLine />);
    }
    kept.push(renderGroup({ kind: 'revision', revision }, false, index === older.length - 1));
  }
  return (
    <div
      ref={listRef}
      className='@container flex flex-col gap-1'
      onKeyDown={onHistoryKeyDown}
      onFocus={(event) => {
        const key = event.target instanceof HTMLElement ? event.target.dataset['revisionRow'] : undefined;
        if (key !== undefined && key !== active) {
          setActive(key);
        }
      }}
    >
      {hasFilter ? (
        <ToggleGroup
          type='single'
          variant='outline'
          size='xs'
          aria-label='Which branches to show'
          value={filter}
          className='mx-3 mb-1'
          onValueChange={(value) => {
            if (value === 'this' || value === 'all') {
              setFilter(value);
            }
          }}
        >
          <ToggleGroupItem value='this'>This branch</ToggleGroupItem>
          <ToggleGroupItem value='all'>All branches</ToggleGroupItem>
        </ToggleGroup>
      ) : null}
      <HistoryGraphFrame
        lanes={onLanes}
        steps={steps}
        openFolds={openFolds}
        currentRevisionId={currentRevisionId}
        hasOlderRow={firstHidden !== undefined || canShowOlder}
      >
        <ol aria-label='History entries' className={timelineList}>
          {items}
          {firstHidden === undefined ? null : (
            <OlderRow>
              <Button
                variant='ghost'
                size='xs'
                data-revision-row='more'
                className='-ml-1 text-muted-foreground'
                onClick={() => {
                  revealFocus.current = keyOf(firstHidden);
                  setActive(keyOf(firstHidden));
                  setIsAllShown(true);
                }}
              >
                <ChevronDown aria-hidden className='size-3' />
                Show older
              </Button>
            </OlderRow>
          )}
          {canShowOlder ? (
            <OlderRow>
              <Button
                variant='ghost'
                size='xs'
                data-revision-row='more'
                className='-ml-1 text-muted-foreground'
                disabled={isLoadingOlder}
                aria-busy={isLoadingOlder}
                onClick={() => {
                  void showOlder();
                }}
              >
                {isLoadingOlder ? (
                  <Spinner aria-hidden className='size-3' />
                ) : (
                  <ChevronDown aria-hidden className='size-3' />
                )}
                Show older
              </Button>
            </OlderRow>
          ) : null}
          {kept}
        </ol>
      </HistoryGraphFrame>
    </div>
  );
}

/**
 * Loading is not empty (DESIGN, I6, S20): History's own card, empty and busy, under the strip's one *Loading
 * history…* sentence, never *No history yet*. Nothing stands for rows that have not arrived (loading states UX
 * blueprint, U17); the card's header says "Loading history" once the wait passes 1,000 ms.
 *
 * @returns The empty, busy card body.
 */
function HistoryLoading(): React.JSX.Element {
  return <div data-slot='history-loading' aria-busy='true' />;
}

/**
 * The marker text the worker materialized, by revision and path.
 *
 * *Open* is a request, not a render: `resolution.machine` reads the three terms
 * out of the graph and renders the markers where the trees are, then says so
 * once. No checkout and no machine context ever holds those bytes (A22, I29),
 * so the one place they can live is here, for as long as the pane is open.
 *
 * @returns A lookup keyed `<revisionId>\u0000<path>`.
 */
function useConflictTexts(): Readonly<Record<string, ConflictMaterialization>> {
  const client = useRevisionClient();
  const [texts, setTexts] = useState<Readonly<Record<string, ConflictMaterialization>>>({});

  useEffect(() => {
    if (client === undefined) {
      return undefined;
    }
    return client.subscribeToasts((entry) => {
      /* Both answers are settled facts about one path, so both land here and
       * the row reads whichever arrived — no timer decides (C44). */
      if (entry.type === 'conflictTextFailed') {
        setTexts((current) => ({
          ...current,
          [`${entry.revisionId}\u0000${entry.path}`]: { failure: entry.reason },
        }));
        return;
      }
      if (entry.type !== 'conflictText') {
        return;
      }
      setTexts((current) => ({
        ...current,
        [`${entry.revisionId}\u0000${entry.path}`]: { text: entry.text, ours: entry.ours, theirs: entry.theirs },
      }));
    });
  }, [client]);

  return texts;
}

/**
 * What a turn or a save left for the person, above the regions: a turn that
 * saved nothing, a turn that conflicted, and changes that could not be saved.
 *
 * @returns The alerts, or nothing.
 */
function RevisionAlerts(): React.JSX.Element | undefined {
  const { projectId } = useProject();
  const status = useRevisionStatus();
  const outcomes = useTurnOutcomes(projectId);
  /* `attention` counts conflicts too, and a conflicted merge saved everything it was asked to (review R5). */
  const unsaved = status === undefined ? 0 : status.attention - status.conflicts.length;
  if (outcomes.length === 0 && unsaved <= 0) {
    return undefined;
  }
  return (
    <div className='flex flex-col gap-2 px-1'>
      {outcomes.length === 0 && unsaved > 0 ? (
        <p role='alert' aria-label='Unsaved changes' className='flex items-start gap-2 text-xs'>
          <CircleAlert aria-hidden className='mt-px size-3.5 shrink-0 text-feature' />
          <span>
            {unsaved === 1
              ? 'One change could not be saved. Try again from the file that failed.'
              : `${String(unsaved)} changes could not be saved.`}
          </span>
        </p>
      ) : null}
      {outcomes.map((outcome) => (
        <div
          key={outcome.turnId}
          role='alert'
          aria-label='Turn outcome'
          className='flex flex-wrap items-start gap-2 text-xs'
        >
          <CircleAlert
            aria-hidden
            className={cn('mt-px size-3.5 shrink-0', outcome.kind === 'conflicted' ? 'text-warning' : 'text-feature')}
          />
          <span className='min-w-0 flex-1'>
            {outcome.kind === 'conflicted'
              ? `${needsDecision}: both branches changed the same files.`
              : `Nothing was saved for that request. ${describeRevisionFailure('turn', outcome.code).description}`}
          </span>
          <Button
            size='xs'
            variant='outline'
            className='ml-auto'
            onClick={() => {
              clearTurnOutcome(projectId, outcome.turnId);
            }}
          >
            Dismiss
          </Button>
        </div>
      ))}
    </div>
  );
}

/**
 * The Revisions pane's body, shared by the Workbench and the mobile panel
 * (S26, A29): the pinned strip, then each region only when it has something to
 * say — *Choose a version* while a conflict waits, *History* always, with a
 * lane per branch where a fork is in view and each branch's verbs on its chip
 * (D3), *Sync* once a remote exists or the person opens it.
 *
 * Everything here reads `useRevisions()` for the graph and
 * `useRevisionStatus()` for the projection and sends the machine's own verbs
 * back; no surface derives a revision number, a *Current* or a dirty flag of its
 * own (I3).
 *
 * @returns The pane body.
 */
export function RevisionsPanelBody(): React.JSX.Element {
  const { projectId, projectRef } = useProject();
  const project = useSelector(projectRef, (snapshot) => snapshot.context.project);
  const { updateProject } = useProjectManager();
  const { revisions, line, isLoading } = useRevisions();
  const status = useRevisionStatus();
  const commands = useRevisionCommands();
  const projectRole = useProjectRole();
  const isSignedOut = useRevisionSessionUser() === undefined;
  /* N4: the plan, read once here — the region itself stays presentational. */
  const { canSyncFiles, storageLimitBytes, canUpgradePlan, requestUpgrade } = useCommercialFeatures();
  const { signIn } = useAuthLinks();
  const conflicts = status?.conflicts ?? [];
  const conflictTexts = useConflictTexts();
  /* M2 (I6): an unlocated line is loading, never an empty History. */
  const isHistoryLoading = isLoading || line.kind === 'unknown';
  /* Remembered entries are content: the wait is shown only while History has none to show. */
  const isHistoryWaiting = isHistoryLoading && revisions.length === 0;
  const historyWaitStart = useWaitStart();

  return (
    <div data-slot='revisions-panel-body' className='@container flex size-full min-h-0 flex-col bg-sidebar'>
      <WhereYouAre />
      {/* A stable, thin scrollbar gutter, so a row that opens never shifts the pane sideways; the cards sit 8 px
          from both sides (round 11). No `min-h-0` on the regions: this column owns the scroll (C36). */}
      <div
        role='group'
        aria-label='History and branches'
        // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- a scrollable column must be keyboard reachable (WCAG 2.1.1), even when it holds no control, as while History loads on a half-height phone sheet
        tabIndex={0}
        className='flex min-h-0 flex-1 [scrollbar-width:thin] [scrollbar-gutter:stable] flex-col gap-2 overflow-y-auto py-2 pl-2 outline-none *:w-[min(100%,calc(100cqw-1rem))] focus-visible:focus-outline'
      >
        <RevisionAlerts />

        {/* A sync divergence records its conflict on the same line, so a
            one-branch project still has somewhere to decide (C35). */}
        {conflicts.length === 0 ? null : (
          <RevisionRegion id='revision-conflicts-heading' title='Choose a version'>
            <div className='flex flex-col gap-3 px-1'>
              {conflicts.map((conflict) => (
                <ConflictDecision
                  key={conflict.revisionId}
                  conflict={conflict}
                  conflictTexts={conflictTexts}
                  onKeepSide={commands.resolveFile}
                  onOpenConflict={commands.openConflictInEditor}
                  onAskChat={commands.askChatToResolve}
                  onFinishResolution={commands.finishResolution}
                  onResolveInEditor={commands.resolveFileInEditor}
                />
              ))}
            </div>
          </RevisionRegion>
        )}

        {/* The pane's host (the Workbench tab, the phone surface) is already the History landmark, so this card is a
            group of that name (#1878 renamed the pane to History). */}
        <RevisionRegion
          id='revision-history-heading'
          title='History'
          isLandmark={false}
          /* The header's trailing slot is always rendered, so the indicator never changes the header's height. Not live:
             the strip's status line is the pane's one announcement and already says *Loading history…*. */
          action={
            <WaitIndicator
              active={isHistoryWaiting}
              label='Loading history'
              slowLabel='Still loading history'
              startedAt={historyWaitStart}
              live={false}
            />
          }
        >
          {isHistoryWaiting ? (
            <HistoryLoading />
          ) : revisions.length === 0 ? (
            <PanelEmptyState
              icon={History}
              title='No history yet'
              description='Tau saves each change you or the agent make.'
              className='[container-type:inline-size] m-0 h-auto min-h-40 w-full'
            />
          ) : (
            <HistoryList />
          )}
        </RevisionRegion>
      </div>

      {/* The pane's last line: where the backup is, and for a project on this device only, Back up (C2, C4). */}
      {status === undefined ? null : (
        <RevisionSyncRegion
          remote={status.remote}
          sync={status.sync}
          onConnect={commands.connectRemote}
          onDisconnect={commands.disconnectRemote}
          onCancel={commands.cancelRemote}
          onSync={commands.syncNow}
          onPushGithub={commands.pushGithub}
          syncChats={project?.syncChats !== false}
          onSyncChatsChange={(enabled) => {
            // oxlint-disable-next-line promise/prefer-await-to-then, tau-lint/no-async-iife -- a refused manifest write is named, not left loose
            void updateProject(projectId, { syncChats: enabled }).catch(reportSyncSettingError);
          }}
          canSyncFiles={canSyncFiles}
          onUpgrade={canUpgradePlan ? requestUpgrade : undefined}
          storageLimitBytes={storageLimitBytes}
          signInHref={signIn}
          role={projectRole}
          isSignedOut={isSignedOut}
          projectId={projectId}
          isLineKnown={line.kind !== 'unknown'}
          /* Sync pushes every branch; an unborn one is not on GitHub yet (D92). */
          branch={line.kind === 'branch' ? line.name : undefined}
        />
      )}
    </div>
  );
}
