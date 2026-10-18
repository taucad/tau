import type { LucideIcon } from 'lucide-react';
import { PaneButton } from '#components/pane-button.jsx';

/**
 * Props for {@link PaneAction}.
 *
 * @public
 */
type PaneActionProps = Readonly<{
  /** The button element, for a host that moves focus to it. */
  ref?: React.Ref<HTMLButtonElement>;
  /** The glyph before the label, drawn at 14 px. */
  icon: LucideIcon;
  /** The visible label and the button's accessible name. */
  label: string;
  /** What the tooltip says the action does. */
  tooltip: string;
  /** Runs the action, usually opening its pane. */
  onClick: () => void;
  /** Whether the action is unavailable; the button stays visible. */
  disabled?: boolean;
  /** Classes that fold the button to its 28 px icon, under the host's own container query. */
  className?: string;
  /** Classes that hide the label under the same query; without them the label always shows. */
  labelClassName?: string;
}>;

/**
 * A labelled header action that opens a workbench pane, such as Share or Export: a 28 px {@link PaneButton} with its
 * icon and label, folding to the icon where the host's classes say so. The Tau app's viewer header and the agent plugin
 * viewer's page header draw their actions with it.
 *
 * @param props - The icon, label, tooltip, click handler and fold classes.
 * @returns The action.
 * @public
 */
function PaneAction({
  ref,
  icon: Icon,
  label,
  tooltip,
  onClick,
  disabled,
  className,
  labelClassName,
}: PaneActionProps): React.JSX.Element {
  return (
    <PaneButton
      ref={ref}
      size='label'
      aria-label={label}
      tooltip={tooltip}
      disabled={disabled}
      className={className}
      onClick={onClick}
    >
      <Icon aria-hidden className='size-3.5' />
      <span className={labelClassName}>{label}</span>
    </PaneButton>
  );
}

export { PaneAction };
export type { PaneActionProps };
