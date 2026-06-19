// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OpenRenderButton } from '#components/files/open-render-button.js';
import { TooltipProvider } from '#components/ui/tooltip.js';

const projectSend = vi.hoisted(() => vi.fn());

vi.mock('#hooks/use-project.js', () => ({
  useProject: () => ({
    projectRef: { send: projectSend },
  }),
}));

beforeEach(() => {
  projectSend.mockReset();
});

afterEach(() => {
  cleanup();
});

describe('OpenRenderButton', () => {
  it('dispatches openInViewer for the entry file on click', async () => {
    const user = userEvent.setup();
    render(
      <TooltipProvider>
        <OpenRenderButton path='parts/wing.ts' />
      </TooltipProvider>,
    );

    await user.click(screen.getByRole('button', { name: /open/i }));

    expect(projectSend).toHaveBeenCalledWith({
      type: 'openInViewer',
      entryFile: 'parts/wing.ts',
    });
  });

  it('stops click propagation so parent collapsible triggers do not fire', async () => {
    const user = userEvent.setup();
    const parentClick = vi.fn();

    render(
      <TooltipProvider>
        <div onClick={parentClick}>
          <OpenRenderButton path='main.scad' />
        </div>
      </TooltipProvider>,
    );

    await user.click(screen.getByRole('button', { name: /open/i }));

    expect(parentClick).not.toHaveBeenCalled();
  });
});
