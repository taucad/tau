/* oxlint-disable new-cap -- OpenCascade API uses PascalCase method names */
/* oxlint-disable eslint/max-params -- libcascade helpers take the instance followed by their operands */
/* eslint-disable @typescript-eslint/naming-convention -- Kittycad wire JSON field names */
/**
 * Booleans, imprints, edge cuts and shells for {@link OfflineEngine}: command handlers that take the engine as their first argument.
 */
import type { Oc, TopoDS_Edge, TopoDS_Shape } from '#offline/offline-occt.js';
import { ShapeIndex, arrayToList, compound, listToArray, volumeOf } from '#offline/offline-occt.js';
import type { SolidEntity } from '#offline/offline-scene.js';
import { helpersFor } from '#offline/offline-helpers.js';
import { shellPrism } from '#offline/offline-shell.js';
import type { ShapeHistory } from '#offline/offline-topology.js';
import { algoHistory, facesOfEdge, noEdgeMatches, rebaseSolid, remapIds, requireFace } from '#offline/offline-topology.js';
import type { ModelingCommand, WireAngle } from '#offline/offline-engine.types.js';
import { OfflineEngineError, toRadians } from '#offline/offline-engine.types.js';
import type { OfflineEngine } from '#offline/offline-engine.js';
import type { EdgeSpecifier } from '#offline/offline-engine-support.js';
import { topLevelPieces, fuzzyTolerance, boxesOverlap } from '#offline/offline-engine-support.js';

/**
 * Runs a union, intersection or subtraction of solids, keeping the first target's id for the result.
 *
 * @param engine - offline engine
 * @param id - command id
 * @param kind - boolean kind
 * @param targets - target solid ids
 * @param tools - tool solid ids
 * @returns the response, with the ids of extra result bodies
 */
export function boolean(
  engine: OfflineEngine,
  id: string,
  kind: 'union' | 'intersection' | 'subtract',
  targets: string[],
  tools: string[],
): Record<string, unknown> {
  if (kind !== 'subtract' || targets.length <= 1) {
    return combine(engine, id, kind, targets, tools, false);
  }

  // Zoo cuts each target on its own and answers every resulting body in `extra_solid_ids`, which kcl-lib takes as the
  // whole output of a multi-target subtract.
  const ids = targets.map((_, index) => (index === 0 ? id : engine.mint()));
  for (const [index, targetId] of targets.entries()) {
    combine(engine, ids[index]!, kind, [targetId], tools, index < targets.length - 1);
  }

  return { extra_solid_ids: ids };
}

/**
 * Runs one boolean into a single result body with id `id`.
 *
 * @param engine - offline engine
 * @param id - id of the result body
 * @param kind - boolean kind
 * @param targets - target solid ids
 * @param tools - tool solid ids
 * @param keepTools - leave the tools in the scene for the next target of a multi-target subtract
 * @returns the response
 */
// oxlint-disable-next-line max-params -- `boolean`'s operands plus whether the tools stay for the next target
function combine(
  engine: OfflineEngine,
  id: string,
  kind: 'union' | 'intersection' | 'subtract',
  targets: string[],
  tools: string[],
  keepTools: boolean,
): Record<string, unknown> {
  const targetSolids = targets.map((targetId) => engine.scene.getSolid(targetId));
  const toolSolids = tools.map((toolId) => engine.scene.getSolid(toolId));
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
            engine.oc,
            args.map((solid) => solid.shape),
          );
    history = (s) => [s];
  } else {
    const run = (fuzzy: number): InstanceType<Oc['BRepAlgoAPI_Cut']> => {
      const op =
        kind === 'union'
          ? new engine.oc.BRepAlgoAPI_Fuse()
          : kind === 'intersection'
            ? new engine.oc.BRepAlgoAPI_Common()
            : new engine.oc.BRepAlgoAPI_Cut();
      op.SetArguments(
        arrayToList(
          engine.oc,
          args.map((solid) => solid.shape),
        ),
      );
      op.SetTools(
        arrayToList(
          engine.oc,
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
    // bodies' boxes overlap, retry with a fuzzy tolerance scaled to the model (1e-5 of its diagonal).
    const overlapping = kind !== 'union' && boxesOverlap(engine.oc, args, toolList);
    const before = overlapping ? args.reduce((sum, solid) => sum + volumeOf(engine.oc, solid.shape), 0) : 0;
    let after = overlapping ? volumeOf(engine.oc, op.Shape()) : 0;
    if (overlapping) {
      const unchanged = kind === 'subtract' ? Math.abs(after - before) <= 1e-9 * Math.max(1, before) : after <= 1e-9;
      if (unchanged) {
        const retry = run(fuzzyTolerance(engine.oc, [...args, ...toolList]));
        const retried = volumeOf(engine.oc, retry.Shape());
        if (Math.abs(retried - after) > 1e-9 * Math.max(1, before)) {
          op = retry;
          after = retried;
        }
      }
    }

    shape = op.Shape();
    history = algoHistory(engine.oc, op);
    // Several tools that overlap one another (a thread sweep inside a bore) can also defeat one combined cut, which
    // then returns a broken shape of about the same volume; cut them one at a time instead, smallest first, since a
    // small tool cut after a large one can meet the new faces tangentially and miss them. A topology check finds the
    // broken result without the mass properties the volume test needs.
    const stillUnchanged =
      kind === 'subtract' &&
      toolList.length > 1 &&
      (!helpersFor(engine.oc).isValid(shape) ||
        (overlapping && Math.abs(after - before) <= 1e-5 * Math.max(1, before)));
    if (stillUnchanged && args.length === 1) {
      let current = args[0]!.shape;
      const steps: ShapeHistory[] = [];
      const sizes = new Map(toolList.map((tool) => [tool, volumeOf(engine.oc, tool.shape)]));
      const bySize = [...toolList].sort((a, b) => sizes.get(a)! - sizes.get(b)!);
      for (const tool of bySize) {
        const cut = new engine.oc.BRepAlgoAPI_Cut(current, tool.shape);
        if (!cut.IsDone()) {
          throw new OfflineEngineError('Boolean subtract failed', 'internal_engine');
        }

        steps.push(algoHistory(engine.oc, cut));
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

  const index = new ShapeIndex(engine.oc, shape, ['TopAbs_FACE', 'TopAbs_EDGE']);
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
  for (const solid of keepTools ? targetSolids : [...targetSolids, ...toolSolids]) {
    engine.scene.remove(solid.id);
    engine.scene.aliases.set(solid.id, id);
  }

  engine.scene.add(result);
  return { extra_solid_ids: [] };
}

/**
 * Splits solids along each other's boundaries without merging them.
 *
 * @param engine - offline engine
 * @param id - command id
 * @param cmd - command payload
 * @returns the response
 */
export function imprint(engine: OfflineEngine, id: string, cmd: ModelingCommand): Record<string, unknown> {
  const bodies = (cmd['body_ids'] as string[]).map((bodyId) => engine.scene.getSolid(bodyId));
  const tools = ((cmd['tool_ids'] as string[] | undefined) ?? []).map((toolId) => engine.scene.getSolid(toolId));
  const op = new engine.oc.BRepAlgoAPI_Splitter();
  op.SetArguments(
    arrayToList(
      engine.oc,
      bodies.map((solid) => solid.shape),
    ),
  );
  op.SetTools(
    arrayToList(
      engine.oc,
      (tools.length > 0 ? tools : bodies.slice(1)).map((solid) => solid.shape),
    ),
  );
  op.SetRunParallel(false);
  op.Build();
  if (!op.IsDone()) {
    throw new OfflineEngineError('Split failed', 'internal_engine');
  }

  const shape = op.Shape();
  const history = algoHistory(engine.oc, op);
  const first = bodies[0]!;
  const pieces = topLevelPieces(engine.oc, shape);
  const extraIds: string[] = [];
  if (cmd['separate_bodies'] && pieces.length > 1) {
    for (const [index, piece] of pieces.entries()) {
      const pieceId = index === 0 ? first.id : engine.mint();
      const solid: SolidEntity = {
        ...first,
        id: pieceId,
        faces: new Map(first.faces),
        edges: new Map(first.edges),
        sweeps: [...first.sweeps],
      };
      rebaseSolid(engine.oc, solid, piece, history);
      engine.scene.add(solid);
      if (index > 0) {
        extraIds.push(pieceId);
      }
    }
  } else {
    rebaseSolid(engine.oc, first, shape, history);
    engine.scene.claim(first);
  }

  for (const body of bodies.slice(1)) {
    engine.scene.remove(body.id);
    engine.scene.aliases.set(body.id, first.id);
  }

  if (!cmd['keep_tools']) {
    for (const tool of tools) {
      engine.scene.remove(tool.id);
    }
  }

  engine.scene.aliases.set(id, first.id);
  return { extra_solid_ids: extraIds };
}

// oxlint-disable-next-line complexity -- fillet and chamfer variants share edge resolution
export function cutEdges(engine: OfflineEngine, id: string, cmd: ModelingCommand): Record<string, unknown> {
  const solid = engine.scene.getSolid(cmd['object_id'] as string);
  const cutKey = JSON.stringify([cmd['cut_type'] ?? 'fillet', cmd['radius']]);
  const resolveTargets = (body: SolidEntity): TopoDS_Edge[] => {
    const found: TopoDS_Edge[] = [];
    // A tag on a sketch curve that a region split into several arcs becomes one reference per arc, all with the
    // same end faces; the end faces pick the arcs they touch, and the other references match nothing. Only a cut
    // where no reference matches fails.
    const specs = (cmd['edges_references'] as EdgeSpecifier[] | undefined) ?? [];
    let unmatched: unknown;
    for (const spec of specs) {
      try {
        found.push(engine.resolveEdgeSpecifier(body, spec));
      } catch (error) {
        if (!(error instanceof OfflineEngineError) || error.message !== noEdgeMatches) {
          throw error;
        }

        unmatched = error;
      }
    }

    if (specs.length > 0 && found.length === 0) {
      throw unmatched;
    }

    const edgeIds = [
      ...((cmd['edge_ids'] as string[] | undefined) ?? []),
      ...(cmd['edge_id'] ? [cmd['edge_id'] as string] : []),
    ];
    for (const edgeId of edgeIds) {
      // An edge that an earlier cut of the same kind and size already blended, because libcascade carries a cut
      // along the tangent chain of its edges (a chamfer round filleted corners), is already cut.
      if (!body.edges.has(edgeId) && engine.scene.cutEdges.get(edgeId) === cutKey) {
        continue;
      }

      found.push(engine.edgeById(body, edgeId));
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
      const chamfer = new engine.oc.BRepFilletAPI_MakeChamfer(shape);
      for (const edge of edgesToCut) {
        const face = facesOfEdge(engine.oc, shape, edge)[chamferParams?.swap ? 1 : 0];
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
      const fillet = new engine.oc.BRepFilletAPI_MakeFillet(shape, engine.oc.ChFi3d_FilletShape.ChFi3d_Rational);
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
    const history = algoHistory(engine.oc, op);
    const generated = cutEdges.map((edge) => listToArray(engine.oc, op.Generated(edge))[0]);
    for (const [edgeId, edge] of body.edges) {
      if (!op.Generated(edge).IsEmpty()) {
        engine.scene.cutEdges.set(edgeId, cutKey);
      }
    }

    rebaseSolid(engine.oc, body, op.Shape(), history);
    for (const [index, face] of generated.entries()) {
      const faceId = faceIds[index];
      if (face && faceId) {
        body.faces.set(faceId, face);
        if (isChamfer && cmd['version'] === 'v2') {
          engine.scene.halfTurnFaces.add(faceId);
        }
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
        return position <= index || !other ? other : image && engine.oc.TopoDS.Edge(image);
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
    engine.mergeInto(solid, tool, merge.cut);
    solid.lastMerge = {
      ...merge,
      tool: { shape: tool.shape, faces: tool.faces, edges: tool.edges },
      after: solid.shape,
    };
  }

  engine.scene.claim(solid);
  return {};
}

/**
 * Hollows a solid to a wall thickness, opening the given faces.
 *
 * @param engine - offline engine
 * @param cmd - command payload
 * @returns the response
 */
export function shell(engine: OfflineEngine, cmd: ModelingCommand): Record<string, unknown> {
  const solid = engine.scene.getSolid(cmd['object_id'] as string);
  const thickness = cmd['shell_thickness'] as number;
  const removed = (cmd['face_ids'] as string[]).map((faceId) => requireFace(engine.oc, solid, faceId));
  const op = new engine.oc.BRepOffsetAPI_MakeThickSolid();
  let thrown = false;
  try {
    op.MakeThickSolidByJoin(
      solid.shape,
      arrayToList(engine.oc, removed),
      -thickness,
      1e-3,
      engine.oc.BRepOffset_Mode.BRepOffset_Skin,
      true,
      false,
      engine.oc.GeomAbs_JoinType.GeomAbs_Arc,
      false,
    );
  } catch {
    // A wall offset that collapses a face (a fillet whose radius equals the wall) throws Standard_ConstructionError.
    thrown = true;
  }

  // MakeThickSolid can report success yet hand back the body unchanged when a wall offset collapses part of
  // the profile, or throw; fall back to cutting an offset cavity through the removed caps.
  const unchanged =
    !thrown &&
    op.IsDone() &&
    Math.abs(volumeOf(engine.oc, op.Shape()) - volumeOf(engine.oc, solid.shape)) <
      1e-9 * Math.max(1, volumeOf(engine.oc, solid.shape));
  if (thrown || !op.IsDone() || unchanged) {
    const shelled = shellPrism(
      engine.oc,
      solid.shape,
      removed.map((face) => engine.oc.TopoDS.Face(face)),
      thickness,
    );
    if (!shelled) {
      throw new OfflineEngineError('Shell failed', 'internal_engine');
    }

    const index = new ShapeIndex(engine.oc, shelled, ['TopAbs_FACE', 'TopAbs_EDGE']);
    solid.faces = new Map([...solid.faces].filter(([, face]) => index.has(face)));
    solid.edges = new Map([...solid.edges].filter(([, edge]) => index.has(edge)));
    index.delete();
    solid.shape = shelled;
    engine.scene.claim(solid);
    return {};
  }

  rebaseSolid(engine.oc, solid, op.Shape(), algoHistory(engine.oc, op as unknown as Parameters<typeof algoHistory>[1]));
  engine.scene.claim(solid);
  return {};
}
