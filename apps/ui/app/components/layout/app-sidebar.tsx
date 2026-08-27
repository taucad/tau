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
  SidebarRail,
  useSidebar,
} from '#components/ui/sidebar.js';
import { ReleaseBadge } from '#components/release-badge.js';
import { TauWordmark } from '#components/icons/tau-wordmark.js';
import { NavChat } from '#components/nav/nav-chat.js';
import { navRoutes } from '#constants/route.constants.js';
import { NavFooter } from '#components/nav/nav-footer.js';
import { useFeatureFlags } from '#flags/use-feature.js';

export function AppSidebar({ ...properties }: React.ComponentProps<typeof Sidebar>): React.JSX.Element {
  const { state, isMobile, openMobile } = useSidebar();
  const flags = useFeatureFlags();
  const showAlphaBadge = isMobile ? openMobile : state === 'expanded';
  const navMainItems = React.useMemo(
    () => navRoutes.navMain.filter((item) => item.featureFlag === undefined || flags[item.featureFlag]),
    [flags],
  );

  return (
    <Sidebar variant='floating' collapsible='offcanvas' {...properties}>
      <SidebarHeader className='flex flex-row items-center gap-1 p-1'>
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
        {showAlphaBadge ? <ReleaseBadge /> : null}
      </SidebarHeader>
      <SidebarContent className='gap-0'>
        <div className='sticky top-0 z-10'>
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
      <SidebarFooter className='flex flex-row items-center justify-between border-t'>
        <NavFooter />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
