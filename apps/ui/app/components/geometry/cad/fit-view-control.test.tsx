// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import { FitViewControl } from '#components/geometry/cad/fit-view-control.js';

const mocks = vi.hoisted(() => ({ graphicsSend: vi.fn() }));

vi.mock('#hooks/use-graphics.js', () => ({
  useGraphics: () => ({ send: mocks.graphicsSend }),
}));

describe('FitViewControl', () => {
  it('should expose a Fit view button that fits the view', async () => {
    const user = userEvent.setup();
    render(
      <TooltipProvider>
        <FitViewControl />
      </TooltipProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Fit view' }));

    expect(mocks.graphicsSend).toHaveBeenCalledWith({ type: 'fitView' });
  });
});
