import * as React from 'react';
import type { LucideIcon } from 'lucide-react';
import { cva } from 'class-variance-authority';
import type { VariantProps } from 'class-variance-authority';
import { cn } from '#utils/ui.utils.js';
import { Button } from '#components/ui/button.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '#components/ui/tooltip.js';

type Side = 'left' | 'right';
type TooltipSide = 'left' | 'right' | 'top' | 'bottom';
type Align = 'start' | 'end';

const floatingPanelTriggerButtonVariants = cva(cn('text-muted-foreground hover:text-foreground'), {
  variants: {
    variant: {
      absolute: cn(
        'absolute group-data-[state=open]/floating-panel:z-10',
        'rounded-md group-data-[state=open]/floating-panel:rounded-sm',
        'size-8 group-data-[state=open]/floating-panel:size-7',
      ),
      static: '',
    },
    side: {
      left: '',
      right: '',
    },
    align: {
      start: '',
      center: '',
      end: '',
    },
  },
  compoundVariants: [
    // Left side positions
    {
      variant: 'absolute',
      side: 'left',
      align: 'start',
      class: 'top-0 ml-0.25 mt-0.25 left-0 ',
    },
    {
      variant: 'absolute',
      side: 'left',
      align: 'end',
      class: 'bottom-0 ml-0.25 mb-0.25 left-0  ',
    },
    // Right side positions
    {
      variant: 'absolute',
      side: 'right',
      align: 'start',
      class: 'top-0 mr-0.25 mt-0.25 right-0',
    },
    {
      variant: 'absolute',
      side: 'right',
      align: 'end',
      class: 'bottom-0 mr-0.25 mb-0.25 right-0 ',
    },
  ],
  defaultVariants: {
    variant: 'absolute',
    side: 'right',
    align: 'start',
  },
});

const floatingPanelContentHeaderVariants = cva(
  cn(
    'flex h-7.75 items-center justify-between',
    'border-b bg-sidebar py-0.5',
    'text-sm font-medium text-muted-foreground',
  ),
  {
    variants: {
      side: {
        left: 'pr-0.25 pl-8',
        right: 'pr-8 pl-2',
      },
    },
    defaultVariants: {
      side: 'right',
    },
  },
);

const floatingPanelIconVariants = cva(
  cn(
    'transition-transform duration-300 ease-in-out',
    '[&_svg]:transition-colors [&_svg]:duration-300',
    'group-data-[state=open]/floating-panel:[&_svg]:text-primary',
  ),
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
        data-slot="floating-panel"
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
  readonly variant?: VariantProps<typeof floatingPanelTriggerButtonVariants>['variant'];
};

function FloatingPanelTriggerButton({
  icon: Icon,
  tooltipSide,
  className,
  children,
  tooltipContent,
  onClick,
  variant = 'absolute',
}: FloatingPanelTriggerButtonProps): React.JSX.Element {
  // Get context values
  const context = React.useContext(FloatingPanelContext);
  const side = context?.side ?? 'right';
  const align = context?.align ?? 'start';

  // Default tooltip side based on panel side
  const defaultTooltipSide = (): 'left' | 'right' | 'top' | 'bottom' => {
    const defaults = {
      left: 'right' as const,
      right: 'left' as const,
    };
    return tooltipSide ?? defaults[side];
  };

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
          size="icon"
          variant={variant === 'static' ? 'overlay' : 'ghost'}
          className={cn(floatingPanelTriggerButtonVariants({ variant, side, align }), className)}
          data-slot="floating-panel-trigger"
          onClick={onClick}
        >
          <span className={floatingPanelIconVariants()}>{renderIcon()}</span>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side={defaultTooltipSide()}>{tooltipContent}</TooltipContent>
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

  return (
    <FloatingPanelTriggerButton
      icon={icon}
      tooltipSide="top"
      className={className}
      tooltipContent={tooltipContent(isOpen)}
      variant="absolute"
      onClick={close}
    >
      {children}
    </FloatingPanelTriggerButton>
  );
}

type FloatingPanelTriggerProps = {
  readonly icon: LucideIcon | React.ReactNode;
  readonly tooltipContent: React.ReactNode;
  readonly className?: string;
  readonly onClick: () => void;
  readonly children?: React.ReactNode;
  readonly tooltipSide?: TooltipSide;
  readonly variant?: VariantProps<typeof floatingPanelTriggerButtonVariants>['variant'];
};

function FloatingPanelTrigger({
  icon,
  tooltipContent,
  className,
  onClick,
  children,
  tooltipSide,
  variant = 'static',
}: FloatingPanelTriggerProps): React.JSX.Element {
  return (
    <FloatingPanelTriggerButton
      icon={icon}
      tooltipContent={tooltipContent}
      className={cn(className)}
      variant={variant}
      tooltipSide={tooltipSide}
      onClick={onClick}
    >
      {children}
    </FloatingPanelTriggerButton>
  );
}

type FloatingPanelToggleProps = {
  readonly openIcon: LucideIcon | React.ReactNode;
  readonly closeIcon: LucideIcon | React.ReactNode;
  readonly openTooltip: React.ReactNode;
  readonly closeTooltip: React.ReactNode;
  readonly className?: string;
  readonly children?: React.ReactNode;
  readonly tooltipSide?: TooltipSide;
  readonly variant?: VariantProps<typeof floatingPanelTriggerButtonVariants>['variant'];
};

function FloatingPanelToggle({
  openIcon,
  closeIcon,
  openTooltip,
  closeTooltip,
  className,
  children,
  tooltipSide,
  variant = 'absolute',
}: FloatingPanelToggleProps): React.JSX.Element {
  const { isOpen, toggle } = useFloatingPanel();

  return (
    <FloatingPanelTriggerButton
      icon={isOpen ? closeIcon : openIcon}
      tooltipContent={isOpen ? closeTooltip : openTooltip}
      className={className}
      variant={variant}
      tooltipSide={tooltipSide}
      onClick={toggle}
    >
      {children}
    </FloatingPanelTriggerButton>
  );
}

type FloatingPanelContentHeaderProps = {
  readonly children: React.ReactNode;
  readonly className?: string;
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

function FloatingPanelContent({ children, className }: FloatingPanelContentProps): React.JSX.Element {
  return (
    <div className={cn('flex size-full flex-col bg-sidebar/50', className)} data-slot="floating-panel-content">
      {children}
    </div>
  );
}

function FloatingPanelContentHeader({ children, className }: FloatingPanelContentHeaderProps): React.JSX.Element {
  const { side } = useFloatingPanel();

  return (
    <div
      className={cn(floatingPanelContentHeaderVariants({ side }), className)}
      data-slot="floating-panel-content-header"
    >
      {children}
    </div>
  );
}

function FloatingPanelContentTitle({ children, className }: FloatingPanelContentTitleProps): React.JSX.Element {
  return (
    <h2 className={cn('text-sm font-medium text-nowrap', className)} data-slot="floating-panel-content-title">
      {children}
    </h2>
  );
}

function FloatingPanelContentBody({ children, className }: FloatingPanelContentBodyProps): React.JSX.Element {
  return (
    <div className={cn('flex-1 overflow-y-auto', className)} data-slot="floating-panel-content-body">
      {children}
    </div>
  );
}

export {
  FloatingPanel,
  FloatingPanelClose,
  FloatingPanelTrigger,
  FloatingPanelToggle,
  FloatingPanelContent,
  FloatingPanelContentHeader,
  FloatingPanelContentTitle,
  FloatingPanelContentBody,
  useFloatingPanel,
};
export type { Side, Align };
