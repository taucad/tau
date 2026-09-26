import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { mock } from 'vitest-mock-extended';
import type { MockProxy } from 'vitest-mock-extended';
import {
  createSectionPlanePicker,
  resolveSectionPlanePickerRect,
} from '#components/geometry/graphics/three/controls/section-plane-picker.js';
import type { SectionPlanePickerRenderer } from '#components/geometry/graphics/three/controls/section-plane-picker.js';

const canvasHeight = 600;

const createRenderer = (isWebGpu: boolean): MockProxy<SectionPlanePickerRenderer> => {
  const renderer = mock<SectionPlanePickerRenderer>({
    autoClear: true,
    domElement: { clientHeight: canvasHeight },
    // eslint-disable-next-line @typescript-eslint/naming-convention -- Three's runtime backend discriminator.
    isWebGPURenderer: isWebGpu,
  });
  renderer.getViewport.mockImplementation((target) => target.set(0, 0, 800, canvasHeight));
  return renderer;
};

/** Looks down −Z, so the XY tile faces the camera at the picker's centre. */
const createTopCamera = (): THREE.PerspectiveCamera => {
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(0, 0, 10);
  camera.lookAt(0, 0, 0);
  return camera;
};

describe('section plane picker', () => {
  it('should sit just left of the view cube, centred on it', () => {
    expect(resolveSectionPlanePickerRect({ left: 704, top: 10, size: 96 })).toEqual({ left: 620, top: 14, size: 88 });
  });

  it.each([
    // A top-right cube, 10 px down: the WebGL viewport's y runs from the bottom, WebGPU's from the top.
    {
      placement: 'a top-right cube on WebGL',
      isWebGpu: false,
      cubeViewport: [704, canvasHeight - 10 - 96, 96, 96],
      rect: { left: 620, top: 14, size: 88 },
      viewportY: 498,
    },
    {
      placement: 'a top-right cube on WebGPU',
      isWebGpu: true,
      cubeViewport: [704, 10, 96, 96],
      rect: { left: 620, top: 14, size: 88 },
      viewportY: 14,
    },
    // A bottom-right cube, on the bottom edge.
    {
      placement: 'a bottom-right cube on WebGL',
      isWebGpu: false,
      cubeViewport: [704, 0, 96, 96],
      rect: { left: 620, top: 508, size: 88 },
      viewportY: 4,
    },
    {
      placement: 'a bottom-right cube on WebGPU',
      isWebGpu: true,
      cubeViewport: [704, canvasHeight - 96, 96, 96],
      rect: { left: 620, top: 508, size: 88 },
      viewportY: 508,
    },
  ] as const)('should follow $placement', ({ isWebGpu, cubeViewport, rect, viewportY }) => {
    const picker = createSectionPlanePicker();
    const renderer = createRenderer(isWebGpu);

    picker.render({ renderer, camera: createTopCamera(), cubeViewport });

    expect(picker.rect).toEqual(rect);
    expect(renderer.setViewport.mock.calls[0]).toEqual([620, viewportY, 88, 88]);
    // The full-canvas viewport and the renderer's clearing come back.
    expect(renderer.setViewport.mock.calls.at(-1)).toEqual([0, 0, 800, canvasHeight]);
    expect(renderer.autoClear).toBe(true);
    expect(renderer.render).toHaveBeenCalledOnce();
  });

  it('should pick the tile under a point in its square, and nothing outside it', () => {
    const picker = createSectionPlanePicker();
    picker.render({ renderer: createRenderer(false), camera: createTopCamera(), cubeViewport: [704, 494, 96, 96] });

    expect(picker.pick(620 + 44, 14 + 44)).toBe('xy');
    expect(picker.pick(600, 14 + 44)).toBeUndefined();
  });

  it('should stand the current plane forward and the others back until hovered', () => {
    const picker = createSectionPlanePicker();
    const renderer = createRenderer(false);
    picker.render({ renderer, camera: createTopCamera(), cubeViewport: [704, 494, 96, 96] });
    const scene = renderer.render.mock.calls[0]?.[0];
    /** The tiles' scales, XY, XZ and YZ. */
    const scales = (): number[] => {
      const values: number[] = [];
      scene?.traverse((object) => {
        if (object instanceof THREE.Mesh && object.material instanceof THREE.MeshMatcapMaterial) {
          values.push(object.scale.x);
        }
      });
      return values;
    };

    picker.paint({ current: 'xy' });
    expect(scales()).toEqual([1.04, 0.92, 0.92]);

    picker.paint({ current: 'xy', hovered: 'xz', active: 'yz' });
    expect(scales()).toEqual([1.04, 1.1, 0.96]);
  });

  it('should set every tile back and fade the tiles and labels while dimmed, hovered or not', () => {
    const picker = createSectionPlanePicker();
    /** Each tile's scale and opacity, XY, XZ and YZ, and the labels' opacity. */
    const look = (): Readonly<{ scales: number[]; opacities: number[]; labelOpacities: number[] }> => {
      const scales: number[] = [];
      const opacities: number[] = [];
      const labelOpacities: number[] = [];
      picker.scene.traverse((object) => {
        if (object instanceof THREE.Mesh && object.material instanceof THREE.MeshMatcapMaterial) {
          scales.push(object.scale.x);
          opacities.push(object.material.opacity);
        } else if (object instanceof THREE.Mesh && object.material instanceof THREE.MeshBasicMaterial) {
          labelOpacities.push(object.material.opacity);
        }
      });
      return { scales, opacities, labelOpacities };
    };

    picker.paint({ current: undefined, hovered: 'xz', isDimmed: true });
    expect(look()).toEqual({ scales: [0.92, 0.92, 0.92], opacities: [0.4, 0.4, 0.4], labelOpacities: [0.4, 0.4, 0.4] });

    picker.paint({ current: undefined, hovered: 'xz' });
    expect(look()).toEqual({ scales: [0.92, 1.1, 0.92], opacities: [0.9, 1, 0.9], labelOpacities: [1, 1, 1] });
  });
});
