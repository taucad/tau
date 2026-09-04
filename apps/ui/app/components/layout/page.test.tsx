// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react';
import { forwardRef, useImperativeHandle } from 'react';
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
      commandPalette: [],
      enablePageWrapper:
        state.enablePageWrapper === undefined ? [] : [{ handle: { enablePageWrapper: state.enablePageWrapper } }],
      enablePageHeader:
        state.enablePageHeader === undefined ? [] : [{ handle: { enablePageHeader: state.enablePageHeader } }],
      enableOverflowY: [],
      providers: [],
      enablePageFooter: [],
    }),
}));
vi.mock('#components/layout/app-sidebar.js', () => ({
  AppSidebar: () => <aside aria-label='Application sidebar'>Sidebar</aside>,
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
vi.mock('#components/ui/utils/compose.js', () => ({
  Compose: ({ children }: { readonly children: ReactNode }) => <div>{children}</div>,
}));
vi.mock('#components/layout/page-footer.js', () => ({ PageFooter: () => <footer /> }));
vi.mock('#components/icons/tau-wordmark.js', () => ({
  TauWordmark: (properties: React.ComponentProps<'svg'>) => <svg {...properties} />,
}));
vi.mock('#components/cookie-consent.js', () => ({ CookieConsent: () => null }));
vi.mock('#components/settings/settings-dialog.js', () => ({ SettingsDialog: () => null }));

const { Page } = await import('#components/layout/page.js');

beforeEach(() => {
  state.authState = 'authed';
  state.enablePageHeader = undefined;
  state.enablePageWrapper = undefined;
  state.hasBreadcrumb = false;
  state.isMobile = false;
  state.sidebarOpen = true;
  state.allotmentResize.mockReset();
  vi.unstubAllEnvs();
});

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
    expect(container.querySelector('header > div')).toHaveClass(
      'md:group-data-[sidebar-open=false]/app-shell:ml-(--titlebar-controls-width)',
    );
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
