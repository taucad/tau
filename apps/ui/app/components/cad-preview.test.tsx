import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CadPreviewViewer } from '#components/cad-preview.js';
import type { CadPreviewStatus } from '#hooks/use-cad-preview.js';

const cadPreviewMocks = vi.hoisted(() => ({
  artifact: undefined as { mimeType: 'model/gltf-binary'; content: Uint8Array<ArrayBuffer> } | undefined,
  artifactHash: undefined as string | undefined,
  status: 'idle' as CadPreviewStatus,
  error: undefined as Error | undefined,
  graphicsRef: {
    send: vi.fn(),
    getSnapshot: () => ({
      context: {
        enableAxes: true,
        enableGizmo: true,
        enableGrid: true,
        enableLines: true,
        enableMatcap: true,
        enableSurfaces: true,
      },
    }),
    subscribe: vi.fn(() => ({ unsubscribe: vi.fn() })),
  },
}));

vi.mock('#hooks/use-cad-preview.js', () => ({
  useCadPreview: () => ({
    artifact: cadPreviewMocks.artifact,
    artifactHash: cadPreviewMocks.artifactHash,
    graphicsRef: cadPreviewMocks.graphicsRef,
    status: cadPreviewMocks.status,
    error: cadPreviewMocks.error,
    cadRef: {},
    defaultParameters: {},
    jsonSchema: undefined,
    setParameters: vi.fn(),
  }),
}));

vi.mock('#components/geometry/cad/cad-viewer.js', () => ({
  CadViewer: () => <div data-testid='cad-viewer' />,
}));

vi.mock('#hooks/use-graphics.js', () => ({
  GraphicsProvider: ({ children }: { readonly children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('#components/ui/loader.js', () => ({
  Loader: () => <div data-testid='loader' />,
}));

describe('CadPreviewViewer', () => {
  beforeEach(() => {
    cadPreviewMocks.artifact = undefined;
    cadPreviewMocks.artifactHash = undefined;
    cadPreviewMocks.status = 'idle';
    cadPreviewMocks.error = undefined;
  });

  it('should show loading while render has not settled and no artifact yet', () => {
    cadPreviewMocks.artifact = undefined;
    cadPreviewMocks.status = 'loading';

    render(<CadPreviewViewer className='size-full' />);

    expect(screen.getByTestId('loader')).toBeInTheDocument();
    expect(screen.queryByTestId('cad-viewer')).not.toBeInTheDocument();
  });

  it('should keep the last model visible while a re-render is in progress', () => {
    cadPreviewMocks.artifact = { mimeType: 'model/gltf-binary', content: new Uint8Array([1, 2, 3]) };
    cadPreviewMocks.artifactHash = 'stale';
    cadPreviewMocks.status = 'loading';

    render(<CadPreviewViewer className='size-full' />);

    expect(screen.getByTestId('cad-viewer')).toBeInTheDocument();
    expect(screen.queryByTestId('loader')).not.toBeInTheDocument();
  });

  it('should keep the last model visible with the exact failed-rerender message', () => {
    cadPreviewMocks.artifact = { mimeType: 'model/gltf-binary', content: new Uint8Array([1, 2, 3]) };
    cadPreviewMocks.artifactHash = 'stale';
    cadPreviewMocks.status = 'ready';
    cadPreviewMocks.error = new Error('preview rerender sentinel');

    render(<CadPreviewViewer className='size-full' />);

    expect(screen.getByTestId('cad-viewer')).toBeInTheDocument();
    expect(screen.getByRole('alert', { name: 'CAD runtime error' })).toHaveTextContent('preview rerender sentinel');
  });

  it('should not hand an artifact over its byte cap to the viewer', () => {
    cadPreviewMocks.artifact = { mimeType: 'model/gltf-binary', content: new Uint8Array(4) };
    cadPreviewMocks.artifactHash = 'large';
    cadPreviewMocks.status = 'ready';

    const view = render(<CadPreviewViewer className='size-full' maxArtifactBytes={3} />);

    expect(screen.getByRole('status')).toHaveTextContent('Too large to preview. Open the project to view it.');
    expect(screen.queryByTestId('cad-viewer')).not.toBeInTheDocument();

    view.rerender(<CadPreviewViewer className='size-full' maxArtifactBytes={4} />);

    expect(screen.getByTestId('cad-viewer')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
