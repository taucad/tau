/**
 * The view cube's styles (blueprint G1 to G4). Hiding the gizmo is the view's `display.gizmo` switch, not a style.
 */
import { MeshBasicMaterial } from 'three';
import { positionLocal } from 'three/tsl';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import type { GizmoMaterial, GizmoOptions, GizmoTargetOptions } from 'three-viewport-gizmo';

/**
 * The gizmo styles: Tau's rounded cube, the library's sharp cube, one ball per axis direction, and a triad that takes
 * no click.
 *
 * @public
 */
export const gizmoStyleIds = ['cube', 'classic-cube', 'axis-balls', 'axes'] as const;

/**
 * One of {@link gizmoStyleIds}.
 *
 * @public
 */
export type GizmoStyleId = (typeof gizmoStyleIds)[number];

/**
 * How the view cube draws one style: the library options it takes on top of the shared ones, and whether it takes a
 * click (`gizmo.enabled`).
 *
 * @public
 */
export type ViewportGizmoStyleConfig = Readonly<{
  options: GizmoOptions;
  clickable: boolean;
}>;

/**
 * Resolves a gizmo style to its drawing, every colour taken from the host's tokens (G1 to G3, G5).
 *
 * @param input - The style, the colours resolved from Tau's tokens, and the cube's corner radius.
 * @returns The style's library options and drawing switches.
 * @public
 */
export const resolveViewportGizmoStyleConfig = ({
  gizmoStyle,
  colors,
  radius,
}: Readonly<{
  gizmoStyle: GizmoStyleId;
  colors: ViewportGizmoColors;
  radius: number;
}>): ViewportGizmoStyleConfig => {
  const hover = { color: colors.hover };
  const face: GizmoTargetOptions = {
    color: colors.face,
    labelColor: colors.label,
    hover: { color: colors.hover, labelColor: colors.hoverLabel },
  };
  const faces = { x: face, y: face, z: face, nx: face, ny: face, nz: face };
  const triad = { enabled: true, colors: colors.axes };
  // ponytail: corners keep the face colour and edges the bevel, as Tau's own surface drew them (S5 carry).
  const cube = { ...faces, corners: { color: colors.face, hover }, edges: { color: colors.bevel, hover }, triad };
  switch (gizmoStyle) {
    case 'cube': {
      return { options: { type: 'rounded-cube', radius, ...cube }, clickable: true };
    }
    case 'classic-cube': {
      return { options: { type: 'cube', ...cube }, clickable: true };
    }
    case 'axis-balls': {
      const ball = (color: string): GizmoTargetOptions => ({
        color,
        labelColor: colors.ballLabel,
        hover: { color: colors.hover, labelColor: colors.hoverLabel },
      });
      return {
        options: { type: 'sphere', x: ball(colors.axes.x), y: ball(colors.axes.y), z: ball(colors.axes.z) },
        clickable: true,
      };
    }
    case 'axes': {
      // The triad alone: every target hidden; `gizmo.enabled = false` makes it display-only.
      const hidden = { enabled: false };
      return {
        options: {
          type: 'rounded-cube',
          radius,
          x: hidden,
          y: hidden,
          z: hidden,
          nx: hidden,
          ny: hidden,
          nz: hidden,
          corners: hidden,
          edges: hidden,
          triad,
        },
        clickable: false,
      };
    }
  }
};

/**
 * The colours a gizmo style draws with, resolved from the host's tokens.
 *
 * @public
 */
export type ViewportGizmoColors = Readonly<{
  face: number;
  /** The rounded cube's edges. */
  bevel: number;
  label: number;
  hover: number;
  hoverLabel: number;
  /** The label on an axis ball, legible on every axis hue. */
  ballLabel: number;
  axes: Readonly<{ x: string; y: string; z: string }>;
}>;

/**
 * The gizmo's `onMaterial` on the WebGPU backend: each mesh material becomes a node material, so every gizmo style draws
 * through the same explicit node path. Sprites (the axis balls) keep the renderer's own conversion. The replacement is
 * the host's: the caller disposes it with the cube.
 *
 * @param owned - Receives every material made here.
 * @returns The `onMaterial` option.
 * @public
 */
export const viewportGizmoNodeMaterials =
  (owned: Set<GizmoMaterial>): NonNullable<GizmoOptions['onMaterial']> =>
  (source) => {
    if (!(source instanceof MeshBasicMaterial)) {
      return source;
    }
    const material = new MeshBasicNodeMaterial({
      map: source.map,
      color: source.color,
      vertexColors: source.vertexColors,
      opacity: source.opacity,
      transparent: source.transparent,
      side: source.side,
      depthTest: source.depthTest,
      depthWrite: source.depthWrite,
      toneMapped: source.toneMapped,
    });
    // Three r184 can skip a transform after draw order changes. Identity position
    // keeps these moving control surfaces out of the stale observer shortcut.
    material.positionNode = positionLocal;
    owned.add(material as GizmoMaterial);
    return material as GizmoMaterial;
  };
