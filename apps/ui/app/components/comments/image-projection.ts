import type { AnnotationCamera, AnnotationVec2, AnnotationVec3 } from '@taucad/chat/annotations';

/*
 * Where a point of the model lands in a picture taken with a kept camera. App-local on purpose: `@taucad/camera` owns
 * live cameras and their framing, while this reads one frozen `CameraState` the way the image renderer drew it
 * (`toNanorasterCamera`): the effective field of view is the stated one narrowed by `zoom`, and an orthographic span is
 * divided by it.
 */

const subtract = (a: AnnotationVec3, b: AnnotationVec3): AnnotationVec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: AnnotationVec3, b: AnnotationVec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: AnnotationVec3, b: AnnotationVec3): AnnotationVec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const normalize = (vector: AnnotationVec3): AnnotationVec3 => {
  const length = Math.hypot(vector[0], vector[1], vector[2]);
  return length === 0 ? [0, 0, 0] : [vector[0] / length, vector[1] / length, vector[2] / length];
};

const basisOf = (camera: AnnotationCamera): { forward: AnnotationVec3; right: AnnotationVec3; up: AnnotationVec3 } => {
  const forward = normalize(subtract(camera.target, camera.position));
  const right = normalize(cross(forward, camera.up));
  return { forward, right, up: cross(right, forward) };
};

/** A point's place in a picture: fractions from the top left, and its distance along the view direction. */
export type ImagePoint = { at: AnnotationVec2; depth: number };

/**
 * Where a Tau root point lands in the picture a camera took.
 *
 * @param camera - The camera the picture was taken with.
 * @param point - The point, in metres in the Tau root frame.
 * @returns Its place as fractions from the picture's top left (outside 0 to 1 when out of frame), or `undefined` for a
 * point at or behind a perspective camera.
 */
export function projectToImage(camera: AnnotationCamera, point: AnnotationVec3): ImagePoint | undefined {
  const { forward, right, up } = basisOf(camera);
  const relative = subtract(point, camera.position);
  const depth = dot(relative, forward);
  const { projection } = camera;
  if (projection.kind === 'perspective' && depth <= 0) {
    return undefined;
  }
  const halfHeight =
    projection.kind === 'perspective'
      ? (depth * Math.tan((projection.verticalFieldOfView * Math.PI) / 360)) / projection.zoom
      : projection.verticalSpan / projection.zoom / 2;
  const x = dot(relative, right) / (halfHeight * camera.aspect);
  const y = dot(relative, up) / halfHeight;
  return { at: [(x + 1) / 2, (1 - y) / 2], depth };
}

/**
 * The angle between two cameras' view directions.
 *
 * @param a - One camera.
 * @param b - The other.
 * @returns The angle in degrees.
 */
export function angleBetweenViews(a: AnnotationCamera, b: AnnotationCamera): number {
  const cosine = dot(basisOf(a).forward, basisOf(b).forward);
  return (Math.acos(Math.min(1, Math.max(-1, cosine))) * 180) / Math.PI;
}

/**
 * Whether two cameras draw the same picture: every value equal within what a float survives a JSON round trip.
 *
 * @param a - One camera.
 * @param b - The other.
 * @returns `true` when a picture taken with one is the picture of the other.
 */
export function isSameCamera(a: AnnotationCamera, b: AnnotationCamera): boolean {
  const near = (x: number, y: number): boolean => Math.abs(x - y) <= 1e-9 * Math.max(1, Math.abs(x), Math.abs(y));
  const sameVector = (x: AnnotationVec3, y: AnnotationVec3): boolean =>
    x.every((value, index) => near(value, y[index]!));
  const sameProjection =
    a.projection.kind === 'perspective'
      ? b.projection.kind === 'perspective' &&
        near(a.projection.verticalFieldOfView, b.projection.verticalFieldOfView) &&
        near(a.projection.zoom, b.projection.zoom)
      : b.projection.kind === 'orthographic' &&
        near(a.projection.verticalSpan, b.projection.verticalSpan) &&
        near(a.projection.zoom, b.projection.zoom);
  return (
    a.frameId === b.frameId &&
    sameProjection &&
    near(a.aspect, b.aspect) &&
    sameVector(a.position, b.position) &&
    sameVector(a.target, b.target) &&
    sameVector(a.up, b.up)
  );
}

/** A ray in the Tau root frame: where it starts, in metres, and its unit direction. */
export type ImageRay = Readonly<{ origin: AnnotationVec3; direction: AnnotationVec3 }>;

/**
 * The ray a kept camera saw a point of its picture along: the inverse of {@link projectToImage}.
 *
 * @param camera - The camera the picture was taken with.
 * @param at - The point, as fractions from the picture's top left.
 * @returns The ray, in the Tau root frame.
 */
export function rayThroughImage(camera: AnnotationCamera, at: AnnotationVec2): ImageRay {
  const { forward, right, up } = basisOf(camera);
  const x = at[0] * 2 - 1;
  const y = 1 - at[1] * 2;
  const { projection } = camera;
  if (projection.kind === 'perspective') {
    const slope = Math.tan((projection.verticalFieldOfView * Math.PI) / 360) / projection.zoom;
    const along = (index: number): number =>
      forward[index]! + right[index]! * x * slope * camera.aspect + up[index]! * y * slope;
    return { origin: camera.position, direction: normalize([along(0), along(1), along(2)]) };
  }
  const halfHeight = projection.verticalSpan / projection.zoom / 2;
  const at3 = (index: number): number =>
    camera.position[index]! + right[index]! * x * halfHeight * camera.aspect + up[index]! * y * halfHeight;
  return { origin: [at3(0), at3(1), at3(2)], direction: forward };
}
