import { useState } from 'react';
import { Check, ChevronDown, ChevronUp, GitCompare, Pencil, RotateCcw, Tag, Undo2, X } from 'lucide-react';
import { Badge } from '@taucad/ui/components/badge';
import { Button } from '@taucad/ui/components/button';
import { Input } from '@taucad/ui/components/input';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@taucad/ui/components/collapsible';
import { Popover, PopoverContent, PopoverTrigger } from '@taucad/ui/components/popover';
import { Spinner } from '#components/ui/spinner.js';
import { DiffViewer } from '#components/code/diff-viewer.js';
import { resolveHighlightLanguageForPath } from '#lib/code-language-resolution.js';
import { FileExtensionIcon } from '#components/icons/file-extension-icon.js';
import { FileLink } from '#components/files/file-link.js';
import { cn } from '@taucad/ui/utils/cn';
import type { RevisionDiffEntry } from '@taucad/revisions';
import type { RevisionCard } from '#hooks/use-revisions.js';
import { useRevisionFileComparison } from '#hooks/use-revisions.js';

export type RevisionMarkerProps = {
  readonly revision: RevisionCard;
  /** The paths this revision changed, against its own first parent. */
  readonly changes: readonly RevisionDiffEntry[];
  /** The revision the live filesystem currently reflects — reads "Current", offers no Restore. */
  readonly isActive: boolean;
  /** The (active) revision has diverged from the live FS via a manual edit — reads "Modified", offers Discard. */
  readonly isModified: boolean;
  /** A restore is in flight — disables the actions. */
  readonly isBusy: boolean;
  /**
   * What *Compare* compares this revision's files against (S38).
   *
   * `'parent'` (the default) is "what this revision changed"; `'checkout'` is
   * "what I have changed since it", which only the row of the revision the
   * checkout sits on can ask.
   */
  readonly compareAgainst?: 'parent' | 'checkout';
  readonly onRestore: () => void;
  readonly onDiscard: () => void;
  readonly onTag?: (name: string) => Promise<void>;
  readonly onDeleteTag?: (name: string) => Promise<void>;
  readonly appearance?: 'card' | 'rail';
  readonly className?: string;
};

/** Files shown before the "Show N more" trigger collapses the rest. */
const visibleFileCount = 3;

/* Not "Modified": the card's own status badge already owns that word for the
 * checkout's divergence, and one card must not say it about two things. */
const changeLabels: Readonly<Record<RevisionDiffEntry['kind'], string>> = {
  added: 'Added',
  modified: 'Changed',
  deleted: 'Deleted',
};

/**
 * One changed file, with *Compare* on it (S38, A27).
 *
 * The link opens the file; the compare toggle expands the same Shiki
 * `DiffViewer` the chat's file cards use, over this revision and its own first
 * parent. The comparison is only asked for once a reader opens it — a card with
 * twenty files must not cost twenty tree reads to render.
 */
export function FileRow({
  file,
  revisionId,
  compareAgainst,
}: {
  readonly file: RevisionDiffEntry;
  readonly revisionId: string;
  readonly compareAgainst: 'parent' | 'checkout';
  // oxlint-disable-next-line typescript/no-restricted-types -- required by React
}): React.JSX.Element | null {
  const [isComparing, setIsComparing] = useState(false);

  return (
    <div className='flex flex-col'>
      <div className='group/file flex w-full items-center gap-2 px-3 py-1 text-muted-foreground hover:bg-muted/50'>
        <FileLink path={file.path} className='flex min-w-0 flex-1 items-center gap-2 no-underline hover:no-underline'>
          <FileExtensionIcon filename={file.path} className='size-3 shrink-0' />
          <span className='flex-1 truncate text-sm'>{file.path}</span>
        </FileLink>
        <span className='shrink-0 text-xs'>{changeLabels[file.kind]}</span>
        <Button
          size='xs'
          variant='ghost'
          aria-label={
            compareAgainst === 'checkout' ? `Compare ${file.path} with the current file` : `Compare ${file.path}`
          }
          aria-expanded={isComparing}
          className='shrink-0'
          onClick={() => {
            setIsComparing((open) => !open);
          }}
        >
          <GitCompare aria-hidden className='size-3' />
        </Button>
      </div>
      {isComparing ? <FileComparison revisionId={revisionId} path={file.path} compareAgainst={compareAgainst} /> : null}
    </div>
  );
}

function FileComparison({
  revisionId,
  path,
  compareAgainst,
}: {
  readonly revisionId: string;
  readonly path: string;
  readonly compareAgainst: 'parent' | 'checkout';
  // oxlint-disable-next-line typescript/no-restricted-types -- required by React
}): React.JSX.Element | null {
  const { original, modified, isLoading, isLoaded, error, retry } = useRevisionFileComparison(
    revisionId,
    path,
    compareAgainst === 'checkout' ? 'checkout' : undefined,
  );
  if (isLoading) {
    return (
      <div
        role='status'
        aria-label={`Comparison for ${path}`}
        aria-busy='true'
        className='flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground'
      >
        <Spinner className='size-3' /> Loading comparison…
      </div>
    );
  }
  if (error !== undefined) {
    return (
      <div
        role='alert'
        aria-label={`Comparison for ${path}`}
        className='flex flex-wrap items-center justify-between gap-2 border-t px-3 py-2 text-xs'
      >
        <span>{`Could not compare ${path}. ${error}`}</span>
        <Button size='xs' variant='outline' onClick={retry}>
          Retry
        </Button>
      </div>
    );
  }
  if (!isLoaded) {
    return null;
  }
  return (
    <DiffViewer
      originalContent={original}
      modifiedContent={modified}
      language={resolveHighlightLanguageForPath(path).shikiLanguage}
      className='border-t'
    />
  );
}

/**
 * *Name version* — an anchored, cancellable form for tagging one revision.
 *
 * Shared by the chat summary and the Revisions pane so both surfaces use one
 * verb and one form.
 */
export function RevisionNameAction({
  revisionName,
  onTag,
}: {
  /** The accessible revision name, e.g. `Revision 2`. */
  readonly revisionName: string;
  readonly onTag: (name: string) => Promise<void>;
}): React.JSX.Element {
  const [isOpen, setIsOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string>();

  return (
    <Popover
      open={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open);
        setDraft('');
        setError(undefined);
      }}
    >
      <PopoverTrigger asChild>
        <Button size='xs' variant='outline'>
          <Tag aria-hidden className='size-3' />
          Name version
        </Button>
      </PopoverTrigger>
      <PopoverContent align='start' className='w-72 max-w-[calc(100vw-2rem)] p-3'>
        <form
          className='flex flex-col gap-3'
          onSubmit={async (event) => {
            event.preventDefault();
            const tag = draft.trim();
            if (tag === '') {
              return;
            }
            try {
              await onTag(tag);
              setIsOpen(false);
              setDraft('');
            } catch (error) {
              setError(error instanceof Error ? error.message : 'Could not name this revision.');
            }
          }}
        >
          <Input
            autoFocus
            aria-label={`Name ${revisionName}`}
            value={draft}
            placeholder='e.g. Ready for prototype'
            aria-invalid={error === undefined ? undefined : true}
            onChange={(event) => {
              setDraft(event.target.value);
            }}
          />
          {error === undefined ? null : (
            <span role='alert' className='text-xs'>
              {error}
            </span>
          )}
          <div className='flex justify-end gap-2'>
            <Button
              size='xs'
              type='button'
              variant='outline'
              onClick={() => {
                setIsOpen(false);
              }}
            >
              Cancel
            </Button>
            <Button size='xs' type='submit' disabled={draft.trim() === ''}>
              Save name
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}

/**
 * The shared revision card — a Codex-style summary of one revision's changes,
 * rendered both below the assistant message (chat history) and as each row of
 * the Revisions pane. Revision status and callbacks are all injected props so
 * it stays testable without mounting a revision client; its internal state is
 * presentation-only.
 *
 * `Rev N` is the first-parent ordinal the graph answered (I3); a revision this
 * page's graph does not name on the selected branch — one a remote host
 * recorded, or one merged in from another branch — carries no number and says
 * so rather than inventing a position.
 *
 * The active revision reads "Current" and offers no Restore (restoring to where
 * you already are is a no-op); when the live FS has diverged from it via a
 * manual edit it additionally reads "Modified" and offers "Discard changes"
 * (restoring the active revision clears the divergence). Every other revision
 * offers "Restore".
 */
export function RevisionMarker({
  revision,
  changes,
  isActive,
  isModified,
  isBusy,
  compareAgainst = 'parent',
  onRestore,
  onDiscard,
  onTag,
  onDeleteTag,
  appearance = 'card',
  className,
}: RevisionMarkerProps): React.JSX.Element {
  const [showAllFiles, setShowAllFiles] = useState(false);
  const [isActionRequested, setIsActionRequested] = useState(false);
  const [previousIsBusy, setPreviousIsBusy] = useState(isBusy);
  if (previousIsBusy !== isBusy) {
    setPreviousIsBusy(isBusy);
    if (!isBusy) {
      setIsActionRequested(false);
    }
  }
  const date = new Date(revision.createdAt);
  const timestamp = date.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  const time = date.toLocaleTimeString(undefined, { timeStyle: 'short' });
  const name = revision.n === undefined ? 'Revision' : `Revision ${String(revision.n)}`;
  const shortName = revision.n === undefined ? 'Revision' : `Rev ${String(revision.n)}`;
  const visibleFiles = changes.slice(0, visibleFileCount);
  const hiddenFiles = changes.slice(visibleFileCount);

  return (
    <div
      className={cn(
        '@container flex flex-col overflow-hidden text-sm',
        appearance === 'card'
          ? 'rounded-lg border bg-background dark:bg-background/20'
          : 'rounded-none border-0 bg-transparent',
        appearance === 'card' ? 'border-border' : undefined,
        className,
      )}
    >
      <div className='flex items-center justify-between gap-2 border-b px-3 py-1'>
        <div className='flex flex-wrap items-center gap-2'>
          <span className='font-medium @[30rem]:hidden'>{shortName}</span>
          <span className='hidden font-medium @[30rem]:inline'>{name}</span>
          {isActive ? (
            <span className='flex items-center gap-1 text-xs'>
              <Check aria-hidden className='size-3' />
              Current
            </span>
          ) : (
            <Button
              size='xs'
              variant='ghost'
              disabled={isBusy}
              className='text-muted-foreground hover:text-foreground'
              aria-label={`Restore to ${name}`}
              onClick={() => {
                setIsActionRequested(true);
                onRestore();
              }}
            >
              {isActionRequested ? <Spinner className='size-3' /> : <RotateCcw className='size-3' />}
              Restore
            </Button>
          )}
          {isModified ? (
            <Badge variant='outline' className='gap-1 border-warning/30 bg-warning/10'>
              <Pencil className='text-warning' />
              Modified
            </Badge>
          ) : null}
        </div>
        <span className='shrink-0 text-xs text-muted-foreground'>
          <span className='@[22rem]:hidden'>{time}</span>
          <span className='hidden @[22rem]:inline'>{timestamp}</span>
        </span>
      </div>

      <div className='flex flex-wrap items-center gap-1.5 border-b px-3 py-1.5'>
        {(revision.tags ?? []).map((tag) => (
          <Badge key={tag} variant='secondary' className='gap-1 font-normal'>
            <Tag aria-hidden />
            {tag}
            {onDeleteTag === undefined ? null : (
              <button
                type='button'
                aria-label={`Remove version name ${tag}`}
                onClick={() => {
                  void onDeleteTag(tag);
                }}
              >
                <X aria-hidden className='size-3' />
              </button>
            )}
          </Badge>
        ))}
        {onTag === undefined ? null : <RevisionNameAction revisionName={name} onTag={onTag} />}
        {revision.trigger === 'idle' || revision.trigger === 'hidden' || revision.trigger === 'close' ? (
          <span className='ml-auto text-xs text-muted-foreground'>Autosave</span>
        ) : null}
      </div>

      <div className='flex flex-col'>
        {visibleFiles.map((file) => (
          <FileRow key={file.path} file={file} revisionId={revision.revisionId} compareAgainst={compareAgainst} />
        ))}
        {hiddenFiles.length > 0 ? (
          <Collapsible open={showAllFiles} onOpenChange={setShowAllFiles}>
            <CollapsibleContent className='flex flex-col'>
              {hiddenFiles.map((file) => (
                <FileRow key={file.path} file={file} revisionId={revision.revisionId} compareAgainst={compareAgainst} />
              ))}
            </CollapsibleContent>
            <CollapsibleTrigger asChild>
              <Button
                variant='ghost'
                size='xs'
                className='h-auto w-full justify-start gap-2 rounded-none py-1 text-sm font-normal text-muted-foreground hover:bg-muted/50 has-[>svg]:px-3'
              >
                {showAllFiles ? <ChevronUp className='size-3' /> : <ChevronDown className='size-3' />}
                {showAllFiles
                  ? 'Collapse files'
                  : `Show ${hiddenFiles.length} more file${hiddenFiles.length === 1 ? '' : 's'}`}
              </Button>
            </CollapsibleTrigger>
          </Collapsible>
        ) : null}
      </div>

      {isActive && isModified ? (
        <div className='flex flex-wrap items-center justify-between gap-2 border-t p-3'>
          <span className='flex items-center gap-1.5 text-xs'>
            <Pencil className='size-3 text-warning' />
            Unsaved editor changes
          </span>
          <Button
            size='sm'
            variant='outline'
            disabled={isBusy}
            onClick={() => {
              setIsActionRequested(true);
              onDiscard();
            }}
          >
            {isActionRequested ? <Spinner className='size-3' /> : <Undo2 className='size-3' />}
            Discard changes
          </Button>
        </div>
      ) : null}
    </div>
  );
}
