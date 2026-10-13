import { agentLane, assemblyStep, assemblySteps, explodeLift, partPose } from '@taucad/planetary-gearbox';

/** Chapter ids, in reading order. Copy lives in content.mjs; this module owns motion only. */
export const chapterIds = /** @type {const} */ ([
  'idea',
  'prompt',
  'agents',
  'formation',
  'assembly',
  'parameter',
  'verification',
  'print',
  'devices',
]);

/** @type {(value: number, min?: number, max?: number) => number} */
export const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
/** @type {(value: number) => number} */
export const ease = (value) => {
  const t = clamp(value);
  return t * t * (3 - 2 * t);
};
/** @type {(from: number, to: number, progress: number) => number} */
const blend = (from, to, progress) => from + (to - from) * progress;

/** Height the camera looks at while the exploded stack is in view. */
const stackCentre = 85;

/** @typedef {{x: number, y: number, z: number, rotation: number, scale: number, solid: number, cloud: number}} PartState */
/** @typedef {{chapter: number, sunAngle: number, variant: number, print: number, plate: number, device: number, distance: number, elevation: number, azimuth: number, targetY: number, layer: number}} FrameState */

/** Camera distance keyframes [progress, millimetres]: wide for agent lanes and the print bed. */
const distanceKeys = [
  [0, 900],
  [2, 1060],
  [3.7, 1060],
  [4.3, 1000],
  [4.65, 560],
  [5, 470],
  [7, 470],
  [7.35, 600],
  [7.9, 600],
  [8.2, 600],
];
/** Camera azimuth keyframes [progress, radians]: square to the agent lanes, then three-quarter. */
const azimuthKeys = [
  [0, -0.1],
  [3.8, -0.1],
  [4.5, -0.5],
  [7, -0.3],
  [8.2, -0.45],
];
/** @type {(keys: number[][], p: number) => number} */
const track = (keys, p) => {
  for (let i = 1; i < keys.length; i++) {
    const [p0 = 0, v0 = 0] = keys[i - 1] ?? [];
    const [p1 = 0, v1 = 0] = keys[i] ?? [];
    if (p <= p1) {
      return blend(v0, v1, ease((p - p0) / Math.max(1e-6, p1 - p0)));
    }
  }
  return keys.at(-1)?.[1] ?? 0;
};

/**
 * Global scene state for scroll progress through the nine chapters.
 * @param p - Continuous chapter progress in [0, 9).
 * @returns Camera, kinematic and workflow values.
 * @type {(p: number) => FrameState}
 */
export const storyFrame = (p) => {
  const chapter = Math.min(chapterIds.length - 1, Math.max(0, Math.floor(p)));
  const turn = ease((p - 4.62) / 0.38);
  // Chapter 6: the authored parameter case, faceWidth 14 → 18 with inputAngle 0 → 30°.
  const variant = ease((p - 5.15) / 0.6);
  const sunAngle = turn * Math.PI * 2 + variant * (Math.PI / 6);
  const print = ease((p - 7.05) / 0.35) * (1 - ease((p - 7.85) / 0.15));
  const device = ease((p - 8.05) / 0.4);
  const layer = ease((p - 7.35) / 0.5);
  // The camera drops lower while the exploded stack is in view, so it reads as a column,
  // and holds the whole stack until the front screws seat, then closes in.
  const stack = ease((p - 3.4) / 0.4) * (1 - ease((p - 4.3) / 0.35));
  const assembled = ease((p - 4.3) / 0.35);
  return {
    chapter,
    sunAngle,
    variant,
    print,
    plate: print,
    device,
    layer,
    distance: track(distanceKeys, p),
    elevation: blend(blend(0.62 - 0.15 * stack, 0.95, ease((p - 5.6) / 0.6)), 0.5, print),
    azimuth: track(azimuthKeys, p),
    targetY: blend(blend(stackCentre, 14 * (1 - ease((p - 4.4) / 0.4)) + 4, assembled), 46, print),
  };
};

/**
 * Per-part state. Agents create parts in three lanes as point clouds, the geometry forms,
 * then the parts assemble in order, morph to the wider face, and the ring is prepared for print.
 * @param part - Authored part name and stable index (the index only staggers timing).
 * @param p - Continuous chapter progress.
 * @param frame - Shared frame state from {@link storyFrame}.
 * @returns Rigid placement plus visibility weights.
 * @type {(part: {name: string, index: number}, p: number, frame: FrameState) => PartState}
 */
export const storyPart = ({ name, index }, p, frame) => {
  const pose = partPose(name, frame.sunAngle);
  const lane = agentLane(name);
  const step = assemblyStep(name);
  const born = ease((p - 2.05 - (index % 12) * 0.045) / 0.35);
  const solid = ease((p - 3.05 - (index % 9) * 0.06) / 0.4);
  // Parts gather over the build point at their exploded heights, then seat one step at a time.
  const gather = ease((p - 3.55) / 0.4);
  const seat = ease(((p - 4) / 0.6) * assemblySteps - step);
  const lanes = 1 - gather;
  const ring = name.startsWith('Internal Ring');
  const away = ring ? 0 : frame.print;
  return {
    x: pose.x + (lane * 150 + 12) * lanes,
    y: pose.y + ((index % 3) - 1) * 10 * lanes,
    z: explodeLift(name) * (1 - seat),
    rotation: pose.rotation,
    scale: blend(0.82, 1, born),
    solid: solid * (1 - away),
    cloud: (born * (1 - solid) + away * (1 - ease(frame.layer * 4))) * (1 - frame.device),
  };
};
