/**
 * Entity model of the offline engine.
 *
 * The Zoo engine is an entity store keyed by kcl-lib's UUIDs: planes, sketch paths, regions, solids and helices,
 * plus the face and edge ids it hands back for solids. This scene mirrors that store over libcascade shapes so
 * later commands can address any id kcl-lib was given.
 */
import type { Frame, Vec2, Vec3 } from '#offline/offline-math.js';
import type { TopoDS_Edge, TopoDS_Face, TopoDS_Shape } from '#offline/offline-occt.js';
import { OfflineEngineError } from '#offline/offline-engine.types.js';

/** One sketch segment: a libcascade edge plus its plane-local endpoints for pen tracking. */
export type PathSegment = {
  id: string;
  edge: TopoDS_Edge;
  start: Vec2;
  end: Vec2;
  /** Unit tangent at the end, plane-local, for tangential arcs. */
  endTangent: Vec2;
};

/** A sketch profile as `start_path` / `extend_path` builds it. */
export type PathEntity = {
  kind: 'path';
  id: string;
  frame: Frame;
  segments: PathSegment[];
  pen: Vec2;
  /** Start of the current sub-path, where `close_path` returns. */
  subpathStart: Vec2;
  /** Holes added with `solid2d_add_hole`. */
  holes: string[];
  /** The face the sketch sits on, when sketched on a solid face. */
  onFace?: { solidId: string; faceId: string };
  hidden: boolean;
};

/** A region: a planar face carved out of a path's arrangement, with one curve id per boundary edge. */
export type RegionEntity = {
  kind: 'region';
  id: string;
  frame: Frame;
  face: TopoDS_Face;
  /** Region curve id → boundary edge, in boundary order. */
  curves: Map<string, TopoDS_Edge>;
  /** The region curve cut from the earliest sketch segment, where a loft starts this section's wire. */
  firstCurveId?: string;
  onFace?: { solidId: string; faceId: string };
  hidden: boolean;
};

/** Faces one sweep produced, as `solid3d_get_extrusion_face_info` reports them. */
export type SweepFaces = {
  curveIds: string[];
  sideFaceByCurve: Map<string, string>;
  startCapId?: string;
  endCapId?: string;
  /** Extrusion direction; a side face's sketch frame takes its y axis from it. */
  direction?: Vec3;
};

/** A solid or surface body with the face and edge ids handed back to kcl-lib. */
export type SolidEntity = {
  kind: 'solid';
  id: string;
  shape: TopoDS_Shape;
  faces: Map<string, TopoDS_Shape>;
  edges: Map<string, TopoDS_Shape>;
  sweeps: SweepFaces[];
  /** The frame of the sketch the body came from, for `face_is_planar` fallbacks. */
  frame?: Frame;
  hidden: boolean;
  /**
   * The body before its most recent face-sketch merge and the merged tool, so an edge cut the fused body rejects can
   * be retried on the tool alone and merged again. Valid only while `shape` is still `after`.
   */
  lastMerge?: {
    before: { shape: TopoDS_Shape; faces: Map<string, TopoDS_Shape>; edges: Map<string, TopoDS_Shape> };
    tool: { shape: TopoDS_Shape; faces: Map<string, TopoDS_Shape>; edges: Map<string, TopoDS_Shape> };
    cut: boolean;
    after: TopoDS_Shape;
  };
  color?: { r: number; g: number; b: number; a: number };
  metalness?: number;
  roughness?: number;
};

/**
 * A sketch plane: a default plane, a custom plane, or a planar face kcl-lib asked about.
 */
export type PlaneEntity = { kind: 'plane'; id: string; frame: Frame; hidden: boolean };

/** A free curve such as a helix, used as a sweep trajectory. */
export type CurveEntity = {
  kind: 'curve';
  id: string;
  shape: TopoDS_Shape;
  /** A helix's axis; sweeps along it hold the profile's binormal to this axis. */
  axis?: Vec3;
  hidden: boolean;
};

/**
 * Anything the engine tracks by id.
 */
export type Entity = PathEntity | RegionEntity | SolidEntity | PlaneEntity | CurveEntity;

/**
 * The id-addressed entity store.
 */
export class OfflineScene {
  public readonly entities = new Map<string, Entity>();
  /** Ids that kcl-lib may keep using after an engine-side merge, mapped to the entity that now owns them. */
  public readonly aliases = new Map<string, string>();
  /** Face or edge id → the solid that most recently took ownership of it. */
  public readonly subShapeOwner = new Map<string, string>();
  /** Chamfer faces cut with the `v2` edge-cut algorithm, whose sketch frame Zoo turns half a turn about its normal. */
  public readonly halfTurnFaces = new Set<string>();
  /** Edge id → the fillet or chamfer that blended it, as a key of its cut type and size. */
  public readonly cutEdges = new Map<string, string>();

  /** Runs on every claimed solid, before its ids are registered; the engine re-reads face orientations here. */
  public onClaim?: (solid: SolidEntity) => void;

  /**
   * Forgets every entity, alias and sub-shape owner.
   */
  public clear(): void {
    this.entities.clear();
    this.aliases.clear();
    this.subShapeOwner.clear();
    this.halfTurnFaces.clear();
    this.cutEdges.clear();
  }

  /**
   * Follows aliases left by operations that consumed an entity.
   *
   * @param id - entity id or alias
   * @returns the id of the live entity
   */
  public resolveId(id: string): string {
    let current = id;
    for (let hops = 0; hops < 16; hops++) {
      const next = this.aliases.get(current);
      if (!next || next === current) {
        return current;
      }

      current = next;
    }

    return current;
  }

  /**
   * Looks up an entity by id or alias.
   *
   * @param id - entity id or alias
   * @returns the entity, or undefined
   */
  public find(id: string): Entity | undefined {
    return this.entities.get(this.resolveId(id));
  }

  /**
   * Looks up an entity by id or alias.
   *
   * @param id - entity id
   * @returns the entity; throws when it is unknown
   */
  public get(id: string): Entity {
    // oxlint-disable-next-line unicorn/no-array-callback-reference -- OfflineScene.find, not Array#find
    const entity = this.find(id);
    if (!entity) {
      throw new OfflineEngineError(`Unknown entity ${id}`, 'bad_request');
    }

    return entity;
  }

  /**
   * Looks up a solid by id or alias.
   *
   * @param id - solid id or alias
   * @returns the solid; throws when the id names something else
   */
  public getSolid(id: string): SolidEntity {
    const entity = this.get(id);
    if (entity.kind !== 'solid') {
      throw new OfflineEngineError(`Entity ${id} is a ${entity.kind}, expected a solid`, 'bad_request');
    }

    return entity;
  }

  /**
   * Registers an entity, claiming its face and edge ids when it is a solid.
   *
   * @param entity - the new entity
   */
  public add(entity: Entity): void {
    this.aliases.delete(entity.id);
    this.entities.set(entity.id, entity);
    if (entity.kind === 'solid') {
      this.claim(entity);
    }
  }

  /**
   * Points every face and edge id of a solid at that solid.
   *
   * @param solid - new owner
   */
  public claim(solid: SolidEntity): void {
    this.onClaim?.(solid);
    for (const id of solid.faces.keys()) {
      this.subShapeOwner.set(id, solid.id);
    }

    for (const id of solid.edges.keys()) {
      this.subShapeOwner.set(id, solid.id);
    }
  }

  /**
   * Drops an entity.
   *
   * @param id - entity id or alias
   */
  public remove(id: string): void {
    this.entities.delete(this.resolveId(id));
  }

  /**
   * Finds the solid that owns a face or edge id.
   *
   * @param subShapeId - face or edge id
   * @returns owning solid, or undefined
   */
  public ownerOf(subShapeId: string): SolidEntity | undefined {
    const ownerId = this.subShapeOwner.get(subShapeId);
    // oxlint-disable-next-line unicorn/no-array-callback-reference -- OfflineScene.find, not Array#find
    const owner = ownerId ? this.find(ownerId) : undefined;
    if (owner?.kind === 'solid' && (owner.faces.has(subShapeId) || owner.edges.has(subShapeId))) {
      return owner;
    }

    for (const entity of this.entities.values()) {
      if (entity.kind === 'solid' && (entity.faces.has(subShapeId) || entity.edges.has(subShapeId))) {
        return entity;
      }
    }

    return undefined;
  }

  /** Solids and surfaces that are shown, in creation order. */
  public visibleSolids(): SolidEntity[] {
    const out: SolidEntity[] = [];
    for (const entity of this.entities.values()) {
      if (entity.kind === 'solid' && !entity.hidden) {
        out.push(entity);
      }
    }

    return out;
  }
}
