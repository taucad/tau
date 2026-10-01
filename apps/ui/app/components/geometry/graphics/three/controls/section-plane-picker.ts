import * as THREE from 'three';
import type { ResolvedGraphicsBackend } from '#constants/editor.constants.js';
import { sectionPlaneAxes } from '#components/geometry/graphics/section-cuts.js';
import type { SectionPlane } from '#components/geometry/graphics/section-cuts.js';
import {
  createGripMaterial,
  createHandlePainter,
  sectionAxisColors,
} from '#components/geometry/graphics/three/controls/section-handles.js';
import type { SectionHandleState } from '#components/geometry/graphics/three/controls/section-handles.js';
import {
  createSelectorLabelGeometry,
  getSelectorLabelAtlasTexture,
} from '#components/geometry/graphics/three/controls/selector-label-atlas.js';
import { createViewportControlLabelMaterial } from '#components/geometry/graphics/three/materials/viewport-control-material.js';
import { viewportRenderTiers } from '#components/geometry/graphics/three/utils/render-order.utils.js';
import { setRaycasterFromCamera } from '#components/geometry/graphics/three/utils/raycaster-from-camera.js';

/*
 * The section plane picker: three bevelled tiles on the faces of a small exploded cube, each parallel to the plane
 * it makes. It is not in the model's space: it draws in its own square just left of the view cube, turning with the
 * camera, so it is on screen however the model is framed.
 */

/** A square in CSS pixels from the canvas's top-left. */
export type SectionPlanePickerRect = Readonly<{ left: number; top: number; size: number }>;

/**
 * The picker's square beside the view cube's: 11/12 of its size, reaching a 24th into the cube's square, whose
 * cube is drawn inset, and centred on it vertically.
 */
export const resolveSectionPlanePickerRect = (cube: SectionPlanePickerRect): SectionPlanePickerRect => {
  const size = Math.round((cube.size * 11) / 12);
  return { left: cube.left + cube.size / 24 - size, top: cube.top + (cube.size - size) / 2, size };
};

/** The renderer the picker draws with: WebGL's, or WebGPU's, whose viewport `y` runs from the top. */
export type SectionPlanePickerRenderer = Pick<
  THREE.WebGLRenderer,
  'autoClear' | 'clearDepth' | 'getViewport' | 'render' | 'setViewport'
> &
  Readonly<{ domElement: Readonly<{ clientHeight: number }>; isWebGPURenderer?: boolean }>;

export type SectionPlanePicker = Readonly<{
  /** What it draws and the camera it draws with, for a renderer's `compileAsync`. */
  scene: THREE.Scene;
  camera: THREE.Camera;
  /** The square it last drew in; undefined before its first draw. */
  readonly rect: SectionPlanePickerRect | undefined;
  /**
   * Turns with `camera` and draws into the square beside the view cube, whose viewport `[x, y, width, height]` is
   * in the renderer's own convention.
   */
  render: (
    options: Readonly<{
      renderer: SectionPlanePickerRenderer;
      camera: THREE.Camera;
      cubeViewport: readonly [number, number, number, number];
    }>,
  ) => void;
  /** The plane of the tile under a canvas point (CSS pixels from its top-left), as last drawn. */
  pick: (x: number, y: number) => SectionPlane | undefined;
  /**
   * `current` is the selected plane cut's plane, which stands forward; the others sit back until hovered. A dimmed
   * picker, whose tiles can do nothing, sits back and faint.
   */
  paint: (
    states: Readonly<{
      current: SectionPlane | undefined;
      hovered?: SectionPlane;
      active?: SectionPlane;
      isDimmed?: boolean;
    }>,
  ) => void;
  dispose: () => void;
}>;

const roundedSquare = (size: number, radius: number): THREE.Shape => {
  const half = size / 2;
  const shape = new THREE.Shape();
  shape.moveTo(-half + radius, -half);
  shape.lineTo(half - radius, -half);
  shape.quadraticCurveTo(half, -half, half, -half + radius);
  shape.lineTo(half, half - radius);
  shape.quadraticCurveTo(half, half, half - radius, half);
  shape.lineTo(-half + radius, half);
  shape.quadraticCurveTo(-half, half, -half, half - radius);
  shape.lineTo(-half, -half + radius);
  shape.quadraticCurveTo(-half, -half, -half + radius, -half);
  return shape;
};

let tileGeometry: THREE.BufferGeometry | undefined;

/** The tile, shared by every picker: created once, never disposed. */
const getTileGeometry = (): THREE.BufferGeometry => {
  tileGeometry ??= new THREE.ExtrudeGeometry(roundedSquare(0.9, 0.22), {
    depth: 0.05,
    bevelEnabled: true,
    bevelThickness: 0.035,
    bevelSize: 0.035,
    bevelSegments: 3,
    curveSegments: 6,
  }).translate(0, 0, -0.025);
  return tileGeometry;
};

const x = new THREE.Vector3(1, 0, 0);
const y = new THREE.Vector3(0, 1, 0);
const z = new THREE.Vector3(0, 0, 1);
const axisVectors = { x, y, z } as const;

/** Each tile's in-plane axes and normal. */
const tileBases: Readonly<Record<SectionPlane, readonly [THREE.Vector3, THREE.Vector3, THREE.Vector3]>> = {
  xy: [x, y, z],
  xz: [x, z, new THREE.Vector3(0, -1, 0)],
  yz: [y, z, x],
};

const planes = ['xy', 'xz', 'yz'] as const;
const labels = { xy: 'XY', xz: 'XZ', yz: 'YZ' } as const;

/** The tiles' distance from the centre, and their labels' just in front. */
const tileDistance = 0.56;
const labelDistance = tileDistance + 0.06;

/** Builds the picker once; the plane in use and the pointer only repaint it. */
export const createSectionPlanePicker = (backend: ResolvedGraphicsBackend = 'webgl'): SectionPlanePicker => {
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1.05, 1.05, 1.05, -1.05, 0.1, 20);
  const labelMaterial = createViewportControlLabelMaterial({ map: getSelectorLabelAtlasTexture() });
  const tiles = planes.map((plane) => {
    const axis = sectionPlaneAxes[plane];
    const color = sectionAxisColors[axis];
    const material = createGripMaterial(color, backend);
    const tile = new THREE.Group();
    tile.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(...tileBases[plane]));
    const face = new THREE.Mesh(getTileGeometry(), material);
    face.renderOrder = viewportRenderTiers.sectionControlBody;
    tile.add(face);
    const label = new THREE.Mesh(createSelectorLabelGeometry(labels[plane]), labelMaterial);
    label.scale.setScalar(0.8);
    label.renderOrder = viewportRenderTiers.sectionControlLabel;
    scene.add(tile, label);
    const base = new THREE.Color(color);
    // The plane in use stands full and forward; the others sit back a step, lighter, until hovered.
    const paintAs = (isCurrent: boolean): ((state: SectionHandleState) => void) =>
      createHandlePainter({
        paints: [
          {
            material,
            base,
            opacity: isCurrent ? { static: 1, hover: 1, active: 1 } : { static: 0.9, hover: 1, active: 1 },
            tint: isCurrent ? { static: 0, hover: 0.12, active: 0 } : { static: 0.2, hover: 0.08, active: 0 },
          },
        ],
        scaled: face,
        scale: { static: isCurrent ? 1.04 : 0.92, hover: 1.1, active: 0.96 },
      });
    // Dimmed, every tile sits back and faint, and takes no hover.
    const paintDimmed = createHandlePainter({
      paints: [{ material, base, opacity: { static: 0.4, hover: 0.4, active: 0.4 }, tint: { static: 0.3 } }],
      scaled: face,
      scale: { static: 0.92, hover: 0.92, active: 0.92 },
    });
    return {
      plane,
      axis,
      tile,
      face,
      label,
      material,
      paintCurrent: paintAs(true),
      paintOther: paintAs(false),
      paintDimmed,
    };
  });
  const faces = tiles.map((tile) => tile.face);
  const cameraQuaternion = new THREE.Quaternion();
  const viewport = new THREE.Vector4();
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let rect: SectionPlanePickerRect | undefined;

  /** Turns the picker with the view, each tile on the side of its axis that faces the camera. */
  const align = (view: THREE.Camera): void => {
    view.getWorldQuaternion(cameraQuaternion);
    camera.quaternion.copy(cameraQuaternion);
    camera.position.set(0, 0, 6).applyQuaternion(cameraQuaternion);
    camera.updateMatrixWorld();
    for (const { axis, tile, label } of tiles) {
      const side = camera.position[axis] < 0 ? -1 : 1;
      tile.position.copy(axisVectors[axis]).multiplyScalar(tileDistance * side);
      label.position.copy(axisVectors[axis]).multiplyScalar(labelDistance * side);
      label.quaternion.copy(cameraQuaternion);
    }
    scene.updateMatrixWorld(true);
  };

  const picker: SectionPlanePicker = {
    scene,
    camera,
    get rect() {
      return rect;
    },
    render({ renderer, camera: view, cubeViewport: [cubeX, cubeY, cubeWidth, cubeHeight] }) {
      const isTopDown = renderer.isWebGPURenderer === true;
      const canvasHeight = renderer.domElement.clientHeight;
      const next = resolveSectionPlanePickerRect({
        left: cubeX,
        top: isTopDown ? cubeY : canvasHeight - cubeY - cubeHeight,
        size: Math.min(cubeWidth, cubeHeight),
      });
      rect = next;
      align(view);
      renderer.getViewport(viewport);
      const previousAutoClear = renderer.autoClear;
      renderer.autoClear = false;
      try {
        renderer.clearDepth();
        renderer.setViewport(
          next.left,
          isTopDown ? next.top : canvasHeight - next.top - next.size,
          next.size,
          next.size,
        );
        renderer.render(scene, camera);
      } finally {
        renderer.setViewport(viewport.x, viewport.y, viewport.z, viewport.w);
        renderer.autoClear = previousAutoClear;
      }
    },
    pick(pointerX, pointerY) {
      if (
        !rect ||
        pointerX < rect.left ||
        pointerX > rect.left + rect.size ||
        pointerY < rect.top ||
        pointerY > rect.top + rect.size
      ) {
        return undefined;
      }
      pointer.set(((pointerX - rect.left) / rect.size) * 2 - 1, -((pointerY - rect.top) / rect.size) * 2 + 1);
      setRaycasterFromCamera(raycaster, pointer, camera);
      const hit = raycaster.intersectObjects(faces, false)[0];
      return tiles.find((tile) => tile.face === hit?.object)?.plane;
    },
    paint({ current, hovered, active, isDimmed = false }) {
      labelMaterial.opacity = isDimmed ? 0.4 : 1;
      for (const { plane, paintCurrent, paintOther, paintDimmed } of tiles) {
        if (isDimmed) {
          paintDimmed('static');
        } else {
          (plane === current ? paintCurrent : paintOther)(
            plane === active ? 'active' : plane === hovered ? 'hover' : 'static',
          );
        }
      }
    },
    dispose() {
      labelMaterial.dispose();
      for (const { label, material } of tiles) {
        label.geometry.dispose();
        material.dispose();
      }
    },
  };
  picker.paint({ current: undefined });
  return picker;
};
