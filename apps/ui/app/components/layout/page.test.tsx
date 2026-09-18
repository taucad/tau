// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react';
import { createContext, forwardRef, useContext, useEffect, useImperativeHandle } from 'react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ResolvedAuth } from '#hooks/use-resolved-auth.js';
import type { PageChromeContext } from '#types/matches.types.js';

const state = vi.hoisted(() => ({
  authState: 'authed' as ResolvedAuth,
  enablePageHeader: undefined as boolean | undefined,
  enablePageWrapper: undefined as boolean | ((context: PageChromeContext) => boolean) | undefined,
  hasBreadcrumb: false,
  isMobile: false,
  sidebarOpen: true,
  allotmentResize: vi.fn(),
  providers: [] as Array<{ handle: { providers: () => React.JSXElementConstructor<React.PropsWithChildren> } }>,
  commandPalette: [] as Array<{ id: string; handle: { commandPalette: () => ReactNode } }>,
  sidebarMounts: 0,
}));

vi.mock('react-router', () => ({
  Link: ({ children, to, ...properties }: { readonly children: ReactNode; readonly to: string }) => (
    <a {...properties} href={to} rel='noreferrer'>
      {children}
    </a>
  ),
  Outlet: () => <div>Page content</div>,
}));
vi.mock('allotment', () => {
  const Pane = ({ children, visible = true }: React.PropsWithChildren<{ readonly visible?: boolean }>) => (
    <div data-pane data-visible={visible}>
      {children}
    </div>
  );
  const Allotment = Object.assign(
    forwardRef<
      { readonly resize: (sizes: number[]) => void },
      React.PropsWithChildren<{ readonly onChange?: (sizes: number[]) => void }>
    >(({ children }, reference) => {
      useImperativeHandle(reference, () => ({ resize: state.allotmentResize }));
      return <div data-slot='application-allotment'>{children}</div>;
    }),
    { Pane },
  );
  return { Allotment, LayoutPriority: { Low: 0, High: 1 } };
});
vi.mock('#hooks/use-resolved-auth.js', () => ({ useResolvedAuth: () => state.authState }));
vi.mock('#flags/use-feature.js', () => ({ useFeatureFlags: () => ({}) }));
vi.mock('#hooks/use-typed-matches.js', () => ({
  useTypedMatches: (selector: (handles: Record<string, unknown[]>) => unknown) =>
    selector({
      breadcrumb: state.hasBreadcrumb
        ? [{ id: 'breadcrumb', handle: { breadcrumb: () => <span>Projects</span> } }]
        : [],
      actions: [],
      commandPalette: state.commandPalette,
      enablePageWrapper:
        state.enablePageWrapper === undefined ? [] : [{ handle: { enablePageWrapper: state.enablePageWrapper } }],
      enablePageHeader:
        state.enablePageHeader === undefined ? [] : [{ handle: { enablePageHeader: state.enablePageHeader } }],
      enableOverflowY: [],
      providers: state.providers,
      enablePageFooter: [],
    }),
}));
vi.mock('#components/layout/app-sidebar.js', () => ({
  AppSidebar: () => {
    /* The probe is the sidebar's mount, because that is what a person loses
     * when the shell is re-created below a new provider (Finding 5b). */
    useEffect(() => {
      state.sidebarMounts += 1;
    }, []);
    return <aside aria-label='Application sidebar'>Sidebar</aside>;
  },
}));
vi.mock('#components/layout/desktop-titlebar-controls.js', () => ({
  DesktopTitlebarControls: () => <div data-slot='desktop-titlebar-controls' />,
}));
vi.mock('#components/ui/sidebar.js', () => ({
  SidebarProvider: ({ children }: { readonly children: ReactNode }) => <div>{children}</div>,
  SidebarInset: ({ children, className }: { readonly children: ReactNode; readonly className?: string }) => (
    <main className={className}>{children}</main>
  ),
  SidebarTrigger: ({
    onSidebarResize,
    onKeyDown,
    ...properties
  }: React.ComponentProps<'button'> & {
    readonly onSidebarResize?: (direction: 'narrower' | 'wider') => void;
  }) => (
    <button
      type='button'
      onKeyDown={(event) => {
        onKeyDown?.(event);
        if (event.key === 'ArrowLeft') {
          onSidebarResize?.('narrower');
        } else if (event.key === 'ArrowRight') {
          onSidebarResize?.('wider');
        }
      }}
      {...properties}
    >
      Toggle Sidebar
    </button>
  ),
  useSidebar: () => ({ isMobile: state.isMobile, open: state.sidebarOpen }),
}));
vi.mock('@taucad/ui/components/breadcrumb', () => ({
  Breadcrumb: ({ children }: { readonly children: ReactNode }) => <nav>{children}</nav>,
  BreadcrumbItem: ({ children }: { readonly children: ReactNode }) => <span>{children}</span>,
  BreadcrumbLink: ({ children }: { readonly children: ReactNode }) => <span>{children}</span>,
  BreadcrumbList: ({ children }: { readonly children: ReactNode }) => <div>{children}</div>,
  BreadcrumbSeparator: () => <span>/</span>,
}));
vi.mock('@taucad/ui/components/separator', () => ({ Separator: () => <span /> }));
vi.mock('#components/layout/page-footer.js', () => ({ PageFooter: () => <footer /> }));
vi.mock('#components/icons/tau-wordmark.js', () => ({
  TauWordmark: (properties: React.ComponentProps<'svg'>) => <svg {...properties} />,
}));
vi.mock('#components/cookie-consent.js', () => ({ CookieConsent: () => null }));
vi.mock('#components/settings/settings-dialog.js', () => ({
  /* `ComputeReuseSettings` inside the real dialog reads the project context the
   * matched route contributes, so the dialog is probed the same way. */
  SettingsDialog: () => (useContext(RouteProviderContext) ? <span>Settings dialog</span> : undefined),
}));

const { Page } = await import('#components/layout/page.js');

beforeEach(() => {
  state.authState = 'authed';
  state.enablePageHeader = undefined;
  state.enablePageWrapper = undefined;
  state.hasBreadcrumb = false;
  state.isMobile = false;
  state.sidebarOpen = true;
  state.allotmentResize.mockReset();
  state.providers = [];
  state.commandPalette = [];
  state.sidebarMounts = 0;
  vi.unstubAllEnvs();
});

const RouteProviderContext = createContext(false);

/** What a route handle contributes: a component wrapped around the page. */
function RouteProvider({ children }: React.PropsWithChildren): React.JSX.Element {
  return (
    <RouteProviderContext.Provider value>
      <div data-slot='route-provider'>{children}</div>
    </RouteProviderContext.Provider>
  );
}

/**
 * Stands in for `ProjectCommandPaletteItems`: it needs its own route's context
 * and renders nothing without it, which is how the project palette emptied
 * silently once the shell moved above the composed providers.
 */
function RouteCommandPaletteProbe(): React.JSX.Element | undefined {
  return useContext(RouteProviderContext) ? <span>Project commands</span> : undefined;
}

describe('Page application shell', () => {
  it('renders stable sidebar and main Allotment panes', () => {
    const { container } = render(<Page />);
    const panes = container.querySelectorAll('[data-pane]');

    expect(container.querySelector('[data-slot=application-allotment]')).toBeInTheDocument();
    expect(panes).toHaveLength(2);
    expect(panes[0]).toHaveAttribute('data-visible', 'true');
    expect(screen.getByRole('main')).toContainElement(screen.getByText('Page content'));
  });

  it('controls sidebar pane visibility without removing main content', () => {
    const { container, rerender } = render(<Page />);
    const routeContent = screen.getByText('Page content');
    const sidebarTrigger = within(container.querySelector<HTMLElement>('[data-slot=web-titlebar-controls]')!).getByRole(
      'button',
      { name: 'Toggle Sidebar' },
    );

    state.sidebarOpen = false;
    rerender(<Page />);
    const panes = container.querySelectorAll('[data-pane]');

    expect(panes[0]).toHaveAttribute('data-visible', 'false');
    expect(screen.getByText('Page content')).toBe(routeContent);
    expect(
      within(container.querySelector<HTMLElement>('[data-slot=web-titlebar-controls]')!).getByRole('button', {
        name: 'Toggle Sidebar',
      }),
    ).toBe(sidebarTrigger);
  });

  it('should keep the sidebar mounted when the matched routes start contributing providers', () => {
    const { rerender } = render(<Page />);
    expect(state.sidebarMounts).toBe(1);

    /* Home → project: the project route contributes one provider, so the
     * composed list grows. The shell must not be re-created below it. */
    state.providers = [{ handle: { providers: () => RouteProvider } }];
    rerender(<Page />);

    expect(screen.getByText('Page content').closest('[data-slot=route-provider]')).not.toBeNull();
    expect(state.sidebarMounts).toBe(1);
  });

  it("should render a route's command palette items inside that route's providers", () => {
    state.providers = [{ handle: { providers: () => RouteProvider } }];
    state.commandPalette = [{ id: 'project', handle: { commandPalette: () => <RouteCommandPaletteProbe /> } }];

    render(<Page />);

    expect(screen.getByText('Project commands').closest('[data-slot=route-provider]')).not.toBeNull();
  });

  it('should render the settings dialog inside the matched routes providers', () => {
    state.providers = [{ handle: { providers: () => RouteProvider } }];

    render(<Page />);

    expect(screen.getByText('Settings dialog').closest('[data-slot=route-provider]')).not.toBeNull();
  });

  it('hides the outer sidebar pane on mobile while keeping main content mounted', () => {
    state.isMobile = true;
    const { container } = render(<Page />);
    const panes = container.querySelectorAll('[data-pane]');

    expect(panes[0]).toHaveAttribute('data-visible', 'false');
    expect(screen.getByText('Page content')).toBeInTheDocument();
  });

  it('keeps the browser wordmark and sidebar control adjacent', () => {
    const { container } = render(<Page />);
    const controls = container.querySelector<HTMLElement>('[data-slot=web-titlebar-controls]');
    expect(controls).not.toBeNull();
    const controlRegion = controls!;

    expect(controlRegion.children[0]).toBe(within(controlRegion).getByRole('link', { name: 'Home' }));
    expect(controlRegion.children[1]).toBe(within(controlRegion).getByRole('button', { name: 'Toggle Sidebar' }));
    expect(controlRegion.children).toHaveLength(2);
    // The wordmark clears the first control by the row's own gap, not a wider one.
    expect(controlRegion).toHaveClass('gap-1', 'pl-2', 'pr-1');
    expect(controlRegion).not.toHaveClass('gap-2', 'px-2');
    expect(
      container
        .querySelector<HTMLElement>('[data-slot=application-shell]')
        ?.style.getPropertyValue('--titlebar-controls-width'),
    ).toBe('calc(var(--spacing) * 26)');
  });

  it('resizes the sidebar by 16px and clamps to the pane bounds', () => {
    const { container } = render(<Page />);
    const shell = container.querySelector<HTMLElement>('[data-slot=application-shell]');
    const controls = container.querySelector<HTMLElement>('[data-slot=web-titlebar-controls]');
    expect(controls).not.toBeNull();
    const trigger = within(controls!).getByRole('button', { name: 'Toggle Sidebar' });
    Object.defineProperty(shell, 'clientWidth', { value: 1024 });
    trigger.focus();

    fireEvent.keyDown(trigger, { key: 'ArrowLeft' });
    fireEvent.keyDown(trigger, { key: 'ArrowLeft' });
    fireEvent.keyDown(trigger, { key: 'ArrowLeft' });

    expect(state.allotmentResize).toHaveBeenNthCalledWith(1, [208, 816]);
    expect(state.allotmentResize).toHaveBeenNthCalledWith(2, [192, 832]);
    expect(state.allotmentResize).toHaveBeenCalledTimes(2);

    for (let index = 0; index < 19; index += 1) {
      fireEvent.keyDown(trigger, { key: 'ArrowRight' });
    }

    expect(state.allotmentResize).toHaveBeenLastCalledWith([480, 544]);
    expect(state.allotmentResize).toHaveBeenCalledTimes(20);
  });
});

describe('Page header contract', () => {
  it('renders responsive browser header height by default', () => {
    const { container } = render(<Page />);

    expect(container.querySelector('header')).toBeInTheDocument();
    expect(container.querySelector('main')).toHaveClass(
      '[--header-height:calc(var(--spacing)*12)]',
      'md:[--header-height:calc(var(--spacing)*9)]',
    );
    expect(container.querySelector('section')).toHaveClass('mt-(--header-height)');
  });

  it('removes route header DOM and offset while retaining application controls', () => {
    state.enablePageHeader = false;
    const { container } = render(<Page />);

    expect(container.querySelector('header')).not.toBeInTheDocument();
    expect(container.querySelector('main')).toHaveClass('[--header-height:0px]');
    expect(container.querySelector('section')).not.toHaveClass('mt-(--header-height)');
    expect(container.querySelector('[data-slot=web-titlebar-controls]')).toBeInTheDocument();
  });

  it('keeps a continuous desktop header surface when a route supplies chrome', () => {
    state.hasBreadcrumb = true;
    vi.stubEnv('TAU_TARGET', 'desktop');
    const { container } = render(<Page />);

    expect(container.querySelector('[data-slot=desktop-titlebar-controls]')).toBeInTheDocument();
    expect(container.querySelector('[data-slot=web-titlebar-controls]')).not.toBeInTheDocument();
    expect(container.querySelector('main')).toHaveClass('[--header-height:calc(var(--spacing)*9)]');
    expect(container.querySelector('header')).toHaveClass('h-(--header-height)', 'border-b', 'bg-sidebar');
    expect(
      container
        .querySelector<HTMLElement>('[data-slot=application-shell]')
        ?.style.getPropertyValue('--titlebar-controls-width'),
    ).toBe('calc(var(--spacing) * 44)');
    expect(container.querySelector('header > div')).toHaveClass(
      'md:group-data-[sidebar-open=false]/app-shell:ml-(--titlebar-controls-width)',
    );
  });
});

describe('Desktop window drag band', () => {
  it('spans the window on desktop and leaves the header chrome clickable', () => {
    state.hasBreadcrumb = true;
    vi.stubEnv('TAU_TARGET', 'desktop');
    const { container } = render(<Page />);

    expect(container.querySelector('[data-slot=desktop-drag-band]')).toHaveClass(
      'fixed',
      'inset-x-0',
      'top-0',
      'h-9',
      '[app-region:drag]',
    );
    for (const chrome of container.querySelectorAll('header > div')) {
      expect(chrome).toHaveClass('[app-region:no-drag]');
    }
  });

  it('survives the routes that opt out of the application shell', () => {
    state.enablePageWrapper = false;
    vi.stubEnv('TAU_TARGET', 'desktop');
    const { container } = render(<Page />);

    expect(container.querySelector('[data-slot=application-shell]')).not.toBeInTheDocument();
    expect(container.querySelector('[data-slot=desktop-drag-band]')).toBeInTheDocument();
  });

  it('stays out of the browser build, which keeps its own title bar', () => {
    const { container } = render(<Page />);

    expect(container.querySelector('[data-slot=desktop-drag-band]')).not.toBeInTheDocument();
    expect(container.querySelector('header > div')).not.toHaveClass('[app-region:no-drag]');
  });
});

describe('Page auth-aware wrapper contract', () => {
  it.each([
    ['authed', true],
    ['anonymous', false],
    ['indeterminate', true],
  ] as const)('passes %s auth through without collapsing it to a boolean', (authState, shouldRenderSidebar) => {
    state.authState = authState;
    state.enablePageWrapper = ({ authState: resolvedAuth }) => resolvedAuth !== 'anonymous';

    render(<Page />);

    if (shouldRenderSidebar) {
      expect(screen.getByText('Sidebar')).toBeInTheDocument();
    } else {
      expect(screen.queryByText('Sidebar')).not.toBeInTheDocument();
    }
  });
});
