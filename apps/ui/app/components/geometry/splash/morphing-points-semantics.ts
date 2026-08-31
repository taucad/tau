import { Vector3 } from 'three';

const noise = (value: number): number =>
  Math.sin(value) * 0.5 + Math.sin(value * 2.3) * 0.3 + Math.sin(value * 5.7) * 0.2;
const ease = (value: number): number => value * value * (3 - 2 * value);
const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/** CPU oracle for the position curve shared by the GLSL and TSL morph shaders. */
export const resolveMorphingPointPosition = ({
  explosionStrength,
  pointer,
  progress,
  randomOffset,
  source,
  target,
  time,
}: {
  readonly explosionStrength: number;
  readonly pointer?: Readonly<{ position: Vector3; radius: number; strength: number }>;
  readonly progress: number;
  readonly randomOffset: number;
  readonly source: Vector3;
  readonly target: Vector3;
  readonly time: number;
}): Vector3 => {
  const midpoint = source.clone().lerp(target, 0.5);
  midpoint.add(
    source
      .clone()
      .normalize()
      .multiplyScalar(Math.sin(progress * Math.PI) * explosionStrength),
  );

  const transitionIntensity = clamp01(1 - Math.abs(progress - 0.5) * 2);
  midpoint.add(
    new Vector3(
      noise(randomOffset * 10 + time * 0.5),
      noise(randomOffset * 15 + time * 0.7 + 1),
      noise(randomOffset * 20 + time * 0.6 + 2),
    ).multiplyScalar(transitionIntensity * 0.5),
  );

  const position =
    progress < 0.5
      ? source.clone().lerp(midpoint, ease(clamp01(progress * 2)))
      : midpoint.clone().lerp(target, ease(clamp01((progress - 0.5) * 2)));

  if (!pointer || pointer.strength === 0 || pointer.radius <= 0) {
    return position;
  }
  const direction = position.clone().sub(pointer.position);
  const distance = direction.length();
  direction.divideScalar(distance + 0.0001);
  const normalizedDistance = distance / pointer.radius;
  const falloff = Math.exp(-3 * normalizedDistance * normalizedDistance);
  const wobble = 0.75 + 0.25 * noise(randomOffset * 40 + time * 3);
  const curl = direction.clone().cross(new Vector3(0, 0, 1));
  return position.add(direction.add(curl.multiplyScalar(0.4)).multiplyScalar(falloff * wobble * pointer.strength));
};

/** CSS-pixel diameter used by both sprite paths. */
export const resolveMorphingPointCssSize = ({
  camera,
  pointSize,
  progress,
  randomOffset,
}: {
  readonly camera: Readonly<{ perspectiveDepth?: number; viewportHeight: number }>;
  readonly pointSize: number;
  readonly progress: number;
  readonly randomOffset: number;
}): number => {
  const pulse = 1 - Math.abs(progress - 0.5) * 2;
  const base = pointSize * (1 + pulse * 0.3) * (0.9 + randomOffset * 0.2);
  return camera.perspectiveDepth === undefined
    ? base
    : (base * (camera.viewportHeight * 0.5)) / camera.perspectiveDepth;
};
