// @vitest-environment jsdom
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

type GraphicsState = {
  readonly context: {
    readonly cameraFovAngle: number;
  };
};

type SliderProps = {
  readonly step?: number;
  readonly onValueChange?: (value: number[]) => void;
};

const mocks = vi.hoisted(() => ({
  graphicsSend: vi.fn(),
  modifiers: { shift: false },
}));

vi.mock('#hooks/use-graphics.js', () => ({
  useGraphics: () => ({ send: mocks.graphicsSend }),
  useGraphicsSelector: <T,>(selector: (state: GraphicsState) => T): T => selector({ context: { cameraFovAngle: 42 } }),
}));

vi.mock('#hooks/use-keyboard.js', () => ({
  useModifiers: () => ({ shift: mocks.modifiers.shift }),
}));

vi.mock('#components/ui/slider.js', () => ({
  Slider: ({ step, onValueChange }: SliderProps) => (
    <button type='button' data-testid='fov-slider' data-step={step} onClick={() => onValueChange?.([30])}>
      Slider
    </button>
  ),
}));

vi.mock('#components/ui/tooltip.js', () => ({
  Tooltip: ({ children }: { readonly children: ReactNode }): ReactNode => children,
  TooltipTrigger: ({ children }: { readonly children: ReactNode }): ReactNode => children,
  TooltipContent: ({ children }: { readonly children: ReactNode }): ReactNode => (
    <div data-testid='tooltip-content'>{children}</div>
  ),
}));

const { FovControl } = await import('#components/geometry/cad/fov-control.js');

describe('FovControl', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.modifiers.shift = false;
  });

  it('shows the 5-degree helper text while using 1-degree steps by default', () => {
    render(<FovControl />);

    expect(screen.getByTestId('fov-slider')).toHaveAttribute('data-step', '1');
    expect(screen.getByTestId('tooltip-content')).toHaveTextContent(/Hold .* for 5\u00B0 steps/);
    expect(screen.getByTestId('tooltip-content')).not.toHaveTextContent(/Release .* for 1\u00B0 steps/);
  });

  it('shows the 1-degree helper text while using 5-degree steps when Shift is held', () => {
    mocks.modifiers.shift = true;

    render(<FovControl />);

    expect(screen.getByTestId('fov-slider')).toHaveAttribute('data-step', '5');
    expect(screen.getByTestId('tooltip-content')).toHaveTextContent(/Release .* for 1\u00B0 steps/);
    expect(screen.getByTestId('tooltip-content')).not.toHaveTextContent(/Hold .* for 5\u00B0 steps/);
  });
});
