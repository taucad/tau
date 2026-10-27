/**
 * Snap-fit shell for the launch USB-C sensor breakout.
 *
 * The board outline is fixed with `tscircuit/usb-sensor-breakout`: 42 mm by
 * 26 mm, 1.6 mm thick. This shell is the BRep half of that pair — a constant
 * wall, a filleted plan, and a connector slot — the sort of exact solid a mesh
 * kernel approximates and a STEP file can still machine.
 */
import { drawRoundedRectangle, makeBox } from 'replicad';
import type { Shape3D, ShapeConfig } from 'replicad';

/** Board outline this shell is drawn around, in millimetres. */
export const boardSize = { length: 42, width: 26, thickness: 1.6 };

export const defaultParams = {
  /** Gap around the board, per side. */
  clearance: 0.5,
  /** Side-wall thickness. */
  wall: 1.8,
  /** Floor thickness under the board. */
  floor: 1.6,
  /** Clear height inside the cavity, above the floor. */
  cavityHeight: 9,
  /** Plan corner radius. */
  cornerRadius: 3,
  /** Cosmetic edge radius. Falls back to a sharp edge when the kernel refuses it. */
  edgeRadius: 0.6,
  /** Connector opening width, on the +X short wall. */
  usbWidth: 13,
  /** Connector opening height. */
  usbHeight: 4.2,
  /** Lid plate thickness. */
  lidThickness: 2,
};

type Params = typeof defaultParams;

const requirePositive = (params: Params): void => {
  const values = [
    params.clearance,
    params.wall,
    params.floor,
    params.cavityHeight,
    params.cornerRadius,
    params.usbWidth,
    params.usbHeight,
    params.lidThickness,
  ];
  if (values.some((value) => !Number.isFinite(value) || value <= 0)) {
    throw new RangeError('Shell dimensions must be positive.');
  }
  if (params.edgeRadius < 0) {
    throw new RangeError('edgeRadius must be zero or positive.');
  }
  const innerLength = boardSize.length + 2 * params.clearance;
  const innerWidth = boardSize.width + 2 * params.clearance;
  if (params.cornerRadius * 2 >= Math.min(innerLength, innerWidth)) {
    throw new RangeError('cornerRadius is larger than the cavity.');
  }
  if (
    params.usbWidth >= innerWidth ||
    params.usbHeight >= params.cavityHeight
  ) {
    throw new RangeError('The USB opening does not fit the cavity wall.');
  }
};

const soften = (shape: Shape3D, radius: number): Shape3D => {
  if (radius <= 0) {
    return shape;
  }
  try {
    return shape.fillet(radius);
  } catch {
    return shape;
  }
};

const charcoal = {
  pbrMetallicRoughness: {
    baseColorFactor: [0.14, 0.15, 0.16, 1],
    metallicFactor: 0,
    roughnessFactor: 0.58,
  },
};

const graphite = {
  pbrMetallicRoughness: {
    baseColorFactor: [0.28, 0.3, 0.32, 1],
    metallicFactor: 0.05,
    roughnessFactor: 0.42,
  },
};

/**
 * A two-piece printed shell: cavity, USB-C slot and a plug lid parked behind it.
 * @param params - Wall, cavity and opening sizes. The board outline is fixed.
 * @returns The shell and the lid as named solids.
 */
export default function main(params: Params = defaultParams): ShapeConfig[] {
  requirePositive(params);
  const innerLength = boardSize.length + 2 * params.clearance;
  const innerWidth = boardSize.width + 2 * params.clearance;
  const outerLength = innerLength + 2 * params.wall;
  const outerWidth = innerWidth + 2 * params.wall;
  const height = params.floor + params.cavityHeight;
  const innerRadius = Math.max(params.cornerRadius - params.wall, 0.6);

  const outer = drawRoundedRectangle(
    outerLength,
    outerWidth,
    params.cornerRadius,
  )
    .sketchOnPlane('XY')
    .extrude(height);
  const cavity = drawRoundedRectangle(innerLength, innerWidth, innerRadius)
    .sketchOnPlane('XY')
    .extrude(params.cavityHeight + 1)
    .translate([0, 0, params.floor]);
  const slot = makeBox(
    [
      outerLength / 2 - params.wall - 1,
      -params.usbWidth / 2,
      params.floor + 1.6,
    ],
    [
      outerLength / 2 + 1,
      params.usbWidth / 2,
      params.floor + 1.6 + params.usbHeight,
    ],
  );
  const shell = soften(outer.cut(cavity).cut(slot), params.edgeRadius);

  const lidPlate = drawRoundedRectangle(
    outerLength,
    outerWidth,
    params.cornerRadius,
  )
    .sketchOnPlane('XY')
    .extrude(params.lidThickness);
  const plug = drawRoundedRectangle(
    innerLength - 0.5,
    innerWidth - 0.5,
    Math.max(innerRadius - 0.3, 0.4),
  )
    .sketchOnPlane('XY')
    .extrude(2)
    .translate([0, 0, -1.6]);
  const lid = soften(lidPlate.fuse(plug), params.edgeRadius).translate([
    0,
    outerWidth * 0.78,
    params.floor,
  ]);

  return [
    { name: 'Shell', shape: shell, material: charcoal },
    { name: 'Lid', shape: lid, material: graphite },
  ];
}
