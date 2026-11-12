/**
 * The view cube's styles (blueprint G1 to G4). Hiding the gizmo is the view's `display.gizmo` switch, not a style.
 */
import type { GizmoAxisOptions, GizmoOptions, ViewportGizmo } from 'three-viewport-gizmo';

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
 * How the view cube draws one style: the library options it takes on top of the shared ones, whether Tau's continuous
 * rounded surface replaces the library's faces, whether Tau's axis triad is drawn on it, whether it takes a click, and
 * the scale it is drawn at.
 *
 * @public
 */
export type ViewportGizmoStyleConfig = Readonly<{
  options: Partial<GizmoOptions>;
  surface: 'tau' | 'library';
  triad: boolean;
  clickable: boolean;
  scale: number;
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
  const face = {
    color: colors.face,
    labelColor: colors.label,
    hover: { color: colors.hover, labelColor: colors.hoverLabel },
  };
  const faces = {
    corners: face,
    edges: face,
    right: face,
    top: face,
    front: face,
    back: face,
    left: face,
    bottom: face,
  };
  switch (gizmoStyle) {
    case 'cube': {
      return {
        options: { type: 'rounded-cube', radius, ...faces },
        surface: 'tau',
        triad: true,
        clickable: true,
        scale: 0.7,
      };
    }
    case 'classic-cube': {
      return { options: { type: 'cube', ...faces }, surface: 'library', triad: true, clickable: true, scale: 0.7 };
    }
    case 'axis-balls': {
      const ball = (color: string): GizmoAxisOptions => ({
        color,
        labelColor: colors.ballLabel,
        hover: { color: colors.hover, labelColor: colors.hoverLabel },
      });
      return {
        options: { type: 'sphere', x: ball(colors.axes.x), y: ball(colors.axes.y), z: ball(colors.axes.z) },
        surface: 'library',
        triad: false,
        clickable: true,
        scale: 1,
      };
    }
    case 'axes': {
      return {
        options: { type: 'rounded-cube', radius, ...faces },
        surface: 'tau',
        triad: true,
        clickable: false,
        scale: 0.7,
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
  label: number;
  hover: number;
  hoverLabel: number;
  /** The label on an axis ball, legible on every axis hue. */
  ballLabel: number;
  axes: Readonly<{ x: string; y: string; z: string }>;
}>;

/**
 * Makes a gizmo the Axes style (G4): hides the cube's click targets, so only the triad added after shows, and turns
 * off the gizmo's pointer surface, so it takes no click or drag and a press there reaches the canvas.
 *
 * @param gizmo - The newly constructed gizmo, before its triad is added.
 * @public
 */
export const hideViewportGizmoTargets = (gizmo: ViewportGizmo): void => {
  for (const child of gizmo.children) {
    child.visible = false;
  }
  // The library keeps its pointer surface private.
  const surface: unknown = Reflect.get(gizmo, '_domElement');
  if (surface instanceof HTMLElement) {
    surface.style.pointerEvents = 'none';
  }
};
