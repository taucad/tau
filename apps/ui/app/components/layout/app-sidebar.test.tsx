import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppSidebar } from '#components/layout/app-sidebar.js';
import { SidebarProvider } from '#components/ui/sidebar.js';
import { TooltipProvider } from '#components/ui/tooltip.js';
import { KeyboardProvider } from '#hooks/use-keyboard.js';
import { featureFlagDefaults } from '#flags/flag.constants.js';
import type { FeatureFlags } from '#flags/flag.constants.js';

const mockState = vi.hoisted(() => ({
  flags: undefined as FeatureFlags | undefined,
}));

vi.mock('#flags/use-feature.js', () => ({
  useFeatureFlags: () => mockState.flags,
}));

vi.mock('#hooks/use-cookie.js', () => ({
  useCookie: <T,>(_name: string, defaultValue: T) => [defaultValue, vi.fn()] as const,
}));

vi.mock('#hooks/use-mobile.js', () => ({
  useIsMobile: () => false,
}));

vi.mock('#components/nav/project-navigation.js', () => ({
  ProjectNavigation: () => <div>Projects</div>,
}));

vi.mock('#components/layout/command-palette.js', () => ({
  Commands: () => <button type='button'>Search projects and chats</button>,
}));

vi.mock('#components/nav/nav-chat.js', () => ({
  NavChat: () => null,
}));

vi.mock('#components/nav/nav-user.js', () => ({
  NavUser: () => <button type='button'>Account</button>,
}));

vi.mock('#components/release-badge.js', () => ({
  ReleaseBadge: () => <span>Alpha</span>,
}));

vi.mock('#components/icons/tau-wordmark.js', () => ({
  TauWordmark: ({ className }: { readonly className?: string }) => <span className={className}>Tau</span>,
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

describe('AppSidebar', () => {
  beforeEach(() => {
    mockState.flags = featureFlagDefaults;
  });

  it('should hide the Plugins nav item when the Plugins Store flag is disabled', () => {
    renderSidebar();

    expect(getNavLink('Plugins')).toBeUndefined();
    expect(getNavLink('Projects')).toBeInTheDocument();
    expect(getNavLink('Usage')).toBeInTheDocument();
  });

  it('should show the Plugins nav item when the Plugins Store flag is enabled', () => {
    mockState.flags = { ...featureFlagDefaults, pluginsStore: true };

    renderSidebar();

    expect(getNavLink('Plugins')).toHaveAttribute('href', '/plugins');
    expect(getNavLink('Projects')).toHaveAttribute('href', '/projects');
  });

  it('uses a flush desktop shell with neutral navigation selection', () => {
    const { container } = renderSidebar();
    const sidebar = container.querySelector('[data-slot=sidebar][data-variant]');
    const projectsButton = getNavLink('Projects')?.querySelector('[data-sidebar=menu-button]');

    expect(sidebar).toHaveAttribute('data-variant', 'sidebar');
    expect(projectsButton).toHaveClass('data-[active=true]:text-sidebar-accent-foreground');
    expect(projectsButton).not.toHaveClass('data-[active=true]:text-primary');
    expect(screen.getByRole('button', { name: 'Account' })).toBeInTheDocument();
    expect(container.querySelector('[data-slot=sidebar-header] [data-slot=sidebar-trigger]')).toBeInTheDocument();
  });
});
