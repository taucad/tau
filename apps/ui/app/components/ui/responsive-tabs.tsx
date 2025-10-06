import type { LucideIcon } from 'lucide-react';
import { Link } from 'react-router';
import { cn } from '#utils/ui.js';
import { Tabs, TabsList, TabsTrigger, TabsContents } from '#components/ui/tabs.js';
import { useMemo } from 'react';

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
export function ResponsiveTabs({
  tabs,
  activeTab,
  children,
  className
}: ResponsiveTabsProps): React.JSX.Element {
  const renderTabs = () => {
    return (
      <>
        <TabsList
          className={cn(
            // Mobile: horizontal scrollable tabs
            'w-full overflow-x-auto',
            'md:w-fit md:mt-14',
          )}
        >
          {tabs.map((tab) => (
            <TabsTrigger
              key={tab.label}
              asChild
              value={tab.label}
              className={cn(
                // Mobile: compact horizontal layout
                'flex-row gap-2 justify-center',
                // Desktop: left-aligned with icon
                'md:justify-start',
                // Icon color
                '[&_svg]:text-muted-foreground'
              )}
            >
              <Link to={tab.href}>
                <tab.icon className="hidden md:block" />
                {tab.label}
              </Link>
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContents
          className={cn(
            'flex-1 h-full! overflow-y-auto w-full',
          )}
        >
          <h2 className='text-2xl font-bold hidden md:block mb-6'>{activeTab}</h2>
          {children}
        </TabsContents>
      </>
    )
  }

  const tabsList = useMemo(() => renderTabs(), [tabs]);

  return (
    <>
      {/* Desktop */}
      <Tabs
        orientation="vertical"
        value={activeTab}
        className={cn(
          'hidden md:flex',
          'flex-row gap-6',
          className
        )}
      >
        {tabsList}
      </Tabs>

      {/* Mobile */}
      <Tabs
        orientation="horizontal"
        value={activeTab}
        className={cn(
          'flex md:hidden',
          className
        )}
      >
        {tabsList}
      </Tabs>
    </>
  );
}
