import { Outlet } from 'react-router';
import { Fragment } from 'react/jsx-runtime';
import type { ReactNode } from 'react';
import { AppSidebar } from '#components/app-sidebar.js';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbSeparator,
} from '#components/ui/breadcrumb.js';
import { Separator } from '#components/ui/separator.js';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '#components/ui/sidebar.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '#components/ui/tooltip.js';
import { Badge } from '#components/ui/badge.js';
import { useNetworkConnectivity } from '#hooks/use-network-connectivity.js';
import { useTypedMatches } from '#hooks/use-typed-matches.js';
import { NavUser } from '#components/nav/nav-user.js';
import { cn } from '#utils/ui.js';

export const headerHeight = 'calc(var(--spacing) * 12)';

export function Page({ error }: { readonly error?: ReactNode }): React.JSX.Element {
  const {
    breadcrumbItems,
    hasBreadcrumbItems,
    actionItems,
    hasActionItems,
    commandPaletteItems,
    hasCommandPaletteItems,
    noPageWrapper,
    enableFloatingSidebar,
  } = useTypedMatches((handles) => ({
    breadcrumbItems: handles.breadcrumb,
    hasBreadcrumbItems: handles.breadcrumb.length > 0,
    actionItems: handles.actions,
    hasActionItems: handles.actions.length > 0,
    commandPaletteItems: handles.commandPalette,
    hasCommandPaletteItems: handles.commandPalette.length > 0,
    noPageWrapper: handles.noPageWrapper.some((match) => match.handle.noPageWrapper === true),
    enableFloatingSidebar: handles.enableFloatingSidebar.some((match) => match.handle.enableFloatingSidebar === true),
  }));

  const isOnline = useNetworkConnectivity();

  if (noPageWrapper) {
    return <Outlet />;
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset
        style={{ '--header-height': headerHeight }}
      >
        <header className="absolute top-0 w-full z-20 flex h-[var(--header-height)] shrink-0 items-center justify-between gap-2 pointer-events-none">
          <div className="flex items-center p-0.25 gap-0.25 md:gap-1 h-8 ml-2 md:ml-[var(--sidebar-width-current)] transition-all duration-200 ease-linear pl-2.75 rounded-lg bg-sidebar border pointer-events-auto">
            <SidebarTrigger className="-ml-2.5" />
            {hasBreadcrumbItems ? (
              <span className="h-4">
                <Separator orientation="vertical" />
              </span>
            ) : null}
            <Breadcrumb className="hidden [&:has(>:not(:empty))]:block">
              <BreadcrumbList className={
                cn(
                  "sm:gap-0",
                  "[&_[data-slot=button]]:h-7 [&_[data-slot=button]]:p-2 [&_[data-slot=button]]:rounded-md",
                  "[&_[data-slot='tooltip-trigger']]:h-7 [&_[data-slot='tooltip-trigger']]:p-2 [&_[data-slot='tooltip-trigger']]:rounded-md",
                  "[&_[data-slot='breadcrumb-link']]:h-7 [&_[data-slot='breadcrumb-link']]:p-2 [&_[data-slot='breadcrumb-link']]:rounded-md",
                  "[&_[data-slot=input]]:h-7 [&_[data-slot=input]]:rounded-md"
                )}
              >
                {breadcrumbItems.map((match) => {
                  const breadcrumb = match.handle.breadcrumb?.(match);
                  // Normalize to always be an array
                  const breadcrumbArray = Array.isArray(breadcrumb) ? breadcrumb : [breadcrumb];
                  
                  return (
                    <Fragment key={match.id}>
                      {breadcrumbArray.map((item, index) => (
                        <Fragment key={`${match.id}-${index}`}>
                          <BreadcrumbSeparator className="hidden first:hidden lg:block" />
                          <BreadcrumbItem className="hidden last:block lg:block hover:text-foreground">
                            <BreadcrumbLink asChild>{item}</BreadcrumbLink>
                          </BreadcrumbItem>
                        </Fragment>
                      ))}
                    </Fragment>
                  );
                })}
              </BreadcrumbList>
            </Breadcrumb>
          </div>

          {/* Centered Command Palette */}
          <div className="absolute top-1/2 left-1/2 z-50 -translate-x-1/2 -translate-y-1/2 pointer-events-auto">
            {hasCommandPaletteItems ? (
              <div className="flex items-center gap-2">
                {commandPaletteItems.map((match) => (
                  <Fragment key={match.id}>{match.handle.commandPalette?.(match)}</Fragment>
                ))}
              </div>
            ) : null}
          </div>

          <div className="flex items-center gap-2 px-2 pointer-events-auto">
            {!isOnline && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge className="font-mono font-normal" variant="outline">
                    OFFLINE
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>You are offline. Reconnect to access online features.</TooltipContent>
              </Tooltip>
            )}
            {hasActionItems ? (
              <div className="flex items-center gap-2">
                {actionItems.map((match) => (
                  <Fragment key={match.id}>{match.handle.actions?.(match)}</Fragment>
                ))}
              </div>
            ) : null}

            <NavUser />
          </div>
        </header>
        <section className={cn("h-dvh overflow-y-auto", !enableFloatingSidebar && 'md:ml-(--sidebar-width-current) h-[calc(100dvh-var(--header-height)-1px)] mt-[var(--header-height)]')}>
          {error === undefined ? <Outlet /> : error}
        </section>
      </SidebarInset>
    </SidebarProvider>
  );
}
