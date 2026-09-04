const maximumPerspectiveVerticalFieldOfView = 179;

/** A renderer-neutral three-dimensional vector. @public */
export type CameraVector = readonly [number, number, number];

/** Axis-aligned world bounds used for framing and clip planes. @public */
export type CameraBounds = Readonly<{
  min: CameraVector;
  max: CameraVector;
}>;

/** Physical viewport inputs used by camera projection calculations. @public */
export type CameraViewport = Readonly<{
  width: number;
  height: number;
  pixelRatio: number;
}>;

/** Native endpoint projection kind. @public */
export type CameraProjectionKind = 'orthographic' | 'perspective';

/** Renderer-neutral native endpoint projection. @public */
export type CameraProjection =
  | Readonly<{ kind: 'orthographic' }>
  | Readonly<{ kind: 'perspective'; verticalFieldOfView: number }>;

/** Projection values needed to reproduce a camera outside its source renderer. @public */
export type CameraStateProjection =
  | Readonly<{ kind: 'perspective'; verticalFieldOfView: number; zoom: number }>
  | Readonly<{ kind: 'orthographic'; verticalSpan: number; zoom: number }>;

/** Complete serializable camera state for renderer and RPC boundaries. @public */
export type CameraState = Readonly<{
  frameId: string;
  position: CameraVector;
  target: CameraVector;
  up: CameraVector;
  projection: CameraStateProjection;
  clipping: CameraClipPlanes;
  aspect: number;
}>;

/** Input for {@link createCameraState}. @public */
export type CameraStateOptions = CameraState;

/** Canonical renderer-neutral camera view. @public */
export type CameraView = Readonly<{
  frameId: string;
  requestedVerticalFieldOfView: number;
  perspectiveZoom: number;
  target: CameraVector;
  direction: CameraVector;
  up: CameraVector;
  verticalSpan: number;
  viewport: CameraViewport;
  bounds: CameraBounds;
}>;

/** Input for {@link createCameraView}. @public */
export type CameraViewOptions = CameraView;

/** Orthographic frustum matching a canonical vertical span. @public */
export type CameraFrustum = Readonly<{
  left: number;
  right: number;
  top: number;
  bottom: number;
}>;

/** Bounds-derived native camera clip planes. @public */
export type CameraClipPlanes = Readonly<{
  near: number;
  far: number;
}>;

/** Fully resolved renderer-neutral native camera frame. @public */
export type CameraFrame = Readonly<{
  projection: CameraProjection;
  zoom: number;
  distance: number;
  clipping: CameraClipPlanes;
  frustum?: CameraFrustum;
}>;

/** Options for calculating the perspective-to-orthographic handoff. @public */
export type CameraHandoffOptions = Readonly<{
  view: CameraView;
  maximumVerticalFieldOfView: number;
  pixelBudget?: number;
  iterations?: number;
  verticalFieldOfViewTolerance?: number;
}>;

type MutableVector = [number, number, number];

const assertFinite = (value: number, label: string): number => {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${label} must be finite.`);
  }
  return value;
};

const assertPositive = (value: number, label: string): number => {
  assertFinite(value, label);
  if (value <= 0) {
    throw new RangeError(`${label} must be greater than zero.`);
  }
  return value;
};

const assertVerticalFieldOfView = (verticalFieldOfView: number): number => {
  assertFinite(verticalFieldOfView, 'verticalFieldOfView');
  if (verticalFieldOfView < 0 || verticalFieldOfView > maximumPerspectiveVerticalFieldOfView) {
    throw new RangeError(`verticalFieldOfView must be between 0 and ${maximumPerspectiveVerticalFieldOfView} degrees.`);
  }
  return verticalFieldOfView;
};

const vector = (value: CameraVector, label: string): MutableVector => [
  assertFinite(value[0], `${label}[0]`),
  assertFinite(value[1], `${label}[1]`),
  assertFinite(value[2], `${label}[2]`),
];

const subtract = (left: CameraVector, right: CameraVector): MutableVector => [
  left[0] - right[0],
  left[1] - right[1],
  left[2] - right[2],
];

const dot = (left: CameraVector, right: CameraVector): number =>
  left[0] * right[0] + left[1] * right[1] + left[2] * right[2];

const cross = (left: CameraVector, right: CameraVector): MutableVector => [
  left[1] * right[2] - left[2] * right[1],
  left[2] * right[0] - left[0] * right[2],
  left[0] * right[1] - left[1] * right[0],
];

const magnitude = (value: CameraVector): number => Math.hypot(value[0], value[1], value[2]);

const normalize = (value: CameraVector, label: string): MutableVector => {
  const length = magnitude(value);
  if (length === 0 || !Number.isFinite(length)) {
    throw new RangeError(`${label} must have non-zero length.`);
  }
  return [value[0] / length, value[1] / length, value[2] / length];
};

const cameraBasis = (view: Pick<CameraView, 'direction' | 'up'>) => {
  const direction = normalize(view.direction, 'direction');
  const right = normalize(cross(view.up, direction), 'direction and up cross product');
  const up = normalize(cross(direction, right), 'camera up');
  return { direction, right, up };
};

const boundsCorners = (bounds: CameraBounds): CameraVector[] => {
  const [minimumX, minimumY, minimumZ] = bounds.min;
  const [maximumX, maximumY, maximumZ] = bounds.max;
  return [
    [minimumX, minimumY, minimumZ],
    [maximumX, minimumY, minimumZ],
    [minimumX, maximumY, minimumZ],
    [maximumX, maximumY, minimumZ],
    [minimumX, minimumY, maximumZ],
    [maximumX, minimumY, maximumZ],
    [minimumX, maximumY, maximumZ],
    [maximumX, maximumY, maximumZ],
  ];
};

const validateBounds = (bounds: CameraBounds): CameraBounds => {
  const min = vector(bounds.min, 'bounds.min');
  const max = vector(bounds.max, 'bounds.max');
  for (const index of [0, 1, 2] as const) {
    if (min[index] > max[index]) {
      throw new RangeError(`bounds.min[${index}] must not exceed bounds.max[${index}].`);
    }
  }
  return { min, max };
};

const boundsCenter = (bounds: CameraBounds): MutableVector => [
  (bounds.min[0] + bounds.max[0]) / 2,
  (bounds.min[1] + bounds.max[1]) / 2,
  (bounds.min[2] + bounds.max[2]) / 2,
];

const boundsDiagonal = (bounds: CameraBounds): number => magnitude(subtract(bounds.max, bounds.min));

/**
 * Creates and validates a canonical camera view.
 *
 * @param options - Serializable camera values.
 * @returns A normalized immutable-compatible view value.
 * @public
 */
export const createCameraView = (options: CameraViewOptions): CameraView => {
  if (options.frameId.length === 0) {
    throw new RangeError('frameId must not be empty.');
  }
  const direction = normalize(vector(options.direction, 'direction'), 'direction');
  const up = normalize(vector(options.up, 'up'), 'up');
  cameraBasis({ direction, up });
  return {
    frameId: options.frameId,
    requestedVerticalFieldOfView: assertVerticalFieldOfView(options.requestedVerticalFieldOfView),
    perspectiveZoom: assertPositive(options.perspectiveZoom, 'perspectiveZoom'),
    target: vector(options.target, 'target'),
    direction,
    up,
    verticalSpan: assertPositive(options.verticalSpan, 'verticalSpan'),
    viewport: {
      width: assertPositive(options.viewport.width, 'viewport.width'),
      height: assertPositive(options.viewport.height, 'viewport.height'),
      pixelRatio: assertPositive(options.viewport.pixelRatio, 'viewport.pixelRatio'),
    },
    bounds: validateBounds(options.bounds),
  };
};

/**
 * Validates and copies a complete serializable camera state.
 *
 * @param options - Renderer-neutral camera values.
 * @returns A camera state safe to retain across asynchronous work.
 * @public
 */
export const createCameraState = (options: CameraStateOptions): CameraState => {
  if (options.frameId.length === 0) {
    throw new RangeError('frameId must not be empty.');
  }
  const position = vector(options.position, 'position');
  const target = vector(options.target, 'target');
  const up = normalize(vector(options.up, 'up'), 'up');
  cameraBasis({ direction: subtract(position, target), up });
  const zoom = assertPositive(options.projection.zoom, 'projection.zoom');
  const projection: CameraStateProjection =
    options.projection.kind === 'perspective'
      ? {
          kind: 'perspective',
          verticalFieldOfView: assertPositive(
            assertVerticalFieldOfView(options.projection.verticalFieldOfView),
            'projection.verticalFieldOfView',
          ),
          zoom,
        }
      : {
          kind: 'orthographic',
          verticalSpan: assertPositive(options.projection.verticalSpan, 'projection.verticalSpan'),
          zoom,
        };
  const near = assertPositive(options.clipping.near, 'clipping.near');
  const far = assertPositive(options.clipping.far, 'clipping.far');
  if (far <= near) {
    throw new RangeError('clipping.far must be greater than clipping.near.');
  }
  return {
    frameId: options.frameId,
    position,
    target,
    up,
    projection,
    clipping: { near, far },
    aspect: assertPositive(options.aspect, 'aspect'),
  };
};

/**
 * Resolves the exact endpoint projection for a field of view.
 *
 * @param verticalFieldOfView - Field of view in degrees; zero is orthographic.
 * @returns A native endpoint projection discriminant.
 * @public
 */
export const cameraProjectionForVerticalFieldOfView = (verticalFieldOfView: number): CameraProjection => {
  const validated = assertVerticalFieldOfView(verticalFieldOfView);
  return validated === 0 ? { kind: 'orthographic' } : { kind: 'perspective', verticalFieldOfView: validated };
};

/**
 * Converts a perspective camera distance into its target-plane vertical span.
 *
 * @param options - Distance, field of view in degrees, and optional zoom.
 * @returns Target-plane vertical span.
 * @public
 */
export const perspectiveVerticalSpan = ({
  distance,
  verticalFieldOfView,
  zoom = 1,
}: {
  distance: number;
  verticalFieldOfView: number;
  zoom?: number;
}): number => {
  assertPositive(distance, 'distance');
  assertPositive(verticalFieldOfView, 'verticalFieldOfView');
  assertVerticalFieldOfView(verticalFieldOfView);
  assertPositive(zoom, 'zoom');
  return (2 * distance * Math.tan((verticalFieldOfView * Math.PI) / 360)) / zoom;
};

/**
 * Converts a target-plane vertical span into perspective camera distance.
 *
 * @param options - Vertical span, field of view in degrees, and optional zoom.
 * @returns Camera distance from the target.
 * @public
 */
export const perspectiveDistanceForVerticalSpan = ({
  verticalSpan,
  verticalFieldOfView,
  zoom = 1,
}: {
  verticalSpan: number;
  verticalFieldOfView: number;
  zoom?: number;
}): number => {
  assertPositive(verticalSpan, 'verticalSpan');
  assertPositive(verticalFieldOfView, 'verticalFieldOfView');
  assertVerticalFieldOfView(verticalFieldOfView);
  assertPositive(zoom, 'zoom');
  return (verticalSpan * zoom) / (2 * Math.tan((verticalFieldOfView * Math.PI) / 360));
};

/**
 * Creates an orthographic frustum matching a canonical vertical span.
 *
 * @param options - Vertical span and viewport aspect.
 * @returns Symmetric orthographic frustum planes.
 * @public
 */
export const orthographicFrustumForVerticalSpan = ({
  verticalSpan,
  aspect,
}: {
  verticalSpan: number;
  aspect: number;
}): CameraFrustum => {
  assertPositive(verticalSpan, 'verticalSpan');
  assertPositive(aspect, 'aspect');
  const halfHeight = verticalSpan / 2;
  const halfWidth = halfHeight * aspect;
  return { left: -halfWidth, right: halfWidth, top: halfHeight, bottom: -halfHeight };
};

/**
 * Resolves a finite orthographic camera distance that keeps the bounds in front.
 *
 * @param options - Canonical view values.
 * @returns Distance from target along the camera direction.
 * @public
 */
export const orthographicCameraDistance = ({
  bounds,
  target,
  direction,
  verticalSpan,
}: Pick<CameraView, 'bounds' | 'direction' | 'target' | 'verticalSpan'>): number => {
  const validBounds = validateBounds(bounds);
  const validTarget = vector(target, 'target');
  const validDirection = normalize(direction, 'direction');
  assertPositive(verticalSpan, 'verticalSpan');
  const diagonal = boundsDiagonal(validBounds);
  const foregroundExtent = Math.max(
    ...boundsCorners(validBounds).map((corner) => dot(subtract(corner, validTarget), validDirection)),
  );
  return foregroundExtent + Math.max(diagonal, verticalSpan);
};

/**
 * Derives tight positive clip planes from camera-relative bounds depths.
 *
 * @param options - Bounds, target, camera direction, and camera distance.
 * @returns Positive near and far clip planes.
 * @public
 */
export const clipPlanesForCameraBounds = ({
  bounds,
  target,
  direction,
  distance,
}: Pick<CameraView, 'bounds' | 'direction' | 'target'> & { distance: number }): CameraClipPlanes => {
  const validBounds = validateBounds(bounds);
  const validTarget = vector(target, 'target');
  const validDirection = normalize(direction, 'direction');
  assertPositive(distance, 'distance');
  const depths = boundsCorners(validBounds).map(
    (corner) => distance - dot(subtract(corner, validTarget), validDirection),
  );
  const diagonal = boundsDiagonal(validBounds);
  const margin = Math.max(diagonal * 0.05, distance * 1e-6);
  const minimumNear = Math.max(distance * 1e-9, Number.MIN_VALUE);
  const near = Math.max(Math.min(...depths) - margin, minimumNear);
  const minimumDepthRange = Math.max(diagonal, distance) * 1e-9;
  return { near, far: Math.max(Math.max(...depths) + margin, near + minimumDepthRange) };
};

/**
 * Resolves native endpoint distance, projection, frustum, and clip planes.
 *
 * @param options - Canonical view and optional effective field-of-view override.
 * @returns A native endpoint frame.
 * @public
 */
export const resolveCameraFrame = ({
  view,
  verticalFieldOfView = view.requestedVerticalFieldOfView,
}: {
  view: CameraView;
  verticalFieldOfView?: number;
}): CameraFrame => {
  const validView = createCameraView(view);
  const projection = cameraProjectionForVerticalFieldOfView(verticalFieldOfView);
  const aspect = validView.viewport.width / validView.viewport.height;
  const distance =
    projection.kind === 'perspective'
      ? perspectiveDistanceForVerticalSpan({
          verticalSpan: validView.verticalSpan,
          verticalFieldOfView: projection.verticalFieldOfView,
          zoom: validView.perspectiveZoom,
        })
      : orthographicCameraDistance(validView);
  return {
    projection,
    zoom: projection.kind === 'perspective' ? validView.perspectiveZoom : 1,
    distance,
    clipping: clipPlanesForCameraBounds({ ...validView, distance }),
    ...(projection.kind === 'orthographic'
      ? { frustum: orthographicFrustumForVerticalSpan({ verticalSpan: validView.verticalSpan, aspect }) }
      : {}),
  };
};

/**
 * Resolves a canonical view to complete renderer-neutral camera state.
 *
 * @param options - Canonical view and optional effective field-of-view override.
 * @returns A serializable native endpoint camera state.
 * @public
 */
export const resolveCameraState = ({
  view,
  verticalFieldOfView = view.requestedVerticalFieldOfView,
}: {
  view: CameraView;
  verticalFieldOfView?: number;
}): CameraState => {
  const validView = createCameraView(view);
  const frame = resolveCameraFrame({ view: validView, verticalFieldOfView });
  const position: CameraVector = [
    validView.target[0] + validView.direction[0] * frame.distance,
    validView.target[1] + validView.direction[1] * frame.distance,
    validView.target[2] + validView.direction[2] * frame.distance,
  ];
  return createCameraState({
    frameId: validView.frameId,
    position,
    target: validView.target,
    up: validView.up,
    projection:
      frame.projection.kind === 'perspective'
        ? {
            kind: 'perspective',
            verticalFieldOfView: frame.projection.verticalFieldOfView,
            zoom: frame.zoom,
          }
        : { kind: 'orthographic', verticalSpan: validView.verticalSpan, zoom: frame.zoom },
    clipping: frame.clipping,
    aspect: validView.viewport.width / validView.viewport.height,
  });
};

/**
 * Reframes canonical camera state around new bounds.
 *
 * @param options - Current view, new bounds, and fractional margin.
 * @returns A validated view centered and fitted to the bounds.
 * @public
 */
export const frameCameraBounds = ({
  view,
  bounds,
  margin = 0.1,
}: {
  view: CameraView;
  bounds: CameraBounds;
  margin?: number;
}): CameraView => {
  const validView = createCameraView(view);
  const validBounds = validateBounds(bounds);
  assertFinite(margin, 'margin');
  if (margin < 0 || margin > 0.5) {
    throw new RangeError('margin must be between 0 and 0.5.');
  }
  const aspect = validView.viewport.width / validView.viewport.height;
  const padding = Math.max(1 - margin, 0.001);
  const target = boundsCenter(validBounds);
  const { direction, right, up } = cameraBasis(validView);
  const corners = boundsCorners(validBounds);

  if (validView.requestedVerticalFieldOfView === 0) {
    let halfWidth = Math.max(
      ...corners.map((corner) => Math.abs(dot(subtract(corner, target), right))),
      validView.verticalSpan * 1e-9,
    );
    let halfHeight = Math.max(
      ...corners.map((corner) => Math.abs(dot(subtract(corner, target), up))),
      validView.verticalSpan * 1e-9,
    );
    halfWidth /= padding;
    halfHeight /= padding;
    if (halfWidth / halfHeight < aspect) {
      halfWidth = halfHeight * aspect;
    } else {
      halfHeight = halfWidth / aspect;
    }
    return createCameraView({ ...validView, bounds: validBounds, target, verticalSpan: 2 * halfHeight });
  }

  const fieldOfViewRadians = (validView.requestedVerticalFieldOfView * Math.PI) / 180;
  const radius = Math.max(boundsDiagonal(validBounds) / 2, validView.verticalSpan * 1e-9);
  const modelDistance = radius * 2 * (Math.tan(Math.PI / 6) / Math.tan(fieldOfViewRadians / 2));
  const verticalTangent = Math.tan(fieldOfViewRadians / 2) * padding;
  const horizontalTangent = verticalTangent * aspect;
  let fittedDistance = radius * 0.001;
  for (const corner of corners) {
    const offset = subtract(corner, target);
    const axial = dot(offset, direction);
    fittedDistance = Math.max(
      fittedDistance,
      axial + Math.abs(dot(offset, right)) / horizontalTangent,
      axial + Math.abs(dot(offset, up)) / verticalTangent,
      axial + radius * 0.001,
    );
  }
  const distance = Math.max(modelDistance, fittedDistance);
  const eye: CameraVector = [
    target[0] + direction[0] * distance,
    target[1] + direction[1] * distance,
    target[2] + direction[2] * distance,
  ];
  let maximumRightTangent = 0;
  let maximumUpTangent = 0;
  for (const corner of corners) {
    const offset = subtract(corner, eye);
    const depth = -dot(offset, direction);
    maximumRightTangent = Math.max(maximumRightTangent, Math.abs(dot(offset, right) / depth));
    maximumUpTangent = Math.max(maximumUpTangent, Math.abs(dot(offset, up) / depth));
  }
  const tangent = Math.tan(fieldOfViewRadians / 2);
  const verticalZoom = maximumUpTangent === 0 ? Number.POSITIVE_INFINITY : tangent / maximumUpTangent;
  const horizontalZoom =
    maximumRightTangent === 0 ? Number.POSITIVE_INFINITY : (aspect * tangent) / maximumRightTangent;
  const perspectiveZoom =
    maximumRightTangent === 0 && maximumUpTangent === 0 ? 1 : Math.min(verticalZoom, horizontalZoom) * padding;
  return createCameraView({
    ...validView,
    bounds: validBounds,
    target,
    perspectiveZoom,
    verticalSpan: perspectiveVerticalSpan({
      distance,
      verticalFieldOfView: validView.requestedVerticalFieldOfView,
      zoom: perspectiveZoom,
    }),
  });
};

const projectPoint = ({
  point,
  view,
  perspectiveVerticalFieldOfView,
}: {
  point: CameraVector;
  view: CameraView;
  perspectiveVerticalFieldOfView: number | undefined;
}): readonly [number, number] => {
  const { direction, right, up } = cameraBasis(view);
  const relative = subtract(point, view.target);
  const horizontal = dot(relative, right);
  const vertical = dot(relative, up);
  const aspect = view.viewport.width / view.viewport.height;
  if (perspectiveVerticalFieldOfView === undefined) {
    return [(2 * horizontal) / (view.verticalSpan * aspect), (2 * vertical) / view.verticalSpan];
  }
  const distance = perspectiveDistanceForVerticalSpan({
    verticalSpan: view.verticalSpan,
    verticalFieldOfView: perspectiveVerticalFieldOfView,
    zoom: view.perspectiveZoom,
  });
  const depth = distance - dot(relative, direction);
  if (depth <= 0) {
    return [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
  }
  const targetScale = distance / depth;
  return [
    ((2 * horizontal) / (view.verticalSpan * aspect)) * targetScale,
    ((2 * vertical) / view.verticalSpan) * targetScale,
  ];
};

/**
 * Measures the maximum perspective-versus-orthographic bounds-corner displacement.
 *
 * @param options - Canonical view and positive perspective field of view in degrees.
 * @returns Maximum physical-pixel displacement.
 * @public
 */
export const maximumProjectedPixelDelta = ({
  view,
  perspectiveVerticalFieldOfView,
}: {
  view: CameraView;
  perspectiveVerticalFieldOfView: number;
}): number => {
  const validView = createCameraView(view);
  assertPositive(perspectiveVerticalFieldOfView, 'perspectiveVerticalFieldOfView');
  assertVerticalFieldOfView(perspectiveVerticalFieldOfView);
  let maximumDelta = 0;
  for (const corner of boundsCorners(validView.bounds)) {
    const perspective = projectPoint({ point: corner, view: validView, perspectiveVerticalFieldOfView });
    const orthographic = projectPoint({ point: corner, view: validView, perspectiveVerticalFieldOfView: undefined });
    const horizontal =
      ((perspective[0] - orthographic[0]) * validView.viewport.width * validView.viewport.pixelRatio) / 2;
    const vertical =
      ((perspective[1] - orthographic[1]) * validView.viewport.height * validView.viewport.pixelRatio) / 2;
    maximumDelta = Math.max(maximumDelta, Math.hypot(horizontal, vertical));
  }
  return maximumDelta;
};

/**
 * Finds the largest positive perspective FOV within a physical-pixel endpoint budget.
 *
 * @param options - Canonical view, search bound, error budget, and bounded search controls.
 * @returns A positive perspective field of view in degrees.
 * @public
 */
export const findPerspectiveHandoffVerticalFieldOfView = ({
  view,
  maximumVerticalFieldOfView,
  pixelBudget = 0.25,
  iterations = 64,
  verticalFieldOfViewTolerance = 1e-9,
}: CameraHandoffOptions): number => {
  const validView = createCameraView(view);
  assertPositive(maximumVerticalFieldOfView, 'maximumVerticalFieldOfView');
  assertVerticalFieldOfView(maximumVerticalFieldOfView);
  assertPositive(pixelBudget, 'pixelBudget');
  assertPositive(iterations, 'iterations');
  assertPositive(verticalFieldOfViewTolerance, 'verticalFieldOfViewTolerance');
  if (!Number.isInteger(iterations)) {
    throw new RangeError('iterations must be an integer.');
  }

  if (
    maximumProjectedPixelDelta({ view: validView, perspectiveVerticalFieldOfView: maximumVerticalFieldOfView }) <=
    pixelBudget
  ) {
    return maximumVerticalFieldOfView;
  }

  let lower = 0;
  let upper = maximumVerticalFieldOfView;
  for (let iteration = 0; iteration < iterations && upper - lower > verticalFieldOfViewTolerance; iteration += 1) {
    const candidate = (lower + upper) / 2;
    if (maximumProjectedPixelDelta({ view: validView, perspectiveVerticalFieldOfView: candidate }) <= pixelBudget) {
      lower = candidate;
    } else {
      upper = candidate;
    }
  }
  if (lower <= 0) {
    throw new RangeError('The requested pixel budget is below numeric projection precision.');
  }
  return lower;
};
