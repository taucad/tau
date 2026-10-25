// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useNavigate } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import { KeyboardProvider } from '@taucad/ui/components/keyboard';

const mobile = vi.hoisted(() => ({ value: false }));

vi.mock('@taucad/ui/hooks/use-mobile', () => ({ useIsMobile: () => mobile.value }));
vi.mock('#hooks/use-cookie.js', async () => {
  const React = await import('react');
  return {
    useCookie: <Value,>(_name: string, defaultValue: Value) => React.useState(defaultValue),
  };
});

const { Sidebar, SidebarProvider, SidebarTrigger, useSidebar } = await import('#components/ui/sidebar.js');

const Navigate = () => {
  const navigate = useNavigate();
  return (
    <button
      type='button'
      onClick={() => {
        void navigate('/next');
      }}
    >
      Navigate
    </button>
  );
};

const renderTrigger = (onSidebarResize = vi.fn()) =>
  render(
    <MemoryRouter>
      <KeyboardProvider>
        <TooltipProvider>
          <SidebarProvider>
            <div id='app-sidebar'>Sidebar</div>
            <SidebarTrigger onSidebarResize={onSidebarResize} />
            <Navigate />
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
    const trigger = screen.getByRole('button', { name: 'Open sidebar' });

    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).not.toHaveAttribute('aria-controls');

    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    // On phones the open sheet's control closes it, and says so (I6).
    expect(trigger).toHaveAccessibleName('Close sidebar');

    await user.click(screen.getByRole('button', { name: 'Navigate' }));
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  /** A sheet row that closes the sidebar as a link would; `then` runs after, as a route's own focus does. */
  const CloseRow = ({ then }: { readonly then?: () => void }) => {
    const { setOpenMobile } = useSidebar();
    return (
      <button
        type='button'
        onClick={() => {
          setOpenMobile(false);
          if (then) {
            setTimeout(then, 0);
          }
        }}
      >
        Close row
      </button>
    );
  };

  const renderPhoneSidebar = (then?: () => void) =>
    render(
      <MemoryRouter>
        <KeyboardProvider>
          <TooltipProvider>
            <SidebarProvider>
              <Sidebar>
                <CloseRow then={then} />
              </Sidebar>
              <SidebarTrigger />
              <input aria-label='Composer' />
            </SidebarProvider>
          </TooltipProvider>
        </KeyboardProvider>
      </MemoryRouter>,
    );

  /** Opens the phone sheet from its trigger by keyboard, and waits until the sheet holds focus. */
  const openByKeyboard = async (): Promise<{ trigger: HTMLElement; sheet: HTMLElement }> => {
    const trigger = screen.getByRole('button', { name: 'Open sidebar' });
    trigger.focus();
    fireEvent.keyDown(trigger, { key: 'Enter' });
    fireEvent.click(trigger);
    const sheet = await screen.findByRole('dialog', { name: 'Sidebar' });
    await waitFor(() => {
      expect(sheet).toContainElement(document.activeElement as HTMLElement);
    });
    return { trigger, sheet };
  };

  const waitForClosed = async (): Promise<void> => {
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Sidebar' })).not.toBeInTheDocument();
    });
    // Radix hands focus back on a timer after the sheet unmounts.
    await new Promise((resolve) => {
      setTimeout(resolve, 20);
    });
  };

  it('moves focus into the phone sidebar sheet as it opens and returns it to the trigger on Escape', async () => {
    mobile.value = true;
    renderPhoneSidebar();
    const { trigger, sheet } = await openByKeyboard();

    fireEvent.keyDown(sheet, { key: 'Escape' });
    await waitForClosed();
    expect(document.activeElement).toBe(trigger);
  });

  it('leaves focus where the route put it when a row closes the phone sidebar sheet', async () => {
    mobile.value = true;
    renderPhoneSidebar(() => {
      screen.getByRole('textbox', { name: 'Composer' }).focus();
    });
    const { trigger } = await openByKeyboard();
    const row = screen.getByRole('button', { name: 'Close row' });

    fireEvent.keyDown(row, { key: 'Enter' });
    fireEvent.click(row);
    await waitForClosed();

    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Composer' }));
    expect(document.activeElement).not.toBe(trigger);
  });

  it('does not refocus the trigger, and so raise its tooltip, after a tap closes the phone sidebar sheet', async () => {
    mobile.value = true;
    renderPhoneSidebar();
    const { trigger } = await openByKeyboard();
    const row = screen.getByRole('button', { name: 'Close row' });

    fireEvent.pointerDown(row);
    fireEvent.click(row);
    await waitForClosed();

    expect(document.activeElement).not.toBe(trigger);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });
});
