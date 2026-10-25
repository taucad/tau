import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation, useNavigationType } from 'react-router';
import { describe, expect, it } from 'vitest';
import { NavChat } from '#components/nav/nav-chat.js';
import { SidebarProvider } from '#components/ui/sidebar.js';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import { KeyboardProvider } from '@taucad/ui/components/keyboard';

function NavigationProbe(): React.JSX.Element {
  const location = useLocation() as { state: unknown };
  return (
    <>
      <output data-testid='navigation-type'>{useNavigationType()}</output>
      <output data-testid='focus-request'>
        {String((location.state as { focusChatComposer?: unknown } | undefined)?.focusChatComposer === true)}
      </output>
    </>
  );
}

function renderNavChat({ isTouchSized }: { readonly isTouchSized?: boolean } = {}): void {
  render(
    <MemoryRouter initialEntries={['/projects']}>
      <KeyboardProvider>
        <TooltipProvider>
          <SidebarProvider>
            <NavChat isTouchSized={isTouchSized} />
            <NavigationProbe />
            <Routes>
              <Route path='/' element={<p>Home Composer</p>} />
              <Route path='*' element={null} />
            </Routes>
          </SidebarProvider>
        </TooltipProvider>
      </KeyboardProvider>
    </MemoryRouter>,
  );
}

describe('NavChat', () => {
  it('should link New Project to the home composer, not the project creation page', () => {
    renderNavChat();

    expect(screen.getByRole('link', { name: /New Project/ })).toHaveAttribute('href', '/');
  });

  it('should ask the home composer for focus when clicked', async () => {
    renderNavChat();

    await userEvent.click(screen.getByRole('link', { name: /New Project/ }));

    expect(await screen.findByText('Home Composer')).toBeInTheDocument();
    expect(screen.getByTestId('focus-request')).toHaveTextContent('true');
  });

  it('should open the home composer from its shortcut', async () => {
    renderNavChat();

    await userEvent.keyboard('{Control>}n{/Control}');

    expect(await screen.findByText('Home Composer')).toBeInTheDocument();
    expect(screen.getByTestId('focus-request')).toHaveTextContent('true');
  });

  it('should replace the history entry when the shortcut is pressed on the home composer', async () => {
    renderNavChat();

    await userEvent.keyboard('{Control>}n{/Control}');
    await userEvent.keyboard('{Control>}n{/Control}');

    expect(await screen.findByText('Home Composer')).toBeInTheDocument();
    expect(screen.getByTestId('navigation-type')).toHaveTextContent('REPLACE');
  });

  it('should give the phone sheet a 44px New Project', () => {
    renderNavChat({ isTouchSized: true });
    const button = screen.getByRole('link', { name: /New Project/ }).querySelector('[data-slot=sidebar-menu-button]');
    expect(button).toHaveAttribute('data-size', 'lg');
    expect(button).toHaveClass('h-11');
  });

  it('should keep the desktop New Project at the compact row height', () => {
    renderNavChat();
    const button = screen.getByRole('link', { name: /New Project/ }).querySelector('[data-slot=sidebar-menu-button]');
    expect(button).toHaveAttribute('data-size', 'default');
    expect(button).toHaveClass('h-7');
  });
});
