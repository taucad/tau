import * as React from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '#utils/ui.js';
import { Button } from '#components/ui/button.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '#components/ui/tooltip.js';

type FloatingPanelContextValue = {
  readonly isOpen: boolean;
  readonly toggle: () => void;
  readonly open: () => void;
  readonly close: () => void;
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
  readonly open?: boolean;
  readonly defaultOpen?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
  readonly className?: string;
};

function FloatingPanel({ children, open, defaultOpen = false, onOpenChange, className }: FloatingPanelProps): React.JSX.Element {
  const [internalOpen, setInternalOpen] = React.useState(defaultOpen);

  const isControlled = open !== undefined;
  const isOpen = isControlled ? open : internalOpen;

  const handleOpenChange = React.useCallback(
    (newOpen: boolean) => {
      if (!isControlled) {
        setInternalOpen(newOpen);
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
    }),
    [isOpen, toggle, openPanel, closePanel],
  );

  // Extract side, align, and sizing props from children
  const triggerChild = React.Children.toArray(children).find(
    (child): child is React.ReactElement<FloatingPanelTriggerButtonProps> =>
      React.isValidElement(child) && (child as any).type === FloatingPanelClose
  );

  const side = triggerChild?.props.side || 'right';
  const align = triggerChild?.props.align || 'start';

  // Calculate origin classes based on side and align
  const getOriginClass = (): string => {
    const origins: Record<Side, Record<Align, string>> = {
      left: {
        start: 'origin-top-left',
        center: 'origin-center-left',
        end: 'origin-bottom-left',
      },
      right: {
        start: 'origin-top-right',
        center: 'origin-center-right',
        end: 'origin-bottom-right',
      },
    };
    return origins[side as Side][align as Align];
  };

  return (
    <FloatingPanelContext.Provider value={contextValue}>
      <div
        className={cn(
          'group relative overflow-hidden bg-sidebar border h-full rounded-md',
          'transition-all duration-300 ease-in-out',
          // Size and shape transitions
          'size-8',
          'data-[state=open]:h-[calc(100dvh-(--spacing(14)))]',
          'data-[state=open]:w-full',
          'data-[state=open]:z-50',
          // Position origin
          getOriginClass(),
          className,
        )}
        data-state={isOpen ? 'open' : 'closed'}
      >
        {children}
      </div>
    </FloatingPanelContext.Provider>
  );
}

type Side = 'left' | 'right';
type Align = 'start' | 'center' | 'end';

type FloatingPanelTriggerButtonProps = {
  readonly side?: Side;
  readonly align?: Align;
  readonly icon: LucideIcon;
  readonly tooltipSide?: 'left' | 'right' | 'top' | 'bottom';
  readonly className?: string;
  readonly children?: React.ReactNode;
  readonly tooltipContent: React.ReactNode;
  readonly onClick: () => void;
  readonly isOpen?: boolean;
  readonly variant?: 'absolute' | 'static';
};

function FloatingPanelTriggerButton({
  side = 'right',
  align = 'start',
  icon: Icon,
  tooltipSide,
  className,
  children,
  tooltipContent,
  onClick,
  isOpen = false,
  variant = 'absolute',
}: FloatingPanelTriggerButtonProps): React.JSX.Element {
  // Calculate positioning classes based on side and align (only for absolute variant)
  const getPositionClasses = () => {
    if (variant === 'static') return '';

    const positions = {
      left: {
        start: '-top-0.25 -left-0.25 group-data-[state=open]:top-0.25 group-data-[state=open]:left-0.25',
        center: 'top-1/2 -translate-y-1/2 -left-0.25 group-data-[state=open]:left-0.25',
        end: '-bottom-0.25 -left-0.25 group-data-[state=open]:bottom-0.25 group-data-[state=open]:left-0.25',
      },
      right: {
        start: '-top-0.25 -right-0.25 group-data-[state=open]:top-0.25 group-data-[state=open]:right-0.25',
        center: 'top-1/2 -translate-y-1/2 -right-0.25 group-data-[state=open]:right-0.25',
        end: '-bottom-0.25 -right-0.25 group-data-[state=open]:bottom-0.25 group-data-[state=open]:right-0.25',
      },
      top: {
        start: '-top-0.25 -left-0.25 group-data-[state=open]:top-0.25 group-data-[state=open]:left-0.25',
        center: 'left-1/2 -translate-x-1/2 -top-0.25 group-data-[state=open]:top-0.25',
        end: '-top-0.25 -right-0.25 group-data-[state=open]:top-0.25 group-data-[state=open]:right-0.25',
      },
      bottom: {
        start: '-bottom-0.25 -left-0.25 group-data-[state=open]:bottom-0.25 group-data-[state=open]:left-0.25',
        center: 'left-1/2 -translate-x-1/2 -bottom-0.25 group-data-[state=open]:bottom-0.25',
        end: '-bottom-0.25 -right-0.25 group-data-[state=open]:bottom-0.25 group-data-[state=open]:right-0.25',
      },
    };
    return positions[side][align];
  };

  // Default tooltip side based on panel side
  const defaultTooltipSide = () => {
    const defaults = {
      left: 'right' as const,
      right: 'left' as const,
    };
    return tooltipSide || defaults[side];
  };

  const buttonBaseClasses = variant === 'absolute'
    ? 'absolute group-data-[state=open]:z-10 rounded-md group-data-[state=open]:rounded-sm size-8 group-data-[state=open]:size-7'
    : '';

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          size="icon"
          variant={variant === 'static' ? 'overlay' : 'ghost'}
          className={cn(
            buttonBaseClasses,
            'text-muted-foreground hover:text-foreground',
            'transition-all duration-300 ease-in-out',
            getPositionClasses(),
            className,
          )}
          onClick={onClick}
        >
          <Icon
            className={cn(
              'transition-transform duration-300 ease-in-out',
              isOpen ? 'text-primary' : '',
            )}
          />
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side={defaultTooltipSide()}>
        {tooltipContent}
      </TooltipContent>
    </Tooltip>
  );
}

type FloatingPanelCloseProps = {
  readonly side?: Side;
  readonly align?: Align;
  readonly icon: LucideIcon;
  readonly className?: string;
  readonly children?: React.ReactNode;
  readonly tooltipContent: (isOpen: boolean) => React.ReactNode;
};

function FloatingPanelClose({
  side = 'right',
  align = 'start',
  icon,
  className,
  children,
  tooltipContent,
}: FloatingPanelCloseProps): React.JSX.Element {
  const { isOpen, close } = useFloatingPanel();

  return (
    <FloatingPanelTriggerButton
      side={side}
      align={align}
      icon={icon}
      tooltipSide='top'
      className={className}
      tooltipContent={tooltipContent(isOpen)}
      onClick={close}
      isOpen={isOpen}
      variant="absolute"
    >
      {children}
    </FloatingPanelTriggerButton>
  );
}

type FloatingPanelTriggerProps = {
  readonly icon: LucideIcon;
  readonly tooltipContent: React.ReactNode;
  readonly className?: string;
  readonly onClick: () => void;
  readonly children?: React.ReactNode;
  readonly isOpen?: boolean;
  readonly tooltipSide?: 'left' | 'right' | 'top' | 'bottom';
  readonly variant?: 'absolute' | 'static';
};

function FloatingPanelTrigger({
  icon,
  tooltipContent,
  className,
  onClick,
  children,
  isOpen = false,
  tooltipSide,
  variant = 'static',
}: FloatingPanelTriggerProps): React.JSX.Element {
  return (
    <FloatingPanelTriggerButton
      icon={icon}
      tooltipContent={tooltipContent}
      className={className}
      onClick={onClick}
      variant={variant}
      isOpen={isOpen}
      tooltipSide={tooltipSide}
    >
      {children}
    </FloatingPanelTriggerButton>
  );
}

type FloatingPanelToggleProps = {
  readonly openIcon: LucideIcon;
  readonly closeIcon: LucideIcon;
  readonly openTooltip: React.ReactNode;
  readonly closeTooltip: React.ReactNode;
  readonly className?: string;
  readonly children?: React.ReactNode;
  readonly side?: Side;
  readonly align?: Align;
  readonly tooltipSide?: 'left' | 'right' | 'top' | 'bottom';
  readonly variant?: 'absolute' | 'static';
  readonly onClick?: () => void;
};

function FloatingPanelToggle({
  openIcon,
  closeIcon,
  openTooltip,
  closeTooltip,
  className,
  children,
  side = 'right',
  align = 'start',
  tooltipSide,
  variant = 'absolute',
}: FloatingPanelToggleProps): React.JSX.Element {
  const { isOpen, toggle } = useFloatingPanel();
  
  return (
    <FloatingPanelTriggerButton
      side={side}
      align={align}
      icon={isOpen ? closeIcon : openIcon}
      tooltipContent={isOpen ? closeTooltip : openTooltip}
      className={className}
      onClick={toggle}
      variant={variant}
      isOpen={isOpen}
      tooltipSide={tooltipSide}
    >
      {children}
    </FloatingPanelTriggerButton>
  );
}

type FloatingPanelContentHeaderProps = {
  readonly children: React.ReactNode;
  readonly className?: string;
  readonly side?: 'left' | 'right';
};

type FloatingPanelContentProps = {
  readonly children: React.ReactNode;
  readonly className?: string;
};

type FloatingPanelContentTitleProps = {
  readonly children: React.ReactNode;
  readonly className?: string;
};

type FloatingPanelContentBodyProps = {
  readonly children: React.ReactNode;
  readonly className?: string;
};

function FloatingPanelContent({
  children,
  className,
}: FloatingPanelContentProps): React.JSX.Element {
  const { isOpen } = useFloatingPanel();

  return (
    <div
      className={cn(
        'flex size-full flex-col',
        isOpen ? 'opacity-100 delay-200' : 'opacity-0 pointer-events-none',
        className,
      )}
    >
      {children}
    </div>
  );
}

function FloatingPanelContentHeader({
  children,
  className,
  side,
}: FloatingPanelContentHeaderProps): React.JSX.Element {
  return <div className={cn('flex text-sm text-muted-foreground font-medium h-7.75 items-center justify-between py-0.5 border-b', side === 'right' ? 'pr-8 pl-2' : 'pl-8 pr-0.25', className)}>{children}</div>;
}

function FloatingPanelContentTitle({
  children,
  className,
}: FloatingPanelContentTitleProps): React.JSX.Element {
  return <h2 className={cn('text-sm font-medium text-nowrap', className)}>{children}</h2>;
}

function FloatingPanelContentBody({
  children,
  className,
}: FloatingPanelContentBodyProps): React.JSX.Element {
  return <div className={cn('flex-1 overflow-y-auto', className)}>{children}</div>;
}

export { FloatingPanel, FloatingPanelClose, FloatingPanelTrigger, FloatingPanelToggle, FloatingPanelContent, FloatingPanelContentHeader, FloatingPanelContentTitle, FloatingPanelContentBody, useFloatingPanel };
export type { Side, Align };
