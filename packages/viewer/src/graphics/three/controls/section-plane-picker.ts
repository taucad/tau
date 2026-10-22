import * as THREE from 'three';
import { sectionPlaneAxes } from '#graphics/section-cuts.js';
import type { SectionAxis, SectionPlane } from '#graphics/section-cuts.js';
import type { ViewportGizmoStyle } from '#graphics/three/controls/viewport-gizmo-cube-style.js';
import { viewportRenderTiers } from '#graphics/three/utils/render-order.utils.js';
import { setRaycasterFromCamera } from '#graphics/three/utils/raycaster-from-camera.js';

/*
 * The section plane picker: three tiles on the faces of a small exploded cube, each parallel to the plane it makes.
 * It is not in the model's space: it draws in its own square just left of the view cube, turning with the camera, so
 * it is on screen however the model is framed.
 *
 * The tiles are pieces of the view cube: its flat, unlit face tone, a label printed on the face in its font, lying in
 * the tile and foreshortening with it. Each tile's band always carries the muted colour of its plane's normal axis;
 * hovering washes the face with that colour and selecting fills it.
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

/** What the picker takes from the view cube's style: its face tone, label colour and font, and the axis tints. */
export type SectionPlanePickerStyle = Pick<ViewportGizmoStyle, 'face' | 'label' | 'font' | 'planeTiles'>;

export type SectionPlanePicker = Readonly<{
  /** What it draws and the camera it draws with, for a renderer's `compileAsync`. */
  scene: THREE.Scene;
  camera: THREE.Camera;
  /** The square it last drew in; undefined before its first draw. */
  readonly rect: SectionPlanePickerRect | undefined;
  /**
   * Takes the view cube's colours and font. The picker draws nothing until it has a style, and the view cube restyles
   * it whenever its own style changes.
   */
  setStyle: (style: SectionPlanePickerStyle) => void;
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
   * `current` is the selected plane cut's plane, which stands forward, filled with its axis colour; the others sit
   * back until hovered. A dimmed picker, whose tiles can do nothing, sits back and faint.
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

type TileGeometries = Readonly<{ face: THREE.BufferGeometry; band: THREE.BufferGeometry; label: THREE.BufferGeometry }>;
let tileGeometries: TileGeometries | undefined;

/** The tile's face, the band around it and its label, shared by every picker: created once, never disposed. */
const getTileGeometries = (): TileGeometries => {
  tileGeometries ??= {
    face: new THREE.ShapeGeometry(roundedSquare(0.8, 0.2), 8),
    band: new THREE.ShapeGeometry(roundedSquare(0.94, 0.26), 8),
    label: new THREE.PlaneGeometry(0.62, 0.39),
  };
  return tileGeometries;
};

const x = new THREE.Vector3(1, 0, 0);
const y = new THREE.Vector3(0, 1, 0);
const z = new THREE.Vector3(0, 0, 1);
const axisVectors = { x, y, z } as const;

/** Each tile's in-plane right and up, and its normal, as printed on the positive side of its axis. */
const tileBases: Readonly<Record<SectionPlane, readonly [THREE.Vector3, THREE.Vector3, THREE.Vector3]>> = {
  xy: [x, y, z],
  xz: [x.clone().negate(), z, y],
  yz: [y, z, x],
};

/**
 * A tile's basis on one side of its axis, its normal outward. On the negative side it turns about its up axis, so its
 * label reads unmirrored from there, as the cube's Back and Left faces do; the XY plane, whose up is in plane, turns
 * about its right axis instead, as the cube's Bottom does.
 */
export const resolveSectionPlaneTileBasis = (
  plane: SectionPlane,
  side: 1 | -1,
): readonly [THREE.Vector3, THREE.Vector3, THREE.Vector3] => {
  const [right, up, normal] = tileBases[plane];
  if (side === 1) {
    return [right, up, normal];
  }
  return plane === 'xy'
    ? [right, up.clone().negate(), normal.clone().negate()]
    : [right.clone().negate(), up, normal.clone().negate()];
};

const planes = ['xy', 'xz', 'yz'] as const;
const labels = { xy: 'XY', xz: 'XZ', yz: 'YZ' } as const;

/** The tiles' distance from the centre, and how far their bands and labels stand off their faces. */
const tileDistance = 0.56;
const faceLift = 0.002;
const labelLift = 0.006;

/** A tile's scale: the plane in use stands forward, the others back; hover lifts one and a press sinks it. */
const tileScales = { other: 0.94, current: 1, hover: 1.08, active: 0.96 } as const;
const dimmedOpacity = 0.4;
/** How far a hovered tile's face is washed with its axis colour. */
const hoverWash = 0.35;

const labelCanvasWidth = 256;
const labelCanvasHeight = 160;
const labelFontSize = 100;

const readTextContext = (canvas: HTMLCanvasElement): CanvasRenderingContext2D | undefined => {
  try {
    const context = canvas.getContext('2d') ?? undefined;
    return typeof context?.fillText === 'function' ? context : undefined;
  } catch {
    return undefined;
  }
};

/** A label printed in the cube's font and weight, on a transparent ground. */
const createLabelTexture = (text: string, color: string, font: string): THREE.CanvasTexture => {
  const canvas = document.createElement('canvas');
  canvas.width = labelCanvasWidth;
  canvas.height = labelCanvasHeight;
  // A canvas that cannot draw text (jsdom) leaves the label blank rather than failing the picker.
  const context = readTextContext(canvas);
  if (context) {
    context.font = `500 ${labelFontSize}px ${font}`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillStyle = color;
    context.fillText(text, labelCanvasWidth / 2, labelCanvasHeight / 2);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
};

/** The higher-contrast neutral for a label on `color`, as the cube chooses its hover label. */
const contrastingLabel = (color: THREE.Color): THREE.Color => {
  // Three keeps colours linear, which relative luminance needs.
  const luminance = 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;
  return new THREE.Color().setScalar(luminance > 0.179 ? 0 : 1);
};

const createFlatMaterial = (depthWrite: boolean): THREE.MeshBasicMaterial =>
  new THREE.MeshBasicMaterial({
    transparent: true,
    depthTest: true,
    depthWrite,
    fog: false,
    toneMapped: false,
  });

type TilePalette = Readonly<{
  face: THREE.Color;
  wash: THREE.Color;
  edge: THREE.Color;
  strong: THREE.Color;
  deep: THREE.Color;
  label: THREE.CanvasTexture;
  filledLabel: THREE.CanvasTexture;
  strongLabel: THREE.CanvasTexture;
}>;

/** Builds the picker once; the plane in use and the pointer only repaint it, and the cube's style only restyles it. */
export const createSectionPlanePicker = (): SectionPlanePicker => {
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1.05, 1.05, 1.05, -1.05, 0.1, 20);
  const geometries = getTileGeometries();
  const tiles = planes.map((plane) => {
    const axis: SectionAxis = sectionPlaneAxes[plane];
    const tile = new THREE.Group();
    tile.name = `section-plane-tile:${plane}`;
    const band = new THREE.Mesh(geometries.band, createFlatMaterial(true));
    band.renderOrder = viewportRenderTiers.sectionControlBody;
    const face = new THREE.Mesh(geometries.face, createFlatMaterial(true));
    face.position.z = faceLift;
    face.renderOrder = viewportRenderTiers.sectionControlBody;
    const label = new THREE.Mesh(geometries.label, createFlatMaterial(false));
    label.position.z = labelLift;
    label.renderOrder = viewportRenderTiers.sectionControlLabel;
    tile.add(band, face, label);
    scene.add(tile);
    return { plane, axis, tile, band, face, label, palette: undefined as TilePalette | undefined };
  });
  const hitTargets = tiles.flatMap(({ band, face }) => [band, face]);
  const cameraQuaternion = new THREE.Quaternion();
  const basis = new THREE.Matrix4();
  const viewport = new THREE.Vector4();
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let rect: SectionPlanePickerRect | undefined;
  let lastPaint: Parameters<SectionPlanePicker['paint']>[0] = { current: undefined };

  const disposePalettes = (): void => {
    for (const tile of tiles) {
      tile.palette?.label.dispose();
      tile.palette?.filledLabel.dispose();
      tile.palette?.strongLabel.dispose();
      tile.palette = undefined;
    }
  };

  /** Turns the picker with the view, each tile on the side of its axis that faces the camera, printed outward. */
  const align = (view: THREE.Camera): void => {
    view.getWorldQuaternion(cameraQuaternion);
    camera.quaternion.copy(cameraQuaternion);
    camera.position.set(0, 0, 6).applyQuaternion(cameraQuaternion);
    camera.updateMatrixWorld();
    for (const { plane, axis, tile } of tiles) {
      const side = camera.position[axis] < 0 ? -1 : 1;
      tile.position.copy(axisVectors[axis]).multiplyScalar(tileDistance * side);
      tile.quaternion.setFromRotationMatrix(basis.makeBasis(...resolveSectionPlaneTileBasis(plane, side)));
    }
    scene.updateMatrixWorld(true);
  };

  const picker: SectionPlanePicker = {
    scene,
    camera,
    get rect() {
      return rect;
    },
    setStyle(style) {
      disposePalettes();
      const face = new THREE.Color(style.face);
      const label = `#${new THREE.Color(style.label).getHexString()}`;
      for (const tile of tiles) {
        const tints = style.planeTiles[tile.axis];
        const edge = new THREE.Color(tints.edge);
        const strong = new THREE.Color(tints.strong);
        tile.palette = {
          face,
          wash: face.clone().lerp(edge, hoverWash),
          edge,
          strong,
          deep: new THREE.Color(tints.deep),
          label: createLabelTexture(labels[tile.plane], label, style.font),
          filledLabel: createLabelTexture(labels[tile.plane], `#${contrastingLabel(edge).getHexString()}`, style.font),
          strongLabel: createLabelTexture(
            labels[tile.plane],
            `#${contrastingLabel(strong).getHexString()}`,
            style.font,
          ),
        };
      }
      picker.paint(lastPaint);
    },
    render({ renderer, camera: view, cubeViewport: [cubeX, cubeY, cubeWidth, cubeHeight] }) {
      if (!tiles[0]?.palette) {
        return;
      }
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
      const hit = raycaster.intersectObjects(hitTargets, false)[0];
      return tiles.find(({ band, face }) => band === hit?.object || face === hit?.object)?.plane;
    },
    paint(states) {
      lastPaint = states;
      const { current, hovered, active, isDimmed = false } = states;
      for (const { plane, tile, band, face, label, palette } of tiles) {
        const isCurrent = !isDimmed && plane === current;
        const isHovered = !isDimmed && plane === hovered;
        const isActive = !isDimmed && plane === active;
        tile.scale.setScalar(
          isActive
            ? tileScales.active
            : isHovered
              ? tileScales.hover
              : isCurrent
                ? tileScales.current
                : tileScales.other,
        );
        const opacity = isDimmed ? dimmedOpacity : 1;
        const materials = [band.material, face.material, label.material];
        for (const material of materials) {
          material.opacity = opacity;
        }
        if (!palette) {
          continue;
        }
        // At rest the band carries the axis colour; hover washes the face with it and selection fills the face.
        // Hovering the selected tile deepens both, so hover always shows.
        const isHoveredCurrent = isCurrent && (isHovered || isActive);
        band.material.color.copy(
          isHoveredCurrent ? palette.deep : isCurrent || isHovered || isActive ? palette.strong : palette.edge,
        );
        face.material.color.copy(
          isHoveredCurrent
            ? palette.strong
            : isCurrent
              ? palette.edge
              : isHovered || isActive
                ? palette.wash
                : palette.face,
        );
        const map = isHoveredCurrent ? palette.strongLabel : isCurrent ? palette.filledLabel : palette.label;
        if (label.material.map !== map) {
          label.material.map = map;
          label.material.needsUpdate = true;
        }
      }
    },
    dispose() {
      disposePalettes();
      for (const { band, face, label } of tiles) {
        band.material.dispose();
        face.material.dispose();
        label.material.dispose();
      }
    },
  };
  picker.paint({ current: undefined });
  return picker;
};
