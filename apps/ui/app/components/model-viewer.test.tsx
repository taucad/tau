import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createEmptyGlb } from '@taucad/geometry-core';
import type { Artifact } from '@taucad/runtime';
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

const testArtifact: Artifact = { mimeType: 'model/gltf-binary', content: new Uint8Array([1, 2, 3]) };
const testHash = 'abc';

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
      render(<ModelViewer artifact={undefined} artifactHash={undefined} />);

      expect(screen.getByTestId('loader')).toBeInTheDocument();
      expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'Loading preview');
    });

    it('should default to loading when geometry is absent and viewerState is omitted', () => {
      render(<ModelViewer artifact={undefined} artifactHash={undefined} />);

      expect(screen.getByTestId('loader')).toBeInTheDocument();
    });

    it('clears the prior graphics actor on a successful empty GLB', () => {
      const viewer = render(<ModelViewer artifact={testArtifact} artifactHash={testHash} />);
      mockSend.mockClear();
      viewer.rerender(
        <ModelViewer artifact={{ mimeType: 'model/gltf-binary', content: createEmptyGlb() }} artifactHash='empty' />,
      );

      expect(mockSend).toHaveBeenCalledWith({ type: 'clearArtifact' });
      expect(screen.getByRole('status', { name: 'Empty model' })).toBeInTheDocument();
      expect(screen.queryByTestId('cad-viewer')).not.toBeInTheDocument();
    });

    it('clears graphics for settled no-artifact success and unknown media, but retains them on failure', () => {
      const viewer = render(<ModelViewer artifact={testArtifact} artifactHash={testHash} />);
      mockSend.mockClear();
      viewer.rerender(
        <ModelViewer artifact={undefined} artifactHash={undefined} viewerState='ready' error={new Error('failed')} />,
      );
      expect(mockSend).not.toHaveBeenCalledWith({ type: 'clearArtifact' });
      expect(screen.getByRole('alert')).toBeInTheDocument();

      viewer.rerender(<ModelViewer artifact={undefined} artifactHash={undefined} viewerState='ready' />);
      expect(mockSend).toHaveBeenCalledWith({ type: 'clearArtifact' });
      expect(screen.getByRole('status', { name: 'Empty model' })).toBeInTheDocument();

      mockSend.mockClear();
      viewer.rerender(
        <ModelViewer
          artifact={{ mimeType: 'application/octet-stream', content: new Uint8Array([1]) }}
          artifactHash='unknown'
        />,
      );
      expect(mockSend).toHaveBeenCalledWith({ type: 'clearArtifact' });
      expect(screen.getByRole('status', { name: 'Unsupported preview format' })).toBeInTheDocument();
    });

    it('should show loading when viewerState is loading even with geometry present', () => {
      render(<ModelViewer artifact={testArtifact} artifactHash={testHash} viewerState='loading' />);

      expect(screen.getByTestId('loader')).toBeInTheDocument();
      expect(screen.queryByTestId('cad-viewer')).not.toBeInTheDocument();
    });

    it('should render CadViewer when geometry is provided', () => {
      render(<ModelViewer artifact={testArtifact} artifactHash={testHash} />);

      expect(screen.getByTestId('cad-viewer')).toBeInTheDocument();
      expect(screen.queryByTestId('loader')).not.toBeInTheDocument();
    });

    it('should render a blocking error state when error is provided without geometry', () => {
      const error = new Error('Something went wrong');

      render(<ModelViewer artifact={undefined} artifactHash={undefined} error={error} />);

      const alert = screen.getByRole('alert', { name: 'CAD runtime error' });
      expect(alert).toHaveTextContent('Preview could not load. Open the project to see the error.');
      // The runtime's own text is one disclosure away, not the headline.
      expect(within(alert).getByText('Something went wrong').closest('details')).not.toHaveAttribute('open');
      expect(within(alert).getByText('Details')).toBeInTheDocument();
      expect(screen.queryByTestId('cad-viewer')).not.toBeInTheDocument();
    });

    it('should retain geometry and show a non-blocking alert after a failed rerender', () => {
      render(<ModelViewer artifact={testArtifact} artifactHash={testHash} error={new Error('rerender sentinel')} />);

      expect(screen.getByTestId('cad-viewer')).toBeInTheDocument();
      expect(screen.getByRole('alert', { name: 'CAD runtime error' })).toHaveTextContent('rerender sentinel');
    });
  });

  // ── Viewer props forwarding ─────────────────────────────────────────

  describe('viewer props forwarding', () => {
    it('should forward enablePan to CadViewer', () => {
      render(<ModelViewer artifact={testArtifact} artifactHash={testHash} enablePan />);

      expect(screen.getByTestId('cad-viewer')).toHaveAttribute('data-enable-pan', 'true');
    });

    it('should forward enableZoom to CadViewer', () => {
      render(<ModelViewer artifact={testArtifact} artifactHash={testHash} enableZoom />);

      expect(screen.getByTestId('cad-viewer')).toHaveAttribute('data-enable-zoom', 'true');
    });

    it('should apply className to the container', () => {
      render(<ModelViewer artifact={testArtifact} artifactHash={testHash} className='custom-class' />);

      expect(screen.getByRole('img')).toHaveClass('custom-class');
    });
  });

  // ── Graphics machine integration ───────────────────────────────────

  describe('graphics machine integration', () => {
    it('should send updateGeometry to graphicsMachine when geometry is provided', () => {
      render(<ModelViewer artifact={testArtifact} artifactHash={testHash} />);

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'updateArtifact',
          artifact: testArtifact,
          hash: testHash,
        }),
      );
    });

    it('should not send updateGeometry when geometry is absent', () => {
      render(<ModelViewer artifact={undefined} artifactHash={undefined} />);

      expect(mockSend).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'updateArtifact' }));
    });
  });

  // ── External graphicsRef ────────────────────────────────────────────

  describe('external graphicsRef', () => {
    it('should use external graphicsRef instead of creating its own', () => {
      const externalSend = vi.fn();
      const externalRef = { send: externalSend, getSnapshot: () => ({ context: {} }) };

      render(
        <ModelViewer
          artifact={testArtifact}
          artifactHash={testHash}
          graphicsRef={externalRef as unknown as ModelViewerProps['graphicsRef']}
        />,
      );

      expect(externalSend).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'updateArtifact',
          artifact: testArtifact,
          hash: testHash,
        }),
      );
      expect(mockUseActorRef).not.toHaveBeenCalled();
    });

    it('should not create internal graphicsMachine when external graphicsRef is provided', () => {
      const externalRef = { send: vi.fn(), getSnapshot: () => ({ context: {} }) };

      render(
        <ModelViewer
          artifact={undefined}
          artifactHash={undefined}
          graphicsRef={externalRef as unknown as ModelViewerProps['graphicsRef']}
        />,
      );

      expect(mockUseActorRef).not.toHaveBeenCalled();
    });

    it('should create internal graphicsMachine when no external graphicsRef is provided', () => {
      render(<ModelViewer artifact={testArtifact} artifactHash={testHash} />);

      expect(mockUseActorRef).toHaveBeenCalled();
    });

    it('should render CadViewer with external graphicsRef when geometry is provided', () => {
      const externalRef = { send: vi.fn(), getSnapshot: () => ({ context: {} }) };

      render(
        <ModelViewer
          artifact={testArtifact}
          artifactHash={testHash}
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
        <ModelViewer
          artifact={undefined}
          artifactHash={undefined}
          graphicsRef={externalRef as unknown as ModelViewerProps['graphicsRef']}
        />,
      );

      expect(screen.getByTestId('loader')).toBeInTheDocument();
    });

    it('should retain geometry with an external graphicsRef when error is provided', () => {
      const externalRef = { send: vi.fn(), getSnapshot: () => ({ context: {} }) };
      const error = new Error('External error');

      render(
        <ModelViewer
          artifact={testArtifact}
          artifactHash={testHash}
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
    render(<RuntimeStatusOverlay status='evaluating' />);

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByText('evaluating...')).toBeInTheDocument();
  });

  it('should render status overlay when status is rendering', () => {
    render(<RuntimeStatusOverlay status='evaluating' />);

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByText('evaluating...')).toBeInTheDocument();
  });

  it('should render nothing when status is idle', () => {
    const { container } = render(<RuntimeStatusOverlay status='closed' />);

    expect(container.innerHTML).toBe('');
  });

  it('should render nothing when status is ready', () => {
    const { container } = render(<RuntimeStatusOverlay status='ready' />);

    expect(container.innerHTML).toBe('');
  });

  it('should apply custom className to the overlay', () => {
    render(<RuntimeStatusOverlay status='evaluating' className='custom-position' />);

    expect(screen.getByRole('status')).toHaveClass('custom-position');
  });
});
