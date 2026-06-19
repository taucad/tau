import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CadPreviewViewer } from '#components/cad-preview.js';
import { emptyGeometryMessage } from '#components/model-viewer.js';
import type { CadPreviewStatus } from '#hooks/use-cad-preview.js';

const cadPreviewMocks = vi.hoisted(() => ({
  geometries: [] as Array<{ format: 'gltf'; content: Uint8Array<ArrayBuffer>; hash: string }>,
  status: 'idle' as CadPreviewStatus,
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
    geometries: cadPreviewMocks.geometries,
    graphicsRef: cadPreviewMocks.graphicsRef,
    status: cadPreviewMocks.status,
    error: undefined,
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
  it('should show loading while render has not settled and no geometry yet', () => {
    cadPreviewMocks.geometries = [];
    cadPreviewMocks.status = 'loading';

    render(<CadPreviewViewer className='size-full' />);

    expect(screen.getByTestId('loader')).toBeInTheDocument();
    expect(screen.queryByText(emptyGeometryMessage)).not.toBeInTheDocument();
    expect(screen.queryByTestId('cad-viewer')).not.toBeInTheDocument();
  });

  it('should keep the last model visible while a re-render is in progress', () => {
    cadPreviewMocks.geometries = [{ format: 'gltf', content: new Uint8Array([1, 2, 3]), hash: 'stale' }];
    cadPreviewMocks.status = 'loading';

    render(<CadPreviewViewer className='size-full' />);

    expect(screen.getByTestId('cad-viewer')).toBeInTheDocument();
    expect(screen.queryByTestId('loader')).not.toBeInTheDocument();
  });

  it('should show empty-geometry hint when preview status is empty', () => {
    cadPreviewMocks.geometries = [];
    cadPreviewMocks.status = 'empty';

    render(<CadPreviewViewer className='size-full' />);

    expect(screen.queryByTestId('loader')).not.toBeInTheDocument();
    expect(screen.getByText(emptyGeometryMessage)).toBeInTheDocument();
  });
});
