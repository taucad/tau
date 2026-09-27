// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

type CameraState = {
  readonly context: {
    readonly view: { readonly requestedVerticalFieldOfView: number };
  };
};

type RenderOptionsCapability = {
  readonly renderOptions: { readonly schema: Record<string, unknown>; readonly defaults: Record<string, unknown> };
};

type CadState = {
  readonly context: {
    readonly activeKernelId: string | undefined;
    readonly capabilities: { readonly renderCapabilities: Record<string, RenderOptionsCapability> } | undefined;
    readonly renderOptions: Record<string, unknown>;
  };
};

const mocks = vi.hoisted(() => {
  const cadState: CadState = { context: { activeKernelId: undefined, capabilities: undefined, renderOptions: {} } };
  return { cameraSend: vi.fn(), cadSend: vi.fn(), cadState };
});

vi.mock('#hooks/use-graphics.js', () => ({
  useCameraRig: () => ({ actorRef: { send: mocks.cameraSend } }),
  useCameraSelector: <T,>(selector: (state: CameraState) => T): T =>
    selector({ context: { view: { requestedVerticalFieldOfView: 42 } } }),
}));

vi.mock('#hooks/use-cad.js', () => ({
  useCad: () => ({ send: mocks.cadSend }),
  useCadSelector: <T,>(selector: (state: CadState) => T): T => selector(mocks.cadState),
}));

const { FovOverflowControl, OutputOverflowControl } =
  await import('#components/geometry/cad/viewer-overflow-controls.js');

const setCadState = (context: CadState['context']): void => {
  mocks.cadState = { context };
};

const withRenderOptions = (
  schema: Record<string, unknown>,
  defaults: Record<string, unknown> = {},
): CadState['context']['capabilities'] => ({
  renderCapabilities: { eda: { renderOptions: { schema, defaults } } },
});

describe('FovOverflowControl', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the degree adornment and dispatches typed and stepped values', async () => {
    const user = userEvent.setup();
    render(<FovOverflowControl />);
    const input = screen.getByRole('spinbutton', { name: 'Field of View' });

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

describe('OutputOverflowControl', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setCadState({ activeKernelId: undefined, capabilities: undefined, renderOptions: {} });
  });

  it('should render nothing when the active kernel declares no output enum', () => {
    setCadState({
      activeKernelId: 'eda',
      capabilities: withRenderOptions({ type: 'object', properties: { quality: { type: 'string' } } }),
      renderOptions: {},
    });
    const { container } = render(<OutputOverflowControl />);

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText('Output')).not.toBeInTheDocument();
  });

  it('should render nothing when the manifest names another kernel', () => {
    setCadState({
      activeKernelId: 'other',
      capabilities: withRenderOptions({ properties: { output: { enum: ['3d', 'schematic'] } } }),
      renderOptions: {},
    });
    const { container } = render(<OutputOverflowControl />);

    expect(container).toBeEmptyDOMElement();
  });

  it('should list the output enum with the manifest default selected', () => {
    setCadState({
      activeKernelId: 'eda',
      capabilities: withRenderOptions(
        { properties: { output: { enum: ['3d', 'schematic', 'pcb'], default: '3d' } } },
        { output: 'schematic' },
      ),
      renderOptions: {},
    });
    render(<OutputOverflowControl />);

    expect(screen.getByText('Output')).toBeInTheDocument();
    const radios = screen.getAllByRole('radio');
    expect(radios.map((radio) => radio.getAttribute('aria-label'))).toEqual(['3D', 'Schematic', 'PCB']);
    expect(screen.getByRole('radio', { name: 'Schematic' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: '3D' })).toHaveAttribute('aria-checked', 'false');
  });

  it('should prefer the current render option over the default', () => {
    setCadState({
      activeKernelId: 'eda',
      capabilities: withRenderOptions({ properties: { output: { enum: ['3d', 'schematic'], default: '3d' } } }),
      renderOptions: { output: 'schematic' },
    });
    render(<OutputOverflowControl />);

    expect(screen.getByRole('radio', { name: 'Schematic' })).toHaveAttribute('aria-checked', 'true');
  });

  it('should dispatch setRenderOptions with the chosen output', async () => {
    const user = userEvent.setup();
    setCadState({
      activeKernelId: 'eda',
      capabilities: withRenderOptions({ properties: { output: { enum: ['3d', 'schematic', 'pcb'], default: '3d' } } }),
      renderOptions: {},
    });
    render(<OutputOverflowControl />);

    await user.click(screen.getByRole('radio', { name: 'Schematic' }));
    expect(mocks.cadSend).toHaveBeenCalledWith({ type: 'setRenderOptions', renderOptions: { output: 'schematic' } });

    await user.keyboard('{ArrowRight}{Enter}');
    expect(mocks.cadSend).toHaveBeenLastCalledWith({ type: 'setRenderOptions', renderOptions: { output: 'pcb' } });
  });
});
