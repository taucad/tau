import { cadMaterialDefaults, tauCadTopologyExtension } from '@taucad/runtime/types';
import type { KernelIssue } from '@taucad/runtime/types';
import {
  formatComponentId,
  formatNamedComponentId,
  uniqueComponentId,
  formatPrimitiveSelector,
  toMechanismKernelIssue,
  transformNormalArray,
  transformVectorArrayChecked,
  writeGlb,
  writeGltfJson,
} from '@taucad/geometry-core';
import type {
  GeometryOutputTransformOptions,
  GlbInput,
  GlbMaterial,
  GlbNode,
  GlbResources,
  TauCadTopologyPayload,
} from '@taucad/geometry-core';
import { resolveMechanismComponents, transformMechanism } from '@taucad/kinematics';

import { projectSurfaceCoordinates } from '#picovoxel.surface-coordinates.js';

import type { PicovoxelLane } from '#picovoxel.schemas.js';

const triangleMode = 4;

const hasMaterialTexture = (value: unknown): boolean =>
  value !== null &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.entries(value).some(
    ([key, child]) => key !== 'extras' && child !== undefined && (key.endsWith('Texture') || hasMaterialTexture(child)),
  );

/** Structured-cloneable geometry retained after a PicoVoxel session is disposed. @public */
export type PicovoxelShapeSnapshot = {
  readonly name: string;
  /** Explicit, nonblank authored name; generated display labels never bind mechanisms. */
  readonly authoredName?: string;
  /** Welded vertex positions, `[x, y, z, …]` in millimetres, Z up. */
  readonly vertices: Float32Array<ArrayBuffer>;
  /** Triangle vertex indices into `vertices`, three per triangle. */
  readonly triangles: Uint32Array<ArrayBuffer>;
  /** The lane whose session built this shape. */
  readonly lane: PicovoxelLane;
  /** Deeply owned standard glTF material; absent retains the legacy CAD defaults. */
  readonly material?: GlbMaterial;
};

/** Durable native handle for PicoVoxel render, cache, and export phases. @public */
export type PicovoxelNativeHandle = GlbResources & {
  readonly shapes: readonly PicovoxelShapeSnapshot[];
  /** JSON-normalized module export, resolved against delivered components when topology is requested. */
  readonly mechanism?: unknown;
  /** Reader warnings retained for exports whose runtime result omits create-phase issues. */
  readonly mechanismIssues?: readonly KernelIssue[];
};

type PicovoxelGltfOptions = GeometryOutputTransformOptions & {
  includeTopology?: boolean;
  onMechanismIssues?: (issues: KernelIssue[]) => void;
};

const sourceToGltf = [1, 0, 0, 0, 0, 0, -1, 0, 0, 1, 0, 0, 0, 0, 0, 1] as const;

/**
 * Area-weighted smooth vertex normals on the source (Z-up) vertices.
 *
 * The arithmetic is fixed so every engine writes the same bytes (DP18): the cross product, Float32
 * accumulation in triangle order, and normalization by `Math.sqrt` of the Float64 sum of squares.
 * IEEE 754 rounds `sqrt` correctly, whereas ECMAScript leaves `Math.hypot` implementation-approximated.
 *
 * @param vertices - Welded vertex positions.
 * @param triangles - Triangle indices, already range-checked.
 * @returns One unit normal per vertex (zero for an isolated vertex).
 */
const computeVertexNormals = (
  vertices: Float32Array<ArrayBuffer>,
  triangles: Uint32Array<ArrayBuffer>,
): Float32Array<ArrayBuffer> => {
  const normals = new Float32Array(vertices.length);
  for (let offset = 0; offset < triangles.length; offset += 3) {
    const a = triangles[offset]! * 3;
    const b = triangles[offset + 1]! * 3;
    const c = triangles[offset + 2]! * 3;
    const abX = vertices[b]! - vertices[a]!;
    const abY = vertices[b + 1]! - vertices[a + 1]!;
    const abZ = vertices[b + 2]! - vertices[a + 2]!;
    const acX = vertices[c]! - vertices[a]!;
    const acY = vertices[c + 1]! - vertices[a + 1]!;
    const acZ = vertices[c + 2]! - vertices[a + 2]!;
    const normalX = abY * acZ - abZ * acY;
    const normalY = abZ * acX - abX * acZ;
    const normalZ = abX * acY - abY * acX;
    normals[a]! += normalX;
    normals[a + 1]! += normalY;
    normals[a + 2]! += normalZ;
    normals[b]! += normalX;
    normals[b + 1]! += normalY;
    normals[b + 2]! += normalZ;
    normals[c]! += normalX;
    normals[c + 1]! += normalY;
    normals[c + 2]! += normalZ;
  }
  for (let offset = 0; offset < normals.length; offset += 3) {
    const x = normals[offset]!;
    const y = normals[offset + 1]!;
    const z = normals[offset + 2]!;
    // oxlint-disable-next-line unicorn/prefer-modern-math-apis -- DP18: Math.hypot is implementation-approximated, Math.sqrt is correctly rounded.
    const length = Math.sqrt(x * x + y * y + z * z);
    if (length > 0) {
      normals[offset]! /= length;
      normals[offset + 1]! /= length;
      normals[offset + 2]! /= length;
    }
  }
  return normals;
};

/**
 * Drop the triangles whose area is exactly zero (D36).
 *
 * PicoVoxel's exact lane stays byte-identical to C# PicoGK, whose mesher emits a zero-area pair
 * wherever it places two vertices at one position; the Tau snapshot removes them instead. The test
 * is the cross product {@link computeVertexNormals} accumulates, in the same arithmetic, so a dropped
 * triangle contributed exactly nothing to any normal and zero to area and volume; a repeated index
 * always yields a zero cross product. Survivors keep their order and their bytes.
 *
 * @param vertices - Welded vertex positions.
 * @param triangles - Triangle indices, already range-checked.
 * @returns `triangles` itself when nothing is dropped, otherwise the surviving triangles.
 * @public
 */
export const dropZeroAreaTriangles = (
  vertices: Float32Array<ArrayBuffer>,
  triangles: Uint32Array<ArrayBuffer>,
): Uint32Array<ArrayBuffer> => {
  const kept = new Uint32Array(triangles.length);
  let length = 0;
  for (let offset = 0; offset < triangles.length; offset += 3) {
    const a = triangles[offset]! * 3;
    const b = triangles[offset + 1]! * 3;
    const c = triangles[offset + 2]! * 3;
    const abX = vertices[b]! - vertices[a]!;
    const abY = vertices[b + 1]! - vertices[a + 1]!;
    const abZ = vertices[b + 2]! - vertices[a + 2]!;
    const acX = vertices[c]! - vertices[a]!;
    const acY = vertices[c + 1]! - vertices[a + 1]!;
    const acZ = vertices[c + 2]! - vertices[a + 2]!;
    if (abY * acZ - abZ * acY !== 0 || abZ * acX - abX * acZ !== 0 || abX * acY - abY * acX !== 0) {
      kept[length++] = triangles[offset]!;
      kept[length++] = triangles[offset + 1]!;
      kept[length++] = triangles[offset + 2]!;
    }
  }
  return length === triangles.length ? triangles : kept.slice(0, length);
};

/**
 * One indexed triangle node per shape. Voxel meshes carry no B-rep edges, so no LINES primitive is
 * written; the kernel still claims `includeEdges` natively so the string-keyed fallback detector
 * never runs over a voxel mesh.
 *
 * @param shape - A durable shape snapshot.
 * @param options - Output coordinate system and length unit.
 * @returns The GLB node.
 */
const buildNode = (shape: PicovoxelShapeSnapshot, options: GeometryOutputTransformOptions): GlbNode => {
  const normals = computeVertexNormals(shape.vertices, shape.triangles);
  const mapped =
    shape.material &&
    (Boolean(shape.material.extensions?.KHR_materials_anisotropy) || hasMaterialTexture(shape.material))
      ? projectSurfaceCoordinates({ positions: shape.vertices, indices: shape.triangles, normals })
      : undefined;
  const tangents = mapped?.tangents;
  if (tangents && options.coordinateSystem !== 'z-up') {
    for (let index = 0; index < tangents.length; index += 4) {
      const y = tangents[index + 1]!;
      tangents[index + 1] = tangents[index + 2]!;
      tangents[index + 2] = -y;
    }
  }
  let { material } = shape;
  const volume = material?.extensions?.KHR_materials_volume;
  if (material && volume && options.unit?.length === 'millimeter') {
    material = {
      ...material,
      extensions: {
        ...material.extensions,
        // eslint-disable-next-line @typescript-eslint/naming-convention -- Standard glTF extension key.
        KHR_materials_volume: {
          ...volume,
          ...(volume.thicknessFactor === undefined ? {} : { thicknessFactor: volume.thicknessFactor * 1000 }),
          ...(volume.attenuationDistance === undefined
            ? {}
            : { attenuationDistance: volume.attenuationDistance * 1000 }),
        },
      },
    };
  }
  return {
    name: shape.name,
    primitives: [
      {
        mode: triangleMode,
        positions: transformVectorArrayChecked({
          vectors: mapped?.positions ?? shape.vertices,
          kind: 'position',
          options,
          invalidMessage: `PicoVoxel ${shape.name} contains a non-finite vertex.`,
        }),
        normals: transformNormalArray(mapped?.normals ?? normals, options),
        // The writer copies from this view into the GLB, so no copy is made here.
        indices: mapped?.indices ?? shape.triangles,
        ...(mapped ? { texCoords: [mapped.texCoords], tangents } : {}),
        material: material ?? {
          // Double-sided, like jscad and replicad (D30 check): the section view rejects a cap whose cut
          // leaves unresolved edges (one-voxel lattice walls are non-manifold), and hides caps while a
          // drag recomputes them. Back faces then shade the cut instead of leaving a see-through hole.
          // Back-face culling would pay off only at >=5M triangles, which needs a real-GPU benchmark first.
          doubleSided: true,
          pbrMetallicRoughness: {
            baseColorFactor: [...cadMaterialDefaults.baseColorFactor],
            metallicFactor: cadMaterialDefaults.metalnessFactor,
            roughnessFactor: cadMaterialDefaults.roughnessFactor,
          },
        },
      },
    ],
  };
};

const buildScene = (handle: PicovoxelNativeHandle, options: PicovoxelGltfOptions): GlbInput => {
  const usedIds = new Map<string, number>();
  const componentIds = handle.shapes.map((shape, index) =>
    uniqueComponentId(formatNamedComponentId(shape.name, index) ?? formatComponentId(index), usedIds),
  );
  const nodes = handle.shapes.map((shape, index) => ({
    ...buildNode(shape, options),
    extras: { tauComponentId: componentIds[index]! },
  }));
  const scene: GlbInput = {
    nodes,
    ...(handle.images ? { images: handle.images } : {}),
    ...(handle.textures ? { textures: handle.textures } : {}),
    ...(handle.samplers ? { samplers: handle.samplers } : {}),
  };
  if (!options.includeTopology) {
    return scene;
  }
  const components: TauCadTopologyPayload['components'] = handle.shapes.map(({ name }, nodeIndex) => ({
    id: componentIds[nodeIndex]!,
    name,
    kind: 'mesh',
    selector: formatPrimitiveSelector(nodeIndex, 'surface'),
    nodeIndex,
    meshIndex: nodeIndex,
    primitiveIndices: [0],
    primitiveRefs: [{ nodeIndex, meshIndex: nodeIndex, primitiveIndex: 0 }],
    capabilities: {
      hasPreciseTopology: false,
      exports: [{ fidelity: 'mesh', formats: ['glb', 'gltf', 'stl'], available: true }],
    },
  }));
  let mechanism: TauCadTopologyPayload['mechanism'];
  if (handle.mechanism !== undefined) {
    const ids = new Map<string, string>();
    const duplicates = new Set<string>();
    for (const [index, shape] of handle.shapes.entries()) {
      if (shape.authoredName !== undefined) {
        if (ids.has(shape.authoredName)) {
          duplicates.add(shape.authoredName);
        }
        ids.set(shape.authoredName, componentIds[index]!);
      }
    }
    // An ambiguous name has no binding, just like an absent name. Unreferenced duplicates stay valid.
    for (const name of duplicates) {
      ids.delete(name);
    }
    const resolved = resolveMechanismComponents({ source: handle.mechanism, componentIds: Object.fromEntries(ids) });
    const outcome =
      resolved.status === 'resolved'
        ? transformMechanism({
            mechanism: resolved.mechanism,
            units: {
              length: options.unit?.length === 'millimeter' ? 'mm' : 'm',
              angle: resolved.mechanism.units.angle,
            },
            ...(options.coordinateSystem === 'z-up' ? {} : { matrix: sourceToGltf }),
          })
        : resolved;
    if (outcome.status === 'invalid') {
      options.onMechanismIssues?.(
        outcome.issues.map((issue) => {
          const duplicate = [...duplicates].find((name) => issue.message === `No returned shape is named "${name}".`);
          return toMechanismKernelIssue({
            issue:
              duplicate === undefined
                ? issue
                : {
                    ...issue,
                    message: `More than one returned shape is named "${duplicate}".`,
                    recovery: 'Give each referenced part a distinct authored name.',
                  },
            kernelId: 'picovoxel',
          });
        }),
      );
    } else {
      mechanism = outcome.mechanism;
    }
  }
  if (handle.shapes.length === 0) {
    return scene;
  }
  const payload: TauCadTopologyPayload = { schemaVersion: 1, components, ...(mechanism ? { mechanism } : {}) };
  return {
    ...scene,
    extensionsUsed: [tauCadTopologyExtension],
    extraBufferViews: [{ key: 'topology', data: new TextEncoder().encode(JSON.stringify(payload)) }],
    extensions: (bufferViews) => ({
      [tauCadTopologyExtension]: {
        schemaVersion: 1,
        encoding: 'application/json',
        topologyBufferView: bufferViews['topology']!,
      },
    }),
  };
};

/**
 * Convert durable PicoVoxel mesh snapshots to canonical Tau GLB bytes.
 *
 * The mesh stays indexed end to end; `EXT_mesh_manifold` stays off.
 *
 * @param handle - Structured-cloneable PicoVoxel mesh snapshots.
 * @param options - Output coordinate system and length unit.
 * @returns Binary glTF bytes; an empty handle yields the canonical empty scene.
 * @public
 */
export const picovoxelToGlb = (
  handle: PicovoxelNativeHandle,
  options: PicovoxelGltfOptions = {},
): Uint8Array<ArrayBuffer> => writeGlb(buildScene(handle, options));

/**
 * Write one self-contained glTF JSON scene with embedded geometry and image bytes.
 * @internal
 * @param handle - Durable shapes and shared material resources.
 * @param options - Output coordinate system and length unit.
 * @returns UTF-8 glTF JSON bytes.
 */
export const picovoxelToGltf = (
  handle: PicovoxelNativeHandle,
  options: PicovoxelGltfOptions = {},
): Uint8Array<ArrayBuffer> => writeGltfJson(buildScene(handle, options));
