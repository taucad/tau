/**
 * One history entry, wherever a person meets it (charter D7; blueprint C3).
 *
 * `RevisionRow` is a History row: at rest the whole row is one button that opens
 * it, with its marker on the line, its title, who made it, and its time (or a
 * version's `V3`) in the right-hand column. Opened, it has no fill: it shows the
 * files the entry changed (each opening its own comparison), Restore, Compare
 * and More, and one line of facts. `RevisionMenu` is that row's More, shared
 * with the chat marker so a person reaches the same verbs from either place.
 */
import { useEffect, useId, useRef, useState } from 'react';
import {
  Bot,
  ChevronDown,
  EllipsisVertical,
  GitBranch,
  GitCompare,
  GitMerge,
  Pencil,
  RotateCcw,
  Tag,
  TriangleAlert,
} from 'lucide-react';
import { Button } from '@taucad/ui/components/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@taucad/ui/components/collapsible';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@taucad/ui/components/dropdown-menu';
import { Skeleton } from '@taucad/ui/components/skeleton';
import { cn } from '@taucad/ui/utils/cn';
import { generatedSetupPaths } from '@taucad/revisions';
import type { RevisionDiffEntry } from '@taucad/revisions';
import type { RevisionComparisonNotice } from '@taucad/revisions/algorithms';
import { CopyButton } from '@taucad/ui/components/copy-button';
import { DiffViewer } from '#components/code/diff-viewer.js';
import { FileExtensionIcon } from '@taucad/ui-kit/icons/file-extension-icon';
import { disclosureMotion } from '@taucad/ui/components/actions';
import { NamePopover } from '#components/revisions/name-popover.js';
import {
  timelineGutter,
  timelineMarker,
  timelineOpenBlock,
  timelineRowButton,
  timelineRowContent,
  timelineRowHover,
} from '#components/revisions/revision-timeline.js';
import { resolveHighlightLanguageForPath } from '@taucad/ui-core/lib/code-language-resolution';
import { useFeature } from '#flags/use-feature.js';
import { useProject } from '#hooks/use-project.js';
import { useRevisionChanges, useRevisionChangesSince, useRevisionFileComparison } from '#hooks/use-revisions.js';
import type { RevisionCard } from '#hooks/use-revisions.js';
import { useProjectRole, useRevisionCommands } from '#hooks/use-revision-status.js';
import { consumeRevisionReveal, useRevisionReveal } from '@taucad/project-workspace/utils/revision-reveal';
import {
  entryReference,
  entryTime,
  startFact,
  versionLabel,
  versionOf,
} from '#routes/w.$workspace.$project/revision-vocabulary.js';

/** Whether a revision is one of the autosaves History folds: a turn's base cut is one too (A5). */
export const isAutosave = (revision: RevisionCard): boolean =>
  revision.turnCut === 'base' ||
  (revision.turnId === undefined &&
    (revision.capture === 'idle' || revision.capture === 'hidden' || revision.capture === 'close'));

/* The file's state is muted at 90%, the lightest step that keeps 4.5:1 on the
   file list in every theme; a hovered row returns it to the full muted colour. */
const changeLabels: Readonly<Record<RevisionDiffEntry['kind'], string>> = {
  added: 'Added',
  modified: 'Changed',
  deleted: 'Deleted',
};

const initialFileRows = 3;

/* The files Tau owns as project setup, at the project root (A4). */
const isSetupPath = (path: string): boolean => generatedSetupPaths.has(path);
const comparisonNotices: Readonly<Record<RevisionComparisonNotice, string>> = {
  'empty-added': 'Empty file added.',
  'empty-deleted': 'Empty file deleted.',
  encoding: 'File encoding changed.',
  'executable-added': 'File is now executable.',
  'executable-removed': 'File is no longer executable.',
  'line-endings': 'Line endings changed.',
  'final-newline': 'Final newline changed.',
};

/**
 * What *Compare* opens under a file row: the shared `DiffViewer` flush inside
 * the file list, or why there is nothing to read yet.
 *
 * @param props - The revision, the file, and what it is compared with.
 * @returns The comparison.
 */
function FileComparison({
  id,
  revisionId,
  path,
  compareAgainst,
}: {
  readonly id: string;
  readonly revisionId: string;
  readonly path: string;
  readonly compareAgainst: 'parent' | 'checkout';
  // oxlint-disable-next-line typescript/no-restricted-types -- required by React
}): React.JSX.Element | null {
  const { original, modified, comparison, isLoading, isLoaded, error, retry } = useRevisionFileComparison(
    revisionId,
    path,
    compareAgainst === 'checkout' ? 'checkout' : undefined,
  );
  const label = `Comparison for ${path}`;
  if (isLoading) {
    return (
      <div id={id} role='status' aria-label={label} aria-busy='true' className='border-t px-2 py-1.5'>
        <ComparisonSkeleton />
      </div>
    );
  }
  if (error !== undefined) {
    return (
      <div
        id={id}
        role='alert'
        aria-label={label}
        className='flex flex-wrap items-center gap-2 border-t px-2 py-1.5 text-xs'
      >
        <span className='min-w-0 flex-auto'>{`Couldn’t compare ${path}.`}</span>
        <Button size='xs' variant='outline' className='ml-auto' onClick={retry}>
          <RotateCcw aria-hidden className='size-3.5' />
          Try again
        </Button>
      </div>
    );
  }
  if (!isLoaded || comparison === undefined) {
    return null;
  }
  if (comparison.change === 'unchanged') {
    return (
      <p id={id} role='note' aria-label={label} className='border-t px-2 py-1.5 text-xs text-muted-foreground'>
        {compareAgainst === 'checkout' ? 'No changes since then.' : 'No changes in this file.'}
      </p>
    );
  }
  return (
    /* A region that scrolls sideways must be reachable by keyboard to scroll. */
    <div
      id={id}
      role='region'
      aria-label={label}
      // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- a scrollable region must be keyboard reachable (WCAG 2.1.1)
      tabIndex={0}
      /* An empty diff line keeps its height, and the hidden-lines label keeps the 12 px floor (round 5). */
      className='[scrollbar-width:thin] overflow-x-auto border-t bg-background focus-visible:focus-outline [&_.line:empty]:min-h-[1.6em] [&_.whitespace-nowrap]:text-xs'
    >
      {comparison.notices.map((notice) => (
        <p key={notice} role='note' className='px-2 py-1.5 text-xs text-muted-foreground'>
          {comparisonNotices[notice]}
        </p>
      ))}
      {comparison.kind === 'text' ? (
        original === modified ? null : (
          <DiffViewer
            originalContent={original}
            modifiedContent={modified}
            language={resolveHighlightLanguageForPath(path).language}
          />
        )
      ) : (
        <p role='note' className='px-2 py-1.5 text-xs text-muted-foreground'>
          {comparison.kind === 'binary'
            ? `Binary file ${comparison.change === 'added' ? 'added' : comparison.change === 'deleted' ? 'deleted' : 'changed'}.`
            : 'This file can’t be shown as text.'}
        </p>
      )}
    </div>
  );
}

/**
 * A comparison that has not arrived: two skeleton lines, with the words kept
 * for screen readers only (M7).
 *
 * @returns The skeleton.
 */
function ComparisonSkeleton(): React.JSX.Element {
  return (
    <span className='flex flex-col gap-1.5 py-0.5'>
      <span className='sr-only'>Loading comparison…</span>
      <Skeleton aria-hidden className='h-3 w-3/4' />
      <Skeleton aria-hidden className='h-3 w-1/2' />
    </span>
  );
}

/**
 * The files a revision changed, on their own bordered surface. Each whole row
 * is the disclosure for its comparison, one open at a time: what the revision
 * changed or, on the current row of a modified checkout, what has changed since
 * it (S38).
 *
 * @param props - The revision and what its files are compared with.
 * @returns The list, or nothing until the files are known.
 */
export function FileRows({
  revision,
  compareAgainst,
}: {
  readonly revision: RevisionCard;
  readonly compareAgainst: 'parent' | 'checkout';
  // oxlint-disable-next-line typescript/no-restricted-types -- required by React
}): React.JSX.Element | null {
  const changes = useRevisionChanges(revision);
  return <FileList revision={revision} changes={changes} compareAgainst={compareAgainst} label='Changed files' />;
}

/**
 * The file list itself, for whichever paths a row shows: what the revision
 * changed, or what differs from it now.
 *
 * @param props - The revision, its paths, what they are compared with, and the list's name.
 * @returns The list, or nothing for no paths.
 */
function FileList({
  revision,
  changes,
  compareAgainst,
  label,
}: {
  readonly revision: RevisionCard;
  readonly changes: readonly RevisionDiffEntry[];
  readonly compareAgainst: 'parent' | 'checkout';
  readonly label: string;
  // oxlint-disable-next-line typescript/no-restricted-types -- required by React
}): React.JSX.Element | null {
  const [comparing, setComparing] = useState<string>();
  const [isExpanded, setIsExpanded] = useState(false);
  const id = useId();
  if (changes.length === 0) {
    return null;
  }
  /* A4: Tau's own setup files last, under a plain label (canvas "An open row"). */
  const ordered = [
    ...changes.filter((change) => !isSetupPath(change.path)),
    ...changes.filter((change) => isSetupPath(change.path)),
  ];
  const shown = isExpanded ? ordered : ordered.slice(0, initialFileRows);
  const firstSetup = shown.findIndex((change) => isSetupPath(change.path));
  return (
    <ul aria-label={label} className='flex flex-col divide-y overflow-hidden rounded-md border bg-background'>
      {shown.flatMap((change, index) => [
        ...(index === firstSetup
          ? [
              /* A label, not a file: assistive technology counts only the files as items. */
              <li key='project-setup' role='presentation' className='px-2 py-1 text-xs text-muted-foreground'>
                Project setup
              </li>,
            ]
          : []),
        <Collapsible
          key={change.path}
          asChild
          open={comparing === change.path}
          onOpenChange={(isOpen) => {
            setComparing(isOpen ? change.path : undefined);
          }}
        >
          <li className='flex flex-col'>
            <CollapsibleTrigger asChild>
              <button
                type='button'
                aria-label={
                  compareAgainst === 'checkout'
                    ? `Compare ${change.path} with the current file`
                    : `Compare ${change.path}`
                }
                className='group/file flex min-h-6 w-full min-w-0 cursor-action items-center gap-2 px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent focus-visible:focus-outline motion-reduce:transition-none'
              >
                <FileExtensionIcon filename={change.path} className='size-3.5 shrink-0' />
                <span className='min-w-0 flex-1 truncate'>{change.path}</span>
                <span className='shrink-0 text-muted-foreground/90 group-hover/file:text-muted-foreground'>
                  {changeLabels[change.kind]}
                </span>
                <ChevronDown
                  aria-hidden
                  className='size-3 shrink-0 text-muted-foreground transition-transform group-data-[state=open]/file:rotate-180 motion-reduce:transition-none'
                />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className={disclosureMotion}>
              <FileComparison
                id={`${id}-${String(index)}`}
                revisionId={revision.revisionId}
                path={change.path}
                compareAgainst={compareAgainst}
              />
            </CollapsibleContent>
          </li>
        </Collapsible>,
      ])}
      {changes.length > initialFileRows ? (
        <li>
          <button
            type='button'
            aria-expanded={isExpanded}
            className='flex min-h-6 w-full cursor-action items-center justify-center px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:focus-outline motion-reduce:transition-none'
            onClick={() => {
              setIsExpanded((expanded) => !expanded);
              setComparing(undefined);
            }}
          >
            {isExpanded ? 'Show fewer' : `Show all ${String(changes.length)} files`}
          </button>
        </li>
      ) : null}
    </ul>
  );
}

/**
 * *Compare* (blueprint C3): the whole entry against the files as they are now —
 * every path that differs, each opening the same checkout comparison a file row
 * does — until the person says Done.
 *
 * @param props - The entry, and how to go back to its own changes.
 * @returns The comparison.
 */
function CurrentComparison({
  revision,
  onStop,
}: {
  readonly revision: RevisionCard;
  readonly onStop: () => void;
}): React.JSX.Element {
  const { changes, isLoaded, error, retry } = useRevisionChangesSince(revision);
  const name = entryReference(revision) ?? 'this point';
  const body =
    error === undefined ? (
      isLoaded ? (
        changes.length === 0 ? (
          <p role='note' className='text-xs text-muted-foreground'>
            No changes since then.
          </p>
        ) : (
          <FileList revision={revision} changes={changes} compareAgainst='checkout' label={`Changed since ${name}`} />
        )
      ) : (
        <p role='status' aria-busy='true'>
          <ComparisonSkeleton />
        </p>
      )
    ) : (
      <div role='alert' className='flex flex-wrap items-center gap-2 text-xs'>
        <span className='min-w-0 flex-auto'>Couldn’t compare with your current files.</span>
        <Button size='xs' variant='outline' onClick={retry}>
          <RotateCcw aria-hidden className='size-3.5' />
          Try again
        </Button>
      </div>
    );
  return (
    <div className='flex flex-col gap-1'>
      <p role='status' className='flex min-w-0 flex-wrap items-center gap-2 text-xs'>
        <GitCompare aria-hidden className='size-3.5 shrink-0 text-muted-foreground' />
        <span className='min-w-0 flex-auto'>Comparing with your current files</span>
        <Button size='xs' variant='outline' onClick={onStop}>
          Done
        </Button>
      </p>
      {body}
    </div>
  );
}

/**
 * The ids an entry is stored under: its own, its tree's and its parent's.
 * Diagnostics only (B5, M8): they render with Tau's debug setting on and never
 * otherwise, so a person reads no 40-character id; copying the entry's id is
 * More's.
 *
 * @param revision - The entry.
 * @returns The Details rows that name its ids.
 */
const storedIdRows = (revision: RevisionCard): ReadonlyArray<readonly [string, React.ReactNode]> => {
  /* The first parent the graph named; a branch's first revision follows none. A card
     from elsewhere (a remote settlement) has neither a parent nor a number here. */
  const parent =
    revision.parent === undefined ? (
      revision.n === 1 ? (
        'None (first entry)'
      ) : undefined
    ) : (
      <code key='parent' className='font-mono break-all'>
        {revision.parent}
      </code>
    );
  return [
    [
      'ID',
      <code key='id' className='font-mono break-all'>
        {revision.revisionId}
      </code>,
    ],
    /* The tree the revision carries: two revisions with the same bytes name the same one. */
    ...(revision.treeId === undefined
      ? []
      : ([
          [
            'Tree',
            <code key='tree' className='font-mono break-all'>
              {revision.treeId}
            </code>,
          ],
        ] as const)),
    ...(parent === undefined ? [] : ([['Parent', parent]] as const)),
  ];
};

/**
 * The ids and trailer an entry is stored under, under its open row's facts:
 * diagnostics, rendered with Tau's debug setting on and never otherwise (B5).
 *
 * @param props - The entry.
 * @returns The list, or nothing with the setting off.
 */
// oxlint-disable-next-line typescript/no-restricted-types -- required by React
function RevisionDiagnostics({ revision }: { readonly revision: RevisionCard }): React.JSX.Element | null {
  const isDebug = useFeature('tauDebug');
  if (!isDebug) {
    return null;
  }
  return (
    <dl aria-label='Diagnostics' className='grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-xs'>
      {storedIdRows(revision).map(([term, value]) => (
        <div key={term} className='contents'>
          <dt className='text-muted-foreground'>{term}</dt>
          <dd className='min-w-0'>{value}</dd>
        </div>
      ))}
      {revision.trailer === undefined ? null : (
        <div className='col-span-2 flex min-w-0 flex-col gap-0.5'>
          <dt className='text-muted-foreground'>Recorded trailer</dt>
          <dd className='min-w-0'>
            <code className='block font-mono break-all whitespace-pre-wrap'>{revision.trailer}</code>
          </dd>
        </div>
      )}
    </dl>
  );
}

/**
 * The number the next version takes, as this page knows the project's versions:
 * the highest it has read plus one, and V2 at least, because V1 is Start (B6).
 *
 * @param revisions - The entries this page has read.
 * @returns The number.
 * @public
 */
export const nextVersionNumber = (revisions: readonly RevisionCard[]): number =>
  Math.max(1, ...revisions.flatMap((revision) => (revision.versions ?? []).map((version) => version.number))) + 1;

/**
 * An entry's More, one menu on its History row and in the chat marker: two
 * items, Create version… (Rename version… on a version) and New branch from
 * here…, each opening the one naming form under this menu's button. There is
 * no way to remove a version (Q13) and no Publish: Share owns publishing.
 *
 * @param props - The entry, its branch, and the number a new version takes.
 * @returns The menu, or nothing for a person who cannot write.
 */
export function RevisionMenu({
  revision,
  branch,
  nextVersion,
}: {
  readonly revision: RevisionCard;
  readonly branch: string | undefined;
  /** The number a new version takes, from {@link nextVersionNumber}; the form says it where the surface knows it. */
  readonly nextVersion?: number;
  // oxlint-disable-next-line typescript/no-restricted-types -- required by React
}): React.JSX.Element | null {
  const role = useProjectRole();
  const commands = useRevisionCommands();
  const moreRef = useRef<HTMLButtonElement>(null);
  /* A menu item opens its form once the menu has closed, so the menu's focus trap neither keeps focus from it nor takes it back. */
  const opens = useRef<'name' | 'branch'>(undefined);
  const [form, setForm] = useState<'name' | 'branch'>('name');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const name = entryReference(revision) ?? 'this point';
  const named = revision.tags?.[0];
  const version = revision.versions?.[0];
  if (role === 'read' || role === 'revoked') {
    return null;
  }

  const formCopy =
    form === 'name'
      ? {
          label: 'Version name',
          placeholder: 'e.g. Ready for print',
          note:
            named === undefined
              ? `${nextVersion === undefined ? '' : `This will be ${versionLabel(nextVersion)}. `}A version is a fixed point you can return to, compare with and share.`
              : `${version === undefined ? 'This version' : versionLabel(version.number)} keeps its number. A version is permanent.`,
          saveLabel: named === undefined ? 'Create version' : 'Rename',
          initial: named ?? '',
          onSave: async (value: string): Promise<void> => {
            if (value === named) {
              return;
            }
            /* B6: a rename rewrites the version's tag at its own ref, `refs/tags/v<n>`, keeping its number; nothing is removed. */
            await commands.tag({
              name: value,
              revisionId: revision.revisionId,
              ...(version === undefined ? {} : { number: version.number }),
            });
          },
        }
      : {
          label: 'Branch name',
          placeholder: 'enclosure-v2',
          note: `Starts from ${name}.${branch === undefined ? '' : ` ${branch} stays as it is.`}`,
          saveLabel: 'Create branch',
          initial: '',
          onSave: (value: string): void => {
            // oxlint-disable-next-line promise/prefer-await-to-then, tau-lint/no-async-iife -- the toast channel owns this refusal; only the loose rejection is ours
            void commands.createBranch(value, revision.revisionId).catch(() => undefined);
          },
        };

  return (
    <DropdownMenu>
      <NamePopover
        align='end'
        anchor={
          <DropdownMenuTrigger asChild>
            <Button ref={moreRef} size='icon-xs' variant='outline' aria-label='More'>
              <EllipsisVertical aria-hidden />
            </Button>
          </DropdownMenuTrigger>
        }
        isOpen={isFormOpen}
        returnFocus={moreRef}
        onOpenChange={setIsFormOpen}
        {...formCopy}
      />
      <DropdownMenuContent
        align='end'
        onCloseAutoFocus={(event) => {
          const next = opens.current;
          if (next === undefined) {
            return;
          }
          opens.current = undefined;
          event.preventDefault();
          setForm(next);
          setIsFormOpen(true);
        }}
      >
        <DropdownMenuItem
          onSelect={() => {
            opens.current = 'name';
          }}
        >
          {named === undefined ? <Tag aria-hidden /> : <Pencil aria-hidden />}
          {named === undefined ? 'Create version…' : 'Rename version…'}
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => {
            opens.current = 'branch';
          }}
        >
          <GitBranch aria-hidden />
          New branch from here…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * A marker that means something (L3-F12): conflicted, current, restored,
 * merged, named, or an ordinary revision's dot.
 *
 * @param props - The revision and whether it is the checkout's head.
 * @returns The marker.
 */
function RevisionMarkerGlyph({
  revision,
  isCurrent,
}: {
  readonly revision: RevisionCard;
  readonly isCurrent: boolean;
}): React.JSX.Element {
  if (revision.conflicted) {
    return (
      <span className={timelineMarker}>
        <GitMerge aria-label='Needs your decision' className='size-3.5 text-warning' />
      </span>
    );
  }
  if (isCurrent) {
    return (
      <span className={timelineMarker}>
        <span aria-label='Current' className='size-2.5 rounded-full border-2 border-foreground' />
      </span>
    );
  }
  /* A9: a Restored row is named by what it restored, never by its capture. */
  if (revision.restoredFrom !== undefined) {
    return (
      <span className={timelineMarker}>
        <RotateCcw aria-label='Restored' className='size-3.5 text-muted-foreground' />
      </span>
    );
  }
  if (revision.capture === 'merge') {
    return (
      <span className={timelineMarker}>
        <GitMerge aria-label='Merged' className='size-3.5 text-muted-foreground' />
      </span>
    );
  }
  /* A6: a version is the larger solid dot (blueprint "History, Version, Revision"). */
  if (revision.start !== undefined) {
    return (
      <span className={timelineMarker}>
        <span aria-label='Version' className='size-2.5 rounded-full bg-foreground' />
      </span>
    );
  }
  if ((revision.tags?.length ?? 0) > 0) {
    return (
      <span className={timelineMarker}>
        <Tag aria-label='Named version' className='size-3.5 text-muted-foreground' />
      </span>
    );
  }
  return (
    <span className={timelineMarker}>
      <span aria-hidden className='size-1.5 rounded-full bg-muted-foreground' />
    </span>
  );
}

const startOfDay = (time: number): number => {
  const day = new Date(time);
  return new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime();
};

/**
 * The right-hand column: the time for today and yesterday, the date before that
 * (canvas decision 4).
 *
 * @param createdAt - Milliseconds since the Unix epoch.
 * @returns `10:31 AM` or `Nov 5`, or nothing for an entry with no time.
 */
const whenOf = (createdAt: number): string => {
  if (createdAt <= 0) {
    return '';
  }
  const days = Math.round((startOfDay(Date.now()) - startOfDay(createdAt)) / 86_400_000);
  if (days <= 1) {
    return entryTime(createdAt);
  }
  const isThisYear = new Date(createdAt).getFullYear() === new Date().getFullYear();
  return new Date(createdAt).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(isThisYear ? {} : { year: 'numeric' }),
  });
};

/**
 * The open row's first fact: who and what asked for the entry, in one phrase
 * (blueprint copy table, "Details … one line"). A turn's base cut says it holds
 * the person's own edits (A5); nothing is said when nothing was recorded.
 *
 * @param revision - The entry.
 * @returns The phrase, or `undefined` for none.
 */
const entryFact = (revision: RevisionCard): string | undefined => {
  if (revision.turnCut === 'base') {
    return 'Your edits, saved before the agent started';
  }
  if (revision.actor === 'Agent') {
    return 'Agent';
  }
  if (revision.start !== undefined) {
    return startFact(revision.start);
  }
  const by = revision.actor === 'You' || (revision.actor === '' && revision.isYours === true) ? 'you' : revision.actor;
  if (isAutosave(revision)) {
    return revision.actor === '' ? 'Autosave' : `Autosave · ${revision.actor}`;
  }
  switch (revision.capture) {
    case 'switch': {
      return 'Saved before switching branch';
    }
    case 'save': {
      return by === '' ? 'Saved' : `Saved by ${by}`;
    }
    case undefined: {
      return revision.actor === '' ? undefined : revision.actor;
    }
    default: {
      return by === '' ? undefined : `By ${by}`;
    }
  }
};

/**
 * A who line as text, its parts kept apart: the agent's glyph beside `Agent`,
 * and a warning glyph beside `recorded as …` when the account that backed the
 * entry up is not the one it was recorded as (A3c). The words carry the
 * meaning; the glyphs only point at them.
 *
 * @param props - The line.
 * @returns The parts.
 */
function WhoText({ line }: { readonly line: string }): React.JSX.Element {
  return (
    <>
      {line.split(' · ').map((part, index, parts) => (
        // oxlint-disable-next-line react/no-array-index-key -- the parts of one fixed line, never reordered
        <span key={index} className='inline-flex min-w-0 items-center gap-1'>
          {part === 'Agent' ? <Bot aria-hidden className='size-3 shrink-0' /> : null}
          {part.startsWith('recorded as ') ? (
            <TriangleAlert aria-hidden className='size-3 shrink-0 text-warning' />
          ) : null}
          <span className='min-w-0'>{part}</span>
          {/* The separator ends its part, so a wrapped line starts with a fact. */}
          {index === parts.length - 1 ? null : <span aria-hidden> · </span>}
        </span>
      ))}
    </>
  );
}

export type RevisionRowProps = {
  readonly revision: RevisionCard;
  /** The row's title, from `revisionTitle`. */
  readonly title: string;
  /** The newest entry that is not Tau's own setup: it reads Current. */
  readonly isCurrent: boolean;
  /** The files are exactly at this entry, so there is nothing to restore or compare. */
  readonly isAtFiles: boolean;
  /** The branch History is showing. */
  readonly branch: string | undefined;
  /** The number a new version takes, which Create version… says (B6). */
  readonly nextVersion: number;
  readonly isOpen: boolean;
  readonly onOpenChange: (isOpen: boolean) => void;
  /** A restore is running: Restore waits. */
  readonly isBusy: boolean;
  readonly onRestore: (revisionId: string) => void;
  /** The newest row shown: the line starts at its marker. */
  readonly isFirst?: boolean;
  /** The oldest row, with nothing hidden after it: the line ends at its marker. */
  readonly isLast?: boolean;
};

/**
 * One History row (blueprint C3): at rest the whole row is one button — marker,
 * title with Current after its last word, who made it, and the time or `V3` in
 * the right-hand column. Opened it has no fill and shows the files, Restore,
 * Compare and More, and one line of facts: who, the date and time, and the ID.
 *
 * @param props - The entry, where the files are, and the row's verbs.
 * @returns The row, an item of the History list.
 */
export function RevisionRow({
  revision,
  title,
  isCurrent,
  isAtFiles,
  branch,
  nextVersion,
  isOpen,
  onOpenChange,
  isBusy,
  onRestore,
  isFirst = false,
  isLast = false,
}: RevisionRowProps): React.JSX.Element {
  const { projectId } = useProject();
  const role = useProjectRole();
  const isRevealed = useRevisionReveal(projectId) === revision.revisionId;
  const buttonRef = useRef<HTMLButtonElement>(null);
  const hintId = useId();
  const [isComparing, setIsComparing] = useState(false);
  useEffect(() => {
    if (!isRevealed) {
      return;
    }
    buttonRef.current?.scrollIntoView({ block: 'nearest' });
    buttonRef.current?.focus({ preventScroll: true });
    consumeRevisionReveal(projectId, revision.revisionId);
  }, [isRevealed, projectId, revision.revisionId]);

  const { start } = revision;
  /* M11: an entry has no number; a version shows its `V3` in the column where other rows show their time (A6, B6). */
  const version = versionOf(revision);
  const name = version === undefined ? undefined : versionLabel(version.number);
  const when = whenOf(revision.createdAt);
  /* The who-resolver decides whether a row has a who line (Q2): none on a single-person project. */
  const actor = start !== undefined || revision.actor === '' ? undefined : revision.actor;
  const canRestore = role !== 'revoked';
  const fact = entryFact(revision);
  const label = name === undefined ? (when === '' ? title : `${title} · ${when}`) : `${name} · ${title}`;
  /* A version's second line says it is one; the time the right-hand column gives other rows follows where there is room (A6). */
  const versionFact = start === undefined ? 'Version' : startFact(start);
  const TitleIcon =
    revision.restoredFrom === undefined ? (revision.capture === 'merge' ? GitMerge : undefined) : RotateCcw;

  return (
    <Collapsible
      asChild
      open={isOpen}
      onOpenChange={(next) => {
        if (!next) {
          setIsComparing(false);
        }
        onOpenChange(next);
      }}
    >
      <li className='flex flex-col'>
        <CollapsibleTrigger asChild>
          <button
            ref={buttonRef}
            type='button'
            data-revision-row={revision.revisionId}
            aria-label={label}
            className={cn(timelineRowButton, timelineRowHover)}
          >
            <span aria-hidden className={timelineGutter({ hasTop: !isFirst, hasBottom: !isLast })}>
              <RevisionMarkerGlyph revision={revision} isCurrent={isCurrent} />
            </span>
            <span className={timelineRowContent}>
              <span className='flex min-w-0 flex-1 flex-col'>
                {/* One run of text: the title wraps as words do and Current follows its last word (canvas decision 8). */}
                <span data-slot='row-title' className='min-w-0 text-sm leading-5 wrap-break-word'>
                  {TitleIcon === undefined ? null : (
                    <TitleIcon
                      aria-hidden
                      className='my-0.75 mr-1.5 inline-block size-3.5 align-top text-muted-foreground'
                    />
                  )}
                  <span
                    className={cn(
                      version !== undefined && 'font-semibold',
                      version === undefined && isAutosave(revision) && 'text-muted-foreground',
                    )}
                  >
                    {title}
                  </span>
                  {isCurrent ? (
                    <span
                      data-slot='current-pill'
                      className='my-0.5 ml-1.5 inline-flex h-4 items-center rounded-full border px-1.5 align-top text-[0.6875rem] leading-none font-medium'
                    >
                      Current
                    </span>
                  ) : null}
                </span>
                {version !== undefined || actor !== undefined ? (
                  <span
                    data-slot='row-meta'
                    className='flex min-w-0 flex-wrap items-center gap-x-1 text-xs leading-4 text-muted-foreground'
                  >
                    {version === undefined ? null : (
                      <span className='min-w-0'>
                        {versionFact}
                        {when === '' ? null : <span className='hidden @[22rem]:inline'> · {when}</span>}
                      </span>
                    )}
                    {version !== undefined && actor !== undefined ? <span aria-hidden> · </span> : null}
                    {actor === undefined ? null : <WhoText line={actor} />}
                  </span>
                ) : null}
              </span>
              <span data-slot='row-when' className='flex shrink-0 items-center gap-1.5 text-xs leading-5'>
                {name === undefined ? (
                  when === '' ? null : (
                    <time
                      dateTime={new Date(revision.createdAt).toISOString()}
                      className='whitespace-nowrap text-muted-foreground tabular-nums'
                    >
                      {when}
                    </time>
                  )
                ) : (
                  <span className='font-mono font-medium text-foreground tabular-nums'>{name}</span>
                )}
                <ChevronDown
                  aria-hidden
                  className={cn(
                    'size-3 text-muted-foreground transition-transform group-data-[state=open]/row:rotate-180 motion-reduce:transition-none',
                    /* A closed row shows its chevron on hover and keyboard focus only (canvas decision 6). */
                    !isOpen && 'opacity-0 group-hover/row:opacity-100 group-focus-visible/row:opacity-100',
                  )}
                />
              </span>
            </span>
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className={disclosureMotion}>
          <div data-slot='open-row' className={cn(timelineOpenBlock(!isLast), 'flex flex-col gap-2 pt-0.5 pb-2')}>
            {isComparing ? (
              <CurrentComparison
                revision={revision}
                onStop={() => {
                  setIsComparing(false);
                }}
              />
            ) : (
              <FileRows revision={revision} compareAgainst='parent' />
            )}
            {role === 'read' ? (
              <p className='text-xs text-muted-foreground'>
                You can view this project. Restore changes only your copy.
              </p>
            ) : null}
            <div data-slot='row-actions' className='flex flex-wrap items-center gap-2'>
              {canRestore ? (
                /* The row names the entry, so the label is the short Restore; the name keeps its object. */
                <Button
                  size='xs'
                  variant='outline'
                  aria-label={`Restore ${entryReference(revision) ?? 'this point'}`}
                  aria-describedby={isAtFiles ? hintId : undefined}
                  disabled={isBusy || isAtFiles}
                  onClick={() => {
                    onRestore(revision.revisionId);
                  }}
                >
                  <RotateCcw aria-hidden className='size-3.5' />
                  Restore
                </Button>
              ) : null}
              <Button
                size='xs'
                variant='outline'
                aria-pressed={isComparing}
                aria-describedby={isAtFiles ? hintId : undefined}
                disabled={isAtFiles}
                onClick={() => {
                  setIsComparing((current) => !current);
                }}
              >
                <GitCompare aria-hidden className='size-3.5' />
                Compare
              </Button>
              <span className='ml-auto flex'>
                <RevisionMenu revision={revision} branch={branch} nextVersion={nextVersion} />
              </span>
            </div>
            {isAtFiles ? (
              <p id={hintId} className='text-xs text-muted-foreground'>
                Your files are at this point, so there is nothing to restore or compare.
              </p>
            ) : null}
            <p
              data-slot='row-facts'
              className='flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground'
            >
              {fact === undefined ? null : (
                <span className='inline-flex min-w-0 flex-wrap items-center gap-x-1'>
                  <WhoText line={fact} />
                </span>
              )}
              {revision.createdAt > 0 ? (
                <span className='tabular-nums'>
                  {new Date(revision.createdAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                </span>
              ) : null}
              <span className='inline-flex items-center gap-1'>
                ID <code className='font-mono'>{revision.revisionId.slice(0, 7)}</code>
                {/* The glyph copies the full ID; nothing longer renders (B5). */}
                <CopyButton size='icon-xs' tooltip='Copy ID' className='-my-1' getText={() => revision.revisionId} />
              </span>
            </p>
            <RevisionDiagnostics revision={revision} />
          </div>
        </CollapsibleContent>
      </li>
    </Collapsible>
  );
}
