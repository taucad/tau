import { ChevronDown } from 'lucide-react';
import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { PaneviewPanelApi } from 'dockview-react';
import { cn } from '@taucad/ui/utils/cn';
import { Tooltip, TooltipContent, TooltipTrigger } from '@taucad/ui/components/tooltip';

const defaultExpandedHeight = 200;

export const paneviewHeaderSize = 40;

/**
 * Shared CSS variable overrides for PaneviewReact containers.
 *
 * Removes Paneview's full-width header separator and configures sash (resize
 * handle) appearance to match the Allotment sash pattern used in the main
 * editor layout.
 */
export const paneviewStyleOverrides = cn(
  'h-full',
  '[--dv-paneview-header-border-color:transparent]',
  '[--dv-paneview-active-outline-color:transparent]',
  '[--dv-sash-color:transparent]',
  '[--dv-active-sash-color:var(--primary)]',
  '[--dv-active-sash-transition-duration:0.1s]',
  '[--dv-active-sash-transition-delay:0.5s]',
  '[&_.dv-split-view-container.dv-vertical_>_.dv-sash-container_>_.dv-sash.dv-enabled]:!cursor-row-resize',
  '[&_.dv-split-view-container.dv-vertical_>_.dv-sash-container_>_.dv-sash.dv-maximum]:!cursor-row-resize',
  '[&_.dv-split-view-container.dv-vertical_>_.dv-sash-container_>_.dv-sash.dv-minimum]:!cursor-row-resize',
);

/** Paneview layout overrides for headers visually attached to bordered panel bodies. */
export const paneviewAttachedSurfaceStyleOverrides = cn(
  paneviewStyleOverrides,
  '[&_.dv-pane-body]:overflow-y-hidden! [&_.dv-pane-body]:px-2! [&_.dv-pane-body]:pb-2!',
  '[&_[data-slot=paneview-header]]:mt-2! [&_[data-slot=paneview-header]]:mb-0!',
  '[&_[data-slot=paneview-header][data-state=open]]:rounded-b-none!',
  '[&_[data-slot=paneview-header][data-state=open]]:border-b-0!',
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
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const frameworkHeader = rootRef.current?.closest<HTMLElement>('.dv-pane-header');
    if (!frameworkHeader) {
      return;
    }

    const previousTabIndex = frameworkHeader.getAttribute('tabindex');
    frameworkHeader.tabIndex = -1;

    return () => {
      if (frameworkHeader.tabIndex !== -1) {
        return;
      }
      if (previousTabIndex === null) {
        frameworkHeader.removeAttribute('tabindex');
        return;
      }
      frameworkHeader.setAttribute('tabindex', previousTabIndex);
    };
  }, []);

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
        ref={rootRef}
        data-slot='paneview-header'
        data-state={expanded ? 'open' : 'closed'}
        className={cn(
          'group/paneview-header mx-2 my-1 flex h-8 min-w-0 items-center overflow-hidden rounded-lg border border-transparent bg-transparent pr-1 text-[13px] select-none',
          'transition-colors duration-150 hover:bg-accent data-[state=open]:border-border data-[state=open]:bg-card data-[state=open]:hover:bg-accent motion-reduce:transition-none',
        )}
      >
        <button
          type='button'
          aria-expanded={expanded}
          aria-label={title === undefined ? 'Toggle panel' : undefined}
          draggable
          className='flex h-full min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-lg px-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset'
          onClick={handleClick}
        >
          <ChevronDown
            className={cn(
              'size-4 shrink-0 text-muted-foreground transition-transform duration-150 ease-out motion-reduce:transition-none',
              expanded && 'rotate-180',
            )}
          />
          {title === undefined ? undefined : <PaneviewHeaderTitle>{title}</PaneviewHeaderTitle>}
        </button>
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
    <span className={cn('truncate text-[13px] font-medium text-foreground', className)} dir='rtl'>
      {children}
    </span>
  );
}

/**
 * Interactive area within a paneview header that stops event propagation,
 * preventing controls from toggling or initiating a drag on the panel.
 *
 * Pushes content to the trailing edge via `ml-auto`. Accepts arbitrary div
 * attributes (e.g. `data-testid`) — internal event handlers are not
 * overridable since they own the propagation contract.
 */
export function PaneviewHeaderControls({
  children,
  className,
  ...rest
}: Omit<React.ComponentProps<'div'>, 'onClick' | 'onKeyDown' | 'onPointerDown'>): React.JSX.Element {
  return (
    <div
      {...rest}
      data-slot='paneview-header-controls'
      className={cn(
        'ml-auto flex items-center gap-1',
        '[&_button]:rounded-md [&_button]:text-muted-foreground [&_button]:transition-colors [&_button]:duration-150 [&_button]:outline-none',
        '[&_button:hover]:bg-muted-foreground/10 [&_button:hover]:text-foreground',
        '[&_button:focus-visible]:bg-muted-foreground/10 [&_button:focus-visible]:text-foreground [&_button:focus-visible]:ring-2 [&_button:focus-visible]:ring-ring',
        '[&_button[data-state=open]]:bg-muted-foreground/10 [&_button[data-state=open]]:text-foreground',
        'motion-reduce:[&_button]:transition-none',
        className,
      )}
      onPointerDown={(event) => {
        event.stopPropagation();
      }}
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

  return <div className={cn('flex items-center', className)}>{children}</div>;
}

/**
 * Compact icon button for paneview panel headers.
 *
 * Sized at 24px (`size-6`) for a compact WCAG 2.2 target. Wraps in a
 * `Tooltip` when the `tooltip` prop is provided.
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
        'flex size-6 items-center justify-center rounded-md',
        'text-muted-foreground transition-colors duration-150 motion-reduce:transition-none',
        'hover:bg-muted-foreground/10 hover:text-foreground',
        'outline-none focus-visible:ring-2 focus-visible:ring-ring',
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
  ...properties
}: React.ComponentProps<'div'>): React.JSX.Element {
  return (
    <div className={cn('flex items-center gap-1', className)} {...properties}>
      {children}
    </div>
  );
}
