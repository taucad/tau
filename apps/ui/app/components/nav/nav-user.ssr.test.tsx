// @vitest-environment node
import { renderToString } from 'react-dom/server';
import type { ReactElement, ReactNode } from 'react';
import { isValidElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { pageOrigin } from '#lib/website-origin.js';

/* A document render has no `location`. Reading one from the sidebar threw, which failed the pane's
 * Suspense boundary, and React's `onError` then answered every route carrying the application shell
 * with 500 while the shell itself still streamed. Nothing logged it, because the error arrived
 * before the shell had rendered. This file renders the real component on the server instead. */

vi.mock('react-router', () => ({
  Link: ({ children, to }: { readonly children: ReactNode; readonly to: string }) => <a href={to}>{children}</a>,
  useLocation: () => ({ key: 'default', pathname: '/' }),
}));
vi.mock('@taucad/billing/hooks/use-entitlements', () => ({
  useEntitlements: () => ({ tier: 'free', isResolved: true }),
}));
vi.mock('#components/auth/user/user-button.js', () => ({
  UserButton: ({ links }: { readonly links?: Array<{ readonly href: string } | ReactElement> }) => (
    <div>{links?.map((link) => (isValidElement(link) ? link : <a key={link.href} href={link.href} />))}</div>
  ),
}));
vi.mock('#hooks/use-network-connectivity.js', () => ({ useNetworkConnectivity: () => true }));
vi.mock('#hooks/use-settings-dialog.js', () => ({ useSettingsDialog: () => ({ open: () => undefined }) }));
vi.mock('@taucad/ui/components/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { readonly children?: ReactNode }) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: { readonly children?: ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({ children }: { readonly children?: ReactNode }) => <div>{children}</div>,
  DropdownMenuLabel: ({ children }: { readonly children?: ReactNode }) => <div>{children}</div>,
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuTrigger: ({ children }: { readonly children?: ReactNode }) => <div>{children}</div>,
}));
vi.mock('@taucad/ui/components/client-only', () => ({
  ClientOnly: ({ children }: { readonly children?: ReactNode }) => <div>{children}</div>,
}));
vi.mock('@taucad/ui/components/tooltip', () => ({
  Tooltip: ({ children }: { readonly children?: ReactNode }) => <div>{children}</div>,
  TooltipTrigger: ({ children }: { readonly children?: ReactNode }) => <span>{children}</span>,
  TooltipContent: ({ children }: { readonly children?: ReactNode }) => <span>{children}</span>,
}));
vi.mock('#components/icons/svg-icon.js', () => ({ SvgIcon: () => <span aria-hidden /> }));
vi.mock('#components/tier-badge.js', () => ({ ProBadge: () => <span>Pro</span> }));

/* A server render reads its environment from process.env, as the SSR server is configured. */
vi.stubEnv('TAU_API_URL', 'http://localhost:4000');
vi.stubEnv('TAU_WEBSOCKET_URL', 'ws://localhost:4001');
vi.stubEnv('TAU_FRONTEND_URL', 'http://localhost:3000');

const { NavUser } = await import('#components/nav/nav-user.js');

describe('the nav user on the server', () => {
  it('reports no page origin where there is no document', () => {
    expect('location' in globalThis).toBe(false);
    expect(pageOrigin()).toBeUndefined();
  });

  it('renders, and sends the website link to the public site', () => {
    const html = renderToString(<NavUser />);

    expect(html).toContain('https://tau.new/');
    expect(html).toContain('Visit website');
  });
});
