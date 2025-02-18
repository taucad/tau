import { Outlet, useMatches } from '@remix-run/react';
import { AppSidebar } from './app-sidebar';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Separator } from '@/components/ui/separator';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

import type { loader } from '@/root';
import { useLoaderData } from '@remix-run/react';
import { Badge } from './ui/badge';
import { useNetworkConnectivity } from '@/hooks/use-network-connectivity';
import { Fragment } from 'react/jsx-runtime';
import { ReactNode } from 'react';

const HEADER_HEIGHT = '3rem';

export function Page({ error }: { error?: ReactNode }) {
  const data = useLoaderData<typeof loader>();
  const matches = useMatches();

  const isOnline = useNetworkConnectivity();

  const breadcrumbItems = matches.filter((match) => match.handle && match.handle.breadcrumb);

  return (
    <SidebarProvider defaultOpen={data?.sidebarOpen}>
      <AppSidebar />
      <SidebarInset
        className="w-[calc(100dvw-var(--sidebar-width-current)-1px)]"
        style={{ '--header-height': HEADER_HEIGHT } as React.CSSProperties}
      >
        <header className="flex h-[var(--header-height)] justify-between shrink-0 items-center border-b-[1px] border-border gap-2 transition-[width,height] ease-linear group-has-[[data-collapsible=icon]]/sidebar-wrapper:h-12">
          <div className="flex items-center gap-1.5 md:gap-2.5 px-4">
            <Tooltip>
              <TooltipTrigger asChild>
                <SidebarTrigger className="-ml-1" />
              </TooltipTrigger>
              <TooltipContent>Toggle sidebar (⌘B)</TooltipContent>
            </Tooltip>
            <Separator orientation="vertical" className="h-4" />
            <Breadcrumb>
              <BreadcrumbList className="sm:gap-0">
                {breadcrumbItems.map((match) => (
                  <Fragment key={match.id}>
                    <BreadcrumbSeparator className="hidden md:block first:hidden" />
                    <BreadcrumbItem className="hidden md:block last:block">
                      <BreadcrumbLink asChild>{match.handle.breadcrumb(match)}</BreadcrumbLink>
                    </BreadcrumbItem>
                  </Fragment>
                ))}
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
        <section className="h-[calc(100dvh-var(--header-height)-1px)] overflow-y-auto">
          {error === undefined ? <Outlet /> : error}
        </section>
      </SidebarInset>
    </SidebarProvider>
  );
}
