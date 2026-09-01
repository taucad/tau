// @vitest-environment jsdom
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

type CameraState = {
  readonly context: {
    readonly view: { readonly requestedVerticalFieldOfView: number };
  };
};

type SliderProps = {
  readonly step?: number;
  readonly onValueChange?: (value: number[]) => void;
};

const mocks = vi.hoisted(() => ({
  cameraSend: vi.fn(),
  modifiers: { shift: false },
}));

vi.mock('#hooks/use-graphics.js', () => ({
  useCameraRig: () => ({ actorRef: { send: mocks.cameraSend } }),
  useCameraSelector: <T,>(selector: (state: CameraState) => T): T =>
    selector({ context: { view: { requestedVerticalFieldOfView: 42 } } }),
}));

vi.mock('#hooks/use-keyboard.js', () => ({
  useModifiers: () => ({ shift: mocks.modifiers.shift }),
}));

vi.mock('@taucad/ui/components/slider', () => ({
  Slider: ({ step, onValueChange }: SliderProps) => (
    <button type='button' data-testid='fov-slider' data-step={step} onClick={() => onValueChange?.([30])}>
      Slider
    </button>
  ),
}));

vi.mock('@taucad/ui/components/tooltip', () => ({
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
    screen.getByTestId('fov-slider').click();
    expect(mocks.cameraSend).toHaveBeenCalledWith({ type: 'setVerticalFieldOfView', verticalFieldOfView: 30 });
  });

  it('shows the 1-degree helper text while using 5-degree steps when Shift is held', () => {
    mocks.modifiers.shift = true;

    render(<FovControl />);

    expect(screen.getByTestId('fov-slider')).toHaveAttribute('data-step', '5');
    expect(screen.getByTestId('tooltip-content')).toHaveTextContent(/Release .* for 1\u00B0 steps/);
    expect(screen.getByTestId('tooltip-content')).not.toHaveTextContent(/Hold .* for 5\u00B0 steps/);
  });
});
