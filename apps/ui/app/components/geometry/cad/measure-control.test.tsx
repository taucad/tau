// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import { MeasureControl } from '#components/geometry/cad/measure-control.js';

type GraphicsState = {
  readonly context: { readonly isMeasureActive: boolean };
};

const mocks = vi.hoisted(() => ({
  graphicsSend: vi.fn(),
  isMeasureActive: false,
}));

vi.mock('#hooks/use-graphics.js', () => ({
  useGraphics: () => ({ send: mocks.graphicsSend }),
  useGraphicsSelector: <T,>(selector: (state: GraphicsState) => T): T =>
    selector({ context: { isMeasureActive: mocks.isMeasureActive } }),
}));

const renderToggle = (properties: React.ComponentProps<typeof MeasureControl> = {}): void => {
  render(
    <TooltipProvider>
      <MeasureControl {...properties} />
    </TooltipProvider>,
  );
};

describe('MeasureControl', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isMeasureActive = false;
  });

  it('should start measuring and then call onStart', async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();
    renderToggle({ onStart });

    await user.click(screen.getByRole('button', { name: 'Measure', pressed: false }));

    expect(mocks.graphicsSend).toHaveBeenCalledWith({ type: 'setMeasureActive', payload: true });
    expect(onStart).toHaveBeenCalledOnce();
  });

  it('should stop measuring without calling onStart while active', async () => {
    mocks.isMeasureActive = true;
    const user = userEvent.setup();
    const onStart = vi.fn();
    renderToggle({ onStart });

    await user.click(screen.getByRole('button', { name: 'Measure', pressed: true }));

    expect(mocks.graphicsSend).toHaveBeenCalledWith({ type: 'setMeasureActive', payload: false });
    expect(onStart).not.toHaveBeenCalled();
  });

  it('should show the name and the shortcut at rest', async () => {
    const user = userEvent.setup();
    renderToggle({ shortcut: 'M' });

    await user.hover(screen.getByRole('button', { name: 'Measure' }));

    expect(await screen.findByRole('tooltip')).toHaveTextContent('MeasureM');
  });

  it('should read Stop measure while running', async () => {
    mocks.isMeasureActive = true;
    const user = userEvent.setup();
    renderToggle();

    await user.hover(screen.getByRole('button', { name: 'Measure' }));

    expect(await screen.findByRole('tooltip')).toHaveTextContent('Stop measure');
  });
});
