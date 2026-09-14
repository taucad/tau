import type { Dimension } from '#unit.js';

const qudt = 'http://qudt.org/vocab/quantitykind/';

/** QUDT 3.5.1 quantity-kind identities admitted by Tau's initial reviewed table. @public */
export const quantityKinds = Object.freeze({
  acceleration: `${qudt}Acceleration`,
  amountOfSubstance: `${qudt}AmountOfSubstance`,
  area: `${qudt}Area`,
  depth: `${qudt}Depth`,
  diameter: `${qudt}Diameter`,
  dimensionlessRatio: `${qudt}DimensionlessRatio`,
  distance: `${qudt}Distance`,
  electricCurrent: `${qudt}ElectricCurrent`,
  energy: `${qudt}Energy`,
  force: `${qudt}Force`,
  height: `${qudt}Height`,
  length: `${qudt}Length`,
  linearAcceleration: `${qudt}LinearAcceleration`,
  linearVelocity: `${qudt}LinearVelocity`,
  luminousIntensity: `${qudt}LuminousIntensity`,
  mass: `${qudt}Mass`,
  massDensity: `${qudt}MassDensity`,
  momentOfForce: `${qudt}MomentOfForce`,
  planeAngle: `${qudt}PlaneAngle`,
  pressure: `${qudt}Pressure`,
  radius: `${qudt}Radius`,
  speed: `${qudt}Speed`,
  temperature: `${qudt}Temperature`,
  temperatureDifference: `${qudt}TemperatureDifference`,
  thermodynamicTemperature: `${qudt}ThermodynamicTemperature`,
  time: `${qudt}Time`,
  torque: `${qudt}Torque`,
  velocity: `${qudt}Velocity`,
  volume: `${qudt}Volume`,
  width: `${qudt}Width`,
});

/** Reference identity for the initial thermodynamic point profile. @public */
export const quantityReferences = Object.freeze({
  thermodynamicAbsoluteZero: 'urn:taucad:reference:thermodynamic-absolute-zero',
});

type KnownKind = (typeof quantityKinds)[keyof typeof quantityKinds];
type KindRule = Readonly<{
  dimension: Dimension;
  family: string;
  spaces: ReadonlyArray<'linear' | 'difference' | 'point'>;
}>;

const zeroDimension: Dimension = Object.freeze({
  length: 0,
  time: 0,
  mass: 0,
  angle: 0,
  temperature: 0,
  electricCurrent: 0,
  luminousIntensity: 0,
  amountOfSubstance: 0,
});

const dimension = (values: Partial<Dimension> = {}): Dimension => Object.freeze({ ...zeroDimension, ...values });

const rules = new Map<string, KindRule>();
const addRules = (kinds: readonly KnownKind[], rule: KindRule): void => {
  for (const kind of kinds) {
    rules.set(kind, rule);
  }
};

const linear = ['linear'] as const;
addRules(
  [
    quantityKinds.length,
    quantityKinds.height,
    quantityKinds.width,
    quantityKinds.depth,
    quantityKinds.diameter,
    quantityKinds.radius,
    quantityKinds.distance,
  ],
  { dimension: dimension({ length: 1 }), family: 'length', spaces: linear },
);
addRules([quantityKinds.time], { dimension: dimension({ time: 1 }), family: 'time', spaces: linear });
addRules([quantityKinds.mass], { dimension: dimension({ mass: 1 }), family: 'mass', spaces: linear });
addRules([quantityKinds.planeAngle], { dimension: dimension({ angle: 1 }), family: 'angle', spaces: linear });
addRules([quantityKinds.dimensionlessRatio], { dimension: dimension(), family: 'ratio', spaces: linear });
addRules([quantityKinds.temperature, quantityKinds.thermodynamicTemperature], {
  dimension: dimension({ temperature: 1 }),
  family: 'temperature',
  spaces: ['linear', 'difference', 'point'],
});
addRules([quantityKinds.temperatureDifference], {
  dimension: dimension({ temperature: 1 }),
  family: 'temperature',
  spaces: ['difference'],
});
addRules([quantityKinds.electricCurrent], {
  dimension: dimension({ electricCurrent: 1 }),
  family: 'electric-current',
  spaces: linear,
});
addRules([quantityKinds.amountOfSubstance], {
  dimension: dimension({ amountOfSubstance: 1 }),
  family: 'amount-of-substance',
  spaces: linear,
});
addRules([quantityKinds.luminousIntensity], {
  dimension: dimension({ luminousIntensity: 1 }),
  family: 'luminous-intensity',
  spaces: linear,
});
addRules([quantityKinds.area], { dimension: dimension({ length: 2 }), family: 'area', spaces: linear });
addRules([quantityKinds.volume], { dimension: dimension({ length: 3 }), family: 'volume', spaces: linear });
addRules([quantityKinds.speed], {
  dimension: dimension({ length: 1, time: -1 }),
  family: 'speed',
  spaces: linear,
});
addRules([quantityKinds.velocity, quantityKinds.linearVelocity], {
  dimension: dimension({ length: 1, time: -1 }),
  family: 'velocity',
  spaces: linear,
});
addRules([quantityKinds.acceleration, quantityKinds.linearAcceleration], {
  dimension: dimension({ length: 1, time: -2 }),
  family: 'acceleration',
  spaces: linear,
});
addRules([quantityKinds.force], {
  dimension: dimension({ length: 1, mass: 1, time: -2 }),
  family: 'force',
  spaces: linear,
});
addRules([quantityKinds.pressure], {
  dimension: dimension({ length: -1, mass: 1, time: -2 }),
  family: 'pressure',
  spaces: linear,
});
addRules([quantityKinds.energy], {
  dimension: dimension({ length: 2, mass: 1, time: -2 }),
  family: 'energy',
  spaces: linear,
});
addRules([quantityKinds.torque, quantityKinds.momentOfForce], {
  dimension: dimension({ length: 2, mass: 1, time: -2 }),
  family: 'torque',
  spaces: linear,
});
addRules([quantityKinds.massDensity], {
  dimension: dimension({ length: -3, mass: 1 }),
  family: 'density',
  spaces: linear,
});

export const getKindRule = (kind: string): KindRule | undefined => rules.get(kind);

const compatibleFamilyResult = new Map<string, string>([
  ['length', quantityKinds.length],
  ['temperature', quantityKinds.temperature],
  ['velocity', quantityKinds.velocity],
  ['acceleration', quantityKinds.acceleration],
  ['torque', quantityKinds.torque],
]);

export const compatibleKind = (left: string, right: string): string | undefined => {
  const leftRule = getKindRule(left);
  const rightRule = getKindRule(right);
  if (!leftRule || !rightRule || leftRule.family !== rightRule.family) {
    return undefined;
  }
  return left === right ? left : compatibleFamilyResult.get(leftRule.family);
};

const binaryDerivedKinds = new Map<string, string>([
  ['multiply:length:length', quantityKinds.area],
  ['multiply:area:length', quantityKinds.volume],
  ['multiply:length:area', quantityKinds.volume],
  ['multiply:speed:time', quantityKinds.length],
  ['multiply:time:speed', quantityKinds.length],
  ['divide:length:time', quantityKinds.speed],
  ['divide:mass:volume', quantityKinds.massDensity],
  ['divide:force:area', quantityKinds.pressure],
]);

const exponentDerivedKinds = new Map<string, string>([
  ['power:length:2', quantityKinds.area],
  ['power:length:3', quantityKinds.volume],
  ['root:area:2', quantityKinds.length],
  ['root:volume:3', quantityKinds.length],
]);

export const derivedKind = (
  operator: 'multiply' | 'divide' | 'power' | 'root',
  left: string,
  rightOrExponent: string | number,
): string | undefined => {
  const leftFamily = getKindRule(left)?.family;
  if (!leftFamily) {
    return undefined;
  }
  if (typeof rightOrExponent === 'number') {
    return exponentDerivedKinds.get(`${operator}:${leftFamily}:${rightOrExponent}`);
  }
  const rightFamily = getKindRule(rightOrExponent)?.family;
  if (!rightFamily) {
    return undefined;
  }
  const reviewed = binaryDerivedKinds.get(`${operator}:${leftFamily}:${rightFamily}`);
  return (
    reviewed ?? (operator === 'divide' && leftFamily === rightFamily ? quantityKinds.dimensionlessRatio : undefined)
  );
};
