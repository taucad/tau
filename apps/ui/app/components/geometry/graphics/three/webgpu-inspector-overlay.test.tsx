/* eslint-disable @typescript-eslint/naming-convention -- mock `gl` stubs mirror three.js `isWebGPURenderer` spelling */
import { Suspense } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import type { WebGPURenderer } from 'three/webgpu';
import { ThreeGraphicsBackendProvider } from '#components/geometry/graphics/three/three-graphics-backend-context.js';

const inspectorHideSpy = vi.fn();

const hoistedMocks = vi.hoisted(() => {
  class MockInspector {
    public readonly domElement = globalThis.document.createElement('div');

    public hide = (): void => {
      inspectorHideSpy();
    };
  }

  return {
    inspectorConstructorSpy: vi.fn(MockInspector),
    useThreeImplementation: vi.fn(),
  };
});

vi.mock('three/addons/inspector/Inspector.js', () => ({
  Inspector: hoistedMocks.inspectorConstructorSpy,
}));

vi.mock('@react-three/fiber', () => ({
  useThree: hoistedMocks.useThreeImplementation,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('WebGpuInspectorOverlay', () => {
  it('should keep revealed content visible while the inspector loads', async () => {
    hoistedMocks.useThreeImplementation.mockReturnValue({ gl: { isWebGPURenderer: true } });
    const { WebGpuInspectorOverlay } = await import('#components/geometry/graphics/three/webgpu-inspector-overlay.js');
    const workspace = (withInspector: boolean): React.JSX.Element => (
      <Suspense fallback='Loading workspace'>
        <p>Workspace</p>
        {withInspector ? (
          <ThreeGraphicsBackendProvider value='webgpu'>
            <WebGpuInspectorOverlay />
          </ThreeGraphicsBackendProvider>
        ) : null}
      </Suspense>
    );

    const { rerender } = render(workspace(false));
    // The canvas mounts the overlay after the workspace is on screen. R3F hands a suspension inside the canvas to
    // this boundary, and hiding the workspace re-runs its layout effects on reveal, which the workspace Allotment
    // cannot survive.
    rerender(workspace(true));

    expect(screen.getByText('Workspace')).toBeVisible();
    await waitFor(() => {
      expect(hoistedMocks.inspectorConstructorSpy).toHaveBeenCalledTimes(1);
    });
  });
});

describe('three-webgpu-inspector-bootstrap', () => {
  it('attaches Inspector to the shared WebGPURenderer and body, then restores on unmount', async () => {
    const previousInspector: WebGPURenderer['inspector'] = {
      kind: 'prior-mock',
    } as unknown as WebGPURenderer['inspector'];

    const webGpuStub = {
      isWebGPURenderer: true,
      inspector: previousInspector,
    };

    hoistedMocks.useThreeImplementation.mockReturnValue({ gl: webGpuStub });

    const { default: ThreeWebGpuInspectorBootstrap } =
      await import('#components/geometry/graphics/three/three-webgpu-inspector-bootstrap.js');

    const { unmount } = render(<ThreeWebGpuInspectorBootstrap />);

    await waitFor(() => {
      expect(hoistedMocks.inspectorConstructorSpy).toHaveBeenCalledTimes(1);
    });

    const inspectorAttachment = hoistedMocks.inspectorConstructorSpy.mock.results.at(-1)?.value as {
      domElement: HTMLElement;
    };

    await waitFor(() => {
      expect(globalThis.document.body.contains(inspectorAttachment.domElement)).toBe(true);
    });
    expect(webGpuStub.inspector).toBe(inspectorAttachment);

    unmount();

    expect(inspectorHideSpy).toHaveBeenCalled();
    expect(globalThis.document.body.contains(inspectorAttachment.domElement)).toBe(false);

    /** Restores upstream inspector pointer so subsequent viewers do not leak DOM references. */
    expect(webGpuStub.inspector).toBe(previousInspector);
  });

  it('does not construct Inspector when `gl` is not a WebGPU renderer', async () => {
    hoistedMocks.useThreeImplementation.mockReturnValue({
      gl: { isWebGPURenderer: false },
    });

    const { default: ThreeWebGpuInspectorBootstrap } =
      await import('#components/geometry/graphics/three/three-webgpu-inspector-bootstrap.js');

    render(<ThreeWebGpuInspectorBootstrap />);

    expect(hoistedMocks.inspectorConstructorSpy).not.toHaveBeenCalled();
  });
});
