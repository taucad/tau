/* oxlint-disable eslint/new-cap -- OCCT methods retain their native C++ names. */
import { getOC } from 'replicad';
import type { GlbMaterial } from '@taucad/geometry-core';
import type { GeometryReplicad } from '#replicad.types.js';
import type { Meshable } from '#utils/tessellation-instancing.js';

/**
 * Preserve OCCT's seam-split surface coordinates in the native extractor's vertex order.
 * @param shape - Native BRep whose triangulation produced the mesh.
 * @param mesh - Tessellated faces to enrich with UVs and tangent frames.
 * @param options - Authored material and whether vertices use prototype coordinates.
 */
export function addSurfaceCoordinates(
  shape: Meshable,
  mesh: GeometryReplicad['faces'],
  { material, prototype = false }: { material?: GlbMaterial; prototype?: boolean },
): void {
  if (mesh.texCoords !== undefined || material === undefined) {
    return;
  }
  // UVs are only needed by texture sampling and anisotropic tangent frames.
  if (!material.extensions?.KHR_materials_anisotropy && !JSON.stringify(material).includes('Texture')) {
    return;
  }
  const oc = getOC();
  const coordinates: number[] = [];
  const tangents: number[] = [];
  const rootLocation = shape.wrapped.Location();
  const inverseLocation = rootLocation.Transformation();
  inverseLocation.Invert();
  const explorer = new oc.TopExp_Explorer(shape.wrapped, oc.TopAbs_ShapeEnum.TopAbs_FACE);
  try {
    for (; explorer.More(); ) {
      const current = explorer.Current();
      explorer.Next();
      const face = oc.TopoDS.Face(current);
      const location = new oc.TopLoc_Location();
      const triangulation = oc.BRep_Tool.Triangulation(face, location, 0);
      const surface = new oc.BRepAdaptor_Surface(face, false);
      try {
        if (triangulation.isNull()) {
          continue;
        }
        if (!triangulation.HasUVNodes()) {
          throw new Error('Replicad material requires native surface UV coordinates.');
        }
        const bounds = oc.BRepTools.UVBounds(face);
        const nodeCount = triangulation.NbNodes();
        const width = bounds.UMax - bounds.UMin;
        const height = bounds.VMax - bounds.VMin;
        for (let index = 1; index <= nodeCount; index++) {
          const point = triangulation.UVNode(index);
          try {
            const vertex = coordinates.length / 2;
            coordinates.push(width > 0 ? (point.X() - bounds.UMin) / width : 0);
            coordinates.push(height > 0 ? (point.Y() - bounds.VMin) / height : 0);
            const derivatives = surface.EvalD1(point.X(), point.Y());
            try {
              if (prototype) {
                derivatives.D1U.Transform(inverseLocation);
                derivatives.D1V.Transform(inverseLocation);
              }
              const [nx, ny, nz] = mesh.normals.slice(vertex * 3, vertex * 3 + 3) as [number, number, number];
              let tx = derivatives.D1U.X();
              let ty = derivatives.D1U.Y();
              let tz = derivatives.D1U.Z();
              const projection = tx * nx + ty * ny + tz * nz;
              tx -= projection * nx;
              ty -= projection * ny;
              tz -= projection * nz;
              let length = Math.hypot(tx, ty, tz);
              if (length === 0) {
                // The U direction is undefined at a parametrization pole. Choose a finite perpendicular frame.
                [tx, ty, tz] = Math.abs(nx) < 0.9 ? [0, nz, -ny] : [-nz, 0, nx];
                length = Math.hypot(tx, ty, tz);
              }
              tx /= length;
              ty /= length;
              tz /= length;
              const handedness =
                (ny * tz - nz * ty) * derivatives.D1V.X() +
                (nz * tx - nx * tz) * derivatives.D1V.Y() +
                (nx * ty - ny * tx) * derivatives.D1V.Z();
              tangents.push(tx, ty, tz, handedness < 0 ? -1 : 1);
            } finally {
              derivatives.Point.delete();
              derivatives.D1U.delete();
              derivatives.D1V.delete();
            }
          } finally {
            point.delete();
          }
        }
      } finally {
        surface.delete();
        triangulation.delete();
        location.delete();
        face.delete();
        current.delete();
      }
    }
  } finally {
    explorer.delete();
    inverseLocation.delete();
    rootLocation.delete();
  }
  if (coordinates.length !== (mesh.vertices.length / 3) * 2 || coordinates.some((value) => !Number.isFinite(value))) {
    throw new Error('Native surface UVs must match the tessellated vertex count and remain finite.');
  }
  mesh.texCoords = coordinates;
  mesh.tangents = tangents;
}
