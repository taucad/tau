import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '#components/ui/tooltip.js';

let exportableGeometryUnitPaths = new Set<string>();
const openPanel = vi.fn();

vi.mock('@xstate/react', () => ({
  useSelector: (actor: { getSnapshot: () => unknown }, selector: (state: unknown) => unknown) =>
    selector(actor.getSnapshot()),
}));

vi.mock('#hooks/use-project.js', () => ({
  useProject: () => ({
    projectRef: {
      getSnapshot: () => ({ context: { exportableGeometryUnitPaths } }),
    },
  }),
}));

vi.mock('#routes/w.$workspace.$project/project-workspace-context.js', () => ({
  useProjectWorkspace: () => ({ openPanel }),
}));

const { ProjectExportAction } = await import('./project-export-action.js');

describe('ProjectExportAction', () => {
  beforeEach(() => {
    exportableGeometryUnitPaths = new Set<string>();
    openPanel.mockClear();
  });

  it('should disable export when no geometry unit is exportable', () => {
    render(
      <TooltipProvider>
        <ProjectExportAction />
      </TooltipProvider>,
    );

    expect(screen.getByRole('button', { name: /export/i })).toHaveAttribute('aria-disabled', 'true');
  });

  it('should open the exporter when any geometry unit is exportable', async () => {
    const user = userEvent.setup();
    exportableGeometryUnitPaths = new Set(['helper.ts']);

    render(
      <TooltipProvider>
        <ProjectExportAction />
      </TooltipProvider>,
    );

    await user.click(screen.getByRole('button', { name: /export/i }));

    expect(openPanel).toHaveBeenCalledWith('export');
  });

  it('should keep export as a one-way workflow action', async () => {
    const user = userEvent.setup();
    exportableGeometryUnitPaths = new Set(['helper.ts']);

    render(
      <TooltipProvider>
        <ProjectExportAction />
      </TooltipProvider>,
    );

    await user.click(screen.getByRole('button', { name: /export/i }));

    expect(openPanel).toHaveBeenCalledOnce();
    expect(openPanel).toHaveBeenCalledWith('export');
  });
});
