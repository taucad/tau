import { cn } from '@taucad/ui/utils/cn';
import { PaneButton } from '#components/pane-button.jsx';
import type { PaneButtonProps } from '#components/pane-button.jsx';

/**
 * Codex's rounded side-panel frame, 15×14 px: split down the middle, or
 * holding the tab count. An SVG stroke rather than a CSS border: Chrome snaps
 * border widths to whole device pixels and draws small border radii coarsely,
 * while a 1 px stroke on half-pixel coordinates stays crisp and smoothly
 * rounded at every density. The odd width puts the divider on a pixel
 * boundary; `mr-px` keeps the frame on whole pixels when the 28 px button
 * centres it.
 */
const WorkbenchFrame = ({ count }: Readonly<{ count: number | undefined }>): React.JSX.Element => (
  <span aria-hidden className='relative mr-px flex items-center justify-center'>
    <svg width='15' height='14' viewBox='0 0 15 14' fill='none' stroke='currentColor' className='size-auto'>
      <rect x='0.5' y='0.5' width='14' height='13' rx='3.5' />
      {count === undefined ? <path d='M7.5 0.5v13' /> : null}
    </svg>
    {count === undefined ? null : (
      <span className='absolute inset-0 flex items-center justify-center text-[9px] leading-none font-medium tabular-nums'>
        {count > 9 ? '9+' : count}
      </span>
    )}
  </span>
);

/**
 * Props for {@link WorkbenchToggleButton}: a {@link PaneButton}'s, less what the toggle fixes (its name, pressed
 * state, tooltip, size and glyph).
 *
 * @public
 */
type WorkbenchToggleButtonProps = Omit<
  PaneButtonProps,
  'aria-label' | 'aria-pressed' | 'asChild' | 'children' | 'size' | 'tooltip'
> &
  Readonly<{
    /** Whether the workbench lane is on screen. */
    isOpen: boolean;
    /** The tabs the hidden lane holds, drawn in the frame; `undefined` draws the split frame. */
    count?: number;
  }>;

/**
 * The top-right Workbench toggle, after Codex's side-panel button: a 28 px {@link PaneButton} named "Toggle Workbench
 * lane", pressed while the lane is open, with the frame glyph and the tooltip "Toggle Workbench", as the Chat lane's toggle reads "Toggle Chat". The Tau app wraps it in its open-tabs list; the agent
 * plugin viewer's page header draws it as it is. Other props, a ref and handlers included, reach the button.
 *
 * @param props - Whether the lane is open, the hidden tab count, and the button's props.
 * @returns The toggle.
 * @public
 */
function WorkbenchToggleButton({
  isOpen,
  count,
  className,
  tooltipSide = 'left',
  ...properties
}: WorkbenchToggleButtonProps): React.JSX.Element {
  return (
    <PaneButton
      className={cn('aria-pressed:text-foreground', className)}
      aria-label='Toggle Workbench lane'
      aria-pressed={isOpen}
      tooltip='Toggle Workbench'
      tooltipSide={tooltipSide}
      {...properties}
    >
      <WorkbenchFrame count={count} />
    </PaneButton>
  );
}

export { WorkbenchToggleButton };
export type { WorkbenchToggleButtonProps };
