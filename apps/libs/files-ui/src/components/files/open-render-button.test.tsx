// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OpenRenderButton } from '#components/files/open-render-button.js';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import { ProjectContext } from '@taucad/ui-core/contexts/project-context';
import type { ProjectContextValue } from '@taucad/ui-core/contexts/project-context';

const projectSend = vi.fn();
const project: ProjectContextValue = {
  projectId: 'project-1',
  projectRef: { send: projectSend },
  editorRef: { send: vi.fn() },
};

beforeEach(() => {
  projectSend.mockReset();
});

afterEach(() => {
  cleanup();
});

describe('OpenRenderButton', () => {
  it('dispatches openInViewer for the entry path on click', async () => {
    const user = userEvent.setup();
    render(
      <ProjectContext.Provider value={project}>
        <TooltipProvider>
          <OpenRenderButton path='parts/wing.ts' />
        </TooltipProvider>
      </ProjectContext.Provider>,
    );

    await user.click(screen.getByRole('button', { name: /open/i }));

    expect(projectSend).toHaveBeenCalledWith({
      type: 'openInViewer',
      entryPath: 'parts/wing.ts',
    });
  });

  it('stops click propagation so parent collapsible triggers do not fire', async () => {
    const user = userEvent.setup();
    const parentClick = vi.fn();

    render(
      <ProjectContext.Provider value={project}>
        <TooltipProvider>
          <div onClick={parentClick}>
            <OpenRenderButton path='main.scad' />
          </div>
        </TooltipProvider>
      </ProjectContext.Provider>,
    );

    await user.click(screen.getByRole('button', { name: /open/i }));

    expect(parentClick).not.toHaveBeenCalled();
  });
});
