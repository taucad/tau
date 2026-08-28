import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '#components/ui/tooltip.js';

const openPanel = vi.fn();

vi.mock('#routes/w.$workspace.$project/project-workspace-context.js', () => ({
  useProjectWorkspace: () => ({ openPanel }),
}));

const { ProjectExportAction } = await import('./project-export-action.js');

describe('ProjectExportAction', () => {
  beforeEach(() => {
    openPanel.mockClear();
  });

  it('keeps Export enabled while geometry is pending and opens the pane', async () => {
    const user = userEvent.setup();
    render(
      <TooltipProvider>
        <ProjectExportAction />
      </TooltipProvider>,
    );

    const button = screen.getByRole('button', { name: /export/i });
    expect(button).not.toHaveAttribute('aria-disabled');
    await user.click(button);

    expect(openPanel).toHaveBeenCalledOnce();
    expect(openPanel).toHaveBeenCalledWith('export');
  });
});
