import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ActorBridge } from '#components/geometry/graphics/three/actor-bridge.js';

const mockUseThree = vi.fn();

vi.mock('@react-three/fiber', () => ({
  useThree: (): ReturnType<typeof mockUseThree> => mockUseThree(),
}));

vi.mock('#components/geometry/graphics/three/controls-listener-bridge.js', () => ({
  ControlsListenerBridge: () => <div data-testid='controls-listener-bridge' />,
}));

const mockGraphicsSend = vi.fn();
const mockScreenshotSend = vi.fn();

vi.mock('#hooks/use-graphics.js', () => ({
  useGraphics: (): { send: typeof mockGraphicsSend } => ({
    send: mockGraphicsSend,
  }),
  useScreenshotCapability: (): { send: typeof mockScreenshotSend } => ({
    send: mockScreenshotSend,
  }),
  useGraphicsSelector: (selector: (state: { context: { cameraFovAngle: number } }) => number): number =>
    selector({ context: { cameraFovAngle: 50 } }),
}));

vi.mock('#components/geometry/graphics/three/utils/camera.utils.js', () => ({
  updateCameraFov: vi.fn(),
}));

const baseThree = {
  gl: {},
  scene: {},
  camera: {},
  invalidate: vi.fn(),
};

describe('ActorBridge', () => {
  beforeEach(() => {
    mockScreenshotSend.mockClear();
    mockGraphicsSend.mockClear();
    mockUseThree.mockReset();
    mockUseThree.mockReturnValue({
      ...baseThree,
      controls: null,
    });
  });

  it('does not mount ControlsListenerBridge when controls is null', () => {
    mockUseThree.mockReturnValue({
      ...baseThree,
      controls: null,
    });

    render(<ActorBridge />);

    expect(screen.queryByTestId('controls-listener-bridge')).not.toBeInTheDocument();
  });

  it('mounts ControlsListenerBridge when controls is populated', () => {
    mockUseThree.mockReturnValue({
      ...baseThree,
      controls: { addEventListener: vi.fn(), removeEventListener: vi.fn(), getDistance: () => 1 },
    });

    render(<ActorBridge />);

    expect(screen.getByTestId('controls-listener-bridge')).toBeInTheDocument();
  });
});
