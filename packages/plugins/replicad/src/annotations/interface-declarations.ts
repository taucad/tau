import type { FaceFinder, SimplePoint, SingleFace } from 'replicad';

/**
 * Named face selector declaration resolved by the Tau Replicad kernel before export.
 *
 * @public
 */
export type FaceDeclaration = {
  kind: 'face';
  select: Extract<SingleFace, (f: FaceFinder) => FaceFinder>;
};

/**
 * Named cylindrical or conical axis selector declaration resolved from a Replicad face.
 *
 * @public
 */
export type AxisDeclaration = {
  kind: 'axis';
  select: Extract<SingleFace, (f: FaceFinder) => FaceFinder>;
};

/**
 * Named orthonormal datum frame declaration exported as an AP242 placement.
 *
 * @public
 */
export type DatumDeclaration = {
  kind: 'datum';
  origin: SimplePoint;
  xAxis: SimplePoint;
  zAxis: SimplePoint;
};

/**
 * Named group of face and axis declarations.
 *
 * @public
 */
export type GroupDeclaration = {
  kind: 'group';
  members: Array<FaceDeclaration | AxisDeclaration>;
};

/**
 * Replicad interface annotation declaration accepted by Tau's STEP exporter.
 *
 * @public
 */
export type InterfaceDeclaration = FaceDeclaration | AxisDeclaration | DatumDeclaration | GroupDeclaration;

/**
 * Map of interface names to annotation declarations.
 *
 * @public
 */
export type InterfaceDeclarations = Record<string, InterfaceDeclaration>;

/**
 * Declare a named face selected from a Replicad `FaceFinder`.
 *
 * @param select - Selector evaluated against the live Replicad shape.
 * @returns Face interface declaration.
 * @public
 */
export const face = (select: Extract<SingleFace, (f: FaceFinder) => FaceFinder>): FaceDeclaration => ({
  kind: 'face',
  select,
});

/**
 * Declare a named cylindrical or conical axis selected from a Replicad `FaceFinder`.
 *
 * @param select - Selector evaluated against the live Replicad shape.
 * @returns Axis interface declaration.
 * @public
 */
export const axis = (select: Extract<SingleFace, (f: FaceFinder) => FaceFinder>): AxisDeclaration => ({
  kind: 'axis',
  select,
});

/**
 * Declare a named coordinate frame exported as AP242 supplemental geometry.
 *
 * @param options - Frame origin and axes.
 * @returns Frame (datum placement) interface declaration.
 * @public
 */
export const frame = ({
  origin,
  xAxis = [1, 0, 0],
  zAxis = [0, 0, 1],
}: {
  origin: SimplePoint;
  xAxis?: SimplePoint;
  zAxis?: SimplePoint;
}): DatumDeclaration => ({ kind: 'datum', origin, xAxis, zAxis });

/**
 * Declare a named coordinate frame exported as AP242 supplemental geometry.
 *
 * @param options - Frame origin and axes.
 * @returns Frame (datum placement) interface declaration.
 * @public
 * @deprecated Use {@link frame} — this declares a coordinate *frame* in the
 * supplemental-geometry channel, not a GD&T datum (the semantic
 * `DATUM`/`DATUM_FEATURE` family); the old name is a homonym that conflates
 * the two concepts. Behaviour is identical.
 */
export const datum = frame;

/**
 * Declare a named group of face and axis annotations.
 *
 * @param members - Face and axis declarations included in the group.
 * @returns Group interface declaration.
 * @public
 */
export const group = (members: Array<FaceDeclaration | AxisDeclaration>): GroupDeclaration => ({
  kind: 'group',
  members,
});

/**
 * Supported GeoSpec interface name grammar.
 *
 * @public
 */
// eslint-disable-next-line @typescript-eslint/naming-convention -- Ported public annotation API uses this constant name.
export const INTERFACE_NAME_REGEX = /^[A-Za-z][\dA-Za-z]*(\[[1-9]\d*])?(\.[A-Za-z][\dA-Za-z]*(\[[1-9]\d*])?)*$/;

/**
 * Return whether a candidate interface path is valid for STEP export.
 *
 * @param name - Candidate interface name.
 * @returns Whether the name matches the supported interface grammar.
 * @public
 */
export const isValidInterfaceName = (name: string): boolean => INTERFACE_NAME_REGEX.test(name);

/**
 * Return whether a candidate top-level authoring key can appear in source code.
 *
 * @param key - Candidate authoring key.
 * @returns Whether the key is valid and not an indexed path segment.
 * @public
 */
export const isValidAuthoringKey = (key: string): boolean => isValidInterfaceName(key) && !key.includes('[');
