/* eslint-disable @typescript-eslint/naming-convention -- mock `gl` stubs mirror three.js `isWebGPURenderer` spelling */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';
import type { WebGPURenderer } from 'three/webgpu';

const inspectorHideSpy = vi.fn();

const hoistedMocks = vi.hoisted(() => {
  class MockInspector {
    public readonly domElement = globalThis.document.createElement('div');

    /* oxlint-disable @typescript-eslint/naming-convention -- mock parity with three.js Inspector */
    public hide = (): void => {
      inspectorHideSpy();
    };
    /* oxlint-enable @typescript-eslint/naming-convention */
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

describe('three-webgpu-inspector-bootstrap', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

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
