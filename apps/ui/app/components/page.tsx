import { Outlet } from '@remix-run/react';
import { AppSidebar } from './app-sidebar';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Separator } from '@/components/ui/separator';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

import { loader } from '@/root';
import { useLoaderData } from '@remix-run/react';
import { Badge } from './ui/badge';
import { useNetworkConnectivity } from '@/hooks/use-network-connectivity';

export function Page() {
  const { sidebarOpen } = useLoaderData<typeof loader>();

  const isOnline = useNetworkConnectivity();

  return (
    <SidebarProvider defaultOpen={sidebarOpen}>
      <AppSidebar />
      <SidebarInset>
        <header className="flex h-12 justify-between shrink-0 items-center border-b-[1px] border-neutral-200 gap-2 transition-[width,height] ease-linear group-has-[[data-collapsible=icon]]/sidebar-wrapper:h-12">
          <div className="flex items-center gap-2 px-4">
            <Tooltip>
              <TooltipTrigger asChild>
                <SidebarTrigger className="-ml-1" />
              </TooltipTrigger>
              <TooltipContent>Toggle sidebar (⌘B)</TooltipContent>
            </Tooltip>
            <Separator orientation="vertical" className="mr-2 h-4" />
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem className="hidden md:block">
                  <BreadcrumbLink href="#">Build anything</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="hidden md:block" />
                <BreadcrumbItem>
                  <BreadcrumbPage>Data Fetching</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>
          <div className="flex items-center gap-2 px-4">
            {!isOnline && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Badge className="font-mono font-normal" variant={'outline'}>
                      OFFLINE
                    </Badge>
                  </span>
                </TooltipTrigger>
                <TooltipContent>You are offline. Reconnect to access online features.</TooltipContent>
              </Tooltip>
            )}
          </div>
        </header>
        <div className="flex flex-1 flex-col gap-4">
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
