// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import { MeasureControl } from '#cad/measure-control.jsx';

type GraphicsState = {
  readonly context: { readonly isMeasureActive: boolean; readonly geometryRadius: number };
};

const mocks = vi.hoisted(() => ({
  graphicsSend: vi.fn(),
  isMeasureActive: false,
  geometryRadius: 1,
}));

vi.mock('#hooks/use-graphics.jsx', () => ({
  useGraphics: () => ({ send: mocks.graphicsSend }),
  useGraphicsSelector: <T,>(selector: (state: GraphicsState) => T): T =>
    selector({ context: { isMeasureActive: mocks.isMeasureActive, geometryRadius: mocks.geometryRadius } }),
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
    mocks.geometryRadius = 1;
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
  it('should explain that a model is required before starting the tool', async () => {
    mocks.geometryRadius = 0;
    renderToggle();
    const button = screen.getByRole('button', { name: 'Measure' });
    expect(button).toHaveAttribute('aria-disabled', 'true');
    const user = userEvent.setup();
    await user.click(button);
    expect(mocks.graphicsSend).not.toHaveBeenCalled();
    await user.unhover(button);
    await user.hover(button);
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Available when a model is displayed');
  });
});
