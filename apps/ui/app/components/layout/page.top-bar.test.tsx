// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import { act } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import userEvent from '@testing-library/user-event';
import { Outlet, RouterProvider, createMemoryRouter } from 'react-router';
import type { RouteObject } from 'react-router';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
vi.mock('#flags/use-feature.js', () => ({ useFeatureFlags: () => ({}), useFeature: () => false }));
vi.mock('#hooks/use-settings-dialog.js', () => ({ useSettingsDialog: () => ({ open: vi.fn() }) }));
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
const { PageHeader } = await import('#components/layout/page-header.js');
const { NewProjectLink } = await import('#components/project-library/project-library.js');
// The real route modules: `/projects` contributes the bar's New project, `/parts` its turned-off state.
const projectsRoute = await import('#routes/projects_/route.js');
const partsRoute = await import('#routes/parts/route.js');

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
      {
        // `/projects` with its real handle; the content stands in for `ProjectLibrary`'s title row.
        path: 'library',
        handle: projectsRoute.handle,
        Component: () => (
          <>
            <PageHeader title='Projects' action={<NewProjectLink isDeferredToPhoneBar />} />
            <Outlet />
          </>
        ),
        children: [{ path: 'new', handle: { title: 'New project' } satisfies Handle, Component: () => null }],
      },
      { path: 'parts', handle: partsRoute.handle, Component: partsRoute.default },
      {
        path: 'community',
        handle: { title: 'Community' } satisfies Handle,
        Component: () => <PageHeader title='Community' />,
      },
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

const app = (router: ReturnType<typeof createMemoryRouter>): React.JSX.Element => (
  <KeyboardProvider>
    <TooltipProvider>
      <RouterProvider router={router} />
    </TooltipProvider>
  </KeyboardProvider>
);

const renderAt = (path: string) => {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const view = render(app(router));
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

afterEach(() => {
  vi.unstubAllEnvs();
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

  it('keeps the phone-only bar title out of the heading outline so the page owns its one h1', () => {
    const { header } = renderAt('/community');

    expect(within(header()).queryByRole('heading')).not.toBeInTheDocument();
    expect(within(header()).getByText('Community')).toHaveClass('md:hidden');
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('shows the title once: the page h1 stays in the outline but hides visually below md', () => {
    const { header } = renderAt('/community');

    const heading = screen.getByRole('heading', { level: 1, name: 'Community' });
    expect(heading.closest('[data-slot=page-header-title]')).toHaveClass('max-md:sr-only');
    expect(within(header()).getByText('Community')).toHaveClass('md:hidden');
  });

  it('renders one header action, from the deepest route that declares one', () => {
    const { header } = renderAt('/projects/new');

    expect(within(header()).getByRole('button', { name: 'Create from template' })).toBeInTheDocument();
    expect(within(header()).queryByRole('button', { name: 'Import project' })).not.toBeInTheDocument();
  });

  it('moves New project into the bar at 40px and hides the title-row copy below md', () => {
    const { header } = renderAt('/library');

    const links = screen.getAllByRole('link', { name: 'New project' });
    expect(links).toHaveLength(2);
    const barLink = within(header()).getByRole('link', { name: 'New project' });
    expect(barLink).toHaveAttribute('href', '/projects/new');
    expect(barLink).toHaveClass('h-10');
    expect(barLink.closest('[data-slot=page-header-action]')).toHaveClass('md:hidden');
    const titleRowLink = links.find((link) => !header().contains(link));
    expect(titleRowLink).toHaveAttribute('href', '/projects/new');
    expect(titleRowLink).toHaveClass('max-md:hidden');
  });

  it("does not carry a parent page's action onto a nested titled page", () => {
    const { header } = renderAt('/library/new');

    expect(within(header()).getByRole('link', { name: 'Back to Projects' })).toBeInTheDocument();
    expect(within(header()).queryByRole('link', { name: 'New project' })).not.toBeInTheDocument();
  });

  it('keeps the turned-off Parts explanation visible while only its page heading hides', () => {
    renderAt('/parts');

    const heading = screen.getByRole('heading', { level: 1, name: 'Parts' });
    expect(heading.closest('[data-slot=page-header-title]')).toHaveClass('max-md:sr-only');
    const explanation = screen.getByText('Parts is turned off');
    expect(explanation.closest('.sr-only, [class*="sr-only"]')).toBeNull();
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

  it('gives a titled route without breadcrumb or action no header and no offset from md up', () => {
    const { container, header } = renderAt('/community');

    expect(header()).toHaveClass('md:hidden');
    expect(header()).not.toHaveClass('border-b');
    expect(container.querySelector('main')).toHaveClass('md:[--header-height:0px]');
    const section = container.querySelector('main > section');
    expect(section).not.toHaveClass('mt-(--header-height)');
    expect(section).toHaveClass('max-md:mt-(--header-height)', 'md:group-data-[sidebar-open=false]/app-shell:pt-9');
  });

  it('keeps New project in the title row and out of the header', () => {
    const { header } = renderAt('/library');

    expect(header()).toHaveClass('md:hidden');
    expect(header()).not.toHaveClass('border-b');
    const titleRowLink = screen.getAllByRole('link', { name: 'New project' }).find((link) => !header().contains(link));
    expect(titleRowLink).toHaveAttribute('href', '/projects/new');
    expect(titleRowLink).not.toHaveClass('md:hidden');
  });

  it('keeps the page h1 visible in the desktop build, which has no phone bar', () => {
    const group = (): Element | undefined =>
      screen.getByRole('heading', { level: 1, name: 'Community' }).closest('[data-slot=page-header-title]') ??
      undefined;
    vi.stubEnv('TAU_TARGET', 'desktop');
    const { container } = renderAt('/community');
    expect(container.querySelector('[data-slot=page-title]')).not.toBeInTheDocument();
    expect(group()).not.toHaveClass('max-md:sr-only');
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

describe('Page phone top bar in server markup', () => {
  // The server cannot know the viewport: `useIsMobile` is false there and on the first client frame.
  beforeEach(() => {
    viewport.isMobile = false;
  });

  it('paints the phone bar and the visually hidden page title before hydration', async () => {
    const html = renderToString(app(createMemoryRouter(routes, { initialEntries: ['/community'] })));
    const container = document.createElement('div');
    container.innerHTML = html;

    const header = container.querySelector('main > header');
    expect(header).toHaveClass('md:hidden', 'max-md:border-b');
    expect(header?.querySelector('[data-slot=page-title]')).toHaveTextContent('Community');
    expect(container.querySelector('main')).toHaveClass('[--header-height:calc(var(--spacing)*12)]');
    expect(container.querySelector('h1')?.closest('[data-slot=page-header-title]')).toHaveClass('max-md:sr-only');

    document.body.append(container);
    const recoverableError = vi.fn();
    const root = hydrateRoot(container, app(createMemoryRouter(routes, { initialEntries: ['/community'] })), {
      onRecoverableError: recoverableError,
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(recoverableError).not.toHaveBeenCalled();
    expect(container.querySelector('main > header')).toBe(header);
    expect(container.querySelector('h1')?.closest('[data-slot=page-header-title]')).toHaveClass('max-md:sr-only');
    root.unmount();
    container.remove();
  });
});
