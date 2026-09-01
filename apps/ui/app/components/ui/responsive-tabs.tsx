import type { LucideIcon } from 'lucide-react';
import { Link } from 'react-router';
import React, { useEffect, useRef } from 'react';
import { cn } from '@taucad/ui/utils/cn';
import { Tabs, TabsList, TabsTrigger, TabsContents } from '@taucad/ui/components/tabs';
import { Separator } from '@taucad/ui/components/separator';

export type ResponsiveTabItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  group?: string;
};

type ResponsiveTabsProps = {
  readonly tabs: readonly ResponsiveTabItem[];
  readonly activeTab: string;
  readonly children: React.ReactNode;
  readonly className?: string;
  readonly tabsListClassName?: string;
  readonly contentClassName?: string;
  readonly enableContentAnimation?: boolean;
};

/**
 * Responsive tabs component that switches between:
 * - Mobile: stacked layout (tabs on top, content below) via `flex-col`
 * - Desktop: side-by-side layout (tabs on left, content on right) via `md:flex-row`
 *
 * Uses pure CSS via Tailwind responsive utilities (no JS media queries) and a
 * single Radix `Tabs` root so the active panel mounts exactly once. The Radix
 * `orientation` is fixed to `vertical` -- aria-orientation is a hint to AT, and
 * mobile screen readers handle a vertical tablist correctly even when the
 * visual layout flips horizontal.
 */
export function ResponsiveTabs({
  tabs,
  activeTab,
  children,
  className,
  tabsListClassName,
  contentClassName,
  enableContentAnimation = true,
}: ResponsiveTabsProps): React.JSX.Element {
  const tabsListRef = useRef<HTMLDivElement>(null);

  // Centre the active tab in the TabsList's own scroll viewport. We deliberately
  // use `scrollTo` on the TabsList instead of `Element.scrollIntoView` because
  // the latter walks up the ancestor chain and programmatically sets
  // `scrollLeft` on every scroll container -- including those with
  // `overflow: hidden`, which CSS treats as scrollable via JS even though they
  // are not user-scrollable. That walk shifts the dialog wrapper sideways and
  // visually drags the entire dialog content. Targeting only this ref gives an
  // unambiguous, scoped scroll.
  useEffect(() => {
    const list = tabsListRef.current;
    if (!list) {
      return;
    }
    const active = list.querySelector('[data-state="active"]');
    if (!(active instanceof HTMLElement)) {
      return;
    }
    const targetLeft = active.offsetLeft - (list.clientWidth - active.offsetWidth) / 2;
    list.scrollTo({ left: targetLeft, behavior: 'smooth' });
  }, [activeTab]);

  return (
    <Tabs
      orientation='vertical'
      value={activeTab}
      className={cn('flex h-full w-full min-w-0 flex-col md:flex-row md:gap-6', className)}
    >
      <TabsList
        ref={tabsListRef}
        className={cn(
          // Mobile: horizontal scrollable strip. The single Radix root is always
          // `orientation='vertical'`, which omits the row layout from the base
          // `TabsList` styling, so we restore it explicitly with block-level
          // `flex` -- block layout auto-fits parent content area minus margins
          // (`width: auto`), unlike `inline-flex + w-full` which over-constrains
          // when callers add horizontal margins.
          'max-md:relative max-md:flex max-md:w-auto max-md:min-h-8 max-md:justify-start',
          'max-md:scroll-shadows-x max-md:scroll-smooth max-md:[scrollbar-width:none]',
          // Desktop: vertical tab strip nudged below the dialog header
          'md:mt-14 md:w-fit',
          tabsListClassName,
        )}
      >
        {tabs.map((tab, index) => {
          const previousGroup = index > 0 ? tabs[index - 1]!.group : tab.group;
          const showDivider = index > 0 && tab.group !== previousGroup;

          return (
            <React.Fragment key={tab.label}>
              {showDivider && <Separator className='my-1 max-md:hidden' />}
              <TabsTrigger
                asChild
                value={tab.label}
                className={cn('flex-row justify-center gap-2', 'md:justify-start', '[&_svg]:text-muted-foreground')}
              >
                <Link to={tab.href}>
                  <tab.icon />
                  {tab.label}
                </Link>
              </TabsTrigger>
            </React.Fragment>
          );
        })}
      </TabsList>

      <div className={cn('flex min-h-0 min-w-0 flex-1 flex-col gap-6 overflow-y-auto [&_*]:min-w-0', contentClassName)}>
        <h2 className='hidden text-2xl font-bold md:block'>{activeTab}</h2>
        <TabsContents className='w-full' enableAnimation={enableContentAnimation}>
          {children}
        </TabsContents>
      </div>
    </Tabs>
  );
}
