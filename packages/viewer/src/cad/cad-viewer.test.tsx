import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Artifact } from '@taucad/runtime';
import { CadViewer } from '#cad/cad-viewer.jsx';

const graphics = vi.hoisted(() => ({
  send: vi.fn(),
  context: { webGpuAvailable: false, webGpuProbeSettled: false, gltfPresentation: { requestedRevision: 0 } },
  backend: 'webgpu' as 'webgpu' | 'webgl',
}));

vi.mock('#hooks/use-graphics.jsx', () => ({
  useGraphics: () => ({ send: graphics.send }),
  useGraphicsSelector: (selector: (state: { context: typeof graphics.context }) => unknown) =>
    selector({ context: graphics.context }),
}));

vi.mock('#environment/viewer-environment.jsx', () => ({
  useViewerEnvironment: () => ({ graphicsBackend: graphics.backend }),
}));

vi.mock('#graphics/three/three-context.jsx', () => ({
  ThreeProvider: ({ graphicsBackend }: { readonly graphicsBackend: string }) => (
    <div role='img' aria-label={`Canvas on ${graphicsBackend}`} />
  ),
}));

vi.mock('#graphics/svg/svg-viewer.jsx', () => ({
  SvgViewer: () => <div role='img' aria-label='SVG drawing' />,
}));

vi.mock('#graphics/three/react/gltf-mesh.jsx', () => ({ GltfMesh: () => null }));

const canvasEvents = (): string[] =>
  (graphics.send.mock.calls as Array<[{ type: string }]>).map(([event]) => event.type);

describe('CadViewer capability wait', () => {
  beforeEach(() => {
    graphics.send.mockClear();
    graphics.context = {
      webGpuAvailable: false,
      webGpuProbeSettled: false,
      gltfPresentation: { requestedRevision: 0 },
    };
    graphics.backend = 'webgpu';
  });

  it('should mount no canvas while the WebGPU probe runs, and keep the stage waiting meanwhile', () => {
    const view = render(<CadViewer />);

    expect(screen.queryByRole('img')).toBeNull();
    expect(canvasEvents()).toEqual(['canvasMounted']);

    view.unmount();
    expect(canvasEvents()).toEqual(['canvasMounted', 'canvasUnmounted']);
    const [[mounted], [unmounted]] = graphics.send.mock.calls as [[{ canvasId: string }], [{ canvasId: string }]];
    expect(unmounted.canvasId).toBe(mounted.canvasId);
  });

  it('should mount once, on WebGPU, when the probe finds an adapter', () => {
    graphics.context = { ...graphics.context, webGpuAvailable: true, webGpuProbeSettled: true };
    render(<CadViewer />);

    expect(screen.getByRole('img', { name: 'Canvas on webgpu' })).toBeInTheDocument();
  });

  it('should mount on WebGL when the probe finds no adapter, fails or runs out of time', () => {
    graphics.context = { ...graphics.context, webGpuAvailable: false, webGpuProbeSettled: true };
    render(<CadViewer />);

    expect(screen.getByRole('img', { name: 'Canvas on webgl' })).toBeInTheDocument();
  });

  it('should not wait on the probe when WebGL is preferred', () => {
    graphics.backend = 'webgl';
    render(<CadViewer />);

    expect(screen.getByRole('img', { name: 'Canvas on webgl' })).toBeInTheDocument();
  });

  it('should show an SVG drawing without waiting on the probe', () => {
    const artifact = { mimeType: 'image/svg+xml', content: '<svg />' } as unknown as Artifact;
    render(<CadViewer artifact={artifact} />);

    expect(screen.getByRole('img', { name: 'SVG drawing' })).toBeInTheDocument();
    expect(graphics.send).not.toHaveBeenCalled();
  });
});
