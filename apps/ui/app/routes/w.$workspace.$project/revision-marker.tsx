import { useEffect, useState } from 'react';
import { Check, ChevronDown, ChevronUp, Pencil, RotateCcw, Undo2 } from 'lucide-react';
import { Badge } from '#components/ui/badge.js';
import { Button } from '#components/ui/button.js';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '#components/ui/collapsible.js';
import { Spinner } from '#components/ui/spinner.js';
import { ChangeIndicator } from '#components/chat/change-indicator.js';
import { FileExtensionIcon } from '#components/icons/file-extension-icon.js';
import { FileLink } from '#components/files/file-link.js';
import { cn } from '#utils/ui.utils.js';
import type { Revision, RevisionFileChange } from '#lib/file-restore-timeline.js';

export type RevisionMarkerProps = {
  readonly revision: Revision;
  /** The revision the live filesystem currently reflects — reads "Current", offers no Restore. */
  readonly isActive: boolean;
  /** The (active) revision has diverged from the live FS via a manual edit — reads "Modified", offers Discard. */
  readonly isModified: boolean;
  /** A restore is in flight — disables the actions. */
  readonly isBusy: boolean;
  readonly onRestore: () => void;
  readonly onDiscard: () => void;
  readonly className?: string;
};

/** Files shown before the "Show N more" trigger collapses the rest. */
const visibleFileCount = 3;

function FileRow({ file }: { readonly file: RevisionFileChange }): React.JSX.Element {
  return (
    <FileLink
      path={file.path}
      className='flex w-full items-center gap-2 px-3 py-1 text-muted-foreground no-underline hover:bg-muted/50 hover:no-underline'
    >
      <FileExtensionIcon filename={file.path} className='size-3 shrink-0' />
      <span className='flex-1 truncate text-sm'>{file.path}</span>
      <ChangeIndicator linesAdded={file.linesAdded} linesRemoved={file.linesRemoved} />
    </FileLink>
  );
}

/**
 * The shared revision card — a Codex-style summary of one turn's changes,
 * rendered both below the assistant message (chat history) and as each row of
 * the Revisions pane. Revision status and callbacks are all injected props so
 * it stays testable without mounting the revision provider; its internal state
 * is presentation-only.
 *
 * The active revision reads "Current" and offers no Restore (restoring to where
 * you already are is a no-op); when the live FS has diverged from it via a
 * manual edit it additionally reads "Modified" and offers "Discard changes"
 * (restoring the active revision clears the divergence). Every other revision
 * offers "Restore".
 */
export function RevisionMarker({
  revision,
  isActive,
  isModified,
  isBusy,
  onRestore,
  onDiscard,
  className,
}: RevisionMarkerProps): React.JSX.Element {
  const [showAllFiles, setShowAllFiles] = useState(false);
  const [isActionRequested, setIsActionRequested] = useState(false);
  const date = new Date(revision.anchor);
  const timestamp = date.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  const time = date.toLocaleTimeString(undefined, { timeStyle: 'short' });
  const visibleFiles = revision.files.slice(0, visibleFileCount);
  const hiddenFiles = revision.files.slice(visibleFileCount);

  useEffect(() => {
    if (!isBusy) {
      setIsActionRequested(false);
    }
  }, [isBusy]);

  return (
    <div
      className={cn(
        '@container flex flex-col overflow-hidden rounded-lg border bg-background dark:bg-background/20 text-sm',
        isActive ? 'ring-primary/50 ring-2 ring-offset-2 ring-offset-background' : 'border-border',
        className,
      )}
    >
      <div className='flex items-center justify-between gap-2 border-b px-3 py-1'>
        <div className='flex flex-wrap items-center gap-2'>
          <span className='font-medium @[30rem]:hidden'>Rev {revision.n}</span>
          <span className='hidden font-medium @[30rem]:inline'>Revision {revision.n}</span>
          {isActive ? (
            <Badge variant='outline' className='gap-1 border-primary/30 bg-primary/10 text-primary'>
              <Check />
              Current
            </Badge>
          ) : (
            <Button
              size='xs'
              variant='ghost'
              disabled={isBusy}
              className='text-muted-foreground hover:text-foreground'
              aria-label={`Restore to Revision ${revision.n}`}
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
            <Badge variant='outline' className='gap-1 border-warning/30 bg-warning/10 text-warning'>
              <Pencil />
              Modified
            </Badge>
          ) : null}
        </div>
        <span className='shrink-0 text-xs text-muted-foreground'>
          <span className='@[22rem]:hidden'>{time}</span>
          <span className='hidden @[22rem]:inline'>{timestamp}</span>
        </span>
      </div>

      <div className='flex flex-col'>
        {visibleFiles.map((file) => (
          <FileRow key={file.path} file={file} />
        ))}
        {hiddenFiles.length > 0 ? (
          <Collapsible open={showAllFiles} onOpenChange={setShowAllFiles}>
            <CollapsibleContent className='flex flex-col'>
              {hiddenFiles.map((file) => (
                <FileRow key={file.path} file={file} />
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
        <div className='flex items-center justify-between gap-2 border-t p-3'>
          <span className='flex items-center gap-1.5 text-xs text-warning'>
            <Pencil className='size-3' />
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
