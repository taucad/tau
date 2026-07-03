import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CadPreviewViewer } from '#components/cad-preview.js';
import type { CadPreviewStatus } from '#hooks/use-cad-preview.js';

const cadPreviewMocks = vi.hoisted(() => ({
  geometry: undefined as { format: 'gltf'; content: Uint8Array<ArrayBuffer>; hash: string } | undefined,
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
    geometry: cadPreviewMocks.geometry,
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
    cadPreviewMocks.geometry = undefined;
    cadPreviewMocks.status = 'loading';

    render(<CadPreviewViewer className='size-full' />);

    expect(screen.getByTestId('loader')).toBeInTheDocument();
    expect(screen.queryByTestId('cad-viewer')).not.toBeInTheDocument();
  });

  it('should keep the last model visible while a re-render is in progress', () => {
    cadPreviewMocks.geometry = { format: 'gltf', content: new Uint8Array([1, 2, 3]), hash: 'stale' };
    cadPreviewMocks.status = 'loading';

    render(<CadPreviewViewer className='size-full' />);

    expect(screen.getByTestId('cad-viewer')).toBeInTheDocument();
    expect(screen.queryByTestId('loader')).not.toBeInTheDocument();
  });
});
