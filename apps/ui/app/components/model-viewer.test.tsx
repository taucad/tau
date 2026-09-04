import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Geometry } from '@taucad/types';
import { ModelViewer, RuntimeStatusOverlay } from '#components/model-viewer.js';
import type { ModelViewerProps } from '#components/model-viewer.js';

// ── Mocks ──────────────────────────────────────────────────────────────

const mockSend = vi.fn();
const mockUseActorRef = vi.fn((_machine?: unknown, _options?: unknown) => ({
  send: mockSend,
  getSnapshot: () => ({ context: {} }),
}));

vi.mock('@xstate/react', () => ({
  useActorRef: (machine: unknown, options: unknown) => mockUseActorRef(machine, options),
  useSelector: (_ref: unknown, selector: (s: unknown) => unknown) => selector({ context: {} }),
}));

vi.mock('#hooks/use-graphics.js', () => ({
  GraphicsProvider: ({ children }: { readonly children: React.ReactNode }) => (
    <div data-testid='graphics-provider'>{children}</div>
  ),
}));

vi.mock('#components/geometry/cad/cad-viewer.js', () => ({
  CadViewer: (props: { readonly enablePan?: boolean; readonly enableZoom?: boolean }) => (
    <div
      data-testid='cad-viewer'
      data-enable-pan={String(props.enablePan ?? false)}
      data-enable-zoom={String(props.enableZoom ?? false)}
    />
  ),
}));

vi.mock('#components/ui/loader.js', () => ({
  Loader: ({ className }: { readonly className?: string }) => <div data-testid='loader' className={className} />,
}));

vi.mock('#machines/graphics.machine.js', () => ({
  graphicsMachine: {},
}));

// ── Test data ──────────────────────────────────────────────────────────

const testGeometry: Geometry = { format: 'gltf', content: new Uint8Array([1, 2, 3]), hash: 'abc' };

// ── Tests ──────────────────────────────────────────────────────────────

describe('ModelViewer', () => {
  beforeEach(() => {
    mockSend.mockClear();
    mockUseActorRef.mockClear();
    mockUseActorRef.mockReturnValue({ send: mockSend, getSnapshot: () => ({ context: {} }) });
  });

  // ── Rendering states ────────────────────────────────────────────────

  describe('rendering states', () => {
    it('should render loading indicator when geometry is absent', () => {
      render(<ModelViewer geometry={undefined} />);

      expect(screen.getByTestId('loader')).toBeInTheDocument();
      expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'Loading preview');
    });

    it('should default to loading when geometry is absent and viewerState is omitted', () => {
      render(<ModelViewer geometry={undefined} />);

      expect(screen.getByTestId('loader')).toBeInTheDocument();
    });

    it('should show loading when viewerState is loading even with geometry present', () => {
      render(<ModelViewer geometry={testGeometry} viewerState='loading' />);

      expect(screen.getByTestId('loader')).toBeInTheDocument();
      expect(screen.queryByTestId('cad-viewer')).not.toBeInTheDocument();
    });

    it('should render CadViewer when geometry is provided', () => {
      render(<ModelViewer geometry={testGeometry} />);

      expect(screen.getByTestId('cad-viewer')).toBeInTheDocument();
      expect(screen.queryByTestId('loader')).not.toBeInTheDocument();
    });

    it('should render a blocking error state when error is provided without geometry', () => {
      const error = new Error('Something went wrong');

      render(<ModelViewer geometry={undefined} error={error} />);

      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText('Something went wrong')).toBeInTheDocument();
      expect(screen.queryByTestId('cad-viewer')).not.toBeInTheDocument();
    });

    it('should retain geometry and show a non-blocking alert after a failed rerender', () => {
      render(<ModelViewer geometry={testGeometry} error={new Error('rerender sentinel')} />);

      expect(screen.getByTestId('cad-viewer')).toBeInTheDocument();
      expect(screen.getByRole('alert', { name: 'CAD runtime error' })).toHaveTextContent('rerender sentinel');
    });
  });

  // ── Viewer props forwarding ─────────────────────────────────────────

  describe('viewer props forwarding', () => {
    it('should forward enablePan to CadViewer', () => {
      render(<ModelViewer geometry={testGeometry} enablePan />);

      expect(screen.getByTestId('cad-viewer')).toHaveAttribute('data-enable-pan', 'true');
    });

    it('should forward enableZoom to CadViewer', () => {
      render(<ModelViewer geometry={testGeometry} enableZoom />);

      expect(screen.getByTestId('cad-viewer')).toHaveAttribute('data-enable-zoom', 'true');
    });

    it('should apply className to the container', () => {
      render(<ModelViewer geometry={testGeometry} className='custom-class' />);

      expect(screen.getByRole('img')).toHaveClass('custom-class');
    });
  });

  // ── Graphics machine integration ───────────────────────────────────

  describe('graphics machine integration', () => {
    it('should send updateGeometry to graphicsMachine when geometry is provided', () => {
      render(<ModelViewer geometry={testGeometry} />);

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'updateGeometry',
          geometry: testGeometry,
        }),
      );
    });

    it('should not send updateGeometry when geometry is absent', () => {
      render(<ModelViewer geometry={undefined} />);

      expect(mockSend).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'updateGeometry' }));
    });
  });

  // ── External graphicsRef ────────────────────────────────────────────

  describe('external graphicsRef', () => {
    it('should use external graphicsRef instead of creating its own', () => {
      const externalSend = vi.fn();
      const externalRef = { send: externalSend, getSnapshot: () => ({ context: {} }) };

      render(
        <ModelViewer geometry={testGeometry} graphicsRef={externalRef as unknown as ModelViewerProps['graphicsRef']} />,
      );

      expect(externalSend).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'updateGeometry',
          geometry: testGeometry,
        }),
      );
      expect(mockUseActorRef).not.toHaveBeenCalled();
    });

    it('should not create internal graphicsMachine when external graphicsRef is provided', () => {
      const externalRef = { send: vi.fn(), getSnapshot: () => ({ context: {} }) };

      render(
        <ModelViewer geometry={undefined} graphicsRef={externalRef as unknown as ModelViewerProps['graphicsRef']} />,
      );

      expect(mockUseActorRef).not.toHaveBeenCalled();
    });

    it('should create internal graphicsMachine when no external graphicsRef is provided', () => {
      render(<ModelViewer geometry={testGeometry} />);

      expect(mockUseActorRef).toHaveBeenCalled();
    });

    it('should render CadViewer with external graphicsRef when geometry is provided', () => {
      const externalRef = { send: vi.fn(), getSnapshot: () => ({ context: {} }) };

      render(
        <ModelViewer
          geometry={testGeometry}
          graphicsRef={externalRef as unknown as ModelViewerProps['graphicsRef']}
          enablePan
        />,
      );

      expect(screen.getByTestId('cad-viewer')).toBeInTheDocument();
      expect(screen.getByTestId('cad-viewer')).toHaveAttribute('data-enable-pan', 'true');
    });

    it('should render loading state with external graphicsRef when geometry is absent', () => {
      const externalRef = { send: vi.fn(), getSnapshot: () => ({ context: {} }) };

      render(
        <ModelViewer geometry={undefined} graphicsRef={externalRef as unknown as ModelViewerProps['graphicsRef']} />,
      );

      expect(screen.getByTestId('loader')).toBeInTheDocument();
    });

    it('should retain geometry with an external graphicsRef when error is provided', () => {
      const externalRef = { send: vi.fn(), getSnapshot: () => ({ context: {} }) };
      const error = new Error('External error');

      render(
        <ModelViewer
          geometry={testGeometry}
          graphicsRef={externalRef as unknown as ModelViewerProps['graphicsRef']}
          error={error}
        />,
      );

      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText('External error')).toBeInTheDocument();
      expect(screen.getByTestId('cad-viewer')).toBeInTheDocument();
    });
  });
});

describe('RuntimeStatusOverlay', () => {
  it('should render status overlay when status is connecting', () => {
    render(<RuntimeStatusOverlay status='connecting' />);

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByText('connecting...')).toBeInTheDocument();
  });

  it('should render status overlay when status is rendering', () => {
    render(<RuntimeStatusOverlay status='rendering' />);

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByText('rendering...')).toBeInTheDocument();
  });

  it('should render nothing when status is idle', () => {
    const { container } = render(<RuntimeStatusOverlay status='idle' />);

    expect(container.innerHTML).toBe('');
  });

  it('should render nothing when status is ready', () => {
    const { container } = render(<RuntimeStatusOverlay status='ready' />);

    expect(container.innerHTML).toBe('');
  });

  it('should apply custom className to the overlay', () => {
    render(<RuntimeStatusOverlay status='rendering' className='custom-position' />);

    expect(screen.getByRole('status')).toHaveClass('custom-position');
  });
});
