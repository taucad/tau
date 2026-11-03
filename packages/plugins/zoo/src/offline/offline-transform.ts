/* oxlint-disable new-cap -- OpenCascade API uses PascalCase method names */
/* oxlint-disable eslint/max-params -- libcascade helpers take the instance followed by their operands */
/**
 * Rigid and scaling transforms of scene entities: `set_object_transform`, patterns, clones and mirrors all
 * reduce to "apply a `gp_Trsf` to an entity, optionally as a copy".
 */
import type { Frame, Vec3 } from '#offline/offline-math.js';
import { add, cross, directionToGlobal, normalize, scale, toGlobal, vec3 } from '#offline/offline-math.js';
import type { Oc, TopoDS_Edge, TopoDS_Shape, gp_Trsf } from '#offline/offline-occt.js';
import { ax1, boundingBox, dir, fromPnt, pnt } from '#offline/offline-occt.js';
import type { Entity, SolidEntity } from '#offline/offline-scene.js';

export type WireOrigin = { type: 'local' } | { type: 'global' } | { type: 'custom'; origin: Vec3 };
export type WireTransform = {
  translate?: Vec3;
  scale?: Vec3;
  rotation?: { axis: Vec3; angle: { unit: 'degrees' | 'radians'; value: number }; origin: WireOrigin };
  replicate?: boolean;
};

/** Shape-level transform result: the moved shape and the image of each old sub-shape. */
type Applied = { shape: TopoDS_Shape; image: (sub: TopoDS_Shape) => TopoDS_Shape };

const isRigid = (trsf: gp_Trsf): boolean => Math.abs(trsf.ScaleFactor() - 1) < 1e-12;

/**
 * Applies a transform to a shape, keeping a sub-shape image map.
 *
 * Rigid transforms move the shape by location, so every sub-shape's image is the same sub-shape moved; a scaling
 * transform rebuilds geometry with `BRepBuilderAPI_Transform` and reads images from its history.
 *
 * @param oc - libcascade instance
 * @param shape - shape
 * @param trsf - transform
 * @returns transformed shape and image map
 */
export function applyTrsf(oc: Oc, shape: TopoDS_Shape, trsf: gp_Trsf): Applied {
  if (isRigid(trsf)) {
    const location = new oc.TopLoc_Location(trsf);
    return { shape: shape.Moved(location, false), image: (sub) => sub.Moved(location, false) };
  }

  const transform = new oc.BRepBuilderAPI_Transform(shape, trsf, true, true);
  const result = transform.Shape();
  return {
    shape: result,
    image: (sub) => transform.ModifiedShape(sub),
  };
}

const transformPoint = (oc: Oc, trsf: gp_Trsf, p: Vec3): Vec3 => {
  const point = pnt(oc, p);
  point.Transform(trsf);
  const out = fromPnt(point);
  point.delete();
  return out;
};

/**
 * Transforms a frame, keeping it orthonormal (scale is dropped from the axes).
 *
 * @param oc - libcascade instance
 * @param frame - frame
 * @param trsf - transform
 * @returns transformed frame
 */
export function transformFrame(oc: Oc, frame: Frame, trsf: gp_Trsf): Frame {
  const origin = transformPoint(oc, trsf, frame.origin);
  const along = (axis: Vec3): Vec3 => {
    const tip = transformPoint(oc, trsf, add(frame.origin, axis));
    return normalize(vec3(tip.x - origin.x, tip.y - origin.y, tip.z - origin.z));
  };

  const x = along(frame.x);
  const y = along(frame.y);
  const z = normalize(cross(x, y));
  return { origin, x, y: cross(z, x), z };
}

/**
 * Copies an entity under a transform. Child ids are kept unless `renameChild` is given.
 *
 * @param oc - libcascade instance
 * @param entity - source entity
 * @param newId - id of the copy (the source id to transform in place)
 * @param trsf - transform
 * @param renameChild - maps old child ids to new ones, for clones
 * @returns the transformed entity
 */
// oxlint-disable-next-line max-params -- entity, id, transform and rename policy are all independent
export function transformEntity(
  oc: Oc,
  entity: Entity,
  newId: string,
  trsf: gp_Trsf,
  renameChild: (id: string) => string = (id) => id,
): Entity {
  switch (entity.kind) {
    case 'plane': {
      return { ...entity, id: newId, frame: transformFrame(oc, entity.frame, trsf) };
    }

    case 'curve': {
      return { ...entity, id: newId, shape: applyTrsf(oc, entity.shape, trsf).shape };
    }

    case 'path': {
      return {
        ...entity,
        id: newId,
        frame: transformFrame(oc, entity.frame, trsf),
        segments: entity.segments.map((segment) => ({
          ...segment,
          id: renameChild(segment.id),
          edge: oc.TopoDS.Edge(applyTrsf(oc, segment.edge, trsf).shape),
        })),
        holes: [...entity.holes],
      };
    }

    case 'region': {
      const applied = applyTrsf(oc, entity.face, trsf);
      const curves = new Map<string, TopoDS_Edge>();
      for (const [id, edge] of entity.curves) {
        curves.set(renameChild(id), oc.TopoDS.Edge(applied.image(edge)));
      }

      return {
        ...entity,
        id: newId,
        frame: transformFrame(oc, entity.frame, trsf),
        face: oc.TopoDS.Face(applied.shape),
        curves,
        firstCurveId: entity.firstCurveId === undefined ? undefined : renameChild(entity.firstCurveId),
      };
    }

    case 'solid': {
      return transformSolid(oc, entity, newId, trsf, renameChild);
    }

    default: {
      const unknown: { kind: string } = entity;
      throw new Error(`Cannot transform ${unknown.kind}`);
    }
  }
}

// oxlint-disable-next-line max-params -- see transformEntity
function transformSolid(
  oc: Oc,
  solid: SolidEntity,
  newId: string,
  trsf: gp_Trsf,
  renameChild: (id: string) => string,
): SolidEntity {
  const applied = applyTrsf(oc, solid.shape, trsf);
  const facesMap = new Map<string, TopoDS_Shape>();
  for (const [id, face] of solid.faces) {
    facesMap.set(renameChild(id), applied.image(face));
  }

  const edgesMap = new Map<string, TopoDS_Shape>();
  for (const [id, edge] of solid.edges) {
    edgesMap.set(renameChild(id), applied.image(edge));
  }

  return {
    ...solid,
    id: newId,
    shape: applied.shape,
    faces: facesMap,
    edges: edgesMap,
    frame: solid.frame ? transformFrame(oc, solid.frame, trsf) : undefined,
    sweeps: solid.sweeps.map((sweep) => ({
      curveIds: sweep.curveIds.map(renameChild),
      sideFaceByCurve: new Map(
        [...sweep.sideFaceByCurve].map(([curve, face]) => [renameChild(curve), renameChild(face)]),
      ),
      startCapId: sweep.startCapId ? renameChild(sweep.startCapId) : undefined,
      endCapId: sweep.endCapId ? renameChild(sweep.endCapId) : undefined,
    })),
  };
}

/**
 * Child ids in the order `entity_get_all_child_uuids` reports them.
 *
 * @param entity - entity
 * @returns child ids
 */
export function childIds(entity: Entity): string[] {
  switch (entity.kind) {
    case 'path': {
      return entity.segments.map((segment) => segment.id);
    }

    case 'region': {
      return [...entity.curves.keys()];
    }

    case 'solid': {
      return [...entity.faces.keys(), ...entity.edges.keys()];
    }

    default: {
      return [];
    }
  }
}

/**
 * A representative shape of an entity, for bounding boxes and pivots.
 *
 * @param oc - libcascade instance
 * @param entity - entity
 * @returns shape, or undefined for planes
 */
export function entityShape(oc: Oc, entity: Entity): TopoDS_Shape | undefined {
  switch (entity.kind) {
    case 'solid': {
      return entity.shape;
    }

    case 'curve': {
      return entity.shape;
    }

    case 'region': {
      return entity.face;
    }

    case 'path': {
      if (entity.segments.length === 0) {
        return undefined;
      }

      const builder = new oc.BRep_Builder();
      const result = new oc.TopoDS_Compound();
      builder.MakeCompound(result);
      for (const segment of entity.segments) {
        builder.Add(result, segment.edge);
      }

      builder.delete();
      return result;
    }

    default: {
      return undefined;
    }
  }
}

/**
 * Centre of an entity's bounding box: the engine's "local" origin for rotations and scales.
 *
 * @param oc - libcascade instance
 * @param entity - entity
 * @returns centre point
 */
export function entityCenter(oc: Oc, entity: Entity): Vec3 {
  if (entity.kind === 'plane') {
    return entity.frame.origin;
  }

  const shape = entityShape(oc, entity);
  const box = shape ? boundingBox(oc, shape) : undefined;
  if (!box) {
    return vec3(0, 0, 0);
  }

  return scale(add(box.min, box.max), 0.5);
}

/**
 * The frame wire vectors of a 2D entity are expressed in; undefined for 3D entities (global coordinates).
 *
 * @param entity - entity
 * @returns sketch frame, or undefined
 */
export function sketchFrameOf(entity: Entity): Frame | undefined {
  return entity.kind === 'path' || entity.kind === 'region' ? entity.frame : undefined;
}

/**
 * Builds a `gp_Trsf` for one pattern `Transform`: scale, then rotate, then translate.
 *
 * @param oc - libcascade instance
 * @param transform - wire transform
 * @param center - entity centre (the "local" origin)
 * @param frame - sketch frame for 2D entities; vectors are then plane-local
 * @returns transform
 */
export function patternTrsf(oc: Oc, transform: WireTransform, center: Vec3, frame: Frame | undefined): gp_Trsf {
  const toWorldDirection = (v: Vec3): Vec3 =>
    frame ? add(directionToGlobal(frame, v.x, v.y), scale(frame.z, v.z)) : v;
  const toWorldPoint = (v: Vec3): Vec3 => (frame ? add(toGlobal(frame, v.x, v.y), scale(frame.z, v.z)) : v);
  const result = new oc.gp_Trsf();

  const s = transform.scale;
  if (s && (Math.abs(s.x - 1) > 1e-12 || Math.abs(s.y - 1) > 1e-12 || Math.abs(s.z - 1) > 1e-12)) {
    // Non-uniform scale is approximated by its mean; libcascade's gp_Trsf is a similarity transform.
    const factor = (s.x + s.y + s.z) / 3;
    const scaling = new oc.gp_Trsf();
    scaling.SetScale(pnt(oc, center), factor);
    result.PreMultiply(scaling);
  }

  const { rotation } = transform;
  if (rotation && Math.abs(rotation.angle.value) > 1e-12) {
    const angle = rotation.angle.unit === 'degrees' ? (rotation.angle.value * Math.PI) / 180 : rotation.angle.value;
    const origin =
      rotation.origin.type === 'global'
        ? vec3(0, 0, 0)
        : rotation.origin.type === 'custom'
          ? toWorldPoint(rotation.origin.origin)
          : center;
    const axis = frame && rotation.axis.x === 0 && rotation.axis.y === 0 ? frame.z : toWorldDirection(rotation.axis);
    const rotate = new oc.gp_Trsf();
    rotate.SetRotation(ax1(oc, origin, normalize(axis)), angle);
    result.PreMultiply(rotate);
  }

  const t = transform.translate;
  if (t && (t.x !== 0 || t.y !== 0 || t.z !== 0)) {
    const translate = new oc.gp_Trsf();
    translate.SetTranslation(new oc.gp_Vec(...tuple(toWorldDirection(t))));
    result.PreMultiply(translate);
  }

  return result;
}

const tuple = (v: Vec3): [number, number, number] => [v.x, v.y, v.z];

/**
 * Rotation about an axis through a point.
 *
 * @param oc - libcascade instance
 * @param origin - point on the axis
 * @param axis - axis direction
 * @param angle - radians
 * @returns transform
 */
export function rotationTrsf(oc: Oc, origin: Vec3, axis: Vec3, angle: number): gp_Trsf {
  const trsf = new oc.gp_Trsf();
  trsf.SetRotation(ax1(oc, origin, normalize(axis)), angle);
  return trsf;
}

/**
 * Translation by a vector.
 *
 * @param oc - libcascade instance
 * @param v - translation
 * @returns transform
 */
export function translationTrsf(oc: Oc, v: Vec3): gp_Trsf {
  const trsf = new oc.gp_Trsf();
  trsf.SetTranslation(new oc.gp_Vec(v.x, v.y, v.z));
  return trsf;
}

/**
 * Mirror across the plane through `point` with normal `normal`.
 *
 * @param oc - libcascade instance
 * @param point - point on the plane
 * @param normal - plane normal
 * @returns transform
 */
export function planeMirrorTrsf(oc: Oc, point: Vec3, normal: Vec3): gp_Trsf {
  const trsf = new oc.gp_Trsf();
  trsf.SetMirror(new oc.gp_Ax2(pnt(oc, point), dir(oc, normalize(normal))));
  return trsf;
}

/**
 * Scales an entity by a different factor per global axis about a pivot (`scale(x = -1)` mirrors), keeping its ids.
 * A gp_Trsf only scales uniformly, so this goes through `BRepBuilderAPI_GTransform`. Plane-local pen positions of
 * a path are left as they are; only its geometry is rescaled.
 *
 * @param oc - libcascade instance
 * @param entity - entity; its shapes and id tables are replaced in place
 * @param pivot - fixed point, global
 * @param factors - scale per global axis
 */
export function scaleEntityPerAxis(oc: Oc, entity: Entity, pivot: Vec3, factors: Vec3): void {
  const gtrsf = new oc.gp_GTrsf();
  gtrsf.SetValue(1, 1, factors.x);
  gtrsf.SetValue(2, 2, factors.y);
  gtrsf.SetValue(3, 3, factors.z);
  gtrsf.SetTranslationPart(
    new oc.gp_XYZ(pivot.x * (1 - factors.x), pivot.y * (1 - factors.y), pivot.z * (1 - factors.z)),
  );
  const transformOf = (shape: TopoDS_Shape): InstanceType<Oc['BRepBuilderAPI_GTransform']> =>
    new oc.BRepBuilderAPI_GTransform(shape, gtrsf, true);
  const origin =
    entity.kind === 'plane' || entity.kind === 'curve' ? undefined : 'frame' in entity ? entity.frame : undefined;
  if (origin) {
    const o = origin.origin;
    origin.origin = vec3(
      pivot.x + (o.x - pivot.x) * factors.x,
      pivot.y + (o.y - pivot.y) * factors.y,
      pivot.z + (o.z - pivot.z) * factors.z,
    );
  }

  switch (entity.kind) {
    case 'solid': {
      const transform = transformOf(entity.shape);
      entity.faces = new Map([...entity.faces].map(([id, face]) => [id, transform.ModifiedShape(face)]));
      entity.edges = new Map([...entity.edges].map(([id, edge]) => [id, transform.ModifiedShape(edge)]));
      entity.shape = transform.Shape();
      break;
    }

    case 'path': {
      entity.segments = entity.segments.map((segment) => ({
        ...segment,
        edge: oc.TopoDS.Edge(transformOf(segment.edge).Shape()),
      }));
      break;
    }

    case 'region': {
      const transform = transformOf(entity.face);
      entity.curves = new Map(
        [...entity.curves].map(([id, edge]) => [id, oc.TopoDS.Edge(transform.ModifiedShape(edge))]),
      );
      entity.face = oc.TopoDS.Face(transform.Shape());
      break;
    }

    case 'curve': {
      entity.shape = transformOf(entity.shape).Shape();
      break;
    }

    default: {
      break;
    }
  }

  gtrsf.delete();
}
