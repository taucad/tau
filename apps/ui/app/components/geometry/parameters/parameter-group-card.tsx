import type { ComponentProps, ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@taucad/ui/components/collapsible';
import { cn } from '@taucad/ui/utils/cn';
import { HighlightText } from '#components/highlight-text.js';
import { disclosureMotion } from '#components/revisions/revision-actions.js';

/**
 * The Parameters pane's group card: a header row with the title, a trailing status such as a count and a chevron
 * that turns; opening it adds the border and `bg-background`, and its body slides open.
 *
 * `ObjectFieldTemplate` in `rjsf-theme.tsx` renders every Parameters group with it; the Kinematics pane reuses it.
 */
export function ParameterGroupCard({
  title,
  searchTerm = '',
  trailing,
  isOpen,
  onOpenChange,
  isSubgroup = false,
  triggerLabel,
  headerProps,
  headerClassName,
  headerActions,
  bodyClassName,
  children,
}: {
  readonly title: string;
  /** Highlights the matching part of the title. */
  readonly searchTerm?: string;
  /** Status between the title and the chevron, such as `(12)`. */
  readonly trailing?: ReactNode;
  readonly isOpen: boolean;
  readonly onOpenChange: (isOpen: boolean) => void;
  /** A group inside a group: inset, with a muted title. */
  readonly isSubgroup?: boolean;
  /** The trigger's accessible name; defaults to `Group: <title>`. */
  readonly triggerLabel?: string;
  readonly headerProps?: Omit<ComponentProps<'div'>, 'className' | 'children'>;
  readonly headerClassName?: string;
  /** Controls beside the trigger, outside it, such as an array item's remove button. */
  readonly headerActions?: ReactNode;
  /** Layout for the body's children, such as the composite grid. */
  readonly bodyClassName?: string;
  readonly children: ReactNode;
}): React.JSX.Element {
  return (
    <Collapsible
      data-slot='parameter-group'
      open={isOpen}
      className={cn(
        'group/parameter-group w-full overflow-hidden rounded-lg border border-transparent transition-colors duration-150 data-[state=open]:border-border data-[state=open]:bg-background motion-reduce:transition-none',
        isSubgroup && 'mx-1 mt-1 w-auto',
      )}
      onOpenChange={onOpenChange}
    >
      <div
        data-slot='parameter-group-header'
        className={cn(
          'group/parameter-group-header flex items-center rounded-md transition-colors duration-150 group-data-[state=open]/parameter-group:rounded-b-none focus-within:bg-sidebar-accent hover:bg-sidebar-accent motion-reduce:transition-none',
          headerClassName,
        )}
        {...headerProps}
      >
        <CollapsibleTrigger
          className='group/collapsible flex min-h-8 min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1 text-left transition-colors duration-150 hover:bg-transparent focus-visible:focus-outline data-[state=open]:rounded-b-none motion-reduce:transition-none'
          aria-label={triggerLabel ?? `Group: ${title}`}
        >
          <h3
            className={cn(
              'min-w-0 flex-1 truncate text-sm font-medium',
              isSubgroup ? 'text-muted-foreground' : 'text-foreground',
            )}
          >
            <HighlightText text={title} searchTerm={searchTerm} />
          </h3>
          {trailing}
          <ChevronDown
            aria-hidden='true'
            className='size-4 shrink-0 text-muted-foreground transition-transform duration-150 ease-out group-data-[state=open]/collapsible:rotate-180 motion-reduce:transition-none'
          />
        </CollapsibleTrigger>
        {headerActions}
      </div>
      <CollapsibleContent data-slot='parameter-group-content' className={disclosureMotion}>
        {/* Padding sits inside the animated content, so the height animation starts without a jump. */}
        <div
          data-slot='parameter-group-body'
          className={cn('border-t border-border/70 py-1 [&>.field-group]:mx-1', bodyClassName)}
        >
          {children}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
