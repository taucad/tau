// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
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
});
