/* oxlint-disable new-cap -- OpenCascade API uses PascalCase method names */
/* oxlint-disable eslint/max-params -- libcascade helpers take the instance followed by their operands */

/**
 * Helices and surface blends for {@link OfflineEngine}: command handlers that take the engine as their first argument.
 */
import type { Vec3 } from '#offline/offline-math.js';
import { add, dot, length, normalize, scale, sub, vec3 } from '#offline/offline-math.js';
import type { TopoDS_Edge } from '#offline/offline-occt.js';
import { boundingBox, edgePoint, edges, faceCentroid, faces, pnt } from '#offline/offline-occt.js';
import { wireFromEdges } from '#offline/offline-sweeps.js';
import { facesOfEdge } from '#offline/offline-topology.js';
import { entityCenter } from '#offline/offline-transform.js';
import type { ModelingCommand, WireAngle, WirePoint3d } from '#offline/offline-engine.types.js';
import { OfflineEngineError, toRadians } from '#offline/offline-engine.types.js';
import type { OfflineEngine } from '#offline/offline-engine.js';
import type { EdgeSpecifier } from '#offline/offline-engine-support.js';
import { point3, tuple, frameFromNormal } from '#offline/offline-engine-support.js';

/**
 * Adds a helix curve entity.
 *
 * @param engine - offline engine
 * @param id - command id
 * @param options - helix parameters
 */
export function helix(
  engine: OfflineEngine,
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
  const axes = new engine.oc.gp_Ax3(
    pnt(engine.oc, frame.origin),
    new engine.oc.gp_Dir(...tuple(frame.z)),
    new engine.oc.gp_Dir(...tuple(frame.x)),
  );
  const surface = new engine.oc.Geom_CylindricalSurface(axes, options.radius);
  const turns = options.revolutions;
  const direction = options.clockwise ? -1 : 1;
  const totalAngle = turns * Math.PI * 2;
  const line = new engine.oc.gp_Lin2d(
    new engine.oc.gp_Pnt2d(options.startAngle, 0),
    new engine.oc.gp_Dir2d(direction * totalAngle, options.length),
  );
  const span = Math.hypot(totalAngle, options.length);
  const curve2d = new engine.oc.Geom2d_Line(line);
  const edge = new engine.oc.BRepBuilderAPI_MakeEdge(curve2d, surface, 0, span).Edge();
  engine.oc.BRepLib.BuildCurves3d(edge);
  const wire = wireFromEdges(engine.oc, [edge]);
  engine.scene.add({ kind: 'curve', id, shape: wire, axis, hidden: false });
}

/**
 * Adds a helix from an axis, radius and turns.
 *
 * @param engine - offline engine
 * @param id - command id
 * @param cmd - command payload
 * @returns the response
 */
export function helixFromParams(engine: OfflineEngine, id: string, cmd: ModelingCommand): Record<string, unknown> {
  helix(engine, id, {
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

/**
 * Adds a helix on a cylindrical face.
 *
 * @param engine - offline engine
 * @param id - command id
 * @param cmd - command payload
 * @returns the response
 */
export function helixOnCylinder(engine: OfflineEngine, id: string, cmd: ModelingCommand): Record<string, unknown> {
  const solid = engine.scene.getSolid(cmd['cylinder_id'] as string);
  const cylinderFace = faces(engine.oc, solid.shape).find((face) => {
    const adaptor = new engine.oc.BRepAdaptor_Surface(face, true);
    const isCylinder = adaptor.GetType() === engine.oc.GeomAbs_SurfaceType.GeomAbs_Cylinder;
    adaptor.delete();
    return isCylinder;
  });
  if (!cylinderFace) {
    throw new OfflineEngineError('Helix target has no cylindrical face', 'bad_request');
  }

  const adaptor = new engine.oc.BRepAdaptor_Surface(cylinderFace, true);
  const cylinder = adaptor.Cylinder();
  const position = cylinder.Position();
  const axis = vec3(position.Direction().X(), position.Direction().Y(), position.Direction().Z());
  const box = boundingBox(engine.oc, solid.shape)!;
  const along = [box.min, box.max].map((p) => dot(p, axis));
  const lengthAlong = Math.abs(along[1]! - along[0]!);
  const location = position.Location();
  const base = vec3(location.X(), location.Y(), location.Z());
  const startOffset = Math.min(along[0]!, along[1]!) - dot(base, axis);
  helix(engine, id, {
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

/**
 * The edge a command names, either by `edge_id` or, as kcl-lib sends for an `{ sideFaces, endFaces }` axis, by an
 * `edge_reference` edge specifier.
 *
 * @param engine - offline engine
 * @param cmd - command payload
 * @returns the edge
 */
export function commandEdge(engine: OfflineEngine, cmd: ModelingCommand): TopoDS_Edge {
  const reference = cmd['edge_reference'] as EdgeSpecifier | undefined;
  return reference ? engine.edgeFromSpecifier(reference) : engine.anyEdge(cmd['edge_id'] as string);
}

/**
 * Adds a helix about a straight edge.
 *
 * @param engine - offline engine
 * @param id - command id
 * @param cmd - command payload
 * @returns the response
 */
export function helixFromEdge(engine: OfflineEngine, id: string, cmd: ModelingCommand): Record<string, unknown> {
  const edge = commandEdge(engine, cmd);
  const start = edgePoint(engine.oc, edge, 0);
  const end = edgePoint(engine.oc, edge, 1);
  const axis = sub(end.point, start.point);
  helix(engine, id, {
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
 * @param engine - offline engine
 * @param id - command id; the blend body's id
 * @param cmd - command
 * @returns empty response
 */
export function surfaceBlend(engine: OfflineEngine, id: string, cmd: ModelingCommand): Record<string, unknown> {
  const surfaces = cmd['surfaces'] as Array<{
    object_id: string;
    edges?: Array<{ edge_id: string }>;
    edge_id?: string;
  }>;
  const sides = surfaces.slice(0, 2).map((surface) => {
    const edgeId = surface.edges?.[0]?.edge_id ?? surface.edge_id;
    const solid = engine.scene.getSolid(surface.object_id);
    const edge = edgeId ? engine.anyEdge(edgeId) : edges(engine.oc, solid.shape)[0]!;
    const face = facesOfEdge(engine.oc, solid.shape, edge)[0];
    const center = face ? faceCentroid(engine.oc, face).center : entityCenter(engine.oc, solid);
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
    const { point: onEdge, tangent } = edgePoint(engine.oc, side.edge, clamped);
    const along = normalize(tangent);
    const edgeLength = length(sub(edgePoint(engine.oc, side.edge, 1).point, edgePoint(engine.oc, side.edge, 0).point));
    const point = add(onEdge, scale(along, (u - clamped) * edgeLength));
    const away = sub(onEdge, side.center);
    return { point, out: normalize(sub(away, scale(along, dot(away, along)))) };
  };

  const a0 = curve(sides[0]!, 0).point;
  const flip = length(sub(curve(sides[1]!, 0).point, a0)) > length(sub(curve(sides[1]!, 1).point, a0));
  const grid = new engine.oc.NCollection_Array2_gp_Pnt(1, samples + 1, 1, samples + 1);
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
      grid.SetValue(i + 1, j + 1, pnt(engine.oc, p));
    }
  }

  const fit = new engine.oc.GeomAPI_PointsToBSplineSurface(grid, 3, 8, engine.oc.GeomAbs_Shape.GeomAbs_C2, 1e-3);
  const face = new engine.oc.BRepBuilderAPI_MakeFace(fit.Surface(), 1e-6).Face();
  fit.delete();
  grid.delete();
  engine.scene.add({ kind: 'solid', id, shape: face, faces: new Map(), edges: new Map(), sweeps: [], hidden: false });
  return {};
}
