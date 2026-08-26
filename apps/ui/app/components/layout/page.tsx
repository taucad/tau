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
import { Compose } from '#components/ui/utils/compose.js';
import { Commands } from '#components/layout/command-palette.js';
import { PageFooter } from '#components/layout/page-footer.js';
import { SidebarOffset } from '#components/layout/sidebar-offset.js';
import { CookieConsent } from '#components/cookie-consent.js';
import { SettingsDialog } from '#components/settings/settings-dialog.js';
import { useResolvedAuth } from '#hooks/use-resolved-auth.js';
import { useFeatureFlags } from '#flags/use-feature.js';

export const headerHeight = 'calc(var(--spacing) * 12)';

/**
 * Positioning classes for content that needs to account for the sidebar.
 * Applied to the section when `enableFloatingSidebar` is false,
 * or to the content wrapper when rendering errors on floating sidebar routes.
 */
const sidebarPositioningClasses =
  'mt-(--header-height) h-[calc(100dvh-var(--header-height)-1px)] transition-[margin] duration-200 ease-linear md:ml-[calc(var(--sidebar-width-current)-var(--spacing)*2)]';

type SectionContentProps = {
  readonly error: ReactNode | undefined;
  readonly enablePageFooter: boolean;
  readonly enableFloatingSidebar: boolean;
  readonly shouldApplyPositioning: boolean;
};

/**
 * Renders the main content area of the page.
 * Handles the different rendering paths for:
 * - Normal content (Outlet)
 * - Error content
 * - With or without page footer
 * - With or without sidebar positioning
 */
function SectionContent({
  error,
  enablePageFooter,
  enableFloatingSidebar,
  shouldApplyPositioning,
}: SectionContentProps): React.JSX.Element {
  const content = error ?? <Outlet />;

  // With footer: wrap in flex container with optional positioning
  if (enablePageFooter) {
    return (
      <div
        className={cn('flex min-h-full flex-col overflow-clip', shouldApplyPositioning && sidebarPositioningClasses)}
      >
        <div className='flex flex-1 flex-col'>{content}</div>
        {enableFloatingSidebar ? (
          <SidebarOffset asChild via='margin'>
            <PageFooter />
          </SidebarOffset>
        ) : (
          <PageFooter />
        )}
      </div>
    );
  }

  // Error on floating sidebar route (no footer): wrap with positioning
  if (shouldApplyPositioning) {
    return <div className={cn('flex flex-col', sidebarPositioningClasses)}>{content}</div>;
  }

  // Default: render content directly
  // oxlint-disable-next-line react/jsx-no-useless-fragment -- needed for consistent return type
  return <>{content}</>;
}

export function Page({ error }: { readonly error?: ReactNode }): React.JSX.Element {
  const resolvedAuth = useResolvedAuth();
  const flags = useFeatureFlags();

  const {
    breadcrumbItems,
    hasBreadcrumbItems,
    actionItems,
    hasActionItems,
    pageWrapperMatches,
    enableFloatingSidebar,
    enableOverflowY,
    providers,
    enablePageFooter,
  } = useTypedMatches((handles) => ({
    breadcrumbItems: handles.breadcrumb,
    hasBreadcrumbItems: handles.breadcrumb.length > 0,
    actionItems: handles.actions,
    hasActionItems: handles.actions.length > 0,
    pageWrapperMatches: handles.enablePageWrapper,
    enableFloatingSidebar: handles.enableFloatingSidebar.some((match) => match.handle.enableFloatingSidebar === true),
    enableOverflowY: handles.enableOverflowY.some((match) => match.handle.enableOverflowY === true),
    providers: handles.providers,
    enablePageFooter: handles.enablePageFooter.some((match) => match.handle.enablePageFooter === true),
  }));

  // Resolve `enablePageWrapper` per match: a match disables the wrapper when its
  // value is `false`, or when its function form returns `false` for the current
  // viewer (see `Handle.enablePageWrapper`). The wrapper stays on unless some
  // match opts out.
  const chromeContext = { authState: resolvedAuth, flags };
  const enablePageWrapper = !pageWrapperMatches.some((match) => {
    const value = match.handle.enablePageWrapper;
    const resolved = typeof value === 'function' ? value(chromeContext) : value;
    return resolved === false;
  });

  const Providers = useMemo<Array<React.JSXElementConstructor<React.PropsWithChildren>>>(() => {
    const providerComponents = providers
      .map((match) => match.handle.providers?.(match))
      .filter(
        (component): component is React.JSXElementConstructor<React.PropsWithChildren> => component !== undefined,
      );

    return providerComponents;
  }, [providers]);

  const isOnline = useNetworkConnectivity();

  // Compute positioning logic once
  // Section handles positioning for standard routes (non-floating sidebar)
  const shouldSectionApplyPositioning = !enableFloatingSidebar;
  // Content wrapper needs positioning when: floating sidebar route + error
  // (because error content doesn't handle its own positioning like fumadocs does)
  const shouldContentApplyPositioning = enableFloatingSidebar && error !== undefined;

  if (!enablePageWrapper) {
    // `html, body { overflow: hidden }` (global.css) means the document never
    // scrolls — the app shell's inner `<section>` is normally the scroll
    // container. Without the wrapper we must supply one, but only when the route
    // asks for it (`enableOverflowY`); full-screen routes (auth, viewer) opt out
    // and keep the bare outlet.
    return (
      <Compose components={Providers}>
        {enableOverflowY ? (
          <div className='h-dvh overflow-y-auto'>
            <Outlet />
          </div>
        ) : (
          <Outlet />
        )}
      </Compose>
    );
  }

  return (
    <Compose components={Providers}>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset style={{ '--header-height': headerHeight }}>
          <header className='pointer-events-none absolute top-0 z-20 flex h-(--header-height) w-full shrink-0 items-center justify-between gap-2'>
            <div className='pointer-events-auto ml-2 flex h-8 items-center gap-0.25 rounded-md border bg-sidebar p-0.25 pl-2.75 transition-[margin] duration-200 ease-linear md:ml-(--sidebar-width-current) md:gap-1'>
              <SidebarTrigger className='group/sidebar-trigger -ml-2.5 rounded-sm'>
                <PanelLeftIcon className='size-4 group-data-[open=true]/sidebar-trigger:block' />
              </SidebarTrigger>
              {hasBreadcrumbItems ? (
                <span className='h-4'>
                  <Separator orientation='vertical' />
                </span>
              ) : null}
              <Breadcrumb className='hidden [&:has(>:not(:empty))]:block'>
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
                          // oxlint-disable-next-line react/no-array-index-key -- these are stable.
                          <Fragment key={`${match.id}-${index}`}>
                            <BreadcrumbSeparator className='hidden first:hidden lg:block' />
                            <BreadcrumbItem className='hidden last:block hover:text-foreground lg:block'>
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

            <div className='pointer-events-auto flex items-center gap-2 px-2'>
              {isOnline ? null : (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge className='h-8 font-mono font-normal' variant='outline'>
                      OFFLINE
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>You are offline. Reconnect to access online features.</TooltipContent>
                </Tooltip>
              )}
              {hasActionItems
                ? actionItems.map((match) => <Fragment key={match.id}>{match.handle.actions?.(match)}</Fragment>)
                : null}
              <Commands />
              <NavUser />
            </div>
          </header>
          <section
            className={cn(
              'h-dvh',
              enableOverflowY && 'overflow-y-auto',
              shouldSectionApplyPositioning && sidebarPositioningClasses,
            )}
          >
            <SectionContent
              error={error}
              enablePageFooter={enablePageFooter}
              enableFloatingSidebar={enableFloatingSidebar}
              shouldApplyPositioning={shouldContentApplyPositioning}
            />
          </section>
        </SidebarInset>
        <CookieConsent />
        <SettingsDialog />
      </SidebarProvider>
    </Compose>
  );
}
