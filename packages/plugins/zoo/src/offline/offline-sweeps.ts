/* oxlint-disable new-cap -- OpenCascade API uses PascalCase method names */
/* eslint-disable @typescript-eslint/naming-convention -- structural types mirror libcascade method names */
/* oxlint-disable eslint/max-params -- libcascade helpers take the instance followed by their operands */
/**
 * Profile-to-solid operations: extrude, twist extrude, revolve, sweep and loft.
 *
 * Each turns a profile (a path or region's faces plus its curve ids) into a solid and records which side face
 * each curve generated, which `solid3d_get_extrusion_face_info` later reports to kcl-lib.
 */
import type { Frame, Vec3 } from '#offline/offline-math.js';
import { add, cross, directionToGlobal, normalize, scale, toGlobal, vec3 } from '#offline/offline-math.js';
import type { Oc, TopoDS_Edge, TopoDS_Face, TopoDS_Shape, gp_Trsf } from '#offline/offline-occt.js';
import {
  ax1,
  compound,
  dir,
  edgePoint,
  faces,
  pnt,
  edges,
  gvec,
  listToArray,
  areaOf,
  volumeOf,
  solidsOf,
  subShapes,
} from '#offline/offline-occt.js';
import type { SweepFaces } from '#offline/offline-scene.js';
import { applyTrsf, rotationTrsf, translationTrsf } from '#offline/offline-transform.js';
import { OfflineEngineError } from '#offline/offline-engine.types.js';

/** A sketch profile ready to sweep. */
export type Profile = {
  /** Id of the path or region; the resulting solid takes this id. */
  sourceId: string;
  frame: Frame;
  faces: TopoDS_Face[];
  /** Curve id → the boundary edge it maps to on `faces`. */
  curves: Array<{ id: string; edge: TopoDS_Edge }>;
  /** Curve a loft starts this section's wire at, so sections built the same way line up vertex for vertex. */
  firstCurveId?: string;
  onFace?: { solidId: string; faceId: string };
  /** A surface body: the swept faces without their caps. */
  surface?: boolean;
};

/** Face ids kcl-lib may pre-assign on extrude. */
export type PresetFaces = {
  // oxlint-disable-next-line typescript/no-restricted-types -- kcl-lib sends null
  bottom?: string | null;
  top?: string;
  sides?: Array<{ path_id: string; face_id: string }>;
  // oxlint-disable-next-line typescript/no-restricted-types -- kcl-lib sends null
} | null;

/** What a sweep produced, before it becomes a scene entity. */
export type SweepResult = {
  shape: TopoDS_Shape;
  faces: Map<string, TopoDS_Shape>;
  edges: Map<string, TopoDS_Shape>;
  sweep: SweepFaces;
};

/**
 * Moves a profile by a transform, so a sweep can start somewhere other than the sketch plane.
 *
 * @param oc - libcascade instance
 * @param profile - profile
 * @param trsf - transform
 * @returns the moved profile
 */
export function moveProfile(oc: Oc, profile: Profile, trsf: gp_Trsf): Profile {
  const location = new oc.TopLoc_Location(trsf);
  return {
    ...profile,
    faces: profile.faces.map((face) => oc.TopoDS.Face(face.Moved(location, false))),
    curves: profile.curves.map((curve) => ({ id: curve.id, edge: oc.TopoDS.Edge(curve.edge.Moved(location, false)) })),
  };
}

type Generator = {
  Generated(shape: TopoDS_Shape): ReturnType<Oc['BRepBuilderAPI_MakeShape']['prototype']['Generated']>;
};

const firstGenerated = (oc: Oc, algo: Generator, shape: TopoDS_Shape): TopoDS_Shape | undefined =>
  listToArray(oc, algo.Generated(shape)).find((s) => s.ShapeType() === oc.TopAbs_ShapeEnum.TopAbs_FACE);

/**
 * Collects side faces, caps and curve edges into id tables.
 *
 * @param oc - libcascade instance
 * @param options - generated geometry and id policy
 * @returns tables and face info
 */
function recordSweep(
  oc: Oc,
  options: {
    profile: Profile;
    sideFace: (edge: TopoDS_Edge) => TopoDS_Shape | undefined;
    startCap?: TopoDS_Shape;
    endCap?: TopoDS_Shape;
    preset: PresetFaces;
    mint: () => string;
  },
): Omit<SweepResult, 'shape'> {
  const { profile, preset, mint } = options;
  const facesMap = new Map<string, TopoDS_Shape>();
  const edgesMap = new Map<string, TopoDS_Shape>();
  const sideFaceByCurve = new Map<string, string>();
  const curveIds: string[] = [];
  for (const curve of profile.curves) {
    curveIds.push(curve.id);
    edgesMap.set(curve.id, curve.edge);
    const face = options.sideFace(curve.edge);
    if (!face) {
      continue;
    }

    const presetId = preset?.sides?.find((side) => side.path_id === curve.id)?.face_id;
    const existing = [...facesMap].find(([, candidate]) => candidate.IsSame(face))?.[0];
    const faceId = existing ?? presetId ?? mint();
    facesMap.set(faceId, face);
    sideFaceByCurve.set(curve.id, faceId);
  }

  const sweep: SweepFaces = { curveIds, sideFaceByCurve };
  const isFace = (shape: TopoDS_Shape | undefined): shape is TopoDS_Shape =>
    Boolean(shape && !shape.IsNull() && shape.ShapeType() === oc.TopAbs_ShapeEnum.TopAbs_FACE);
  if (isFace(options.startCap)) {
    sweep.startCapId = preset?.bottom ?? mint();
    facesMap.set(sweep.startCapId, options.startCap);
  }

  if (isFace(options.endCap)) {
    sweep.endCapId = preset?.top ?? mint();
    facesMap.set(sweep.endCapId, options.endCap);
  }

  return { faces: facesMap, edges: edgesMap, sweep };
}

/**
 * Ensures a solid has positive volume, reversing it when a sweep came out inside-out.
 *
 * @param oc - libcascade instance
 * @param shape - swept shape
 * @returns a correctly oriented shape
 */
export function orientOutward(oc: Oc, shape: TopoDS_Shape): TopoDS_Shape {
  const volume = volumeOf(oc, shape);
  return volume < 0 ? shape.Reversed() : shape;
}

/**
 * Sweeps several faces with one generator per face and combines the results.
 *
 * @param oc - libcascade instance
 * @param profile - profile
 * @param make - builds the generator for one face
 * @param preset - pre-assigned face ids
 * @param mint - id factory
 * @returns sweep result
 */
// oxlint-disable-next-line max-params -- generator factory and id policy
function sweepFaces<
  T extends Generator & { Shape(): TopoDS_Shape; FirstShape?(): TopoDS_Shape; LastShape?(): TopoDS_Shape },
>(oc: Oc, profile: Profile, make: (face: TopoDS_Shape) => T, preset: PresetFaces, mint: () => string): SweepResult {
  const generators = sweepInputs(profile).map((input) => make(input));
  const shapes = generators.map((generator) => orientOutward(oc, generator.Shape()));
  const caps = generators
    .flatMap((generator) => [generator.FirstShape?.(), generator.LastShape?.()])
    .filter((cap): cap is TopoDS_Shape => Boolean(cap && !cap.IsNull()));
  const sideFace = (edge: TopoDS_Edge): TopoDS_Shape | undefined => {
    for (const generator of generators) {
      const face = firstGenerated(oc, generator, edge);
      if (face) {
        return face;
      }
    }

    // A revolve reports no history for a segment perpendicular to its axis, whose face is a planar disc or annulus
    // through the segment itself: take the swept face, other than a cap, that the segment's midpoint lies on.
    const probe = new oc.BRepBuilderAPI_MakeVertex(pnt(oc, edgePoint(oc, edge, 0.5).point)).Vertex();
    for (const shape of shapes) {
      for (const face of faces(oc, shape)) {
        if (caps.some((cap) => cap.IsSame(face))) {
          continue;
        }

        const distance = new oc.BRepExtrema_DistShapeShape(
          probe,
          face,
          oc.Extrema_ExtFlag.Extrema_ExtFlag_MIN,
          oc.Extrema_ExtAlgo.Extrema_ExtAlgo_Grad,
        );
        const touches = distance.IsDone() && distance.Value() < 1e-7;
        distance.delete();
        if (touches) {
          return face;
        }
      }
    }

    return undefined;
  };

  const recorded = recordSweep(oc, {
    profile,
    sideFace,
    startCap: generators[0]!.FirstShape?.(),
    endCap: generators[0]!.LastShape?.(),
    preset,
    mint,
  });
  let shape = shapes.length === 1 ? shapes[0]! : fuseAll(oc, shapes);
  // A pipe starts from a relocated copy of the profile, so a curve's own edge is not part of the solid: track the
  // start-cap edge its side face grew from instead, which scales, mirrors and edge lookups can then find.
  const solidEdges = edges(oc, shape);
  const inSolid = (edge: TopoDS_Shape): boolean => solidEdges.some((candidate) => candidate.IsSame(edge));
  for (const curve of profile.curves) {
    if (inSolid(curve.edge)) {
      continue;
    }

    for (const generator of generators) {
      const side = firstGenerated(oc, generator, curve.edge);
      const first = generator.FirstShape?.();
      const capEdges = first && !first.IsNull() ? edges(oc, first) : [];
      const capEdge = side && edges(oc, side).find((edge) => capEdges.some((cap) => cap.IsSame(edge)));
      if (capEdge && inSolid(capEdge)) {
        recorded.edges.set(curve.id, capEdge);
        break;
      }
    }
  }

  if (profile.surface && profile.faces.length > 0) {
    // A surface body is the solid's boundary without its caps, so its faces keep the solid's outward normals.
    const capFaces = generators.flatMap((generator) => [generator.FirstShape?.(), generator.LastShape?.()]);
    shape = compound(
      oc,
      faces(oc, shape).filter((face) => !capFaces.some((cap) => cap?.IsSame(face))),
    );
    for (const capId of [recorded.sweep.startCapId, recorded.sweep.endCapId]) {
      recorded.faces.delete(capId!);
    }

    recorded.sweep.startCapId = undefined;
    recorded.sweep.endCapId = undefined;
  }

  return { shape, ...recorded };
}

/**
 * What a sweep moves: the profile's faces, or for a surface body of a profile that encloses no area, its open curves,
 * which sweep into faces without caps.
 *
 * @param profile - the swept profile
 * @returns sweep inputs
 */
function sweepInputs(profile: Profile): TopoDS_Shape[] {
  if (profile.faces.length === 0) {
    if (profile.curves.length === 0) {
      throw new OfflineEngineError('The profile does not enclose an area', 'bad_request');
    }

    return profile.curves.map((curve) => curve.edge);
  }

  return profile.faces;
}

/**
 * The direction an edge is extruded in when none is given: halfway between the faces on either side of it, or
 * along the normal of the one face of a surface's boundary edge.
 *
 * @param oc - libcascade instance
 * @param shape - the body the edge belongs to
 * @param edge - edge
 * @returns unit direction
 */
export function edgeExtrudeDirection(oc: Oc, shape: TopoDS_Shape, edge: TopoDS_Edge): Vec3 {
  let sum = vec3(0, 0, 0);
  for (const face of faces(oc, shape).filter((candidate) => edges(oc, candidate).some((other) => other.IsSame(edge)))) {
    const first = new oc.gp_Pnt2d();
    const last = new oc.gp_Pnt2d();
    oc.BRep_Tool.UVPoints(edge, face, first, last);
    const surface = new oc.BRepAdaptor_Surface(face, true);
    const p = new oc.gp_Pnt();
    const du = new oc.gp_Vec();
    const dv = new oc.gp_Vec();
    surface.D1((first.X() + last.X()) / 2, (first.Y() + last.Y()) / 2, p, du, dv);
    const normal = normalize(cross(vec3(du.X(), du.Y(), du.Z()), vec3(dv.X(), dv.Y(), dv.Z())));
    sum = add(sum, scale(normal, face.Orientation() === oc.TopAbs_Orientation.TopAbs_REVERSED ? -1 : 1));
    for (const item of [first, last, surface, p, du, dv]) {
      item.delete();
    }
  }

  return normalize(sum);
}

/**
 * Fuses shapes into one; history is not tracked, so callers use this only for freshly built bodies.
 *
 * @param oc - libcascade instance
 * @param shapes - shapes
 * @returns fused shape
 */
export function fuseAll(oc: Oc, shapes: readonly TopoDS_Shape[]): TopoDS_Shape {
  if (shapes.length === 1) {
    return shapes[0]!;
  }

  const solids = shapes.flatMap((shape) => solidsOf(oc, shape));
  return compound(oc, solids.length > 0 ? solids : shapes);
}

/** Extrusion extent along the sketch normal, as an offset and a total length. */
export type ExtrudeExtent = { offset: number; length: number };

/**
 * Extrudes a profile along a direction.
 *
 * @param oc - libcascade instance
 * @param profile - profile
 * @param direction - unit extrusion direction (the sketch normal unless overridden)
 * @param extent - start offset and length along `direction`
 * @param preset - pre-assigned face ids
 * @param mint - id factory
 * @returns sweep result
 */
// oxlint-disable-next-line max-params -- wire fields
export function extrudeProfile(
  oc: Oc,
  profile: Profile,
  direction: Vec3,
  extent: ExtrudeExtent,
  preset: PresetFaces,
  mint: () => string,
): SweepResult {
  if (Math.abs(extent.length) < 1e-9) {
    throw new OfflineEngineError('Cannot extrude by zero length', 'bad_request');
  }

  const moved =
    Math.abs(extent.offset) > 1e-12
      ? moveProfile(oc, profile, translationTrsf(oc, scale(direction, extent.offset)))
      : profile;
  const vector = gvec(oc, scale(direction, extent.length));
  const result = sweepFaces(oc, moved, (face) => new oc.BRepPrimAPI_MakePrism(face, vector, false, true), preset, mint);
  result.sweep.direction = extent.length < 0 ? scale(direction, -1) : direction;
  const { startCapId, endCapId } = result.sweep;
  if (extent.length < 0 && startCapId && endCapId) {
    // The Zoo engine names the cap facing against the sketch normal START, so a negative extrusion's caps swap.
    const start = result.faces.get(startCapId)!;
    result.faces.set(startCapId, result.faces.get(endCapId)!);
    result.faces.set(endCapId, start);
  }

  return result;
}

/**
 * Revolves a profile about an axis.
 *
 * @param oc - libcascade instance
 * @param profile - profile
 * @param axis - axis origin and direction (global)
 * @param angle - start offset and sweep angle, radians
 * @param preset - pre-assigned face ids
 * @param mint - id factory
 * @returns sweep result
 */
// oxlint-disable-next-line max-params -- wire fields
export function revolveProfile(
  oc: Oc,
  profile: Profile,
  axis: { origin: Vec3; direction: Vec3 },
  angle: { offset: number; sweep: number },
  preset: PresetFaces,
  mint: () => string,
): SweepResult {
  const moved =
    Math.abs(angle.offset) > 1e-12
      ? moveProfile(oc, profile, rotationTrsf(oc, axis.origin, axis.direction, angle.offset))
      : profile;
  const full = Math.abs(Math.abs(angle.sweep) - Math.PI * 2) < 1e-9;
  const line = ax1(oc, axis.origin, normalize(axis.direction));
  return sweepFaces(
    oc,
    moved,
    (face) =>
      full
        ? new oc.BRepPrimAPI_MakeRevol(face, line, false)
        : new oc.BRepPrimAPI_MakeRevol(face, line, angle.sweep, false),
    preset,
    mint,
  );
}

/**
 * Sweeps a profile along a spine wire.
 *
 * @param oc - libcascade instance
 * @param profile - profile
 * @param spine - trajectory wire
 * @param mint - id factory
 * @returns sweep result
 */
export function sweepProfile(
  oc: Oc,
  profile: Profile,
  spine: TopoDS_Shape,
  mint: () => string,
  binormal?: Vec3,
): SweepResult {
  const wire = oc.TopoDS.Wire(spine);
  return sweepFaces(
    oc,
    profile,
    (section) => {
      const isFace = section.ShapeType() === oc.TopAbs_ShapeEnum.TopAbs_FACE;
      const outer = binormal && isFace ? oc.BRepTools.OuterWire(oc.TopoDS.Face(section)) : undefined;
      if (binormal && outer && edges(oc, section).length === edges(oc, outer).length) {
        // Along a helix, hold the section's binormal on the helix axis, as thread and spring sweeps expect;
        // a Frenet frame drifts on the approximated helix.
        const shell = new oc.BRepOffsetAPI_MakePipeShell(wire);
        shell.SetMode(dir(oc, binormal));
        shell.Add(outer, false, false);
        shell.Build();
        if (shell.IsDone() && shell.MakeSolid()) {
          return shell;
        }
      }

      return new oc.BRepOffsetAPI_MakePipe(wire, section, oc.GeomFill_Trihedron.GeomFill_IsCorrectedFrenet, false);
    },
    null,
    mint,
  );
}

/**
 * Lofts through the outer wires of several profiles.
 *
 * @param oc - libcascade instance
 * @param profiles - sections in order
 * @param ruled - straight sections between profiles
 * @param mint - id factory
 * @param solid - a closed solid; false lofts an open surface
 * @returns sweep result
 */
export function loftProfiles(
  oc: Oc,
  profiles: readonly Profile[],
  ruled: boolean,
  mint: () => string,
  solid = true,
): SweepResult {
  const loft = new oc.BRepOffsetAPI_ThruSections(solid, ruled, 1e-6);
  const wires = profiles.map((profile) => {
    const face = profile.faces.length > 1 ? mergedFace(oc, profile.faces) : profile.faces[0];
    if (face) {
      return alignedOuterWire(oc, profile, face);
    }

    // An open section lofts into a surface through the section's curves.
    if (solid || profile.curves.length === 0) {
      throw new OfflineEngineError('A loft section does not enclose an area', 'bad_request');
    }

    return wireFromEdges(
      oc,
      profile.curves.map((curve) => curve.edge),
    );
  });
  // Sections with different edge counts crash libcascade's loft unless it first re-splits them to match.
  const edgeCounts = new Set(wires.map((wire) => edges(oc, wire).length));
  loft.CheckCompatibility(edgeCounts.size > 1);
  for (const wire of wires) {
    loft.AddWire(oc.TopoDS.Wire(wire));
  }

  loft.Build();
  if (!loft.IsDone()) {
    throw new OfflineEngineError('Loft failed', 'internal_engine');
  }

  const first = profiles[0]!;
  const recorded = recordSweep(oc, {
    profile: first,
    sideFace: (edge) => {
      const face = loft.GeneratedFace(edge);
      return face.IsNull() ? undefined : face;
    },
    startCap: loft.FirstShape(),
    endCap: loft.LastShape(),
    preset: null,
    mint,
  });
  return { shape: solid ? orientOutward(oc, loft.Shape()) : loft.Shape(), ...recorded };
}

/** Section spacing of a continuous twist built from lofts. */
const defaultTwistStep = (5 * Math.PI) / 180;

/**
 * Extrudes while rotating: a pipe shell along the axis for a large continuous twist, otherwise a loft through rotated
 * copies of the profile.
 *
 * @param oc - libcascade instance
 * @param profile - profile
 * @param options - distance, twist and step
 * @param mint - id factory
 * @returns sweep result
 */
export function twistExtrudeProfile(
  oc: Oc,
  profile: Profile,
  options: {
    distance: number;
    center: { x: number; y: number };
    totalAngle: number;
    stepAngle: number;
  },
  mint: () => string,
): SweepResult {
  // A zero step asks for a continuous twist. Past two loft sections, sweep the section along the axis with a helix
  // steering its rotation: one surface per edge instead of up to 48 stacked sections. A small twist stays a two-section
  // loft, which is faster than the sweep there and closer to the exact volume (a twist preserves volume, and the
  // sweep's approximation loses about 0.4% on a gear).
  if (Math.abs(options.stepAngle) <= 1e-9 && Math.abs(options.totalAngle) > 2 * defaultTwistStep) {
    const swept = twistByPipe(oc, profile, options, mint);
    if (swept) {
      return swept;
    }
  }

  return twistByLofts(oc, profile, options, mint);
}

/**
 * A continuous twist as a pipe shell: the spine runs along the sketch normal through the twist centre, and an
 * auxiliary helix about it turns the section by the total angle over the distance.
 *
 * @param oc - libcascade instance
 * @param profile - profile
 * @param options - distance, twist and centre
 * @param mint - id factory
 * @returns sweep result, or undefined when the pipe shell fails and the lofts should be tried
 */
function twistByPipe(
  oc: Oc,
  profile: Profile,
  options: {
    distance: number;
    center: { x: number; y: number };
    totalAngle: number;
  },
  mint: () => string,
): SweepResult | undefined {
  const { frame } = profile;
  const origin = toGlobal(frame, options.center.x, options.center.y);
  const end = {
    x: origin.x + frame.z.x * options.distance,
    y: origin.y + frame.z.y * options.distance,
    z: origin.z + frame.z.z * options.distance,
  };
  const spine = oc.TopoDS.Wire(
    wireFromEdges(oc, [new oc.BRepBuilderAPI_MakeEdge(pnt(oc, origin), pnt(oc, end)).Edge()]),
  );
  // The helix's radius only sets how the rotation is sampled; one unit is enough at any model size.
  const axes = new oc.gp_Ax3(
    pnt(oc, origin),
    dir(oc, scale(frame.z, Math.sign(options.distance) || 1)),
    dir(oc, frame.x),
  );
  const surface = new oc.Geom_CylindricalSurface(axes, 1);
  const length = Math.abs(options.distance);
  const line = new oc.gp_Lin2d(
    new oc.gp_Pnt2d(0, 0),
    new oc.gp_Dir2d(options.totalAngle * Math.sign(options.distance || 1), length),
  );
  const helixEdge = new oc.BRepBuilderAPI_MakeEdge(
    new oc.Geom2d_Line(line),
    surface,
    0,
    Math.hypot(options.totalAngle, length),
  ).Edge();
  oc.BRepLib.BuildCurves3d(helixEdge);
  const helix = oc.TopoDS.Wire(wireFromEdges(oc, [helixEdge]));
  const solids: TopoDS_Shape[] = [];
  let recorded: Omit<SweepResult, 'shape'> | undefined;
  const sections = profile.faces.length > 1 ? [mergedFace(oc, profile.faces)] : profile.faces;
  try {
    for (const face of sections) {
      const outer = oc.BRepTools.OuterWire(face);
      const wires = [outer, ...wiresOf(oc, face).filter((wire) => !wire.IsSame(outer))];
      const parts: TopoDS_Shape[] = [];
      for (const [index, wire] of wires.entries()) {
        const pipe = new oc.BRepOffsetAPI_MakePipeShell(spine);
        pipe.SetMode(helix, false, oc.BRepFill_TypeOfContact.BRepFill_NoContact);
        pipe.Add(wire, false, false);
        pipe.Build(new oc.Message_ProgressRange());
        if (!pipe.IsDone() || !pipe.MakeSolid()) {
          return undefined;
        }

        if (index === 0 && !recorded && face === sections[0]) {
          recorded = recordSweep(oc, {
            profile,
            sideFace: (edge) =>
              listToArray(oc, pipe.Generated(edge)).find(
                (shape) => shape.ShapeType() === oc.TopAbs_ShapeEnum.TopAbs_FACE,
              ),
            startCap: pipe.FirstShape(),
            endCap: pipe.LastShape(),
            preset: null,
            mint,
          });
        }

        parts.push(orientOutward(oc, pipe.Shape()));
      }

      let body = parts[0]!;
      for (const hole of parts.slice(1)) {
        body = new oc.BRepAlgoAPI_Cut(body, hole).Shape();
      }

      solids.push(body);
    }
  } catch {
    return undefined;
  }

  return recorded && { shape: fuseAll(oc, solids), ...recorded };
}

/**
 * A twist as lofts through rotated copies of the section, one every step angle.
 *
 * @param oc - libcascade instance
 * @param profile - profile
 * @param options - distance, twist, centre and step
 * @param mint - id factory
 * @returns sweep result
 */
function twistByLofts(
  oc: Oc,
  profile: Profile,
  options: {
    distance: number;
    center: { x: number; y: number };
    totalAngle: number;
    stepAngle: number;
  },
  mint: () => string,
): SweepResult {
  const { frame } = profile;
  const stepAngle = Math.abs(options.stepAngle) > 1e-9 ? Math.abs(options.stepAngle) : defaultTwistStep;
  const steps = Math.min(Math.max(Math.ceil(Math.abs(options.totalAngle) / stepAngle), 2), 48);
  const axisOrigin = toGlobal(frame, options.center.x, options.center.y);
  const solids: TopoDS_Shape[] = [];
  let recorded: Omit<SweepResult, 'shape'> | undefined;
  const sections = profile.faces.length > 1 ? [mergedFace(oc, profile.faces)] : profile.faces;
  for (const face of sections) {
    const outer = oc.BRepTools.OuterWire(face);
    const wires = [outer, ...wiresOf(oc, face).filter((wire) => !wire.IsSame(outer))];
    // oxlint-disable-next-line eslint/no-loop-func -- the callback runs synchronously within this iteration
    const parts = wires.map((wire, index) => {
      const loft = new oc.BRepOffsetAPI_ThruSections(true, false, 1e-6);
      loft.CheckCompatibility(false);
      for (let step = 0; step <= steps; step++) {
        const t = step / steps;
        const trsf = translationTrsf(oc, scale(frame.z, options.distance * t));
        trsf.Multiply(rotationTrsf(oc, axisOrigin, frame.z, options.totalAngle * t));
        loft.AddWire(step === 0 ? wire : oc.TopoDS.Wire(applyTrsf(oc, wire, trsf).shape));
      }

      loft.Build();
      if (!loft.IsDone()) {
        throw new OfflineEngineError('Twist extrude failed', 'internal_engine');
      }

      if (index === 0 && !recorded && face === sections[0]) {
        recorded = recordSweep(oc, {
          profile,
          sideFace: (edge) => {
            const generated = loft.GeneratedFace(edge);
            return generated.IsNull() ? undefined : generated;
          },
          startCap: loft.FirstShape(),
          endCap: loft.LastShape(),
          preset: null,
          mint,
        });
      }

      return orientOutward(oc, loft.Shape());
    });
    let body = parts[0]!;
    for (const hole of parts.slice(1)) {
      body = new oc.BRepAlgoAPI_Cut(body, hole).Shape();
    }

    solids.push(body);
  }

  return { shape: fuseAll(oc, solids), ...recorded! };
}

const wiresOf = (oc: Oc, face: TopoDS_Face): Array<ReturnType<Oc['TopoDS']['Wire']>> => {
  const out: Array<ReturnType<Oc['TopoDS']['Wire']>> = [];
  const explorer = new oc.TopExp_Explorer(face, oc.TopAbs_ShapeEnum.TopAbs_WIRE, oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
  // oxlint-disable-next-line typescript/no-confusing-void-expression -- libcascade iterator idiom
  for (; explorer.More(); explorer.Next()) {
    out.push(oc.TopoDS.Wire(explorer.Current()));
  }

  explorer.delete();
  return out;
};

/**
 * Builds a wire through edges in order.
 *
 * @param oc - libcascade instance
 * @param pieces - edges
 * @returns wire
 */
export function wireFromEdges(oc: Oc, pieces: readonly TopoDS_Shape[]): TopoDS_Shape {
  const maker = new oc.BRepBuilderAPI_MakeWire();
  for (const piece of pieces) {
    maker.Add(oc.TopoDS.Edge(piece));
  }

  if (!maker.IsDone()) {
    // Disconnected pieces: let libcascade sort them.
    const fixer = new oc.BRepBuilderAPI_MakeWire();
    const list = new oc.NCollection_List_TopoDS_Shape();
    for (const piece of pieces) {
      list.Append(piece);
    }

    fixer.Add(list);
    return fixer.Wire();
  }

  return maker.Wire();
}

/**
 * Face frame helper for solids built directly from a frame (helix cylinders, revolve axes in 2D).
 *
 * @param frame - sketch frame
 * @param axis - plane-local axis direction
 * @param origin - plane-local origin
 * @returns global axis
 */
export function axisFromSketch(
  frame: Frame,
  axis: { x: number; y: number },
  origin: { x: number; y: number },
): { origin: Vec3; direction: Vec3 } {
  return {
    origin: toGlobal(frame, origin.x, origin.y),
    direction: normalize(directionToGlobal(frame, axis.x, axis.y)),
  };
}

/**
 * A section's outer wire, restarted at the profile's first curve. libcascade pairs loft sections vertex by vertex
 * from each wire's start, and a region's wire otherwise starts wherever the arrangement put it.
 *
 * @param oc - libcascade instance
 * @param profile - section profile
 * @param face - section face
 * @returns outer wire
 */
function alignedOuterWire(oc: Oc, profile: Profile, face: TopoDS_Face): TopoDS_Shape {
  const wire = oc.BRepTools.OuterWire(face);
  const first = profile.curves.find((curve) => curve.id === profile.firstCurveId)?.edge;
  if (!first) {
    return wire;
  }

  const ordered: TopoDS_Edge[] = [];
  const explorer = new oc.BRepTools_WireExplorer(wire, face);
  // oxlint-disable-next-line typescript/no-confusing-void-expression -- libcascade iterator idiom
  for (; explorer.More(); explorer.Next()) {
    ordered.push(explorer.Current());
  }

  explorer.delete();
  const start = ordered.findIndex((edge) => edge.IsSame(first));
  if (start <= 0) {
    return wire;
  }

  const maker = new oc.BRepBuilderAPI_MakeWire();
  for (const edge of [...ordered.slice(start), ...ordered.slice(0, start)]) {
    maker.Add(edge);
  }

  return maker.IsDone() ? maker.Wire() : wire;
}

/**
 * Merges the faces of one sketch arrangement into a single face. A path that touches itself (pattern copies that
 * meet tooth to tooth) splits into many small faces, while a loft needs the one outline.
 *
 * @param oc - libcascade instance
 * @param pieces - coplanar faces sharing edges
 * @returns the merged face, or the largest piece when they do not merge into one
 */
function mergedFace(oc: Oc, pieces: readonly TopoDS_Face[]): TopoDS_Face {
  const unify = new oc.ShapeUpgrade_UnifySameDomain(compound(oc, pieces), true, true, false);
  unify.Build();
  const merged = subShapes(oc, unify.Shape(), 'TopAbs_FACE');
  if (merged.length === 1) {
    return oc.TopoDS.Face(merged[0]!);
  }

  const area = (face: TopoDS_Face): number => areaOf(oc, face);
  return [...pieces].sort((a, b) => area(b) - area(a))[0]!;
}
