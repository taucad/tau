// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SidebarProvider } from '@taucad/ui/components/sidebar';
import { ResponsiveSurfaceProvider } from '@taucad/ui/hooks/use-mobile';
import { NavMain } from '#components/nav/nav-main.js';

const moreItems = [
  { title: 'Community', url: '/community' },
  { title: 'Convert', url: '/convert' },
  { title: 'Import', url: '/import' },
];

/** The sidebar's nav with a More row, on a phone or a wide screen. */
const renderNav = (isMobile: boolean): void => {
  render(
    <ResponsiveSurfaceProvider isMobile={isMobile} container={undefined}>
      <MemoryRouter>
        <SidebarProvider>
          <NavMain items={[{ title: 'Projects', url: '/projects' }]} moreItems={moreItems} />
        </SidebarProvider>
      </MemoryRouter>
    </ResponsiveSurfaceProvider>,
  );
};

describe('NavMain', () => {
  it('should keep disclosure attributes off leaf rows and on rows with children only', () => {
    render(
      <MemoryRouter>
        <SidebarProvider>
          <NavMain
            items={[
              { title: 'Community', url: '/community' },
              { title: 'Settings', url: '/settings', items: [{ title: 'General', url: '/settings/general' }] },
            ]}
          />
        </SidebarProvider>
      </MemoryRouter>,
    );

    // Axe aria-allowed-attr: a leaf row controls nothing, so it must not claim to expand.
    const leaf = screen.getByRole('link', { name: 'Community' });
    expect(leaf.querySelector('[aria-expanded], [aria-controls]')).toBeNull();

    const parent = screen.getByRole('link', { name: 'Settings' });
    expect(parent.querySelector('[aria-expanded]')).not.toBeNull();
  });

  it('should list secondary destinations under a More menu', async () => {
    render(
      <MemoryRouter>
        <SidebarProvider>
          <NavMain
            items={[{ title: 'Projects', url: '/projects' }]}
            moreItems={[
              { title: 'Community', url: '/community' },
              { title: 'Convert', url: '/convert' },
              { title: 'Import', url: '/import' },
            ]}
          />
        </SidebarProvider>
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: 'Projects' })).toHaveAttribute('href', '/projects');
    expect(screen.queryByRole('link', { name: 'Community' })).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'More' }));

    expect(await screen.findByRole('menuitem', { name: 'Community' })).toHaveAttribute('href', '/community');
    expect(screen.getByRole('menuitem', { name: 'Convert' })).toHaveAttribute('href', '/convert');
    expect(screen.getByRole('menuitem', { name: 'Import' })).toHaveAttribute('href', '/import');
  });

  it('should omit the More row when nothing is listed under it', () => {
    render(
      <MemoryRouter>
        <SidebarProvider>
          <NavMain items={[{ title: 'Projects', url: '/projects' }]} moreItems={[]} />
        </SidebarProvider>
      </MemoryRouter>,
    );

    expect(screen.queryByRole('button', { name: 'More' })).toBeNull();
  });

  it('should mark More with vertical dots, as the rows’ ⋯ are', () => {
    renderNav(false);

    const more = screen.getByRole('button', { name: 'More' });
    expect(more.querySelector('svg.lucide-ellipsis-vertical')).not.toBeNull();
    expect(more.querySelector('svg.lucide-ellipsis:not(.lucide-ellipsis-vertical)')).toBeNull();
  });

  describe('on a phone', () => {
    beforeEach(() => {
      // Vaul reads the media query when a drawer opens; jsdom has none.
      vi.stubGlobal(
        'matchMedia',
        (query: string): MediaQueryList =>
          ({
            matches: false,
            media: query,
            addEventListener: () => undefined,
            removeEventListener: () => undefined,
          }) as unknown as MediaQueryList,
      );
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('should open More’s destinations in a drawer, not a menu the sidebar sheet would cover', async () => {
      renderNav(true);

      await userEvent.click(screen.getByRole('button', { name: 'More' }));

      const drawer = await screen.findByRole('dialog', { name: 'More' });
      expect(drawer).toHaveClass('z-110');
      expect(screen.queryByRole('menu')).toBeNull();
      expect(within(drawer).getByRole('link', { name: 'Community' })).toHaveAttribute('href', '/community');
      expect(within(drawer).getByRole('link', { name: 'Import' })).toHaveAttribute('href', '/import');
    });
  });
});
