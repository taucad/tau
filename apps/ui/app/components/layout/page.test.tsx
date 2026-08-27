// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import type { CSSProperties, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ResolvedAuth } from '#hooks/use-resolved-auth.js';
import type { PageChromeContext } from '#types/matches.types.js';

const state = vi.hoisted(() => ({
  authState: 'authed' as ResolvedAuth,
  enablePageHeader: undefined as boolean | undefined,
  enablePageWrapper: undefined as boolean | ((context: PageChromeContext) => boolean) | undefined,
}));

vi.mock('react-router', () => ({ Outlet: () => <div>Page content</div> }));
vi.mock('#hooks/use-resolved-auth.js', () => ({ useResolvedAuth: () => state.authState }));
vi.mock('#flags/use-feature.js', () => ({ useFeatureFlags: () => ({}) }));
vi.mock('#hooks/use-typed-matches.js', () => ({
  useTypedMatches: (selector: (handles: Record<string, unknown[]>) => unknown) =>
    selector({
      breadcrumb: [],
      actions: [],
      commandPalette: [],
      enablePageWrapper:
        state.enablePageWrapper === undefined ? [] : [{ handle: { enablePageWrapper: state.enablePageWrapper } }],
      enablePageHeader:
        state.enablePageHeader === undefined ? [] : [{ handle: { enablePageHeader: state.enablePageHeader } }],
      enableFloatingSidebar: [],
      enableOverflowY: [],
      providers: [],
      enablePageFooter: [],
    }),
}));
vi.mock('#components/layout/app-sidebar.js', () => ({ AppSidebar: () => <aside>Sidebar</aside> }));
vi.mock('#components/ui/sidebar.js', () => ({
  SidebarProvider: ({ children }: { readonly children: ReactNode }) => <div>{children}</div>,
  SidebarInset: ({ children, style }: { readonly children: ReactNode; readonly style?: CSSProperties }) => (
    <main style={style}>{children}</main>
  ),
  SidebarTrigger: ({ children }: { readonly children: ReactNode }) => <button type='button'>{children}</button>,
}));
vi.mock('#components/ui/breadcrumb.js', () => ({
  Breadcrumb: ({ children }: { readonly children: ReactNode }) => <nav>{children}</nav>,
  BreadcrumbItem: ({ children }: { readonly children: ReactNode }) => <span>{children}</span>,
  BreadcrumbLink: ({ children }: { readonly children: ReactNode }) => <span>{children}</span>,
  BreadcrumbList: ({ children }: { readonly children: ReactNode }) => <div>{children}</div>,
  BreadcrumbSeparator: () => <span>/</span>,
}));
vi.mock('#components/ui/separator.js', () => ({ Separator: () => <span /> }));
vi.mock('#components/ui/utils/compose.js', () => ({
  Compose: ({ children }: { readonly children: ReactNode }) => <div>{children}</div>,
}));
vi.mock('#components/layout/page-footer.js', () => ({ PageFooter: () => <footer /> }));
vi.mock('#components/layout/sidebar-offset.js', () => ({
  SidebarOffset: ({ children }: { readonly children: ReactNode }) => <div>{children}</div>,
}));
vi.mock('#components/cookie-consent.js', () => ({ CookieConsent: () => null }));
vi.mock('#components/settings/settings-dialog.js', () => ({ SettingsDialog: () => null }));

const { Page, headerHeight } = await import('#components/layout/page.js');

beforeEach(() => {
  state.authState = 'authed';
  state.enablePageHeader = undefined;
  state.enablePageWrapper = undefined;
});

describe('Page header contract', () => {
  it('renders the generic header by default', () => {
    const { container } = render(<Page />);

    expect(container.querySelector('header')).toBeInTheDocument();
    expect(container.querySelector('main')).toHaveStyle({ '--header-height': headerHeight });
    expect(container.querySelector('section')).toHaveClass('mt-(--header-height)');
  });

  it('removes the header DOM and offset when a route opts out', () => {
    state.enablePageHeader = false;
    const { container } = render(<Page />);

    expect(container.querySelector('header')).not.toBeInTheDocument();
    expect(container.querySelector('main')).toHaveStyle({ '--header-height': '0px' });
    expect(container.querySelector('section')).not.toHaveClass('mt-(--header-height)');
    expect(container.querySelector('section')).not.toHaveClass('h-[calc(100dvh-var(--header-height)-1px)]');
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
