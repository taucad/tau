// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { SidebarProvider } from '@taucad/ui/components/sidebar';
import { NavMain } from '#components/nav/nav-main.js';

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
});
