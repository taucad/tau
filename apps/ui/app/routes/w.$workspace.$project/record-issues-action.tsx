import { useRef, useState } from 'react';
import { CircleAlert, Ellipsis } from 'lucide-react';
import { Button, buttonVariants } from '@taucad/ui/components/button';
import { Popover, PopoverContent, PopoverTrigger } from '@taucad/ui/components/popover';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@taucad/ui/components/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@taucad/ui/components/dropdown-menu';
import { cn } from '@taucad/ui/utils/cn';
import { PaneButton } from '#components/ui/pane-button.js';
import { useFeature } from '#flags/use-feature.js';
import { useProject } from '#hooks/use-project.js';
import { proposeEntriesCorrection } from '#workbench-records/entries-repair.js';
import type { EntriesCorrection } from '#workbench-records/entries-repair.js';
import { summarizeRecordIssues, useRecordIssues } from '#workbench-records/record-issues.js';
import type { RecordIssue, RecordIssueKind } from '#workbench-records/record-issues.js';

const kindName: Record<RecordIssueKind, string> = {
  entries: 'Model display settings',
  view: 'View settings',
  layout: 'Pane layout',
};

/** The record's name in the person's words; view records are named by the model they show. */
export const recordIssueName = (issue: Pick<RecordIssue, 'kind' | 'entry'>): string =>
  issue.kind === 'view' && issue.entry ? `${kindName.view} · ${issue.entry}` : kindName[issue.kind];

const kept: Record<RecordIssueKind, string> = {
  entries: 'The current model settings are kept',
  view: 'The current view is kept',
  layout: 'Your open panes are kept',
};
const notSaved: Record<RecordIssueKind, string> = {
  entries: 'new changes to render timeout and component visibility are not saved',
  view: 'view changes are not saved',
  layout: 'pane changes are not saved',
};

/** What is in use now and what cannot happen. */
function consequence(issue: RecordIssue, correction: EntriesCorrection | undefined): string {
  switch (issue.state) {
    case 'unconfirmed': {
      return 'Your latest change is kept here. Tau has not heard whether it reached the file, so it is not yet saved.';
    }
    case 'invalid': {
      if (correction) {
        return `${correction.renamed.map((rename) => rename.path).join(', ')} ${correction.renamed.length === 1 ? 'uses' : 'use'} an older setting name. The values loaded before are still in use; ${notSaved.entries} until the file is fixed.`;
      }
      return issue.kind === 'entries'
        ? `The file could not be read. Default settings are in use; ${notSaved.entries} until the file is fixed.`
        : `${kept[issue.kind]}. The file could not be read, so ${notSaved[issue.kind]} until it is fixed.`;
    }
    case 'newer': {
      return `${kept[issue.kind]}. ${notSaved[issue.kind].replace(/^./u, (first) => first.toUpperCase())} until this project is opened with a newer Tau.`;
    }
    case 'unavailable': {
      return `${kept[issue.kind]}. Its saved settings could not be read; try again or keep working.`;
    }
    default: {
      return `${kept[issue.kind]} while Tau reads its saved settings again.`;
    }
  }
}

/** The plain problem `Details` shows everyone; the raw message is debug-only. */
function problem(issue: RecordIssue, correction: EntriesCorrection | undefined): string {
  switch (issue.state) {
    case 'unconfirmed': {
      return 'The last change was sent, and Tau has not heard back whether it was written.';
    }
    case 'invalid': {
      return correction
        ? `${correction.renamed.map((rename) => `Entry ${rename.path}`).join(', ')}: field operationTimeout is not accepted; renderTimeout is the current name.`
        : 'The file does not match the settings format.';
    }
    case 'newer': {
      return 'The file was written by a newer version of Tau.';
    }
    default: {
      return 'Tau could not read the file.';
    }
  }
}

const resetCopy: Record<RecordIssueKind, { title: string; description: (project: string) => string }> = {
  entries: {
    title: 'Reset model display settings?',
    description: (project) =>
      `Replaces the whole file. The saved render timeout and hidden, isolated or faded components of every model in ${project} are removed. Model source, parameter values, camera and chat are not changed.`,
  },
  view: {
    title: 'Reset view settings?',
    description: () =>
      'Replaces the whole file with the view on screen now. Anything else saved in it is removed. Model source, parameter values, panes and chat are not changed.',
  },
  layout: {
    title: 'Reset pane layout?',
    description: () =>
      'Replaces the whole file with the panes open now. Anything else saved in it is removed. Model source, parameter values, views and chat are not changed.',
  },
};

/**
 * The project's settings records that need a person, in the viewer cluster after
 * the revision trigger. Renders nothing while every record is fine.
 *
 * @returns The trigger, its popover and its Reset confirmation.
 */
export function RecordIssuesAction(): React.JSX.Element {
  const { projectId, projectRef, editorRef } = useProject();
  const issues = useRecordIssues(projectId);
  const summary = summarizeRecordIssues(issues);
  const debug = useFeature('tauDebug');
  const trigger = useRef<HTMLButtonElement>(null);
  const [resetting, setResetting] = useState<RecordIssue>();
  const projectName = projectRef.getSnapshot().context.project?.name ?? 'this project';
  const name = summary
    ? `${summary.label} · ${String(summary.count)} ${summary.count === 1 ? 'record' : 'records'}`
    : '';
  // The dialog outlives the trigger: a reset that settles the last record removes the trigger, not the dialog.
  return (
    <>
      <span role='status' className='sr-only'>
        {name}
      </span>
      {summary ? (
        <RecordIssuesPopover
          summary={summary}
          issues={issues}
          name={name}
          projectName={projectName}
          isDebug={debug}
          triggerRef={trigger}
          onOpenFile={(issue) => {
            editorRef.send({ type: 'openFile', path: issue.path, source: 'user' });
          }}
          onReset={setResetting}
        />
      ) : null}
      <AlertDialog
        open={resetting !== undefined}
        onOpenChange={(value) => {
          if (!value) {
            setResetting(undefined);
          }
        }}
      >
        <AlertDialogContent
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            trigger.current?.focus();
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>{resetting ? resetCopy[resetting.kind].title : ''}</AlertDialogTitle>
            <AlertDialogDescription>
              {resetting ? resetCopy[resetting.kind].description(projectName) : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={buttonVariants({ variant: 'destructive' })}
              onClick={() => {
                // Checked against the bytes the person reviewed: a newer file writes nothing and stays listed.
                void resetting?.reset?.(resetting.bytes);
              }}
            >
              Reset settings
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/**
 * The trigger and its popover, mounted only while a record needs a person, so
 * an issue that clears and later returns never reopens the popover by itself.
 */
function RecordIssuesPopover({
  summary,
  issues,
  name,
  projectName,
  isDebug,
  triggerRef,
  onOpenFile,
  onReset,
}: {
  readonly summary: NonNullable<ReturnType<typeof summarizeRecordIssues>>;
  readonly issues: readonly RecordIssue[];
  readonly name: string;
  readonly projectName: string;
  readonly isDebug: boolean;
  readonly triggerRef: React.Ref<HTMLButtonElement>;
  readonly onOpenFile: (issue: RecordIssue) => void;
  readonly onReset: (issue: RecordIssue) => void;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const tone = summary.state === 'unconfirmed' ? 'text-feature' : 'text-warning';
  const counted = `${summary.label} · ${String(summary.count)}`;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <PaneButton
          ref={triggerRef}
          size='label'
          data-slot='record-issues-trigger'
          aria-label={name}
          tooltip={name}
          className='@max-xl/viewer:px-1.5'
        >
          <CircleAlert aria-hidden className={cn('size-3.5', tone)} />
          {/* Below `@xl/viewer` the label folds to the count, like Share and Export fold to their icons. */}
          <span className='hidden @xl/viewer:inline'>{counted}</span>
          <span className='tabular-nums @xl/viewer:hidden'>{summary.count}</span>
        </PaneButton>
      </PopoverTrigger>
      <PopoverContent
        align='end'
        aria-label={summary.label}
        className='max-h-[70dvh] w-80 max-w-[calc(100vw-2rem)] overflow-auto p-0'
      >
        <div className='px-3 pt-3 pb-2'>
          <p className='text-sm font-medium'>{summary.label}</p>
          <p className='text-xs text-muted-foreground'>
            {projectName} · {summary.count} {summary.count === 1 ? 'settings record' : 'settings records'}
          </p>
        </div>
        <ul className='divide-y border-t'>
          {issues.map((issue) => (
            <RecordIssueRow
              key={issue.path}
              issue={issue}
              isDebug={isDebug}
              onOpenFile={() => {
                setOpen(false);
                onOpenFile(issue);
              }}
              onReset={() => {
                setOpen(false);
                onReset(issue);
              }}
            />
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

function RecordIssueRow({
  issue,
  isDebug,
  onOpenFile,
  onReset,
}: {
  readonly issue: RecordIssue;
  readonly isDebug: boolean;
  readonly onOpenFile: () => void;
  readonly onReset: () => void;
}): React.JSX.Element {
  const correction =
    issue.kind === 'entries' && issue.state === 'invalid' && issue.bytes
      ? proposeEntriesCorrection(issue.bytes)
      : undefined;
  const [note, setNote] = useState<string>();
  const name = recordIssueName(issue);
  const firstRename = correction?.renamed[0];
  return (
    <li className='space-y-2 px-3 py-3' aria-label={name}>
      <p className='text-sm font-medium'>{name}</p>
      <p className='text-xs text-muted-foreground'>{consequence(issue, correction)}</p>
      {correction && firstRename ? (
        <p className='text-xs'>
          Change:{' '}
          {correction.renamed.map((rename, index) => (
            <span key={rename.path}>
              {index > 0 ? ', ' : null}
              <code className='font-mono'>{rename.path}</code>
            </span>
          ))}{' '}
          <code className='font-mono'>operationTimeout</code> → <code className='font-mono'>renderTimeout</code>
          {correction.renamed.length === 1 ? `, ${String(firstRename.renderTimeout)} ms kept` : ', values kept'}
          {correction.unchanged > 0
            ? `, ${String(correction.unchanged)} other ${correction.unchanged === 1 ? 'entry' : 'entries'} unchanged`
            : ''}
          .
        </p>
      ) : null}
      {note ? (
        <p role='status' className='text-xs'>
          {note}
        </p>
      ) : null}
      <div className='flex flex-wrap items-center gap-1.5'>
        {issue.state === 'unconfirmed' ? (
          <Button
            size='sm'
            variant='outline'
            onClick={() => {
              if (issue.writing) {
                setNote('Still waiting for the original write. No replacement write started.');
                return;
              }
              setNote(undefined);
              void issue.retrySave();
            }}
          >
            Retry save
          </Button>
        ) : null}
        {issue.state === 'unavailable' ? (
          <Button
            size='sm'
            variant='outline'
            onClick={() => {
              void issue.retryRead();
            }}
          >
            Try again
          </Button>
        ) : null}
        {correction && issue.repair ? (
          <Button
            size='sm'
            variant='outline'
            onClick={async () => {
              const applied = await issue.repair?.(correction.record, issue.bytes);
              setNote(applied ? undefined : 'The file changed since you reviewed it. Nothing was replaced.');
            }}
          >
            Apply correction
          </Button>
        ) : null}
        {issue.state === 'invalid' || issue.state === 'newer' ? (
          <Button size='sm' variant='outline' onClick={onOpenFile}>
            Open file
          </Button>
        ) : null}
        {issue.state === 'invalid' && issue.reset ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size='sm' variant='ghost' aria-label={`More actions for ${name}`}>
                <Ellipsis aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align='start'>
              <DropdownMenuItem onSelect={onReset}>Reset settings…</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
      <details className='text-xs'>
        <summary className='min-h-6 cursor-action rounded-sm py-1 text-muted-foreground hover:text-foreground focus-visible:focus-outline'>
          Details
        </summary>
        <dl className='mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1'>
          <dt className='text-muted-foreground'>File</dt>
          <dd className='font-mono break-all'>{issue.path}</dd>
          <dt className='text-muted-foreground'>Problem</dt>
          <dd className='break-words'>{problem(issue, correction)}</dd>
          {isDebug && issue.message ? (
            <>
              <dt className='text-muted-foreground'>Message</dt>
              <dd className='font-mono break-words'>{issue.message}</dd>
            </>
          ) : null}
        </dl>
      </details>
    </li>
  );
}
