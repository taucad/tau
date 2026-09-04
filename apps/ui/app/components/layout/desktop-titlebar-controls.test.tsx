// @vitest-environment jsdom
import type { ComponentProps, ReactNode } from 'react';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import { DesktopTitlebarControls } from '#components/layout/desktop-titlebar-controls.js';

vi.mock('#components/ui/sidebar.js', () => ({
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
    const navigation = new EventTarget() as EventTarget & { canGoBack: boolean; canGoForward: boolean };
    Object.assign(navigation, { canGoBack: true, canGoForward: false });
    Object.defineProperty(globalThis, 'navigation', { configurable: true, value: navigation });
    const back = vi.spyOn(history, 'back').mockImplementation(() => undefined);
    const forward = vi.spyOn(history, 'forward').mockImplementation(() => undefined);
    const user = userEvent.setup();

    const { container } = render(<DesktopTitlebarControls onSidebarResize={vi.fn()} />, { wrapper: TooltipProvider });
    const titlebar = container.querySelector('[data-slot=desktop-titlebar]');
    const controls = container.querySelector('[data-slot=desktop-titlebar-controls]');
    const dragRegion = container.querySelector('[data-slot=desktop-titlebar-drag-region]');
    const sidebar = screen.getByRole('button', { name: 'Toggle Sidebar' });
    const backButton = screen.getByRole('button', { name: 'Back' });
    const forwardButton = screen.getByRole('button', { name: 'Forward' });

    expect(titlebar).toHaveClass('h-9', 'bg-transparent');
    expect(titlebar).not.toHaveClass('border-b');
    expect(controls).toHaveClass('h-9', 'bg-transparent', '[app-region:no-drag]');
    expect(controls).not.toHaveClass('border-b', '[app-region:drag]');
    expect(dragRegion).toHaveClass('w-[84px]', '[app-region:drag]');
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
});
