import * as React from 'react';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import { useEffect, useRef, useState } from 'react';
import { cn } from '~/utils/ui.js';

function Tabs({ className, ...properties }: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return <TabsPrimitive.Root data-slot="tabs" className={cn('flex flex-col gap-2', className)} {...properties} />;
}

function TabsList({ className, ...properties }: React.ComponentProps<typeof TabsPrimitive.List>) {
  const [indicatorStyle, setIndicatorStyle] = useState({
    left: 0,
    top: 0,
    width: 0,
    height: 0,
  });

  // eslint-disable-next-line @typescript-eslint/no-restricted-types -- null is required by React
  const tabsListReference = useRef<HTMLDivElement | null>(null);

  const updateIndicator = React.useCallback(() => {
    if (!tabsListReference.current) return;

    const activeTab = tabsListReference.current.querySelector<HTMLElement>('[data-state="active"]');

    if (!activeTab) return;

    const activeRect = activeTab.getBoundingClientRect();
    const tabsRect = tabsListReference.current.getBoundingClientRect();

    requestAnimationFrame(() => {
      setIndicatorStyle({
        left: activeRect.left - tabsRect.left,
        top: activeRect.top - tabsRect.top,
        width: activeRect.width,
        height: activeRect.height,
      });
    });
  }, []);

  useEffect(() => {
    // Initial update
    const timeoutId = setTimeout(updateIndicator, 0);

    // Event listeners
    window.addEventListener('resize', updateIndicator);

    const observer = new MutationObserver(updateIndicator);
    if (tabsListReference.current) {
      observer.observe(tabsListReference.current, {
        attributes: true,
        childList: true,
        subtree: true,
      });
    }

    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('resize', updateIndicator);
      observer.disconnect();
    };
  }, [updateIndicator]);

  return (
    <div ref={tabsListReference} className="relative">
      <TabsPrimitive.List
        data-slot="tabs-list"
        className={cn(
          'inline-flex h-8 w-fit items-center justify-center rounded-md bg-muted p-[3px] text-muted-foreground',
          className,
        )}
        {...properties}
      />
      <div
        data-slot="tabs-indicator"
        className="absolute rounded-sm border border-transparent bg-background shadow-sm transition-[box-shadow,left,top,width,height] duration-300 ease-in-out dark:border-input dark:bg-input/30"
        style={indicatorStyle}
      />
    </div>
  );
}

function TabsTrigger({ className, ...properties }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        "z-10 inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-sm px-2 py-1 text-sm font-medium whitespace-nowrap text-foreground transition-[box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 dark:text-muted-foreground dark:data-[state=active]:text-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...properties}
    />
  );
}

function TabsContent({ className, ...properties }: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content data-slot="tabs-content" className={cn('flex-1 outline-none', className)} {...properties} />
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent };
