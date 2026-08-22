import { History, RotateCcw, XIcon } from 'lucide-react';
import {
  FloatingPanel,
  FloatingPanelClose,
  FloatingPanelContent,
  FloatingPanelContentBody,
  FloatingPanelContentHeader,
  FloatingPanelContentHeaderActions,
  FloatingPanelContentTitle,
  FloatingPanelTrigger,
} from '#components/ui/floating-panel.js';
import { Button } from '#components/ui/button.js';
import { RevisionMarker } from '#routes/w.$workspace.$project/revision-marker.js';
import { useVisibleRevisions } from '#hooks/use-revisions.js';
import { useRestoreToPoint } from '#hooks/use-restore-to-point.js';

/** Overlay-rail trigger for the Revisions pane (R13), mirroring `ChatDetailsTrigger`. */
export function ChatRevisionsTrigger({
  isOpen,
  onToggle,
}: {
  readonly isOpen: boolean;
  readonly onToggle: () => void;
}): React.JSX.Element {
  return (
    <FloatingPanelTrigger
      icon={History}
      tooltipContent={<div className='flex items-center gap-2'>{isOpen ? 'Close' : 'Open'} Revisions</div>}
      tooltipSide='left'
      className={isOpen ? 'text-primary' : undefined}
      onClick={onToggle}
    />
  );
}

/**
 * The Revisions pane (R13) — the primary, discoverable cross-chat time-travel
 * surface. One linear list of every Revision across all project chats,
 * newest-first, with number / timestamp / changed-file summary. A row click
 * restores through the same confirm-if-risky path as the inline button; the
 * head row is highlighted and non-clickable. "Return to latest" pins the tip.
 *
 * A right-side `FloatingPanel` pane rendered inside the desktop `Allotment`
 * (`chat-interface-desktop.tsx`), following the `ChatDetails` pattern.
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
  const { revisions, headRevision, isDirty, canReturnToLatest } = useVisibleRevisions();
  const { restore, returnToLatest, isBusy } = useRestoreToPoint();

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
        <FloatingPanelContentBody className='px-2 py-2'>
          {revisions.length === 0 ? (
            <p className='p-2 text-sm text-muted-foreground'>No revisions yet — agent edits will appear here.</p>
          ) : (
            <div className='flex flex-col gap-2'>
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
        </FloatingPanelContentBody>
      </FloatingPanelContent>
    </FloatingPanel>
  );
}
