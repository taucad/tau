import { History, RotateCcw, XIcon } from 'lucide-react';
import {
  FloatingPanel,
  FloatingPanelClose,
  FloatingPanelContent,
  FloatingPanelContentBody,
  FloatingPanelContentHeader,
  FloatingPanelContentHeaderActions,
  FloatingPanelContentTitle,
} from '#components/ui/floating-panel.js';
import { Button } from '#components/ui/button.js';
import { EmptyItems } from '#components/ui/empty-items.js';
import { RevisionMarker } from '#routes/w.$workspace.$project/revision-marker.js';
import { useVisibleRevisions } from '#hooks/use-revisions.js';
import { useRestoreToPoint } from '#hooks/use-restore-to-point.js';

/**
 * The Revisions pane (R13) — the primary, discoverable cross-chat time-travel
 * surface. One linear list of every Revision across all project chats,
 * newest-first, with number / timestamp / changed-file summary. A row click
 * restores through the same confirm-if-risky path as the inline button; the
 * head row is highlighted and non-clickable. "Return to latest" pins the tip.
 *
 * A mobile `FloatingPanel` wrapper around the shared Workbench body.
 *
 * ponytail: baseline (Revision 0) restore and the expandable per-row DiffViewer
 * preview are deferred — the list + click-to-restore is the load-bearing R13
 * value.
 */
export function ChatRevisions({
  isExpanded = true,
  setIsExpanded,
}: {
  readonly isExpanded?: boolean;
  readonly setIsExpanded?: (value: boolean | ((current: boolean) => boolean)) => void;
}): React.JSX.Element {
  const { canReturnToLatest } = useVisibleRevisions();
  const { returnToLatest, isBusy } = useRestoreToPoint();
  return (
    <FloatingPanel isOpen={isExpanded} side='right' onOpenChange={setIsExpanded}>
      <FloatingPanelContent>
        <FloatingPanelContentHeader>
          <FloatingPanelContentTitle>Revisions</FloatingPanelContentTitle>
          <FloatingPanelContentHeaderActions>
            {canReturnToLatest ? (
              <Button size='xs' variant='ghost' className='h-6 gap-1 px-1.5' disabled={isBusy} onClick={returnToLatest}>
                <RotateCcw className='size-3' />
                Return to latest
              </Button>
            ) : null}
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

export function RevisionsPanelBody(): React.JSX.Element {
  const { revisions, headRevision, isDirty } = useVisibleRevisions();
  const { restore, isBusy } = useRestoreToPoint();

  return (
    <div data-slot='revisions-panel-body' className='size-full min-h-0 overflow-hidden bg-sidebar'>
      <div className='size-full scroll-shadows-y overflow-y-auto p-2 [--scroll-fade-end:transparent] [--scroll-fade-size:28px]'>
        {revisions.length === 0 ? (
          <EmptyItems className='m-0 min-h-full rounded-xl border-solid bg-card'>
            <div className='mb-3 rounded-xl border bg-background p-2'>
              <History className='size-5 text-muted-foreground' strokeWidth={1.5} />
            </div>
            <h3 className='mb-1 text-base font-medium text-foreground'>No revisions yet</h3>
            <p className='text-sm text-muted-foreground'>Agent changes will appear here.</p>
          </EmptyItems>
        ) : (
          <div className='flex min-h-full flex-col gap-2'>
            {[...revisions].reverse().map((revision) => {
              const isActive = headRevision?.n === revision.n;
              const restoreThis = (): void => {
                restore({ messageId: revision.messageId, anchor: revision.anchor });
              };
              return (
                <RevisionMarker
                  key={`${revision.chatId}:${revision.messageId}`}
                  revision={revision}
                  isActive={isActive}
                  isModified={isActive && isDirty}
                  isBusy={isBusy}
                  onRestore={restoreThis}
                  onDiscard={restoreThis}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
