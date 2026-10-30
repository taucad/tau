/* oxlint-disable new-cap -- OpenCascade API uses PascalCase method names */
/* oxlint-disable eslint/max-params -- libcascade helpers take the instance followed by their operands */

/**
 * Small helpers shared by {@link OfflineEngine} and its command-family modules.
 */
import type { Frame, Vec2, Vec3 } from '#offline/offline-math.js';
import { cross, dot, normalize, scale, sub, vec3 } from '#offline/offline-math.js';
import type { Oc, TopoDS_Shape } from '#offline/offline-occt.js';
import { boundingBox, compound } from '#offline/offline-occt.js';
import type { Entity, PathEntity, SolidEntity } from '#offline/offline-scene.js';
import { entityCenter } from '#offline/offline-transform.js';
import type { WirePoint2d, WirePoint3d } from '#offline/offline-engine.types.js';

export type EdgeSpecifier = { side_faces: string[]; end_faces?: string[]; index?: number | undefined };

/**
 * A wire point as a vector, with missing coordinates as zero.
 *
 * @param p - wire point
 * @returns the vector
 */
export const point3 = (p: WirePoint3d | undefined): Vec3 => vec3(p?.x ?? 0, p?.y ?? 0, p?.z ?? 0);

/**
 * A 2D wire point, with missing coordinates as zero.
 *
 * @param p - wire point
 * @returns the point
 */
export const point2 = (p: WirePoint2d | undefined): Vec2 => ({ x: p?.x ?? 0, y: p?.y ?? 0 });

/**
 * A vector as an XYZ tuple.
 *
 * @param v - vector
 * @returns the tuple
 */
export const tuple = (v: Vec3): [number, number, number] => [v.x, v.y, v.z];

/**
 * The separate bodies of a boolean result: its solids, else its shells, else its faces.
 *
 * @param oc - libcascade instance
 * @param shape - result shape
 * @returns pieces
 */
export function topLevelPieces(oc: Oc, shape: TopoDS_Shape): TopoDS_Shape[] {
  const out: TopoDS_Shape[] = [];
  const visit = (current: TopoDS_Shape): void => {
    const iterator = new oc.TopoDS_Iterator(current, true, true);
    // oxlint-disable-next-line typescript/no-confusing-void-expression -- libcascade iterator idiom
    for (; iterator.More(); iterator.Next()) {
      const child = iterator.Value();
      if (child.ShapeType() === oc.TopAbs_ShapeEnum.TopAbs_COMPOUND) {
        visit(child);
      } else {
        out.push(child);
      }
    }

    iterator.delete();
  };

  visit(shape);
  return out.length > 0 ? out : [shape];
}

/**
 * Whether a path's last sub-path returns to where it started.
 *
 * @param path - path
 * @returns true for a closed profile
 */
export function isClosedPath(path: PathEntity): boolean {
  if (path.segments.length === 0) {
    return false;
  }

  return Math.hypot(path.pen.x - path.subpathStart.x, path.pen.y - path.subpathStart.y) < 1e-6;
}

/**
 * A frame with the given normal, x along the projected global X (or Y for normals near X).
 *
 * @param normal - plane normal
 * @param origin - frame origin
 * @returns frame
 */
export function frameFromNormal(normal: Vec3, origin: Vec3 = vec3(0, 0, 0)): Frame {
  const z = normalize(normal);
  const helper = Math.abs(z.x) < 0.9 ? vec3(1, 0, 0) : vec3(0, 1, 0);
  const x = normalize(sub(helper, scale(z, dot(helper, z))));
  return { origin, x, y: cross(z, x), z };
}

/**
 * Scale factor from mm-based quantities to a wire output unit.
 *
 * @param unit - kcl-lib unit (`mm`, `cm`, `m`, `in`, `ft`, `yd`, optionally with a power suffix)
 * @param power - 1 for length, 2 for area, 3 for volume
 * @returns multiplier
 */
export function unitScale(unit: string | undefined, power: number): number {
  const base = (unit ?? 'mm').replace(/[23]$/, '');
  const perMm: Record<string, number> = { mm: 1, cm: 0.1, m: 0.001, in: 1 / 25.4, ft: 1 / 304.8, yd: 1 / 914.4 };
  return (perMm[base] ?? 1) ** power;
}

/**
 * Fuzzy tolerance for a boolean retry: 1e-5 of the bodies' combined diagonal, between 0.1 µm and 10 µm. The solver
 * round-off it absorbs grows with the model, so a fixed value was either too tight for large models or too loose
 * for small ones.
 */
export function fuzzyTolerance(oc: Oc, solids: readonly SolidEntity[]): number {
  const box = boundingBox(
    oc,
    compound(
      oc,
      solids.map((solid) => solid.shape),
    ),
  );
  const diagonal = box ? Math.hypot(box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z) : 0;
  return Math.min(1e-2, Math.max(1e-4, diagonal * 1e-5));
}

/** Whether any argument body's bounding box overlaps any tool body's. */
export function boxesOverlap(oc: Oc, args: readonly SolidEntity[], tools: readonly SolidEntity[]): boolean {
  const boxes = (solids: readonly SolidEntity[]): Array<NonNullable<ReturnType<typeof boundingBox>>> =>
    solids.flatMap((solid) => boundingBox(oc, solid.shape) ?? []);
  const toolBoxes = boxes(tools);
  return boxes(args).some((a) =>
    toolBoxes.some(
      (b) =>
        a.min.x <= b.max.x &&
        b.min.x <= a.max.x &&
        a.min.y <= b.max.y &&
        b.min.y <= a.max.y &&
        a.min.z <= b.max.z &&
        b.min.z <= a.max.z,
    ),
  );
}

/** An entity's local origin: the origin of the sketch it was made from, carried through its transforms. */
export function localOrigin(oc: Oc, entity: Entity): Vec3 {
  if ((entity.kind === 'solid' || entity.kind === 'path' || entity.kind === 'region') && entity.frame) {
    return entity.frame.origin;
  }

  return entityCenter(oc, entity);
}
