import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import {
  ChevronDown,
  CircleAlert,
  EllipsisVertical,
  GitBranch,
  History,
  Plus,
  Undo2,
  XIcon,
  Cloud,
  CloudUpload,
} from 'lucide-react';
import { Link, useLocation, useParams } from 'react-router';
import { useSelector } from '@xstate/react';
import { Button } from '@taucad/ui/components/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@taucad/ui/components/collapsible';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSwitchItem,
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
import { PanelEmptyState } from '#components/ui/panel-empty-state.js';
import { Spinner } from '#components/ui/spinner.js';
import { ActionButton, DetailsToggle, disclosureMotion } from '#components/revisions/revision-actions.js';
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
import { RevisionRow } from '#routes/w.$workspace.$project/revision-marker.js';
import { ConflictDecision, RevisionBranches } from '#routes/w.$workspace.$project/revision-branches.js';
import type { ConflictMaterialization } from '#routes/w.$workspace.$project/revision-branches.js';
import { RevisionSyncRegion } from '#routes/w.$workspace.$project/revision-sync-region.js';
import {
  needsDecision,
  revisionName,
  revisionTitle,
  selectStripVerbs,
  useRevisionFacts,
} from '#routes/w.$workspace.$project/revision-vocabulary.js';
import type { StripVerb } from '#routes/w.$workspace.$project/revision-vocabulary.js';
import { useRevisions, useRevisionsOnLine, useWithRestoreTargets } from '#hooks/use-revisions.js';
import type { RevisionCard } from '#hooks/use-revisions.js';
import { useRestoreToPoint } from '#hooks/use-restore-to-point.js';
import {
  useProjectRole,
  useRevisionClient,
  useRevisionCommands,
  useRevisionStatus,
} from '#hooks/use-revision-status.js';
import { describeRevisionFailure } from '#lib/revision-failure-copy.js';
import { setAnonymousRevisions, useAnonymousRevisions } from '#lib/revision-actor.js';
import { clearTurnOutcome, useTurnOutcomes } from '#routes/w.$workspace.$project/revision-outcomes.js';
import { useRevisionReveal } from '#routes/w.$workspace.$project/revision-reveal.js';
import { useChatRecords } from '#hooks/use-chat-records.js';
import { useOptionalChatWorkspaceAuthority } from '#providers/chat-workspace-authority-provider.js';
import { projectChatIdFromSearch } from '#utils/project-url.utils.js';
import { useProject } from '#hooks/use-project.js';
import { useSaveRevisionRequest } from '#routes/w.$workspace.$project/revision-save-shortcut.js';
import { useAuthLinks } from '#hooks/use-auth-links.js';
import { useCommercialFeatures } from '#cloud/commercial-features.js';
import { useProjectManager } from '#hooks/use-project-manager.js';
import { isDesktopTarget } from '#lib/build-target.js';
import {
  backupByDefaultNotice,
  tauCloudIntent,
  turnOffBackupByDefault,
  turnOffBackupConsequence,
  useBackupAnnouncing,
  useTauCloudEligibility,
  useTauCloudIntent,
} from '#hooks/use-cloud-projects.js';
import type { TauCloudIntent } from '#hooks/use-cloud-projects.js';
import { toast } from '#components/ui/sonner.js';

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
  return (
    <FloatingPanel isOpen={isExpanded} side='right' onOpenChange={setIsExpanded}>
      <FloatingPanelContent>
        <FloatingPanelContentHeader>
          <FloatingPanelContentTitle>Revisions</FloatingPanelContentTitle>
          <FloatingPanelContentHeaderActions>
            <FloatingPanelClose
              icon={XIcon}
              tooltipContent={(isOpen) => (
                <div className='flex items-center gap-2'>{isOpen ? 'Close' : 'Open'} Revisions</div>
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

/**
 * Backup by default's lasting line (D19, NS8): what happens to a project born
 * with no remote, and its per-project opt-out with what the opt-out does. Before
 * the default connection it is the opt-out before anything leaves the device;
 * after, *Turn off backup* disconnects (the revisions stay) and nothing
 * reconnects it, because the intent is gone. One handler with the toast's.
 *
 * @param props - The project's intent.
 * @returns The line, or nothing when it does not apply.
 */
function BackupByDefaultLine({ intent }: { readonly intent: TauCloudIntent }): React.JSX.Element | undefined {
  const { projectId } = useProject();
  const status = useRevisionStatus();
  const client = useRevisionClient();
  const commands = useRevisionCommands();
  const notice = backupByDefaultNotice(intent, useTauCloudEligibility(), status?.remote);
  /* One offer at a time: while the creation toast carries it, this line waits (DESIGN). */
  const announcing = useBackupAnnouncing(projectId);
  if (notice === undefined || (notice === 'pending' && announcing)) {
    return undefined;
  }
  return (
    <div
      data-slot='backup-by-default'
      role='group'
      aria-label='Backup by default'
      className='flex min-w-0 items-start gap-1.5 text-xs text-muted-foreground'
    >
      <Cloud aria-hidden className='mt-px size-3.5 shrink-0' />
      <div className='min-w-0 flex-auto'>
        <p>Backs up to Tau Cloud automatically.</p>
        <p>{turnOffBackupConsequence(status?.remote)}</p>
      </div>
      <Button
        size='xs'
        variant='ghost'
        onClick={() => {
          /* The remote as it is now: a connection may have landed since this rendered. */
          turnOffBackupByDefault(projectId, client?.status()?.remote ?? status?.remote, commands);
        }}
      >
        Turn off backup
      </Button>
      {notice === 'on' ? (
        <Button
          size='icon-xs'
          variant='ghost'
          aria-label='Dismiss'
          onClick={() => {
            tauCloudIntent.set(projectId, undefined);
          }}
        >
          <XIcon aria-hidden />
        </Button>
      ) : undefined}
    </div>
  );
}

/**
 * The pinned strip (canvas rounds 4, 14, 17, 18): where you are, with New
 * branch and More pinned to that line, then the one status sentence — the
 * header's, word for word (RA11) — ending in its verbs and Details, which wrap
 * together. The identity line never repeats the sentence.
 *
 * @param props - Whether Sync's chooser is open, and how to open it.
 * @returns The strip.
 */
function OrientationStrip({
  isSyncOpen,
  onOpenSync,
}: {
  readonly isSyncOpen: boolean;
  readonly onOpenSync: () => void;
}): React.JSX.Element {
  const { workspace = '' } = useParams();
  const { line, revisions, branchFacts } = useRevisions();
  const { where, facts, head, status } = useRevisionFacts();
  const role = useProjectRole();
  const commands = useRevisionCommands();
  const { restore, undo, isBusy } = useRestoreToPoint();
  const saveRevision = useSaveRevisionRequest();
  const { requestUpgrade, canUpgradePlan } = useCommercialFeatures();
  const { signIn } = useAuthLinks();
  const isAnonymous = useAnonymousRevisions(workspace);
  const { projectId } = useProject();
  const cloudIntent = useTauCloudIntent(projectId);
  const isUnknown = line.kind === 'unknown';
  const canWrite = role !== 'read' && role !== 'revoked';
  /* No head, no branch point; and nothing is offered over a line nobody has located yet (HQ7). */
  const canBranch = head !== undefined && canWrite && !isUnknown;
  /* M1: the restore machine's own undo target, never a restore row this device did not mint. */
  const verbs = selectStripVerbs({
    status,
    where,
    undoable: status?.restore.undoable === true,
    canUndo: status?.restore.canUndo === true,
    canWrite,
    /* D17: the plan is the owner's, and only a plan with a larger one to buy. */
    canUpgrade: canUpgradePlan && role !== 'write',
  });
  /* A29: the chooser is already open below, so Back up would repeat it. */
  const primary = verbs.primary === 'Back up' && isSyncOpen ? undefined : verbs.primary;
  const headName = revisionName(head?.n);
  const tip = where.branch === undefined ? undefined : branchFacts?.get(where.branch)?.revisionNumber;
  const act = (verb: StripVerb): void => {
    switch (verb) {
      case 'Save revision': {
        void saveRevision();
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
      case 'Back up': {
        onOpenSync();
        break;
      }
      case 'Sync now': {
        commands.syncNow();
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
        icon={verb === 'Undo restore' || verb === 'Undo' ? Undo2 : verb === 'Back up' ? CloudUpload : undefined}
        variant={isPrimary && (verb === 'Save revision' || facts.mark === 'attention') ? 'default' : 'outline'}
        disabled={isBusy}
        onClick={() => {
          act(verb);
        }}
      />
    );

  const menuItems: React.JSX.Element[] = [];
  if (where.isDirty && head !== undefined && canWrite) {
    menuItems.push(
      <DropdownMenuItem
        key='discard'
        disabled={isBusy}
        onSelect={() => {
          /* A restore of the head, which saves the changes first, so even a discard can be undone (D1). */
          restore(head.revisionId);
        }}
      >
        <Undo2 aria-hidden />
        Discard changes
      </DropdownMenuItem>,
    );
  }
  /* One home per verb: Back up is here only while it is not the strip's button (round 16). */
  if (canWrite && head !== undefined && status?.remote.kind === 'none' && !isSyncOpen && primary !== 'Back up') {
    menuItems.push(
      <DropdownMenuItem key='backup' onSelect={onOpenSync}>
        <CloudUpload aria-hidden />
        Back up…
      </DropdownMenuItem>,
    );
  }
  if (canWrite && !isUnknown && workspace !== '') {
    menuItems.push(
      <DropdownMenuSwitchItem
        key='anonymous'
        isChecked={isAnonymous}
        onIsCheckedChange={(isChecked) => {
          setAnonymousRevisions(workspace, isChecked);
        }}
      >
        Anonymous revisions
      </DropdownMenuSwitchItem>,
    );
  }

  return (
    <section aria-label='Where you are' className='flex shrink-0 flex-col gap-1 border-b bg-sidebar px-3 py-1.5'>
      <div className='flex min-w-0 items-center gap-2'>
        <GitBranch aria-hidden className='size-3.5 shrink-0 text-muted-foreground' />
        <span className='flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2'>
          {isUnknown ? (
            <Skeleton aria-hidden className='h-4 w-20 self-center' />
          ) : (
            <>
              <span className='text-sm font-medium break-all'>{line.name}</span>
              {headName === undefined ? null : (
                <span className='font-mono text-sm text-muted-foreground'>{headName}</span>
              )}
            </>
          )}
        </span>
        {canBranch ? (
          <NamePopover
            trigger={
              <Button size='xs' variant='ghost' className='shrink-0 gap-1 text-muted-foreground'>
                <Plus aria-hidden className='size-3' />
                New branch
              </Button>
            }
            label='Name for the new branch'
            placeholder='enclosure-v2'
            note={`Starts from ${headName ?? 'this revision'}. ${where.branch ?? 'This branch'} stays as it is.`}
            saveLabel='Create branch'
            isBusy={(status?.branchVerb.busy ?? false) || (status?.branchVerb.asking ?? false)}
            align='end'
            onSave={(name) => {
              // oxlint-disable-next-line promise/prefer-await-to-then, tau-lint/no-async-iife -- the toast channel owns this refusal; only the loose rejection is ours
              void commands.createBranch(name).catch(() => undefined);
            }}
          />
        ) : null}
        {/* Details left this menu for the status line, so a person with nothing to change has no More (round 14). */}
        {menuItems.length === 0 ? null : (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size='icon-xs' variant='ghost' aria-label='More' className='shrink-0'>
                <EllipsisVertical aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align='end'>{menuItems}</DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      <Collapsible className='flex flex-col'>
        <div data-slot='strip-status-line' className='flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1'>
          <p
            role='status'
            aria-label='Revision status'
            aria-busy={facts.mark === 'running' || facts.sentence === 'Loading history…' ? true : undefined}
            className='flex flex-auto items-start gap-1.5 text-xs'
          >
            <facts.icon
              aria-hidden
              data-slot='status-glyph'
              className={cn('mt-px size-3.5 shrink-0', facts.tone === '' ? 'text-muted-foreground' : facts.tone)}
            />
            <span className='min-w-0'>{facts.sentence}</span>
          </p>
          <div data-slot='strip-actions' className='ml-auto flex flex-wrap items-center justify-end gap-2'>
            {verbs.secondary.map((verb) => renderVerb(verb, false))}
            {primary === undefined ? null : renderVerb(primary, true)}
            <DetailsToggle />
          </div>
        </div>
        <CollapsibleContent className={disclosureMotion}>
          <dl
            aria-label='Details of where you are'
            className='grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 pt-1 pr-1 pl-5 text-xs'
          >
            <dt className='text-muted-foreground'>Head</dt>
            <dd className='font-mono break-all'>{head?.revisionId ?? '—'}</dd>
            <dt className='text-muted-foreground'>Branch tip</dt>
            <dd>
              {where.branch === undefined ? '—' : `${where.branch} → ${revisionName(tip ?? revisions[0]?.n) ?? '—'}`}
            </dd>
            <dt className='text-muted-foreground'>This device</dt>
            <dd>{isDesktopTarget() ? 'Workbench (desktop app)' : 'Workbench (browser)'}</dd>
          </dl>
        </CollapsibleContent>
      </Collapsible>
      {cloudIntent === undefined ? null : <BackupByDefaultLine intent={cloudIntent} />}
    </section>
  );
}

type HistoryGroup =
  | Readonly<{ kind: 'revision'; revision: RevisionCard }>
  | Readonly<{ kind: 'autosaves'; revisions: readonly RevisionCard[] }>;

/**
 * Fold only consecutive, unnamed autosaves; meaningful revisions stay visible.
 *
 * @param revisions - The line's history, newest first.
 * @param headRevisionId - The revision the checkout reflects, which never folds.
 * @returns The rows and folds History renders.
 */
export const groupRevisionHistory = (
  revisions: readonly RevisionCard[],
  headRevisionId: string | undefined,
): readonly HistoryGroup[] => {
  const groups: HistoryGroup[] = [];
  for (const revision of revisions) {
    const foldable =
      revision.revisionId !== headRevisionId &&
      (revision.tags?.length ?? 0) === 0 &&
      revision.turnId === undefined &&
      !revision.conflicted &&
      (revision.trigger === 'idle' || revision.trigger === 'hidden' || revision.trigger === 'close');
    const previous = groups.at(-1);
    if (foldable && previous?.kind === 'autosaves') {
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

/** History shows this many rows (revisions and folds) before Show more (round 4). */
const rowLimit = 12;

const firstOf = (group: HistoryGroup): RevisionCard =>
  group.kind === 'revision' ? group.revision : group.revisions[0]!;
const keyOf = (group: HistoryGroup): string =>
  group.kind === 'revision' ? group.revision.revisionId : `fold-${group.revisions[0]!.revisionId}`;
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
 * Roving keyboard navigation over the composite History list (L3 S27): rows,
 * autosave folds and Show more are one list; Right opens, Left closes.
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
 * History's rows: twelve, then Show more, with the row you are on, the one
 * opened for you and any conflicted row never behind it; consecutive autosaves
 * fold; days divide. The list is one Tab stop (A1 item 14).
 *
 * The hook holds one page (B4): once the loaded rows are all shown, Show more
 * reads the next page. A row that must stay in view but sits below the page —
 * one opened for you from a chat — is read on its own and kept at the end of
 * the timeline, below Show more, until a page reaches it.
 *
 * @returns The list.
 */
function HistoryList(): React.JSX.Element {
  const { projectId } = useProject();
  const status = useRevisionStatus();
  const { revisions, headRevisionId, line, isDirty, hasOlder, loadOlder } = useRevisions();
  const { restore, undo, isBusy } = useRestoreToPoint();
  const revealed = useRevisionReveal(projectId);
  const branch = line.kind === 'unknown' ? undefined : line.name;
  const groups = useMemo(() => groupRevisionHistory(revisions, headRevisionId), [revisions, headRevisionId]);
  const [openRows, setOpenRows] = useState<ReadonlySet<string>>(() => new Set());
  const [openFolds, setOpenFolds] = useState<ReadonlySet<string>>(() => new Set());
  const [isAllShown, setIsAllShown] = useState(false);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  /* *View revision* reaches its row wherever it is: behind Show more, inside a fold, below the loaded page, and opened (DESIGN: a reveal expands to its target). */
  if (revealed !== undefined) {
    const holder = groups.find((group) => holds(group, revealed));
    if (holder?.kind === 'autosaves' && !openFolds.has(keyOf(holder))) {
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
  const hiddenCount = hidden.reduce(
    (count, group) => count + (group.kind === 'autosaves' ? group.revisions.length : 1),
    0,
  );
  const [active, setActive] = useState<string | undefined>(headRevisionId);
  /* Show more unmounts under focus, so the first row it reveals takes focus. */
  const revealFocus = useRef<string>(undefined);
  /* A page read by Show more lands a render later: the first row after the last one shown takes focus then. */
  const focusAfter = useRef<string>(undefined);
  const listRef = useRef<HTMLDivElement>(null);
  // ponytail: tab stops set on the DOM after each render, so rows, folds and Show more need no tabIndex plumbing.
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
        isCurrent={revision.revisionId === headRevisionId}
        isDirty={isDirty}
        branch={branch}
        isOpen={openRows.has(revision.revisionId)}
        isBusy={isBusy}
        isFirst={isFirst}
        isLast={isLast}
        onOpenChange={toggle(setOpenRows, revision.revisionId)}
        onRestore={restore}
        onUndoRestore={undo}
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
  /* Below Show more: kept rows older than the page, each under its own day. */
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
      <ol aria-label='Revision history' className={timelineList}>
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
                Show {hiddenCount} more
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
                Show more
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
          <CircleAlert aria-hidden className='mt-px size-3.5 shrink-0 text-destructive' />
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
            className={cn(
              'mt-px size-3.5 shrink-0',
              outcome.kind === 'conflicted' ? 'text-warning' : 'text-destructive',
            )}
          />
          <span className='min-w-0 flex-1'>
            {outcome.kind === 'conflicted'
              ? `${needsDecision}: two versions changed the same files.`
              : `Nothing was saved for this change. ${describeRevisionFailure('turn', outcome.code).description}`}
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
  const { chats } = useChatRecords(projectId);
  /* A29: *Sync* appears when a remote exists, or when the person opens it. */
  const [isConnectOpen, setIsConnectOpen] = useState(false);
  /* N4: the plan, read once here — the region itself stays presentational. */
  const { canSyncFiles, storageLimitBytes, canUpgradePlan, requestUpgrade } = useCommercialFeatures();
  const { signIn } = useAuthLinks();
  const chatNames = useMemo(() => Object.fromEntries(chats.map((chat) => [chat.id, chat.name])), [chats]);
  const chatCheckoutIds = useMemo(() => Object.fromEntries(chats.map((chat) => [chat.id, chat.checkoutId])), [chats]);
  /* The chat the route has in focus: *Use in this chat* places it (C3). */
  const activeChatId = projectChatIdFromSearch(useLocation().search);
  const authority = useOptionalChatWorkspaceAuthority();
  const branches = status?.branches ?? [];
  const isSyncOpen = status !== undefined && (status.remote.kind !== 'none' || isConnectOpen);
  const conflicts = status?.conflicts ?? [];
  const conflictTexts = useConflictTexts();
  const currentBranch = line.kind === 'unknown' ? undefined : line.name;
  const canWrite = projectRole !== 'read' && projectRole !== 'revoked';
  /* M2 (I6): an unlocated line is loading, never an empty History. */
  const isHistoryLoading = isLoading || line.kind === 'unknown';

  return (
    <div data-slot='revisions-panel-body' className='@container flex size-full min-h-0 flex-col bg-sidebar'>
      <OrientationStrip
        isSyncOpen={isSyncOpen && status.remote.kind === 'none'}
        onOpenSync={() => {
          setIsConnectOpen(true);
        }}
      />
      {/* A stable, thin scrollbar gutter, so a row that opens never shifts the pane sideways; the cards sit 8 px
          from both sides (round 11). No `min-h-0` on the regions: this column owns the scroll (C36). */}
      <div className='flex min-h-0 flex-1 [scrollbar-width:thin] [scrollbar-gutter:stable] flex-col gap-2 overflow-y-auto py-2 pl-2 *:w-[min(100%,calc(100cqw-1rem))]'>
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
              liveCheckoutId={status?.checkoutId}
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
              isBusy={(status?.branchVerb.busy ?? false) || (status?.branchVerb.asking ?? false)}
              isWritable={canWrite}
              onSwitch={commands.switchTo}
              onMerge={commands.mergeBranch}
              onDiscard={commands.discardBranch}
              onRename={commands.renameBranch}
            />
          </RevisionRegion>
        ) : null}

        <RevisionRegion
          id='revision-history-heading'
          title={currentBranch === undefined ? 'History' : `History · ${currentBranch}`}
        >
          {isHistoryLoading && revisions.length === 0 ? (
            <HistoryLoading />
          ) : revisions.length === 0 ? (
            <PanelEmptyState
              icon={History}
              title='No revisions yet'
              description='Save a revision or send a request and it will appear here.'
              className='[container-type:inline-size] m-0 h-auto min-h-40 w-full'
            />
          ) : (
            <HistoryList />
          )}
        </RevisionRegion>

        {/* A29/D26: *Sync* appears once a remote does, or once the person asks to back up. */}
        {isSyncOpen ? (
          <RevisionSyncRegion
            remote={status.remote}
            sync={status.sync}
            onConnect={commands.connectRemote}
            onDisconnect={commands.disconnectRemote}
            onCancel={commands.cancelRemote}
            onSync={commands.syncNow}
            syncChats={project?.syncChats !== false}
            onSyncChatsChange={(enabled) => {
              // oxlint-disable-next-line promise/prefer-await-to-then, tau-lint/no-async-iife -- a refused manifest write is named, not left loose
              void updateProject(projectId, { syncChats: enabled }).catch(reportSyncSettingError);
            }}
            /* Generated evidence is default-off (policy Rule 13). */
            syncLargeExports={project?.syncLargeExports === true}
            onSyncLargeExportsChange={(enabled) => {
              // oxlint-disable-next-line promise/prefer-await-to-then, tau-lint/no-async-iife -- a refused manifest write is named, not left loose
              void updateProject(projectId, { syncLargeExports: enabled }).catch(reportSyncSettingError);
            }}
            canSyncFiles={canSyncFiles}
            onUpgrade={canUpgradePlan ? requestUpgrade : undefined}
            storageLimitBytes={storageLimitBytes}
            signInHref={signIn}
            role={projectRole}
            projectId={projectId}
            isLineKnown={line.kind !== 'unknown'}
          />
        ) : null}
      </div>
    </div>
  );
}
