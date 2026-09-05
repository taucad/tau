import type { geometries } from '@jscad/modeling';
import {
  primitives,
  extrusions,
  booleans,
  maths,
  utils,
} from '@jscad/modeling';

type Geom3 = geometries.geom3.Geom3;
type Geom2 = geometries.geom2.Geom2;
type Vec2 = maths.vec2.Vec2;

const { circle, polygon } = primitives;
const { extrudeLinear } = extrusions;
const { subtract } = booleans;
const { vec2 } = maths;
const { degToRad } = utils;

export const defaultParams = {
  numTeeth: 10,
  circularPitch: 5,
  pressureAngle: 20,
  clearance: 0,
  thickness: 5,
  centerHoleRadius: 2,
};

export default function main(p = defaultParams): Geom3 {
  let profile = involuteGearProfile({
    numberTeeth: p.numTeeth,
    circularPitch: p.circularPitch,
    pressureAngle: degToRad(p.pressureAngle),
    clearance: p.clearance,
  });
  if (p.centerHoleRadius > 0) {
    const centerHole = circle({
      radius: p.centerHoleRadius,
      segments: 16,
    });
    profile = subtract(profile, centerHole);
  }

  return extrudeLinear({ height: p.thickness }, profile);
}

const involuteGearProfile = (options: {
  numberTeeth: number;
  circularPitch: number;
  pressureAngle: number;
  clearance: number;
}): Geom2 => {
  const { numberTeeth, circularPitch, pressureAngle, clearance } = options;
  const addendum = circularPitch / Math.PI;
  const dedendum = addendum + clearance;

  const pitchRadius = (numberTeeth * circularPitch) / (2 * Math.PI);
  const baseRadius = pitchRadius * Math.cos(pressureAngle);
  const outerRadius = pitchRadius + addendum;
  const rootRadius = pitchRadius - dedendum;

  const maxTanLength = Math.sqrt(
    outerRadius * outerRadius - baseRadius * baseRadius,
  );
  const maxAngle = maxTanLength / baseRadius;

  const tlAtPitchCircle = Math.sqrt(
    pitchRadius * pitchRadius - baseRadius * baseRadius,
  );
  const angleAtPitchCircle = tlAtPitchCircle / baseRadius;
  const diffAngle = angleAtPitchCircle - Math.atan(angleAtPitchCircle);
  const angularToothWidthAtBase = Math.PI / numberTeeth + 2 * diffAngle;

  const toothCurveResolution = 5;
  const toothPoints: Vec2[] = [];
  for (let index = 0; index <= toothCurveResolution; index++) {
    const angle = maxAngle * (index / toothCurveResolution) ** (2 / 3);
    const tanLength = angle * baseRadius;
    let radiantVector = vec2.fromAngleRadians(vec2.create(), angle);
    let tangentVector = vec2.scale(
      vec2.create(),
      vec2.normal(vec2.create(), radiantVector),
      -tanLength,
    );
    radiantVector = vec2.scale(vec2.create(), radiantVector, baseRadius);
    toothPoints[index] = [
      radiantVector[0] + tangentVector[0],
      radiantVector[1] + tangentVector[1],
    ];

    radiantVector = vec2.fromAngleRadians(
      vec2.create(),
      angularToothWidthAtBase - angle,
    );
    tangentVector = vec2.scale(
      vec2.create(),
      vec2.normal(vec2.create(), radiantVector),
      tanLength,
    );
    radiantVector = vec2.scale(vec2.create(), radiantVector, baseRadius);
    toothPoints[2 * toothCurveResolution + 1 - index] = [
      radiantVector[0] + tangentVector[0],
      radiantVector[1] + tangentVector[1],
    ];
  }

  const profilePoints: Vec2[] = [];
  const toothAngle = (2 * Math.PI) / numberTeeth;
  for (let index = 0; index < numberTeeth; index++) {
    const rotation = index * toothAngle;
    const rootStart = vec2.scale(
      vec2.create(),
      vec2.fromAngleRadians(vec2.create(), rotation),
      rootRadius,
    );
    profilePoints.push([rootStart[0], rootStart[1]] as Vec2);
    for (const point of toothPoints) {
      const rotated = vec2.rotate(vec2.create(), point, [0, 0], rotation);
      profilePoints.push([rotated[0], rotated[1]] as Vec2);
    }
    const rootEnd = vec2.scale(
      vec2.create(),
      vec2.fromAngleRadians(vec2.create(), rotation + angularToothWidthAtBase),
      rootRadius,
    );
    profilePoints.push([rootEnd[0], rootEnd[1]] as Vec2);
  }

  return polygon({ points: profilePoints });
};
