// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import { MeasureControl } from '#components/geometry/cad/measure-control.js';

type GraphicsState = {
  readonly context: { readonly geometry: { readonly format: 'gltf' } };
  readonly matches: (value: unknown) => boolean;
};

const mocks = vi.hoisted(() => ({
  graphicsSend: vi.fn(),
  isMeasureActive: false,
}));

vi.mock('#hooks/use-graphics.js', () => ({
  useGraphics: () => ({ send: mocks.graphicsSend }),
  useGraphicsSelector: <T,>(selector: (state: GraphicsState) => T): T =>
    selector({ context: { geometry: { format: 'gltf' } }, matches: () => mocks.isMeasureActive }),
}));

describe('MeasureControl', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isMeasureActive = false;
  });

  it('should expose an unpressed Measure toggle that enables the measuring tool', async () => {
    const user = userEvent.setup();
    render(
      <TooltipProvider>
        <MeasureControl />
      </TooltipProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Measure', pressed: false }));

    expect(mocks.graphicsSend).toHaveBeenCalledWith({ type: 'setMeasureActive', payload: true });
  });

  it('should keep the Measure name and report pressed when active', () => {
    mocks.isMeasureActive = true;
    render(
      <TooltipProvider>
        <MeasureControl />
      </TooltipProvider>,
    );

    expect(screen.getByRole('button', { name: 'Measure', pressed: true })).toBeInTheDocument();
  });
});
