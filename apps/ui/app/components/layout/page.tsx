import { HomeFileManagerNotice } from '#hooks/use-file-manager.js';
import { Link, NavigationType, Outlet, useLocation, useNavigationType } from 'react-router';
import { Fragment } from 'react/jsx-runtime';
import { useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import type { CSSProperties, ReactNode, UIEvent } from 'react';
import { LayoutPriority } from 'allotment';
import { ChevronLeft } from 'lucide-react';
import { Allotment } from '#components/panes/allotment.js';
import type { AllotmentHandle } from 'allotment';
import { AppSidebar } from '#components/layout/app-sidebar.js';
import { PhoneTopBarContext } from '#components/layout/page-header.js';
import type { PhoneTopBar } from '#components/layout/page-header.js';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbSeparator,
} from '@taucad/ui/components/breadcrumb';
import { Button } from '@taucad/ui/components/button';
import { Separator } from '@taucad/ui/components/separator';
import { SidebarInset, SidebarProvider, SidebarTrigger, useSidebar } from '#components/ui/sidebar.js';
import { useTypedMatches } from '#hooks/use-typed-matches.js';
import type { TypedUiMatchWithHandle } from '#types/matches.types.js';
import { cn } from '@taucad/ui/utils/cn';
import { Compose } from '#components/ui/utils/compose.js';
import { CommandPaletteProvider, RouteCommandPaletteItems } from '#components/layout/command-palette.js';
import { SettingsDialog } from '#components/settings/settings-dialog.js';
import { useResolvedAuth } from '#hooks/use-resolved-auth.js';
import { useFeatureFlags } from '#flags/use-feature.js';
import { DesktopTitlebarControls, TitlebarNavigation } from '#components/layout/desktop-titlebar-controls.js';
import { isDesktopTarget } from '#lib/build-target.js';
import { useDesktopFullscreen } from '#hooks/use-desktop-fullscreen.js';
import { sidebarPreferredWidth } from '#constants/sidebar.constants.js';
import { useIsMobile } from '@taucad/ui/hooks/use-mobile';

export const headerHeight = 'calc(var(--spacing) * 12)';
export const desktopHeaderHeight = 'calc(var(--spacing) * 9)';

// Closed headers reserve only their visible controls; open headers follow the resizable pane.
const closedTitlebarControlsWidth = 'calc(var(--spacing) * 26)';
const browserClosedTitlebarControlsWidth = 'calc(var(--spacing) * 10)';
const windowedClosedTitlebarControlsWidth = 'calc(var(--spacing) * 44)';

const sidebarMinimumWidth = 192;
const sidebarMaximumWidth = 480;
const sidebarKeyboardResizeStep = 16;

const headerOffsetClasses = 'mt-(--header-height) h-[calc(100dvh-var(--header-height)-1px)]';
// A phone-only bar offsets the page below `md` only; from `md` up the page keeps the headerless layout.
const phoneHeaderOffsetClasses = 'max-md:mt-(--header-height) max-md:h-[calc(100dvh-var(--header-height)-1px)]';
/**
 * Without a header, the closed sidebar's titlebar controls overlay the page top from `md` up; a page that draws its
 * own bar (`enablePageHeader: false`) keeps this inset as the shell gives a headerless page.
 *
 * @public
 */
export const desktopTitlebarInset = 'md:group-data-[sidebar-open=false]/app-shell:pt-9';

/*
 * Each history entry keeps its place in the shell's scroller. React Router's
 * `ScrollRestoration` restores `window`, but `html, body { overflow: hidden }`
 * (global.css) makes the shell's inner element the one that scrolls, so Back
 * used to land at the top. `Page` owns it once for every `enableOverflowY` route.
 */
const scrollStorageKey = (locationKey: string): string => `tau.page-scroll.${locationKey}`;

const readSavedScroll = (locationKey: string): number => {
  try {
    return Number(globalThis.sessionStorage.getItem(scrollStorageKey(locationKey)) ?? 0);
  } catch {
    // A blocked store means no saved place, never a broken page.
    return 0;
  }
};

/** Milliseconds a restored offset is held while the page settles, unless the person scrolls first. */
const restoreHoldDuration = 1000;
const restoreReleaseEvents = ['wheel', 'touchstart', 'pointerdown', 'keydown'] as const;

/**
 * Holds `scroller` at `top` while its content settles. The shell remounts on Back
 * from a wrapper-less route and its sidebar pane sizes itself a frame later, so the
 * content first lays out at another width and height; the browser's scroll
 * anchoring then moves the offset. Re-applying on every resize keeps the saved
 * place; the hold ends on the person's first scroll input or after `restoreHoldDuration`.
 */
const holdScrollPosition = (scroller: HTMLElement, top: number, onRelease: () => void): (() => void) => {
  const observer = new ResizeObserver(() => {
    scroller.scrollTop = top;
  });
  observer.observe(scroller);
  for (const child of scroller.children) {
    observer.observe(child);
  }
  const release = (): void => {
    observer.disconnect();
    clearTimeout(holdTimeout);
    for (const type of restoreReleaseEvents) {
      scroller.removeEventListener(type, release);
    }
    onRelease();
  };
  const holdTimeout = setTimeout(release, restoreHoldDuration);
  for (const type of restoreReleaseEvents) {
    scroller.addEventListener(type, release, { passive: true });
  }
  return release;
};

// ponytail: one sessionStorage write per scroll event; batch on `scrollend` if it ever shows in a profile.
const saveScroll = (locationKey: string, scrollTop: number): void => {
  try {
    globalThis.sessionStorage.setItem(scrollStorageKey(locationKey), String(scrollTop));
  } catch {
    // Persistence is best-effort.
  }
};

type PageTitles = {
  /** The deepest `Handle.title`: what the phone top bar calls this page. */
  readonly title: string | undefined;
  /** The next titled match above it at another path: the back-to-parent crumb. */
  readonly parent: { readonly to: string; readonly label: string } | undefined;
  /** The titled match's own path: actions from routes above it belong to another page. */
  readonly path: string | undefined;
};

/**
 * The page's own title and its parent, read from the matched routes (D11). A nested
 * route (`/projects/new` under `/projects`) gets its parent's title and path as the
 * crumb; a top-level route, or a child that names no title of its own, gets none.
 * The desktop build keeps its titlebar and has no phone bar, so it gets neither.
 */
const resolvePageTitles = (matches: readonly TypedUiMatchWithHandle[], isDesktopTarget: boolean): PageTitles => {
  if (isDesktopTarget) {
    return { title: undefined, parent: undefined, path: undefined };
  }
  const titled = matches.flatMap((match) => {
    const title = typeof match.handle.title === 'function' ? match.handle.title(match) : match.handle.title;
    return title ? [{ to: match.pathname, label: title }] : [];
  });
  const page = titled.at(-1);
  const parent = titled.slice(0, -1).findLast((entry) => entry.to !== page?.to);
  return { title: page?.label, parent, path: page?.to };
};

/** Header classes that change when the phone bar carries a title; `md` and up keep today's header. */
const phoneBarClasses = (
  hasPhoneTitle: boolean,
): { readonly header: string | undefined; readonly cluster: string | undefined; readonly breadcrumbItem: string } =>
  hasPhoneTitle
    ? {
        header: 'max-md:border-b max-md:bg-sidebar',
        cluster: 'min-w-0 max-md:ml-1 max-md:flex-1',
        // Phones show the title instead of the trail's last item.
        breadcrumbItem: 'md:last:block',
      }
    : { header: undefined, cluster: undefined, breadcrumbItem: 'last:block' };

/**
 * The phone top bar's back-to-parent crumb ("‹ Projects", named "Back to Projects"), one 40px target whose label
 * truncates. Every phone bar that returns to a parent draws this one, so the words and the target stay the same (I6).
 *
 * @param props - The parent's path and title, and the caller's placement classes.
 * @returns The crumb.
 * @public
 */
export function PageParentCrumb({
  to,
  label,
  className,
}: {
  readonly to: string;
  readonly label: string;
  readonly className?: string;
}): React.JSX.Element {
  return (
    <Button
      asChild
      variant='ghost'
      size='lg'
      className={cn('min-w-0 gap-0.5', className)}
      data-slot='page-parent-crumb'
    >
      <Link to={to} aria-label={`Back to ${label}`}>
        <ChevronLeft aria-hidden />
        <span className='max-w-28 min-w-0 truncate'>{label}</span>
      </Link>
    </Button>
  );
}

/**
 * The phone top bar's back-to-parent crumb ("‹ Projects", named "Back to Projects")
 * and page title. From `md` up the breadcrumb trail orients instead.
 */
function PhonePageTitle({
  title,
  parent,
}: {
  readonly title: string;
  readonly parent: PageTitles['parent'];
}): React.JSX.Element {
  return (
    <>
      {parent ? <PageParentCrumb to={parent.to} label={parent.label} className='shrink-0 md:hidden' /> : null}
      {/* Not a heading, and hidden from assistive tech: the page's `PageHeader` keeps the one `<h1>` that names the page. */}
      <p aria-hidden data-slot='page-title' className='min-w-0 flex-1 truncate px-1 text-sm font-medium md:hidden'>
        {title}
      </p>
    </>
  );
}

const selectPageAction = (
  actionItems: readonly TypedUiMatchWithHandle[],
  pagePath: string | undefined,
): TypedUiMatchWithHandle | undefined => {
  const deepest = actionItems.at(-1);
  return deepest && pagePath !== undefined && deepest.pathname.length < pagePath.length ? undefined : deepest;
};

type HeaderLayout = {
  readonly reserveHeader: boolean;
  /** The header exists only as the phone top bar (no breadcrumb or all-width action). */
  readonly isPhoneOnly: boolean;
  /** `--header-height` for the inset. */
  readonly insetClass: string;
  /** The scroller's offset below the header. */
  readonly sectionClass: string | undefined;
  /** One of the `phoneTopBars` constants, so the context value is stable across renders. */
  readonly phoneTopBar: PhoneTopBar;
};

const phoneTopBars = {
  none: { hasTitle: false, hasAction: false },
  title: { hasTitle: true, hasAction: false },
  action: { hasTitle: false, hasAction: true },
  both: { hasTitle: true, hasAction: true },
} as const satisfies Record<string, PhoneTopBar>;

const selectPhoneTopBar = (hasTitle: boolean, hasAction: boolean): PhoneTopBar => {
  if (hasTitle) {
    return hasAction ? phoneTopBars.both : phoneTopBars.title;
  }
  return hasAction ? phoneTopBars.action : phoneTopBars.none;
};

/**
 * Where the route header sits. The phone top bar (D11) is decided from route facts
 * alone and placed by CSS (`md:hidden`, `md:[--header-height:0px]`), so the server
 * markup already paints a phone's bar and the page's hidden title: nothing moves
 * after hydration. An untitled route gets the bar too, holding only the sidebar trigger: it
 * used to be reserved from `isMobile`, which the server cannot know, so on a phone the whole
 * page moved down 48px when the app hydrated. `isMobile` now only matters to the desktop app.
 */
const resolveHeaderLayout = ({
  enablePageHeader,
  isDesktopTarget,
  isMobile,
  hasPageHeaderChrome,
  hasTitle,
  hasAction,
}: {
  readonly enablePageHeader: boolean;
  readonly isDesktopTarget: boolean;
  readonly isMobile: boolean;
  readonly hasPageHeaderChrome: boolean;
  readonly hasTitle: boolean;
  readonly hasAction: boolean;
}): HeaderLayout => {
  const hasPhoneBar = enablePageHeader && !isDesktopTarget;
  const reserveHeader = enablePageHeader && (hasPageHeaderChrome || (isDesktopTarget && isMobile) || hasPhoneBar);
  const isPhoneOnly = hasPhoneBar && !hasPageHeaderChrome;
  const phone = { phoneTopBar: selectPhoneTopBar(hasPhoneBar && hasTitle, hasPhoneBar && hasAction) };
  if (!reserveHeader) {
    return {
      reserveHeader,
      isPhoneOnly,
      insetClass: '[--header-height:0px]',
      sectionClass: enablePageHeader ? desktopTitlebarInset : undefined,
      ...phone,
    };
  }
  if (isPhoneOnly) {
    return {
      reserveHeader,
      isPhoneOnly,
      insetClass: '[--header-height:calc(var(--spacing)*12)] md:[--header-height:0px]',
      sectionClass: cn(phoneHeaderOffsetClasses, desktopTitlebarInset),
      ...phone,
    };
  }
  return {
    reserveHeader,
    isPhoneOnly,
    insetClass: isDesktopTarget
      ? '[--header-height:calc(var(--spacing)*9)]'
      : '[--header-height:calc(var(--spacing)*12)] md:[--header-height:calc(var(--spacing)*9)]',
    sectionClass: headerOffsetClasses,
    ...phone,
  };
};

/**
 * The shell's route header. From `md` up it holds the breadcrumb trail and the route
 * action; on phones (D11) it is the 48px top bar: sidebar trigger, back-to-parent
 * crumb, page title and at most one action.
 */
function PageShellHeader({
  isDesktopTarget,
  hasPageHeaderChrome,
  isPhoneOnly,
  breadcrumbItems,
  titles,
  actionMatch,
}: {
  readonly isDesktopTarget: boolean;
  readonly hasPageHeaderChrome: boolean;
  /** The header is only the phone top bar: hidden from `md` up, where it takes no room. */
  readonly isPhoneOnly: boolean;
  readonly breadcrumbItems: readonly TypedUiMatchWithHandle[];
  readonly titles: PageTitles;
  /** D11/I4: the deepest route that declares `actions`; only its one action renders. */
  readonly actionMatch: TypedUiMatchWithHandle | undefined;
}): React.JSX.Element {
  const hasBreadcrumbItems = breadcrumbItems.length > 0;
  const phoneBar = phoneBarClasses(titles.title !== undefined);
  const isPhoneOnlyAction = actionMatch?.handle.actionsScope === 'phone';
  return (
    <header
      className={cn(
        'pointer-events-none absolute top-0 z-20 flex h-(--header-height) w-full shrink-0 items-center justify-between gap-2',
        hasPageHeaderChrome && 'border-b bg-sidebar',
        phoneBar.header,
        isPhoneOnly && 'md:hidden',
      )}
    >
      <div
        className={cn(
          'pointer-events-auto ml-2 flex h-full items-center gap-1 md:group-data-[sidebar-open=false]/app-shell:ml-(--titlebar-controls-width)',
          !hasBreadcrumbItems && 'md:hidden',
          phoneBar.cluster,
          isDesktopTarget && '[app-region:no-drag]',
        )}
      >
        {/* I3: the phone bar's primary controls are 40px (`icon-lg`, `lg`). */}
        {isDesktopTarget ? null : <SidebarTrigger className='size-10 md:hidden' />}
        {titles.title === undefined ? null : <PhonePageTitle title={titles.title} parent={titles.parent} />}
        {hasBreadcrumbItems && !isDesktopTarget && titles.title === undefined ? (
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
                      <BreadcrumbItem className={cn('hidden hover:text-foreground lg:block', phoneBar.breadcrumbItem)}>
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
        className={cn('pointer-events-auto flex items-center gap-2 px-2', isDesktopTarget && '[app-region:no-drag]')}
      >
        {actionMatch && !(isPhoneOnlyAction && isDesktopTarget) ? (
          <div data-slot='page-header-action' className={cn('contents', isPhoneOnlyAction && 'md:hidden')}>
            {actionMatch.handle.actions?.(actionMatch)}
          </div>
        ) : null}
      </div>
    </header>
  );
}

/** Renders the main content area of the page: the route outlet, or the error content. */
function SectionContent({ error }: { readonly error: ReactNode | undefined }): React.JSX.Element {
  // oxlint-disable-next-line react/jsx-no-useless-fragment -- needed for consistent return type
  return <>{error ?? <Outlet />}</>;
}

const WebTitlebarControls = ({
  onSidebarResize,
}: {
  readonly onSidebarResize: (direction: 'narrower' | 'wider') => void;
}): React.JSX.Element => (
  <div
    data-slot='web-titlebar-controls'
    className='fixed top-0 left-0 z-50 hidden h-9 w-(--titlebar-controls-width) items-center gap-1 bg-transparent pr-1 pl-2 md:flex'
  >
    <TitlebarNavigation onSidebarResize={onSidebarResize} />
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
  const isFullscreen = useDesktopFullscreen();
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
          '--sidebar-panel-width': `${sidebarPreferredWidth}px`,
          '--titlebar-controls-width':
            open && !isMobile
              ? 'calc(var(--sidebar-panel-width) - 1px)'
              : isDesktopTarget
                ? isFullscreen
                  ? closedTitlebarControlsWidth
                  : windowedClosedTitlebarControlsWidth
                : browserClosedTitlebarControlsWidth,
          ...(isFullscreen ? { '--desktop-titlebar-inset': 'calc(var(--spacing) * 2)' } : {}),
        } as CSSProperties
      }
    >
      {isDesktopTarget ? (
        <span
          aria-hidden
          data-slot='desktop-drag-band'
          className='pointer-events-none fixed top-0 left-0 z-0 h-9 w-(--titlebar-controls-width) [app-region:drag]'
        />
      ) : null}
      {isDesktopTarget ? (
        <DesktopTitlebarControls isFullscreen={isFullscreen} onSidebarResize={resizeSidebar} />
      ) : (
        <WebTitlebarControls onSidebarResize={resizeSidebar} />
      )}
      <Allotment
        paneLabels={['Sidebar', 'Content']}
        id='application-allotment'
        ref={allotmentRef}
        proportionalLayout={false}
        separator={false}
        snap={false}
        className='size-full [--separator-border:var(--sidebar-border)]'
        onChange={(sizes) => {
          const sidebarWidth = sizes[0];
          if (sidebarWidth !== undefined && sidebarWidth > 0) {
            sidebarWidthRef.current = sidebarWidth;
            shellRef.current?.style.setProperty('--sidebar-panel-width', `${sidebarWidth}px`);
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
    titleItems,
    actionItems,
    pageWrapperMatches,
    enableOverflowY,
    providers,
    enablePageHeaderMatches,
  } = useTypedMatches((handles) => ({
    breadcrumbItems: handles.breadcrumb,
    hasBreadcrumbItems: handles.breadcrumb.length > 0,
    titleItems: handles.title,
    actionItems: handles.actions,
    pageWrapperMatches: handles.enablePageWrapper,
    enableOverflowY: handles.enableOverflowY.some((match) => match.handle.enableOverflowY === true),
    providers: handles.providers,
    enablePageHeaderMatches: handles.enablePageHeader,
  }));
  const { key: locationKey, pathname, hash } = useLocation();
  const navigationType = useNavigationType();
  const pageScrollRef = useRef<HTMLDivElement>(null);
  const previousPathnameRef = useRef(pathname);
  const isRestoringRef = useRef(false);
  useLayoutEffect(() => {
    const scroller = pageScrollRef.current;
    const isSamePage = previousPathnameRef.current === pathname;
    previousPathnameRef.current = pathname;
    if (!enableOverflowY || !scroller) {
      return;
    }
    if (navigationType === NavigationType.Replace && isSamePage) {
      // A filter or dialog written to the URL replaces the entry: stay put and
      // carry the offset over to the new key.
      saveScroll(locationKey, scroller.scrollTop);
      return;
    }
    // Back and Forward restore the entry's offset; a new entry starts at the top
    // (the scroller outlives the navigation).
    if (navigationType !== NavigationType.Pop) {
      scroller.scrollTop = 0;
      return;
    }
    const savedTop = readSavedScroll(locationKey);
    scroller.scrollTop = savedTop;
    // The top needs no hold, and a fragment names its own place, which the route scrolls to after this.
    if (savedTop === 0 || hash !== '') {
      return;
    }
    // Scrolls the settling layout causes are not the person's, so they are not saved.
    isRestoringRef.current = true;
    return holdScrollPosition(scroller, savedTop, () => {
      isRestoringRef.current = false;
    });
  }, [enableOverflowY, hash, locationKey, navigationType, pathname]);
  const handlePageScroll = useCallback(
    (event: UIEvent) => {
      if (!isRestoringRef.current) {
        saveScroll(locationKey, event.currentTarget.scrollTop);
      }
    },
    [locationKey],
  );
  // The phone top bar (web build below `md`): sidebar, back-to-parent crumb, title.
  const pageTitles = useMemo(() => resolvePageTitles(titleItems, desktopTarget), [desktopTarget, titleItems]);
  // D11/I4: one header action, from the deepest route that declares one, unless a deeper
  // titled page (`/projects/new` under `/projects`) sits below it: a parent's action is not the child's.
  const actionMatch = selectPageAction(actionItems, pageTitles.path);
  const enablePageHeader = !enablePageHeaderMatches.some((match) => match.handle.enablePageHeader === false);
  const hasPageHeaderChrome =
    hasBreadcrumbItems || (actionMatch !== undefined && actionMatch.handle.actionsScope !== 'phone');
  const isMobile = useIsMobile();
  const { reserveHeader, isPhoneOnly, insetClass, sectionClass, phoneTopBar } = resolveHeaderLayout({
    enablePageHeader,
    isDesktopTarget: desktopTarget,
    isMobile,
    hasPageHeaderChrome,
    hasTitle: pageTitles.title !== undefined,
    hasAction: actionMatch !== undefined,
  });

  // Resolve `enablePageWrapper` per match: a match disables the wrapper when its
  // value is `false`, or when its function form returns `false` for the current
  // viewer (see `Handle.enablePageWrapper`). The wrapper stays on unless some
  // match opts out.
  // Wrapperless routes retain native chrome; wrapped pages confine dragging to the controls island.
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
          <div ref={pageScrollRef} className='h-dvh overflow-y-auto' onScroll={handlePageScroll}>
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
      <SidebarProvider className='h-dvh min-h-0 overflow-hidden'>
        <ApplicationShell isDesktopTarget={desktopTarget}>
          <SidebarInset className={cn('size-full min-w-0', insetClass)}>
            {reserveHeader ? (
              <PageShellHeader
                isDesktopTarget={desktopTarget}
                hasPageHeaderChrome={hasPageHeaderChrome}
                isPhoneOnly={isPhoneOnly}
                breadcrumbItems={breadcrumbItems}
                titles={pageTitles}
                actionMatch={actionMatch}
              />
            ) : null}
            <section
              ref={pageScrollRef}
              className={cn('h-dvh', enableOverflowY && 'overflow-y-auto', sectionClass)}
              onScroll={enableOverflowY ? handlePageScroll : undefined}
            >
              <PhoneTopBarContext.Provider value={phoneTopBar}>
                <Compose components={Providers}>
                  <RouteCommandPaletteItems />
                  {/* Its compute section reads the active project; the dialog is a
                      portal, so only its place in the React tree matters. */}
                  <SettingsDialog />
                  <HomeFileManagerNotice />
                  <SectionContent error={error} />
                </Compose>
              </PhoneTopBarContext.Provider>
            </section>
          </SidebarInset>
        </ApplicationShell>
      </SidebarProvider>
    </CommandPaletteProvider>
  );
}
