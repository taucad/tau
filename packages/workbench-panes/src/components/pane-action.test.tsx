import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Download } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import { PaneAction } from '#components/pane-action.jsx';
import type { PaneActionProps } from '#components/pane-action.jsx';

const renderAction = (props: Partial<PaneActionProps> = {}) => {
  const onClick = vi.fn();
  render(
    <TooltipProvider delayDuration={0}>
      <PaneAction icon={Download} label='Export' tooltip='Open exporter' onClick={onClick} {...props} />
    </TooltipProvider>,
  );
  return { onClick, action: screen.getByRole('button', { name: 'Export' }) };
};

describe('PaneAction', () => {
  it('should be a labelled pane button that runs its action', async () => {
    const user = userEvent.setup();
    const { onClick, action } = renderAction();

    expect(action).toHaveAttribute('data-slot', 'pane-button');
    expect(action).toHaveTextContent('Export');
    await user.click(action);

    expect(onClick).toHaveBeenCalledOnce();
  });

  it('should say what it does in its tooltip', async () => {
    const user = userEvent.setup();
    const { action } = renderAction();

    await user.hover(action);

    expect(await screen.findByRole('tooltip')).toHaveTextContent('Open exporter');
  });

  it('should fold to its icon with the host classes, keeping its name', () => {
    const { action } = renderAction({
      className: '@max-xl/viewer:w-7',
      labelClassName: 'hidden @xl/viewer:inline',
    });

    expect(action).toHaveClass('@max-xl/viewer:w-7');
    expect(screen.getByText('Export')).toHaveClass('hidden');
    expect(action).toHaveAccessibleName('Export');
  });

  it('should run nothing while disabled', async () => {
    const user = userEvent.setup();
    const { onClick, action } = renderAction({ disabled: true });

    await user.click(action);

    expect(action).toBeDisabled();
    expect(onClick).not.toHaveBeenCalled();
  });
});
