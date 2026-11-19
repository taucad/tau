/* oxlint-disable eslint/new-cap -- OCCT methods retain their native C++ names. */
import { getOC } from 'replicad';
import type { OpenCascadeInstance } from 'replicad-opencascadejs';
import type { GlbMaterial } from '@taucad/geometry-core';
import type { GeometryReplicad } from '#replicad.types.js';
import type { Meshable } from '#utils/tessellation-instancing.js';

/**
 * Whether a material makes {@link addSurfaceCoordinates} add surface coordinates: only texture sampling and
 * anisotropic tangent frames need them.
 * @param material - The authored material, if any.
 * @returns True when the mesh gets UVs and tangents for it.
 */
export function needsSurfaceCoordinates(material: GlbMaterial | undefined): material is GlbMaterial {
  return (
    material !== undefined &&
    (Boolean(material.extensions?.KHR_materials_anisotropy) || JSON.stringify(material).includes('Texture'))
  );
}

/* eslint-disable @typescript-eslint/naming-convention -- OCJS embind mirrors C++ PascalCase method names. */
type NativeSurfaceBindings = {
  wasmMemory: WebAssembly.Memory;
  ReplicadSurfaceCoordinates?: {
    AllocateNormals(size: number): NativeBuffer;
    Extract(shape: unknown, normalsPointer: number, normalsSize: number, prototype: boolean): NativeSurfaceData;
  };
};

type NativeBuffer = {
  getPtr(): number;
  getSize(): number;
  delete(): void;
};

type NativeSurfaceData = {
  getTexCoordsPtr(): number;
  getTexCoordsSize(): number;
  getTangentsPtr(): number;
  getTangentsSize(): number;
  getStatus(): number;
  delete(): void;
};
/* eslint-enable @typescript-eslint/naming-convention -- end of embind-mirrored names */

type SurfaceCoordinates = { texCoords: number[]; tangents: number[] };

type SurfaceInput = {
  /** Native BRep whose triangulation produced the mesh. */
  shape: Meshable;
  /** The mesh's normals, in vertex order. */
  normals: ArrayLike<number>;
  /** Whether the vertices are in prototype coordinates. */
  prototype: boolean;
};

const missingUvNodes = 'Replicad material requires native surface UV coordinates.';

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
  if (mesh.texCoords !== undefined || !needsSurfaceCoordinates(material)) {
    return;
  }
  const oc = getOC();
  // Feature-detected at run time: an older build (or a caller's own OpenCascade) may not have it.
  const detected: { ReplicadSurfaceCoordinates?: unknown } = oc;
  const { texCoords, tangents } =
    detected.ReplicadSurfaceCoordinates === undefined
      ? surfaceCoordinatesInJavaScript(oc, { shape, normals: mesh.normals, prototype })
      : nativeSurfaceCoordinates(oc as OpenCascadeInstance & Required<NativeSurfaceBindings>, {
          shape,
          normals: mesh.normals,
          prototype,
        });
  if (texCoords.length !== (mesh.vertices.length / 3) * 2 || texCoords.some((value) => !Number.isFinite(value))) {
    throw new Error('Native surface UVs must match the tessellated vertex count and remain finite.');
  }
  mesh.texCoords = texCoords;
  mesh.tangents = tangents;
}

/**
 * Surface coordinates in one native call (`ReplicadSurfaceCoordinates.Extract`), which ports
 * {@link surfaceCoordinatesInJavaScript} operation for operation and returns the same doubles.
 * @param oc - The OpenCascade instance with the native extractor.
 * @param input - The shape, its mesh's normals and whether the vertices are in prototype coordinates.
 * @returns UVs (two per vertex) and tangents (four per vertex).
 */
export function nativeSurfaceCoordinates(
  oc: OpenCascadeInstance & Required<NativeSurfaceBindings>,
  { shape, normals, prototype }: SurfaceInput,
): SurfaceCoordinates {
  const extractor = oc.ReplicadSurfaceCoordinates;
  const buffer = extractor.AllocateNormals(normals.length);
  try {
    new Float64Array(oc.wasmMemory.buffer, buffer.getPtr(), normals.length).set(normals);
    const data = extractor.Extract(shape.wrapped, buffer.getPtr(), buffer.getSize(), prototype);
    try {
      if (data.getStatus() !== 0) {
        throw new Error(missingUvNodes);
      }
      // Read after the call: it may have grown memory, detaching earlier views.
      const memory = oc.wasmMemory.buffer;
      return {
        texCoords: [...new Float64Array(memory, data.getTexCoordsPtr(), data.getTexCoordsSize())],
        tangents: [...new Float64Array(memory, data.getTangentsPtr(), data.getTangentsSize())],
      };
    } finally {
      data.delete();
    }
  } finally {
    buffer.delete();
  }
}

/**
 * Surface coordinates through the generated bindings, one node at a time: the path for an OpenCascade build without
 * the native extractor.
 * @param oc - The OpenCascade instance.
 * @param input - The shape, its mesh's normals and whether the vertices are in prototype coordinates.
 * @returns UVs (two per vertex) and tangents (four per vertex).
 */
export function surfaceCoordinatesInJavaScript(
  oc: OpenCascadeInstance,
  { shape, normals, prototype }: SurfaceInput,
): SurfaceCoordinates {
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
          throw new Error(missingUvNodes);
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
              const nx = normals[vertex * 3]!;
              const ny = normals[vertex * 3 + 1]!;
              const nz = normals[vertex * 3 + 2]!;
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
  return { texCoords: coordinates, tangents };
}
