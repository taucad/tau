import { Primitive } from '@gltf-transform/core';
import { KHRMaterialsUnlit } from '@gltf-transform/extensions';
import { cadEdgeOverlayMaterialDefaults, cadMaterialDefaults, tauCadTopologyExtension } from '@taucad/runtime/types';
import { checkAbort } from '@taucad/runtime/kernel';
import {
  compactTriangleIndices,
  isClosedTriangleMesh,
  transformNormalArray,
  transformVertexArray,
  srgbHexToLinearTuple,
  writeGlb,
  writeGltfJson,
  resolveShapeName,
  uniqueShapeName,
  formatComponentId,
  formatNamedComponentId,
  formatNodeSelector,
  formatPrimitiveSelector,
  uniqueComponentId,
  toMechanismKernelIssue,
} from '@taucad/geometry-core';
import type {
  GeometryOutputTransformOptions,
  GlbInput,
  GlbResources,
  GlbMaterial,
  GlbNode,
  GlbPrimitive,
  TauCadTopologyComponent,
  TauCadTopologyPayload,
} from '@taucad/geometry-core';
import { resolveMechanismComponents, transformMechanism } from '@taucad/kinematics';
import type { Mechanism, TransformMechanismInput } from '@taucad/kinematics';
import { normalizeColor } from '#utils/normalize-color.js';

import type { GeometryReplicad } from '#replicad.types.js';
import type { RuntimeLogger } from '@taucad/runtime/kernel';

import type { JSONObject, KernelIssue } from '@taucad/runtime/types';

type ReplicadTopologyComponent = TauCadTopologyComponent & {
  kind: 'part';
  nodeIndex: number;
  faceGroups: GeometryReplicad['faces']['faceGroups'];
  edgeGroups: GeometryReplicad['edges']['edgeGroups'];
};

type ReplicadNodeBuildResult = {
  node: GlbNode;
  component: Omit<ReplicadTopologyComponent, 'nodeIndex'>;
};

type CompactedFaces = ReturnType<typeof compactFaces>;

/** What packing one mesh derives from it alone: its compacted triangles and, per output frame, whether it is closed. */
type ReplicadMeshPackFacts = {
  readonly compacted: CompactedFaces;
  readonly closed: Map<string, boolean>;
};

/**
 * Pack facts kept per mesh across packs (catalogue N6), keyed by the mesh's `faces` object. The mesh memo owns one, so
 * a fact lives exactly as long as the kept mesh it was derived from; a mesh that is not kept is never looked up again.
 * The facts are pure functions of the mesh's arrays, which nothing writes to, so a kept fact packs the same bytes.
 * @internal
 */
export type ReplicadPackFacts = WeakMap<GeometryReplicad['faces'], ReplicadMeshPackFacts>;

/**
 * Creates an empty pack-fact store.
 * @returns The store.
 * @internal
 */
export const createReplicadPackFacts = (): ReplicadPackFacts => new WeakMap();

type ReplicadGltfOptions = GeometryOutputTransformOptions &
  GlbResources & {
    geometries: GeometryReplicad[];
    /** Kept pack facts (compute reuse on); without them every mesh is compacted and tested for closedness. */
    packFacts?: ReplicadPackFacts;
    format?: 'glb' | 'gltf';
    includeTauTopology?: boolean;
    logger?: RuntimeLogger;
    /** The entry module's `mechanism` export value, written to the topology payload in the output frame. */
    mechanism?: unknown;
    /** Receives mechanism diagnostics; the geometry is then written without a mechanism. */
    onMechanismIssues?: (issues: KernelIssue[]) => void;
  };

type ConvertMechanismOptions = {
  value: unknown;
  componentIds: ReadonlyMap<string, string>;
  transformOptions: GeometryOutputTransformOptions;
  onIssues: ((issues: KernelIssue[]) => void) | undefined;
};

// ponytail: the frame change `createVertexTransform` applies to every vertex, (x, y, z) → (x, z, −y) from
// Z-up to Y-up, as the column-major matrix `transformMechanism` takes; z-up output keeps the source frame.
const zUpToYup: NonNullable<TransformMechanismInput['matrix']> = [1, 0, 0, 0, 0, 0, -1, 0, 0, 1, 0, 0, 0, 0, 0, 1];

/**
 * Resolve the author's mechanism source against the component ids this glTF assigns, and express
 * it in the same frame and length unit as the vertices.
 *
 * @param options - Authored value, shape name to component id map, and the vertex transform.
 * @returns The wire mechanism, or undefined after reporting its issues.
 */
function convertMechanism({
  value,
  componentIds,
  transformOptions,
  onIssues,
}: ConvertMechanismOptions): Mechanism | undefined {
  const resolved = resolveMechanismComponents({ source: value, componentIds: Object.fromEntries(componentIds) });
  const outcome =
    resolved.status === 'resolved'
      ? transformMechanism({
          mechanism: resolved.mechanism,
          units: {
            length: transformOptions.unit?.length === 'millimeter' ? 'mm' : 'm',
            angle: resolved.mechanism.units.angle,
          },
          ...(transformOptions.coordinateSystem === 'z-up' ? {} : { matrix: zUpToYup }),
        })
      : resolved;
  if (outcome.status === 'invalid') {
    onIssues?.(outcome.issues.map((issue) => toMechanismKernelIssue({ issue, kernelId: 'replicad' })));
    return undefined;
  }
  return outcome.mechanism;
}

/**
 * The mesh's triangles without degenerate or repeated ones, with its face groups numbered by index. The packer's ids
 * replace the kernel's, so the result depends on the mesh alone.
 * @param faces - The mesh.
 * @returns The compacted triangles and groups, or undefined for an empty mesh.
 */
function compactFaces(faces: GeometryReplicad['faces']) {
  if (faces.vertices.length === 0 || faces.triangles.length === 0) {
    return undefined;
  }
  return compactTriangleIndices({
    positions: faces.vertices,
    indices: faces.triangles,
    groups: faces.faceGroups.map((group, faceId) => ({ ...group, faceId })),
  });
}

/**
 * The pack facts of a mesh, kept ones when the store has them.
 * @param faces - The mesh.
 * @param packFacts - The kept facts, if any.
 * @returns The mesh's facts.
 */
function factsOf(faces: GeometryReplicad['faces'], packFacts: ReplicadPackFacts | undefined): ReplicadMeshPackFacts {
  const kept = packFacts?.get(faces);
  if (kept) {
    return kept;
  }
  const facts = { compacted: compactFaces(faces), closed: new Map<string, boolean>() };
  packFacts?.set(faces, facts);
  return facts;
}

type BuildNodeFromReplicadGeometryOptions = {
  geometry: GeometryReplicad;
  packFacts: ReplicadPackFacts | undefined;
  nodeIndex: number;
  usedNames: Map<string, number>;
  usedIds: Map<string, number>;
  transformOptions: GeometryOutputTransformOptions;
  includeTauTopology: boolean;
};

/**
 * Whether a mesh is closed in the output frame, kept per frame: the weld compares output positions, which the frame
 * decides.
 * @param input - The mesh's pack facts, the output frame, and the mesh's positions in it and compacted triangles.
 * @param input.facts - The mesh's pack facts.
 * @param input.transformOptions - The output frame.
 * @param input.positions - The mesh's positions in that frame.
 * @param input.indices - The mesh's compacted triangles.
 * @returns Whether the mesh is a closed, outward-oriented surface.
 */
function isClosedIn({
  facts,
  transformOptions,
  positions,
  indices,
}: {
  facts: ReplicadMeshPackFacts;
  transformOptions: GeometryOutputTransformOptions;
  positions: Float32Array;
  indices: Uint32Array;
}): boolean {
  const frame = `${transformOptions.coordinateSystem ?? ''}|${transformOptions.unit?.length ?? ''}`;
  let closed = facts.closed.get(frame);
  if (closed === undefined) {
    closed = isClosedTriangleMesh([{ positions, indices }]);
    facts.closed.set(frame, closed);
  }
  return closed;
}

/**
 * Build a GlbNode from a single replicad geometry (surface + optional edge lines).
 *
 * @param options - Geometry and conversion options for one output node.
 * @returns The GlbNode, or undefined if the geometry has no renderable data.
 */
function buildNodeFromReplicadGeometry({
  geometry,
  packFacts,
  nodeIndex,
  usedNames,
  usedIds,
  transformOptions,
  includeTauTopology,
}: BuildNodeFromReplicadGeometryOptions): ReplicadNodeBuildResult | undefined {
  const primitives: GlbPrimitive[] = [];
  const { faces, edges } = geometry;
  if ((faces.vertices.length === 0 || faces.triangles.length === 0) && edges.lines.length === 0) {
    return undefined;
  }

  const resolvedName = resolveShapeName({ index: nodeIndex, name: geometry.name, source: 'generated' });
  const nodeName = uniqueShapeName(resolvedName, usedNames);
  const componentId = uniqueComponentId(
    formatNamedComponentId(nodeName, nodeIndex) ?? formatComponentId(nodeIndex),
    usedIds,
  );
  const selector = formatNodeSelector(nodeIndex);
  const facts = factsOf(faces, packFacts);
  const compactedFaces = facts.compacted;
  const faceGroups = compactedFaces?.groups ?? [];
  const edgeGroups = edges.edgeGroups.map((group, edgeId) => ({ ...group, edgeId }));

  if (compactedFaces && compactedFaces.indices.length > 0) {
    const positions = transformVertexArray(faces.vertices, transformOptions);
    const normals = transformNormalArray(faces.normals, transformOptions);
    const tangents = faces.tangents ? Float32Array.from(faces.tangents) : undefined;
    if (tangents && transformOptions.coordinateSystem !== 'z-up') {
      for (let index = 0; index < tangents.length; index += 4) {
        const y = tangents[index + 1]!;
        tangents[index + 1] = tangents[index + 2]!;
        tangents[index + 2] = -y;
      }
    }
    const { indices } = compactedFaces;

    let baseColor: [number, number, number, number] = [
      cadMaterialDefaults.baseColorFactor[0],
      cadMaterialDefaults.baseColorFactor[1],
      cadMaterialDefaults.baseColorFactor[2],
      cadMaterialDefaults.baseColorFactor[3],
    ];
    if (geometry.color) {
      try {
        const normalizedColor = normalizeColor(geometry.color);
        const alpha = geometry.opacity ?? normalizedColor.alpha;
        baseColor = srgbHexToLinearTuple(normalizedColor.color, alpha);
      } catch (error) {
        console.warn('Failed to parse color:', geometry.color, error);
        throw new Error('Failed to parse color', { cause: error });
      }
    }

    let material: GlbMaterial | undefined = geometry.material;
    const volume = material?.extensions?.KHR_materials_volume;
    if (material && volume && transformOptions.unit?.length === 'millimeter') {
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

    primitives.push({
      mode: Primitive.Mode['TRIANGLES']!,
      positions,
      normals,
      indices,
      ...(faces.texCoords ? { texCoords: [new Float32Array(faces.texCoords)] } : {}),
      ...(tangents ? { tangents } : {}),
      ...(includeTauTopology
        ? {
            extras: {
              tauComponentId: componentId,
              tauComponentKind: 'body',
              tauComponentSelector: formatPrimitiveSelector(nodeIndex, 'surface'),
              faceGroups,
              tauFaceGroupUnit: 'indices-v1',
            },
          }
        : {}),
      material: material ?? {
        // A closed solid draws one side: no back face of it shows from outside (see isClosedTriangleMesh).
        doubleSided: baseColor[3] < 1 || !isClosedIn({ facts, transformOptions, positions, indices }),
        pbrMetallicRoughness: {
          baseColorFactor: baseColor,
          metallicFactor: geometry.metalness ?? cadMaterialDefaults.metalnessFactor,
          ...((geometry.roughness ?? cadMaterialDefaults.roughnessFactor) === 1
            ? {}
            : { roughnessFactor: geometry.roughness ?? cadMaterialDefaults.roughnessFactor }),
        },
        ...(baseColor[3] < 1 ? { alphaMode: 'BLEND' } : {}),
      },
    });
  }

  if (edges.lines.length > 0) {
    const linePositions = transformVertexArray(edges.lines, transformOptions);

    primitives.push({
      /* No index buffer: the edge overlay is already a de-indexed segment soup, and glTF draws
       * arrays when `indices` is absent. */
      mode: Primitive.Mode['LINES']!,
      positions: linePositions,
      ...(includeTauTopology
        ? {
            extras: {
              tauComponentId: componentId,
              tauComponentKind: 'line',
              tauComponentSelector: formatPrimitiveSelector(nodeIndex, 'edges'),
              edgeGroups,
              tauEdgeGroupUnit: 'xyz-scalars-v1',
            },
          }
        : {}),
      material: {
        doubleSided: cadEdgeOverlayMaterialDefaults.doubleSided,
        pbrMetallicRoughness: {
          baseColorFactor: [...cadEdgeOverlayMaterialDefaults.baseColorFactor],
          metallicFactor: cadEdgeOverlayMaterialDefaults.metallicFactor,
        },
        extensions: {
          [KHRMaterialsUnlit.EXTENSION_NAME]: {},
        },
      },
    });
  }

  if (primitives.length === 0) {
    return undefined;
  }

  return {
    node: {
      name: nodeName,
      ...(includeTauTopology
        ? {
            extras: {
              tauComponentId: componentId,
              tauComponentKind: 'part',
              tauComponentSelector: selector,
            },
          }
        : {}),
      primitives,
    },
    component: {
      id: componentId,
      name: nodeName,
      kind: 'part',
      selector,
      faceGroups,
      edgeGroups,
      sourceRefs: { kernelId: 'replicad', faceGroupUnit: 'indices-v1', edgeGroupUnit: 'xyz-scalars-v1' },
      capabilities: {
        exports: [
          { fidelity: 'mesh', formats: ['glb', 'stl'], available: true },
          { fidelity: 'brep', formats: ['step', 'stp', 'brep', 'dxf'], available: true },
        ],
        hasPreciseTopology: true,
      },
    },
  };
}

/**
 * Convert replicad geometries to GLTF blob format.
 *
 * Always produces spec-compliant GLTF with:
 * - Y-up coordinate system (per glTF specification)
 * - Meter units (per glTF specification)
 *
 * This function preserves the original triangulation from replicad without re-triangulating,
 * resulting in better rendering quality and performance.
 *
 * When `logger` is supplied, emits a debug log with the produced GLB byte
 * length and node count.
 *
 * Packing makes no OpenCascade call, so the exception proxy never polls the abort word here. It polls before each
 * part and before writing: an edit that supersedes the render while it packs starts its build after one part
 * instead of after the whole GLB (P9c: 70 to 150 ms on planetary-gear-system). Outside an operation the poll does
 * nothing.
 *
 * @param options - Conversion inputs and output transform intent.
 * @returns GLTF blob
 */
export function convertReplicadGeometriesToGltf(options: ReplicadGltfOptions): Uint8Array<ArrayBuffer> {
  const {
    geometries,
    format = 'glb',
    logger,
    includeTauTopology = true,
    coordinateSystem = 'y-up',
    unit = { length: 'meter' },
  } = options;
  const transformOptions: GeometryOutputTransformOptions = { coordinateSystem, unit };
  const nodes: GlbNode[] = [];
  const topologyComponents: ReplicadTopologyComponent[] = [];
  const usedNames = new Map<string, number>();
  const usedIds = new Map<string, number>();
  const componentIds = new Map<string, string>();

  for (const geometry of geometries) {
    checkAbort();
    const result = buildNodeFromReplicadGeometry({
      geometry,
      packFacts: options.packFacts,
      nodeIndex: nodes.length,
      usedNames,
      usedIds,
      transformOptions,
      includeTauTopology,
    });
    if (result) {
      const nodeIndex = nodes.length;
      nodes.push(result.node);
      if (includeTauTopology) {
        topologyComponents.push({ ...result.component, nodeIndex });
        componentIds.set(result.component.name, result.component.id);
      }
    }
  }

  const mechanism =
    topologyComponents.length > 0 && options.mechanism !== undefined
      ? convertMechanism({
          value: options.mechanism,
          componentIds,
          transformOptions,
          onIssues: options.onMechanismIssues,
        })
      : undefined;
  const topologyPayload: TauCadTopologyPayload = {
    schemaVersion: 1,
    components: topologyComponents,
    ...(mechanism ? { mechanism } : {}),
  };
  const topologyData = new TextEncoder().encode(JSON.stringify(topologyPayload));
  const hasLinePrimitives = nodes.some((node) =>
    node.primitives.some((primitive) => primitive.mode === Primitive.Mode['LINES']),
  );
  const extensionsUsed = [
    ...(topologyComponents.length > 0 ? [tauCadTopologyExtension] : []),
    ...(hasLinePrimitives ? [KHRMaterialsUnlit.EXTENSION_NAME] : []),
  ];
  const input: GlbInput = {
    nodes,
    // The kernel's meshes have finite attributes by construction: the writer skips scanning them (catalogue N6).
    trustedGeometry: true,
    images: options.images,
    textures: options.textures,
    samplers: options.samplers,
    ...(extensionsUsed.length > 0 ? { extensionsUsed } : {}),
    ...(topologyComponents.length > 0
      ? {
          extraBufferViews: [{ key: 'topology', data: topologyData }],
          extensions: (bufferViews): Record<string, JSONObject> => {
            const topologyBufferView = bufferViews['topology'];
            if (topologyBufferView === undefined) {
              throw new Error('Missing topology buffer view for TAU_cad_topology extension.');
            }

            return {
              [tauCadTopologyExtension]: {
                schemaVersion: 1,
                encoding: 'application/json',
                topologyBufferView,
              },
            };
          },
        }
      : {}),
  };

  checkAbort();
  const output = format === 'gltf' ? writeGltfJson(input) : writeGlb(input);

  logger?.debug(
    `convertReplicadGeometriesToGltf: format=${format} nodeCount=${nodes.length} byteLength=${output.byteLength}`,
  );

  return output;
}
