// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import { ResetCameraControl } from '#components/geometry/cad/reset-camera-control.js';

const mocks = vi.hoisted(() => ({ graphicsSend: vi.fn() }));

vi.mock('#hooks/use-graphics.js', () => ({
  useGraphics: () => ({ send: mocks.graphicsSend }),
}));

describe('ResetCameraControl', () => {
  it('should expose a Reset camera button that resets the camera', async () => {
    const user = userEvent.setup();
    render(
      <TooltipProvider>
        <ResetCameraControl />
      </TooltipProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Reset camera' }));

    expect(mocks.graphicsSend).toHaveBeenCalledWith({ type: 'resetCamera' });
  });
});
