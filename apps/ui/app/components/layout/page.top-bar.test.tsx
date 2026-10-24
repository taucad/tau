// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Outlet, RouterProvider, createMemoryRouter } from 'react-router';
import type { RouteObject } from 'react-router';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import { KeyboardProvider } from '@taucad/ui/components/keyboard';
import type { Handle } from '#types/matches.types.js';

/*
 * D11/W9: the phone top bar is read from the matched routes' handles, so this
 * renders the real `Page`, `useTypedMatches`, sidebar trigger and router. Only
 * the shell's unrelated owners (sidebar content, settings, palette, auth) are stubbed.
 */
const viewport = vi.hoisted(() => ({ isMobile: true }));

vi.mock('@taucad/ui/hooks/use-mobile', () => ({ useIsMobile: () => viewport.isMobile }));
vi.mock('#hooks/use-cookie.js', async () => {
  const React = await import('react');
  return {
    useCookie: <Value,>(_name: string, defaultValue: Value) => React.useState(defaultValue),
  };
});
vi.mock('#hooks/use-resolved-auth.js', () => ({ useResolvedAuth: () => 'authed' }));
vi.mock('#flags/use-feature.js', () => ({ useFeatureFlags: () => ({}) }));
vi.mock('#components/layout/app-sidebar.js', () => ({ AppSidebar: () => <aside>Sidebar</aside> }));
vi.mock('#components/layout/desktop-titlebar-controls.js', () => ({
  DesktopTitlebarControls: () => null,
  TitlebarNavigation: () => null,
}));
vi.mock('#components/layout/command-palette.js', () => ({
  CommandPaletteProvider: ({ children }: { readonly children: ReactNode }): ReactNode => children,
  RouteCommandPaletteItems: () => null,
}));
vi.mock('#components/settings/settings-dialog.js', () => ({ SettingsDialog: () => null }));

const { Page } = await import('#components/layout/page.js');

const projectsHandle: Handle = {
  title: 'Projects',
  actions: () => <button type='button'>Import project</button>,
};
const newProjectHandle: Handle = {
  title: 'New project',
  actions: () => <button type='button'>Create from template</button>,
};

const routes: RouteObject[] = [
  {
    path: '/',
    Component: () => <Page />,
    children: [
      {
        path: 'projects',
        handle: projectsHandle,
        Component: () => (
          <>
            <h1>Projects page</h1>
            <Outlet />
          </>
        ),
        children: [{ path: 'new', handle: newProjectHandle, Component: () => <p>New project form</p> }],
      },
      { path: 'community', handle: { title: 'Community' } satisfies Handle, Component: () => <h1>Community</h1> },
      {
        path: 'trail',
        handle: {
          breadcrumb: () => [
            <a key='alpha' href='/alpha'>
              Alpha
            </a>,
            <a key='beta' href='/trail'>
              Beta
            </a>,
          ],
        } satisfies Handle,
        Component: () => <h1>Trail</h1>,
      },
    ],
  },
];

const renderAt = (path: string) => {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const view = render(
    <KeyboardProvider>
      <TooltipProvider>
        <RouterProvider router={router} />
      </TooltipProvider>
    </KeyboardProvider>,
  );
  const header = (): HTMLElement => {
    const element = view.container.querySelector('header');
    if (!element) {
      throw new Error('Page header missing');
    }
    return element;
  };
  return { ...view, router, header };
};

beforeEach(() => {
  viewport.isMobile = true;
});

describe('Page phone top bar', () => {
  it('shows a back crumb on a nested route that returns to its parent', async () => {
    const user = userEvent.setup();
    const { router, header } = renderAt('/projects/new');

    const crumb = within(header()).getByRole('link', { name: 'Back to Projects' });
    expect(crumb).toHaveTextContent('Projects');
    expect(crumb).toHaveAttribute('href', '/projects');
    expect(crumb).toHaveClass('h-10');
    expect(within(header()).getByText('New project')).toHaveAttribute('data-slot', 'page-title');

    await user.click(crumb);

    expect(router.state.location.pathname).toBe('/projects');
    expect(within(header()).queryByRole('link', { name: /^Back to/u })).not.toBeInTheDocument();
    expect(within(header()).getByText('Projects')).toHaveAttribute('data-slot', 'page-title');
  });

  it('shows no crumb on a top-level route, only the trigger and the title', () => {
    const { header } = renderAt('/community');

    expect(within(header()).queryByRole('link', { name: /^Back to/u })).not.toBeInTheDocument();
    expect(within(header()).getByText('Community')).toHaveAttribute('data-slot', 'page-title');
    expect(header()).toHaveClass('max-md:border-b', 'max-md:bg-sidebar');
  });

  it('keeps the page title out of the heading outline so the page owns its one h1', () => {
    const { header } = renderAt('/community');

    expect(within(header()).queryByRole('heading')).not.toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('renders one header action, from the deepest route that declares one', () => {
    const { header } = renderAt('/projects/new');

    expect(within(header()).getByRole('button', { name: 'Create from template' })).toBeInTheDocument();
    expect(within(header()).queryByRole('button', { name: 'Import project' })).not.toBeInTheDocument();
  });

  it('gives the sidebar trigger a 40px target', () => {
    const { header } = renderAt('/community');

    const trigger = header().querySelector('[data-slot=sidebar-trigger]');
    expect(trigger).toHaveClass('size-10', 'md:hidden');
    expect(trigger).not.toHaveClass('size-7');
  });
});

describe('Page header on wide viewports', () => {
  beforeEach(() => {
    viewport.isMobile = false;
  });

  it('adds no header to a titled route that supplies no breadcrumb or action', () => {
    const { container } = renderAt('/community');

    expect(container.querySelector('header')).not.toBeInTheDocument();
    expect(container.querySelector('main')).toHaveClass('[--header-height:0px]');
  });

  it('keeps the breadcrumb trail, last item below lg and all from lg', () => {
    const { header } = renderAt('/trail');

    expect(header()).toHaveClass('border-b', 'bg-sidebar');
    const trail = within(header()).getByRole('navigation', { name: 'breadcrumb' });
    const items = within(trail).getAllByRole('listitem');
    expect(items.map((item) => item.textContent)).toEqual(['Alpha', 'Beta']);
    for (const item of items) {
      expect(item).toHaveClass('hidden', 'last:block', 'lg:block');
    }
    expect(header().querySelector('[data-slot=page-title]')).not.toBeInTheDocument();
  });
});
