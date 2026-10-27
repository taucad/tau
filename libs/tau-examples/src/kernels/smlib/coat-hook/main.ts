/* oxlint-disable eslint/new-cap -- smlibwasm's shape constructors are functions (Circle, Pos), as in build123d. */
/**
 * A wall hook swept along a spline.
 *
 * The grip is a circle carried along a cubic curve, then sat on a filleted
 * plate. The curve stays a NURBS edge. A mesh hull would chord it, and
 * OpenSCAD would approximate the sweep with slices.
 */
import {
  Align,
  Circle,
  Cylinder,
  Part,
  Pos,
  Rectangle,
  Spline,
  Z,
  extrude,
} from '@classcad/smlibwasm';
import type { Shell } from '@classcad/smlibwasm';
import type { Material, Model } from '@taucad/smlib/model';

export const defaultParams = {
  /** Wall plate width. */
  plateWidth: 28,
  /** Wall plate height. */
  plateHeight: 72,
  /** Wall plate thickness. */
  plateThickness: 6,
  /** Plate corner radius. */
  cornerRadius: 5,
  /** How far the hook reaches out from the wall. */
  reach: 46,
  /** How far the tip rises. */
  rise: 34,
  /** Grip radius. */
  gripRadius: 5.5,
  /** Screw clearance diameter. */
  screwDiameter: 4.2,
  /** Distance between the two screw holes. */
  screwSpacing: 44,
};

type Params = typeof defaultParams;

const isPart = (shape: Part | Shell): shape is Part => shape instanceof Part;

const brass: Material = {
  pbrMetallicRoughness: {
    baseColorFactor: [0.66, 0.49, 0.27, 1],
    metallicFactor: 1,
    roughnessFactor: 0.32,
  },
};

const requireHook = (params: Params): void => {
  const fields = [
    params.plateWidth,
    params.plateHeight,
    params.plateThickness,
    params.cornerRadius,
    params.reach,
    params.rise,
    params.gripRadius,
    params.screwDiameter,
    params.screwSpacing,
  ];
  if (fields.some((value) => !Number.isFinite(value) || value <= 0)) {
    throw new RangeError('Hook dimensions must be positive.');
  }
  if (
    params.cornerRadius * 2 >=
    Math.min(params.plateWidth, params.plateHeight)
  ) {
    throw new RangeError('cornerRadius is larger than the plate.');
  }
  if (
    params.screwSpacing + params.screwDiameter >=
    params.plateHeight - 2 * params.cornerRadius
  ) {
    throw new RangeError('The screw holes do not fit the plate.');
  }
  if (params.gripRadius * 2 >= params.plateWidth) {
    throw new RangeError('gripRadius is wider than the plate.');
  }
};

/**
 * Brass coat hook: filleted wall plate plus a spline-swept grip.
 * @param params - Plate, reach and grip sizes.
 * @returns The plate and the hook as named parts.
 */
export default function main(params: Params = defaultParams): Model {
  requireHook(params);
  const standing = [Align.CENTER, Align.CENTER, Align.MIN] as const;
  // `extrude` is typed as `Part | Shell`. A closed rectangle is a solid, and
  // the hole and rim operations exist only on `Part`.
  const plateBody = extrude(
    Rectangle(params.plateWidth, params.plateHeight, {
      fillet: params.cornerRadius,
    }),
    params.plateThickness,
  );
  if (!isPart(plateBody)) {
    throw new Error('The wall plate extrusion is not a solid.');
  }
  let plate = plateBody;
  const drill = Cylinder(params.screwDiameter / 2, params.plateThickness + 2, {
    align: standing,
  });
  plate = plate.cut(Pos(0, params.screwSpacing / 2, -1).mul(drill));
  plate = plate.cut(Pos(0, -params.screwSpacing / 2, -1).mul(drill));
  // The plan corners are already arcs. Vertical edges of that extrusion are
  // smooth seams, and SMLib refuses to fillet them. Soften the top rim only.
  plate = plate.fillet(
    plate.edges().maxBy(Z),
    Math.min(0.8, params.plateThickness / 4),
  );

  const path = Spline(
    [0, 0, 0],
    [0, params.reach * 0.45, params.rise * 0.08],
    [0, params.reach, params.rise * 0.55],
    [0, params.reach * 0.62, params.rise],
  );
  const hook = Pos(
    0,
    -params.plateHeight / 2 + 16,
    params.plateThickness - 1.5,
  ).mul(Circle(params.gripRadius).sweep(path));

  return {
    shapes: [
      { name: 'Wall plate', shape: plate, material: brass },
      { name: 'Hook', shape: hook, material: brass },
    ],
  };
}
