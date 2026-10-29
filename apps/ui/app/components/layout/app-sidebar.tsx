import * as React from 'react';
import { Link } from 'react-router';
import { ProjectNavigation } from '#components/nav/project-navigation.js';
import { NavMain } from '#components/nav/nav-main.js';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenuButton,
  SidebarTrigger,
  useSidebar,
} from '#components/ui/sidebar.js';
import { TauTextWordmark } from '#components/icons/tau-text-wordmark.js';
import { NavChat } from '#components/nav/nav-chat.js';
import { navRoutes } from '#constants/route.constants.js';
import { useFeatureFlags } from '#flags/use-feature.js';
import { Commands } from '#components/layout/command-palette.js';
import { BrowserUpdate } from '#components/nav/browser-update.js';
import { DesktopUpdate } from '#components/nav/desktop-update.js';
import { NavUser } from '#components/nav/nav-user.js';
import { isDesktopTarget } from '#lib/build-target.js';
import { cn } from '@taucad/ui/utils/cn';
import { billingNavRoutes } from '#cloud/nav-billing.js';

/**
 * The phone sheet header reads [close][wordmark → Home] … [Search] (D10). Wide screens keep search as
 * the Search row under the header instead. In the browser each control is a 40px target; the desktop
 * app's narrow window keeps its compact titlebar row.
 */
function PhoneSidebarHeaderControls({
  isDesktopTarget: desktopTarget,
}: {
  readonly isDesktopTarget: boolean;
}): React.JSX.Element {
  return (
    <>
      <SidebarTrigger className={cn(!desktopTarget && 'size-10')} />
      <SidebarMenuButton
        asChild
        tooltip='Home'
        className={cn(
          'w-auto min-w-0 gap-0 p-1! group-data-[collapsible=icon]:p-0! [&>svg]:h-7 [&>svg]:w-auto',
          !desktopTarget && 'h-10',
        )}
      >
        <Link to='/'>
          <TauTextWordmark className='py-1 text-primary' />
          <span className='sr-only'>Home</span>
        </Link>
      </SidebarMenuButton>
      <span aria-hidden className='flex-1' />
      <Commands />
    </>
  );
}

export function AppSidebar({ ...properties }: React.ComponentProps<typeof Sidebar>): React.JSX.Element {
  const { state, isMobile } = useSidebar();
  const flags = useFeatureFlags();
  const desktopTarget = isDesktopTarget();
  const isCompact = desktopTarget && !isMobile;
  const isNonMobileCollapsed = !isMobile && state === 'collapsed';
  const navMoreItems = React.useMemo(
    () =>
      [...navRoutes.navMore, ...billingNavRoutes].filter(
        (item) => item.featureFlag === undefined || flags[item.featureFlag],
      ),
    [flags],
  );

  return (
    <Sidebar
      {...properties}
      id={isMobile ? undefined : 'app-sidebar'}
      role={isMobile ? undefined : 'complementary'}
      aria-label={isMobile ? undefined : 'Application sidebar'}
      aria-hidden={isNonMobileCollapsed || undefined}
      inert={isNonMobileCollapsed || undefined}
      variant='sidebar'
      collapsible={isMobile ? 'offcanvas' : 'none'}
      className={cn(
        'w-full border-r border-sidebar-border',
        isCompact && '[&_[data-slot=sidebar-group-label]]:text-muted-foreground',
        properties.className,
      )}
    >
      <SidebarHeader
        className={cn(
          'flex flex-row items-center gap-1',
          isMobile && 'p-1',
          !isMobile && 'h-9 p-0',
          isMobile && desktopTarget && 'h-9 pl-(--desktop-titlebar-inset) [&_:is(a,button)]:[app-region:no-drag]',
        )}
      >
        {isMobile ? <PhoneSidebarHeaderControls isDesktopTarget={desktopTarget} /> : null}
      </SidebarHeader>
      <SidebarContent className='gap-0'>
        <div className='sticky top-0 z-10 space-y-1 bg-sidebar px-2 pb-1'>
          {/* Global search entries register when search opens. */}
          {isMobile ? null : <Commands />}
          <NavChat isCompact={isCompact} isTouchSized={isMobile && !desktopTarget} />
        </div>
        <div className='flex-1 overflow-y-auto'>
          <div className='flex flex-col justify-between'>
            <NavMain items={navRoutes.navMain} moreItems={navMoreItems} className={isCompact ? 'py-1' : undefined} />
            <ProjectNavigation className={isCompact ? 'py-1' : undefined} />
          </div>
        </div>
      </SidebarContent>
      {desktopTarget ? <DesktopUpdate /> : <BrowserUpdate />}
      <SidebarFooter className='border-t p-1'>
        <NavUser />
      </SidebarFooter>
    </Sidebar>
  );
}
