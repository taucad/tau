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
import type { Frame, Vec2, Vec3 } from '#offline/offline-math.js';
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
  toLocal,
  vec3,
} from '#offline/offline-math.js';
import type { Oc, TopoDS_Edge, TopoDS_Face, TopoDS_Shape } from '#offline/offline-occt.js';
import {
  ShapeIndex,
  arrayToList,
  boundingBox,
  compound,
  edgePoint,
  edges,
  faceCentroid,
  faces,
  listToArray,
  massProperties,
  planarFaceFrame,
  pnt,
  subShapes,
} from '#offline/offline-occt.js';
import type { OfflineProfiler } from '#offline/offline-profiler.js';
import type { Entity, PathEntity, RegionEntity, SolidEntity } from '#offline/offline-scene.js';
import { OfflineScene } from '#offline/offline-scene.js';
import type { WirePathSegment } from '#offline/offline-sketch.js';
import { shellPrism } from '#offline/offline-shell.js';
import { buildSegment, orientedFaceEdges, pathFaces, regionAtPoint, selectRegion } from '#offline/offline-sketch.js';
import type { PresetFaces, Profile, SweepResult } from '#offline/offline-sweeps.js';
import {
  extrudeProfile,
  loftProfiles,
  orientOutward,
  revolveProfile,
  sweepProfile,
  twistExtrudeProfile,
  wireFromEdges,
} from '#offline/offline-sweeps.js';
import type { ShapeHistory } from '#offline/offline-topology.js';
import {
  adjacentEdge,
  algoHistory,
  edgesBetween,
  faceSketchFrame,
  facesOfEdge,
  idForSubShape,
  oppositeEdge,
  rebaseSolid,
  remapIds,
  requireEdge,
  requireFace,
} from '#offline/offline-topology.js';
import type { WireTransform } from '#offline/offline-transform.js';
import {
  applyTrsf,
  childIds,
  entityCenter,
  entityShape,
  patternTrsf,
  planeMirrorTrsf,
  rotationTrsf,
  scaleEntityPerAxis,
  sketchFrameOf,
  transformEntity,
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
import type { WireOutputFormat } from '#offline/offline-export.js';

type Handler = (id: string, cmd: ModelingCommand) => Record<string, unknown> | undefined;

type EdgeSpecifier = { side_faces: string[]; end_faces?: string[]; index?: number | undefined };

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

const point3 = (p: WirePoint3d | undefined): Vec3 => vec3(p?.x ?? 0, p?.y ?? 0, p?.z ?? 0);
const point2 = (p: WirePoint2d | undefined): Vec2 => ({ x: p?.x ?? 0, y: p?.y ?? 0 });

/** Engine construction options. */
export type OfflineEngineOptions = {
  /** Id factory for engine-minted face and edge ids; injectable for deterministic tests. */
  mintId?: () => string;
};

/**
 * The offline modeling engine.
 *
 * @public
 */
export class OfflineEngine {
  public readonly scene = new OfflineScene();
  /** Commands that reached the default handler, for coverage reports. */
  public readonly unhandled = new Map<string, number>();
  // oxlint-disable-next-line @typescript-eslint/parameter-properties -- erasableSyntaxOnly forbids parameter properties
  private readonly oc: Oc;
  private readonly profiler: OfflineProfiler | undefined;
  private readonly mint: () => string;
  private readonly handlers: Record<string, Handler>;
  private sketchFrame: { frame: Frame; entityId: string; onFace?: { solidId: string; faceId: string } } | undefined;
  private interruption: string | undefined;

  public constructor(oc: Oc, profiler?: OfflineProfiler, options: OfflineEngineOptions = {}) {
    this.oc = oc;
    this.profiler = profiler;
    this.mint = options.mintId ?? randomUuid;
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

    return this.profiler ? this.profiler.timeCommand(cmd.type, run) : run();
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

  // ---------------------------------------------------------------------------------------------------------------
  // Dispatch table
  // ---------------------------------------------------------------------------------------------------------------

  // oxlint-disable-next-line max-lines-per-function -- one entry per command
  private buildHandlers(): Record<string, Handler> {
    return {
      scene_clear_all: () => {
        this.scene.clear();
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
        const entity = this.scene.find(cmd['object_id'] as string);
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
      entity_get_all_child_uuids: (_id, cmd) => ({ entity_ids: childIds(this.scene.get(cmd['entity_id'] as string)) }),
      entity_get_num_children: (_id, cmd) => ({ num: childIds(this.scene.get(cmd['entity_id'] as string)).length }),
      entity_get_child_uuid: (_id, cmd) => ({
        entity_id: childIds(this.scene.get(cmd['entity_id'] as string))[cmd['child_index'] as number],
      }),
      entity_get_parent_id: (_id, cmd) => ({
        entity_id: this.scene.ownerOf(cmd['entity_id'] as string)?.id ?? cmd['entity_id'],
      }),
      get_entity_type: (_id, cmd) => ({ entity_type: this.entityType(cmd['entity_id'] as string) }),
      entity_clone: (id, cmd) => this.clone(id, cmd),
      entity_linear_pattern_transform: (_id, cmd) => this.patternTransform(cmd),
      entity_linear_pattern: (_id, cmd) => this.linearPattern(cmd),
      entity_circular_pattern: (_id, cmd) => this.circularPattern(cmd),
      entity_mirror: (_id, cmd) => this.mirror2d(cmd),
      entity_mirror_across_edge: (_id, cmd) => this.mirror2dAcrossEdge(cmd),
      entity_mirror_across: (_id, cmd) => this.mirror3d(cmd),
      set_object_transform: (_id, cmd) => this.setObjectTransform(cmd),
      boolean_union: (id, cmd) => this.boolean(id, 'union', cmd['solid_ids'] as string[], []),
      boolean_intersection: (id, cmd) => this.boolean(id, 'intersection', cmd['solid_ids'] as string[], []),
      boolean_subtract: (id, cmd) =>
        this.boolean(id, 'subtract', cmd['target_ids'] as string[], cmd['tool_ids'] as string[]),
      boolean_imprint: (id, cmd) => this.imprint(id, cmd),
      solid3d_cut_edge_references: (id, cmd) => this.cutEdges(id, cmd),
      solid3d_cut_edges: (id, cmd) => this.cutEdges(id, cmd),
      solid3d_fillet_edge: (id, cmd) => this.cutEdges(id, cmd),
      solid3d_shell_face: (_id, cmd) => this.shell(cmd),
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
      solid3d_get_next_adjacent_edge: (_id, cmd) => this.adjacent(cmd, 'next'),
      solid3d_get_prev_adjacent_edge: (_id, cmd) => this.adjacent(cmd, 'previous'),
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
      solid3d_get_edge_uuid: (_id, cmd) => {
        const solid = this.scene.getSolid(cmd['object_id'] as string);
        const list = edges(this.oc, solid.shape);
        const edge = list[cmd['edge_index'] as number];
        if (!edge) {
          throw new OfflineEngineError('Edge index out of range', 'bad_request');
        }

        return { edge_id: this.edgeId(solid, edge) };
      },
      solid3d_get_face_uuid: (_id, cmd) => {
        const solid = this.scene.getSolid(cmd['object_id'] as string);
        const face = faces(this.oc, solid.shape)[cmd['face_index'] as number];
        if (!face) {
          throw new OfflineEngineError('Face index out of range', 'bad_request');
        }

        return { face_id: this.faceId(solid, face) };
      },
      face_is_planar: (id, cmd) => this.faceIsPlanar(id, cmd['object_id'] as string),
      face_get_center: (_id, cmd) => {
        const { face } = this.faceById(cmd['object_id'] as string);
        return { pos: faceCentroid(this.oc, face).center };
      },
      entity_make_helix_from_params: (id, cmd) => this.helixFromParams(id, cmd),
      entity_make_helix: (id, cmd) => this.helixOnCylinder(id, cmd),
      entity_make_helix_from_edge: (id, cmd) => this.helixFromEdge(id, cmd),
      surface_blend: (id, cmd) => this.surfaceBlend(id, cmd),
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
      bounding_box: (_id, cmd) => this.boundingBox(cmd),
      volume: (_id, cmd) => ({
        volume: this.sumMass(cmd, 'volume') * unitScale(cmd['output_unit'] as string, 3),
        output_unit: cmd['output_unit'],
      }),
      surface_area: (_id, cmd) => ({
        surface_area: this.sumMass(cmd, 'area') * unitScale(cmd['output_unit'] as string, 2),
        output_unit: cmd['output_unit'],
      }),
      mass: (_id, cmd) => ({
        mass: this.sumMass(cmd, 'volume') * 1e-9 * (cmd['material_density'] as number) * 1000,
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

  // ---------------------------------------------------------------------------------------------------------------
  // Sketching
  // ---------------------------------------------------------------------------------------------------------------

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

  // ---------------------------------------------------------------------------------------------------------------
  // Profiles and sweeps
  // ---------------------------------------------------------------------------------------------------------------

  private profileOf(targetId: string, surface = false): Profile {
    const entity = this.scene.get(targetId);
    if (surface && entity.kind === 'path') {
      // A surface sweep takes the open curves themselves, not the area they enclose.
      return {
        sourceId: entity.id,
        frame: entity.frame,
        faces: [],
        curves: entity.segments.map((segment) => ({ id: segment.id, edge: segment.edge })),
        onFace: entity.onFace,
      };
    }

    if (entity.kind === 'region') {
      return {
        sourceId: entity.id,
        frame: entity.frame,
        faces: [entity.face],
        curves: [...entity.curves].map(([id, edge]) => ({ id, edge })),
        firstCurveId: entity.firstCurveId,
        onFace: entity.onFace,
      };
    }

    if (entity.kind === 'path') {
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

    const owner = this.scene.ownerOf(targetId);
    if (owner?.faces.has(targetId)) {
      const face = requireFace(this.oc, owner, targetId);
      return {
        sourceId: targetId,
        frame: this.faceFrame(owner, targetId, face),
        faces: [face],
        curves: [],
        onFace: { solidId: owner.id, faceId: targetId },
      };
    }

    throw new OfflineEngineError(`Cannot sweep a ${entity.kind}`, 'bad_request');
  }

  private extrude(_id: string, cmd: ModelingCommand): Record<string, unknown> {
    const profile = this.profileOf(cmd['target'] as string, cmd['body_type'] === 'surface');
    const distance = cmd['distance'] as number;
    const opposite = cmd['opposite'] as 'None' | 'Symmetric' | { Other: number } | undefined;
    let extent = { offset: 0, length: distance };
    if (opposite === 'Symmetric') {
      extent = { offset: -distance / 2, length: distance };
    } else if (opposite && typeof opposite === 'object' && 'Other' in opposite) {
      // The second length runs the other way from the sketch plane, whichever way the first one goes.
      const sign = distance < 0 ? -1 : 1;
      extent = { offset: -sign * opposite.Other, length: distance + sign * opposite.Other };
    }

    const direction = this.extrudeDirection(
      profile,
      cmd['direction'] as { axis?: { direction: WirePoint3d } } | undefined,
    );
    const result = extrudeProfile(this.oc, profile, direction, extent, cmd['faces'] as PresetFaces, this.mint);
    this.commitSweep(profile, result, { merge: cmd['extrude_method'] !== 'new', cut: distance < 0 });
    return {};
  }

  private extrudeDirection(profile: Profile, direction: { axis?: { direction: WirePoint3d } } | undefined): Vec3 {
    if (direction?.axis) {
      return normalize(point3(direction.axis.direction));
    }

    return profile.frame.z;
  }

  private extrudeToReference(id: string, cmd: ModelingCommand): Record<string, unknown> {
    const profile = this.profileOf(cmd['target'] as string);
    const reference = cmd['reference'] as
      | { entity_reference: { entity_id?: string } }
      | { axis: { axis: WirePoint3d; point: WirePoint3d } }
      | { point: { point: WirePoint3d } };
    let target: Vec3;
    if ('point' in reference) {
      target = point3(reference.point.point);
    } else if ('axis' in reference) {
      target = point3(reference.axis.point);
    } else {
      const entity = reference.entity_reference.entity_id
        ? this.scene.find(reference.entity_reference.entity_id)
        : undefined;
      target = entity ? entityCenter(this.oc, entity) : profile.frame.origin;
      if (entity?.kind === 'plane') {
        target = entity.frame.origin;
      }
    }

    const origin = faceCentroid(this.oc, profile.faces[0]!).center;
    const distance = dot(sub(target, origin), profile.frame.z);
    const result = extrudeProfile(
      this.oc,
      profile,
      profile.frame.z,
      { offset: 0, length: distance },
      cmd['faces'] as PresetFaces,
      this.mint,
    );
    void id;
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

  private revolve(_id: string, cmd: ModelingCommand): Record<string, unknown> {
    const profile = this.profileOf(cmd['target'] as string);
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

  private revolveAboutEdge(_id: string, cmd: ModelingCommand): Record<string, unknown> {
    const profile = this.profileOf(cmd['target'] as string);
    const edgeId = cmd['edge_id'] as string;
    const edge = this.anyEdge(edgeId);
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

  private sweep(_id: string, cmd: ModelingCommand): Record<string, unknown> {
    const profile = this.profileOf(cmd['target'] as string);
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
      profile,
      spine,
      this.mint,
      trajectory.kind === 'curve' ? trajectory.axis : undefined,
    );
    this.commitSweep(profile, result, { merge: false, cut: false });
    trajectory.hidden = true;
    return {};
  }

  private loft(id: string, cmd: ModelingCommand): Record<string, unknown> {
    const sectionIds = cmd['section_ids'] as string[];
    const profiles = sectionIds.map((sectionId) => this.profileOf(sectionId));
    const result = loftProfiles(
      this.oc,
      profiles,
      (cmd['v_degree'] as number) <= 1,
      this.mint,
      cmd['body_type'] !== 'surface',
    );
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
   * Turns a sweep into a scene solid with the profile's id, or merges it into the solid the profile was sketched on.
   *
   * @param profile - swept profile
   * @param result - sweep output
   * @param mode - whether to merge into the parent solid, and whether the merge cuts
   */
  /** Fuses (or cuts) a tool body into `parent`, carrying the tool's face and edge ids across. */
  private mergeInto(parent: SolidEntity, tool: Pick<SweepResult, 'shape' | 'faces' | 'edges'>, cut: boolean): void {
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

  /** The sketch frame of a solid's face, using the extrusion direction when the face is a side face. */
  private faceFrame(owner: SolidEntity, faceId: string, face: TopoDS_Face): Frame {
    const sweep = owner.sweeps.find((candidate) => [...candidate.sideFaceByCurve.values()].includes(faceId));
    return faceSketchFrame(this.oc, face, sweep?.direction);
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

  // ---------------------------------------------------------------------------------------------------------------
  // Booleans, edge cuts, shells
  // ---------------------------------------------------------------------------------------------------------------

  private boolean(
    id: string,
    kind: 'union' | 'intersection' | 'subtract',
    targets: string[],
    tools: string[],
  ): Record<string, unknown> {
    const targetSolids = targets.map((targetId) => this.scene.getSolid(targetId));
    const toolSolids = tools.map((toolId) => this.scene.getSolid(toolId));
    let args = targetSolids;
    let toolList = toolSolids;
    if (kind !== 'subtract') {
      args = targetSolids.slice(0, 1);
      toolList = targetSolids.slice(1);
    }

    if (args.length === 0) {
      throw new OfflineEngineError('Boolean needs at least one body', 'bad_request');
    }

    let shape: TopoDS_Shape;
    let history: ShapeHistory;
    if (toolList.length === 0) {
      shape =
        args.length === 1
          ? args[0]!.shape
          : compound(
              this.oc,
              args.map((solid) => solid.shape),
            );
      history = (s) => [s];
    } else {
      const run = (fuzzy: number): InstanceType<Oc['BRepAlgoAPI_Cut']> => {
        const op =
          kind === 'union'
            ? new this.oc.BRepAlgoAPI_Fuse()
            : kind === 'intersection'
              ? new this.oc.BRepAlgoAPI_Common()
              : new this.oc.BRepAlgoAPI_Cut();
        op.SetArguments(
          arrayToList(
            this.oc,
            args.map((solid) => solid.shape),
          ),
        );
        op.SetTools(
          arrayToList(
            this.oc,
            toolList.map((solid) => solid.shape),
          ),
        );
        op.SetRunParallel(false);
        if (fuzzy > 0) {
          op.SetFuzzyValue(fuzzy);
        }

        op.Build();
        if (!op.IsDone()) {
          throw new OfflineEngineError(`Boolean ${kind} failed`, 'internal_engine');
        }

        return op as InstanceType<Oc['BRepAlgoAPI_Cut']>;
      };

      let op = run(0);
      // Solver round-off can leave faces a few microns from coincident, and libcascade then misses the
      // intersection and returns the inputs untouched. When a cut or common changed nothing although the
      // bodies' boxes overlap, retry with a 1 µm fuzzy tolerance.
      const volumeOf = (shapes: readonly TopoDS_Shape[]): number =>
        shapes.reduce((sum, item) => sum + massProperties(this.oc, item).volume, 0);
      if (kind !== 'union' && boxesOverlap(this.oc, args, toolList)) {
        const before = volumeOf(args.map((solid) => solid.shape));
        const after = massProperties(this.oc, op.Shape()).volume;
        const unchanged = kind === 'subtract' ? Math.abs(after - before) <= 1e-9 * Math.max(1, before) : after <= 1e-9;
        if (unchanged) {
          const retry = run(1e-3);
          const retried = massProperties(this.oc, retry.Shape()).volume;
          if (Math.abs(retried - after) > 1e-9 * Math.max(1, before)) {
            op = retry;
          }
        }
      }

      shape = op.Shape();
      history = algoHistory(this.oc, op);
      // Several tools that overlap one another (a thread sweep inside a bore) can also defeat one combined cut, which
      // then returns a broken shape of the same volume; cut them one at a time instead, smallest first, since a small
      // tool cut after a large one can meet the new faces tangentially and miss them.
      const stillUnchanged =
        kind === 'subtract' &&
        toolList.length > 1 &&
        Math.abs(massProperties(this.oc, shape).volume - massProperties(this.oc, args[0]!.shape).volume) <=
          1e-5 * Math.max(1, massProperties(this.oc, args[0]!.shape).volume);
      if (stillUnchanged && args.length === 1) {
        let current = args[0]!.shape;
        const steps: ShapeHistory[] = [];
        const bySize = [...toolList].sort(
          (a, b) => massProperties(this.oc, a.shape).volume - massProperties(this.oc, b.shape).volume,
        );
        for (const tool of bySize) {
          const cut = new this.oc.BRepAlgoAPI_Cut(current, tool.shape);
          if (!cut.IsDone()) {
            throw new OfflineEngineError('Boolean subtract failed', 'internal_engine');
          }

          steps.push(algoHistory(this.oc, cut));
          current = cut.Shape();
        }

        shape = current;
        history = (sub) => {
          let images: TopoDS_Shape[] = [sub];
          for (const step of steps) {
            images = images.flatMap((image) => step(image) ?? []);
          }

          return images;
        };
      }
    }

    const index = new ShapeIndex(this.oc, shape, ['TopAbs_FACE', 'TopAbs_EDGE']);
    const facesMap = new Map<string, TopoDS_Shape>();
    const edgesMap = new Map<string, TopoDS_Shape>();
    // Tags on the first body win where two bodies share an id.
    for (const solid of [...targetSolids, ...toolSolids].reverse()) {
      for (const [faceId, face] of remapIds(solid.faces, history, index)) {
        facesMap.set(faceId, face);
      }

      for (const [edgeId, edge] of remapIds(solid.edges, history, index)) {
        edgesMap.set(edgeId, edge);
      }
    }

    index.delete();
    const first = targetSolids[0]!;
    const result: SolidEntity = {
      kind: 'solid',
      id,
      shape,
      faces: facesMap,
      edges: edgesMap,
      // The Zoo engine rebuilds faces in a boolean, and sketches on them then follow the default face axes.
      sweeps: [...targetSolids, ...toolSolids]
        .flatMap((solid) => solid.sweeps)
        .map((sweep) => ({ ...sweep, direction: undefined })),
      frame: first.frame,
      hidden: false,
      color: first.color,
      metalness: first.metalness,
      roughness: first.roughness,
    };
    for (const solid of [...targetSolids, ...toolSolids]) {
      this.scene.remove(solid.id);
      this.scene.aliases.set(solid.id, id);
    }

    this.scene.add(result);
    return { extra_solid_ids: [] };
  }

  private imprint(id: string, cmd: ModelingCommand): Record<string, unknown> {
    const bodies = (cmd['body_ids'] as string[]).map((bodyId) => this.scene.getSolid(bodyId));
    const tools = ((cmd['tool_ids'] as string[] | undefined) ?? []).map((toolId) => this.scene.getSolid(toolId));
    const op = new this.oc.BRepAlgoAPI_Splitter();
    op.SetArguments(
      arrayToList(
        this.oc,
        bodies.map((solid) => solid.shape),
      ),
    );
    op.SetTools(
      arrayToList(
        this.oc,
        (tools.length > 0 ? tools : bodies.slice(1)).map((solid) => solid.shape),
      ),
    );
    op.SetRunParallel(false);
    op.Build();
    if (!op.IsDone()) {
      throw new OfflineEngineError('Split failed', 'internal_engine');
    }

    const shape = op.Shape();
    const history = algoHistory(this.oc, op);
    const first = bodies[0]!;
    const pieces = topLevelPieces(this.oc, shape);
    const extraIds: string[] = [];
    if (cmd['separate_bodies'] && pieces.length > 1) {
      for (const [index, piece] of pieces.entries()) {
        const pieceId = index === 0 ? first.id : this.mint();
        const solid: SolidEntity = {
          ...first,
          id: pieceId,
          faces: new Map(first.faces),
          edges: new Map(first.edges),
          sweeps: [...first.sweeps],
        };
        rebaseSolid(this.oc, solid, piece, history);
        this.scene.add(solid);
        if (index > 0) {
          extraIds.push(pieceId);
        }
      }
    } else {
      rebaseSolid(this.oc, first, shape, history);
      this.scene.claim(first);
    }

    for (const body of bodies.slice(1)) {
      this.scene.remove(body.id);
      this.scene.aliases.set(body.id, first.id);
    }

    if (!cmd['keep_tools']) {
      for (const tool of tools) {
        this.scene.remove(tool.id);
      }
    }

    this.scene.aliases.set(id, first.id);
    return { extra_solid_ids: extraIds };
  }

  private resolveEdgeSpecifier(solid: SolidEntity, spec: EdgeSpecifier): TopoDS_Edge {
    const sideFaces = spec.side_faces.map((faceId) => requireFace(this.oc, solid, faceId));
    const endFaces = (spec.end_faces ?? []).map((faceId) => requireFace(this.oc, solid, faceId));
    const candidates = edgesBetween(this.oc, sideFaces, endFaces);
    const edge = candidates[spec.index ?? 0] ?? candidates[0];
    if (!edge) {
      throw new OfflineEngineError('No edge matches the edge reference', 'bad_request');
    }

    return edge;
  }

  // oxlint-disable-next-line complexity -- fillet and chamfer variants share edge resolution
  private cutEdges(id: string, cmd: ModelingCommand): Record<string, unknown> {
    const solid = this.scene.getSolid(cmd['object_id'] as string);
    const resolveTargets = (body: SolidEntity): TopoDS_Edge[] => {
      const found: TopoDS_Edge[] = [];
      for (const spec of (cmd['edges_references'] as EdgeSpecifier[] | undefined) ?? []) {
        found.push(this.resolveEdgeSpecifier(body, spec));
      }

      const edgeIds = [
        ...((cmd['edge_ids'] as string[] | undefined) ?? []),
        ...(cmd['edge_id'] ? [cmd['edge_id'] as string] : []),
      ];
      for (const edgeId of edgeIds) {
        found.push(this.edgeById(body, edgeId));
      }

      return found;
    };

    const targets = resolveTargets(solid);
    if (targets.length === 0) {
      return {};
    }

    const cutType = (cmd['cut_type'] ?? 'fillet') as
      | 'fillet'
      | 'chamfer'
      | { fillet: { radius: number; second_length: number | undefined } }
      | {
          chamfer: {
            distance: number;
            second_distance: number | undefined;
            angle: WireAngle | undefined;
            swap: boolean;
          };
        };
    const isChamfer = cutType === 'chamfer' || (typeof cutType === 'object' && 'chamfer' in cutType);
    const chamferParams = typeof cutType === 'object' && 'chamfer' in cutType ? cutType.chamfer : undefined;
    const size = isChamfer
      ? (chamferParams?.distance ?? (cmd['radius'] as number))
      : typeof cutType === 'object' && 'fillet' in cutType
        ? cutType.fillet.radius
        : (cmd['radius'] as number);
    type CutOp = InstanceType<Oc['BRepFilletAPI_MakeFillet']> | InstanceType<Oc['BRepFilletAPI_MakeChamfer']>;
    const attempt = (shape: TopoDS_Shape, edgesToCut: readonly TopoDS_Edge[], factor: number): CutOp | undefined => {
      let op: CutOp;
      if (isChamfer) {
        const chamfer = new this.oc.BRepFilletAPI_MakeChamfer(shape);
        for (const edge of edgesToCut) {
          const face = facesOfEdge(this.oc, shape, edge)[chamferParams?.swap ? 1 : 0];
          if (chamferParams?.angle && face) {
            chamfer.AddDA(size * factor, toRadians(chamferParams.angle), edge, face);
          } else if (chamferParams?.second_distance && face) {
            chamfer.Add(size * factor, chamferParams.second_distance * factor, edge, face);
          } else {
            chamfer.Add(size * factor, edge);
          }
        }

        op = chamfer;
      } else {
        const fillet = new this.oc.BRepFilletAPI_MakeFillet(shape, this.oc.ChFi3d_FilletShape.ChFi3d_Rational);
        for (const edge of edgesToCut) {
          fillet.Add(size * factor, edge);
        }

        op = fillet;
      }

      try {
        op.Build();
      } catch {
        return undefined;
      }

      return op.IsDone() ? op : undefined;
    };

    const newFaceIds = [id, ...((cmd['extra_face_ids'] as string[] | undefined) ?? [])];
    const commit = (
      body: SolidEntity,
      op: CutOp,
      cutEdges: readonly TopoDS_Edge[],
      faceIds: readonly string[],
    ): ShapeHistory => {
      const history = algoHistory(this.oc, op);
      const generated = cutEdges.map((edge) => listToArray(this.oc, op.Generated(edge))[0]);
      rebaseSolid(this.oc, body, op.Shape(), history);
      for (const [index, face] of generated.entries()) {
        const faceId = faceIds[index];
        if (face && faceId) {
          body.faces.set(faceId, face);
        }
      }

      return history;
    };

    // Libcascade fails on some cuts the Zoo engine accepts, typically fillets that meet exactly (a full round).
    // Retry slightly smaller, then one edge at a time.
    const cutBody = (body: SolidEntity, edgesToCut: readonly TopoDS_Edge[]): boolean => {
      const together = attempt(body.shape, edgesToCut, 1) ?? attempt(body.shape, edgesToCut, 0.999);
      if (together) {
        commit(body, together, edgesToCut, newFaceIds);
        return true;
      }

      let remaining: Array<TopoDS_Edge | undefined> = [...edgesToCut];
      for (const [index] of edgesToCut.entries()) {
        const edge = remaining[index];
        if (!edge) {
          continue;
        }

        const single = attempt(body.shape, [edge], 1) ?? attempt(body.shape, [edge], 0.999);
        if (!single) {
          return false;
        }

        const history = commit(body, single, [edge], [newFaceIds[index]!]);
        remaining = remaining.map((other, position) => {
          const image = position <= index || !other ? undefined : history(other)?.[0];
          return position <= index || !other ? other : image && this.oc.TopoDS.Edge(image);
        });
      }

      return true;
    };

    const before = { shape: solid.shape, faces: new Map(solid.faces), edges: new Map(solid.edges) };
    if (!cutBody(solid, targets)) {
      Object.assign(solid, before);
      // An edge that ends on the seam of a face-sketch merge (a lip overhanging a rounded plate) can defeat the
      // fused body's fillet; cut the merged tool alone and merge it again, as the order of operations allows.
      const merge = solid.lastMerge?.after === solid.shape ? solid.lastMerge : undefined;
      const tool: SolidEntity | undefined = merge && {
        kind: 'solid',
        id: solid.id,
        shape: merge.tool.shape,
        faces: new Map(merge.tool.faces),
        edges: new Map(merge.tool.edges),
        sweeps: [],
        hidden: false,
      };
      let toolTargets: TopoDS_Edge[] | undefined;
      try {
        toolTargets = tool && resolveTargets(tool);
      } catch {
        toolTargets = undefined;
      }

      if (!merge || !tool || !toolTargets || !cutBody(tool, toolTargets)) {
        throw new OfflineEngineError(isChamfer ? 'Chamfer failed' : 'Fillet failed', 'internal_engine');
      }

      Object.assign(solid, {
        shape: merge.before.shape,
        faces: new Map(merge.before.faces),
        edges: new Map(merge.before.edges),
      });
      this.mergeInto(solid, tool, merge.cut);
      solid.lastMerge = {
        ...merge,
        tool: { shape: tool.shape, faces: tool.faces, edges: tool.edges },
        after: solid.shape,
      };
    }

    this.scene.claim(solid);
    return {};
  }

  private shell(cmd: ModelingCommand): Record<string, unknown> {
    const solid = this.scene.getSolid(cmd['object_id'] as string);
    const thickness = cmd['shell_thickness'] as number;
    const removed = (cmd['face_ids'] as string[]).map((faceId) => requireFace(this.oc, solid, faceId));
    const op = new this.oc.BRepOffsetAPI_MakeThickSolid();
    op.MakeThickSolidByJoin(
      solid.shape,
      arrayToList(this.oc, removed),
      -thickness,
      1e-3,
      this.oc.BRepOffset_Mode.BRepOffset_Skin,
      true,
      false,
      this.oc.GeomAbs_JoinType.GeomAbs_Arc,
      false,
    );
    // MakeThickSolid can report success yet hand back the body unchanged when a wall offset collapses part of
    // the profile; fall back to cutting an offset cavity through the removed caps.
    const unchanged =
      op.IsDone() &&
      Math.abs(massProperties(this.oc, op.Shape()).volume - massProperties(this.oc, solid.shape).volume) <
        1e-9 * Math.max(1, massProperties(this.oc, solid.shape).volume);
    if (!op.IsDone() || unchanged) {
      const shelled = shellPrism(
        this.oc,
        solid.shape,
        removed.map((face) => this.oc.TopoDS.Face(face)),
        thickness,
      );
      if (!shelled) {
        throw new OfflineEngineError('Shell failed', 'internal_engine');
      }

      const index = new ShapeIndex(this.oc, shelled, ['TopAbs_FACE', 'TopAbs_EDGE']);
      solid.faces = new Map([...solid.faces].filter(([, face]) => index.has(face)));
      solid.edges = new Map([...solid.edges].filter(([, edge]) => index.has(edge)));
      index.delete();
      solid.shape = shelled;
      this.scene.claim(solid);
      return {};
    }

    rebaseSolid(this.oc, solid, op.Shape(), algoHistory(this.oc, op as unknown as Parameters<typeof algoHistory>[1]));
    this.scene.claim(solid);
    return {};
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Copies: clones, patterns, mirrors, transforms
  // ---------------------------------------------------------------------------------------------------------------

  private clone(id: string, cmd: ModelingCommand): Record<string, unknown> {
    const source = this.scene.get(cmd['entity_id'] as string);
    const renamed = new Map<string, string>();
    const rename = (childId: string): string => {
      let next = renamed.get(childId);
      if (!next) {
        next = this.mint();
        renamed.set(childId, next);
      }

      return next;
    };

    const copy = transformEntity(this.oc, source, id, new this.oc.gp_Trsf(), rename);
    copy.hidden = false;
    this.scene.add(copy);
    return { face_edge_ids: [] };
  }

  private addCopies(sourceId: string, trsfs: ReadonlyArray<InstanceType<Oc['gp_Trsf']>>): Record<string, unknown> {
    const source = this.scene.get(sourceId);
    if (source.kind === 'path' && !isClosedPath(source)) {
      // An open profile is patterned in place: the copies continue the same path, so kcl-lib keeps one sketch.
      this.appendPathCopies(source, trsfs);
      return { entity_face_edge_ids: [] };
    }

    const copies = trsfs.map((trsf) => {
      const copy = transformEntity(this.oc, source, this.mint(), trsf);
      this.scene.entities.set(copy.id, copy);
      return { object_id: copy.id, faces: [], edges: [] };
    });
    return { entity_face_edge_ids: copies };
  }

  private appendPathCopies(path: PathEntity, trsfs: ReadonlyArray<InstanceType<Oc['gp_Trsf']>>): void {
    const original = [...path.segments];
    for (const trsf of trsfs) {
      for (const segment of original) {
        const edge = this.oc.TopoDS.Edge(applyTrsf(this.oc, segment.edge, trsf).shape);
        const map2 = (p: Vec2): Vec2 => {
          const global = pnt(this.oc, toGlobal(path.frame, p.x, p.y));
          global.Transform(trsf);
          const local = toLocal(path.frame, vec3(global.X(), global.Y(), global.Z()));
          return { x: local.x, y: local.y };
        };

        const start = map2(segment.start);
        const end = map2(segment.end);
        const tip = map2({ x: segment.end.x + segment.endTangent.x, y: segment.end.y + segment.endTangent.y });
        path.segments.push({ id: this.mint(), edge, start, end, endTangent: { x: tip.x - end.x, y: tip.y - end.y } });
        path.pen = end;
      }
    }
  }

  private patternTransform(cmd: ModelingCommand): Record<string, unknown> {
    const source = this.scene.get(cmd['entity_id'] as string);
    const center = localOrigin(this.oc, source);
    const frame = sketchFrameOf(source);
    const instances = cmd['transforms'] as WireTransform[][];
    const trsfs = instances
      .filter((list) => list.every((transform) => transform.replicate !== false))
      .map((list) => {
        const total = new this.oc.gp_Trsf();
        for (const transform of list) {
          total.PreMultiply(patternTrsf(this.oc, transform, center, frame));
        }

        return total;
      });
    return this.addCopies(source.id, trsfs);
  }

  private linearPattern(cmd: ModelingCommand): Record<string, unknown> {
    const source = this.scene.get(cmd['entity_id'] as string);
    const frame = sketchFrameOf(source);
    const axisWire = point3(cmd['axis'] as WirePoint3d);
    const axis = normalize(frame ? directionToGlobal(frame, axisWire.x, axisWire.y) : axisWire);
    const count = cmd['num_repetitions'] as number;
    const spacing = cmd['spacing'] as number;
    const trsfs = Array.from({ length: count }, (_, index) =>
      translationTrsf(this.oc, scale(axis, spacing * (index + 1))),
    );
    return this.addCopies(source.id, trsfs);
  }

  private circularPattern(cmd: ModelingCommand): Record<string, unknown> {
    const source = this.scene.get(cmd['entity_id'] as string);
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
    const sourceCenter = entityCenter(this.oc, source);
    const trsfs = Array.from({ length: count }, (_, index) => {
      const rotation = rotationTrsf(this.oc, center, axis, step * (index + 1));
      if (rotateDuplicates) {
        return rotation;
      }

      const moved = pnt(this.oc, sourceCenter);
      moved.Transform(rotation);
      return translationTrsf(this.oc, sub(vec3(moved.X(), moved.Y(), moved.Z()), sourceCenter));
    });
    return this.addCopies(source.id, trsfs);
  }

  /**
   * 2D mirror: each sketch gains the mirrored copy of its segments, joined into one sketch with a new id.
   *
   * @param ids - sketch ids
   * @param mirrorPlane - mirror plane through the axis, perpendicular to the sketch
   * @returns entity face/edge ids, one entry per sketch
   */
  private mirrorSketches(
    ids: string[],
    mirrorPlane: (frame: Frame) => { point: Vec3; normal: Vec3 },
  ): Record<string, unknown> {
    const out = ids.map((sourceId) => {
      const source = this.scene.get(sourceId);
      if (source.kind !== 'path') {
        const frame = sketchFrameOf(source) ?? globalFrame;
        const plane = mirrorPlane(frame);
        const copyId = this.mint();
        const mirrored = transformEntity(this.oc, source, copyId, planeMirrorTrsf(this.oc, plane.point, plane.normal));
        this.scene.entities.set(copyId, mirrored);
        return { object_id: copyId, faces: [], edges: childIds(mirrored) };
      }

      // The engine mirrors a sketch in place: the mirrored segments join the same path, and the returned id
      // is another handle on it.
      const plane = mirrorPlane(source.frame);
      const trsf = planeMirrorTrsf(this.oc, plane.point, plane.normal);
      const newId = this.mint();
      const mirroredSegments = [...source.segments].reverse().map((segment) => ({
        ...segment,
        id: this.mint(),
        edge: this.oc.TopoDS.Edge(applyTrsf(this.oc, segment.edge, trsf).shape.Reversed()),
      }));
      source.segments.push(...mirroredSegments);
      this.scene.aliases.set(newId, source.id);
      return { object_id: newId, faces: [], edges: mirroredSegments.map((segment) => segment.id) };
    });
    return { entity_face_edge_ids: out };
  }

  private mirror2d(cmd: ModelingCommand): Record<string, unknown> {
    const axis = point3(cmd['axis'] as WirePoint3d);
    const point = point3(cmd['point'] as WirePoint3d);
    return this.mirrorSketches(cmd['ids'] as string[], (frame) => {
      const along = normalize(directionToGlobal(frame, axis.x, axis.y));
      return { point: toGlobal(frame, point.x, point.y), normal: normalize(cross(frame.z, along)) };
    });
  }

  private mirror2dAcrossEdge(cmd: ModelingCommand): Record<string, unknown> {
    const edge = this.anyEdge(cmd['edge_id'] as string);
    const start = edgePoint(this.oc, edge, 0);
    const end = edgePoint(this.oc, edge, 1);
    return this.mirrorSketches(cmd['ids'] as string[], (frame) => ({
      point: start.point,
      normal: normalize(cross(frame.z, normalize(sub(end.point, start.point), start.tangent))),
    }));
  }

  private mirror3d(cmd: ModelingCommand): Record<string, unknown> {
    const across = cmd['across'] as
      | { plane: { id: string } }
      | { axis: { axis: WirePoint3d; point: WirePoint3d } }
      | { edge: { id: string } }
      | { edge_reference: { reference: EdgeSpecifier } };
    let trsf: InstanceType<Oc['gp_Trsf']>;
    if ('plane' in across) {
      const plane = this.scene.get(across.plane.id);
      const frame = plane.kind === 'plane' ? plane.frame : sketchFrameOf(plane);
      if (!frame) {
        throw new OfflineEngineError('Mirror plane not found', 'bad_request');
      }

      trsf = planeMirrorTrsf(this.oc, frame.origin, frame.z);
    } else if ('axis' in across) {
      trsf = new this.oc.gp_Trsf();
      trsf.SetMirror(
        new this.oc.gp_Ax1(
          pnt(this.oc, point3(across.axis.point)),
          new this.oc.gp_Dir(...tuple(normalize(point3(across.axis.axis)))),
        ),
      );
    } else {
      const edge =
        'edge' in across ? this.anyEdge(across.edge.id) : this.edgeFromSpecifier(across.edge_reference.reference);
      const start = edgePoint(this.oc, edge, 0);
      trsf = new this.oc.gp_Trsf();
      trsf.SetMirror(
        new this.oc.gp_Ax1(pnt(this.oc, start.point), new this.oc.gp_Dir(...tuple(normalize(start.tangent)))),
      );
    }

    const out = (cmd['ids'] as string[]).map((sourceId) => {
      const source = this.scene.get(sourceId);
      const renamed = new Map<string, string>();
      const copyId = this.mint();
      const mirrored = transformEntity(this.oc, source, copyId, trsf, (childId) => {
        let next = renamed.get(childId);
        if (!next) {
          next = this.mint();
          renamed.set(childId, next);
        }

        return next;
      });
      if (mirrored.kind === 'solid') {
        mirrored.shape = orientOutward(this.oc, mirrored.shape);
      }

      this.scene.add(mirrored);
      return { object_id: copyId, faces: [], edges: [] };
    });
    return { entity_face_edge_ids: out };
  }

  private setObjectTransform(cmd: ModelingCommand): Record<string, unknown> {
    const entity = this.scene.get(cmd['object_id'] as string);
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

        return localOrigin(this.oc, current);
      };

      const total = new this.oc.gp_Trsf();
      const perAxis = component.scale ? point3(component.scale.property) : undefined;
      if (
        perAxis &&
        current.kind !== 'plane' &&
        (Math.abs(perAxis.x - perAxis.y) > 1e-12 || Math.abs(perAxis.y - perAxis.z) > 1e-12)
      ) {
        scaleEntityPerAxis(this.oc, current, pivotOf(component.scale), perAxis);
      } else if (component.scale) {
        const s = point3(component.scale.property);
        const factor = (s.x + s.y + s.z) / 3;
        if (Math.abs(factor - 1) > 1e-12) {
          const trsf = new this.oc.gp_Trsf();
          trsf.SetScale(pnt(this.oc, pivotOf(component.scale)), factor);
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
            total.PreMultiply(rotationTrsf(this.oc, pivot, axis, angle));
          }
        }
      }

      if (component.rotate_angle_axis) {
        const p = component.rotate_angle_axis.property;
        if (Math.abs(p.w) > 1e-12) {
          total.PreMultiply(
            rotationTrsf(this.oc, pivotOf(component.rotate_angle_axis), vec3(p.x, p.y, p.z), (p.w * Math.PI) / 180),
          );
        }
      }

      if (component.translate) {
        const t = point3(component.translate.property);
        const delta = component.translate.set ? sub(t, localOrigin(this.oc, current)) : t;
        total.PreMultiply(translationTrsf(this.oc, delta));
      }

      current = transformEntity(this.oc, current, current.id, total);
      if (current.kind === 'solid') {
        current.shape = orientOutward(this.oc, current.shape);
      }
    }

    this.scene.entities.set(current.id, current);
    if (current.kind === 'solid') {
      this.scene.claim(current);
    }

    return {};
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Curves and surfaces
  // ---------------------------------------------------------------------------------------------------------------

  private helix(
    id: string,
    options: {
      radius: number;
      length: number;
      revolutions: number;
      startAngle: number;
      clockwise: boolean;
      center: Vec3;
      axis: Vec3;
    },
  ): void {
    const axis = normalize(options.axis);
    const frame = frameFromNormal(axis, options.center);
    const axes = new this.oc.gp_Ax3(
      pnt(this.oc, frame.origin),
      new this.oc.gp_Dir(...tuple(frame.z)),
      new this.oc.gp_Dir(...tuple(frame.x)),
    );
    const surface = new this.oc.Geom_CylindricalSurface(axes, options.radius);
    const turns = options.revolutions;
    const direction = options.clockwise ? -1 : 1;
    const totalAngle = turns * Math.PI * 2;
    const line = new this.oc.gp_Lin2d(
      new this.oc.gp_Pnt2d(options.startAngle, 0),
      new this.oc.gp_Dir2d(direction * totalAngle, options.length),
    );
    const span = Math.hypot(totalAngle, options.length);
    const curve2d = new this.oc.Geom2d_Line(line);
    const edge = new this.oc.BRepBuilderAPI_MakeEdge(curve2d, surface, 0, span).Edge();
    this.oc.BRepLib.BuildCurves3d(edge);
    const wire = wireFromEdges(this.oc, [edge]);
    this.scene.add({ kind: 'curve', id, shape: wire, axis, hidden: false });
  }

  private helixFromParams(id: string, cmd: ModelingCommand): Record<string, unknown> {
    this.helix(id, {
      radius: cmd['radius'] as number,
      length: cmd['length'] as number,
      revolutions: cmd['revolutions'] as number,
      startAngle: toRadians(cmd['start_angle'] as WireAngle),
      clockwise: Boolean(cmd['is_clockwise']),
      center: point3(cmd['center'] as WirePoint3d),
      axis: point3(cmd['axis'] as WirePoint3d),
    });
    return {};
  }

  private helixOnCylinder(id: string, cmd: ModelingCommand): Record<string, unknown> {
    const solid = this.scene.getSolid(cmd['cylinder_id'] as string);
    const cylinderFace = faces(this.oc, solid.shape).find((face) => {
      const adaptor = new this.oc.BRepAdaptor_Surface(face, true);
      const isCylinder = adaptor.GetType() === this.oc.GeomAbs_SurfaceType.GeomAbs_Cylinder;
      adaptor.delete();
      return isCylinder;
    });
    if (!cylinderFace) {
      throw new OfflineEngineError('Helix target has no cylindrical face', 'bad_request');
    }

    const adaptor = new this.oc.BRepAdaptor_Surface(cylinderFace, true);
    const cylinder = adaptor.Cylinder();
    const position = cylinder.Position();
    const axis = vec3(position.Direction().X(), position.Direction().Y(), position.Direction().Z());
    const box = boundingBox(this.oc, solid.shape)!;
    const along = [box.min, box.max].map((p) => dot(p, axis));
    const lengthAlong = Math.abs(along[1]! - along[0]!);
    const location = position.Location();
    const base = vec3(location.X(), location.Y(), location.Z());
    const startOffset = Math.min(along[0]!, along[1]!) - dot(base, axis);
    this.helix(id, {
      radius: cylinder.Radius(),
      length: (cmd['length'] as number | undefined) ?? lengthAlong,
      revolutions: cmd['revolutions'] as number,
      startAngle: toRadians(cmd['start_angle'] as WireAngle),
      clockwise: Boolean(cmd['is_clockwise']),
      center: add(base, scale(axis, startOffset)),
      axis,
    });
    adaptor.delete();
    return {};
  }

  private helixFromEdge(id: string, cmd: ModelingCommand): Record<string, unknown> {
    const edge = this.anyEdge(cmd['edge_id'] as string);
    const start = edgePoint(this.oc, edge, 0);
    const end = edgePoint(this.oc, edge, 1);
    const axis = sub(end.point, start.point);
    this.helix(id, {
      radius: cmd['radius'] as number,
      length: (cmd['length'] as number | undefined) ?? length(axis),
      revolutions: cmd['revolutions'] as number,
      startAngle: toRadians(cmd['start_angle'] as WireAngle),
      clockwise: Boolean(cmd['is_clockwise']),
      center: start.point,
      axis: normalize(axis, start.tangent),
    });
    return {};
  }

  /**
   * Tangent blend between two surface edges: a cubic Hermite surface leaving each surface along its own direction,
   * fitted as a B-spline.
   *
   * @param id - command id; the blend body's id
   * @param cmd - command
   * @returns empty response
   */
  private surfaceBlend(id: string, cmd: ModelingCommand): Record<string, unknown> {
    const surfaces = cmd['surfaces'] as Array<{
      object_id: string;
      edges?: Array<{ edge_id: string }>;
      edge_id?: string;
    }>;
    const sides = surfaces.slice(0, 2).map((surface) => {
      const edgeId = surface.edges?.[0]?.edge_id ?? surface.edge_id;
      const solid = this.scene.getSolid(surface.object_id);
      const edge = edgeId ? this.anyEdge(edgeId) : edges(this.oc, solid.shape)[0]!;
      const face = facesOfEdge(this.oc, solid.shape, edge)[0];
      const center = face ? faceCentroid(this.oc, face).center : entityCenter(this.oc, solid);
      return { edge, center };
    });
    if (sides.length < 2) {
      throw new OfflineEngineError('Surface blend needs two surfaces', 'bad_request');
    }

    const samples = 16;
    // Each edge is extended by half its length at both ends, linearly, so the blend can trim surfaces that
    // overhang the edges (libcascade's GeomLib::ExtendSurfByLength binding is unusable; see the research notes).
    const curve = (side: (typeof sides)[number], u: number): { point: Vec3; out: Vec3 } => {
      const clamped = Math.min(Math.max(u, 0), 1);
      const { point: onEdge, tangent } = edgePoint(this.oc, side.edge, clamped);
      const along = normalize(tangent);
      const edgeLength = length(sub(edgePoint(this.oc, side.edge, 1).point, edgePoint(this.oc, side.edge, 0).point));
      const point = add(onEdge, scale(along, (u - clamped) * edgeLength));
      const away = sub(onEdge, side.center);
      return { point, out: normalize(sub(away, scale(along, dot(away, along)))) };
    };

    const a0 = curve(sides[0]!, 0).point;
    const flip = length(sub(curve(sides[1]!, 0).point, a0)) > length(sub(curve(sides[1]!, 1).point, a0));
    const grid = new this.oc.NCollection_Array2_gp_Pnt(1, samples + 1, 1, samples + 1);
    for (let i = 0; i <= samples; i++) {
      const u = -0.5 + (2 * i) / samples;
      const first = curve(sides[0]!, u);
      const second = curve(sides[1]!, flip ? 1 - u : u);

      const k = length(sub(second.point, first.point));
      for (let j = 0; j <= samples; j++) {
        const v = j / samples;
        const h00 = 2 * v ** 3 - 3 * v ** 2 + 1;
        const h10 = v ** 3 - 2 * v ** 2 + v;
        const h01 = -2 * v ** 3 + 3 * v ** 2;
        const h11 = v ** 3 - v ** 2;
        const p = add(
          add(scale(first.point, h00), scale(first.out, h10 * k)),
          add(scale(second.point, h01), scale(second.out, -h11 * k)),
        );
        grid.SetValue(i + 1, j + 1, pnt(this.oc, p));
      }
    }

    const fit = new this.oc.GeomAPI_PointsToBSplineSurface(grid, 3, 8, this.oc.GeomAbs_Shape.GeomAbs_C2, 1e-3);
    const face = new this.oc.BRepBuilderAPI_MakeFace(fit.Surface(), 1e-6).Face();
    fit.delete();
    grid.delete();
    this.scene.add({ kind: 'solid', id, shape: face, faces: new Map(), edges: new Map(), sweeps: [], hidden: false });
    return {};
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------------------------------------------

  private faceIsPlanar(id: string, faceId: string): Record<string, unknown> {
    const plane = this.scene.find(faceId);
    let frame: Frame;
    if (plane?.kind === 'plane') {
      frame = plane.frame;
    } else {
      const { solid, face } = this.faceById(faceId);
      if (!planarFaceFrame(this.oc, face)) {
        return {};
      }

      frame = this.faceFrame(solid, faceId, face);
    }

    // Kcl-lib's `planeOf` then sketches on the command id as a plane.
    this.scene.entities.set(id, { kind: 'plane', id, frame, hidden: true });
    return { origin: frame.origin, x_axis: frame.x, y_axis: frame.y, z_axis: frame.z };
  }

  private adjacent(cmd: ModelingCommand, which: 'next' | 'previous'): Record<string, unknown> {
    const solid = this.solidFor(cmd['object_id'] as string, cmd['edge_id'] as string);
    const edge = this.edgeById(solid, cmd['edge_id'] as string);
    const face = requireFace(this.oc, solid, cmd['face_id'] as string);
    const found = adjacentEdge(this.oc, face, edge, which);
    return { edge: found ? this.edgeId(solid, found) : null };
  }

  private boundingBox(cmd: ModelingCommand): Record<string, unknown> {
    const shapes = this.shapesOf(cmd['entity_ids'] as string[]);
    const box = shapes.length > 0 ? boundingBox(this.oc, compound(this.oc, shapes)) : undefined;
    const factor = unitScale(cmd['output_unit'] as string, 1);
    if (!box) {
      return { center: vec3(0, 0, 0), dimensions: vec3(0, 0, 0), output_unit: cmd['output_unit'] };
    }

    return {
      center: scale(scale(add(box.min, box.max), 0.5), factor),
      dimensions: scale(sub(box.max, box.min), factor),
      output_unit: cmd['output_unit'],
    };
  }

  private shapesOf(ids: string[] | undefined): TopoDS_Shape[] {
    const entities =
      ids && ids.length > 0 ? ids.map((entityId) => this.scene.get(entityId)) : this.scene.visibleSolids();
    return entities
      .map((entity) => entityShape(this.oc, entity))
      .filter((shape): shape is TopoDS_Shape => Boolean(shape));
  }

  private sumMass(cmd: ModelingCommand, key: 'volume' | 'area'): number {
    return this.shapesOf(cmd['entity_ids'] as string[]).reduce(
      (total, shape) => total + massProperties(this.oc, shape)[key],
      0,
    );
  }

  private entityType(id: string): string {
    const entity = this.scene.find(id);
    if (entity) {
      return { path: 'path', region: 'solid2d', solid: 'solid3d', plane: 'plane', curve: 'curve' }[entity.kind];
    }

    const owner = this.scene.ownerOf(id);
    if (owner?.faces.has(id)) {
      return 'face';
    }

    return owner ? 'edge' : 'entity';
  }

  private solidFor(objectId: string, subShapeId: string): SolidEntity {
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

  private faceById(faceId: string): { solid: SolidEntity; face: TopoDS_Face } {
    const owner = this.scene.ownerOf(faceId);
    if (!owner) {
      throw new OfflineEngineError(`Unknown face ${faceId}`, 'bad_request');
    }

    return { solid: owner, face: requireFace(this.oc, owner, faceId) };
  }

  private edgeById(solid: SolidEntity, edgeId: string): TopoDS_Edge {
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
  private anyEdge(edgeId: string): TopoDS_Edge {
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

  private edgeFromSpecifier(spec: EdgeSpecifier): TopoDS_Edge {
    const owner = this.scene.ownerOf(spec.side_faces[0]!);
    if (!owner) {
      throw new OfflineEngineError('Edge reference faces are unknown', 'bad_request');
    }

    return this.resolveEdgeSpecifier(owner, spec);
  }

  private faceId(solid: SolidEntity, face: TopoDS_Shape): string {
    const id = idForSubShape(solid.faces, face, this.mint);
    this.scene.subShapeOwner.set(id, solid.id);
    return id;
  }

  private edgeId(solid: SolidEntity, edge: TopoDS_Shape): string {
    const id = idForSubShape(solid.edges, edge, this.mint);
    this.scene.subShapeOwner.set(id, solid.id);
    return id;
  }
}

const tuple = (v: Vec3): [number, number, number] => [v.x, v.y, v.z];

/**
 * The separate bodies of a boolean result: its solids, else its shells, else its faces.
 *
 * @param oc - libcascade instance
 * @param shape - result shape
 * @returns pieces
 */
function topLevelPieces(oc: Oc, shape: TopoDS_Shape): TopoDS_Shape[] {
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
function isClosedPath(path: PathEntity): boolean {
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
function frameFromNormal(normal: Vec3, origin: Vec3 = vec3(0, 0, 0)): Frame {
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
function unitScale(unit: string | undefined, power: number): number {
  const base = (unit ?? 'mm').replace(/[23]$/, '');
  const perMm: Record<string, number> = { mm: 1, cm: 0.1, m: 0.001, in: 1 / 25.4, ft: 1 / 304.8, yd: 1 / 914.4 };
  return (perMm[base] ?? 1) ** power;
}

/**
 * A v4 UUID from `crypto.getRandomValues`, which (unlike `crypto.randomUUID`) also exists outside secure contexts.
 *
 * @returns a random UUID string
 */
function randomUuid(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = 0x40 + (bytes[6]! % 16);
  bytes[8] = 0x80 + (bytes[8]! % 64);
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Whether any argument body's bounding box overlaps any tool body's. */
function boxesOverlap(oc: Oc, args: readonly SolidEntity[], tools: readonly SolidEntity[]): boolean {
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
function localOrigin(oc: Oc, entity: Entity): Vec3 {
  if ((entity.kind === 'solid' || entity.kind === 'path' || entity.kind === 'region') && entity.frame) {
    return entity.frame.origin;
  }

  return entityCenter(oc, entity);
}
