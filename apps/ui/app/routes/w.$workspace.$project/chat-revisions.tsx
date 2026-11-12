import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { KeyboardEvent } from 'react';
import { ChevronDown, CircleAlert, CircleDashed, Cloud, GitBranch, History, Plus, Undo2, XIcon } from 'lucide-react';
import { Link, useLocation } from 'react-router';
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
import { Skeleton } from '@taucad/ui/components/skeleton';
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
import { ConflictDecision, RevisionBranches } from '#routes/w.$workspace.$project/revision-branches.js';
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
import { useRevisions, useRevisionsOnLine, useWithRestoreTargets } from '#hooks/use-revisions.js';
import type { RevisionCard } from '#hooks/use-revisions.js';
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
import { useOptionalChatWorkspaceAuthority } from '#providers/chat-workspace-authority-provider.js';
import { projectChatIdFromSearch } from '#utils/project-url.utils.js';
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
 * @returns True while such a turn runs.
 */
const useAgentWorkingHere = (status: RevisionStatusProjection | undefined): boolean => {
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
    return false;
  }
  return working
    .split('|')
    .some((chatId) => (chats.find((chat) => chat.id === chatId)?.checkoutId ?? liveCheckoutId) === checkoutId);
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
  const isAgentWorking = useAgentWorkingHere(status);
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
          <Skeleton aria-hidden className='h-6 w-24 rounded-full' />
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
  const conflictLines = new Set(
    (status?.conflicts ?? [])
      .filter((conflict) => conflict.branch !== undefined && conflict.branch !== conflict.into)
      .map((conflict) => conflict.branch),
  );
  const branches = (status?.branches ?? []).filter((entry) => !conflictLines.has(entry.name));
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
            return (
              <DropdownMenuRadioItem key={entry.name} value={entry.name} disabled={isBusy}>
                <span className='min-w-0 flex-1 truncate'>{entry.name}</span>
                {counts.length === 0 ? null : (
                  <span className='text-xs text-muted-foreground tabular-nums'>{counts.join(', ')}</span>
                )}
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

type HistoryGroup =
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
 * sits between groups and never inside a fold (D4).
 *
 * @param revisions - The line's history, newest first.
 * @param headRevisionId - The revision the checkout reflects, which never folds into autosaves.
 * @param backedUpTo - The newest entry the remote holds, which no newer entry folds with.
 * @returns The rows and folds History renders.
 */
export const groupRevisionHistory = (
  revisions: readonly RevisionCard[],
  headRevisionId: string | undefined,
  backedUpTo?: string,
): readonly HistoryGroup[] => {
  const groups: HistoryGroup[] = [];
  for (const revision of revisions) {
    const startsGroup = revision.revisionId === backedUpTo;
    if (isSetupCard(revision)) {
      const previous = groups.at(-1);
      if (previous?.kind === 'setup' && !startsGroup) {
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
    if (foldable && previous?.kind === 'autosaves' && !startsGroup) {
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
function DayDivider({ label, hasLine }: { readonly label: string; readonly hasLine: boolean }): React.JSX.Element {
  return (
    <li className={timelineRow}>
      <span
        aria-hidden
        className={cn(
          'relative flex justify-center',
          hasLine && 'before:absolute before:-top-0.5 before:bottom-0 before:w-px before:bg-border',
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
 * @returns The boundary row.
 */
function BackupBoundary(): React.JSX.Element {
  return (
    <li data-row='boundary' className={timelineRow}>
      <span
        aria-hidden
        className='relative flex justify-center before:absolute before:-top-0.5 before:bottom-0 before:w-px before:bg-border'
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
 * @returns The list.
 */
function HistoryList(): React.JSX.Element {
  const { projectId } = useProject();
  const status = useRevisionStatus();
  const { revisions, headRevisionId, line, isDirty, hasOlder, loadOlder } = useRevisions();
  const { restore, isBusy } = useRestoreToPoint();
  const revealed = useRevisionReveal(projectId);
  const branch = line.kind === 'unknown' ? undefined : line.name;
  /* D4: the newest entry any branch's remote head names; the entries above it are the ones not backed up. */
  const backedUpTo = useMemo(() => {
    const remoteHeads = new Set((status?.branches ?? []).flatMap((facet) => facet.remoteHead ?? []));
    return revisions.find((revision) => remoteHeads.has(revision.revisionId))?.revisionId;
  }, [revisions, status?.branches]);
  const groups = useMemo(
    () => groupRevisionHistory(revisions, headRevisionId, backedUpTo),
    [revisions, headRevisionId, backedUpTo],
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
     line — read on its own and kept only if this line's head holds it; and the revisions restore rows name. */
  const loaded = useMemo(() => new Set(revisions.map((revision) => revision.revisionId)), [revisions]);
  const unloaded = (ids: ReadonlyArray<string | undefined>): string[] => [
    ...new Set(ids.filter((id): id is string => id !== undefined && !loaded.has(id))),
  ];
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
                <span
                  aria-hidden
                  className={timelineGutter({ hasTop: !isFirst, hasBottom: !isLast || isFoldOpen, isDashed: true })}
                >
                  <span className={timelineMarker}>
                    <span className='size-2.5 rounded-full border border-dashed border-muted-foreground' />
                  </span>
                </span>
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
      />
    );
  };

  const items: React.JSX.Element[] = [];
  for (const [index, group] of shown.entries()) {
    const day = dayOf(firstOf(group));
    const previous = shown[index - 1];
    if (previous === undefined || dayOf(firstOf(previous)) !== day) {
      items.push(<DayDivider key={`day-${day}`} label={day} hasLine={index > 0} />);
    }
    if (index > 0 && holds(group, backedUpTo)) {
      items.push(<BackupBoundary key='backup-boundary' />);
    }
    items.push(
      renderGroup(
        group,
        index === 0,
        index === shown.length - 1 && hidden.length === 0 && !hasOlder && older.length === 0,
      ),
    );
  }
  const firstHidden = hidden[0];
  const canShowOlder = firstHidden === undefined && hasOlder;
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
      <ol aria-label='History entries' className={timelineList}>
        {items}
        {firstHidden === undefined ? null : (
          <li className={timelineRow}>
            <span aria-hidden className={timelineMoreGutter} />
            <span className='py-0.5'>
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
            </span>
          </li>
        )}
        {canShowOlder ? (
          <li className={timelineRow}>
            <span aria-hidden className={timelineMoreGutter} />
            <span className='py-0.5'>
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
            </span>
          </li>
        ) : null}
        {kept}
      </ol>
    </div>
  );
}

/**
 * Loading is not empty (DESIGN, I6, S20): skeleton rows under the strip's one
 * *Loading history…* sentence, never *No revisions yet*.
 *
 * @returns The loading geometry.
 */
function HistoryLoading(): React.JSX.Element {
  return (
    <div role='status' aria-label='Loading history' aria-busy='true' className='flex flex-col gap-2 px-2 py-1'>
      {[0, 1, 2].map((row) => (
        <div key={row} className='flex items-center gap-2'>
          <Skeleton aria-hidden className='size-2 rounded-full' />
          <Skeleton aria-hidden className='h-4 flex-1' />
          <Skeleton aria-hidden className='h-4 w-16' />
        </div>
      ))}
    </div>
  );
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
 * say — *Choose a version* while a conflict waits, *Branches* at two lines,
 * *History* always, *Sync* once a remote exists or the person opens it.
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
  const { revisions, line, branchFacts = new Map(), isLoading } = useRevisions();
  const status = useRevisionStatus();
  const commands = useRevisionCommands();
  const projectRole = useProjectRole();
  const isSignedOut = useRevisionSessionUser() === undefined;
  const { chats } = useChatRecords(projectId);
  /* N4: the plan, read once here — the region itself stays presentational. */
  const { canSyncFiles, storageLimitBytes, canUpgradePlan, requestUpgrade } = useCommercialFeatures();
  const { signIn } = useAuthLinks();
  const chatNames = useMemo(() => Object.fromEntries(chats.map((chat) => [chat.id, chat.name])), [chats]);
  const chatCheckoutIds = useMemo(() => Object.fromEntries(chats.map((chat) => [chat.id, chat.checkoutId])), [chats]);
  /* The chat the route has in focus: *Use in this chat* places it (C3). */
  const activeChatId = projectChatIdFromSearch(useLocation().search);
  const authority = useOptionalChatWorkspaceAuthority();
  const branches = status?.branches ?? [];
  const conflicts = status?.conflicts ?? [];
  const conflictTexts = useConflictTexts();
  const currentBranch = line.kind === 'unknown' ? undefined : line.name;
  const canWrite = projectRole !== 'read' && projectRole !== 'revoked';
  /* M2 (I6): an unlocated line is loading, never an empty History. */
  const isHistoryLoading = isLoading || line.kind === 'unknown';

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
                  currentBranch={currentBranch}
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

        {/* A29: one branch is not a choice, so the region does not exist yet. */}
        {branches.length > 1 ? (
          <RevisionRegion id='revision-branches-heading' title='Branches' bodyClassName='p-0'>
            <RevisionBranches
              branches={branches}
              currentBranch={currentBranch}
              liveCheckoutId={status?.liveCheckoutId}
              chatNames={chatNames}
              chatCheckoutIds={chatCheckoutIds}
              {...(activeChatId === undefined ? {} : { activeChatId })}
              {...(authority === undefined
                ? {}
                : {
                    onPlaceChat: (chatId: string, checkoutId: string) => {
                      void authority.placeChat(chatId, checkoutId);
                    },
                  })}
              branchFacts={branchFacts}
              conflicts={conflicts}
              /* A verb waiting on a person is still in flight (review R4). */
              isBusy={status?.branchVerb.busy ?? false}
              isWritable={canWrite}
              onSwitch={commands.switchTo}
              onMerge={commands.mergeBranch}
              onDiscard={commands.discardBranch}
              onRename={commands.renameBranch}
            />
          </RevisionRegion>
        ) : null}

        <RevisionRegion id='revision-history-heading' title='History'>
          {isHistoryLoading && revisions.length === 0 ? (
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
