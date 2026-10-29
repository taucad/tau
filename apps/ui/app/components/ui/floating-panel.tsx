import * as React from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { AlertCircle, RefreshCcw, RotateCcw } from 'lucide-react';
import { cva } from 'class-variance-authority';
import { cn } from '@taucad/ui/utils/cn';
import { Button } from '@taucad/ui/components/button';
import { PaneButton } from '@taucad/workbench-panes/components/pane-button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@taucad/ui/components/tooltip';
import { DrawerClose, useIsInsideDrawer } from '@taucad/ui/components/drawer';
import { useIsMobile } from '@taucad/ui/hooks/use-mobile';
import { CollapsibleCodeBlock } from '#components/ui/collapsible-code-block.js';
import { reportUiError } from '#lib/error-reporting.js';
import { reactErrorDetails } from '#lib/react-root-errors.js';
import { isDesktopTarget } from '#lib/build-target.js';

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
    'flex shrink-0 items-center justify-between',
    'h-9',
    isDesktopTarget() ? '[app-region:drag] [&_button]:[app-region:no-drag]' : 'max-md:h-10',
    'border-b bg-sidebar py-0.5',
    /* The header owns the fade its title may use (`fade-label`): the row widens the mask once its
     * actions are reachable, and the actions' scrim resolves against this background. */
    'fade-row [--fade-scrim-into:var(--sidebar-background)]',
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
  /** The accessible name; pass the words the tooltip shows, so name and tooltip agree (I6). */
  readonly label?: string;
  readonly className?: string;
  readonly children?: React.ReactNode;
  readonly tooltipContent: (isOpen: boolean) => React.ReactNode;
};

function FloatingPanelClose({
  icon,
  label = 'Close panel',
  className,
  children,
  tooltipContent,
}: FloatingPanelCloseProps): React.JSX.Element {
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
      className={cn('text-muted-foreground', 'max-md:bg-background/70 max-md:backdrop-blur-lg', className)}
      aria-label={label}
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
    // SB4: one Sentry event per error, with its component stack; `onCaughtError` reporting it too is a no-op.
    void reportUiError(error, {
      ...reactErrorDetails(errorInfo),
      tags: { boundary: 'floating-panel' },
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
  return (
    <div className={cn('flex size-full flex-col bg-sidebar/50', className)} data-slot='floating-panel-content'>
      <FloatingPanelErrorBoundary fallback={fallback}>{children}</FloatingPanelErrorBoundary>
    </div>
  );
}

/** The drawer's dedicated grabber owns dragging; titles and actions remain ordinary controls. */
function FloatingPanelContentHeader({ children, className }: FloatingPanelContentHeaderProps): React.JSX.Element {
  const side = React.useContext(FloatingPanelContext)?.side ?? 'right';
  const isMobile = useIsMobile();
  const isInsideDrawer = useIsInsideDrawer();
  const headerRef = React.useRef<HTMLDivElement>(null);
  return (
    <div
      ref={headerRef}
      className={cn('relative', floatingPanelContentHeaderVariants({ side }), isMobile && 'h-10 pr-2', className)}
      data-slot='floating-panel-content-header'
      onClickCapture={(event) => {
        // A nested drawer's portaled overlay must not activate any ancestor surface. Its content (a sheet a header
        // control opened, such as the chat switcher) and a popper's content keep their own clicks.
        if (isMobile && isInsideDrawer && !headerRef.current?.contains(event.target as Node)) {
          const target = event.target as Element;
          if (!target.closest('[data-radix-popper-content-wrapper], [data-vaul-drawer]')) {
            event.stopPropagation();
          }
        }
      }}
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
  const isMobile = useIsMobile();
  return (
    <div
      className={cn(
        // `gap-1` and no inset: the same spacing the Dockview pane-action rows use.
        'flex items-center max-md:gap-1',
        /* The trailing control of a `fade-row` header: `fade-action` paints the scrim that
         * finishes a `fade-label` name's dissolve, over the row's own background. */
        'fade-action relative bg-(--fade-scrim-into)',
        'md:opacity-0',
        // Keyboard focus reveals the slot too, or a tabbed-to action is an invisible focus ring.
        'group-hover/floating-panel:opacity-100 md:focus-within:opacity-100',
        isMobile && 'gap-1 opacity-100 md:opacity-100',
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
 * Thin wrapper around the shared `PaneButton` that adds the phone shape (a
 * 32px circle with a single border) and the `floating-panel-menu-button`
 * data-slot for styling hooks.
 *
 * When rendered inside a mobile drawer, stops click and pointerDown
 * propagation at the button level so parent surfaces do not initiate
 * drag state or respond to an action click. Propagation is stopped here (not on
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
      className={cn(
        'max-md:size-8 max-md:rounded-full max-md:border max-md:bg-background max-md:shadow-xs',
        // An embedded phone surface is not a narrow viewport; `!` outranks the button's own radius there.
        isMobile && 'size-8 rounded-full! border bg-background shadow-xs',
        className,
      )}
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
 * Groups action buttons. The group draws nothing itself: on desktop the ghost buttons stand alone, and on a phone each
 * button is its own bordered circle, so a group never adds a second border around one.
 */
function FloatingPanelButtonGroup({ children, className }: FloatingPanelButtonGroupProps): React.JSX.Element {
  return (
    <div
      role='group'
      data-slot='floating-panel-button-group'
      className={cn('flex items-center max-md:gap-1', className)}
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
        <div className='flex size-12 items-center justify-center rounded-full bg-feature/10'>
          <AlertCircle className='size-6 text-feature' />
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
            className='text-left text-feature/80'
            containerClassName='w-full'
          />
        ) : errorMessage ? (
          <div className='w-full rounded-md border border-feature/20 bg-feature/5 p-3 text-left'>
            <p className='text-xs font-medium text-feature/80'>{errorMessage}</p>
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
