import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Geometry } from '@taucad/types';
import { ModelViewer, RuntimeStatusOverlay, emptyGeometryMessage } from '#components/model-viewer.js';
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

const testGeometries: Geometry[] = [{ format: 'gltf', content: new Uint8Array([1, 2, 3]), hash: 'abc' }];

// ── Tests ──────────────────────────────────────────────────────────────

describe('ModelViewer', () => {
  beforeEach(() => {
    mockSend.mockClear();
    mockUseActorRef.mockClear();
    mockUseActorRef.mockReturnValue({ send: mockSend, getSnapshot: () => ({ context: {} }) });
  });

  // ── Rendering states ────────────────────────────────────────────────

  describe('rendering states', () => {
    it('should render loading indicator when geometries array is empty', () => {
      render(<ModelViewer geometries={[]} />);

      expect(screen.getByTestId('loader')).toBeInTheDocument();
      expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'Loading preview');
    });

    it('should render empty-geometry hint when viewerState is empty', () => {
      render(<ModelViewer geometries={[]} viewerState='empty' />);

      expect(screen.queryByTestId('loader')).not.toBeInTheDocument();
      expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'Empty model');
      expect(screen.getByText(emptyGeometryMessage)).toBeInTheDocument();
    });

    it('should default to loading when geometries are empty and viewerState is omitted', () => {
      render(<ModelViewer geometries={[]} />);

      expect(screen.getByTestId('loader')).toBeInTheDocument();
      expect(screen.queryByText(emptyGeometryMessage)).not.toBeInTheDocument();
    });

    it('should show loading when viewerState is loading even with geometries present', () => {
      render(<ModelViewer geometries={testGeometries} viewerState='loading' />);

      expect(screen.getByTestId('loader')).toBeInTheDocument();
      expect(screen.queryByTestId('cad-viewer')).not.toBeInTheDocument();
    });

    it('should render CadViewer when geometries are provided', () => {
      render(<ModelViewer geometries={testGeometries} />);

      expect(screen.getByTestId('cad-viewer')).toBeInTheDocument();
      expect(screen.queryByTestId('loader')).not.toBeInTheDocument();
    });

    it('should render error state when error prop is provided', () => {
      const error = new Error('Something went wrong');

      render(<ModelViewer geometries={testGeometries} error={error} />);

      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText('Something went wrong')).toBeInTheDocument();
      expect(screen.queryByTestId('cad-viewer')).not.toBeInTheDocument();
    });
  });

  // ── Viewer props forwarding ─────────────────────────────────────────

  describe('viewer props forwarding', () => {
    it('should forward enablePan to CadViewer', () => {
      render(<ModelViewer geometries={testGeometries} enablePan />);

      expect(screen.getByTestId('cad-viewer')).toHaveAttribute('data-enable-pan', 'true');
    });

    it('should forward enableZoom to CadViewer', () => {
      render(<ModelViewer geometries={testGeometries} enableZoom />);

      expect(screen.getByTestId('cad-viewer')).toHaveAttribute('data-enable-zoom', 'true');
    });

    it('should apply className to the container', () => {
      render(<ModelViewer geometries={testGeometries} className='custom-class' />);

      expect(screen.getByRole('img')).toHaveClass('custom-class');
    });
  });

  // ── Graphics machine integration ───────────────────────────────────

  describe('graphics machine integration', () => {
    it('should send updateGeometries to graphicsMachine when geometries are provided', () => {
      render(<ModelViewer geometries={testGeometries} />);

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'updateGeometries',
          geometries: testGeometries,
        }),
      );
    });

    it('should not send updateGeometries when geometries array is empty', () => {
      render(<ModelViewer geometries={[]} />);

      expect(mockSend).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'updateGeometries' }));
    });
  });

  // ── External graphicsRef ────────────────────────────────────────────

  describe('external graphicsRef', () => {
    it('should use external graphicsRef instead of creating its own', () => {
      const externalSend = vi.fn();
      const externalRef = { send: externalSend, getSnapshot: () => ({ context: {} }) };

      render(
        <ModelViewer
          geometries={testGeometries}
          graphicsRef={externalRef as unknown as ModelViewerProps['graphicsRef']}
        />,
      );

      expect(externalSend).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'updateGeometries',
          geometries: testGeometries,
        }),
      );
      expect(mockUseActorRef).not.toHaveBeenCalled();
    });

    it('should not create internal graphicsMachine when external graphicsRef is provided', () => {
      const externalRef = { send: vi.fn(), getSnapshot: () => ({ context: {} }) };

      render(<ModelViewer geometries={[]} graphicsRef={externalRef as unknown as ModelViewerProps['graphicsRef']} />);

      expect(mockUseActorRef).not.toHaveBeenCalled();
    });

    it('should create internal graphicsMachine when no external graphicsRef is provided', () => {
      render(<ModelViewer geometries={testGeometries} />);

      expect(mockUseActorRef).toHaveBeenCalled();
    });

    it('should render CadViewer with external graphicsRef when geometries are provided', () => {
      const externalRef = { send: vi.fn(), getSnapshot: () => ({ context: {} }) };

      render(
        <ModelViewer
          geometries={testGeometries}
          graphicsRef={externalRef as unknown as ModelViewerProps['graphicsRef']}
          enablePan
        />,
      );

      expect(screen.getByTestId('cad-viewer')).toBeInTheDocument();
      expect(screen.getByTestId('cad-viewer')).toHaveAttribute('data-enable-pan', 'true');
    });

    it('should render loading state with external graphicsRef when geometries are empty', () => {
      const externalRef = { send: vi.fn(), getSnapshot: () => ({ context: {} }) };

      render(<ModelViewer geometries={[]} graphicsRef={externalRef as unknown as ModelViewerProps['graphicsRef']} />);

      expect(screen.getByTestId('loader')).toBeInTheDocument();
    });

    it('should render error state with external graphicsRef when error is provided', () => {
      const externalRef = { send: vi.fn(), getSnapshot: () => ({ context: {} }) };
      const error = new Error('External error');

      render(
        <ModelViewer
          geometries={testGeometries}
          graphicsRef={externalRef as unknown as ModelViewerProps['graphicsRef']}
          error={error}
        />,
      );

      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText('External error')).toBeInTheDocument();
    });
  });
});

describe('RuntimeStatusOverlay', () => {
  it('should render status overlay when status is loading', () => {
    render(<RuntimeStatusOverlay status='loading' />);

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByText('loading...')).toBeInTheDocument();
  });

  it('should render nothing when status is idle', () => {
    const { container } = render(<RuntimeStatusOverlay status='idle' />);

    expect(container.innerHTML).toBe('');
  });

  it('should render nothing when status is success', () => {
    const { container } = render(<RuntimeStatusOverlay status='success' />);

    expect(container.innerHTML).toBe('');
  });

  it('should apply custom className to the overlay', () => {
    render(<RuntimeStatusOverlay status='loading' className='custom-position' />);

    expect(screen.getByRole('status')).toHaveClass('custom-position');
  });
});
