import { GitBranch } from 'lucide-react';
import { useSelector } from '@xstate/react';
import { Separator } from '#components/ui/separator.js';
import { useRevisionActor } from '#routes/projects_.$id/revision-provider.js';

/**
 * Non-destructive fork marker (R14). When editing after a back-restore
 * supersedes a tail of turns (R9), this renders a `⑂ Forked` divider so the
 * branch point is legible and the abandoned turns are accounted for rather than
 * silently vanishing. Renders nothing until a fork exists.
 *
 * ponytail: rendered as a banner above the (virtualized) message list rather
 * than inline-collapsing the superseded run between messages — the Virtuoso row
 * model makes an inline collapse risky for a Med-impact legibility marker.
 * Upgrade to inline collapse if the row model is refactored.
 */
export function ForkDivider(): React.JSX.Element | undefined {
  const actor = useRevisionActor();
  const supersededCount = useSelector(actor, (state) => state.context.supersededTurnIds.length);

  if (supersededCount === 0) {
    return undefined;
  }

  return (
    <div className='flex items-center gap-2 px-3 py-1.5 text-muted-foreground select-none'>
      <Separator className='flex-1' />
      <span className='flex items-center gap-1 text-[11px] font-medium tracking-wide'>
        <GitBranch className='size-3' />
        Forked — {supersededCount} superseded turn
        {supersededCount === 1 ? '' : 's'} hidden
      </span>
      <Separator className='flex-1' />
    </div>
  );
}
