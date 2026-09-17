import { Link, Outlet } from 'react-router';
import { Fragment } from 'react/jsx-runtime';
import { useCallback, useMemo, useRef } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { Allotment, LayoutPriority } from 'allotment';
import type { AllotmentHandle } from 'allotment';
import { AppSidebar } from '#components/layout/app-sidebar.js';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbSeparator,
} from '@taucad/ui/components/breadcrumb';
import { Separator } from '@taucad/ui/components/separator';
import { SidebarInset, SidebarProvider, SidebarTrigger, useSidebar } from '#components/ui/sidebar.js';
import { useTypedMatches } from '#hooks/use-typed-matches.js';
import { cn } from '@taucad/ui/utils/cn';
import { Compose } from '#components/ui/utils/compose.js';
import { CommandPaletteProvider, RouteCommandPaletteItems } from '#components/layout/command-palette.js';
import { RouteFooter } from '#components/layout/route-footer.js';
import { SettingsDialog } from '#components/settings/settings-dialog.js';
import { useResolvedAuth } from '#hooks/use-resolved-auth.js';
import { useFeatureFlags } from '#flags/use-feature.js';
import { DesktopTitlebarControls } from '#components/layout/desktop-titlebar-controls.js';
import { isDesktopTarget } from '#lib/build-target.js';
import { TauWordmark } from '#components/icons/tau-wordmark.js';
import { sidebarPreferredWidth } from '#constants/sidebar.constants.js';

export const headerHeight = 'calc(var(--spacing) * 12)';
export const desktopHeaderHeight = 'calc(var(--spacing) * 9)';

const desktopTitlebarControlsWidth = 'calc(var(--spacing) * 47)';
const webTitlebarControlsWidth = 'calc(var(--spacing) * 28)';

const sidebarMinimumWidth = 192;
const sidebarMaximumWidth = 480;
const sidebarKeyboardResizeStep = 16;

const headerOffsetClasses = 'mt-(--header-height) h-[calc(100dvh-var(--header-height)-1px)]';

type SectionContentProps = {
  readonly error: ReactNode | undefined;
  readonly enablePageFooter: boolean;
};

/**
 * Renders the main content area of the page.
 * Handles the different rendering paths for:
 * - Normal content (Outlet)
 * - Error content
 * - With or without page footer
 * - With or without sidebar positioning
 */
function SectionContent({ error, enablePageFooter }: SectionContentProps): React.JSX.Element {
  const content = error ?? <Outlet />;

  if (enablePageFooter) {
    return (
      <div className='flex min-h-full flex-col overflow-clip'>
        <div className='flex flex-1 flex-col'>{content}</div>
        <RouteFooter />
      </div>
    );
  }

  // Default: render content directly
  // oxlint-disable-next-line react/jsx-no-useless-fragment -- needed for consistent return type
  return <>{content}</>;
}

const WebTitlebarControls = ({
  onSidebarResize,
}: {
  readonly onSidebarResize: (direction: 'narrower' | 'wider') => void;
}): React.JSX.Element => (
  <div
    data-slot='web-titlebar-controls'
    className='fixed top-0 left-0 z-50 hidden h-9 w-(--titlebar-controls-width) items-center gap-2 bg-transparent px-2 md:flex'
  >
    <Link
      to='/'
      aria-label='Home'
      className='flex h-7 items-center rounded-sm px-1 outline-none focus-visible:focus-outline'
    >
      <TauWordmark aria-hidden className='h-5 w-auto text-primary' />
    </Link>
    <SidebarTrigger aria-label='Toggle Sidebar' onSidebarResize={onSidebarResize} />
  </div>
);

const ApplicationShell = ({
  children,
  isDesktopTarget,
}: {
  readonly children: ReactNode;
  readonly isDesktopTarget: boolean;
}): React.JSX.Element => {
  const { isMobile, open } = useSidebar();
  const allotmentRef = useRef<AllotmentHandle>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const sidebarWidthRef = useRef(sidebarPreferredWidth);

  const resizeSidebar = useCallback(
    (direction: 'narrower' | 'wider') => {
      if (isMobile || !open) {
        return;
      }

      const delta = direction === 'narrower' ? -sidebarKeyboardResizeStep : sidebarKeyboardResizeStep;
      const nextSidebarWidth = Math.min(
        sidebarMaximumWidth,
        Math.max(sidebarMinimumWidth, sidebarWidthRef.current + delta),
      );
      const shellWidth = shellRef.current?.clientWidth;
      if (!shellWidth || nextSidebarWidth === sidebarWidthRef.current) {
        return;
      }

      allotmentRef.current?.resize([nextSidebarWidth, Math.max(0, shellWidth - nextSidebarWidth)]);
      sidebarWidthRef.current = nextSidebarWidth;
    },
    [isMobile, open],
  );

  return (
    <div
      ref={shellRef}
      data-slot='application-shell'
      data-sidebar-open={!isMobile && open}
      className='group/app-shell relative size-full min-h-0 overflow-hidden'
      style={
        {
          '--titlebar-controls-width': isDesktopTarget ? desktopTitlebarControlsWidth : webTitlebarControlsWidth,
        } as CSSProperties
      }
    >
      {isDesktopTarget ? (
        <DesktopTitlebarControls onSidebarResize={resizeSidebar} />
      ) : (
        <WebTitlebarControls onSidebarResize={resizeSidebar} />
      )}
      <Allotment
        id='application-allotment'
        ref={allotmentRef}
        proportionalLayout={false}
        separator={false}
        snap={false}
        className='size-full [--focus-border:var(--primary)] [--sash-hover-transition-duration:0.1s] [--separator-border:var(--sidebar-border)] [&_.sash:before]:[transition-delay:0.5s]'
        onChange={(sizes) => {
          const sidebarWidth = sizes[0];
          if (sidebarWidth !== undefined && sidebarWidth > 0) {
            sidebarWidthRef.current = sidebarWidth;
          }
        }}
      >
        <Allotment.Pane
          key='app-sidebar'
          minSize={sidebarMinimumWidth}
          preferredSize={sidebarPreferredWidth}
          maxSize={sidebarMaximumWidth}
          priority={LayoutPriority.Low}
          visible={!isMobile && open}
        >
          <AppSidebar />
        </Allotment.Pane>
        <Allotment.Pane key='app-main' priority={LayoutPriority.High}>
          {children}
        </Allotment.Pane>
      </Allotment>
    </div>
  );
};

export function Page({ error }: { readonly error?: ReactNode }): React.JSX.Element {
  const resolvedAuth = useResolvedAuth();
  const flags = useFeatureFlags();
  const desktopTarget = isDesktopTarget();

  const {
    breadcrumbItems,
    hasBreadcrumbItems,
    actionItems,
    hasActionItems,
    pageWrapperMatches,
    enableOverflowY,
    providers,
    enablePageFooter,
    enablePageHeaderMatches,
  } = useTypedMatches((handles) => ({
    breadcrumbItems: handles.breadcrumb,
    hasBreadcrumbItems: handles.breadcrumb.length > 0,
    actionItems: handles.actions,
    hasActionItems: handles.actions.length > 0,
    pageWrapperMatches: handles.enablePageWrapper,
    enableOverflowY: handles.enableOverflowY.some((match) => match.handle.enableOverflowY === true),
    providers: handles.providers,
    enablePageFooter: handles.enablePageFooter.some((match) => match.handle.enablePageFooter === true),
    enablePageHeaderMatches: handles.enablePageHeader,
  }));
  const enablePageHeader = !enablePageHeaderMatches.some((match) => match.handle.enablePageHeader === false);
  const hasPageHeaderChrome = [hasBreadcrumbItems, hasActionItems].includes(true);
  const headerHeightClass = enablePageHeader
    ? cn(
        desktopTarget && '[--header-height:calc(var(--spacing)*9)]',
        !desktopTarget && '[--header-height:calc(var(--spacing)*12)] md:[--header-height:calc(var(--spacing)*9)]',
      )
    : '[--header-height:0px]';

  // Resolve `enablePageWrapper` per match: a match disables the wrapper when its
  // value is `false`, or when its function form returns `false` for the current
  // viewer (see `Handle.enablePageWrapper`). The wrapper stays on unless some
  // match opts out.
  /*
   * `titleBarStyle: 'hiddenInset'` gives macOS no implicit drag area, so the
   * window's grab band has to be declared in CSS. It belongs to the shell, not
   * to a route: every route renders through `Page`, including the ones that opt
   * out of the wrapper below (auth, share links), and a per-route handle leaves
   * each new route to remember one. Chromium unions the `drag` rects and
   * subtracts the `no-drag` ones, so interactive chrome sitting in the band —
   * the header children here, the dockview tabs, the titlebar controls — opts
   * itself back out.
   */
  const desktopDragBand = desktopTarget ? (
    <span
      aria-hidden
      data-slot='desktop-drag-band'
      className='pointer-events-none fixed inset-x-0 top-0 z-0 h-9 [app-region:drag]'
    />
  ) : null;

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

  if (!enablePageWrapper) {
    // `html, body { overflow: hidden }` (global.css) means the document never
    // scrolls — the app shell's inner `<section>` is normally the scroll
    // container. Without the wrapper we must supply one, but only when the route
    // asks for it (`enableOverflowY`); full-screen routes (auth, viewer) opt out
    // and keep the bare outlet.
    return (
      <Compose components={Providers}>
        {desktopDragBand}
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

  /*
   * W5/Finding 5b: the shell is above the composed route providers, not below
   * them. A route that contributes a provider changes the length of this list,
   * and anything nested inside it changes tree depth — which React implements
   * by unmounting and re-creating the subtree. Only the route's own content
   * needs those providers, so only the route's own content sits inside them.
   *
   * The command palette is the one piece of shell chrome fed by the routes: its
   * registry therefore sits above both, the sidebar keeps the trigger, and the
   * routes register from inside their own providers.
   */
  return (
    <CommandPaletteProvider>
      {desktopDragBand}
      <SidebarProvider className='h-dvh min-h-0 overflow-hidden'>
        <ApplicationShell isDesktopTarget={desktopTarget}>
          <SidebarInset className={cn('size-full min-w-0', headerHeightClass)}>
            {enablePageHeader ? (
              <header
                className={cn(
                  'pointer-events-none absolute top-0 z-20 flex h-(--header-height) w-full shrink-0 items-center justify-between gap-2',
                  hasPageHeaderChrome && 'border-b bg-sidebar',
                )}
              >
                <div
                  className={cn(
                    'pointer-events-auto ml-2 flex h-full items-center gap-1 md:group-data-[sidebar-open=false]/app-shell:ml-(--titlebar-controls-width)',
                    !hasBreadcrumbItems && 'md:hidden',
                    desktopTarget && '[app-region:no-drag]',
                  )}
                >
                  {desktopTarget ? null : <SidebarTrigger className='md:hidden' />}
                  {hasBreadcrumbItems && !desktopTarget ? (
                    <span className='h-4 md:hidden'>
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

                <div
                  className={cn(
                    'pointer-events-auto flex items-center gap-2 px-2',
                    desktopTarget && '[app-region:no-drag]',
                  )}
                >
                  {hasActionItems
                    ? actionItems.map((match) => <Fragment key={match.id}>{match.handle.actions?.(match)}</Fragment>)
                    : null}
                </div>
              </header>
            ) : null}
            <section
              className={cn('h-dvh', enableOverflowY && 'overflow-y-auto', enablePageHeader && headerOffsetClasses)}
            >
              <Compose components={Providers}>
                <RouteCommandPaletteItems />
                {/* Its compute section reads the active project; the dialog is a
                    portal, so only its place in the React tree matters. */}
                <SettingsDialog />
                <SectionContent error={error} enablePageFooter={enablePageFooter} />
              </Compose>
            </section>
          </SidebarInset>
        </ApplicationShell>
      </SidebarProvider>
    </CommandPaletteProvider>
  );
}
