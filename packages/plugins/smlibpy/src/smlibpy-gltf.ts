/**
 * The SMLibPy mesh bundle as glTF: one node per shape with a face-grouped surface and an edge overlay, PBR materials,
 * the model's textures and the `TAU_cad_topology` payload with its mechanism. It follows the SMLib WASM converter so
 * both SMLib kernels describe the same model with the same glTF.
 */
import { Primitive } from '@gltf-transform/core';
import { KHRMaterialsUnlit } from '@gltf-transform/extensions';
import {
  compactTriangleIndices,
  formatComponentId,
  formatNamedComponentId,
  formatNodeSelector,
  formatPrimitiveSelector,
  resolveShapeName,
  srgbHexToLinearTuple,
  toMechanismKernelIssue,
  transformNormalArray,
  transformVertexArray,
  uniqueComponentId,
  uniqueShapeName,
  writeGlb,
  writeGltfJson,
} from '@taucad/geometry-core';
import type {
  GeometryOutputTransformOptions,
  GlbInput,
  GlbMaterial,
  GlbNode,
  GlbPrimitive,
  GlbResources,
  TauCadTopologyComponent,
  TauCadTopologyPayload,
} from '@taucad/geometry-core';
import { resolveMechanismComponents, transformMechanism } from '@taucad/kinematics';
import type { Mechanism, TransformMechanismInput } from '@taucad/kinematics';
import { cadEdgeOverlayMaterialDefaults, cadMaterialDefaults, tauCadTopologyExtension } from '@taucad/runtime/types';
import type { JSONObject, KernelIssue } from '@taucad/runtime/types';

import type { SmlibpyGeometry } from '#smlibpy-bundle.js';
import { projectSurfaceCoordinates } from '#surface-coordinates.js';

type SmlibpyTopologyComponent = TauCadTopologyComponent & {
  kind: 'part';
  nodeIndex: number;
  faceGroups: SmlibpyGeometry['faces']['faceGroups'];
  edgeGroups: SmlibpyGeometry['edges']['edgeGroups'];
};

/** What {@link convertSmlibpyGeometriesToGltf} writes and in which frame. */
export type SmlibpyGltfOptions = GeometryOutputTransformOptions &
  GlbResources & {
    geometries: SmlibpyGeometry[];
    format?: 'glb' | 'gltf';
    includeTauTopology?: boolean;
    /** Whether the B-rep edge overlay is drawn; the topology keeps its edge groups either way. */
    includeEdges?: boolean;
    /** The entry module's `mechanism` value, written to the topology payload in the output frame. */
    mechanism?: unknown;
    /** Receives mechanism diagnostics; the geometry is then written without a mechanism. */
    onMechanismIssues?: (issues: KernelIssue[]) => void;
  };

// The frame change `transformVertexArray` applies, (x, y, z) → (x, z, −y), as a column-major matrix.
const zUpToYup: NonNullable<TransformMechanismInput['matrix']> = [1, 0, 0, 0, 0, 0, -1, 0, 0, 1, 0, 0, 0, 0, 0, 1];

const needsSurfaceCoordinates = (material: GlbMaterial | undefined): boolean =>
  material !== undefined &&
  (material.extensions?.KHR_materials_anisotropy !== undefined || JSON.stringify(material).includes('Texture'));

type MechanismConversion = Readonly<{
  value: unknown;
  componentIds: ReadonlyMap<string, string>;
  transformOptions: GeometryOutputTransformOptions;
  onIssues: ((issues: KernelIssue[]) => void) | undefined;
}>;

const convertMechanism = ({
  value,
  componentIds,
  transformOptions,
  onIssues,
}: MechanismConversion): Mechanism | undefined => {
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
    onIssues?.(outcome.issues.map((issue) => toMechanismKernelIssue({ issue, kernelId: 'smlibpy' })));
    return undefined;
  }
  return outcome.mechanism;
};

const scaleVolume = (material: GlbMaterial, transformOptions: GeometryOutputTransformOptions): GlbMaterial => {
  const volume = material.extensions?.KHR_materials_volume;
  if (volume === undefined || transformOptions.unit?.length !== 'millimeter') {
    return material;
  }
  return {
    ...material,
    extensions: {
      ...material.extensions,
      // eslint-disable-next-line @typescript-eslint/naming-convention -- Standard glTF extension key.
      KHR_materials_volume: {
        ...volume,
        ...(volume.thicknessFactor === undefined ? {} : { thicknessFactor: volume.thicknessFactor * 1000 }),
        ...(volume.attenuationDistance === undefined ? {} : { attenuationDistance: volume.attenuationDistance * 1000 }),
      },
    },
  };
};

const legacyMaterial = (geometry: SmlibpyGeometry): GlbMaterial => {
  const [red, green, blue, alpha] = cadMaterialDefaults.baseColorFactor;
  const baseColor: [number, number, number, number] =
    geometry.color === undefined
      ? [red, green, blue, geometry.opacity ?? alpha]
      : srgbHexToLinearTuple(geometry.color, geometry.opacity ?? 1);
  const roughness = geometry.roughness ?? cadMaterialDefaults.roughnessFactor;
  return {
    doubleSided: true,
    pbrMetallicRoughness: {
      baseColorFactor: baseColor,
      metallicFactor: geometry.metalness ?? cadMaterialDefaults.metalnessFactor,
      ...(roughness === 1 ? {} : { roughnessFactor: roughness }),
    },
    ...(baseColor[3] < 1 ? { alphaMode: 'BLEND' } : {}),
  };
};

const edgeMaterial: GlbMaterial = {
  doubleSided: cadEdgeOverlayMaterialDefaults.doubleSided,
  pbrMetallicRoughness: {
    baseColorFactor: [...cadEdgeOverlayMaterialDefaults.baseColorFactor],
    metallicFactor: cadEdgeOverlayMaterialDefaults.metallicFactor,
  },
  extensions: { [KHRMaterialsUnlit.EXTENSION_NAME]: {} },
};

type NodeRequest = {
  geometry: SmlibpyGeometry;
  nodeIndex: number;
  usedNames: Map<string, number>;
  usedIds: Map<string, number>;
  transformOptions: GeometryOutputTransformOptions;
  includeTauTopology: boolean;
  includeEdges: boolean;
};

const surfacePrimitive = (
  geometry: SmlibpyGeometry,
  { nodeIndex, transformOptions, includeTauTopology }: NodeRequest,
  componentId: string,
): { primitive?: GlbPrimitive; faceGroups: SmlibpyGeometry['faces']['faceGroups'] } => {
  let { vertices, normals, triangles } = geometry.faces;
  let texCoords: Float32Array | undefined;
  let tangents: Float32Array | undefined;
  if (triangles.length > 0 && needsSurfaceCoordinates(geometry.material)) {
    const projected = projectSurfaceCoordinates({ positions: vertices, normals, indices: triangles });
    vertices = Float32Array.from(projected.positions);
    normals = Float32Array.from(projected.normals);
    triangles = Uint32Array.from(projected.indices);
    texCoords = Float32Array.from(projected.texCoords);
    tangents = Float32Array.from(projected.tangents);
    if (transformOptions.coordinateSystem !== 'z-up') {
      for (let index = 0; index < tangents.length; index += 4) {
        const y = tangents[index + 1]!;
        tangents[index + 1] = tangents[index + 2]!;
        tangents[index + 2] = -y;
      }
    }
  }
  if (vertices.length === 0 || triangles.length === 0) {
    return { faceGroups: [] };
  }
  const compacted = compactTriangleIndices({
    positions: vertices,
    indices: triangles,
    groups: geometry.faces.faceGroups,
  });
  if (compacted.indices.length === 0) {
    return { faceGroups: compacted.groups };
  }
  return {
    faceGroups: compacted.groups,
    primitive: {
      mode: Primitive.Mode['TRIANGLES']!,
      positions: transformVertexArray(vertices, transformOptions),
      normals: transformNormalArray(normals, transformOptions),
      indices: compacted.indices,
      ...(texCoords ? { texCoords: [texCoords] } : {}),
      ...(tangents ? { tangents } : {}),
      ...(includeTauTopology
        ? {
            extras: {
              tauComponentId: componentId,
              tauComponentKind: 'body',
              tauComponentSelector: formatPrimitiveSelector(nodeIndex, 'surface'),
              faceGroups: compacted.groups,
              tauFaceGroupUnit: 'indices-v1',
            },
          }
        : {}),
      material:
        geometry.material === undefined ? legacyMaterial(geometry) : scaleVolume(geometry.material, transformOptions),
    },
  };
};

const buildNode = (
  request: NodeRequest,
): { node: GlbNode; component: Omit<SmlibpyTopologyComponent, 'nodeIndex'> } | undefined => {
  const { geometry, nodeIndex, usedNames, usedIds, transformOptions, includeTauTopology, includeEdges } = request;
  const nodeName = uniqueShapeName(
    resolveShapeName({ index: nodeIndex, name: geometry.name, source: 'generated' }),
    usedNames,
  );
  const componentId = uniqueComponentId(
    formatNamedComponentId(nodeName, nodeIndex) ?? formatComponentId(nodeIndex),
    usedIds,
  );
  const selector = formatNodeSelector(nodeIndex);
  const surface = surfacePrimitive(geometry, request, componentId);
  const primitives: GlbPrimitive[] = surface.primitive ? [surface.primitive] : [];
  // Topology keeps the edge groups without the overlay, so a selection still names B-rep edges.
  const { edgeGroups } = geometry.edges;
  if (includeEdges && geometry.edges.lines.length > 0) {
    primitives.push({
      // A de-indexed segment soup: glTF draws arrays when `indices` is absent.
      mode: Primitive.Mode['LINES']!,
      positions: transformVertexArray(geometry.edges.lines, transformOptions),
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
      material: edgeMaterial,
    });
  }
  if (primitives.length === 0) {
    return undefined;
  }
  return {
    node: {
      name: nodeName,
      ...(includeTauTopology
        ? { extras: { tauComponentId: componentId, tauComponentKind: 'part', tauComponentSelector: selector } }
        : {}),
      primitives,
    },
    component: {
      id: componentId,
      name: nodeName,
      kind: 'part',
      selector,
      faceGroups: surface.faceGroups,
      edgeGroups,
      sourceRefs: { kernelId: 'smlibpy', faceGroupUnit: 'indices-v1', edgeGroupUnit: 'xyz-scalars-v1' },
      capabilities: {
        exports: [
          { fidelity: 'mesh', formats: ['glb', 'gltf', 'stl'], available: true },
          { fidelity: 'brep', formats: ['step'], available: true },
        ],
        hasPreciseTopology: true,
      },
    },
  };
};

/**
 * Convert SMLibPy shapes to glTF, Y-up metres unless the options ask for another frame or unit.
 *
 * @param options - The shapes, resources, mechanism and output frame.
 * @returns The GLB bytes, or the embedded glTF JSON bytes when `format` is `gltf`.
 */
export const convertSmlibpyGeometriesToGltf = (options: SmlibpyGltfOptions): Uint8Array<ArrayBuffer> => {
  const {
    geometries,
    format = 'glb',
    includeTauTopology = true,
    includeEdges = true,
    coordinateSystem = 'y-up',
    unit = { length: 'meter' },
  } = options;
  const transformOptions: GeometryOutputTransformOptions = { coordinateSystem, unit };
  const nodes: GlbNode[] = [];
  const components: SmlibpyTopologyComponent[] = [];
  const usedNames = new Map<string, number>();
  const usedIds = new Map<string, number>();
  const componentIds = new Map<string, string>();
  for (const geometry of geometries) {
    const nodeIndex = nodes.length;
    const result = buildNode({
      geometry,
      nodeIndex,
      usedNames,
      usedIds,
      transformOptions,
      includeTauTopology,
      includeEdges,
    });
    if (result) {
      nodes.push(result.node);
      components.push({ ...result.component, nodeIndex });
      componentIds.set(result.component.name, result.component.id);
    }
  }
  const writeTopology = includeTauTopology && components.length > 0;
  const mechanism =
    writeTopology && options.mechanism !== undefined
      ? convertMechanism({
          value: options.mechanism,
          componentIds,
          transformOptions,
          onIssues: options.onMechanismIssues,
        })
      : undefined;
  const payload: TauCadTopologyPayload = { schemaVersion: 1, components, ...(mechanism ? { mechanism } : {}) };
  const hasLines = nodes.some((node) =>
    node.primitives.some((primitive) => primitive.mode === Primitive.Mode['LINES']),
  );
  const extensionsUsed = [
    ...(writeTopology ? [tauCadTopologyExtension] : []),
    ...(hasLines ? [KHRMaterialsUnlit.EXTENSION_NAME] : []),
  ];
  const input: GlbInput = {
    nodes,
    images: options.images,
    textures: options.textures,
    samplers: options.samplers,
    ...(extensionsUsed.length > 0 ? { extensionsUsed } : {}),
    ...(writeTopology
      ? {
          extraBufferViews: [{ key: 'topology', data: new TextEncoder().encode(JSON.stringify(payload)) }],
          extensions: (bufferViews): Record<string, JSONObject> => ({
            [tauCadTopologyExtension]: {
              schemaVersion: 1,
              encoding: 'application/json',
              topologyBufferView: bufferViews['topology']!,
            },
          }),
        }
      : {}),
  };
  return format === 'gltf' ? writeGltfJson(input) : writeGlb(input);
};
