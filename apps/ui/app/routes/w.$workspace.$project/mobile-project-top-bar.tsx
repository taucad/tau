/**
 * The project's phone top bar and project sheet (charter D2, D3, EQ2 = H1).
 *
 * Below `md` the project has one 48px bar with three controls: the sidebar
 * (`PanelLeft`, the left sheet), the project title with its one-line status
 * line, which opens the project sheet, and Share. Revisions, Export and Details
 * live once in the project sheet (and in All), never beside Share (I4). The
 * status line reads every fact from the owners the desktop header reads —
 * `useRevisionFacts`, `useFollowChat` and the record issues — so the phone and
 * the desktop cannot disagree about save state (one owner, RA11).
 */
import { useCallback, useId, useRef, useState } from 'react';
import { Check, ChevronDown, CircleAlert, GitBranch, GitMerge, History, Info, PanelLeft, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useSelector } from '@xstate/react';
import { Button } from '@taucad/ui/components/button';
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from '@taucad/ui/components/drawer';
import { Tooltip, TooltipContent, TooltipTrigger } from '@taucad/ui/components/tooltip';
import { cn } from '@taucad/ui/utils/cn';
import { workbenchPanes } from '@taucad/workbench-panes/registry/pane-registry';
import { SidebarTrigger } from '#components/ui/sidebar.js';
import { useProject } from '#hooks/use-project.js';
import { summarizeRecordIssues, useRecordIssues } from '#workbench-records/record-issues.js';
import type { RecordIssueState } from '#workbench-records/record-issues.js';
import { paneTitle } from '#workbench-records/pane-titles.js';
import { useProjectWorkspace } from '#routes/w.$workspace.$project/project-workspace-context.js';
import { useIsProjectUnavailable } from '#routes/w.$workspace.$project/project-unavailable-overlay.js';
import { useFollowChat } from '#routes/w.$workspace.$project/revision-status-action.js';
import { RecordIssuesAction } from '#routes/w.$workspace.$project/record-issues-action.js';
import {
  cloudUnavailable,
  conflictSentence,
  hasRevisionConflict,
  revisionName,
  useRevisionFacts,
} from '#routes/w.$workspace.$project/revision-vocabulary.js';
import type { RevisionFacts } from '#routes/w.$workspace.$project/revision-vocabulary.js';

/** The line a project starts on; the status line names any other (D3). */
const defaultBranch = 'main';

/** The shared vocabulary's sentence for an unconfirmed write, which the status line keeps verbatim. */
const saveNotConfirmed = 'Save not confirmed';

/** The shared vocabulary's clause for a viewer who may not write. */
const viewOnly = 'View only';

/** What the glyph's colour says, for a person who does not see it (its name): only an unconfirmed write and a warning say anything. */
const toneDescriptions: Readonly<Record<string, string>> = {
  'text-feature': 'Needs attention',
  'text-warning': 'Warning',
};

/** What the status line draws: one glyph in one tone (colour lives on the glyph only) and one line of words. @public */
export type ProjectStatusLine = Readonly<{
  icon: LucideIcon;
  /** The glyph's tone; the words are always muted. */
  tone: string;
  /** Whether the glyph turns while work is in flight. */
  isBusy: boolean;
  /** The save state's word: *Saved*, *Saving…*, *Save not confirmed*, *Conflict*, or the shared sentence otherwise. */
  word: string;
  /** The whole line: the word, then *on ⟨branch⟩*, the record issue count and *Follow chat* when they apply. */
  text: string;
}>;

/**
 * The status line's one vocabulary (D3), derived from the revision facts every
 * revision surface reads and the record issues the desktop trigger reads.
 *
 * Most urgent first: an unconfirmed write (feature glyph), then any other
 * failure or ask the shared vocabulary raises, a conflict, a settings record
 * that needs a person, work in flight, and at rest *Saved*. States D3 has no
 * word for (modified files, a restore, an arrival, loading) keep the shared
 * sentence verbatim rather than a second phrasing of it (I12).
 *
 * @param input - The revision facts, the workbench's line, the record issues' summary and the focused chat's other line.
 * @returns The glyph, its tone and the words.
 * @public
 */
export const selectProjectStatusLine = ({
  facts,
  branch,
  issues,
  followBranch,
}: Readonly<{
  facts: RevisionFacts;
  branch: string | undefined;
  issues?: Readonly<{ state: RecordIssueState; count: number }> | undefined;
  followBranch?: string | undefined;
}>): ProjectStatusLine => {
  const status = ((): Omit<ProjectStatusLine, 'text'> => {
    /* The shared facts already rank a revision's unconfirmed write above its conflict; a conflict then outranks a
     * settings record's unconfirmed write, which the issue count still carries. */
    if (facts.sentence === saveNotConfirmed) {
      return { icon: CircleAlert, tone: 'text-feature', isBusy: false, word: saveNotConfirmed };
    }
    if (facts.icon === GitMerge) {
      return { icon: GitMerge, tone: facts.tone, isBusy: false, word: 'Conflict' };
    }
    if (issues?.state === 'unconfirmed') {
      return { icon: CircleAlert, tone: 'text-feature', isBusy: false, word: saveNotConfirmed };
    }
    if (facts.mark === 'failed' || facts.mark === 'attention') {
      return { icon: facts.icon, tone: facts.tone, isBusy: false, word: facts.sentence };
    }
    /* The backup's progress is the Revisions pane's; the viewer's access is not, so view-only and a cloud copy
     * that is gone keep their words (HQ3). */
    const isSavedFamily =
      facts.mark !== 'running' &&
      facts.sentence.startsWith('Saved') &&
      !facts.sentence.endsWith(viewOnly) &&
      !facts.sentence.endsWith(cloudUnavailable);
    const word = isSavedFamily ? 'Saved' : facts.sentence;
    /* Work in flight keeps its turning glyph; a settings record's count is still in the line. */
    if (facts.mark === 'running') {
      return { icon: facts.icon, tone: facts.tone, isBusy: true, word };
    }
    if (issues !== undefined) {
      return { icon: CircleAlert, tone: 'text-warning', isBusy: false, word };
    }
    return word === 'Saved'
      ? { icon: Check, tone: '', isBusy: false, word }
      : { icon: facts.icon, tone: facts.tone, isBusy: false, word };
  })();
  const parts = [status.word];
  if (branch !== undefined && branch !== defaultBranch) {
    parts.push(`on ${branch}`);
  }
  if (issues !== undefined) {
    parts.push(`${String(issues.count)} ${issues.count === 1 ? 'issue' : 'issues'}`);
  }
  if (followBranch !== undefined) {
    parts.push('Follow chat');
  }
  return { ...status, text: parts.join(' · ') };
};

/**
 * The status line's facts, read once from their owners.
 *
 * @returns The line, the revision facts behind it and the focused chat's other line.
 */
function useProjectStatus(): Readonly<{
  line: ProjectStatusLine;
  facts: RevisionFacts;
  head: number | undefined;
  branch: string | undefined;
  followChat: ReturnType<typeof useFollowChat>;
  /**
   * The sentence of a conflict that waits on the person's decision, read from the revision status itself: the line may
   * name a more urgent fact first, and the decision still waits (I5).
   */
  conflict: string | undefined;
  /** The desktop trigger's words for the records, announced as it announces them. */
  issuesName: string;
}> {
  const { projectId } = useProject();
  const { where, facts, status } = useRevisionFacts();
  const followChat = useFollowChat(status, where.branch);
  const issues = summarizeRecordIssues(useRecordIssues(projectId));
  return {
    line: selectProjectStatusLine({ facts, branch: where.branch, issues, followBranch: followChat?.branch }),
    facts,
    head: where.head,
    branch: where.branch,
    followChat,
    conflict: status !== undefined && hasRevisionConflict(status) ? conflictSentence(status, where) : undefined,
    issuesName: issues ? `${issues.label} · ${String(issues.count)} ${issues.count === 1 ? 'record' : 'records'}` : '',
  };
}

/**
 * One line under the project name: a glyph and the words, truncating on its own.
 *
 * @param props - The line to draw.
 * @returns The status line.
 * @public
 */
export function ProjectStatusLineView({ line }: { readonly line: ProjectStatusLine }): React.JSX.Element {
  const description = Object.hasOwn(toneDescriptions, line.tone) ? toneDescriptions[line.tone] : undefined;
  return (
    <span data-slot='status-line' className='flex w-full min-w-0 items-center gap-1 text-xs text-muted-foreground'>
      <line.icon
        {...(description === undefined ? { 'aria-hidden': true } : { role: 'img', 'aria-label': description })}
        data-slot='status-line-icon'
        className={cn('size-3 shrink-0', line.tone, line.isBusy && 'animate-spin motion-reduce:animate-none')}
      />
      <span className='truncate'>{line.text}</span>
    </span>
  );
}

/**
 * Hand focus to the phone surface a destination opened once the sheet section names it, as choosing it from the
 * nav does. Focus the person moved elsewhere in the meantime is left alone; nothing waits past a few seconds.
 *
 * @param title - The surface's title, which names its section.
 */
function focusSurfaceWhenOpen(title: string): void {
  const take = (): boolean => {
    const section = [...document.querySelectorAll<HTMLElement>('[data-slot=mobile-surface]')].find(
      (candidate) => candidate.getAttribute('aria-label') === title,
    );
    if (!section) {
      return false;
    }
    if (document.activeElement === document.body || document.activeElement === null) {
      section.focus({ preventScroll: true });
    }
    return true;
  };
  if (take()) {
    return;
  }
  const observer = new MutationObserver(() => {
    if (take()) {
      stop();
    }
  });
  const surfaceWaitTimer = setTimeout(() => {
    stop();
  }, 5000);
  function stop(): void {
    observer.disconnect();
    clearTimeout(surfaceWaitTimer);
  }
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['aria-label'],
  });
}

/** A destination row in the project sheet: its workbench title is its label and its name (I6). */
function SheetRow({
  icon: Icon,
  label,
  meta,
  tone = 'text-muted-foreground',
  onSelect,
}: {
  readonly icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  readonly label: string;
  readonly meta?: string;
  /** The glyph's tone; colour lives on the glyph only. */
  readonly tone?: string;
  readonly onSelect: () => void;
}): React.JSX.Element {
  const labelId = useId();
  const metaId = useId();
  return (
    <li>
      {/* Named by its label alone; the meta describes it (I6). */}
      <Button
        variant='ghost'
        size='touch'
        data-slot='project-sheet-row'
        aria-labelledby={labelId}
        aria-describedby={meta === undefined ? undefined : metaId}
        className='w-full justify-start gap-3 rounded-none font-normal'
        onClick={onSelect}
      >
        <Icon aria-hidden className={cn('size-4 shrink-0', tone)} />
        <span id={labelId} className='shrink-0'>
          {label}
        </span>
        {meta === undefined ? null : (
          <span id={metaId} className='ml-auto min-w-0 truncate text-xs text-muted-foreground'>
            {meta}
          </span>
        )}
      </Button>
    </li>
  );
}

/**
 * The project sheet the title opens: the name and status line, the recovery a
 * status names (Follow chat, settings records), then Revisions, Export and
 * Details, each once. A waiting conflict moves the Revisions row first, as the
 * decision it opens (I5), rather than adding a second way there (I4). Share is
 * not here: it is the bar's own trailing control.
 */
function ProjectSheet({
  isOpen,
  onOpenChange,
  projectName,
  status,
  returnFocus,
}: {
  readonly isOpen: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly projectName: string;
  readonly status: ReturnType<typeof useProjectStatus>;
  /** Hands focus back to the title that opened the sheet; `false` when the title is gone. */
  readonly returnFocus: () => boolean;
}): React.JSX.Element {
  const { openPanel } = useProjectWorkspace();
  const closeRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  /* The surface a destination opened, which takes focus instead of the title. */
  const chosenSurface = useRef<string | undefined>(undefined);
  const open = (panel: 'revisions' | 'export' | 'details'): void => {
    chosenSurface.current = paneTitle(panel);
    onOpenChange(false);
    openPanel(panel);
  };
  const close = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);
  const head = revisionName(status.head);
  const revisionsMeta = [head, status.branch].filter(Boolean).join(' · ');
  const revisionsRow = (
    <SheetRow
      icon={status.conflict === undefined ? History : GitMerge}
      label={paneTitle('revisions')}
      meta={status.conflict ?? (revisionsMeta === '' ? undefined : revisionsMeta)}
      {...(status.conflict === undefined ? {} : { tone: 'text-warning' })}
      onSelect={() => {
        open('revisions');
      }}
    />
  );
  return (
    <Drawer open={isOpen} onOpenChange={onOpenChange}>
      <DrawerContent
        ref={sheetRef}
        data-slot='project-sheet'
        className='outline-none'
        onOpenAutoFocus={(event) => {
          /* Vaul leaves focus on the title, outside the modal the page is hidden behind; the sheet takes it (T6). Not
           * Close: focusing it would open its tooltip on every tap of the title. */
          event.preventDefault();
          sheetRef.current?.focus({ preventScroll: true });
        }}
        onCloseAutoFocus={(event) => {
          const surface = chosenSurface.current;
          chosenSurface.current = undefined;
          if (surface !== undefined) {
            // A chosen destination's surface takes focus, as it does from the nav.
            event.preventDefault();
            focusSurfaceWhenOpen(surface);
            return;
          }
          // Dismissed (Close, Escape, a swipe): the title that opened the sheet takes focus back.
          if (returnFocus()) {
            event.preventDefault();
          }
        }}
      >
        <div className='flex items-center gap-2 px-4 py-2'>
          <div className='flex min-w-0 flex-1 flex-col'>
            <DrawerTitle className='truncate text-base font-medium'>{projectName}</DrawerTitle>
            <DrawerDescription asChild>
              <div>
                <ProjectStatusLineView line={status.line} />
              </div>
            </DrawerDescription>
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                ref={closeRef}
                variant='outline'
                size='icon'
                className='rounded-full'
                aria-label='Close project sheet'
                onClick={close}
              >
                <X aria-hidden className='size-4' />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Close project sheet</TooltipContent>
          </Tooltip>
        </div>
        <div className='min-h-0 overflow-y-auto pb-3'>
          {/* I5: a conflict is a decision, so its Revisions row comes first and says so; it opens where it is made. */}
          {status.conflict === undefined ? null : (
            <ul aria-label='Decision' className='border-t py-1'>
              {revisionsRow}
            </ul>
          )}
          {status.followChat === undefined ? null : (
            <ul aria-label='Chat' className='border-t py-1'>
              <SheetRow
                icon={GitBranch}
                label='Follow chat'
                meta={`${status.followChat.chatName} · on ${status.followChat.branch}`}
                onSelect={() => {
                  status.followChat?.follow();
                  close();
                }}
              />
            </ul>
          )}
          <div data-slot='project-sheet-records'>
            <RecordIssuesAction
              variant='inline'
              fallbackFocus={() => {
                closeRef.current?.focus();
              }}
              onBeforeOpenFile={close}
            />
          </div>
          <ul aria-label='Project' className='border-t py-1'>
            {status.conflict === undefined ? revisionsRow : null}
            <SheetRow
              icon={workbenchPanes.export.icon}
              label={paneTitle('export')}
              onSelect={() => {
                open('export');
              }}
            />
            <SheetRow
              icon={Info}
              label={paneTitle('details')}
              onSelect={() => {
                open('details');
              }}
            />
          </ul>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

/**
 * The project's phone top bar (H1): sidebar · title with status line · Share.
 * Desktop never draws it (`md:hidden`); its header stays the viewer cluster.
 *
 * @returns The 48px bar and the project sheet its title opens.
 * @public
 */
export function MobileProjectTopBar(): React.JSX.Element {
  const { projectRef } = useProject();
  const { openPanel, registerRecordRecoveryFocus } = useProjectWorkspace();
  const projectName = useSelector(projectRef, (snapshot) => snapshot.context.project?.name) ?? 'Project';
  const status = useProjectStatus();
  /* While the unavailable overlay covers the project, its actions stand down as the dock strip did under it; the
   * sidebar stays live so the person can leave. */
  const isUnavailable = useIsProjectUnavailable();
  const [isSheetRequested, setSheetOpen] = useState(false);
  const isSheetOpen = isSheetRequested && !isUnavailable;
  const titleRef = useRef<HTMLButtonElement>(null);
  const returnFocus = useCallback((): boolean => {
    const title = titleRef.current;
    if (!title?.isConnected) {
      return false;
    }
    title.focus({ preventScroll: true });
    return true;
  }, []);
  const shareLabel = paneTitle('share');
  const ShareIcon = workbenchPanes.share.icon;
  return (
    <header
      data-slot='mobile-project-top-bar'
      className='flex h-12 shrink-0 items-center gap-0.5 border-b bg-background px-1 md:hidden'
    >
      {/* The records' live announcement, which the desktop trigger makes and this bar takes over below `md`. */}
      <span role='status' className='sr-only'>
        {status.issuesName}
      </span>
      {/* I3: the bar's three controls are 40px, as the shell pages' phone bar (D11). */}
      <SidebarTrigger className='size-10'>
        <PanelLeft aria-hidden data-slot='sidebar-panel-icon' className='size-5' />
      </SidebarTrigger>
      <button
        ref={titleRef}
        type='button'
        data-slot='project-title-button'
        aria-haspopup='dialog'
        aria-expanded={isSheetOpen}
        disabled={isUnavailable}
        className='flex h-10 min-w-0 flex-1 cursor-action flex-col items-start justify-center rounded-md px-2 text-left outline-none hover:bg-accent focus-visible:focus-outline disabled:cursor-default disabled:opacity-50 disabled:hover:bg-transparent'
        onClick={() => {
          setSheetOpen(true);
        }}
      >
        <span className='flex w-full min-w-0 items-center gap-1 text-sm leading-5 font-medium'>
          <span className='truncate'>{projectName}</span>
          <ChevronDown aria-hidden className='size-3.5 shrink-0 text-muted-foreground' />
        </span>
        <ProjectStatusLineView line={status.line} />
      </button>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            ref={registerRecordRecoveryFocus}
            variant='ghost'
            size='icon-lg'
            aria-label={shareLabel}
            data-slot='project-share-button'
            disabled={isUnavailable}
            onClick={() => {
              openPanel('share');
            }}
          >
            <ShareIcon aria-hidden className='size-5' />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{shareLabel}</TooltipContent>
      </Tooltip>
      <ProjectSheet
        isOpen={isSheetOpen}
        projectName={projectName}
        status={status}
        returnFocus={returnFocus}
        onOpenChange={setSheetOpen}
      />
    </header>
  );
}
