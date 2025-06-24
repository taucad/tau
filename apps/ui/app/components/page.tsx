import { Outlet } from 'react-router';
import { Fragment } from 'react/jsx-runtime';
import type { JSX, ReactNode } from 'react';
import { AppSidebar } from '~/components/app-sidebar.js';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbSeparator,
} from '~/components/ui/breadcrumb.js';
import { Separator } from '~/components/ui/separator.js';
import { sidebarToggleKeyCombo, SidebarInset, SidebarProvider, SidebarTrigger } from '~/components/ui/sidebar.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '~/components/ui/tooltip.js';
import { Badge } from '~/components/ui/badge.js';
import { useNetworkConnectivity } from '~/hooks/use-network-connectivity.js';
import { KeyShortcut } from '~/components/ui/key-shortcut.js';
import { formatKeyCombination } from '~/utils/keys.js';
import { useTypedMatches } from '~/hooks/use-typed-matches.js';
import { NavUser } from '~/components/nav/nav-user.js';

export const headerHeight = '3rem';

export function Page({ error }: { readonly error?: ReactNode }): JSX.Element {
  const {
    breadcrumbItems,
    hasBreadcrumbItems,
    actionItems,
    hasActionItems,
    commandPaletteItems,
    hasCommandPaletteItems,
    noPageWrapper,
  } = useTypedMatches((handles) => ({
    breadcrumbItems: handles.breadcrumb,
    hasBreadcrumbItems: handles.breadcrumb.length > 0,
    actionItems: handles.actions,
    hasActionItems: handles.actions.length > 0,
    commandPaletteItems: handles.commandPalette,
    hasCommandPaletteItems: handles.commandPalette.length > 0,
    noPageWrapper: handles.noPageWrapper.some((match) => match.handle.noPageWrapper === true),
  }));

  const isOnline = useNetworkConnectivity();

  if (noPageWrapper) {
    return <Outlet />;
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset
        className="w-[calc(100dvw-var(--sidebar-width-current)-1px)]"
        style={{ '--header-height': headerHeight }}
      >
        <header className="relative flex h-[var(--header-height)] shrink-0 items-center justify-between gap-2 border-b-[1px] border-border transition-[width,height] ease-linear group-has-[[data-collapsible=icon]]/sidebar-wrapper:h-12">
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
            {hasBreadcrumbItems ? (
              <span className="h-4">
                <Separator orientation="vertical" />
              </span>
            ) : null}
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

          {/* Centered Command Palette */}
          <div className="absolute top-1/2 left-1/2 z-50 -translate-x-1/2 -translate-y-1/2">
            {hasCommandPaletteItems ? (
              <div className="flex items-center gap-2">
                {commandPaletteItems.map((match) => (
                  <Fragment key={match.id}>{match.handle.commandPalette?.(match)}</Fragment>
                ))}
              </div>
            ) : null}
          </div>

          <div className="flex items-center gap-2 px-2">
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
        <section className="h-[calc(100dvh-var(--header-height)-1px)] overflow-y-auto">
          {error === undefined ? <Outlet /> : error}
        </section>
      </SidebarInset>
    </SidebarProvider>
  );
}
