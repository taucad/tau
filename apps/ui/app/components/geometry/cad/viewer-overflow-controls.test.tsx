// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

type CameraState = {
  readonly context: {
    readonly view: { readonly requestedVerticalFieldOfView: number };
  };
};

const mocks = vi.hoisted(() => ({
  cameraSend: vi.fn(),
}));

vi.mock('#hooks/use-graphics.js', () => ({
  useCameraRig: () => ({ actorRef: { send: mocks.cameraSend } }),
  useCameraSelector: <T,>(selector: (state: CameraState) => T): T =>
    selector({ context: { view: { requestedVerticalFieldOfView: 42 } } }),
}));

const { FovOverflowControl } = await import('#components/geometry/cad/viewer-overflow-controls.js');

describe('FovOverflowControl', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the degree adornment and dispatches typed and stepped values', async () => {
    const user = userEvent.setup();
    render(<FovOverflowControl />);
    const input = screen.getByRole('textbox', { name: 'Field of View' });

    expect(input).toHaveValue('42');
    expect(screen.getByText('°')).toBeInTheDocument();

    await user.click(input);
    await user.keyboard('{ArrowUp}');
    expect(mocks.cameraSend).toHaveBeenLastCalledWith({
      type: 'setVerticalFieldOfView',
      verticalFieldOfView: 43,
    });

    await user.clear(input);
    await user.type(input, '30');
    await user.keyboard('{Enter}');
    expect(mocks.cameraSend).toHaveBeenLastCalledWith({
      type: 'setVerticalFieldOfView',
      verticalFieldOfView: 30,
    });
  });
});
