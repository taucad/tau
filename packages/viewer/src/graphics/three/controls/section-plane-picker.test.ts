import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { mock } from 'vitest-mock-extended';
import type { MockProxy } from 'vitest-mock-extended';
import {
  createSectionPlanePicker,
  resolveSectionPlanePickerRect,
  resolveSectionPlaneTileBasis,
} from '#graphics/three/controls/section-plane-picker.js';
import type {
  SectionPlanePicker,
  SectionPlanePickerRenderer,
  SectionPlanePickerStyle,
} from '#graphics/three/controls/section-plane-picker.js';

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

/* oxlint-disable tau-lint/no-hardcoded-color -- distinct fixture tints, so each state's colour is identifiable */
const style: SectionPlanePickerStyle = {
  face: 0xdd_dd_dd,
  label: 0x22_22_22,
  font: 'sans-serif',
  planeTiles: {
    x: { edge: 0xe0_80_80, strong: 0xf0_50_50, deep: 0xa0_30_30 },
    y: { edge: 0x80_c0_80, strong: 0x50_d0_50, deep: 0x30_90_30 },
    z: { edge: 0x80_a0_e0, strong: 0x50_80_f0, deep: 0x30_50_a0 },
  },
};
/* oxlint-enable tau-lint/no-hardcoded-color */

const createStyledPicker = (): SectionPlanePicker => {
  const picker = createSectionPlanePicker();
  picker.setStyle(style);
  return picker;
};

/** Looks down −Z, so the XY tile faces the camera at the picker's centre. */
const createTopCamera = (): THREE.PerspectiveCamera => {
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(0, 0, 10);
  camera.lookAt(0, 0, 0);
  return camera;
};

describe('section plane picker', () => {
  it('should guard the observer shortcut bypassed by the moving picker tiles', () => {
    expect(THREE.REVISION).toBe('184');
    const require = createRequire(import.meta.url);
    const source = readFileSync(require.resolve('three/src/materials/nodes/manager/NodeMaterialObserver.js'));
    expect(createHash('sha256').update(source).digest('hex')).toBe(
      '44e67b66854b65a96dfafe03f5b0ebd8100ede28c56a28853b974fef28089b83',
    );
  });

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
    const picker = createStyledPicker();
    const renderer = createRenderer(isWebGpu);

    picker.render({ renderer, camera: createTopCamera(), cubeViewport });

    expect(picker.rect).toEqual(rect);
    expect(renderer.setViewport.mock.calls[0]).toEqual([620, viewportY, 88, 88]);
    // The full-canvas viewport and the renderer's clearing come back.
    expect(renderer.setViewport.mock.calls.at(-1)).toEqual([0, 0, 800, canvasHeight]);
    expect(renderer.autoClear).toBe(true);
    expect(renderer.render).toHaveBeenCalledOnce();
  });

  it('should draw in the linear target viewport at DPR two and restore it after failure', () => {
    const renderer = createRenderer(true);
    const target = new THREE.WebGLRenderTarget(1600, 1200);
    const viewport = target.viewport.clone();
    const scissor = target.scissor.clone();
    renderer.getRenderTarget.mockReturnValue(target);
    renderer.getPixelRatio.mockReturnValue(2);
    const picker = createSectionPlanePicker('webgpu');
    picker.setStyle(style);
    renderer.render.mockImplementation(() => {
      expect(target.viewport.toArray()).toEqual([1240, 12, 176, 176]);
      expect(target.scissor.toArray()).toEqual(target.viewport.toArray());
      throw new Error('picker draw failed');
    });
    try {
      expect(() => {
        picker.render({
          renderer,
          camera: new THREE.PerspectiveCamera(),
          cubeViewport: [704, 2, 96, 96],
        });
      }).toThrow('picker draw failed');
      expect(target.viewport.equals(viewport)).toBe(true);
      expect(target.scissor.equals(scissor)).toBe(true);
      expect(renderer.autoClear).toBe(true);
    } finally {
      picker.dispose();
      target.dispose();
    }
  });

  it('should pick the tile under a point in its square, and nothing outside it', () => {
    const picker = createStyledPicker();
    picker.render({
      renderer: createRenderer(false),
      camera: createTopCamera(),
      cubeViewport: [704, 494, 96, 96],
    });

    expect(picker.pick(620 + 44, 14 + 44)).toBe('xy');
    expect(picker.pick(600, 14 + 44)).toBeUndefined();
  });

  it('should pick the tile under a point once a WebGPU renderer has drawn it with reversed depth', () => {
    const renderer = createRenderer(true);
    // Mirrors the WebGPU renderer, which puts its coordinate system and reversed depth on the camera it draws with.
    renderer.render.mockImplementation((_scene, camera) => {
      if (camera instanceof THREE.OrthographicCamera) {
        camera.coordinateSystem = THREE.WebGPUCoordinateSystem;
        Object.assign(camera, { _reversedDepth: true });
        camera.updateProjectionMatrix();
      }
    });
    const picker = createStyledPicker();
    picker.render({
      renderer,
      camera: createTopCamera(),
      cubeViewport: [704, canvasHeight - 96, 96, 96],
    });

    expect(picker.camera).toHaveProperty('reversedDepth', true);
    expect(picker.pick(620 + 44, 508 + 44)).toBe('xy');
  });

  it('should draw nothing until the view cube has styled it', () => {
    const picker = createSectionPlanePicker();
    const renderer = createRenderer(false);

    picker.render({
      renderer,
      camera: createTopCamera(),
      cubeViewport: [704, 494, 96, 96],
    });

    expect(renderer.render).not.toHaveBeenCalled();
    expect(picker.rect).toBeUndefined();
  });

  it.each([
    // The camera on each side of each axis; the tile faces it, printed right-way round from there.
    {
      plane: 'xy',
      side: 1,
      right: [1, 0, 0],
      up: [0, 1, 0],
      normal: [0, 0, 1],
    },
    {
      plane: 'xy',
      side: -1,
      right: [1, 0, 0],
      up: [0, -1, 0],
      normal: [0, 0, -1],
    },
    {
      plane: 'xz',
      side: -1,
      right: [1, 0, 0],
      up: [0, 0, 1],
      normal: [0, -1, 0],
    },
    {
      plane: 'xz',
      side: 1,
      right: [-1, 0, 0],
      up: [0, 0, 1],
      normal: [0, 1, 0],
    },
    {
      plane: 'yz',
      side: 1,
      right: [0, 1, 0],
      up: [0, 0, 1],
      normal: [1, 0, 0],
    },
    {
      plane: 'yz',
      side: -1,
      right: [0, -1, 0],
      up: [0, 0, 1],
      normal: [-1, 0, 0],
    },
  ] as const)('should print the $plane tile outward and unmirrored on side $side', ({ plane, side, ...expected }) => {
    const [right, up, normal] = resolveSectionPlaneTileBasis(plane, side);

    // `+ 0` folds negated zeros, which `toEqual` tells apart.
    const plain = (vector: THREE.Vector3): number[] => vector.toArray().map((value) => value + 0);
    expect({
      right: plain(right),
      up: plain(up),
      normal: plain(normal),
    }).toEqual({
      right: [...expected.right],
      up: [...expected.up],
      normal: [...expected.normal],
    });
    // Right-handed, so the label reads as printed rather than mirrored.
    expect(right.clone().cross(up).dot(normal)).toBe(1);
  });

  it('should turn each tile to the side of its axis that faces the camera', () => {
    const picker = createStyledPicker();
    const camera = new THREE.PerspectiveCamera();
    camera.up.set(0, 0, 1);
    camera.position.set(-4, -6, 5);
    camera.lookAt(0, 0, 0);
    picker.render({
      renderer: createRenderer(false),
      camera,
      cubeViewport: [704, 494, 96, 96],
    });

    const normals = Object.fromEntries(
      ['xy', 'xz', 'yz'].map((plane) => {
        const tile = picker.scene.getObjectByName(`section-plane-tile:${plane}`);
        return [
          plane,
          new THREE.Vector3(0, 0, 1)
            .applyQuaternion(tile?.quaternion ?? new THREE.Quaternion())
            .round()
            .toArray()
            .map((value) => value + 0),
        ];
      }),
    );
    expect(normals).toEqual({ xy: [0, 0, 1], xz: [0, -1, 0], yz: [-1, 0, 0] });
  });

  /** Each tile's scale, band, face and label opacity, XY, XZ and YZ. */
  const look = (picker: SectionPlanePicker): ReadonlyArray<Readonly<Record<string, number>>> =>
    ['xy', 'xz', 'yz'].map((plane) => {
      const tile = picker.scene.getObjectByName(`section-plane-tile:${plane}`);
      const [band, face, label] = (tile?.children ?? []) as Array<
        THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>
      >;
      return {
        scale: tile?.scale.x ?? Number.NaN,
        band: band?.material.color.getHex() ?? Number.NaN,
        face: face?.material.color.getHex() ?? Number.NaN,
        opacity: label?.material.opacity ?? Number.NaN,
      };
    });

  it('should edge every tile in its axis colour, fill the current one and wash a hovered one', () => {
    const picker = createStyledPicker();

    picker.paint({ current: undefined });
    expect(look(picker)).toEqual([
      { scale: 0.94, band: 0x80_a0_e0, face: 0xdd_dd_dd, opacity: 1 },
      { scale: 0.94, band: 0x80_c0_80, face: 0xdd_dd_dd, opacity: 1 },
      { scale: 0.94, band: 0xe0_80_80, face: 0xdd_dd_dd, opacity: 1 },
    ]);

    picker.paint({ current: 'xy', hovered: 'xz', active: 'yz' });
    const [current, hovered, pressed] = look(picker);
    expect(current).toEqual({
      scale: 1,
      band: 0x50_80_f0,
      face: 0x80_a0_e0,
      opacity: 1,
    });
    expect(hovered).toMatchObject({ scale: 1.08, band: 0x50_d0_50 });
    // Washed part-way from the face tone toward the axis colour.
    expect(hovered?.['face']).not.toBe(0xdd_dd_dd);
    expect(hovered?.['face']).not.toBe(0x80_c0_80);
    expect(pressed).toMatchObject({ scale: 0.96, band: 0xf0_50_50 });
  });

  it('should deepen the current tile while it is hovered, so hover always shows', () => {
    const picker = createStyledPicker();

    picker.paint({ current: 'xz', hovered: 'xz' });

    expect(look(picker)[1]).toEqual({
      scale: 1.08,
      band: 0x30_90_30,
      face: 0x50_d0_50,
      opacity: 1,
    });
  });

  it('should set every tile back and fade it while dimmed, hovered or not', () => {
    const picker = createStyledPicker();

    picker.paint({ current: 'xy', hovered: 'xz', isDimmed: true });
    expect(look(picker)).toEqual([
      { scale: 0.94, band: 0x80_a0_e0, face: 0xdd_dd_dd, opacity: 0.4 },
      { scale: 0.94, band: 0x80_c0_80, face: 0xdd_dd_dd, opacity: 0.4 },
      { scale: 0.94, band: 0xe0_80_80, face: 0xdd_dd_dd, opacity: 0.4 },
    ]);
  });

  it('should keep its state when the view cube restyles it', () => {
    const picker = createStyledPicker();
    picker.paint({ current: 'yz' });

    picker.setStyle({
      ...style,
      planeTiles: {
        ...style.planeTiles,
        x: { edge: 0x11_11_11, strong: 0x22_22_22, deep: 0x33_33_33 },
      },
    });

    expect(look(picker)[2]).toEqual({
      scale: 1,
      band: 0x22_22_22,
      face: 0x11_11_11,
      opacity: 1,
    });
  });
});
