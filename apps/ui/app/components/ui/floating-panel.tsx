import * as React from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { AlertCircle, RefreshCcw, RotateCcw } from 'lucide-react';
import { cva } from 'class-variance-authority';
import { cn } from '#utils/ui.utils.js';
import { Button } from '#components/ui/button.js';
import { PaneButton } from '#components/ui/pane-button.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '#components/ui/tooltip.js';
import { DrawerClose, DrawerHandle, useIsInsideDrawer } from '#components/ui/drawer.js';
import { useIsMobile } from '#hooks/use-mobile.js';
import { CollapsibleCodeBlock } from '#components/ui/collapsible-code-block.js';
import { useAnalytics } from '#hooks/use-analytics.js';
import type { Analytics } from '#hooks/use-analytics.js';

type Side = 'left' | 'right';
type TooltipSide = 'left' | 'right' | 'top' | 'bottom';
type Align = 'start' | 'end';

const chainStopPropagation = <E extends React.SyntheticEvent>(
  handler: ((event: E) => void) | undefined,
): ((event: E) => void) => {
  return (event: E) => {
    event.stopPropagation();
    handler?.(event);
  };
};

const floatingPanelContentHeaderVariants = cva(
  cn(
    'group/floating-panel-content-header',
    'flex h-9 shrink-0 max-md:h-10 items-center justify-between',
    'border-b bg-sidebar py-0.5',
    'text-sm font-medium text-muted-foreground',
  ),
  {
    variants: {
      side: {
        left: 'pr-0.75 pl-2',
        right: 'pl-2 pr-1 max-md:pr-2',
      },
    },
    defaultVariants: {
      side: 'right',
    },
  },
);

type FloatingPanelContextValue = {
  readonly isOpen: boolean;
  readonly toggle: () => void;
  readonly open: () => void;
  readonly close: () => void;
  readonly side: Side;
  readonly align: Align;
};

const FloatingPanelContext = React.createContext<FloatingPanelContextValue | undefined>(undefined);

function useFloatingPanel(): FloatingPanelContextValue {
  const context = React.useContext(FloatingPanelContext);
  if (!context) {
    throw new Error('useFloatingPanel must be used within a FloatingPanel');
  }

  return context;
}

type FloatingPanelProps = {
  readonly children: React.ReactNode;
  readonly isOpen?: boolean;
  readonly isDefaultOpen?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
  readonly className?: string;
  readonly side?: Side;
  readonly align?: Align;
};

function FloatingPanel({
  children,
  isOpen: isOpenExternal,
  isDefaultOpen = false,
  onOpenChange,
  className,
  side = 'right',
  align = 'start',
}: FloatingPanelProps): React.JSX.Element {
  const [isInternalOpen, setIsInternalOpen] = React.useState(isDefaultOpen);

  const isControlled = isOpenExternal !== undefined;
  const isOpen = isControlled ? isOpenExternal : isInternalOpen;

  const handleOpenChange = React.useCallback(
    (newOpen: boolean) => {
      if (!isControlled) {
        setIsInternalOpen(newOpen);
      }

      onOpenChange?.(newOpen);
    },
    [isControlled, onOpenChange],
  );

  const toggle = React.useCallback(() => {
    handleOpenChange(!isOpen);
  }, [handleOpenChange, isOpen]);

  const openPanel = React.useCallback(() => {
    handleOpenChange(true);
  }, [handleOpenChange]);

  const closePanel = React.useCallback(() => {
    handleOpenChange(false);
  }, [handleOpenChange]);

  const contextValue = React.useMemo(
    () => ({
      isOpen,
      toggle,
      open: openPanel,
      close: closePanel,
      side,
      align,
    }),
    [isOpen, toggle, openPanel, closePanel, side, align],
  );

  return (
    <FloatingPanelContext.Provider value={contextValue}>
      <div
        className={cn('group/floating-panel relative size-full overflow-hidden bg-background', className)}
        data-slot='floating-panel'
        data-state={isOpen ? 'open' : 'closed'}
      >
        {children}
      </div>
    </FloatingPanelContext.Provider>
  );
}

type FloatingPanelTriggerButtonProps = {
  readonly icon: LucideIcon | React.ReactNode;
  readonly tooltipSide?: 'left' | 'right' | 'top' | 'bottom';
  readonly className?: string;
  readonly children?: React.ReactNode;
  readonly tooltipContent: React.ReactNode;
  readonly onClick: () => void;
};

function FloatingPanelTriggerButton({
  icon: Icon,
  tooltipSide,
  className,
  children,
  tooltipContent,
  onClick,
}: FloatingPanelTriggerButtonProps): React.JSX.Element {
  // Get context values
  const context = React.useContext(FloatingPanelContext);
  const side = context?.side ?? 'right';

  const defaultTooltipSide = React.useMemo(() => tooltipSide ?? side, [tooltipSide, side]);

  // Render icon based on whether it's a ReactNode or a LucideIcon component
  const renderIcon = (): React.ReactNode => {
    if (React.isValidElement(Icon)) {
      return Icon;
    }

    // If it's a LucideIcon component, create an element
    const IconComponent = Icon as LucideIcon;
    return <IconComponent />;
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          size='icon'
          variant='overlay'
          className={cn('text-muted-foreground', className)}
          data-slot='floating-panel-trigger'
          onClick={onClick}
        >
          <span className={cn('group-data-[state=open]/floating-panel:[&_svg]:text-primary')}>{renderIcon()}</span>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side={defaultTooltipSide}>{tooltipContent}</TooltipContent>
    </Tooltip>
  );
}

type FloatingPanelCloseProps = {
  readonly icon: LucideIcon | React.ReactNode;
  readonly className?: string;
  readonly children?: React.ReactNode;
  readonly tooltipContent: (isOpen: boolean) => React.ReactNode;
};

function FloatingPanelClose({ icon, className, children, tooltipContent }: FloatingPanelCloseProps): React.JSX.Element {
  const { isOpen, close } = useFloatingPanel();
  const isMobile = useIsMobile();
  const isInsideDrawer = useIsInsideDrawer();

  const renderIcon = (): React.ReactNode => {
    if (React.isValidElement(icon)) {
      return icon;
    }

    const IconComponent = icon as LucideIcon;
    return <IconComponent />;
  };

  const button = (
    <FloatingPanelMenuButton
      tooltip={tooltipContent(isOpen)}
      tooltipSide='top'
      className={cn(
        'text-muted-foreground',
        'max-md:rounded-full max-md:border max-md:bg-background/70 max-md:backdrop-blur-lg',
        className,
      )}
      aria-label='Close panel'
      onClick={close}
    >
      {renderIcon()}
      {children}
    </FloatingPanelMenuButton>
  );

  if (isMobile && isInsideDrawer) {
    return <DrawerClose asChild>{button}</DrawerClose>;
  }

  return button;
}

type FloatingPanelTriggerProps = {
  readonly icon: LucideIcon | React.ReactNode;
  readonly tooltipContent: React.ReactNode;
  readonly className?: string;
  readonly onClick: () => void;
  readonly children?: React.ReactNode;
  readonly tooltipSide?: TooltipSide;
};

function FloatingPanelTrigger({
  icon,
  tooltipContent,
  className,
  onClick,
  children,
  tooltipSide,
}: FloatingPanelTriggerProps): React.JSX.Element {
  return (
    <FloatingPanelTriggerButton
      icon={icon}
      tooltipContent={tooltipContent}
      className={cn(className)}
      tooltipSide={tooltipSide}
      onClick={onClick}
    >
      {children}
    </FloatingPanelTriggerButton>
  );
}

type FloatingPanelContentHeaderProps = {
  readonly children: React.ReactNode;
  readonly className?: string;
};

// Error fallback props passed to custom error fallback components
type FloatingPanelErrorFallbackProps = {
  readonly error: Error | undefined;
  readonly onRetry: () => void;
  readonly onReload: () => void;
};

type FloatingPanelContentProps = {
  readonly children: React.ReactNode;
  readonly className?: string;
  readonly errorFallback?: (props: FloatingPanelErrorFallbackProps) => ReactNode;
};

type FloatingPanelContentTitleProps = {
  readonly children: React.ReactNode;
  readonly className?: string;
};

type FloatingPanelContentBodyProps = {
  readonly children: React.ReactNode;
  readonly className?: string;
};

// Internal error boundary state
type FloatingPanelErrorBoundaryState = {
  hasError: boolean;
  error: Error | undefined;
};

// Internal error boundary for FloatingPanelContent
class FloatingPanelErrorBoundary extends React.Component<
  {
    readonly children: ReactNode;
    readonly analytics: Analytics;
    readonly fallback: (props: FloatingPanelErrorFallbackProps) => ReactNode;
  },
  FloatingPanelErrorBoundaryState
> {
  public static getDerivedStateFromError(error: Error): FloatingPanelErrorBoundaryState {
    return { hasError: true, error };
  }

  public override state: FloatingPanelErrorBoundaryState = {
    hasError: false,
    error: undefined,
  };

  public override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.props.analytics.captureException(error, {
      errorInfo,
      context: { component: 'FloatingPanel' },
    });
    console.error('FloatingPanel content error:', error, errorInfo);
  }

  public override render(): ReactNode {
    if (this.state.hasError) {
      return this.props.fallback({
        error: this.state.error,
        onRetry: this.handleRetry,
        onReload: this.handleReload,
      });
    }

    return this.props.children;
  }

  private readonly handleRetry = (): void => {
    this.setState({ hasError: false, error: undefined });
  };

  private readonly handleReload = (): void => {
    globalThis.location.reload();
  };
}

function FloatingPanelContent({ children, className, errorFallback }: FloatingPanelContentProps): React.JSX.Element {
  const fallback = errorFallback ?? ((props) => <FloatingPanelErrorContent {...props} />);
  const analytics = useAnalytics();
  return (
    <div className={cn('flex size-full flex-col bg-sidebar/50', className)} data-slot='floating-panel-content'>
      <FloatingPanelErrorBoundary fallback={fallback} analytics={analytics}>
        {children}
      </FloatingPanelErrorBoundary>
    </div>
  );
}

/**
 * Override vaul's `[data-vaul-handle]` base CSS which forces the Handle into a
 * tiny 32 x 5 px gray drag-indicator pill.  Vaul injects these styles outside
 * Tailwind's `@layer`, so they beat layered utilities -- we must use
 * `!important` to win.
 *
 * The inner `<span data-vaul-handle-hitarea>` is also reset from its default
 * absolute-centered positioning to a normal flex wrapper so that header
 * children (title + actions) lay out properly.
 */
const drawerHandleOverrides = cn(
  // Reset the outer handle div to a full-width flex row.
  'flex! w-full! h-10! rounded-none! opacity-100! mx-0! bg-sidebar!',
  // Reset the hitarea <span> from absolute-centered to a static flex wrapper.
  '[&>[data-vaul-handle-hitarea]]:static!',
  '[&>[data-vaul-handle-hitarea]]:inset-auto!',
  '[&>[data-vaul-handle-hitarea]]:transform-none!',
  '[&>[data-vaul-handle-hitarea]]:size-full!',
  '[&>[data-vaul-handle-hitarea]]:flex',
  '[&>[data-vaul-handle-hitarea]]:items-center',
  '[&>[data-vaul-handle-hitarea]]:justify-between',
);

function FloatingPanelContentHeader({ children, className }: FloatingPanelContentHeaderProps): React.JSX.Element {
  const { side } = useFloatingPanel();
  const isMobile = useIsMobile();
  const isInsideDrawer = useIsInsideDrawer();
  const handleRef = React.useRef<HTMLDivElement>(null);

  if (isMobile && isInsideDrawer) {
    return (
      <DrawerHandle
        ref={handleRef}
        className={cn('relative', floatingPanelContentHeaderVariants({ side }), drawerHandleOverrides, className)}
        data-slot='floating-panel-content-header'
        onClickCapture={(event: React.MouseEvent) => {
          // Portaled content (e.g. nested drawer overlays from ComboBoxResponsive)
          // lives inside the React tree but outside the real DOM subtree.
          // Prevent such clicks from reaching vaul's handleStartCycle, which
          // would cycle the parent drawer's snap points.
          // DismissableLayer (which closes the nested drawer) uses native
          // pointerdown events on the document, so stopping the React click
          // here does not interfere with it.
          if (handleRef.current && !handleRef.current.contains(event.target as Node)) {
            const target = event.target instanceof HTMLElement ? event.target : null;
            // Allow clicks on Radix portaled content (dropdown menus, popovers)
            // to reach their event handlers. Propagation from these clicks is
            // instead stopped at the DropdownMenuContent level so they never
            // reach vaul's handleStartCycle.
            if (target?.closest('[data-radix-popper-content-wrapper]')) {
              return;
            }
            event.stopPropagation();
          }
        }}
      >
        {children}
      </DrawerHandle>
    );
  }

  return (
    <div
      className={cn('relative', floatingPanelContentHeaderVariants({ side }), className)}
      data-slot='floating-panel-content-header'
    >
      {children}
    </div>
  );
}

type FloatingPanelContentHeaderActionsProps = {
  readonly children: React.ReactNode;
  readonly className?: string;
};

function FloatingPanelContentHeaderActions({
  children,
  className,
}: FloatingPanelContentHeaderActionsProps): React.JSX.Element {
  return (
    <div
      className={cn(
        'flex items-center pl-1 max-md:gap-1.5',
        'md:opacity-0 md:transition-opacity md:duration-150 md:ease-in-out',
        'group-hover/floating-panel:opacity-100',
        className,
      )}
      data-slot='floating-panel-content-header-actions'
    >
      {children}
    </div>
  );
}

type FloatingPanelMenuButtonProps = React.ComponentProps<typeof PaneButton>;

/**
 * Styled icon button for floating panel headers.
 *
 * Thin wrapper around the shared `PaneButton` that adds mobile-responsive
 * sizing (`max-md:size-8 max-md:rounded-md`) and the
 * `floating-panel-menu-button` data-slot for styling hooks.
 *
 * When rendered inside a mobile drawer, stops click and pointerDown
 * propagation at the button level so vaul's DrawerHandle doesn't cycle
 * snap points or initiate drag state. Propagation is stopped here (not on
 * the parent actions container) so that React Portal children like nested
 * drawer overlays are unaffected.
 */
function FloatingPanelMenuButton({
  className,
  onClick,
  onPointerDown,
  ...properties
}: FloatingPanelMenuButtonProps): React.JSX.Element {
  const isMobile = useIsMobile();
  const isInsideDrawer = useIsInsideDrawer();
  const isDrawerHandle = isMobile && isInsideDrawer;

  return (
    <PaneButton
      data-slot='floating-panel-menu-button'
      className={cn('max-md:size-8 max-md:rounded-md', className)}
      onClick={isDrawerHandle ? chainStopPropagation(onClick) : onClick}
      onPointerDown={isDrawerHandle ? chainStopPropagation(onPointerDown) : onPointerDown}
      {...properties}
    />
  );
}

type FloatingPanelButtonGroupProps = {
  readonly children: React.ReactNode;
  readonly className?: string;
};

/**
 * Groups action buttons into a pill-shaped bar with iOS glass styling on mobile.
 * On desktop the group is visually transparent (ghost buttons remain individually styled).
 * On mobile it renders as a frosted-glass pill.
 */
function FloatingPanelButtonGroup({ children, className }: FloatingPanelButtonGroupProps): React.JSX.Element {
  return (
    <div
      role='group'
      data-slot='floating-panel-button-group'
      className={cn(
        'flex items-center',
        'max-md:overflow-hidden max-md:rounded-full max-md:border max-md:bg-background/70 max-md:backdrop-blur-lg',
        className,
      )}
    >
      {children}
    </div>
  );
}

function FloatingPanelContentTitle({ children, className }: FloatingPanelContentTitleProps): React.JSX.Element {
  return (
    <h2 className={cn('text-sm font-medium text-nowrap', className)} data-slot='floating-panel-content-title'>
      {children}
    </h2>
  );
}

function FloatingPanelContentBody({ children, className }: FloatingPanelContentBodyProps): React.JSX.Element {
  return (
    <div className={cn('flex-1 overflow-y-auto', className)} data-slot='floating-panel-content-body'>
      {children}
    </div>
  );
}

// Default error content component for floating panels
type FloatingPanelErrorContentProps = FloatingPanelErrorFallbackProps & {
  readonly title?: string;
  readonly description?: string;
  readonly className?: string;
};

function FloatingPanelErrorContent({
  error,
  onRetry,
  onReload,
  title = 'Something went wrong',
  description,
  className,
}: FloatingPanelErrorContentProps): React.JSX.Element {
  const errorMessage = error?.message;
  const errorStack = error?.stack;
  const displayDescription =
    description ?? (errorMessage ? undefined : 'An unexpected error occurred. Please try again.');

  return (
    <div className={cn('flex h-full flex-col items-center justify-center gap-4 p-6', className)}>
      <div className='flex w-full max-w-sm flex-col items-center gap-3 text-center'>
        {/* Error Icon */}
        <div className='flex size-12 items-center justify-center rounded-full bg-destructive/10'>
          <AlertCircle className='size-6 text-destructive' />
        </div>

        {/* Error Title */}
        <h3 className='text-lg font-semibold text-foreground'>{title}</h3>

        {/* Description */}
        {displayDescription ? (
          <p className='max-w-xs text-sm text-muted-foreground'>{displayDescription}</p>
        ) : undefined}

        <p className='max-w-3xs text-sm text-pretty text-muted-foreground'>
          Our team has been notified of the error and will investigate it shortly.
        </p>

        {/* Error Details with Stack Trace */}
        {errorStack ? (
          <CollapsibleCodeBlock
            language='bash'
            title={errorMessage ?? 'Error'}
            text={errorStack}
            collapsedLineCount={3}
            className='text-left text-destructive/80'
            containerClassName='w-full'
          />
        ) : errorMessage ? (
          <div className='w-full rounded-md border border-destructive/20 bg-destructive/5 p-3 text-left'>
            <p className='text-xs font-medium text-destructive/80'>{errorMessage}</p>
          </div>
        ) : undefined}
      </div>

      {/* Action Buttons */}
      <div className='flex flex-wrap items-center justify-center gap-2'>
        <Button variant='default' size='sm' className='gap-2' onClick={onRetry}>
          <RotateCcw className='size-4' />
          Try Again
        </Button>
        <Button variant='outline' size='sm' className='gap-2' onClick={onReload}>
          <RefreshCcw className='size-4' />
          Reload Page
        </Button>
      </div>
    </div>
  );
}

export {
  FloatingPanel,
  FloatingPanelClose,
  FloatingPanelTrigger,
  FloatingPanelContent,
  FloatingPanelContentHeader,
  FloatingPanelContentHeaderActions,
  FloatingPanelMenuButton,
  FloatingPanelButtonGroup,
  FloatingPanelContentTitle,
  FloatingPanelContentBody,
  FloatingPanelErrorContent,
  useFloatingPanel,
};
export type { Side, Align, FloatingPanelErrorFallbackProps };
