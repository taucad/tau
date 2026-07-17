import { cadEdgeOverlayMaterialDefaults, cadMaterialDefaults, tauCadTopologyExtension } from '@taucad/types/constants';
import { normalizeColor } from '#kernels/replicad/utils/normalize-color.js';
import { transformNormalArray, transformVertexArray } from '#framework/common.js';
import type { GeometryOutputTransformOptions } from '#framework/common.js';
import type { GeometryReplicad } from '#kernels/replicad/replicad.types.js';
import type { RuntimeLogger } from '#types/runtime-kernel.types.js';
import { srgbHexToLinearTuple } from '#utils/color-space.js';
import {
  formatComponentId,
  formatNamedComponentId,
  formatNodeSelector,
  formatPrimitiveSelector,
} from '#utils/geometry-names.js';
import { writeGlb, writeGltfJson } from '#utils/glb-writer.js';
import type { GlbInput, GlbNode, GlbPrimitive } from '#utils/glb-writer.js';
import { resolveShapeName, uniqueShapeName } from '#utils/shape-names.js';
import type { JSONObject } from '@taucad/types';

const khrMaterialsUnlitExtension = 'KHR_materials_unlit';

type ReplicadTopologyComponent = {
  id: string;
  name: string;
  kind: 'part';
  selector: string;
  nodeIndex: number;
  faceGroups: GeometryReplicad['faces']['faceGroups'];
  edgeGroups: GeometryReplicad['edges']['edgeGroups'];
  capabilities: {
    exports: Array<{ fidelity: 'mesh' | 'brep'; formats: string[]; available: boolean }>;
    hasPreciseTopology: boolean;
  };
};

type ReplicadNodeBuildResult = {
  node: GlbNode;
  component: Omit<ReplicadTopologyComponent, 'nodeIndex'>;
};

type ReplicadGltfOptions = GeometryOutputTransformOptions & {
  geometries: GeometryReplicad[];
  format?: 'glb' | 'gltf';
  includeTauTopology?: boolean;
  logger?: RuntimeLogger;
};

type BuildNodeFromReplicadGeometryOptions = {
  geometry: GeometryReplicad;
  nodeIndex: number;
  usedNames: Map<string, number>;
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
  const componentId = formatNamedComponentId(nodeName, nodeIndex) ?? formatComponentId(nodeIndex);
  const selector = formatNodeSelector(nodeIndex);

  if (faces.vertices.length > 0 && faces.triangles.length > 0) {
    const positions = transformVertexArray(faces.vertices, transformOptions);
    const normals = transformNormalArray(faces.normals, transformOptions);
    const indices = new Uint32Array(faces.triangles);

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

    primitives.push({
      mode: 4,
      positions,
      normals,
      indices,
      ...(includeTauTopology
        ? {
            extras: {
              tauComponentId: componentId,
              tauComponentKind: 'body',
              tauComponentSelector: formatPrimitiveSelector(nodeIndex, 'surface'),
              faceGroups: geometry.faces.faceGroups,
            },
          }
        : {}),
      material: {
        baseColorFactor: baseColor,
        metallicFactor: geometry.metalness ?? cadMaterialDefaults.metalnessFactor,
        roughnessFactor: geometry.roughness ?? cadMaterialDefaults.roughnessFactor,
        doubleSided: true,
        alphaMode: baseColor[3] < 1 ? 'BLEND' : 'OPAQUE',
      },
    });
  }

  if (edges.lines.length > 0) {
    const linePositions = transformVertexArray(edges.lines, transformOptions);
    const lineIndices = new Uint32Array(linePositions.length / 3);
    for (let index = 0; index < lineIndices.length; index++) {
      lineIndices[index] = index;
    }

    primitives.push({
      mode: 1,
      positions: linePositions,
      indices: lineIndices,
      ...(includeTauTopology
        ? {
            extras: {
              tauComponentId: componentId,
              tauComponentKind: 'line',
              tauComponentSelector: formatPrimitiveSelector(nodeIndex, 'edges'),
              edgeGroups: geometry.edges.edgeGroups,
            },
          }
        : {}),
      material: {
        ...cadEdgeOverlayMaterialDefaults,
        baseColorFactor: [...cadEdgeOverlayMaterialDefaults.baseColorFactor],
        extensions: {
          [khrMaterialsUnlitExtension]: {},
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
      faceGroups: geometry.faces.faceGroups,
      edgeGroups: geometry.edges.edgeGroups,
      capabilities: {
        exports: [
          { fidelity: 'mesh', formats: ['glb', 'stl'], available: true },
          { fidelity: 'brep', formats: ['step', 'stp', 'iges', 'igs', 'brep', 'dxf'], available: true },
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

  for (const geometry of geometries) {
    const result = buildNodeFromReplicadGeometry({
      geometry,
      nodeIndex: nodes.length,
      usedNames,
      transformOptions,
      includeTauTopology,
    });
    if (result) {
      const nodeIndex = nodes.length;
      nodes.push(result.node);
      if (includeTauTopology) {
        topologyComponents.push({ ...result.component, nodeIndex });
      }
    }
  }

  const topologyPayload = {
    schemaVersion: 1,
    components: topologyComponents,
  };
  const topologyData = new TextEncoder().encode(JSON.stringify(topologyPayload));
  const hasLinePrimitives = nodes.some((node) => node.primitives.some((primitive) => primitive.mode === 1));
  const extensionsUsed = [
    ...(topologyComponents.length > 0 ? [tauCadTopologyExtension] : []),
    ...(hasLinePrimitives ? [khrMaterialsUnlitExtension] : []),
  ];
  const input: GlbInput = {
    nodes,
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
