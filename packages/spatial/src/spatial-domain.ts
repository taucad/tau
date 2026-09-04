/** A renderer-neutral three-dimensional tuple. @public */
export type SpatialVector = readonly [number, number, number];

/** A unit quaternion in `xyzw` order. @public */
export type SpatialQuaternion = readonly [number, number, number, number];

/** A column-major four-by-four matrix. @public */
export type SpatialMatrix = readonly [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

/** A signed Cartesian world axis. @public */
export type SignedWorldAxis = `${'+' | '-'}${'x' | 'y' | 'z'}`;

/** A right-handed coordinate convention and its physical unit scale. @public */
export type CoordinateConvention = Readonly<{
  up: SignedWorldAxis;
  forward: SignedWorldAxis;
  /** Metres represented by one coordinate unit. */
  metersPerUnit: number;
}>;

/** A reversible transform between two coordinate conventions. @public */
export type CoordinateTransform = Readonly<{
  /** Column-major matrix mapping source coordinates into target coordinates. */
  matrix: SpatialMatrix;
  /** Column-major matrix mapping target coordinates back into source coordinates. */
  inverse: SpatialMatrix;
  /** Unit rotation mapping source axes into target axes. */
  rotation: SpatialQuaternion;
  /** Unit rotation mapping target axes back into source axes. */
  inverseRotation: SpatialQuaternion;
}>;

/** Per-viewport mapping from physical metres into numerically local render units. @public */
export type RenderFrame = Readonly<{
  anchorFrameId: string;
  originMeters: SpatialVector;
  metersPerRenderUnit: number;
}>;

/** Axis-aligned spatial bounds. @public */
export type SpatialBounds = Readonly<{ min: SpatialVector; max: SpatialVector }>;

/** A plane represented by one incident point and a normal. @public */
export type SpatialPlane = Readonly<{ pointMeters: SpatialVector; normal: SpatialVector }>;

/** A plane represented in render-local units by one incident point and a normal. @public */
export type RenderPlane = Readonly<{ point: SpatialVector; normal: SpatialVector }>;

type MutableVector = [number, number, number];
type MutableQuaternion = [number, number, number, number];
type Matrix3 = readonly [SpatialVector, SpatialVector, SpatialVector];

const defaultMinimumRenderSpan = 1e-3;
const defaultMaximumRenderSpan = 1e3;
const defaultMaximumOriginDistance = 8192;

const assertFinite = (value: number, label: string): number => {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${label} must be finite.`);
  }
  return value;
};

const assertPositive = (value: number, label: string): number => {
  assertFinite(value, label);
  if (value <= 0) {
    throw new RangeError(`${label} must be a positive finite number greater than zero.`);
  }
  return value;
};

const validateVector = (value: SpatialVector, label: string): MutableVector => {
  return [
    assertFinite(value[0], `${label}[0]`),
    assertFinite(value[1], `${label}[1]`),
    assertFinite(value[2], `${label}[2]`),
  ];
};

const validateRenderFrame = (renderFrame: RenderFrame): RenderFrame => {
  if (renderFrame.anchorFrameId.length === 0) {
    throw new RangeError('renderFrame.anchorFrameId must not be empty.');
  }
  return {
    anchorFrameId: renderFrame.anchorFrameId,
    originMeters: validateVector(renderFrame.originMeters, 'renderFrame.originMeters'),
    metersPerRenderUnit: assertPositive(renderFrame.metersPerRenderUnit, 'renderFrame.metersPerRenderUnit'),
  };
};

const add = (left: SpatialVector, right: SpatialVector): MutableVector => [
  left[0] + right[0],
  left[1] + right[1],
  left[2] + right[2],
];

const subtract = (left: SpatialVector, right: SpatialVector): MutableVector => [
  left[0] - right[0],
  left[1] - right[1],
  left[2] - right[2],
];

const scaleVector = (value: SpatialVector, scale: number): MutableVector => [
  value[0] * scale,
  value[1] * scale,
  value[2] * scale,
];

const dot = (left: SpatialVector, right: SpatialVector): number =>
  left[0] * right[0] + left[1] * right[1] + left[2] * right[2];

const cross = (left: SpatialVector, right: SpatialVector): MutableVector => [
  left[1] * right[2] - left[2] * right[1],
  left[2] * right[0] - left[0] * right[2],
  left[0] * right[1] - left[1] * right[0],
];

const axisVector = (axis: SignedWorldAxis): SpatialVector => {
  switch (axis) {
    case '+x': {
      return [1, 0, 0];
    }
    case '-x': {
      return [-1, 0, 0];
    }
    case '+y': {
      return [0, 1, 0];
    }
    case '-y': {
      return [0, -1, 0];
    }
    case '+z': {
      return [0, 0, 1];
    }
    case '-z': {
      return [0, 0, -1];
    }
    default: {
      throw new RangeError(`Invalid signed world axis '${String(axis)}'.`);
    }
  }
};

const resolveBasis = ({ up, forward, metersPerUnit }: CoordinateConvention): Matrix3 => {
  assertPositive(metersPerUnit, 'metersPerUnit');
  const upVector = axisVector(up);
  const forwardVector = axisVector(forward);
  if (dot(upVector, forwardVector) !== 0) {
    throw new RangeError('up and forward must use distinct axes.');
  }
  return [cross(upVector, forwardVector), upVector, forwardVector];
};

const toMatrix4 = (values: Matrix3, factor: number): SpatialMatrix => [
  values[0][0] * factor,
  values[1][0] * factor,
  values[2][0] * factor,
  0,
  values[0][1] * factor,
  values[1][1] * factor,
  values[2][1] * factor,
  0,
  values[0][2] * factor,
  values[1][2] * factor,
  values[2][2] * factor,
  0,
  0,
  0,
  0,
  1,
];

const matrixToQuaternion = (matrix: Matrix3): SpatialQuaternion => {
  const trace = matrix[0][0] + matrix[1][1] + matrix[2][2];
  if (trace > 0) {
    const scale = 2 * Math.sqrt(trace + 1);
    return [
      (matrix[2][1] - matrix[1][2]) / scale,
      (matrix[0][2] - matrix[2][0]) / scale,
      (matrix[1][0] - matrix[0][1]) / scale,
      scale / 4,
    ];
  }
  const dominant =
    matrix[0][0] > matrix[1][1] ? (matrix[0][0] > matrix[2][2] ? 0 : 2) : matrix[1][1] > matrix[2][2] ? 1 : 2;
  const next = ((dominant + 1) % 3) as 0 | 1 | 2;
  const last = ((dominant + 2) % 3) as 0 | 1 | 2;
  const scale = 2 * Math.sqrt(1 + matrix[dominant][dominant] - matrix[next][next] - matrix[last][last]);
  const result: MutableQuaternion = [0, 0, 0, 0];
  result[dominant] = scale / 4;
  result[next] = (matrix[next][dominant] + matrix[dominant][next]) / scale;
  result[last] = (matrix[last][dominant] + matrix[dominant][last]) / scale;
  result[3] = (matrix[last][next] - matrix[next][last]) / scale;
  return result;
};

/**
 * Resolves a proper rotation and uniform scale between right-handed coordinate conventions.
 *
 * @param options - Source and target conventions.
 * @returns Forward and inverse column-major matrices.
 * @public
 */
export const resolveCoordinateTransform = ({
  source,
  target,
}: Readonly<{ source: CoordinateConvention; target: CoordinateConvention }>): CoordinateTransform => {
  const sourceBasis = resolveBasis(source);
  const targetBasis = resolveBasis(target);
  const scale = source.metersPerUnit / target.metersPerUnit;
  const coefficient = (row: 0 | 1 | 2, column: 0 | 1 | 2): number =>
    targetBasis[0][row] * sourceBasis[0][column] +
    targetBasis[1][row] * sourceBasis[1][column] +
    targetBasis[2][row] * sourceBasis[2][column];
  const rotation: Matrix3 = [
    [coefficient(0, 0), coefficient(0, 1), coefficient(0, 2)],
    [coefficient(1, 0), coefficient(1, 1), coefficient(1, 2)],
    [coefficient(2, 0), coefficient(2, 1), coefficient(2, 2)],
  ];
  const inverseRotation: Matrix3 = [
    [rotation[0][0], rotation[1][0], rotation[2][0]],
    [rotation[0][1], rotation[1][1], rotation[2][1]],
    [rotation[0][2], rotation[1][2], rotation[2][2]],
  ];
  const rotationQuaternion = matrixToQuaternion(rotation);
  return {
    matrix: toMatrix4(rotation, scale),
    inverse: toMatrix4(inverseRotation, 1 / scale),
    rotation: rotationQuaternion,
    inverseRotation: [
      rotationQuaternion[0] === 0 ? 0 : -rotationQuaternion[0],
      rotationQuaternion[1] === 0 ? 0 : -rotationQuaternion[1],
      rotationQuaternion[2] === 0 ? 0 : -rotationQuaternion[2],
      rotationQuaternion[3],
    ],
  };
};

/**
 * Converts a physical point in the anchor frame to render-local coordinates.
 *
 * @param options - Active render frame and physical point in metres.
 * @returns Render-local point.
 * @public
 */
export const toRenderPoint = ({
  renderFrame,
  point,
}: Readonly<{ renderFrame: RenderFrame; point: SpatialVector }>): SpatialVector => {
  const validFrame = validateRenderFrame(renderFrame);
  return scaleVector(
    subtract(validateVector(point, 'point'), validFrame.originMeters),
    1 / validFrame.metersPerRenderUnit,
  );
};

/**
 * Converts a render-local point back to physical metres in the anchor frame.
 *
 * @param options - Active render frame and render-local point.
 * @returns Physical point in metres.
 * @public
 */
export const fromRenderPoint = ({
  renderFrame,
  point,
}: Readonly<{ renderFrame: RenderFrame; point: SpatialVector }>): SpatialVector => {
  const validFrame = validateRenderFrame(renderFrame);
  return add(scaleVector(validateVector(point, 'point'), validFrame.metersPerRenderUnit), validFrame.originMeters);
};

const validateBounds = (bounds: SpatialBounds): SpatialBounds => {
  const min = validateVector(bounds.min, 'bounds.min');
  const max = validateVector(bounds.max, 'bounds.max');
  for (const index of [0, 1, 2] as const) {
    if (min[index] > max[index]) {
      throw new RangeError(`bounds.min[${index}] must not exceed bounds.max[${index}].`);
    }
  }
  return { min, max };
};

/**
 * Converts physical axis-aligned bounds into render-local bounds.
 *
 * @param options - Active render frame and physical bounds.
 * @returns Render-local bounds.
 * @public
 */
export const toRenderBounds = ({
  renderFrame,
  bounds,
}: Readonly<{ renderFrame: RenderFrame; bounds: SpatialBounds }>): SpatialBounds => {
  const validBounds = validateBounds(bounds);
  return {
    min: toRenderPoint({ renderFrame, point: validBounds.min }),
    max: toRenderPoint({ renderFrame, point: validBounds.max }),
  };
};

/**
 * Converts render-local axis-aligned bounds into physical bounds.
 *
 * @param options - Active render frame and render-local bounds.
 * @returns Physical bounds in metres.
 * @public
 */
export const fromRenderBounds = ({
  renderFrame,
  bounds,
}: Readonly<{ renderFrame: RenderFrame; bounds: SpatialBounds }>): SpatialBounds => {
  const validBounds = validateBounds(bounds);
  return {
    min: fromRenderPoint({ renderFrame, point: validBounds.min }),
    max: fromRenderPoint({ renderFrame, point: validBounds.max }),
  };
};

const validateSpatialPlane = (plane: SpatialPlane): SpatialPlane => {
  const pointMeters = validateVector(plane.pointMeters, 'plane.pointMeters');
  const normal = validateVector(plane.normal, 'plane.normal');
  if (Math.hypot(...normal) === 0) {
    throw new RangeError('plane.normal must have nonzero length.');
  }
  return { pointMeters, normal };
};

const validateRenderPlane = (plane: RenderPlane): RenderPlane => {
  const point = validateVector(plane.point, 'plane.point');
  const normal = validateVector(plane.normal, 'plane.normal');
  if (Math.hypot(...normal) === 0) {
    throw new RangeError('plane.normal must have nonzero length.');
  }
  return { point, normal };
};

/**
 * Converts a physical plane into render-local coordinates while preserving incidence.
 *
 * @param options - Active render frame and physical plane.
 * @returns Render-local plane.
 * @public
 */
export const toRenderPlane = ({
  renderFrame,
  plane,
}: Readonly<{ renderFrame: RenderFrame; plane: SpatialPlane }>): RenderPlane => {
  const validPlane = validateSpatialPlane(plane);
  return { point: toRenderPoint({ renderFrame, point: validPlane.pointMeters }), normal: validPlane.normal };
};

/**
 * Converts a render-local plane into physical coordinates while preserving incidence.
 *
 * @param options - Active render frame and render-local plane.
 * @returns Physical plane in metres.
 * @public
 */
export const fromRenderPlane = ({
  renderFrame,
  plane,
}: Readonly<{ renderFrame: RenderFrame; plane: RenderPlane }>): SpatialPlane => {
  const validPlane = validateRenderPlane(plane);
  return { pointMeters: fromRenderPoint({ renderFrame, point: validPlane.point }), normal: validPlane.normal };
};

/**
 * Selects a power-of-1000 render scale for a positive physical characteristic length.
 *
 * @param options - Positive finite characteristic length in metres.
 * @returns Metres represented by one render unit.
 * @public
 */
export const resolveMetersPerRenderUnit = ({
  characteristicLengthMeters,
}: Readonly<{ characteristicLengthMeters: number }>): number => {
  assertPositive(characteristicLengthMeters, 'characteristicLengthMeters');
  const exponent = 3 * Math.floor(Math.log10(characteristicLengthMeters) / 3);
  const selected = 10 ** exponent;
  return selected > 0 && Number.isFinite(selected) ? selected : characteristicLengthMeters;
};

/**
 * Decides whether a visible span has exited the safe render-unit hysteresis band.
 *
 * @param options - Render frame, physical visible span, and optional tested band.
 * @returns Whether the caller should select a new render scale.
 * @public
 */
export const shouldRescaleRenderFrame = ({
  renderFrame,
  visibleSpanMeters,
  minimumRenderSpan = defaultMinimumRenderSpan,
  maximumRenderSpan = defaultMaximumRenderSpan,
}: Readonly<{
  renderFrame: RenderFrame;
  visibleSpanMeters: number;
  minimumRenderSpan?: number;
  maximumRenderSpan?: number;
}>): boolean => {
  const validFrame = validateRenderFrame(renderFrame);
  assertPositive(visibleSpanMeters, 'visibleSpanMeters');
  assertPositive(minimumRenderSpan, 'minimumRenderSpan');
  assertPositive(maximumRenderSpan, 'maximumRenderSpan');
  if (maximumRenderSpan <= minimumRenderSpan) {
    throw new RangeError('maximumRenderSpan must be greater than minimumRenderSpan.');
  }
  const renderSpan = visibleSpanMeters / validFrame.metersPerRenderUnit;
  return renderSpan < minimumRenderSpan || renderSpan > maximumRenderSpan;
};

/**
 * Decides whether a physical focus is too far from the current render origin.
 *
 * @param options - Render frame, physical focus, and optional render-unit threshold.
 * @returns Whether the caller should rebase near the focus.
 * @public
 */
export const shouldRebaseRenderFrame = ({
  renderFrame,
  targetMeters,
  maximumOriginDistanceRenderUnits = defaultMaximumOriginDistance,
}: Readonly<{
  renderFrame: RenderFrame;
  targetMeters: SpatialVector;
  maximumOriginDistanceRenderUnits?: number;
}>): boolean => {
  const validFrame = validateRenderFrame(renderFrame);
  const target = validateVector(targetMeters, 'targetMeters');
  assertPositive(maximumOriginDistanceRenderUnits, 'maximumOriginDistanceRenderUnits');
  return (
    Math.hypot(...subtract(target, validFrame.originMeters)) / validFrame.metersPerRenderUnit >
    maximumOriginDistanceRenderUnits
  );
};
