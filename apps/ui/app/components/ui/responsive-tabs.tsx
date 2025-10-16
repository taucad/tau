import type { LucideIcon } from 'lucide-react';
import { Link } from 'react-router';
import { useMemo } from 'react';
import { cn } from '#utils/ui.utils.js';
import { Tabs, TabsList, TabsTrigger, TabsContents } from '#components/ui/tabs.js';

export type ResponsiveTabItem = {
  label: string;
  href: string;
  icon: LucideIcon;
};

type ResponsiveTabsProps = {
  readonly tabs: readonly ResponsiveTabItem[];
  readonly activeTab: string;
  readonly children: React.ReactNode;
  readonly className?: string;
};

/**
 * Responsive tabs component that switches between:
 * - Mobile: horizontal orientation with flex-col layout (tabs on top, content below)
 * - Desktop: vertical orientation with flex-row layout (tabs on left, content on right)
 *
 * Uses pure CSS via Tailwind responsive utilities (no JS media queries)
 */
export function ResponsiveTabs({ tabs, activeTab, children, className }: ResponsiveTabsProps): React.JSX.Element {
  const tabsList = useMemo(() => {
    return (
      <>
        <TabsList
          className={cn(
            // Mobile: horizontal scrollable tabs with scroll shadows
            'max-md:w-full max-md:justify-start max-md:scroll-shadows-x',
            'max-md:[scrollbar-width:none]',
            // Desktop: remove scroll shadows and set width
            'md:mt-14 md:w-fit',
          )}
        >
          {tabs.map((tab) => (
            <TabsTrigger
              key={tab.label}
              asChild
              value={tab.label}
              className={cn(
                // Mobile: compact horizontal layout
                'flex-row justify-center gap-2',
                // Desktop: left-aligned with icon
                'md:justify-start',
                // Icon color
                '[&_svg]:text-muted-foreground',
              )}
            >
              <Link to={tab.href}>
                <tab.icon className="hidden md:block" />
                {tab.label}
              </Link>
            </TabsTrigger>
          ))}
        </TabsList>

        <div className="flex flex-1 flex-col gap-6">
          <h2 className="hidden text-2xl font-bold md:block">{activeTab}</h2>
          <TabsContents className={cn('h-full! w-full')}>{children}</TabsContents>
        </div>
      </>
    );
  }, [tabs, activeTab, children]);

  return (
    <>
      {/* Desktop */}
      <Tabs orientation="vertical" value={activeTab} className={cn('hidden md:flex', 'flex-row gap-6', className)}>
        {tabsList}
      </Tabs>

      {/* Mobile */}
      <Tabs orientation="horizontal" value={activeTab} className={cn('w-full md:hidden', className)}>
        {tabsList}
      </Tabs>
    </>
  );
}
