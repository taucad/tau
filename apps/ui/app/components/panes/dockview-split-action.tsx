import type { DockviewGroupPanel, IDockviewHeaderActionsProps } from 'dockview-react';
import { Columns2 } from 'lucide-react';
import { PiMouseLeftClick, PiMouseRightClick } from 'react-icons/pi';
import { Tooltip, TooltipContent, TooltipTrigger } from '#components/ui/tooltip.js';
import { DockviewPaneAction } from '#components/panes/dockview-pane-action.js';

/**
 * Right-side header action for Dockview groups.
 *
 * Renders a "split right" button in the tab bar that duplicates the active
 * panel into a new group to the right of the current one. Right-click to split
 * down instead. The button is visible on hover via the `.dv-pane-action` CSS
 * (opacity transition on group hover).
 */
export function DockviewSplitAction({
  containerApi,
  group,
  onDidSplit,
}: IDockviewHeaderActionsProps & {
  readonly onDidSplit?: (group: DockviewGroupPanel) => void;
}): React.JSX.Element {
  const split = (direction: 'right' | 'below'): void => {
    const createdGroup = containerApi.addGroup({ referenceGroup: group, direction });
    onDidSplit?.(createdGroup);
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <DockviewPaneAction
          aria-label='Split right'
          onClick={() => {
            split('right');
          }}
          onContextMenu={(event) => {
            event.preventDefault();
            split('below');
          }}
        >
          <Columns2 className='size-3.5' />
        </DockviewPaneAction>
      </TooltipTrigger>
      <TooltipContent side='top' sideOffset={4} className='flex flex-col gap-1'>
        <span>Split view</span>
        <span className='flex items-center gap-1 text-xs opacity-70'>
          <PiMouseLeftClick aria-hidden className='size-3.5 shrink-0' />
          Left-click to split right
        </span>
        <span className='flex items-center gap-1 text-xs opacity-70'>
          <PiMouseRightClick aria-hidden className='size-3.5 shrink-0' />
          Right-click to split down
        </span>
      </TooltipContent>
    </Tooltip>
  );
}
