import { ChevronRight } from 'lucide-react';
import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { PaneviewPanelApi } from 'dockview-react';
import { cn } from '#utils/ui.utils.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '#components/ui/tooltip.js';

const defaultExpandedHeight = 200;

/**
 * Shared CSS variable overrides for PaneviewReact containers.
 *
 * Sets the built-in `--dv-paneview-header-border-color` for a 1px separator
 * between stacked panels, and configures sash (resize handle) appearance to
 * match the Allotment sash pattern used in the main editor layout.
 */
export const paneviewStyleOverrides = cn(
  'h-full',
  '[--dv-paneview-header-border-color:var(--border)]',
  '[--dv-paneview-active-outline-color:transparent]',
  '[--dv-sash-color:transparent]',
  '[--dv-active-sash-color:var(--primary)]',
  '[--dv-active-sash-transition-duration:0.1s]',
  '[--dv-active-sash-transition-delay:0.5s]',
  '[&_.dv-split-view-container.dv-vertical_>_.dv-sash-container_>_.dv-sash.dv-enabled]:!cursor-row-resize',
  '[&_.dv-split-view-container.dv-vertical_>_.dv-sash-container_>_.dv-sash.dv-maximum]:!cursor-row-resize',
  '[&_.dv-split-view-container.dv-vertical_>_.dv-sash-container_>_.dv-sash.dv-minimum]:!cursor-row-resize',
);

type PaneviewHeaderContextValue = { expanded: boolean };

const PaneviewHeaderContext = React.createContext<PaneviewHeaderContextValue | undefined>(undefined);

function usePaneviewHeaderContext(): PaneviewHeaderContextValue {
  const context = useContext(PaneviewHeaderContext);
  if (context === undefined) {
    throw new Error('PaneviewHeader compound components must be used within a <PaneviewHeader>');
  }
  return context;
}

/**
 * Shared header component for PaneviewReact panels.
 *
 * Renders a rotating chevron indicator and toggles panel expansion on click.
 * When expanding a collapsed panel, sets a default body height so content is
 * immediately visible.
 *
 * Provides expansion state via context for compound child components.
 * When `title` is provided, renders a `PaneviewHeaderTitle` before children.
 */
export function PaneviewHeader({
  api,
  title,
  children,
}: {
  readonly api: PaneviewPanelApi;
  readonly title?: string;
  readonly children?: React.ReactNode;
}): React.JSX.Element {
  const [expanded, setExpanded] = useState(api.isExpanded);

  useEffect(() => {
    const disposable = api.onDidExpansionChange(({ isExpanded }) => {
      setExpanded(isExpanded);
    });
    return () => {
      disposable.dispose();
    };
  }, [api]);

  const handleClick = useCallback(() => {
    const next = !expanded;
    api.setExpanded(next);
    if (next) {
      api.setSize({ size: defaultExpandedHeight });
    }
  }, [api, expanded]);

  const contextValue = useMemo<PaneviewHeaderContextValue>(() => ({ expanded }), [expanded]);

  return (
    <PaneviewHeaderContext value={contextValue}>
      <div
        role='button'
        tabIndex={0}
        onClick={handleClick}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            handleClick();
          }
        }}
        className={cn(
          // Matches dockview tab styling (see `dockview-tab.tsx` /
          // `--dv-tabs-and-actions-container-*`): gap-1.5, 13px font, 2px
          // horizontal padding. `.dv-pane-header` is height-pinned by
          // `paneviewStyleOverrides`, so `h-full` resolves correctly here.
          'group/paneview-header flex h-full w-full cursor-pointer items-center gap-1.5 pl-2 text-[13px] select-none',
          expanded ? 'pr-1' : 'pr-2',
        )}
      >
        <ChevronRight
          className={cn(
            'size-3.5 shrink-0 text-muted-foreground transition-transform duration-200',
            expanded && 'rotate-90',
          )}
        />
        {title === undefined ? undefined : <PaneviewHeaderTitle>{title}</PaneviewHeaderTitle>}
        {children}
      </div>
    </PaneviewHeaderContext>
  );
}

/**
 * Styled title text for a paneview header.
 *
 * Truncates with ellipsis on the left so the filename tail (the most
 * distinguishing part of a path) stays visible when space is tight.
 */
export function PaneviewHeaderTitle({
  children,
  className,
}: {
  readonly children: React.ReactNode;
  readonly className?: string;
}): React.JSX.Element {
  return (
    <span className={cn('truncate text-[13px] text-foreground', className)} dir='rtl'>
      {children}
    </span>
  );
}

/**
 * Interactive area within a paneview header that stops event propagation,
 * preventing clicks and key events from toggling the panel.
 *
 * Pushes content to the trailing edge via `ml-auto`. Accepts arbitrary div
 * attributes (e.g. `data-testid`) — internal `onClick` / `onKeyDown` handlers
 * are not overridable since they own the propagation contract.
 */
export function PaneviewHeaderControls({
  children,
  className,
  ...rest
}: Omit<React.ComponentProps<'div'>, 'onClick' | 'onKeyDown'>): React.JSX.Element {
  return (
    <div
      {...rest}
      className={cn('ml-auto flex items-center gap-1', className)}
      onClick={(event) => {
        event.stopPropagation();
      }}
      onKeyDown={(event) => {
        event.stopPropagation();
      }}
    >
      {children}
    </div>
  );
}

/**
 * Renders children only when the parent panel is expanded.
 *
 * These are actions that operate on the panel's content — when there
 * is no content (collapsed), there are no content actions.
 */
export function PaneviewHeaderContentActions({
  children,
  className,
}: {
  readonly children: React.ReactNode;
  readonly className?: string;
}): React.JSX.Element | undefined {
  const { expanded } = usePaneviewHeaderContext();

  if (!expanded) {
    return undefined;
  }

  if (className === undefined) {
    return <div>{children}</div>;
  }

  return <div className={className}>{children}</div>;
}

/**
 * Compact icon button for paneview panel headers.
 *
 * Sized at 20px (`size-5`) to match the dockview tab close button — see
 * `dockview-tab.tsx`'s `dv-default-tab-action`. Default svg sizing is `size-3.5`
 * to match the tab's `<X className='size-3.5' />`. Wraps in a `Tooltip` when
 * the `tooltip` prop is provided.
 */
export function PaneviewHeaderAction({
  tooltip,
  tooltipSide = 'top',
  className,
  children,
  ...properties
}: React.ComponentProps<'button'> & {
  readonly tooltip?: React.ReactNode;
  readonly tooltipSide?: 'left' | 'right' | 'top' | 'bottom';
}): React.JSX.Element {
  const button = (
    <button
      type='button'
      className={cn(
        'flex size-5 items-center justify-center rounded-sm',
        'text-muted-foreground transition-colors',
        'hover:bg-accent hover:text-accent-foreground',
        'outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
        'disabled:pointer-events-none disabled:opacity-50',
        "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5",
        'shrink-0 select-none',
        className,
      )}
      {...properties}
    >
      {children}
    </button>
  );

  if (tooltip) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent side={tooltipSide}>{tooltip}</TooltipContent>
      </Tooltip>
    );
  }

  return button;
}

/**
 * Flex container for grouping trailing items (selectors, action buttons)
 * inside a `PaneviewHeader` children slot.
 */
export function PaneviewHeaderActionGroup({
  children,
  className,
}: {
  readonly children: React.ReactNode;
  readonly className?: string;
}): React.JSX.Element {
  return <div className={cn('flex items-center gap-1', className)}>{children}</div>;
}
