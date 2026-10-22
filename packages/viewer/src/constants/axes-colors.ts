/** The OKLCH hue of each axis. */
const axisHues = { x: 22.5, y: 135, z: 255 } as const;

/** Colours of the X, Y and Z axes in OKLCH, shared by the grid, gizmo, section rows and SVG viewer. */
export const axesColors = {
  x: `oklch(0.7 0.12 ${axisHues.x})`,
  y: `oklch(0.7 0.12 ${axisHues.y})`,
  z: `oklch(0.7 0.12 ${axisHues.z})`,
};

/** One axis's tints on the section plane picker's tiles. */
export type SectionPlaneTileTints = Readonly<{
  /** The band at rest: the axis colour itself. */
  edge: string;
  /** The band of a hovered or selected tile, and the face of a hovered selected one. */
  strong: string;
  /** The band of a hovered selected tile, whose face takes `strong`. */
  deep: string;
}>;

const tileTints = (hue: number): SectionPlaneTileTints => ({
  edge: `oklch(0.7 0.12 ${hue})`,
  strong: `oklch(0.66 0.16 ${hue})`,
  deep: `oklch(0.55 0.14 ${hue})`,
});

/** The section plane picker's tints, keyed by the axis normal to each tile's plane. */
export const sectionPlaneTileTints: Readonly<Record<'x' | 'y' | 'z', SectionPlaneTileTints>> = {
  x: tileTints(axisHues.x),
  y: tileTints(axisHues.y),
  z: tileTints(axisHues.z),
};
