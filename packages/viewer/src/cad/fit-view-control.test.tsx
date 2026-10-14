// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import { FitViewControl } from '#cad/fit-view-control.jsx';

const mocks = vi.hoisted(() => ({ graphicsSend: vi.fn(), canFit: true }));

vi.mock('#hooks/use-graphics.jsx', () => ({
  useGraphicsSelector: () => mocks.canFit,
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

  it('should show the F shortcut in its tooltip', async () => {
    const user = userEvent.setup();
    render(
      <TooltipProvider>
        <FitViewControl shortcut='F' />
      </TooltipProvider>,
    );

    await user.hover(screen.getByRole('button', { name: 'Fit view' }));

    expect(await screen.findByRole('tooltip')).toMatchTextContent('Fit viewF');
  });
  it('should not claim to fit an empty model', async () => {
    mocks.canFit = false;
    mocks.graphicsSend.mockClear();
    try {
      render(
        <TooltipProvider>
          <FitViewControl />
        </TooltipProvider>,
      );
      const button = screen.getByRole('button', { name: 'Fit view' });
      expect(button).toHaveAttribute('aria-disabled', 'true');
      await userEvent.click(button);
      expect(mocks.graphicsSend).not.toHaveBeenCalled();
    } finally {
      mocks.canFit = true;
    }
  });
});
