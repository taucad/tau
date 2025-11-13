import { Outlet } from 'react-router';
import { Fragment } from 'react/jsx-runtime';
import { useMemo } from 'react';
import type { ReactNode } from 'react';
import { PanelLeftIcon } from 'lucide-react';
import { AppSidebar } from '#components/layout/app-sidebar.js';
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
import { cn } from '#utils/ui.utils.js';
import { Tau } from '#components/icons/tau.js';
import { Compose } from '#components/ui/utils/compose.js';
import { Commands } from '#components/layout/command-palette.js';

export const headerHeight = 'calc(var(--spacing) * 12)';

export function Page({ error }: { readonly error?: ReactNode }): React.JSX.Element {
  const {
    breadcrumbItems,
    hasBreadcrumbItems,
    actionItems,
    hasActionItems,
    noPageWrapper,
    enableFloatingSidebar,
    enableOverflowY,
    providers,
  } = useTypedMatches((handles) => ({
    breadcrumbItems: handles.breadcrumb,
    hasBreadcrumbItems: handles.breadcrumb.length > 0,
    actionItems: handles.actions,
    hasActionItems: handles.actions.length > 0,
    noPageWrapper: handles.noPageWrapper.some((match) => match.handle.noPageWrapper === true),
    enableFloatingSidebar: handles.enableFloatingSidebar.some((match) => match.handle.enableFloatingSidebar === true),
    enableOverflowY: handles.enableOverflowY.some((match) => match.handle.enableOverflowY === true),
    providers: handles.providers,
  }));

  const Providers = useMemo<Array<React.JSXElementConstructor<React.PropsWithChildren>>>(() => {
    const providerComponents = providers
      .map((match) => match.handle.providers?.(match))
      .filter(
        (component): component is React.JSXElementConstructor<React.PropsWithChildren> => component !== undefined,
      );

    return providerComponents;
  }, [providers]);

  const isOnline = useNetworkConnectivity();

  if (noPageWrapper) {
    return (
      <Compose components={Providers}>
        <Outlet />
      </Compose>
    );
  }

  return (
    <Compose components={Providers}>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset style={{ '--header-height': headerHeight }}>
          <header className="pointer-events-none absolute top-0 z-20 flex h-[var(--header-height)] w-full shrink-0 items-center justify-between gap-2">
            <div className="pointer-events-auto ml-2 flex h-8 items-center gap-0.25 rounded-md border bg-sidebar p-0.25 pl-2.75 transition-[margin] duration-200 ease-linear md:ml-[var(--sidebar-width-current)] md:gap-1">
              <SidebarTrigger className="group/sidebar-trigger -ml-2.5 rounded-sm">
                <Tau className="size-6 text-primary group-hover/sidebar-trigger:hidden group-data-[open=true]/sidebar-trigger:hidden max-md:hidden" />
                <PanelLeftIcon className="size-4 group-hover/sidebar-trigger:block group-data-[open=true]/sidebar-trigger:block md:hidden" />
              </SidebarTrigger>
              {hasBreadcrumbItems ? (
                <span className="h-4">
                  <Separator orientation="vertical" />
                </span>
              ) : null}
              <Breadcrumb className="hidden [&:has(>:not(:empty))]:block">
                <BreadcrumbList
                  className={cn(
                    'sm:gap-0',
                    '[&_[data-slot=button]]:h-7 [&_[data-slot=button]]:rounded-sm [&_[data-slot=button]]:p-2',
                    "[&_[data-slot='tooltip-trigger']]:h-7 [&_[data-slot='tooltip-trigger']]:rounded-sm [&_[data-slot='tooltip-trigger']]:p-2",
                    "[&_[data-slot='breadcrumb-link']]:h-7 [&_[data-slot='breadcrumb-link']]:rounded-sm [&_[data-slot='breadcrumb-link']]:p-2",
                    '[&_[data-slot=input]]:h-7 [&_[data-slot=input]]:rounded-sm',
                  )}
                >
                  {breadcrumbItems.map((match) => {
                    const breadcrumb = match.handle.breadcrumb?.(match);
                    // Normalize to always be an array
                    const breadcrumbArray = Array.isArray(breadcrumb) ? breadcrumb : [breadcrumb];

                    return (
                      <Fragment key={match.id}>
                        {breadcrumbArray.map((item, index) => (
                          // eslint-disable-next-line react/no-array-index-key -- these are stable.
                          <Fragment key={`${match.id}-${index}`}>
                            <BreadcrumbSeparator className="hidden first:hidden lg:block" />
                            <BreadcrumbItem className="hidden last:block hover:text-foreground lg:block">
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

            <div className="pointer-events-auto flex items-center gap-2 px-2">
              {isOnline ? null : (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge className="h-8 font-mono font-normal" variant="outline">
                      OFFLINE
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>You are offline. Reconnect to access online features.</TooltipContent>
                </Tooltip>
              )}
              <Commands />
              {hasActionItems
                ? actionItems.map((match) => <Fragment key={match.id}>{match.handle.actions?.(match)}</Fragment>)
                : null}

              <NavUser />
            </div>
          </header>
          <section
            className={cn(
              'h-dvh',
              enableOverflowY && 'overflow-y-auto',
              !enableFloatingSidebar &&
                'mt-[var(--header-height)] h-[calc(100dvh-var(--header-height)-1px)] md:ml-(--sidebar-width-current)',
            )}
          >
            {error === undefined ? <Outlet /> : error}
          </section>
        </SidebarInset>
      </SidebarProvider>
    </Compose>
  );
}
