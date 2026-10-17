import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppSidebar } from '#components/layout/app-sidebar.js';
import { SidebarProvider } from '#components/ui/sidebar.js';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import { KeyboardProvider } from '@taucad/ui/components/keyboard';
import { featureFlagDefaults } from '#flags/flag.constants.js';
import type { FeatureFlags } from '#flags/flag.constants.js';

const mockState = vi.hoisted(() => ({
  flags: undefined as FeatureFlags | undefined,
  open: true,
}));

vi.mock('#flags/use-feature.js', () => ({
  useFeatureFlags: () => mockState.flags,
}));

vi.mock('#hooks/use-cookie.js', () => ({
  useCookie: () => [mockState.open, vi.fn()] as const,
}));

vi.mock('@taucad/ui/hooks/use-mobile', () => ({
  useIsMobile: () => false,
}));

vi.mock('#components/nav/project-navigation.js', () => ({
  ProjectNavigation: () => <div>Projects</div>,
}));

vi.mock('#components/layout/command-palette.js', () => ({
  Commands: () => <button type='button'>Search projects and chats</button>,
}));

vi.mock('#components/nav/project-navigation-command-items.js', () => ({
  ProjectNavigationCommandItems: () => undefined,
}));

vi.mock('#components/nav/nav-chat.js', () => ({
  NavChat: () => null,
}));

vi.mock('#components/nav/nav-user.js', () => ({
  NavUser: () => <button type='button'>Account</button>,
}));

vi.mock('#components/icons/tau-wordmark.js', () => ({
  TauWordmark: ({ className }: { readonly className?: string }) => <svg aria-hidden className={className} />,
}));

function renderSidebar(): ReturnType<typeof render> {
  return render(
    <MemoryRouter>
      <KeyboardProvider>
        <TooltipProvider>
          <SidebarProvider>
            <AppSidebar />
          </SidebarProvider>
        </TooltipProvider>
      </KeyboardProvider>
    </MemoryRouter>,
  );
}

function getNavLink(name: string): HTMLElement | undefined {
  return screen.queryByRole('link', { name }) ?? undefined;
}

/** Opens the More menu and returns its entry named `name`, if listed. */
async function getMoreItem(name: string): Promise<HTMLElement | undefined> {
  await userEvent.click(screen.getByRole('button', { name: 'More' }));
  await screen.findByRole('menu');
  return screen.queryByRole('menuitem', { name }) ?? undefined;
}

describe('AppSidebar', () => {
  beforeEach(() => {
    mockState.flags = featureFlagDefaults;
    mockState.open = true;
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('should place Projects directly in the sidebar and secondary destinations under More', async () => {
    renderSidebar();

    expect(getNavLink('Projects')).toHaveAttribute('href', '/projects');
    for (const name of ['Community', 'Convert', 'Import', 'Usage']) {
      expect(getNavLink(name)).toBeUndefined();
    }

    await userEvent.click(screen.getByRole('button', { name: 'More' }));

    expect(await screen.findByRole('menuitem', { name: 'Community' })).toHaveAttribute('href', '/community');
    expect(screen.getByRole('menuitem', { name: 'Convert' })).toHaveAttribute('href', '/convert');
    expect(screen.getByRole('menuitem', { name: 'Import' })).toHaveAttribute('href', '/import');
    expect(screen.getByRole('menuitem', { name: 'Usage' })).toHaveAttribute('href', '/usage');
  });

  it('hides Machines by default and shows it only when enabled', async () => {
    const view = renderSidebar();
    expect(await getMoreItem('Machines')).toBeUndefined();
    view.unmount();
    mockState.flags = { ...featureFlagDefaults, machines: true };
    renderSidebar();
    expect(await getMoreItem('Machines')).toHaveAttribute('href', '/machines');
  });

  it('should hide Parts by default and show it when enabled', async () => {
    const view = renderSidebar();
    expect(await getMoreItem('Parts')).toBeUndefined();
    view.unmount();
    mockState.flags = { ...featureFlagDefaults, partsWarehouse: true };
    renderSidebar();
    expect(await getMoreItem('Parts')).toHaveAttribute('href', '/parts');
  });

  it('should hide the Plugins item when the Plugins Store flag is disabled', async () => {
    renderSidebar();

    expect(await getMoreItem('Plugins')).toBeUndefined();
  });

  it('should show the Plugins item when the Plugins Store flag is enabled', async () => {
    mockState.flags = { ...featureFlagDefaults, pluginsStore: true };

    renderSidebar();

    expect(await getMoreItem('Plugins')).toHaveAttribute('href', '/plugins');
  });

  it('uses an Allotment-owned browser pane without duplicate titlebar controls', () => {
    const { container } = renderSidebar();
    const sidebar = screen.getByRole('complementary', { name: 'Application sidebar' });
    const projectsButton = getNavLink('Projects')?.querySelector('[data-sidebar=menu-button]');

    expect(sidebar).toHaveAttribute('id', 'app-sidebar');
    expect(sidebar).toHaveClass('w-full', 'border-r');
    expect(projectsButton).toHaveClass('data-[active=true]:text-foreground');
    expect(projectsButton).not.toHaveClass('data-[active=true]:text-primary');
    expect(screen.getByRole('button', { name: 'Account' })).toBeInTheDocument();
    expect(container.querySelector('[data-slot=sidebar-header]')).toHaveClass('h-9');
    expect(container.querySelector('[data-slot=sidebar-header] [data-slot=sidebar-trigger]')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Home' })).not.toBeInTheDocument();
  });

  it('reserves only the top control row without duplicate identity or controls', () => {
    vi.stubEnv('TAU_TARGET', 'desktop');
    const { container } = renderSidebar();

    expect(container.querySelector('[data-slot=sidebar-header]')).toHaveClass('h-9', 'p-0');
    expect(screen.queryByRole('link', { name: 'Home' })).not.toBeInTheDocument();
    expect(container.querySelector('[data-slot=sidebar-header] [data-slot=sidebar-trigger]')).not.toBeInTheDocument();
  });

  it('removes the hidden Allotment pane from interaction and the accessibility tree', () => {
    mockState.open = false;
    const { container } = renderSidebar();
    const sidebar = container.querySelector('#app-sidebar');

    expect(sidebar).toHaveAttribute('aria-hidden', 'true');
    expect(sidebar).toHaveAttribute('inert');
  });

  it('should use compact spacing for desktop navigation', () => {
    vi.stubEnv('TAU_TARGET', 'desktop');
    const { container } = renderSidebar();
    expect(container.querySelector('[data-slot=sidebar-header]')).toHaveClass('h-9', 'p-0');
    expect(container.querySelector('[data-slot=sidebar-header]')).not.toHaveClass('h-18', 'pt-9');
    expect(screen.queryByRole('link', { name: 'Home' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Account' })).toBeInTheDocument();
  });
});
