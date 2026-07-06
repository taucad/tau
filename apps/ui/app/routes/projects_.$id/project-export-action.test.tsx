import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '#components/ui/tooltip.js';

let exportableGeometryUnitPaths = new Set<string>();
const editorSend = vi.fn();

vi.mock('@xstate/react', () => ({
  useSelector: (actor: { getSnapshot: () => unknown }, selector: (state: unknown) => unknown) =>
    selector(actor.getSnapshot()),
}));

vi.mock('#hooks/use-project.js', () => ({
  useProject: () => ({
    projectRef: {
      getSnapshot: () => ({ context: { exportableGeometryUnitPaths } }),
    },
    editorRef: {
      send: editorSend,
    },
  }),
}));

const { ProjectExportAction } = await import('./project-export-action.js');

describe('ProjectExportAction', () => {
  beforeEach(() => {
    exportableGeometryUnitPaths = new Set<string>();
    editorSend.mockClear();
  });

  it('should disable export when no geometry unit is exportable', () => {
    render(
      <TooltipProvider>
        <ProjectExportAction />
      </TooltipProvider>,
    );

    expect(screen.getByRole('button', { name: /export/i })).toBeDisabled();
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

    expect(editorSend).toHaveBeenCalledWith({
      type: 'setPanelState',
      panelState: {
        openPanels: { converter: true },
        mobileActiveTab: 'converter',
      },
    });
  });
});
