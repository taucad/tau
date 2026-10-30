import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CadPreviewViewer } from '#components/cad-preview.js';
import type { CadPreviewStatus } from '#hooks/use-cad-preview.js';

// React's dev build only records component performance tracks when `console.timeStamp`
// exists as it loads, and Vitest's console lacks it. Define it before react-dom loads.
vi.hoisted(() => {
  // oxlint-disable-next-line @typescript-eslint/no-unnecessary-condition -- absent from Vitest's console despite the DOM lib type.
  console.timeStamp ??= () => undefined;
});

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

vi.mock('@taucad/viewer/cad/cad-viewer', () => ({
  CadViewer: () => <div data-testid='cad-viewer' />,
}));

vi.mock('@taucad/viewer/hooks/use-graphics', () => ({
  GraphicsProvider: ({ children }: { readonly children: React.ReactNode }) => <div>{children}</div>,
  useModelInteractionRef: () => ({ current: undefined }),
}));

vi.mock('@taucad/ui/components/loader', () => ({
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

  // React's dev build diffs changed props into `performance.measure` entries for its
  // component performance tracks. React 19.2 enumerated a typed array one row per
  // element, so every new GLB artifact logged a property row per byte.
  it('should log a binary artifact prop to the dev performance track as one row', () => {
    type MeasureOptions = { detail?: { devtools?: { properties?: Array<[string, string]> } } };
    const loggedProperties: Array<Array<[string, string]>> = [];
    const measure = vi
      .spyOn(performance, 'measure')
      .mockImplementation((_name: string, options?: MeasureOptions | string) => {
        if (typeof options === 'object' && options.detail?.devtools?.properties) {
          loggedProperties.push(options.detail.devtools.properties);
        }

        return undefined as unknown as PerformanceMeasure;
      });

    try {
      const view = render(<CadPreviewViewer className='size-full' />);
      cadPreviewMocks.artifact = { mimeType: 'model/gltf-binary', content: new Uint8Array(50_000) };
      cadPreviewMocks.artifactHash = 'large-glb';
      cadPreviewMocks.status = 'ready';
      // The mocked hook is not reactive, so change a prop to get past the memo boundary.
      view.rerender(<CadPreviewViewer enableZoom className='size-full' />);
    } finally {
      measure.mockRestore();
    }

    // Guard against a vacuous pass: the dev perf track must have diffed the artifact.
    const artifactDiffs = loggedProperties.filter((properties) =>
      properties.some(([key]) => key.trim().endsWith('content')),
    );
    expect(artifactDiffs.length).toBeGreaterThan(0);
    expect(Math.max(...artifactDiffs.map((properties) => properties.length))).toBeLessThan(100);
  });
});
