import * as React from 'react';
import { createContext, useContext, useState, useCallback } from 'react';
import type { LucideIcon } from 'lucide-react';
import { ChevronRight, LoaderCircle } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@taucad/ui/components/collapsible';
import { Button } from '@taucad/ui/components/button';
import { AnimatedShinyText } from '#components/magicui/animated-shiny-text.js';
import { cn } from '@taucad/ui/utils/cn';
import { useCookie } from '#hooks/use-cookie.js';
import type { CookieName } from '#constants/cookie.constants.js';

// ============================================================================
// Context
// ============================================================================

type ChatToolCardVariant = 'card' | 'minimal';
type ChatToolCardStatus = 'loading' | 'ready' | 'error' | 'warning';

type ChatToolCardContextValue = {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  variant: ChatToolCardVariant;
  status: ChatToolCardStatus;
  isCollapsible: boolean;
};

const ChatToolCardContext = createContext<ChatToolCardContextValue | undefined>(undefined);

function useChatToolCard(): ChatToolCardContextValue {
  const context = useContext(ChatToolCardContext);
  if (!context) {
    throw new Error('ChatToolCard components must be used within a ChatToolCard');
  }

  return context;
}

// ============================================================================
// ChatToolCard (Root)
// ============================================================================

type ChatToolCardProps = {
  readonly children: React.ReactNode;
  readonly variant?: ChatToolCardVariant;
  readonly status?: ChatToolCardStatus;
  readonly isDefaultOpen?: boolean;
  readonly isOpen?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
  readonly className?: string;
  /**
   * Cookie name to read the default open state from.
   * The cookie value is only used to determine the initial state,
   * it does NOT persist the current state.
   */
  readonly cookieName?: CookieName;
  /**
   * Default value when using cookie for initial state. Defaults to true (open).
   */
  readonly isCookieDefaultOpen?: boolean;
  /**
   * When false, the card has no collapsible content and the chevron is hidden.
   * Defaults to true.
   */
  readonly isCollapsible?: boolean;
};

function ChatToolCard({
  children,
  variant = 'card',
  status = 'ready',
  isDefaultOpen: defaultOpen = true,
  isOpen: controlledIsOpen,
  onOpenChange,
  className,
  cookieName,
  isCookieDefaultOpen: cookieDefault = true,
  isCollapsible = true,
}: ChatToolCardProps): React.JSX.Element {
  // Read cookie value for initial state (if cookieName provided)
  const [cookieValue] = useCookie(cookieName ?? ('__unused' as CookieName), cookieDefault);

  // Use cookie value as default, but don't persist state changes back to cookie
  const initialOpen = cookieName ? cookieValue : defaultOpen;

  // Internal state for uncontrolled mode
  const [internalIsOpen, setInternalIsOpen] = useState(initialOpen);

  // Determine if controlled
  const isControlled = controlledIsOpen !== undefined;

  // Determine actual open state
  const isOpen = isControlled ? controlledIsOpen : internalIsOpen;

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!isControlled) {
        setInternalIsOpen(open);
      }

      onOpenChange?.(open);
    },
    [isControlled, onOpenChange],
  );

  const contextValue = React.useMemo(
    () => ({
      isOpen,
      setIsOpen: handleOpenChange,
      variant,
      status,
      isCollapsible,
    }),
    [isOpen, handleOpenChange, variant, status, isCollapsible],
  );

  return (
    <ChatToolCardContext.Provider value={contextValue}>
      <Collapsible
        open={isOpen}
        className={cn(
          'group/chat-tool-card',
          variant === 'card' && '@container/chat-tool-card my-1 overflow-hidden rounded-md border bg-neutral/10',
          className,
        )}
        data-variant={variant}
        data-status={status}
        onOpenChange={handleOpenChange}
      >
        {children}
      </Collapsible>
    </ChatToolCardContext.Provider>
  );
}

// ============================================================================
// ChatToolCardHeader
// ============================================================================

type ChatToolCardHeaderProps = {
  readonly children: React.ReactNode;
  readonly className?: string;
};

function ChatToolCardHeader({ children, className }: ChatToolCardHeaderProps): React.JSX.Element {
  const { variant, isOpen, isCollapsible } = useChatToolCard();

  if (variant === 'minimal') {
    // Minimal variant: icon (from children), text, then chevron at end (if collapsible)
    const content = (
      <>
        {children}
        {isCollapsible ? (
          <ChevronRight className={cn('size-3 shrink-0 transition-transform duration-200', isOpen && 'rotate-90')} />
        ) : undefined}
      </>
    );

    // When not collapsible, don't use trigger
    if (!isCollapsible) {
      return (
        <div
          className={cn(
            '-ml-2 inline-flex max-w-full min-w-0 items-center gap-1.5 overflow-hidden px-2 py-1 text-xs font-medium text-muted-foreground',
            className,
          )}
        >
          {content}
        </div>
      );
    }

    return (
      <CollapsibleTrigger asChild>
        <Button
          variant='ghost'
          size='xs'
          className={cn(
            'group/chat-tool-trigger -ml-2 flex w-full min-w-0 justify-start gap-1.5 overflow-hidden font-medium text-muted-foreground hover:bg-transparent hover:text-foreground dark:hover:bg-transparent',
            className,
          )}
        >
          {content}
        </Button>
      </CollapsibleTrigger>
    );
  }

  // Card variant
  if (!isCollapsible) {
    return (
      <div
        className={cn(
          'flex h-7 w-full flex-row items-center gap-1.5 pr-1 pl-2 text-xs text-muted-foreground',
          className,
        )}
      >
        {children}
      </div>
    );
  }

  return (
    <CollapsibleTrigger
      className={cn(
        'group/trigger group/chat-tool-trigger flex h-7 w-full cursor-pointer flex-row items-center gap-1.5 pr-1 pl-2 text-xs text-muted-foreground transition-colors hover:bg-foreground/5',
        className,
      )}
    >
      {/* Chevron - visible on hover */}
      <span className='relative flex size-3 items-center justify-center'>
        <ChevronRight
          className={cn(
            'absolute size-3 shrink-0 opacity-0 transition-all duration-150 group-hover/trigger:opacity-100',
            isOpen && 'rotate-90',
          )}
        />
        {/* Icon slot will be rendered here by ChatToolCardIcon */}
      </span>
      {children}
    </CollapsibleTrigger>
  );
}

// ============================================================================
// ChatToolCardIcon
// ============================================================================

type ChatToolIconTone = 'success' | 'warning' | 'destructive';

const toneClass: Record<ChatToolIconTone, string> = {
  success: 'text-success',
  warning: 'text-warning',
  destructive: 'text-destructive',
};

type ChatToolCardIconProps = {
  readonly icon: LucideIcon;
  readonly className?: string;
  /**
   * Semantic tone applied to the leading icon only. Header text and the
   * suffix chevron deliberately stay muted so the icon is the single point
   * of color in a chat-tool row.
   */
  readonly tone?: ChatToolIconTone;
};

function ChatToolCardIcon({ icon: Icon, className, tone }: ChatToolCardIconProps): React.JSX.Element {
  const { status, variant, isCollapsible } = useChatToolCard();

  if (status === 'loading') {
    return <LoaderCircle className={cn('size-3 shrink-0 animate-spin', className)} />;
  }

  const toneClassName = tone ? toneClass[tone] : undefined;

  // For card variant, this replaces the chevron when not hovering
  if (variant === 'card') {
    // When not collapsible, render static icon without hover effects
    if (!isCollapsible) {
      return <Icon className={cn('size-3 shrink-0', toneClassName, className)} />;
    }

    return (
      <Icon
        className={cn(
          'absolute size-3 shrink-0 transition-opacity duration-150 group-hover/trigger:opacity-0',
          toneClassName,
          className,
        )}
      />
    );
  }

  // For minimal variant, icon is inline at the start
  return <Icon className={cn('size-3 shrink-0', toneClassName, className)} />;
}

// ============================================================================
// ChatToolCardTitle
// ============================================================================

type ChatToolCardTitleProps = {
  readonly children: React.ReactNode;
  readonly className?: string;
};

function ChatToolCardTitle({ children, className }: ChatToolCardTitleProps): React.JSX.Element {
  const { status } = useChatToolCard();

  if (status === 'loading') {
    return (
      <AnimatedShinyText className={cn('block max-w-none min-w-0 truncate', className)}>{children}</AnimatedShinyText>
    );
  }

  return <span className={cn('block min-w-0 truncate', className)}>{children}</span>;
}

// ============================================================================
// ChatToolCardActions
// ============================================================================

type ChatToolCardActionsProps = {
  readonly children: React.ReactNode;
  readonly className?: string;
};

function ChatToolCardActions({ children, className }: ChatToolCardActionsProps): React.JSX.Element {
  return (
    <div
      className={cn(
        'ml-auto flex shrink-0 items-center gap-1',
        // Only show on hover for card variant
        'opacity-0 group-hover/chat-tool-card:opacity-100',
        className,
      )}
      onClick={(event) => {
        // Prevent triggering the collapsible when clicking actions
        event.stopPropagation();
      }}
    >
      {children}
    </div>
  );
}

// ============================================================================
// ChatToolCardContent
// ============================================================================

type ChatToolCardContentProps = {
  readonly children: React.ReactNode;
  readonly className?: string;
  /** When true, keeps content mounted (uses CSS to hide instead of unmounting) */
  readonly forceMount?: true | undefined;
};

function ChatToolCardContent({ children, className, forceMount }: ChatToolCardContentProps): React.JSX.Element {
  const { variant } = useChatToolCard();

  return (
    <CollapsibleContent
      className={cn(
        // Skip animations when forceMount is true (content is always in DOM)
        !forceMount && 'data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down',
        variant === 'card' && 'border-t',
        variant === 'minimal' && 'pl-1.5',
        className,
      )}
      forceMount={forceMount}
    >
      {children}
    </CollapsibleContent>
  );
}

// ============================================================================
// ChatToolCardList (for minimal variant)
// ============================================================================

type ChatToolCardListProps = {
  readonly children: React.ReactNode;
  readonly className?: string;
  readonly maxHeight?: string;
};

function ChatToolCardList({ children, className, maxHeight = 'max-h-40' }: ChatToolCardListProps): React.JSX.Element {
  return (
    <div className={cn('overflow-y-auto border-l border-foreground/20 pl-4', maxHeight, className)}>{children}</div>
  );
}

// ============================================================================
// ChatToolCardListItem
// ============================================================================

type ChatToolCardListItemProps = {
  readonly children: React.ReactNode;
  readonly className?: string;
  /**
   * Leading icon component. Accepts any component that renders a `className`
   * prop — `LucideIcon` for generic glyphs, or any custom icon component.
   * For icons that need to be parameterised by data (e.g. `FileExtensionIcon`
   * needs a `filename`), pass a pre-rendered node via `iconNode` instead.
   */
  readonly icon?: React.ComponentType<{ className?: string }>;
  /**
   * Pre-rendered leading icon node. Use this when the icon needs props the
   * `icon` ComponentType signature can't carry (e.g. `<FileExtensionIcon
   * filename={name} />`). Mutually exclusive with `icon`; if both are passed,
   * `iconNode` wins.
   */
  readonly iconNode?: React.ReactNode;
  readonly iconClassName?: string;
};

function ChatToolCardListItem({
  children,
  className,
  icon: Icon,
  iconNode,
  iconClassName,
}: ChatToolCardListItemProps): React.JSX.Element {
  const iconElement = iconNode ?? (Icon ? <Icon className={cn('mt-0.5 size-3 shrink-0', iconClassName)} /> : undefined);

  return (
    <div className={cn('flex items-start gap-2 py-0.5 text-xs text-muted-foreground', className)}>
      {iconElement}
      <span className='min-w-0 wrap-break-word'>{children}</span>
    </div>
  );
}

// ============================================================================
// ChatToolCardSection (nested collapsible within content)
// ============================================================================

type ChatToolCardSectionProps = {
  readonly children: React.ReactNode;
  readonly title: React.ReactNode;
  readonly icon?: LucideIcon;
  readonly isDefaultOpen?: boolean;
  readonly className?: string;
  /**
   * Cookie name to read the default open state from.
   * The cookie value is only used to determine the initial state,
   * it does NOT persist the current state.
   */
  readonly cookieName?: CookieName;
  /**
   * Default value when using cookie for initial state. Defaults to true (open).
   */
  readonly isCookieDefaultOpen?: boolean;
};

function ChatToolCardSection({
  children,
  title,
  icon: Icon,
  isDefaultOpen: defaultOpen = false,
  className,
  cookieName,
  isCookieDefaultOpen: cookieDefault = true,
}: ChatToolCardSectionProps): React.JSX.Element {
  // Read cookie value for initial state (if cookieName provided)
  const [cookieValue] = useCookie(cookieName ?? ('__unused' as CookieName), cookieDefault);

  // Use cookie value as default, but don't persist state changes back to cookie
  const initialOpen = cookieName ? cookieValue : defaultOpen;
  const [isOpen, setIsOpen] = useState(initialOpen);

  return (
    <Collapsible open={isOpen} className={cn('group/section', className)} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <Button
          variant='ghost'
          size='sm'
          className='flex h-auto w-full justify-start gap-1.5 rounded-none p-2 text-muted-foreground hover:bg-transparent'
        >
          <ChevronRight className={cn('size-3 shrink-0 transition-transform duration-200', isOpen && 'rotate-90')} />
          {Icon ? <Icon className='size-3 shrink-0' /> : undefined}
          <span className='text-left text-xs font-normal'>{title}</span>
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className='border-t'>
        <div className='p-2 text-xs'>{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
}

export {
  ChatToolCard,
  ChatToolCardHeader,
  ChatToolCardIcon,
  ChatToolCardTitle,
  ChatToolCardActions,
  ChatToolCardContent,
  ChatToolCardList,
  ChatToolCardListItem,
  ChatToolCardSection,
  useChatToolCard,
};

export type { ChatToolCardVariant, ChatToolCardStatus, ChatToolIconTone };
