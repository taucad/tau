/* oxlint-disable new-cap -- OpenCascade API uses PascalCase method names */
/* oxlint-disable eslint/max-params -- libcascade helpers take the instance followed by their operands */
/* eslint-disable @typescript-eslint/naming-convention -- Kittycad wire JSON field names */
/**
 * Clones, patterns, mirrors and object transforms for {@link OfflineEngine}: command handlers that take the engine as their first argument.
 */
import type { Frame, Vec2, Vec3 } from '#offline/offline-math.js';
import {
  add,
  cross,
  directionToGlobal,
  dot,
  globalFrame,
  length,
  normalize,
  scale,
  sub,
  toGlobal,
  toLocal,
  vec3,
} from '#offline/offline-math.js';
import type { Oc } from '#offline/offline-occt.js';
import { edgePoint, pnt } from '#offline/offline-occt.js';
import type { PathEntity } from '#offline/offline-scene.js';
import { tangentAtEnd } from '#offline/offline-sketch.js';
import { orientOutward } from '#offline/offline-sweeps.js';
import type { WireTransform } from '#offline/offline-transform.js';
import {
  applyTrsf,
  childIds,
  entityCenter,
  patternTrsf,
  planeMirrorTrsf,
  rotationTrsf,
  scaleEntityPerAxis,
  sketchFrameOf,
  transformEntity,
  translationTrsf,
} from '#offline/offline-transform.js';
import type { ModelingCommand, WirePoint3d } from '#offline/offline-engine.types.js';
import { OfflineEngineError } from '#offline/offline-engine.types.js';
import type { OfflineEngine } from '#offline/offline-engine.js';
import type { EdgeSpecifier } from '#offline/offline-engine-support.js';
import { point3, tuple, isClosedPath, localOrigin } from '#offline/offline-engine-support.js';

/**
 * Copies an entity with fresh ids.
 *
 * @param engine - offline engine
 * @param id - command id
 * @param cmd - command payload
 * @returns the response
 */
export function clone(engine: OfflineEngine, id: string, cmd: ModelingCommand): Record<string, unknown> {
  const source = engine.scene.get(cmd['entity_id'] as string);
  const renamed = new Map<string, string>();
  const rename = (childId: string): string => {
    let next = renamed.get(childId);
    if (!next) {
      next = engine.mint();
      renamed.set(childId, next);
    }

    return next;
  };

  const copy = transformEntity(engine.oc, source, id, new engine.oc.gp_Trsf(), rename);
  copy.hidden = false;
  engine.scene.add(copy);
  return { face_edge_ids: [] };
}

/**
 * Adds one transformed copy of an entity per transform.
 *
 * @param engine - offline engine
 * @param sourceId - entity to copy
 * @param trsfs - one transform per copy
 * @returns the response, with the copies' ids
 */
export function addCopies(
  engine: OfflineEngine,
  sourceId: string,
  trsfs: ReadonlyArray<InstanceType<Oc['gp_Trsf']>>,
): Record<string, unknown> {
  const source = engine.scene.get(sourceId);
  if (source.kind === 'path' && !isClosedPath(source)) {
    // An open profile is patterned in place: the copies continue the same path, so kcl-lib keeps one sketch.
    appendPathCopies(engine, source, trsfs);
    return { entity_face_edge_ids: [] };
  }

  const copies = trsfs.map((trsf) => {
    const copy = transformEntity(engine.oc, source, engine.mint(), trsf);
    engine.scene.entities.set(copy.id, copy);
    return { object_id: copy.id, faces: [], edges: [] };
  });
  return { entity_face_edge_ids: copies };
}

/**
 * Continues an open path with transformed copies of its segments.
 *
 * @param engine - offline engine
 * @param path - the open path
 * @param trsfs - one transform per copy
 */
export function appendPathCopies(
  engine: OfflineEngine,
  path: PathEntity,
  trsfs: ReadonlyArray<InstanceType<Oc['gp_Trsf']>>,
): void {
  const original = [...path.segments];
  for (const trsf of trsfs) {
    for (const segment of original) {
      const edge = engine.oc.TopoDS.Edge(applyTrsf(engine.oc, segment.edge, trsf).shape);
      const map2 = (p: Vec2): Vec2 => {
        const global = pnt(engine.oc, toGlobal(path.frame, p.x, p.y));
        global.Transform(trsf);
        const local = toLocal(path.frame, vec3(global.X(), global.Y(), global.Z()));
        return { x: local.x, y: local.y };
      };

      const start = map2(segment.start);
      const end = map2(segment.end);
      const tip = map2({ x: segment.end.x + segment.endTangent.x, y: segment.end.y + segment.endTangent.y });
      path.segments.push({ id: engine.mint(), edge, start, end, endTangent: { x: tip.x - end.x, y: tip.y - end.y } });
      path.pen = end;
    }
  }
}

/**
 * Patterns an entity with a list of transforms.
 *
 * @param engine - offline engine
 * @param cmd - command payload
 * @returns the response
 */
export function patternTransform(engine: OfflineEngine, cmd: ModelingCommand): Record<string, unknown> {
  const source = engine.scene.get(cmd['entity_id'] as string);
  const center = localOrigin(engine.oc, source);
  const frame = sketchFrameOf(source);
  const instances = cmd['transforms'] as WireTransform[][];
  const trsfs = instances
    .filter((list) => list.every((transform) => transform.replicate !== false))
    .map((list) => {
      const total = new engine.oc.gp_Trsf();
      for (const transform of list) {
        total.PreMultiply(patternTrsf(engine.oc, transform, center, frame));
      }

      return total;
    });
  return addCopies(engine, source.id, trsfs);
}

/**
 * Patterns an entity along a direction.
 *
 * @param engine - offline engine
 * @param cmd - command payload
 * @returns the response
 */
export function linearPattern(engine: OfflineEngine, cmd: ModelingCommand): Record<string, unknown> {
  const source = engine.scene.get(cmd['entity_id'] as string);
  const frame = sketchFrameOf(source);
  const axisWire = point3(cmd['axis'] as WirePoint3d);
  const axis = normalize(frame ? directionToGlobal(frame, axisWire.x, axisWire.y) : axisWire);
  const count = cmd['num_repetitions'] as number;
  const spacing = cmd['spacing'] as number;
  const trsfs = Array.from({ length: count }, (_, index) =>
    translationTrsf(engine.oc, scale(axis, spacing * (index + 1))),
  );
  return addCopies(engine, source.id, trsfs);
}

/**
 * Patterns an entity about an axis.
 *
 * @param engine - offline engine
 * @param cmd - command payload
 * @returns the response
 */
export function circularPattern(engine: OfflineEngine, cmd: ModelingCommand): Record<string, unknown> {
  const source = engine.scene.get(cmd['entity_id'] as string);
  const frame = sketchFrameOf(source);
  const axisWire = point3(cmd['axis'] as WirePoint3d);
  const centerWire = point3(cmd['center'] as WirePoint3d);
  const axis = frame
    ? length(axisWire) < 1e-12
      ? frame.z
      : normalize(add(directionToGlobal(frame, axisWire.x, axisWire.y), scale(frame.z, axisWire.z)))
    : normalize(axisWire);
  const center = frame ? add(toGlobal(frame, centerWire.x, centerWire.y), scale(frame.z, centerWire.z)) : centerWire;
  const count = cmd['num_repetitions'] as number;
  const arc = cmd['arc_degrees'] as number;
  const step = (Math.abs(arc) >= 360 ? arc / (count + 1) : arc / count) * (Math.PI / 180);
  const rotateDuplicates = cmd['rotate_duplicates'] !== false;
  const sourceCenter = entityCenter(engine.oc, source);
  const trsfs = Array.from({ length: count }, (_, index) => {
    const rotation = rotationTrsf(engine.oc, center, axis, step * (index + 1));
    if (rotateDuplicates) {
      return rotation;
    }

    const moved = pnt(engine.oc, sourceCenter);
    moved.Transform(rotation);
    return translationTrsf(engine.oc, sub(vec3(moved.X(), moved.Y(), moved.Z()), sourceCenter));
  });
  return addCopies(engine, source.id, trsfs);
}

/**
 * 2D mirror: each sketch gains the mirrored copy of its segments, joined into one sketch with a new id.
 *
 * @param engine - offline engine
 * @param ids - sketch ids
 * @param mirrorPlane - mirror plane through the axis, perpendicular to the sketch
 * @returns entity face/edge ids, one entry per sketch
 */
export function mirrorSketches(
  engine: OfflineEngine,
  ids: string[],
  mirrorPlane: (frame: Frame) => { point: Vec3; normal: Vec3 },
): Record<string, unknown> {
  const out = ids.map((sourceId) => {
    const source = engine.scene.get(sourceId);
    if (source.kind !== 'path') {
      const frame = sketchFrameOf(source) ?? globalFrame;
      const plane = mirrorPlane(frame);
      const copyId = engine.mint();
      const mirrored = transformEntity(
        engine.oc,
        source,
        copyId,
        planeMirrorTrsf(engine.oc, plane.point, plane.normal),
      );
      engine.scene.entities.set(copyId, mirrored);
      return { object_id: copyId, faces: [], edges: childIds(mirrored) };
    }

    // The engine mirrors a sketch in place: the mirrored segments join the same path, and the response
    // names that path. kcl-lib adds the listed edges to the path with the returned id, so a later extrude's
    // face info (whose curve ids include the original segments) resolves to the path the sweep consumed.
    const plane = mirrorPlane(source.frame);
    const trsf = planeMirrorTrsf(engine.oc, plane.point, plane.normal);
    // The copies run in reverse, so the chain continues from the source's end back to its mirrored start,
    // and the pen follows it: a `close_path` after the mirror closes from there, as on Zoo's engine.
    const mirrorLocal = (point: Vec2): Vec2 => {
      const global = toGlobal(source.frame, point.x, point.y);
      const offset = 2 * dot(sub(global, plane.point), plane.normal);
      const local = toLocal(source.frame, sub(global, scale(plane.normal, offset)));
      return { x: local.x, y: local.y };
    };
    const mirroredSegments = [...source.segments].reverse().map((segment) => {
      const edge = engine.oc.TopoDS.Edge(applyTrsf(engine.oc, segment.edge, trsf).shape.Reversed());
      return {
        id: engine.mint(),
        edge,
        start: mirrorLocal(segment.end),
        end: mirrorLocal(segment.start),
        endTangent: tangentAtEnd(engine.oc, source.frame, edge),
      };
    });
    source.segments.push(...mirroredSegments);
    const last = mirroredSegments.at(-1);
    if (last) {
      source.pen = last.end;
    }

    return { object_id: source.id, faces: [], edges: mirroredSegments.map((segment) => segment.id) };
  });
  return { entity_face_edge_ids: out };
}

/**
 * Mirrors sketches across an axis.
 *
 * @param engine - offline engine
 * @param cmd - command payload
 * @returns the response
 */
export function mirror2d(engine: OfflineEngine, cmd: ModelingCommand): Record<string, unknown> {
  const axis = point3(cmd['axis'] as WirePoint3d);
  const point = point3(cmd['point'] as WirePoint3d);
  return mirrorSketches(engine, cmd['ids'] as string[], (frame) => {
    const along = normalize(directionToGlobal(frame, axis.x, axis.y));
    return { point: toGlobal(frame, point.x, point.y), normal: normalize(cross(frame.z, along)) };
  });
}

/**
 * Mirrors sketches across an edge.
 *
 * @param engine - offline engine
 * @param cmd - command payload
 * @returns the response
 */
export function mirror2dAcrossEdge(engine: OfflineEngine, cmd: ModelingCommand): Record<string, unknown> {
  const edge = engine.anyEdge(cmd['edge_id'] as string);
  const start = edgePoint(engine.oc, edge, 0);
  const end = edgePoint(engine.oc, edge, 1);
  return mirrorSketches(engine, cmd['ids'] as string[], (frame) => ({
    point: start.point,
    normal: normalize(cross(frame.z, normalize(sub(end.point, start.point), start.tangent))),
  }));
}

/**
 * Mirrors solids across a plane.
 *
 * @param engine - offline engine
 * @param cmd - command payload
 * @returns the response
 */
export function mirror3d(engine: OfflineEngine, cmd: ModelingCommand): Record<string, unknown> {
  const across = cmd['across'] as
    | { plane: { id: string } }
    | { axis: { axis: WirePoint3d; point: WirePoint3d } }
    | { edge: { id: string } }
    | { edge_reference: { reference: EdgeSpecifier } };
  let trsf: InstanceType<Oc['gp_Trsf']>;
  if ('plane' in across) {
    const plane = engine.scene.get(across.plane.id);
    const frame = plane.kind === 'plane' ? plane.frame : sketchFrameOf(plane);
    if (!frame) {
      throw new OfflineEngineError('Mirror plane not found', 'bad_request');
    }

    trsf = planeMirrorTrsf(engine.oc, frame.origin, frame.z);
  } else if ('axis' in across) {
    trsf = new engine.oc.gp_Trsf();
    trsf.SetMirror(
      new engine.oc.gp_Ax1(
        pnt(engine.oc, point3(across.axis.point)),
        new engine.oc.gp_Dir(...tuple(normalize(point3(across.axis.axis)))),
      ),
    );
  } else {
    const edge =
      'edge' in across ? engine.anyEdge(across.edge.id) : engine.edgeFromSpecifier(across.edge_reference.reference);
    const start = edgePoint(engine.oc, edge, 0);
    trsf = new engine.oc.gp_Trsf();
    trsf.SetMirror(
      new engine.oc.gp_Ax1(pnt(engine.oc, start.point), new engine.oc.gp_Dir(...tuple(normalize(start.tangent)))),
    );
  }

  const out = (cmd['ids'] as string[]).map((sourceId) => {
    const source = engine.scene.get(sourceId);
    const renamed = new Map<string, string>();
    const copyId = engine.mint();
    const mirrored = transformEntity(engine.oc, source, copyId, trsf, (childId) => {
      let next = renamed.get(childId);
      if (!next) {
        next = engine.mint();
        renamed.set(childId, next);
      }

      return next;
    });
    if (mirrored.kind === 'solid') {
      mirrored.shape = orientOutward(engine.oc, mirrored.shape);
    }

    engine.scene.add(mirrored);
    return { object_id: copyId, faces: [], edges: [] };
  });
  return { entity_face_edge_ids: out };
}

/**
 * Applies translate, rotate and scale transforms to entities.
 *
 * @param engine - offline engine
 * @param cmd - command payload
 * @returns the response
 */
export function setObjectTransform(engine: OfflineEngine, cmd: ModelingCommand): Record<string, unknown> {
  const entity = engine.scene.get(cmd['object_id'] as string);
  type By<T> = { property: T; set: boolean; origin?: { type: string; origin?: WirePoint3d } } | undefined;
  const components = cmd['transforms'] as Array<{
    translate?: By<WirePoint3d>;
    rotate_rpy?: By<WirePoint3d>;
    rotate_angle_axis?: By<{ x: number; y: number; z: number; w: number }>;
    scale?: By<WirePoint3d>;
  }>;
  let current = entity;
  for (const component of components) {
    // oxlint-disable-next-line eslint/no-loop-func -- the callback runs synchronously within this iteration
    const pivotOf = (by: By<unknown>): Vec3 => {
      const origin = by?.origin;
      if (origin?.type === 'global') {
        return vec3(0, 0, 0);
      }

      if (origin?.type === 'custom') {
        return point3(origin.origin);
      }

      return localOrigin(engine.oc, current);
    };

    const total = new engine.oc.gp_Trsf();
    const perAxis = component.scale ? point3(component.scale.property) : undefined;
    if (
      perAxis &&
      current.kind !== 'plane' &&
      (Math.abs(perAxis.x - perAxis.y) > 1e-12 || Math.abs(perAxis.y - perAxis.z) > 1e-12)
    ) {
      scaleEntityPerAxis(engine.oc, current, pivotOf(component.scale), perAxis);
    } else if (component.scale) {
      const s = point3(component.scale.property);
      const factor = (s.x + s.y + s.z) / 3;
      if (Math.abs(factor - 1) > 1e-12) {
        const trsf = new engine.oc.gp_Trsf();
        trsf.SetScale(pnt(engine.oc, pivotOf(component.scale)), factor);
        total.PreMultiply(trsf);
      }
    }

    if (component.rotate_rpy) {
      const rpy = point3(component.rotate_rpy.property);
      const pivot = pivotOf(component.rotate_rpy);
      const deg = Math.PI / 180;
      for (const [axis, angle] of [
        [vec3(1, 0, 0), rpy.x * deg],
        [vec3(0, 1, 0), rpy.y * deg],
        [vec3(0, 0, 1), rpy.z * deg],
      ] as const) {
        if (Math.abs(angle) > 1e-12) {
          total.PreMultiply(rotationTrsf(engine.oc, pivot, axis, angle));
        }
      }
    }

    if (component.rotate_angle_axis) {
      const p = component.rotate_angle_axis.property;
      if (Math.abs(p.w) > 1e-12) {
        total.PreMultiply(
          rotationTrsf(engine.oc, pivotOf(component.rotate_angle_axis), vec3(p.x, p.y, p.z), (p.w * Math.PI) / 180),
        );
      }
    }

    if (component.translate) {
      const t = point3(component.translate.property);
      const delta = component.translate.set ? sub(t, localOrigin(engine.oc, current)) : t;
      total.PreMultiply(translationTrsf(engine.oc, delta));
    }

    current = transformEntity(engine.oc, current, current.id, total);
    if (current.kind === 'solid') {
      current.shape = orientOutward(engine.oc, current.shape);
    }
  }

  engine.scene.entities.set(current.id, current);
  if (current.kind === 'solid') {
    engine.scene.claim(current);
  }

  return {};
}
