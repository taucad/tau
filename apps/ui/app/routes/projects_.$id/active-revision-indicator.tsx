import { History, RotateCcw } from 'lucide-react';
import { Badge } from '#components/ui/badge.js';
import { Button } from '#components/ui/button.js';
import { useRevisions } from '#hooks/use-revisions.js';
import { useRestoreToPoint } from '#hooks/use-restore-to-point.js';
import { useRevisionPane } from '#routes/projects_.$id/revision-pane-context.js';

/**
 * Always-on top-bar chip (`handle.actions()` slot) — the source of truth for
 * the active Revision when the bubble is off-screen (RV3) or nonexistent (RV4).
 * Doubles as "Return to latest" (one-click redo) when not at the tip. Hidden
 * until the project has at least one Revision.
 */
export function RevisionChip(): React.JSX.Element | undefined {
  const { headRevision, maxRevision, isDirty, canReturnToLatest } = useRevisions();
  const { returnToLatest, isBusy } = useRestoreToPoint();
  const { toggle } = useRevisionPane();

  if (maxRevision === 0) {
    return undefined;
  }

  return (
    <div className='flex items-center gap-1'>
      <button type='button' onClick={toggle} aria-label='Open revision history' className='cursor-pointer'>
        <Badge variant='outline' className='gap-1 font-normal'>
          <History className='size-3' />
          {headRevision ? `Revision ${headRevision.n} / ${maxRevision}` : 'Revision 0 · baseline'}
          {isDirty ? ' · modified' : ''}
        </Badge>
      </button>
      {canReturnToLatest ? (
        <Button size='xs' variant='ghost' className='h-6 gap-1 px-1.5' disabled={isBusy} onClick={returnToLatest}>
          <RotateCcw className='size-3' />
          Return to latest
        </Button>
      ) : null}
    </div>
  );
}
