import { Primitive } from '@gltf-transform/core';
import { KHRMaterialsUnlit } from '@gltf-transform/extensions';
import { cadEdgeOverlayMaterialDefaults, cadMaterialDefaults, tauCadTopologyExtension } from '@taucad/runtime/types';
import {
  compactTriangleIndices,
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
import type { Issue, Mechanism, TransformMechanismInput } from '@taucad/kinematics';
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

type ReplicadGltfOptions = GeometryOutputTransformOptions &
  GlbResources & {
    geometries: GeometryReplicad[];
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
 * Report a mechanism problem as a kernel warning; `details.mechanism` carries the kinematics issue.
 *
 * @internal
 * @param issue - Kinematics-style issue with a JSON pointer into the authored mechanism.
 * @returns The kernel issue the editor and the Kinematics pane read.
 */
export const toMechanismKernelIssue = (issue: Issue): KernelIssue => ({
  code: issue.code.startsWith('UNKNOWN_') ? 'INVALID_REFERENCE' : 'INVALID_ANNOTATION',
  severity: 'warning',
  type: 'kernel',
  message: `Mechanism${issue.path && ` ${issue.path}`}: ${issue.message} ${issue.recovery}`,
  details: { producer: { kernelId: 'replicad' }, mechanism: issue },
});

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
    onIssues?.(outcome.issues.map((issue) => toMechanismKernelIssue(issue)));
    return undefined;
  }
  return outcome.mechanism;
}

type BuildNodeFromReplicadGeometryOptions = {
  geometry: GeometryReplicad;
  nodeIndex: number;
  usedNames: Map<string, number>;
  usedIds: Map<string, number>;
  transformOptions: GeometryOutputTransformOptions;
  includeTauTopology: boolean;
};

/**
 * Build a GlbNode from a single replicad geometry (surface + optional edge lines).
 *
 * @param options - Geometry and conversion options for one output node.
 * @returns The GlbNode, or undefined if the geometry has no renderable data.
 */
function buildNodeFromReplicadGeometry({
  geometry,
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
  const faceOccurrences = faces.faceGroups.map((group, faceId) => ({ ...group, faceId }));
  const compactedFaces =
    faces.vertices.length > 0 && faces.triangles.length > 0
      ? compactTriangleIndices({
          positions: faces.vertices,
          indices: faces.triangles,
          groups: faceOccurrences,
        })
      : undefined;
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
            },
          }
        : {}),
      material: material ?? {
        doubleSided: true,
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
    const result = buildNodeFromReplicadGeometry({
      geometry,
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

  const output = format === 'gltf' ? writeGltfJson(input) : writeGlb(input);

  logger?.debug(
    `convertReplicadGeometriesToGltf: format=${format} nodeCount=${nodes.length} byteLength=${output.byteLength}`,
  );

  return output;
}
