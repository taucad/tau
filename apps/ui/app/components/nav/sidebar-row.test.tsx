// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ResponsiveSurfaceProvider } from '@taucad/ui/hooks/use-mobile';
import { SidebarRowActions, SidebarRowMenuButton, sidebarRowClass } from '#components/nav/sidebar-row.js';
import type { SidebarRowMenuItems } from '#components/nav/sidebar-row.js';

const items: SidebarRowMenuItems = ({ Item, Separator }) => (
  <>
    <Item>Rename</Item>
    <Separator />
    <Item variant='destructive'>Move to Trash</Item>
  </>
);

beforeEach(() => {
  // Vaul reads the media query when a drawer opens; jsdom has none.
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('SidebarRowMenuButton on a phone', () => {
  it('should open a sidebar row’s items in a drawer named by the row, above the sidebar sheet', async () => {
    render(
      <ResponsiveSurfaceProvider isMobile container={undefined}>
        <SidebarRowMenuButton isResponsive name='Bracket' items={items} className='w-48' />
      </ResponsiveSurfaceProvider>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'More actions for Bracket' }));

    const drawer = await screen.findByRole('dialog', { name: 'Bracket' });
    expect(drawer).toHaveClass('z-110');
    expect(within(drawer).getByRole('button', { name: 'Move to Trash' })).toHaveAttribute(
      'data-variant',
      'destructive',
    );
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('should keep the row lit while its drawer is open, as it does while its menu is', async () => {
    render(
      <ResponsiveSurfaceProvider isMobile container={undefined}>
        <div data-testid='row' className={sidebarRowClass(false)}>
          <span>Bracket</span>
          <SidebarRowActions>
            <SidebarRowMenuButton isResponsive name='Bracket' items={items} className='w-48' />
          </SidebarRowActions>
        </div>
      </ResponsiveSurfaceProvider>,
    );
    const trigger = screen.getByRole('button', { name: 'More actions for Bracket' });

    await userEvent.click(trigger);
    await screen.findByRole('dialog', { name: 'Bracket' });

    // The drawer's trigger says it opens a dialog; the row's open-state selector takes it as it takes a menu's.
    const openTrigger = ':is([aria-haspopup=menu],[aria-haspopup=dialog])[data-state=open]';
    expect(trigger).toHaveAttribute('aria-haspopup', 'dialog');
    expect(trigger.matches(openTrigger)).toBe(true);
    expect(screen.getByTestId('row').className).toContain(`has-[${openTrigger}]:bg-sidebar-accent`);
  });

  it('should keep the dropdown for a row that does not opt in, as the file tree inside the workbench sheet', async () => {
    render(
      <ResponsiveSurfaceProvider isMobile container={undefined}>
        <SidebarRowMenuButton name='bracket.ts' items={items} className='w-48' />
      </ResponsiveSurfaceProvider>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'More actions for bracket.ts' }));

    expect(await screen.findByRole('menu')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
