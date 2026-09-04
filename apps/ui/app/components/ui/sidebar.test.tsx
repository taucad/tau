// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import { KeyboardProvider } from '#hooks/use-keyboard.js';

const mobile = vi.hoisted(() => ({ value: false }));

vi.mock('@taucad/ui/hooks/use-mobile', () => ({ useIsMobile: () => mobile.value }));
vi.mock('#hooks/use-cookie.js', async () => {
  const React = await import('react');
  return {
    useCookie: <Value,>(_name: string, defaultValue: Value) => React.useState(defaultValue),
  };
});

const { SidebarProvider, SidebarTrigger } = await import('#components/ui/sidebar.js');

const renderTrigger = (onSidebarResize = vi.fn()) =>
  render(
    <MemoryRouter>
      <KeyboardProvider>
        <TooltipProvider>
          <SidebarProvider>
            <div id='app-sidebar'>Sidebar</div>
            <SidebarTrigger onSidebarResize={onSidebarResize} />
          </SidebarProvider>
        </TooltipProvider>
      </KeyboardProvider>
    </MemoryRouter>,
  );

describe('SidebarTrigger', () => {
  beforeEach(() => {
    mobile.value = false;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps one structural icon while semantic state changes', async () => {
    const user = userEvent.setup();
    renderTrigger();
    const trigger = screen.getByRole('button', { name: 'Toggle Sidebar' });
    const icon = trigger.querySelector('[data-slot=sidebar-panel-icon]');

    expect(icon).toBeInTheDocument();
    expect(trigger).toHaveAttribute('aria-controls', 'app-sidebar');
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(trigger).toHaveAttribute('data-open', 'true');
    expect(trigger).toHaveAttribute('aria-keyshortcuts', 'ArrowLeft ArrowRight');

    await user.click(trigger);

    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveAttribute('data-open', 'false');
    expect(trigger.querySelector('[data-slot=sidebar-panel-icon]')).toBe(icon);
  });

  it('provides focused arrow-key resizing only while the sidebar is open', async () => {
    const user = userEvent.setup();
    const onSidebarResize = vi.fn();
    renderTrigger(onSidebarResize);
    const trigger = screen.getByRole('button', { name: 'Toggle Sidebar' });

    fireEvent.focus(trigger);
    fireEvent.keyDown(trigger, { key: 'ArrowLeft' });
    fireEvent.keyDown(trigger, { key: 'ArrowRight' });
    expect(onSidebarResize).toHaveBeenNthCalledWith(1, 'narrower');
    expect(onSidebarResize).toHaveBeenNthCalledWith(2, 'wider');

    await user.click(trigger);
    fireEvent.keyDown(trigger, { key: 'ArrowLeft' });
    fireEvent.keyDown(trigger, { key: 'ArrowRight' });
    expect(onSidebarResize).toHaveBeenCalledTimes(2);
  });

  it('reports mobile Sheet state instead of the desktop cookie state', async () => {
    mobile.value = true;
    const user = userEvent.setup();
    renderTrigger();
    const trigger = screen.getByRole('button', { name: 'Toggle Sidebar' });

    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).not.toHaveAttribute('aria-controls');

    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });
});
