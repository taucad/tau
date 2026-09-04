// @vitest-environment node
import { renderToString } from 'react-dom/server';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-router', () => ({
  Link: ({ children, to }: { readonly children: ReactNode; readonly to: string }) => <a href={to}>{children}</a>,
  Outlet: () => <div>Server route content</div>,
}));
vi.mock('#hooks/use-resolved-auth.js', () => ({ useResolvedAuth: () => 'authed' }));
vi.mock('#flags/use-feature.js', () => ({ useFeatureFlags: () => ({}) }));
vi.mock('#hooks/use-typed-matches.js', () => ({
  useTypedMatches: (selector: (handles: Record<string, unknown[]>) => unknown) =>
    selector({
      breadcrumb: [],
      actions: [],
      commandPalette: [],
      enablePageWrapper: [],
      enablePageHeader: [{ handle: { enablePageHeader: false } }],
      enableOverflowY: [],
      providers: [],
      enablePageFooter: [],
    }),
}));
vi.mock('#components/layout/app-sidebar.js', () => ({ AppSidebar: () => <aside>Server sidebar</aside> }));
vi.mock('#components/layout/desktop-titlebar-controls.js', () => ({ DesktopTitlebarControls: () => null }));
vi.mock('#components/ui/sidebar.js', () => ({
  SidebarProvider: ({ children }: { readonly children: ReactNode }) => <div>{children}</div>,
  SidebarInset: ({ children }: { readonly children: ReactNode }) => <main>{children}</main>,
  SidebarTrigger: () => <button type='button'>Toggle Sidebar</button>,
  useSidebar: () => ({ isMobile: false, open: true }),
}));
vi.mock('@taucad/ui/components/breadcrumb', () => ({
  Breadcrumb: ({ children }: { readonly children: ReactNode }) => <nav>{children}</nav>,
  BreadcrumbItem: ({ children }: { readonly children: ReactNode }) => <span>{children}</span>,
  BreadcrumbLink: ({ children }: { readonly children: ReactNode }) => <span>{children}</span>,
  BreadcrumbList: ({ children }: { readonly children: ReactNode }) => <div>{children}</div>,
  BreadcrumbSeparator: () => null,
}));
vi.mock('@taucad/ui/components/separator', () => ({ Separator: () => null }));
vi.mock('#components/ui/utils/compose.js', () => ({
  Compose: ({ children }: { readonly children: ReactNode }) => <div>{children}</div>,
}));
vi.mock('#components/layout/page-footer.js', () => ({ PageFooter: () => null }));
vi.mock('#components/icons/tau-wordmark.js', () => ({ TauWordmark: () => <svg /> }));
vi.mock('#components/cookie-consent.js', () => ({ CookieConsent: () => null }));
vi.mock('#components/settings/settings-dialog.js', () => ({ SettingsDialog: () => null }));

const { Page } = await import('#components/layout/page.js');

describe('Page server rendering', () => {
  it('keeps both Allotment panes and route content in the server output', () => {
    const html = renderToString(<Page />);

    expect(html).toContain('split-view');
    expect(html).toContain('Server sidebar');
    expect(html).toContain('Server route content');
  });
});
