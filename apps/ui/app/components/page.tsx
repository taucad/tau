import { Outlet } from 'react-router';
import { Fragment } from 'react/jsx-runtime';
import type { JSX, ReactNode } from 'react';
import { AppSidebar } from '@/components/app-sidebar.js';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb.js';
import { Separator } from '@/components/ui/separator.js';
import { sidebarToggleKeyCombo, SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip.js';
import { Badge } from '@/components/ui/badge.js';
import { useNetworkConnectivity } from '@/hooks/use-network-connectivity.js';
import { KeyShortcut } from '@/components/ui/key-shortcut.js';
import { formatKeyCombination } from '@/utils/keys.js';
import { useTypedMatches } from '@/types/matches.js';

export const headerHeight = '3rem';

export function Page({ error }: { readonly error?: ReactNode }): JSX.Element {
  const matches = useTypedMatches();

  const isOnline = useNetworkConnectivity();

  const breadcrumbItems = matches.filter((match) => Boolean(match.handle?.breadcrumb));

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset
        className="w-[calc(100dvw-var(--sidebar-width-current)-1px)]"
        style={{ '--header-height': headerHeight }}
      >
        <header className="flex h-[var(--header-height)] shrink-0 items-center justify-between gap-2 border-b-[1px] border-border transition-[width,height] ease-linear group-has-[[data-collapsible=icon]]/sidebar-wrapper:h-12">
          <div className="flex items-center gap-1 px-4">
            <Tooltip>
              <TooltipTrigger asChild>
                <SidebarTrigger className="-ml-2" />
              </TooltipTrigger>
              <TooltipContent>
                Toggle sidebar{' '}
                <KeyShortcut variant="tooltip">{formatKeyCombination(sidebarToggleKeyCombo)}</KeyShortcut>
              </TooltipContent>
            </Tooltip>
            {breadcrumbItems.length > 0 && (
              <span className="h-4">
                <Separator orientation="vertical" />
              </span>
            )}
            <Breadcrumb>
              <BreadcrumbList className="sm:gap-0">
                {breadcrumbItems.map((match) => (
                  <Fragment key={match.id}>
                    <BreadcrumbSeparator className="hidden first:hidden md:block" />
                    <BreadcrumbItem className="hidden last:block md:block">
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
                    <Badge className="font-mono font-normal" variant="outline">
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
