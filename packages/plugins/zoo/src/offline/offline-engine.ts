/* oxlint-disable new-cap -- OpenCascade API uses PascalCase method names */
/* oxlint-disable eslint/max-params -- libcascade helpers take the instance followed by their operands */
/* eslint-disable @typescript-eslint/naming-convention -- Kittycad wire JSON field names */
/**
 * An in-process stand-in for the Zoo modeling engine, built on libcascade.
 *
 * kcl-lib drives the Zoo engine with `ModelingCmd` requests over a WebSocket. This engine answers the same
 * requests locally: each command is dispatched to a handler that updates the {@link OfflineScene} with libcascade
 * shapes and returns the `OkModelingCmdResponse` kcl-lib expects. Camera, selection and display commands are
 * accepted and ignored, since there is no viewport.
 */
import type { Frame, Vec3 } from '#offline/offline-math.js';
import {
  add,
  cross,
  directionToGlobal,
  dot,
  frameFromAxes,
  globalFrame,
  length,
  normalize,
  scale,
  sub,
  toGlobal,
} from '#offline/offline-math.js';
import type { Oc, TopoDS_Edge, TopoDS_Face, TopoDS_Shape } from '#offline/offline-occt.js';
import { ShapeIndex, compound, edgePoint, edges, faceCentroid, faces, subShapes } from '#offline/offline-occt.js';
import type { OfflineProfiler } from '#offline/offline-profiler.js';
import type { PathEntity, RegionEntity, SolidEntity } from '#offline/offline-scene.js';
import { OfflineScene } from '#offline/offline-scene.js';
import { helpersFor } from '#offline/offline-helpers.js';
import type { WirePathSegment } from '#offline/offline-sketch.js';
import { buildSegment, orientedFaceEdges, pathFaces, regionAtPoint, selectRegion } from '#offline/offline-sketch.js';
import type { PresetFaces, Profile, SweepResult } from '#offline/offline-sweeps.js';
import {
  edgeExtrudeDirection,
  extrudeProfile,
  loftProfiles,
  moveProfile,
  revolveProfile,
  sweepProfile,
  twistExtrudeProfile,
  wireFromEdges,
} from '#offline/offline-sweeps.js';
import {
  algoHistory,
  closestEdge,
  edgesBetween,
  faceSketchFrame,
  facesOfEdge,
  idForSubShape,
  noEdgeMatches,
  oppositeEdge,
  rebaseSolid,
  remapIds,
  requireEdge,
  requireFace,
} from '#offline/offline-topology.js';
import {
  childIds,
  entityCenter,
  entityShape,
  rotationTrsf,
  sketchFrameOf,
  translationTrsf,
} from '#offline/offline-transform.js';
import type {
  ModelingCommand,
  ModelingResponse,
  WireAngle,
  WirePoint2d,
  WirePoint3d,
} from '#offline/offline-engine.types.js';
import { OfflineEngineError, toRadians } from '#offline/offline-engine.types.js';
import { exportScene } from '#offline/offline-export.js';
import { randomUuid } from '#binary.utils.js';
import type { WireOutputFormat } from '#offline/offline-export.js';
import type { EdgeSpecifier } from '#offline/offline-engine-support.js';
import { point3, point2, frameFromNormal, unitScale } from '#offline/offline-engine-support.js';
import { boolean, imprint, cutEdges, deleteFaces, shell } from '#offline/offline-engine-booleans.js';
import {
  clone,
  patternTransform,
  linearPattern,
  circularPattern,
  mirror2d,
  mirror2dAcrossEdge,
  mirror3d,
  setObjectTransform,
} from '#offline/offline-engine-patterns.js';
import {
  commandEdge,
  helixFromParams,
  helixOnCylinder,
  helixFromEdge,
  surfaceBlend,
} from '#offline/offline-engine-curves.js';
import {
  faceIsPlanar,
  adjacent,
  bodyType,
  measureBoundingBox,
  sumMass,
  entityType,
} from '#offline/offline-engine-queries.js';

type Handler = (id: string, cmd: ModelingCommand) => Record<string, unknown> | undefined;

/** Commands with no geometric effect offline: camera, selection, display, and session plumbing. */
const ignoredCommands = new Set([
  'default_camera_look_at',
  'default_camera_perspective_settings',
  'default_camera_zoom',
  'default_camera_set_orthographic',
  'default_camera_set_perspective',
  'default_camera_center_to_selection',
  'default_camera_center_to_scene',
  'default_camera_focus_on',
  'default_camera_get_settings',
  'default_camera_get_view',
  'default_camera_set_view',
  'camera_drag_start',
  'camera_drag_move',
  'camera_drag_end',
  'zoom_to_fit',
  'orient_to_face',
  'view_isometric',
  'set_scene_units',
  'set_selection_type',
  'set_selection_filter',
  'select_add',
  'select_remove',
  'select_clear',
  'select_replace',
  'select_with_point',
  'select_get',
  'highlight_set_entity',
  'highlight_set_entities',
  'highlight_query_entity',
  'new_annotation',
  'update_annotation',
  'edge_lines_visible',
  'object_bring_to_front',
  'object_set_material_params_pbr',
  'plane_set_color',
  'set_background_color',
  'set_current_tool_properties',
  'set_default_system_properties',
  'curve_set_constraint',
  'enable_dry_run',
  'disable_dry_run',
  'send_object',
  'entity_fade',
  'make_axes_gizmo',
  'handle_mouse_drag_start',
  'handle_mouse_drag_move',
  'handle_mouse_drag_end',
  'mouse_move',
  'mouse_click',
  'reconfigure_stream',
  'start_recording',
  'stop_recording',
  'set_grid_reference_plane',
  'set_grid_scale',
  'set_grid_auto_scale',
  'set_order_independent_transparency',
  'object_set_highlight',
  'set_object_material',
  'sketch_mode_disable',
]);

/** Engine construction options. */
export type OfflineEngineOptions = {
  /** Id factory for engine-minted face and edge ids; injectable for deterministic tests. */
  mintId?: () => string;
  /**
   * Debug mode: check every solid a command creates or changes with `BRepCheck_Analyzer` and record the invalid ones
   * in `validationIssues`, so a silent libcascade failure is pinned to the command that caused it instead of showing
   * up operations later.
   */
  validate?: boolean;
};

/** A solid that failed the debug topology check, and the command that produced it. */
export type ValidationIssue = { commandId: string; command: string; solidId: string };

/**
 * The offline modeling engine.
 *
 * @public
 */
export class OfflineEngine {
  public readonly scene = new OfflineScene();
  /** Commands that reached the default handler, for coverage reports. */
  public readonly unhandled = new Map<string, number>();
  /**
   * Bodies a boolean consumed. Their ids still resolve to the result for edge and face lookups, but hiding one does
   * not hide the result, as on Zoo's engine.
   */
  public readonly consumedByBoolean = new Set<string>();
  /** Invalid solids found in debug mode (`validate`), in command order. */
  public readonly validationIssues: ValidationIssue[] = [];
  // oxlint-disable-next-line @typescript-eslint/parameter-properties -- erasableSyntaxOnly forbids parameter properties
  public readonly oc: Oc;
  /** Mints ids for new entities and sub-shapes. */
  public readonly mint: () => string;
  private readonly profiler: OfflineProfiler | undefined;
  private readonly handlers: Record<string, Handler>;
  private readonly validate: boolean;
  private sketchFrame: { frame: Frame; entityId: string; onFace?: { solidId: string; faceId: string } } | undefined;
  private interruption: string | undefined;

  public constructor(oc: Oc, profiler?: OfflineProfiler, options: OfflineEngineOptions = {}) {
    this.oc = oc;
    this.profiler = profiler;
    this.mint = options.mintId ?? randomUuid;
    this.validate = options.validate ?? false;
    this.handlers = this.buildHandlers();
    // Reversing a body (an inside-out sweep, a mirror) leaves stored faces with their old orientation, and face
    // normals drive sketch-on-face frames, so re-read each face from the body on every change.
    this.scene.onClaim = (solid) => {
      const index = new ShapeIndex(oc, solid.shape, ['TopAbs_FACE']);
      for (const [faceId, face] of solid.faces) {
        const canonical = index.canonical(face);
        if (canonical) {
          solid.faces.set(faceId, canonical);
        }
      }

      index.delete();
    };
  }

  /**
   * Runs one modeling command.
   *
   * @param id - command id
   * @param cmd - command payload
   * @returns the response kcl-lib expects
   */
  public execute(id: string, cmd: ModelingCommand): ModelingResponse {
    if (this.interruption) {
      const message = this.interruption;
      this.interruption = undefined;
      throw new OfflineEngineError(message, 'execute_interrupted');
    }

    const run = (): ModelingResponse => {
      const handler = this.handlers[cmd.type];
      if (handler) {
        return { type: cmd.type, data: handler(id, cmd) ?? {} };
      }

      if (!ignoredCommands.has(cmd.type)) {
        this.unhandled.set(cmd.type, (this.unhandled.get(cmd.type) ?? 0) + 1);
      }

      return { type: cmd.type, data: {} };
    };

    const before = this.validate ? this.solidShapes() : undefined;
    const response = this.profiler ? this.profiler.timeCommand(cmd.type, run) : run();
    if (before) {
      const helpers = helpersFor(this.oc);
      for (const [solidId, shape] of this.solidShapes()) {
        if (before.get(solidId) !== shape && !helpers.isValid(shape)) {
          this.validationIssues.push({ commandId: id, command: cmd.type, solidId });
        }
      }
    }

    return response;
  }

  /**
   * Asks the engine to fail the next command, like a cancelled WebSocket session.
   *
   * @param reason - failure message
   */
  public interrupt(reason: string): void {
    this.interruption = reason;
  }

  /**
   * Exports the visible scene.
   *
   * @param format - kcl-lib output format
   * @returns files with their raw contents
   */
  public export(format: WireOutputFormat): Array<{ name: string; contents: Uint8Array<ArrayBuffer> }> {
    return exportScene(this.oc, this.scene.visibleSolids(), format);
  }

  /**
   * Turns a sweep into a scene solid with the profile's id, or merges it into the solid the profile was sketched on.
   *
   * @param profile - swept profile
   * @param result - sweep output
   * @param mode - whether to merge into the parent solid, and whether the merge cuts
   */
  /** Fuses (or cuts) a tool body into `parent`, carrying the tool's face and edge ids across. */
  public mergeInto(parent: SolidEntity, tool: Pick<SweepResult, 'shape' | 'faces' | 'edges'>, cut: boolean): void {
    const op = cut
      ? new this.oc.BRepAlgoAPI_Cut(parent.shape, tool.shape)
      : new this.oc.BRepAlgoAPI_Fuse(parent.shape, tool.shape);
    if (!op.IsDone()) {
      throw new OfflineEngineError('Merging the extrusion into its parent solid failed', 'internal_engine');
    }

    const shape = op.Shape();
    const history = algoHistory(this.oc, op);
    const index = new ShapeIndex(this.oc, shape, ['TopAbs_FACE', 'TopAbs_EDGE']);
    const toolFaces = remapIds(tool.faces, history, index);
    const toolEdges = remapIds(tool.edges, history, index);
    index.delete();
    rebaseSolid(this.oc, parent, shape, history);
    for (const [faceId, face] of toolFaces) {
      parent.faces.set(faceId, face);
    }

    for (const [edgeId, edge] of toolEdges) {
      parent.edges.set(edgeId, edge);
    }
  }

  /** The sketch frame of a solid's face, using the extrusion direction when the face is a side face. */
  public faceFrame(owner: SolidEntity, faceId: string, face: TopoDS_Face): Frame {
    const sweep = owner.sweeps.find((candidate) => [...candidate.sideFaceByCurve.values()].includes(faceId));
    const frame = faceSketchFrame(this.oc, face, sweep?.direction);
    return this.scene.halfTurnFaces.has(faceId) ? { ...frame, x: scale(frame.x, -1), y: scale(frame.y, -1) } : frame;
  }

  public resolveEdgeSpecifier(solid: SolidEntity, spec: EdgeSpecifier): TopoDS_Edge {
    const sideFaces = spec.side_faces.map((faceId) => requireFace(this.oc, solid, faceId));
    const endFaces = (spec.end_faces ?? []).map((faceId) => requireFace(this.oc, solid, faceId));
    const candidates = edgesBetween(this.oc, sideFaces, endFaces);
    const edge = candidates[spec.index ?? 0] ?? candidates[0];
    if (!edge) {
      throw new OfflineEngineError(noEdgeMatches, 'bad_request');
    }

    return edge;
  }

  public shapesOf(ids: string[] | undefined): TopoDS_Shape[] {
    const entities =
      ids && ids.length > 0 ? ids.map((entityId) => this.scene.get(entityId)) : this.scene.visibleSolids();
    return entities
      .map((entity) => entityShape(this.oc, entity))
      .filter((shape): shape is TopoDS_Shape => Boolean(shape));
  }

  public solidFor(objectId: string, subShapeId: string): SolidEntity {
    const entity = this.scene.find(objectId);
    if (entity?.kind === 'solid' && (entity.edges.has(subShapeId) || entity.faces.has(subShapeId))) {
      return entity;
    }

    const owner = this.scene.ownerOf(subShapeId);
    if (owner) {
      return owner;
    }

    return this.scene.getSolid(objectId);
  }

  public faceById(faceId: string): { solid: SolidEntity; face: TopoDS_Face } {
    const owner = this.scene.ownerOf(faceId);
    if (!owner) {
      throw new OfflineEngineError(`Unknown face ${faceId}`, 'bad_request');
    }

    return { solid: owner, face: requireFace(this.oc, owner, faceId) };
  }

  public edgeById(solid: SolidEntity, edgeId: string): TopoDS_Edge {
    if (solid.edges.has(edgeId)) {
      return requireEdge(this.oc, solid, edgeId);
    }

    const owner = this.scene.ownerOf(edgeId);
    if (owner) {
      return requireEdge(this.oc, owner, edgeId);
    }

    throw new OfflineEngineError(`Unknown edge ${edgeId}`, 'bad_request');
  }

  /**
   * Any edge by id: a solid edge, a sketch segment, or the single edge of a curve entity.
   *
   * @param edgeId - edge, segment or curve id
   * @returns edge
   */
  public anyEdge(edgeId: string): TopoDS_Edge {
    const owner = this.scene.ownerOf(edgeId);
    if (owner) {
      return requireEdge(this.oc, owner, edgeId);
    }

    for (const entity of this.scene.entities.values()) {
      if (entity.kind === 'path') {
        const segment = entity.segments.find((candidate) => candidate.id === edgeId);
        if (segment) {
          return segment.edge;
        }
      }

      if (entity.kind === 'region') {
        const curve = entity.curves.get(edgeId);
        if (curve) {
          return curve;
        }
      }
    }

    const entity = this.scene.find(edgeId);
    if (entity) {
      const shape = entityShape(this.oc, entity);
      const first = shape ? edges(this.oc, shape)[0] : undefined;
      if (first) {
        return first;
      }
    }

    throw new OfflineEngineError(`Unknown edge ${edgeId}`, 'bad_request');
  }

  public edgeFromSpecifier(spec: EdgeSpecifier): TopoDS_Edge {
    const owner = this.scene.ownerOf(spec.side_faces[0]!);
    if (!owner) {
      throw new OfflineEngineError('Edge reference faces are unknown', 'bad_request');
    }

    return this.resolveEdgeSpecifier(owner, spec);
  }

  public edgeId(solid: SolidEntity, edge: TopoDS_Shape): string {
    const id = idForSubShape(solid.edges, edge, this.mint);
    this.scene.subShapeOwner.set(id, solid.id);
    return id;
  }

  private solidShapes(): Map<string, TopoDS_Shape> {
    const shapes = new Map<string, TopoDS_Shape>();
    for (const entity of this.scene.entities.values()) {
      if (entity.kind === 'solid') {
        shapes.set(entity.id, entity.shape);
      }
    }

    return shapes;
  }

  private buildHandlers(): Record<string, Handler> {
    return {
      scene_clear_all: () => {
        this.scene.clear();
        this.consumedByBoolean.clear();
        this.sketchFrame = undefined;
        return undefined;
      },
      make_plane: (id, cmd) => {
        const frame = frameFromAxes(
          point3(cmd['origin'] as WirePoint3d),
          point3(cmd['x_axis'] as WirePoint3d),
          point3(cmd['y_axis'] as WirePoint3d),
        );
        this.scene.add({ kind: 'plane', id, frame, hidden: Boolean(cmd['hide']) });
        return undefined;
      },
      object_visible: (_id, cmd) => {
        const objectId = cmd['object_id'] as string;
        const entity = this.consumedByBoolean.has(objectId) ? undefined : this.scene.find(objectId);
        if (entity) {
          entity.hidden = Boolean(cmd['hidden']);
        }

        return undefined;
      },
      enable_sketch_mode: (_id, cmd) => {
        this.enableSketchMode(cmd);
        return undefined;
      },
      start_path: (id) => {
        const sketch = this.sketchFrame ?? { frame: globalFrame, entityId: '' };
        const origin = { x: 0, y: 0 };
        this.scene.add({
          kind: 'path',
          id,
          frame: sketch.frame,
          segments: [],
          pen: origin,
          subpathStart: origin,
          holes: [],
          onFace: sketch.onFace,
          hidden: false,
        });
        return undefined;
      },
      move_path_pen: (_id, cmd) => {
        const path = this.requirePath(cmd['path'] as string);
        const to = point3(cmd['to'] as WirePoint3d);
        if (path.segments.length > 0 && Math.hypot(to.x - path.pen.x, to.y - path.pen.y) < 1e-4) {
          // Sketch-block solves leave micron gaps between segments that kcl-lib bridges with a pen move;
          // keep drawing from the current pen so the path stays one connected wire.
          return undefined;
        }

        path.pen = { x: to.x, y: to.y };
        path.subpathStart = path.pen;
        return undefined;
      },
      extend_path: (id, cmd) => {
        const path = this.requirePath(cmd['path'] as string);
        const segment = buildSegment(this.oc, path, id, cmd['segment'] as WirePathSegment);
        if (segment) {
          path.segments.push(segment);
        }

        return undefined;
      },
      close_path: (id, cmd) => {
        const path = this.requirePath(cmd['path_id'] as string);
        const start = path.subpathStart;
        if (Math.hypot(path.pen.x - start.x, path.pen.y - start.y) > 1e-7) {
          const segment = buildSegment(this.oc, path, id, {
            type: 'line',
            end: { x: start.x, y: start.y, z: 0 },
            relative: false,
          });
          if (segment) {
            path.segments.push(segment);
          }
        }

        return { face_id: this.mint() };
      },
      solid2d_add_hole: (_id, cmd) => {
        const path = this.requirePath(cmd['object_id'] as string);
        path.holes.push(cmd['hole_id'] as string);
        const hole = this.scene.find(cmd['hole_id'] as string);
        if (hole) {
          hole.hidden = true;
        }

        return undefined;
      },
      create_region: (id, cmd) => this.createRegion(id, cmd),
      create_region_from_query_point: (id, cmd) => this.createRegionFromPoint(id, cmd),
      extrude: (id, cmd) => this.extrude(id, cmd),
      extrude_to_reference: (id, cmd) => this.extrudeToReference(id, cmd),
      twist_extrude: (id, cmd) => this.twistExtrude(id, cmd),
      revolve: (id, cmd) => this.revolve(id, cmd),
      revolve_about_edge: (id, cmd) => this.revolveAboutEdge(id, cmd),
      sweep: (id, cmd) => this.sweep(id, cmd),
      loft: (id, cmd) => this.loft(id, cmd),
      solid3d_get_extrusion_face_info: (_id, cmd) => this.extrusionFaceInfo(cmd),
      solid3d_get_adjacency_info: () => ({ edges: [] }),
      solid3d_get_body_type: (_id, cmd) => bodyType(this, cmd),
      entity_get_all_child_uuids: (_id, cmd) => ({ entity_ids: childIds(this.scene.get(cmd['entity_id'] as string)) }),
      entity_get_num_children: (_id, cmd) => ({ num: childIds(this.scene.get(cmd['entity_id'] as string)).length }),
      entity_get_child_uuid: (_id, cmd) => ({
        entity_id: childIds(this.scene.get(cmd['entity_id'] as string))[cmd['child_index'] as number],
      }),
      entity_get_parent_id: (_id, cmd) => ({
        entity_id: this.scene.ownerOf(cmd['entity_id'] as string)?.id ?? cmd['entity_id'],
      }),
      get_entity_type: (_id, cmd) => ({ entity_type: entityType(this, cmd['entity_id'] as string) }),
      entity_clone: (id, cmd) => clone(this, id, cmd),
      entity_linear_pattern_transform: (_id, cmd) => patternTransform(this, cmd),
      entity_linear_pattern: (_id, cmd) => linearPattern(this, cmd),
      entity_circular_pattern: (_id, cmd) => circularPattern(this, cmd),
      entity_mirror: (_id, cmd) => mirror2d(this, cmd),
      entity_mirror_across_edge: (_id, cmd) => mirror2dAcrossEdge(this, cmd),
      entity_mirror_across: (_id, cmd) => mirror3d(this, cmd),
      set_object_transform: (_id, cmd) => setObjectTransform(this, cmd),
      boolean_union: (id, cmd) => boolean(this, id, 'union', cmd['solid_ids'] as string[], []),
      boolean_intersection: (id, cmd) => boolean(this, id, 'intersection', cmd['solid_ids'] as string[], []),
      boolean_subtract: (id, cmd) =>
        boolean(this, id, 'subtract', cmd['target_ids'] as string[], cmd['tool_ids'] as string[]),
      boolean_imprint: (id, cmd) => imprint(this, id, cmd),
      solid3d_cut_edge_references: (id, cmd) => cutEdges(this, id, cmd),
      solid3d_cut_edges: (id, cmd) => cutEdges(this, id, cmd),
      solid3d_fillet_edge: (id, cmd) => cutEdges(this, id, cmd),
      solid3d_shell_face: (_id, cmd) => shell(this, cmd),
      solid3d_flip: (_id, cmd) => {
        // Bodies stay outward-oriented here (a mirror is re-oriented as it is applied), so the
        // `scale(x = -1) |> flipSurface()` idiom must not turn a solid inside out; only surfaces flip.
        const solid = this.scene.getSolid(cmd['object_id'] as string);
        if (subShapes(this.oc, solid.shape, 'TopAbs_SOLID').length === 0) {
          solid.shape = solid.shape.Reversed();
        }

        return undefined;
      },
      solid3d_flip_face: () => undefined,
      solid3d_get_all_edge_faces: (_id, cmd) => {
        const solid = this.solidFor(cmd['object_id'] as string, cmd['edge_id'] as string);
        const edge = this.edgeById(solid, cmd['edge_id'] as string);
        return { faces: facesOfEdge(this.oc, solid.shape, edge).map((face) => this.faceId(solid, face)) };
      },
      solid3d_get_all_opposite_edges: (_id, cmd) => {
        const solid = this.solidFor(cmd['object_id'] as string, cmd['edge_id'] as string);
        const edge = this.edgeById(solid, cmd['edge_id'] as string);
        const opposites = facesOfEdge(this.oc, solid.shape, edge).map((face) =>
          this.edgeId(solid, oppositeEdge(this.oc, face, edge)),
        );
        return { edges: opposites };
      },
      solid3d_get_opposite_edge: (_id, cmd) => {
        const solid = this.solidFor(cmd['object_id'] as string, cmd['edge_id'] as string);
        const edge = this.edgeById(solid, cmd['edge_id'] as string);
        const face = requireFace(this.oc, solid, cmd['face_id'] as string);
        return { edge: this.edgeId(solid, oppositeEdge(this.oc, face, edge)) };
      },
      solid3d_get_next_adjacent_edge: (_id, cmd) => adjacent(this, cmd, 'next'),
      solid3d_get_prev_adjacent_edge: (_id, cmd) => adjacent(this, cmd, 'previous'),
      solid3d_get_common_edge: (_id, cmd) => {
        const ids = cmd['face_ids'] as string[];
        const solid = this.solidFor(cmd['object_id'] as string, ids[0]!);
        const found = edgesBetween(
          this.oc,
          ids.map((faceId) => requireFace(this.oc, solid, faceId)),
          [],
        );
        return { edge: found[0] ? this.edgeId(solid, found[0]) : null };
      },
      closest_edge: (_id, cmd) => {
        const solid = this.scene.getSolid(cmd['object_id'] as string);
        const edge = closestEdge(this.oc, solid.shape, point3(cmd['closest_to'] as WirePoint3d));
        return { edge_id: edge ? this.edgeId(solid, edge) : null };
      },
      solid3d_get_edge_uuid: (_id, cmd) => {
        const solid = this.scene.getSolid(cmd['object_id'] as string);
        const list = edges(this.oc, solid.shape);
        const edge = list[cmd['edge_index'] as number];
        if (!edge) {
          throw new OfflineEngineError('Edge index out of range', 'bad_request');
        }

        return { edge_id: this.edgeId(solid, edge) };
      },
      entity_delete_children: (_id, cmd) => deleteFaces(this, cmd),
      solid3d_get_face_uuid: (_id, cmd) => {
        const solid = this.scene.getSolid(cmd['object_id'] as string);
        const face = faces(this.oc, solid.shape)[cmd['face_index'] as number];
        if (!face) {
          throw new OfflineEngineError('Face index out of range', 'bad_request');
        }

        return { face_id: this.faceId(solid, face) };
      },
      face_is_planar: (id, cmd) => faceIsPlanar(this, id, cmd['object_id'] as string),
      face_get_center: (_id, cmd) => {
        const { face } = this.faceById(cmd['object_id'] as string);
        return { pos: faceCentroid(this.oc, face).center };
      },
      entity_make_helix_from_params: (id, cmd) => helixFromParams(this, id, cmd),
      entity_make_helix: (id, cmd) => helixOnCylinder(this, id, cmd),
      entity_make_helix_from_edge: (id, cmd) => helixFromEdge(this, id, cmd),
      surface_blend: (id, cmd) => surfaceBlend(this, id, cmd),
      solid3d_multi_join: (id, cmd) => this.join(id, cmd['object_ids'] as string[]),
      object_set_material_params_pbr: (_id, cmd) => {
        const solid = this.scene.find(cmd['object_id'] as string);
        if (solid?.kind === 'solid') {
          const color = cmd['color'] as { r: number; g: number; b: number; a: number } | undefined;
          solid.color = color;
          solid.metalness = cmd['metalness'] as number | undefined;
          solid.roughness = cmd['roughness'] as number | undefined;
        }

        return undefined;
      },
      bounding_box: (_id, cmd) => measureBoundingBox(this, cmd),
      volume: (_id, cmd) => ({
        volume: sumMass(this, cmd, 'volume') * unitScale(cmd['output_unit'] as string, 3),
        output_unit: cmd['output_unit'],
      }),
      surface_area: (_id, cmd) => ({
        surface_area: sumMass(this, cmd, 'area') * unitScale(cmd['output_unit'] as string, 2),
        output_unit: cmd['output_unit'],
      }),
      mass: (_id, cmd) => ({
        mass: sumMass(this, cmd, 'volume') * 1e-9 * (cmd['material_density'] as number) * 1000,
        output_unit: cmd['output_unit'],
      }),
      density: (_id, cmd) => ({ density: cmd['material_mass'], output_unit: cmd['output_unit'] }),
      center_of_mass: (_id, cmd) => {
        const shapes = this.shapesOf(cmd['entity_ids'] as string[]);
        const props = new this.oc.GProp_GProps();
        this.oc.BRepGProp.VolumeProperties(compound(this.oc, shapes), props, false, false, false);
        const center = props.CentreOfMass();
        const result = {
          center_of_mass: { x: center.X(), y: center.Y(), z: center.Z() },
          output_unit: cmd['output_unit'],
        };
        props.delete();
        return result;
      },
      export: (_id, cmd) => ({ files: this.export(cmd['format'] as WireOutputFormat) }),
    };
  }

  private enableSketchMode(cmd: ModelingCommand): undefined {
    const entityId = cmd['entity_id'] as string;
    const entity = this.scene.find(entityId);
    if (entity?.kind === 'plane') {
      this.sketchFrame = { frame: entity.frame, entityId };
      return undefined;
    }

    if (entity && entity.kind !== 'solid') {
      // Re-entering a sketch to extrude it; keep the sketch's own frame.
      this.sketchFrame = { frame: sketchFrameOf(entity) ?? globalFrame, entityId };
      return undefined;
    }

    const owner = entity?.kind === 'solid' ? undefined : this.scene.ownerOf(entityId);
    if (owner) {
      const face = requireFace(this.oc, owner, entityId);
      this.sketchFrame = {
        frame: this.faceFrame(owner, entityId, face),
        entityId,
        onFace: { solidId: owner.id, faceId: entityId },
      };
      return undefined;
    }

    const normal = cmd['planar_normal'] as WirePoint3d | undefined;
    this.sketchFrame = {
      frame: normal ? frameFromNormal(point3(normal)) : globalFrame,
      entityId,
    };
    return undefined;
  }

  private requirePath(id: string): PathEntity {
    const entity = this.scene.get(id);
    if (entity.kind !== 'path') {
      throw new OfflineEngineError(`Entity ${id} is a ${entity.kind}, expected a sketch path`, 'bad_request');
    }

    return entity;
  }

  private holesOf(path: PathEntity): PathEntity[] {
    return path.holes
      .map((holeId) => this.scene.find(holeId))
      .filter((hole): hole is PathEntity => hole?.kind === 'path');
  }

  private createRegion(id: string, cmd: ModelingCommand): Record<string, unknown> {
    const path = this.requirePath(cmd['object_id'] as string);
    const arrangement = pathFaces(this.oc, path, this.holesOf(path));
    const face = selectRegion(
      this.oc,
      arrangement,
      cmd['segment'] as string,
      cmd['intersection_segment'] as string,
      (cmd['intersection_index'] as number | undefined) ?? -1,
      Boolean(cmd['curve_clockwise']),
    );
    return this.addRegion(id, path, face, arrangement.pieces);
  }

  private createRegionFromPoint(id: string, cmd: ModelingCommand): Record<string, unknown> {
    const path = this.requirePath(cmd['object_id'] as string);
    const arrangement = pathFaces(this.oc, path, this.holesOf(path));
    const face = regionAtPoint(this.oc, arrangement, path.frame, point2(cmd['query_point'] as WirePoint2d));
    return this.addRegion(id, path, face, arrangement.pieces);
  }

  private addRegion(
    id: string,
    path: PathEntity,
    face: TopoDS_Face,
    pieces: ReadonlyMap<string, TopoDS_Edge[]>,
  ): Record<string, unknown> {
    const curves = new Map<string, TopoDS_Edge>();
    const mapping: Record<string, string> = {};
    const segmentOrder = new Map(path.segments.map((segment, index) => [segment.id, index]));
    let firstCurveId: string | undefined;
    let firstRank = Number.POSITIVE_INFINITY;
    for (const edge of orientedFaceEdges(this.oc, face)) {
      const segmentId = [...pieces].find(([, list]) => list.some((piece) => piece.IsSame(edge)))?.[0];
      if (!segmentId || [...curves.values()].some((existing) => existing.IsSame(edge))) {
        continue;
      }

      const curveId = this.mint();
      curves.set(curveId, edge);
      mapping[curveId] = segmentId;
      const rank = segmentOrder.get(segmentId) ?? Number.POSITIVE_INFINITY;
      if (rank < firstRank) {
        firstRank = rank;
        firstCurveId = curveId;
      }
    }

    const region: RegionEntity = {
      kind: 'region',
      id,
      frame: path.frame,
      face,
      curves,
      firstCurveId,
      onFace: path.onFace,
      hidden: false,
    };
    this.scene.add(region);
    return { region_mapping: mapping };
  }

  /**
   * The profile a sweep moves: a path or region, a body's face, or (for a surface extrude) a body's edge. A face or
   * edge profile takes the command id, which kcl-lib gives the new body.
   *
   * @param targetId - path, region, face or edge id
   * @param surface - whether the sweep makes a surface body
   * @param commandId - the sweep command's id
   * @returns profile
   */
  private profileOf(targetId: string, surface = false, commandId = targetId): Profile {
    const entity = this.scene.find(targetId);
    if (surface && entity?.kind === 'path') {
      // A surface sweep takes the open curves themselves, not the area they enclose.
      return {
        sourceId: entity.id,
        frame: entity.frame,
        faces: [],
        curves: entity.segments.map((segment) => ({ id: segment.id, edge: segment.edge })),
        onFace: entity.onFace,
      };
    }

    if (entity?.kind === 'region') {
      return {
        sourceId: entity.id,
        frame: entity.frame,
        faces: [entity.face],
        curves: [...entity.curves].map(([id, edge]) => ({ id, edge })),
        firstCurveId: entity.firstCurveId,
        onFace: entity.onFace,
        surface,
      };
    }

    if (entity?.kind === 'path') {
      const holes = this.holesOf(entity);
      const arrangement = pathFaces(this.oc, entity, holes);
      const curves: Array<{ id: string; edge: TopoDS_Edge }> = [];
      const faceEdges = arrangement.faces.flatMap((face) => edges(this.oc, face));
      for (const segment of [...entity.segments, ...holes.flatMap((hole) => hole.segments)]) {
        const piece = (arrangement.pieces.get(segment.id) ?? []).find((candidate) =>
          faceEdges.some((edge) => edge.IsSame(candidate)),
        );
        if (piece) {
          curves.push({ id: segment.id, edge: piece });
        }
      }

      return {
        sourceId: entity.id,
        frame: entity.frame,
        faces: arrangement.faces,
        curves,
        firstCurveId: curves[0]?.id,
        onFace: entity.onFace,
      };
    }

    const owner = entity ? undefined : this.scene.ownerOf(targetId);
    if (owner?.faces.has(targetId)) {
      const face = requireFace(this.oc, owner, targetId);
      return {
        sourceId: commandId,
        frame: this.faceFrame(owner, targetId, face),
        faces: [face],
        curves: [],
        onFace: { solidId: owner.id, faceId: targetId },
        surface,
      };
    }

    if (owner) {
      return this.edgeProfile(owner, requireEdge(this.oc, owner, targetId), commandId);
    }

    throw new OfflineEngineError(
      entity ? `Cannot sweep a ${entity.kind}` : `Unknown entity ${targetId}`,
      'bad_request',
    );
  }

  /**
   * A body's edge as an open profile, facing the way Zoo extrudes an edge when no direction is given.
   *
   * @param owner - the body the edge belongs to
   * @param edge - edge
   * @param sourceId - the new body's id
   * @returns profile
   */
  private edgeProfile(owner: SolidEntity, edge: TopoDS_Edge, sourceId: string): Profile {
    return {
      sourceId,
      frame: frameFromNormal(edgeExtrudeDirection(this.oc, owner.shape, edge)),
      faces: [],
      curves: [{ id: this.mint(), edge }],
    };
  }

  /**
   * The profile of an extrude-like command: its `target`, or the edge its `target_reference` names.
   *
   * @param id - command id
   * @param cmd - command payload
   * @returns profile
   */
  private commandProfile(id: string, cmd: ModelingCommand): Profile {
    const reference = cmd['target_reference'] as EdgeSpecifier | undefined;
    const owner = reference && this.scene.ownerOf(reference.side_faces[0]!);
    return owner
      ? this.edgeProfile(owner, this.resolveEdgeSpecifier(owner, reference), id)
      : this.profileOf(cmd['target'] as string, cmd['body_type'] === 'surface', id);
  }

  private extrude(id: string, cmd: ModelingCommand): Record<string, unknown> {
    const profile = this.commandProfile(id, cmd);
    const distance = cmd['distance'] as number;
    const opposite = cmd['opposite'] as 'None' | 'Symmetric' | { Other: number } | undefined;
    let extent = { offset: 0, length: distance };
    const other = opposite && typeof opposite === 'object' && 'Other' in opposite ? opposite.Other : undefined;
    if (this.isEdgeProfile(id, profile)) {
      // Zoo extrudes an edge one way only: `symmetric` changes nothing and a second length adds to the first
      // (its recorded bounding boxes for surface_extrude_edge_symmetric and _bidirectional).
      extent.length += other ?? 0;
    } else if (opposite === 'Symmetric') {
      extent = { offset: -distance / 2, length: distance };
    } else if (other !== undefined) {
      // The second length runs the other way from the sketch plane, whichever way the first one goes.
      const sign = distance < 0 ? -1 : 1;
      extent = { offset: -sign * other, length: distance + sign * other };
    }

    const direction = this.extrudeDirection(profile, cmd);
    const result = extrudeProfile(this.oc, profile, direction, extent, cmd['faces'] as PresetFaces, this.mint);
    this.commitSweep(profile, result, { merge: cmd['extrude_method'] !== 'new', cut: distance < 0 });
    return {};
  }

  private extrudeDirection(profile: Profile, cmd: ModelingCommand): Vec3 {
    const direction = cmd['direction'] as { axis?: { direction: WirePoint3d }; edge?: { id: string } } | undefined;
    if (direction?.axis) {
      return normalize(point3(direction.axis.direction));
    }

    const reference = cmd['direction_reference'] as EdgeSpecifier | undefined;
    const edge = direction?.edge ? this.anyEdge(direction.edge.id) : reference && this.edgeFromSpecifier(reference);
    if (!edge) {
      return profile.frame.z;
    }

    // An edge named by its faces points the way the last face's boundary runs along it, as Zoo's
    // surface_extrude_edge_specifier_direction bounding box shows.
    const face = reference && this.faceById(reference.side_faces.at(-1)!).face;
    const reversed =
      face &&
      edges(this.oc, face)
        .find((candidate) => candidate.IsSame(edge))
        ?.Orientation();
    const along = sub(edgePoint(this.oc, edge, 1).point, edgePoint(this.oc, edge, 0).point);
    return normalize(scale(along, reversed === this.oc.TopAbs_Orientation.TopAbs_REVERSED ? -1 : 1));
  }

  /**
   * Whether a profile is a body's edge, which an extrude turns into a surface.
   *
   * @param id - command id
   * @param profile - the extruded profile
   * @returns whether it is an edge profile
   */
  private isEdgeProfile(id: string, profile: Profile): boolean {
    return profile.sourceId === id && profile.faces.length === 0;
  }

  private extrudeToReference(id: string, cmd: ModelingCommand): Record<string, unknown> {
    const profile = this.commandProfile(id, cmd);
    const reference = cmd['reference'] as
      | { entity_reference: { entity_id?: string; entity_reference?: { type: string } & EdgeSpecifier } }
      | { axis: { axis: WirePoint3d; point: WirePoint3d } }
      | { point: { point: WirePoint3d } };
    let target: Vec3;
    if ('point' in reference) {
      target = point3(reference.point.point);
    } else if ('axis' in reference) {
      target = point3(reference.axis.point);
    } else if (reference.entity_reference.entity_reference?.type === 'edge') {
      // An `{ sideFaces, endFaces }` target: extrude until the profile reaches the edge's midpoint.
      target = edgePoint(this.oc, this.edgeFromSpecifier(reference.entity_reference.entity_reference), 0.5).point;
    } else {
      const entity = reference.entity_reference.entity_id
        ? this.scene.find(reference.entity_reference.entity_id)
        : undefined;
      target = entity ? entityCenter(this.oc, entity) : profile.frame.origin;
      if (entity?.kind === 'plane') {
        target = entity.frame.origin;
      }
    }

    const origin = profile.faces[0]
      ? faceCentroid(this.oc, profile.faces[0]).center
      : edgePoint(this.oc, profile.curves[0]!.edge, 0.5).point;
    let distance = dot(sub(target, origin), profile.frame.z);
    const planeId = 'entity_reference' in reference ? reference.entity_reference.entity_id : undefined;
    const plane = planeId === undefined ? undefined : this.scene.find(planeId);
    if (plane?.kind === 'plane' && this.isEdgeProfile(id, profile)) {
      // An edge extrudes along its own direction until it meets the plane.
      const along = dot(profile.frame.z, plane.frame.z);
      if (Math.abs(along) < 1e-9) {
        throw new OfflineEngineError('The edge extrudes parallel to the reference plane', 'bad_request');
      }

      distance = dot(sub(target, origin), plane.frame.z) / along;
    }
    const result = extrudeProfile(
      this.oc,
      profile,
      profile.frame.z,
      { offset: 0, length: distance },
      cmd['faces'] as PresetFaces,
      this.mint,
    );
    this.commitSweep(profile, result, { merge: cmd['extrude_method'] !== 'new', cut: distance < 0 });
    return {};
  }

  private twistExtrude(_id: string, cmd: ModelingCommand): Record<string, unknown> {
    const profile = this.profileOf(cmd['target'] as string);
    const result = twistExtrudeProfile(
      this.oc,
      profile,
      {
        distance: cmd['distance'] as number,
        center: point2(cmd['center_2d'] as WirePoint2d),
        totalAngle: toRadians(cmd['total_rotation_angle'] as WireAngle),
        stepAngle: toRadians(cmd['angle_step_size'] as WireAngle),
      },
      this.mint,
    );
    this.commitSweep(profile, result, { merge: false, cut: false });
    return {};
  }

  private revolve(id: string, cmd: ModelingCommand): Record<string, unknown> {
    const profile = this.commandProfile(id, cmd);
    const axisWire = point3(cmd['axis'] as WirePoint3d);
    const originWire = point3(cmd['origin'] as WirePoint3d);
    const axis = cmd['axis_is_2d']
      ? {
          origin: add(toGlobal(profile.frame, originWire.x, originWire.y), scale(profile.frame.z, originWire.z)),
          direction: normalize(directionToGlobal(profile.frame, axisWire.x, axisWire.y)),
        }
      : { origin: originWire, direction: normalize(axisWire) };
    this.revolveWith(profile, axis, cmd);
    return {};
  }

  private revolveAboutEdge(id: string, cmd: ModelingCommand): Record<string, unknown> {
    const profile = this.commandProfile(id, cmd);
    const edge = commandEdge(this, cmd);
    const start = edgePoint(this.oc, edge, 0);
    const end = edgePoint(this.oc, edge, 1);
    this.revolveWith(
      profile,
      { origin: start.point, direction: normalize(sub(end.point, start.point), start.tangent) },
      cmd,
    );
    return {};
  }

  private revolveWith(profile: Profile, axis: { origin: Vec3; direction: Vec3 }, cmd: ModelingCommand): void {
    const angle = toRadians(cmd['angle'] as WireAngle);
    const opposite = cmd['opposite'] as 'None' | 'Symmetric' | { Other: WireAngle } | undefined;
    let sweep = { offset: 0, sweep: angle };
    if (opposite === 'Symmetric') {
      sweep = { offset: -angle / 2, sweep: angle };
    } else if (opposite && typeof opposite === 'object' && 'Other' in opposite) {
      const other = toRadians(opposite.Other);
      const sign = angle < 0 ? -1 : 1;
      sweep = { offset: -sign * other, sweep: angle + sign * other };
    }

    const result = revolveProfile(this.oc, profile, axis, sweep, null, this.mint);
    this.commitSweep(profile, result, { merge: false, cut: false });
  }

  private sweep(id: string, cmd: ModelingCommand): Record<string, unknown> {
    const profile = this.commandProfile(id, cmd);
    const trajectory = this.scene.get(cmd['trajectory'] as string);
    let spine: TopoDS_Shape;
    if (trajectory.kind === 'curve') {
      spine = trajectory.shape;
    } else if (trajectory.kind === 'path') {
      spine = wireFromEdges(
        this.oc,
        trajectory.segments.map((segment) => segment.edge),
      );
    } else {
      throw new OfflineEngineError(`Cannot sweep along a ${trajectory.kind}`, 'bad_request');
    }

    if (spine.ShapeType() !== this.oc.TopAbs_ShapeEnum.TopAbs_WIRE) {
      spine = wireFromEdges(this.oc, edges(this.oc, spine));
    }

    const result = sweepProfile(
      this.oc,
      this.placeOnPath(profile, spine, cmd),
      spine,
      this.mint,
      trajectory.kind === 'curve' ? trajectory.axis : undefined,
    );
    this.commitSweep(profile, result, { merge: false, cut: false });
    trajectory.hidden = true;
    return {};
  }

  /**
   * Places a sweep's profile as a version 2 sweep asks: `orient_profile_perpendicular` turns the sketch plane, about
   * its origin, until its normal runs along the path's start tangent; `translate_profile_to_path` then moves the
   * sketch plane's origin onto the path's start. Without either flag the profile stays where it was sketched.
   */
  private placeOnPath(profile: Profile, spine: TopoDS_Shape, cmd: ModelingCommand): Profile {
    const translate = cmd['translate_profile_to_path'] === true;
    const orient = cmd['orient_profile_perpendicular'] === true;
    if (!translate && !orient) {
      return profile;
    }

    const explorer = new this.oc.BRepTools_WireExplorer(this.oc.TopoDS.Wire(spine));
    const first = explorer.Current();
    explorer.delete();
    const reversed = first.Orientation() === this.oc.TopAbs_Orientation.TopAbs_REVERSED;
    const start = edgePoint(this.oc, first, reversed ? 1 : 0);
    const tangent = normalize(reversed ? scale(start.tangent, -1) : start.tangent);
    const { origin, z: normal } = profile.frame;
    const trsf = new this.oc.gp_Trsf();
    if (orient) {
      const axis = cross(normal, tangent);
      const angle = Math.atan2(length(axis), dot(normal, tangent));
      if (length(axis) > 1e-12) {
        trsf.PreMultiply(rotationTrsf(this.oc, origin, axis, angle));
      } else if (angle > Math.PI / 2) {
        trsf.PreMultiply(rotationTrsf(this.oc, origin, profile.frame.x, Math.PI));
      }
    }

    if (translate) {
      trsf.PreMultiply(translationTrsf(this.oc, sub(start.point, origin)));
    }

    return moveProfile(this.oc, profile, trsf);
  }

  private loft(id: string, cmd: ModelingCommand): Record<string, unknown> {
    const sectionIds = cmd['section_ids'] as string[];
    const surface = cmd['body_type'] === 'surface';
    const profiles = sectionIds.map((sectionId) => {
      const profile = this.profileOf(sectionId);
      return profile.faces.length > 0 || !surface ? profile : this.profileOf(sectionId, true);
    });
    const result = loftProfiles(this.oc, profiles, (cmd['v_degree'] as number) <= 1, this.mint, !surface);
    const solid: SolidEntity = {
      kind: 'solid',
      id,
      shape: result.shape,
      faces: result.faces,
      edges: result.edges,
      sweeps: [result.sweep],
      frame: profiles[0]!.frame,
      hidden: false,
    };
    for (const sectionId of sectionIds) {
      const section = this.scene.find(sectionId);
      if (section) {
        section.hidden = true;
      }
    }

    this.scene.add(solid);
    return { solid_id: id };
  }

  /**
   * Stitches bodies (surfaces, typically) into one new body with the command id, consuming the inputs.
   *
   * @param id - command id; the joined body's id
   * @param ids - bodies to join
   * @returns empty response
   */
  private join(id: string, ids: string[]): Record<string, unknown> {
    const [first, ...rest] = ids.map((objectId) => this.scene.getSolid(objectId));
    const body: SolidEntity = {
      ...first!,
      id,
      faces: new Map(first!.faces),
      edges: new Map(first!.edges),
      hidden: false,
    };
    for (const other of rest) {
      this.mergeInto(body, other, false);
    }

    for (const objectId of ids) {
      this.scene.remove(objectId);
      this.scene.aliases.set(objectId, id);
    }

    this.scene.add(body);
    return {};
  }

  private commitSweep(profile: Profile, result: SweepResult, mode: { merge: boolean; cut: boolean }): void {
    const parent = mode.merge && profile.onFace ? this.scene.find(profile.onFace.solidId) : undefined;
    if (parent?.kind === 'solid') {
      const before = { shape: parent.shape, faces: new Map(parent.faces), edges: new Map(parent.edges) };
      this.mergeInto(parent, result, mode.cut);
      parent.lastMerge = { before, tool: result, cut: mode.cut, after: parent.shape };
      parent.sweeps.push(result.sweep);
      this.scene.remove(profile.sourceId);
      this.scene.aliases.set(profile.sourceId, parent.id);
      this.scene.claim(parent);
      return;
    }

    const solid: SolidEntity = {
      kind: 'solid',
      id: profile.sourceId,
      shape: result.shape,
      faces: result.faces,
      edges: result.edges,
      sweeps: [result.sweep],
      frame: profile.frame,
      hidden: false,
    };
    this.scene.add(solid);
  }

  private extrusionFaceInfo(cmd: ModelingCommand): Record<string, unknown> {
    const solid = this.scene.getSolid(cmd['object_id'] as string);
    const edgeId = cmd['edge_id'] as string;
    const sweep =
      [...solid.sweeps].reverse().find((candidate) => candidate.curveIds.includes(edgeId)) ?? solid.sweeps.at(-1);
    if (!sweep) {
      return { faces: [] };
    }

    const info: Array<{ curve_id?: string; face_id?: string; cap: string }> = sweep.curveIds.map((curveId) => ({
      curve_id: curveId,
      face_id: sweep.sideFaceByCurve.get(curveId),
      cap: 'none',
    }));
    if (sweep.startCapId) {
      info.push({ face_id: sweep.startCapId, cap: 'bottom' });
    }

    if (sweep.endCapId) {
      info.push({ face_id: sweep.endCapId, cap: 'top' });
    }

    return { faces: info };
  }

  private faceId(solid: SolidEntity, face: TopoDS_Shape): string {
    const id = idForSubShape(solid.faces, face, this.mint);
    this.scene.subShapeOwner.set(id, solid.id);
    return id;
  }
}
