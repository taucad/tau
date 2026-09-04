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
import { TauWordmark } from '#components/icons/tau-wordmark.js';
import { NavChat } from '#components/nav/nav-chat.js';
import { navRoutes } from '#constants/route.constants.js';
import { useFeatureFlags } from '#flags/use-feature.js';
import { Commands } from '#components/layout/command-palette.js';
import { NavUser } from '#components/nav/nav-user.js';
import { isDesktopTarget } from '#lib/build-target.js';
import { cn } from '@taucad/ui/utils/cn';

export function AppSidebar({ ...properties }: React.ComponentProps<typeof Sidebar>): React.JSX.Element {
  const { state, isMobile } = useSidebar();
  const flags = useFeatureFlags();
  const desktopTarget = isDesktopTarget();
  const isNonMobileCollapsed = !isMobile && state === 'collapsed';
  const navMainItems = React.useMemo(
    () => navRoutes.navMain.filter((item) => item.featureFlag === undefined || flags[item.featureFlag]),
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
      className={cn('w-full border-r border-sidebar-border', properties.className)}
    >
      <SidebarHeader
        className={cn(
          'flex flex-row items-center gap-1',
          isMobile && 'p-1',
          !isMobile && !desktopTarget && 'h-9 p-0',
          !isMobile && desktopTarget && 'p-1 pt-9',
        )}
      >
        {isMobile || desktopTarget ? (
          <SidebarMenuButton
            asChild
            tooltip='Home'
            className='min-w-0 flex-1 gap-0 p-1! group-data-[collapsible=icon]:p-0! [&>svg]:h-7 [&>svg]:w-auto'
          >
            <Link to='/'>
              <TauWordmark className='py-1 text-primary' />
              <span className='sr-only'>Home</span>
            </Link>
          </SidebarMenuButton>
        ) : null}
        {isMobile ? <SidebarTrigger /> : null}
      </SidebarHeader>
      <SidebarContent className='gap-0'>
        <div className='sticky top-0 z-10 space-y-1 bg-sidebar px-2 pb-1'>
          <Commands />
          <NavChat />
        </div>
        <div className='flex-1 overflow-y-auto'>
          <div className='flex flex-col justify-between'>
            <ProjectNavigation />
            <NavMain items={navMainItems} groupLabel='Platform' />
          </div>
        </div>
        <div className='sticky bottom-0 z-10'>
          <NavMain items={navRoutes.navSecondary} />
        </div>
      </SidebarContent>
      <SidebarFooter className='border-t p-1'>
        <NavUser />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
