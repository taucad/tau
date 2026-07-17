// eslint-disable-next-line import-x/no-extraneous-dependencies, unicorn/prefer-module -- JSCAD requires CommonJS
const jscad = require('@jscad/modeling');

const { cylinder, polygon } = jscad.primitives;
const { rotateZ } = jscad.transforms;
const { extrudeLinear } = jscad.extrusions;
const { union, subtract } = jscad.booleans;
const { vec2 } = jscad.maths;
const { degToRad } = jscad.utils;

const getParameterDefinitions = () => [
  { name: 'numberTeeth', caption: 'Teeth:', type: 'int', initial: 12, min: 3 },
  { name: 'circularPitch', caption: 'Circular pitch:', type: 'float', initial: 5 },
  { name: 'pressureAngle', caption: 'Pressure angle:', type: 'float', initial: 20 },
  { name: 'clearance', caption: 'Clearance:', type: 'float', initial: 0 },
  { name: 'thickness', caption: 'Thickness:', type: 'float', initial: 5, min: 0 },
  { name: 'centerHoleRadius', caption: 'Center hole:', type: 'float', initial: 2, min: 0 },
];

/**
 * Creates a single gear with optional center hole.
 */
const createGearWithHole = (options) => {
  const { numberTeeth, circularPitch, pressureAngle, clearance, thickness, centerHoleRadius } = options;
  let gear = involuteGear({ numberTeeth, circularPitch, pressureAngle: degToRad(pressureAngle), clearance, thickness });
  if (centerHoleRadius > 0) {
    const centerHole = cylinder({
      height: thickness,
      radius: centerHoleRadius,
      center: [0, 0, thickness / 2],
      segments: 64,
    });
    gear = subtract(gear, centerHole);
  }

  return gear;
};

const main = (parameters) => {
  const { numberTeeth = 12, circularPitch, pressureAngle, clearance, thickness, centerHoleRadius } = parameters;

  const gearOptions = { circularPitch, pressureAngle, clearance, thickness, centerHoleRadius };
  return createGearWithHole({ numberTeeth, ...gearOptions });
};

const involuteGear = (options) => {
  const { numberTeeth, circularPitch, pressureAngle, clearance, thickness } = options;
  const addendum = circularPitch / Math.PI;
  const dedendum = addendum + clearance;

  const pitchRadius = (numberTeeth * circularPitch) / (2 * Math.PI);
  const baseRadius = pitchRadius * Math.cos(pressureAngle);
  const outerRadius = pitchRadius + addendum;
  const rootRadius = pitchRadius - dedendum;

  const maxTanLength = Math.sqrt(outerRadius * outerRadius - baseRadius * baseRadius);
  const maxAngle = maxTanLength / baseRadius;

  const tlAtPitchCircle = Math.sqrt(pitchRadius * pitchRadius - baseRadius * baseRadius);
  const angleAtPitchCircle = tlAtPitchCircle / baseRadius;
  const diffAngle = angleAtPitchCircle - Math.atan(angleAtPitchCircle);
  const angularToothWidthAtBase = Math.PI / numberTeeth + 2 * diffAngle;

  const toothCurveResolution = 30;
  const points = [[0, 0]];
  for (let i = 0; i <= toothCurveResolution; i++) {
    const angle = maxAngle * (i / toothCurveResolution) ** (2 / 3);
    const tanLength = angle * baseRadius;
    let radiantVector = vec2.fromAngleRadians(vec2.create(), angle);
    let tangentVector = vec2.scale(vec2.create(), vec2.normal(vec2.create(), radiantVector), -tanLength);
    radiantVector = vec2.scale(vec2.create(), radiantVector, baseRadius);
    points[i + 1] = [radiantVector[0] + tangentVector[0], radiantVector[1] + tangentVector[1]];

    radiantVector = vec2.fromAngleRadians(vec2.create(), angularToothWidthAtBase - angle);
    tangentVector = vec2.scale(vec2.create(), vec2.normal(vec2.create(), radiantVector), tanLength);
    radiantVector = vec2.scale(vec2.create(), radiantVector, baseRadius);
    points[2 * toothCurveResolution + 2 - i] = [
      radiantVector[0] + tangentVector[0],
      radiantVector[1] + tangentVector[1],
    ];
  }

  const singleTooth2D = polygon({ points, closed: true });
  const singleTooth3D = extrudeLinear({ height: thickness }, singleTooth2D);

  const allTeeth = [];
  for (let j = 0; j < numberTeeth; j++) {
    const currentToothAngle = (j * 2 * Math.PI) / numberTeeth;
    const rotatedTooth = rotateZ(currentToothAngle, singleTooth3D);
    allTeeth.push(rotatedTooth);
  }

  const rootPoints = [];
  const toothAngle = (2 * Math.PI) / numberTeeth;
  const toothCenterAngle = 0.5 * angularToothWidthAtBase;
  const rootSegmentsPerTooth = 8; // More segments between teeth for smoother root circle
  for (let k = 0; k < numberTeeth; k++) {
    for (let s = 0; s < rootSegmentsPerTooth; s++) {
      const currentAngle = toothCenterAngle + k * toothAngle + (s * toothAngle) / rootSegmentsPerTooth;
      const p1 = vec2.scale(vec2.create(), vec2.fromAngleRadians(vec2.create(), currentAngle), rootRadius);
      rootPoints.push([p1[0], p1[1]]);
    }
  }

  const rootCircle2D = polygon({ points: rootPoints, closed: true });
  const rootcircle = extrudeLinear({ height: thickness }, rootCircle2D);

  return union(rootcircle, allTeeth);
};

// eslint-disable-next-line unicorn/prefer-module -- JSCAD requires CommonJS
module.exports = { main, getParameterDefinitions };
