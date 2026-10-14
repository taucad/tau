// @vitest-environment jsdom
import type { ComponentProps, ReactNode } from 'react';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import { DesktopTitlebarControls } from '#components/layout/desktop-titlebar-controls.js';
import { MemoryRouter } from 'react-router';

const state = vi.hoisted(() => ({ open: true }));
beforeEach(() => {
  state.open = true;
});

vi.mock('#components/ui/sidebar.js', () => ({
  useSidebar: () => ({ open: state.open, isMobile: false }),
  SidebarTrigger: ({
    children,
    onSidebarResize,
    ...properties
  }: ComponentProps<'button'> & {
    readonly children?: ReactNode;
    readonly onSidebarResize?: (direction: 'narrower' | 'wider') => void;
  }) => (
    <button type='button' data-has-resize={Boolean(onSidebarResize)} {...properties}>
      {children}
      <span className='sr-only'>Toggle Sidebar</span>
    </button>
  ),
}));

afterEach(() => {
  vi.restoreAllMocks();
  Reflect.deleteProperty(globalThis, 'navigation');
});

describe('DesktopTitlebarControls', () => {
  it('tracks native history availability and navigates in both directions', async () => {
    state.open = false;
    const navigation = new EventTarget() as EventTarget & { canGoBack: boolean; canGoForward: boolean };
    Object.assign(navigation, { canGoBack: true, canGoForward: false });
    Object.defineProperty(globalThis, 'navigation', { configurable: true, value: navigation });
    const back = vi.spyOn(history, 'back').mockImplementation(() => undefined);
    const forward = vi.spyOn(history, 'forward').mockImplementation(() => undefined);
    const user = userEvent.setup();

    const { container } = render(<DesktopTitlebarControls isFullscreen={false} onSidebarResize={vi.fn()} />, {
      wrapper: TooltipProvider,
    });
    const titlebar = container.querySelector('[data-slot=desktop-titlebar]');
    const controls = container.querySelector('[data-slot=desktop-titlebar-controls]');
    const sidebar = screen.getByRole('button', { name: 'Toggle Sidebar' });
    const backButton = screen.getByRole('button', { name: 'Back' });
    const forwardButton = screen.getByRole('button', { name: 'Forward' });

    expect(titlebar).toHaveClass('h-9', 'w-(--titlebar-controls-width)', 'bg-transparent');
    expect(titlebar).not.toHaveClass('border-b');
    // 16 px from the last traffic light to the first control, and the row ends 4 px before the width it declares.
    expect(controls).toHaveClass(
      'h-9',
      'bg-transparent',
      'pl-(--desktop-titlebar-inset)',
      'pr-1',
      '[app-region:no-drag]',
    );
    expect(controls).not.toHaveClass('pl-22', 'pr-2');
    expect(controls).not.toHaveClass('border-b', '[app-region:drag]');
    expect(sidebar).toHaveAttribute('data-has-resize', 'true');
    expect(sidebar.querySelectorAll('span')).toHaveLength(1);
    expect(backButton).toHaveClass('hover:bg-accent', 'hover:text-foreground');
    expect(forwardButton).toHaveClass('hover:bg-accent', 'hover:text-foreground');
    await user.click(backButton);
    expect(back).toHaveBeenCalledOnce();
    expect(forwardButton).toBeDisabled();

    Object.assign(navigation, { canGoForward: true });
    act(() => {
      navigation.dispatchEvent(new Event('currententrychange'));
    });
    await user.click(forwardButton);
    expect(forward).toHaveBeenCalledOnce();
  });

  it('should show the wordmark only in open fullscreen and keep windowed history right aligned', () => {
    const view = render(
      <MemoryRouter>
        <TooltipProvider>
          <DesktopTitlebarControls isFullscreen onSidebarResize={vi.fn()} />
        </TooltipProvider>
      </MemoryRouter>,
    );
    const home = screen.getByRole('link', { name: 'Home' });
    expect(home).toHaveAttribute('href', '/');
    expect(home.querySelector('svg')).toHaveAttribute('viewBox', '917.24 -700 1404 710');
    expect(home.previousElementSibling).toBe(screen.getByRole('button', { name: 'Toggle Sidebar' }));
    expect(home.nextElementSibling).toBe(screen.getByRole('button', { name: 'Back' }));
    view.rerender(
      <MemoryRouter>
        <TooltipProvider>
          <DesktopTitlebarControls isFullscreen={false} onSidebarResize={vi.fn()} />
        </TooltipProvider>
      </MemoryRouter>,
    );
    expect(screen.queryByRole('link', { name: 'Home' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back' })).toHaveClass('ml-auto');
    expect(view.container.querySelector('[data-slot=desktop-titlebar]')).toHaveClass('top-0');
    state.open = false;
    view.rerender(
      <MemoryRouter>
        <TooltipProvider>
          <DesktopTitlebarControls isFullscreen={false} onSidebarResize={vi.fn()} />
        </TooltipProvider>
      </MemoryRouter>,
    );
    expect(screen.queryByRole('link', { name: 'Home' })).not.toBeInTheDocument();
    expect(view.container.querySelector('[data-slot=desktop-titlebar]')).toHaveClass('top-0');
    expect(screen.getByRole('button', { name: 'Toggle Sidebar' }).nextElementSibling).toBe(
      screen.getByRole('button', { name: 'Back' }),
    );
    expect(screen.getByRole('button', { name: 'Toggle Sidebar' })).toBeInTheDocument();
  });
});
