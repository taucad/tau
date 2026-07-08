/**
 * Placement frames for the v8-engine-rev2 assembly (spec Section 1.5).
 *
 * Every part is modeled in a part-local frame and installed by a Placement:
 * an ordered list of rigid ops (mirror about XZ, axis rotations,
 * translations). The SAME op list maps geometry (replicad transforms) and
 * interface probe points/directions (plain math), so finders authored in
 * local coordinates resolve against the placed shape.
 */
import type { AnyShape } from 'replicad';

export type Vec3 = [number, number, number];

type Op =
  | { kind: 'mirrorXZ' }
  | { kind: 'rotate'; axis: 'x' | 'y' | 'z'; degrees: number }
  | { kind: 'rotateAxis'; origin: Vec3; direction: Vec3; degrees: number }
  | { kind: 'translate'; by: Vec3 };

/** Rodrigues rotation of `p` about the axis through `origin` along `dir`. */
const rotateAboutAxis = (
  p: Vec3,
  origin: Vec3,
  direction: Vec3,
  degrees: number,
): Vec3 => {
  const r = (degrees * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  const norm = Math.hypot(direction[0], direction[1], direction[2]);
  const k: Vec3 = [
    direction[0] / norm,
    direction[1] / norm,
    direction[2] / norm,
  ];
  const v: Vec3 = [p[0] - origin[0], p[1] - origin[1], p[2] - origin[2]];
  const kv = k[0] * v[0] + k[1] * v[1] + k[2] * v[2];
  const cross: Vec3 = [
    k[1] * v[2] - k[2] * v[1],
    k[2] * v[0] - k[0] * v[2],
    k[0] * v[1] - k[1] * v[0],
  ];
  return [
    origin[0] + v[0] * c + cross[0] * s + k[0] * kv * (1 - c),
    origin[1] + v[1] * c + cross[1] * s + k[1] * kv * (1 - c),
    origin[2] + v[2] * c + cross[2] * s + k[2] * kv * (1 - c),
  ];
};

const rotatePoint = (p: Vec3, axis: 'x' | 'y' | 'z', degrees: number): Vec3 => {
  const r = (degrees * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  const [x, y, z] = p;
  switch (axis) {
    case 'x': {
      return [x, y * c - z * s, y * s + z * c];
    }
    case 'y': {
      return [x * c + z * s, y, -x * s + z * c];
    }
    default: {
      return [x * c - y * s, x * s + y * c, z];
    }
  }
};

const axisDir: Record<'x' | 'y' | 'z', Vec3> = {
  x: [1, 0, 0],
  y: [0, 1, 0],
  z: [0, 0, 1],
};

/** Rigid placement as an ordered op list (applied first-to-last). */
export type Placement = {
  /** Internal op list (exposed so `compose` can concatenate). */
  readonly opList: readonly Op[];
  /** True when the op list flips handedness (odd number of mirrors). */
  readonly mirrored: boolean;
  /** This placement, then `next` applied on top. */
  compose(next: Placement): Placement;
  rotate(axis: 'x' | 'y' | 'z', degrees: number): Placement;
  translate(x: number, y: number, z: number): Placement;
  rotateAxis(origin: Vec3, direction: Vec3, degrees: number): Placement;
  mirrorXZ(): Placement;
  /** Map a local point to world coordinates. */
  pt(local: Vec3): Vec3;
  /** Map a local direction to world coordinates (rotations/mirrors only). */
  dir(local: Vec3): Vec3;
  /** Apply the placement to a replicad shape (caller clones when reusing). */
  shape<T extends AnyShape>(input: T): T;
};

const makePlacement = (opList: readonly Op[]): Placement => ({
  opList,
  get mirrored(): boolean {
    return opList.filter((op) => op.kind === 'mirrorXZ').length % 2 === 1;
  },
  compose(next) {
    return makePlacement([...opList, ...next.opList]);
  },
  rotate(axis, degrees) {
    return makePlacement([...opList, { kind: 'rotate', axis, degrees }]);
  },
  translate(x, y, z) {
    return makePlacement([...opList, { kind: 'translate', by: [x, y, z] }]);
  },
  rotateAxis(origin, direction, degrees) {
    return makePlacement([
      ...opList,
      { kind: 'rotateAxis', origin, direction, degrees },
    ]);
  },
  mirrorXZ() {
    return makePlacement([...opList, { kind: 'mirrorXZ' }]);
  },
  pt(local) {
    let p: Vec3 = local;
    for (const op of opList) {
      switch (op.kind) {
        case 'mirrorXZ': {
          p = [p[0], -p[1], p[2]];
          break;
        }
        case 'rotate': {
          p = rotatePoint(p, op.axis, op.degrees);
          break;
        }
        case 'rotateAxis': {
          p = rotateAboutAxis(p, op.origin, op.direction, op.degrees);
          break;
        }
        case 'translate': {
          p = [p[0] + op.by[0], p[1] + op.by[1], p[2] + op.by[2]];
          break;
        }
      }
    }
    return p;
  },
  dir(local) {
    let v: Vec3 = local;
    for (const op of opList) {
      switch (op.kind) {
        case 'mirrorXZ': {
          v = [v[0], -v[1], v[2]];
          break;
        }
        case 'rotate': {
          v = rotatePoint(v, op.axis, op.degrees);
          break;
        }
        case 'rotateAxis': {
          v = rotateAboutAxis(v, [0, 0, 0], op.direction, op.degrees);
          break;
        }
        case 'translate': {
          break;
        }
      }
    }
    return v;
  },
  shape(input) {
    let out: AnyShape = input;
    for (const op of opList) {
      switch (op.kind) {
        case 'mirrorXZ': {
          out = out.mirror('XZ');
          break;
        }
        case 'rotate': {
          if (op.degrees !== 0) {
            out = out.rotate(op.degrees, [0, 0, 0], axisDir[op.axis]);
          }
          break;
        }
        case 'rotateAxis': {
          if (op.degrees !== 0) {
            out = out.rotate(op.degrees, op.origin, op.direction);
          }
          break;
        }
        case 'translate': {
          out = out.translate(op.by);
          break;
        }
      }
    }
    return out as typeof input;
  },
});

/** Placement factories; the value namespace shares the `Placement` type name. */
export const Placement = {
  identity: makePlacement([]),
  /** Mirror about the global XZ plane (y -> -y); used for L-bank occurrences. */
  mirrorXZ: (): Placement => makePlacement([{ kind: 'mirrorXZ' }]),
  rotate: (axis: 'x' | 'y' | 'z', degrees: number): Placement =>
    makePlacement([{ kind: 'rotate', axis, degrees }]),
  translate: (x: number, y: number, z: number): Placement =>
    makePlacement([{ kind: 'translate', by: [x, y, z] }]),
  rotateAxis: (origin: Vec3, direction: Vec3, degrees: number): Placement =>
    makePlacement([{ kind: 'rotateAxis', origin, direction, degrees }]),
} as const;

export const vecAdd = (a: Vec3, b: Vec3): Vec3 => [
  a[0] + b[0],
  a[1] + b[1],
  a[2] + b[2],
];
export const vecScale = (a: Vec3, s: number): Vec3 => [
  a[0] * s,
  a[1] * s,
  a[2] * s,
];
export const vecNorm = (a: Vec3): Vec3 => {
  const length = Math.hypot(a[0], a[1], a[2]);
  return [a[0] / length, a[1] / length, a[2] / length];
};
