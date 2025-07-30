import * as React from 'react';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import { motion } from 'motion/react';
import type { HTMLMotionProps, Transition } from 'motion/react';
import { cn } from '#utils/ui.js';
import { MotionHighlight, MotionHighlightItem } from '#components/animate-ui/effects/motion-highlight.js';

type TabsProps = React.ComponentProps<typeof TabsPrimitive.Root>;

function Tabs({ className, ...props }: TabsProps): React.JSX.Element {
  return <TabsPrimitive.Root data-slot="tabs" className={cn('flex flex-col gap-2', className)} {...props} />;
}

type TabsListProps = React.ComponentProps<typeof TabsPrimitive.List> & {
  readonly activeClassName?: string;
  readonly transition?: Transition;
};

const defaultTabsListTransition = {
  type: 'spring',
  stiffness: 200,
  damping: 25,
};

function TabsList({
  ref,
  children,
  className,
  activeClassName,
  transition = defaultTabsListTransition,
  ...props
}: TabsListProps): React.JSX.Element {
  // eslint-disable-next-line @typescript-eslint/no-restricted-types -- radix requires `null` ref
  const localRef = React.useRef<HTMLDivElement | null>(null);
  React.useImperativeHandle(ref, () => localRef.current!);

  const [activeValue, setActiveValue] = React.useState<string | undefined>(undefined);

  const getActiveValue = React.useCallback(() => {
    if (!localRef.current) {
      return;
    }

    const activeTab = localRef.current.querySelector<HTMLElement>('[data-state="active"]');
    if (!activeTab) {
      return;
    }

    setActiveValue(activeTab.dataset['value'] ?? undefined);
  }, []);

  React.useEffect(() => {
    getActiveValue();

    const observer = new MutationObserver(getActiveValue);

    if (localRef.current) {
      observer.observe(localRef.current, {
        attributes: true,
        childList: true,
        subtree: true,
      });
    }

    return () => {
      observer.disconnect();
    };
  }, [getActiveValue]);

  return (
    <MotionHighlight
      controlledItems
      className={cn('rounded-sm bg-background shadow-sm', activeClassName)}
      value={activeValue}
      transition={transition}
    >
      <TabsPrimitive.List
        ref={localRef}
        data-slot="tabs-list"
        className={cn(
          'inline-flex h-7 w-fit items-center justify-center rounded-sm bg-muted p-0.75 text-muted-foreground',
          className,
        )}
        {...props}
      >
        {children}
      </TabsPrimitive.List>
    </MotionHighlight>
  );
}

type TabsTriggerProps = React.ComponentProps<typeof TabsPrimitive.Trigger>;

function TabsTrigger({ className, value, ...props }: TabsTriggerProps): React.JSX.Element {
  return (
    <MotionHighlightItem value={value} className="size-full">
      <TabsPrimitive.Trigger
        data-slot="tabs-trigger"
        className={cn(
          "z-10 flex size-full cursor-pointer items-center justify-center gap-1.5 rounded-sm px-2 py-1 text-sm font-medium whitespace-nowrap text-foreground transition-[box-shadow] select-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 dark:text-muted-foreground dark:data-[state=active]:text-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
          className,
        )}
        value={value}
        {...props}
      />
    </MotionHighlightItem>
  );
}

type TabsContentProps = React.ComponentProps<typeof TabsPrimitive.Content> &
  HTMLMotionProps<'div'> & {
    readonly transition?: Transition;
    readonly enableAnimation?: boolean;
  };

const defaultTabsContentTransition = {
  duration: 0.5,
  ease: 'easeInOut',
};

function TabsContent({
  className,
  children,
  enableAnimation = true,
  transition = defaultTabsContentTransition,
  ...props
}: TabsContentProps): React.JSX.Element {
  if (!enableAnimation) {
    return (
      <TabsPrimitive.Content data-slot="tabs-content" className={cn('flex-1 outline-none', className)} {...props}>
        {children}
      </TabsPrimitive.Content>
    );
  }

  return (
    <TabsPrimitive.Content asChild {...props}>
      <motion.div
        layout
        data-slot="tabs-content"
        className={cn('flex-1 outline-none', className)}
        initial={{ opacity: 0, y: -10, filter: 'blur(4px)' }}
        animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
        exit={{ opacity: 0, y: 10, filter: 'blur(4px)' }}
        transition={transition}
        {...props}
      >
        {children}
      </motion.div>
    </TabsPrimitive.Content>
  );
}

type TabsContentsProps = HTMLMotionProps<'div'> & {
  readonly children: React.ReactNode;
  readonly className?: string;
  readonly transition?: Transition;
};

const defaultTabsContentsTransition = {
  type: 'spring',
  stiffness: 200,
  damping: 25,
};

function TabsContents({
  children,
  className,
  transition = defaultTabsContentsTransition,
  ...props
}: TabsContentsProps): React.JSX.Element {
  const containerRef = React.useRef<HTMLDivElement>(null);

  const [height, setHeight] = React.useState(0);

  React.useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    const resizeObserver = new ResizeObserver((entries) => {
      const newHeight = entries[0]?.contentRect.height;
      if (!newHeight) {
        return;
      }

      requestAnimationFrame(() => {
        setHeight(newHeight);
      });
    });

    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
    };
  }, [children]);

  React.useLayoutEffect(() => {
    if (containerRef.current) {
      const initialHeight = containerRef.current.getBoundingClientRect().height;
      setHeight(initialHeight);
    }
  }, [children]);

  return (
    <motion.div
      layout
      data-slot="tabs-contents"
      animate={{ height }}
      transition={transition}
      className={className}
      {...props}
    >
      <div ref={containerRef}>{children}</div>
    </motion.div>
  );
}

export {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  TabsContents,
  type TabsProps,
  type TabsListProps,
  type TabsTriggerProps,
  type TabsContentProps,
  type TabsContentsProps,
};
