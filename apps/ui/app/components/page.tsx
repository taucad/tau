import { Outlet } from '@remix-run/react';
import { AppSidebar } from '@/components/app-sidebar';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Separator } from '@/components/ui/separator';
import { SIDEBAR_TOGGLE_KEY_COMBO, SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

import { Badge } from '@/components/ui/badge';
import { useNetworkConnectivity } from '@/hooks/use-network-connectivity';
import { Fragment } from 'react/jsx-runtime';
import { ReactNode } from 'react';
import { KeyShortcut } from '@/components/ui/key-shortcut';
import { formatKeyCombination } from '@/utils/keys';
import { useTypedMatches } from '@/types/matches';

export const HEADER_HEIGHT = '3rem';

export function Page({ error }: { error?: ReactNode }) {
  const matches = useTypedMatches();

  const isOnline = useNetworkConnectivity();

  const breadcrumbItems = matches.filter((match) => Boolean(match.handle?.breadcrumb));

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset
        className="w-[calc(100dvw-var(--sidebar-width-current)-1px)]"
        style={{ '--header-height': HEADER_HEIGHT }}
      >
        <header className="flex h-[var(--header-height)] justify-between shrink-0 items-center border-b-[1px] border-border gap-2 transition-[width,height] ease-linear group-has-[[data-collapsible=icon]]/sidebar-wrapper:h-12">
          <div className="flex items-center gap-1 px-4">
            <Tooltip>
              <TooltipTrigger asChild>
                <SidebarTrigger className="-ml-2" />
              </TooltipTrigger>
              <TooltipContent>
                Toggle sidebar{' '}
                <KeyShortcut variant="tooltip">{formatKeyCombination(SIDEBAR_TOGGLE_KEY_COMBO)}</KeyShortcut>
              </TooltipContent>
            </Tooltip>
            {breadcrumbItems.length > 0 && <Separator orientation="vertical" className="h-4" />}
            <Breadcrumb>
              <BreadcrumbList className="sm:gap-0">
                {breadcrumbItems.map((match) => (
                  <Fragment key={match.id}>
                    <BreadcrumbSeparator className="hidden md:block first:hidden" />
                    <BreadcrumbItem className="hidden md:block last:block">
                      <BreadcrumbLink asChild>{match.handle.breadcrumb?.(match)}</BreadcrumbLink>
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
