/**
 * How the Kinematics pane names and formats a mechanism's joints and values: display units, labels and the
 * relation of a follower to its driver. Pure; shared by the pane and its relation card.
 */
import { convert, createQuantity, quantityKinds } from '@taucad/units/quantity';
import type { DegreeOfFreedom, Mechanism } from '@taucad/kinematics';

/**
 * The pane shows angles in degrees and lengths in millimetres, whatever the mechanism's units. A joint without
 * limits is never clamped: it scrubs a window of ±`extent` centred on its current value.
 */
export const displayByKind = {
  angle: { unit: 'deg', symbol: '°', step: 1, extent: 360 },
  distance: { unit: 'mm', symbol: 'mm', step: 0.1, extent: 100 },
} as const;

const convertCoordinate = ({
  value,
  kind,
  from,
  to,
}: Readonly<{ value: number; kind: DegreeOfFreedom['kind']; from: string; to: string }>): number => {
  if (from === to) {
    return value;
  }
  const quantity = createQuantity({
    value,
    unit: from,
    kind: kind === 'angle' ? quantityKinds.planeAngle : quantityKinds.length,
    space: 'linear',
  });
  const converted = quantity.status === 'success' ? convert({ quantity: quantity.value, to }) : quantity;
  if (converted.status !== 'success' || typeof converted.value.value !== 'number') {
    throw new Error(
      converted.status === 'success' ? 'Coordinate conversion was not numeric.' : converted.diagnostic.message,
    );
  }
  return converted.value.value;
};

type DisplayFactors = Readonly<Record<DegreeOfFreedom['kind'], number>>;

const displayFactorsByMechanism = new WeakMap<Mechanism, DisplayFactors>();

/**
 * Mechanism units to display units. Both conversions are linear (rad to deg, m to mm), so one factor per kind,
 * computed once per mechanism, replaces a unit conversion per value per frame.
 * @param mechanism - The loaded mechanism.
 * @returns The factor that turns each kind's mechanism value into its display value.
 */
export const getDisplayFactors = (mechanism: Mechanism): DisplayFactors => {
  let factors = displayFactorsByMechanism.get(mechanism);
  if (factors === undefined) {
    factors = {
      angle: convertCoordinate({ value: 1, kind: 'angle', from: mechanism.units.angle, to: displayByKind.angle.unit }),
      distance: convertCoordinate({
        value: 1,
        kind: 'distance',
        from: mechanism.units.length,
        to: displayByKind.distance.unit,
      }),
    };
    displayFactorsByMechanism.set(mechanism, factors);
  }
  return factors;
};

/**
 * Two decimals at most.
 * @param value - A display value.
 * @returns The value as text.
 */
export const formatNumber = (value: number): string => String(Math.round(value * 100) / 100);

/**
 * Four significant digits, so a worm's −1/30 reads −0.03333 rather than −0.03.
 * @param value - A ratio.
 * @returns The ratio as text.
 */
export const formatRatio = (value: number): string => String(Number(value.toPrecision(4)));

/**
 * Capitalises the first letter.
 * @param text - Any text.
 * @returns The text with its first letter upper-cased.
 */
export const capitalize = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

/**
 * A count with its noun, pluralised with an s.
 * @param count - How many.
 * @param noun - The singular noun.
 * @returns `1 part`, `32 parts`.
 */
export const plural = (count: number, noun: string): string => `${count} ${noun}${count === 1 ? '' : 's'}`;

/**
 * A display value with its unit symbol: `30°`, `120 mm`.
 * @param value - A display value.
 * @param kind - Its kind, which picks the symbol.
 * @returns The value and symbol as text.
 */
export const withSymbol = (value: number, kind: DegreeOfFreedom['kind']): string => {
  const { symbol } = displayByKind[kind];
  return `${formatNumber(value)}${symbol === '°' ? '' : ' '}${symbol}`;
};

/**
 * `planet-1` → `Planet 1`: a display transform of an id, never a new name. Search still matches the id.
 * @param id - A joint or link id.
 * @returns The id with separators as spaces and its first letter capitalised.
 */
export const humanize = (id: string): string => capitalize(id.replaceAll(/[-_]+/gu, ' '));

/**
 * A joint's authored name as written, else its id humanized; a joint with several coordinates appends which one.
 * @param dof - The degree of freedom.
 * @param mechanism - The mechanism that holds its joint.
 * @returns The row label.
 */
export const dofLabel = (dof: DegreeOfFreedom, mechanism: Mechanism): string => {
  const name = mechanism.joints[dof.jointId]?.name ?? humanize(dof.jointId);
  return dof.id === dof.jointId ? name : `${name} ${dof.id.slice(dof.jointId.length + 1)}`;
};

/**
 * `Ring (ground)`: the link that carries a joint, named for the relation card and the driver's details.
 * @param link - A link id.
 * @param mechanism - The mechanism, whose root is the ground.
 * @returns The link's display name.
 */
export const linkLabel = (link: string, mechanism: Mechanism): string =>
  `${humanize(link)}${link === mechanism.root ? ' (ground)' : ''}`;

/**
 * Inside its own group a driver's control is labelled by what it sets: the group title already names the joint.
 * @param dof - The driver.
 * @returns `Angle`, `Travel`, or the coordinate's name.
 */
export const quantityLabel = (dof: DegreeOfFreedom): string =>
  dof.id === dof.jointId
    ? dof.kind === 'angle'
      ? 'Angle'
      : 'Travel'
    : capitalize(dof.id.slice(dof.jointId.length + 1));

/**
 * A linear coupling's ratio in display units: a revolute follower of a prismatic driver turns degrees per mm.
 * @param input - The ratio in mechanism units, the follower, its driver and their mechanism.
 * @returns The ratio between their display values.
 */
export const displayRatio = ({
  ratio,
  dof,
  driver,
  mechanism,
}: Readonly<{ ratio: number; dof: DegreeOfFreedom; driver: DegreeOfFreedom; mechanism: Mechanism }>): number => {
  const factors = getDisplayFactors(mechanism);
  return (ratio * factors[dof.kind]) / factors[driver.kind];
};

/**
 * `= ratio × driver + offset` in display units, or `= curve of driver` for a sampled curve.
 * @param dof - The follower.
 * @param dofs - Every degree of freedom, to find its driver.
 * @param mechanism - Their mechanism.
 * @returns The coupling as text, empty for a driver.
 */
export const describeCoupling = (
  dof: DegreeOfFreedom,
  dofs: readonly DegreeOfFreedom[],
  mechanism: Mechanism,
): string => {
  const { coupling } = dof;
  const driver = dofs.find((candidate) => candidate.id === coupling?.driver);
  if (coupling === undefined || driver === undefined) {
    return '';
  }
  if ('curve' in coupling) {
    return `= curve of ${dofLabel(driver, mechanism)}`;
  }
  const ratio = displayRatio({ ratio: coupling.ratio, dof, driver, mechanism });
  const offset = coupling.offset
    ? ` + ${withSymbol(coupling.offset * getDisplayFactors(mechanism)[dof.kind], dof.kind)}`
    : '';
  return `= ${formatRatio(ratio)} × ${dofLabel(driver, mechanism)}${offset}`;
};

/**
 * `Moves 18 parts: Sleeve, Door 1, … and 13 more` for a driver's details.
 * @param names - The part names a joint moves.
 * @returns The line, or undefined when it moves none.
 */
export const listParts = (names: readonly string[]): string | undefined => {
  if (names.length === 0) {
    return undefined;
  }
  const shown = names.slice(0, 5);
  const rest = names.length - shown.length;
  return `Moves ${plural(names.length, 'part')}: ${shown.join(', ')}${rest > 0 ? ` and ${rest} more` : ''}`;
};
