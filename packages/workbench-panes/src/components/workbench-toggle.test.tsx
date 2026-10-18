import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import { WorkbenchToggleButton } from '#components/workbench-toggle.jsx';
import type { WorkbenchToggleButtonProps } from '#components/workbench-toggle.jsx';

const renderToggle = (props: WorkbenchToggleButtonProps) =>
  render(
    <TooltipProvider delayDuration={0}>
      <WorkbenchToggleButton {...props} />
    </TooltipProvider>,
  );

describe('WorkbenchToggleButton', () => {
  it('should be pressed while the lane is open and show the split frame', () => {
    renderToggle({ isOpen: true });

    const toggle = screen.getByRole('button', { name: 'Toggle Workbench lane' });
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(toggle.textContent).toBe('');
  });

  it('should show the hidden tab count while closed, capped at 9+', () => {
    const { rerender } = renderToggle({ isOpen: false, count: 3 });

    const toggle = screen.getByRole('button', { name: 'Toggle Workbench lane' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    expect(toggle).toHaveTextContent('3');

    rerender(
      <TooltipProvider delayDuration={0}>
        <WorkbenchToggleButton isOpen={false} count={12} />
      </TooltipProvider>,
    );
    expect(toggle).toHaveTextContent('9+');
  });

  it('should name its action in its tooltip whether the lane is open or closed', async () => {
    const user = userEvent.setup();
    const { rerender } = renderToggle({ isOpen: false });

    await user.hover(screen.getByRole('button', { name: 'Toggle Workbench lane' }));
    expect(await screen.findByRole('tooltip')).toHaveTextContent(/^Toggle Workbench$/u);

    rerender(
      <TooltipProvider delayDuration={0}>
        <WorkbenchToggleButton isOpen />
      </TooltipProvider>,
    );
    expect(screen.getByRole('button', { name: 'Toggle Workbench lane' })).toHaveAttribute('aria-pressed', 'true');
    expect(await screen.findByRole('tooltip')).toHaveTextContent(/^Toggle Workbench$/u);
  });

  it('should pass its handlers and ref to the button', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const ref = createRef<HTMLButtonElement>();
    renderToggle({ isOpen: false, onClick, ref });

    await user.click(screen.getByRole('button', { name: 'Toggle Workbench lane' }));

    expect(onClick).toHaveBeenCalledOnce();
    expect(ref.current).toBe(screen.getByRole('button', { name: 'Toggle Workbench lane' }));
  });
});
