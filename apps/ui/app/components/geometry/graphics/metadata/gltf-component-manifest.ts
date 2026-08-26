import { tauCadTopologyExtension } from '@taucad/types/constants';
import type {
  GeometryComponentAppearance,
  GeometryComponentBounds,
  GeometryComponentCapabilities,
  GeometryComponentKind,
  GeometryComponentManifest,
  GeometryComponentNode,
  GeometryComponentPrimitiveRef,
  JSONObject,
} from '@taucad/types';

type JsonObject = JSONObject;

type GltfAccessor = {
  bufferView?: number;
  byteOffset?: number;
  componentType: number;
  count: number;
  type: string;
  min?: number[];
  max?: number[];
};

type GltfBufferView = {
  byteOffset?: number;
  byteLength: number;
  byteStride?: number;
};

type GltfPrimitive = {
  attributes?: Record<string, number>;
  indices?: number;
  material?: number;
  extras?: JsonObject;
};

type GltfMesh = {
  primitives?: GltfPrimitive[];
  name?: string;
};

type GltfNode = {
  mesh?: number;
  name?: string;
  children?: number[];
  extras?: JsonObject;
};

type GltfJson = {
  nodes?: GltfNode[];
  meshes?: GltfMesh[];
  accessors?: GltfAccessor[];
  bufferViews?: GltfBufferView[];
  materials?: GltfMaterial[];
  extensions?: Record<string, JsonObject>;
};

type GltfMaterial = {
  name?: string;
  pbrMetallicRoughness?: {
    baseColorFactor?: number[];
  };
};

type TopologyComponent = {
  id?: string;
  name?: string;
  kind?: GeometryComponentKind;
  selector?: string;
  nodeIndex?: number;
  meshIndex?: number;
  parentId?: string;
  childIds?: string[];
  primitiveIndices?: number[];
  primitiveRefs?: GeometryComponentPrimitiveRef[];
  sourceRefs?: JsonObject;
  capabilities?: {
    hasPreciseTopology?: boolean;
    exports?: Array<{ fidelity: 'mesh' | 'brep'; formats: string[]; available: boolean; reason?: string }>;
  };
};

type ParsedGltf = {
  json: GltfJson;
  bin: Uint8Array<ArrayBuffer>;
};

const rootId = 'root';
const defaultMeshFormats = ['glb', 'stl'];
const defaultBrepFormats = ['step', 'stp', 'iges', 'igs', 'brep', 'dxf'];

function alignTo4(value: number): number {
  const remainder = value % 4;
  return remainder === 0 ? value : value + (4 - remainder);
}

function parseGltfBytes(content: Uint8Array<ArrayBuffer>): ParsedGltf {
  const firstNonWhitespace = content.find((byte) => byte > 0x20);
  if (firstNonWhitespace === 0x7b) {
    return {
      json: JSON.parse(new TextDecoder().decode(content)) as GltfJson,
      bin: new Uint8Array(),
    };
  }

  const view = new DataView(content.buffer, content.byteOffset, content.byteLength);
  const magic = view.getUint32(0, true);
  if (magic !== 0x46_54_6c_67) {
    throw new Error('Expected GLB magic bytes when building component manifest.');
  }

  const jsonChunkLength = view.getUint32(12, true);
  const jsonStart = 20;
  const jsonEnd = jsonStart + jsonChunkLength;
  const binHeaderStart = jsonStart + alignTo4(jsonChunkLength);
  const binChunkLength = binHeaderStart + 4 < content.byteLength ? view.getUint32(binHeaderStart, true) : 0;
  const binStart = binHeaderStart + 8;

  return {
    json: JSON.parse(new TextDecoder().decode(content.slice(jsonStart, jsonEnd)).trim()) as GltfJson,
    bin: binChunkLength > 0 ? content.slice(binStart, binStart + binChunkLength) : new Uint8Array(),
  };
}

function createFallbackComponentId(nodeIndex: number): string {
  return `component:node-${nodeIndex}`;
}

function dedupeComponentId(baseId: string, usedIds: Map<string, number>): string {
  const occurrence = usedIds.get(baseId) ?? 0;
  usedIds.set(baseId, occurrence + 1);
  if (occurrence === 0) {
    return baseId;
  }
  return `${baseId}#${occurrence + 1}`;
}

function createCapabilities(hasPreciseTopology: boolean): GeometryComponentCapabilities {
  return {
    canHide: true,
    canIsolate: true,
    canFocus: true,
    canAdjustOpacity: true,
    hasDrawings: false,
    hasPreciseTopology,
    exports: [
      { fidelity: 'mesh', formats: defaultMeshFormats, available: true },
      {
        fidelity: 'brep',
        formats: defaultBrepFormats,
        available: hasPreciseTopology,
        ...(hasPreciseTopology ? {} : { reason: 'Precise topology is not available for this component.' }),
      },
    ],
  };
}

function readTopologyComponents(json: GltfJson, bin: Uint8Array<ArrayBuffer>): TopologyComponent[] {
  const extension = json.extensions?.[tauCadTopologyExtension];
  if (!extension) {
    return [];
  }

  if (Array.isArray(extension['components'])) {
    return extension['components'] as TopologyComponent[];
  }

  const { topologyBufferView } = extension;
  if (typeof topologyBufferView !== 'number') {
    return [];
  }

  const bufferView = json.bufferViews?.[topologyBufferView];
  if (!bufferView) {
    return [];
  }

  const start = bufferView.byteOffset ?? 0;
  const payloadBytes = bin.slice(start, start + bufferView.byteLength);
  const payload = JSON.parse(new TextDecoder().decode(payloadBytes)) as { components?: TopologyComponent[] };
  return payload.components ?? [];
}

function combineBounds(bounds: GeometryComponentBounds[]): GeometryComponentBounds | undefined {
  if (bounds.length === 0) {
    return undefined;
  }

  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const bound of bounds) {
    for (let axis = 0; axis < 3; axis++) {
      min[axis] = Math.min(min[axis]!, bound.min[axis]!);
      max[axis] = Math.max(max[axis]!, bound.max[axis]!);
    }
  }

  const center: [number, number, number] = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
  const radius = Math.hypot(max[0] - center[0], max[1] - center[1], max[2] - center[2]);
  return { min, max, center, radius };
}

function getAccessorBounds(json: GltfJson, accessorIndex: number | undefined): GeometryComponentBounds | undefined {
  if (accessorIndex === undefined) {
    return undefined;
  }

  const accessor = json.accessors?.[accessorIndex];
  if (!accessor?.min || !accessor.max || accessor.min.length < 3 || accessor.max.length < 3) {
    return undefined;
  }

  const min: [number, number, number] = [accessor.min[0]!, accessor.min[1]!, accessor.min[2]!];
  const max: [number, number, number] = [accessor.max[0]!, accessor.max[1]!, accessor.max[2]!];
  const center: [number, number, number] = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
  const radius = Math.hypot(max[0] - center[0], max[1] - center[1], max[2] - center[2]);
  return { min, max, center, radius };
}

function getNodeBounds(json: GltfJson, node: GltfNode): GeometryComponentBounds | undefined {
  const mesh = node.mesh === undefined ? undefined : json.meshes?.[node.mesh];
  const primitiveBounds =
    mesh?.primitives
      ?.map((primitive) => getAccessorBounds(json, primitive.attributes?.['POSITION']))
      .filter((bound): bound is GeometryComponentBounds => bound !== undefined) ?? [];
  return combineBounds(primitiveBounds);
}

function getPrimitiveBounds(
  json: GltfJson,
  meshIndex: number | undefined,
  primitiveIndex: number | undefined,
): GeometryComponentBounds | undefined {
  if (meshIndex === undefined || primitiveIndex === undefined) {
    return undefined;
  }

  const primitive = json.meshes?.[meshIndex]?.primitives?.[primitiveIndex];
  return getAccessorBounds(json, primitive?.attributes?.['POSITION']);
}

function clampUnit(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function linearChannelToSrgbByte(channel: number): number {
  const clamped = clampUnit(channel);
  const srgb = clamped <= 0.003_130_8 ? clamped * 12.92 : 1.055 * clamped ** (1 / 2.4) - 0.055;
  return Math.round(clampUnit(srgb) * 255);
}

function byteToHex(value: number): string {
  return value.toString(16).padStart(2, '0');
}

function formatAlpha(value: number): string {
  return Number(clampUnit(value).toFixed(3)).toString();
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function baseColorFactorToCssColor(baseColorFactor: readonly number[] | undefined): string | undefined {
  const color = baseColorFactor ?? [1, 1, 1, 1];
  const red = color[0];
  const green = color[1];
  const blue = color[2];
  const alpha = color[3] ?? 1;
  if (!isFiniteNumber(red) || !isFiniteNumber(green) || !isFiniteNumber(blue) || !isFiniteNumber(alpha)) {
    return undefined;
  }

  const srgbRed = linearChannelToSrgbByte(red);
  const srgbGreen = linearChannelToSrgbByte(green);
  const srgbBlue = linearChannelToSrgbByte(blue);
  if (alpha < 1) {
    return `rgba(${srgbRed}, ${srgbGreen}, ${srgbBlue}, ${formatAlpha(alpha)})`;
  }

  return `#${byteToHex(srgbRed)}${byteToHex(srgbGreen)}${byteToHex(srgbBlue)}`;
}

function getComponentAppearance(
  json: GltfJson,
  materialIndices: readonly number[],
): GeometryComponentAppearance | undefined {
  const colors: string[] = [];
  const materialNames: string[] = [];

  for (const materialIndex of materialIndices) {
    const material = json.materials?.[materialIndex];
    if (!material) {
      continue;
    }

    const color = baseColorFactorToCssColor(material.pbrMetallicRoughness?.baseColorFactor);
    if (color && !colors.includes(color)) {
      colors.push(color);
    }
    if (material.name && !materialNames.includes(material.name)) {
      materialNames.push(material.name);
    }
  }

  if (colors.length === 0 && materialNames.length === 0) {
    return undefined;
  }

  return {
    ...(colors[0] ? { color: colors[0] } : {}),
    ...(colors.length > 0 ? { colors } : {}),
    ...(materialNames.length > 0 ? { materialNames } : {}),
  };
}

function toGeometryKind(value: unknown): GeometryComponentKind {
  const kind = typeof value === 'string' ? value : 'part';
  const known = new Set<GeometryComponentKind>([
    'model',
    'assembly',
    'part',
    'body',
    'face',
    'edge',
    'vertex',
    'mesh',
    'line',
    'material',
    'unknown',
  ]);
  return known.has(kind as GeometryComponentKind) ? (kind as GeometryComponentKind) : 'part';
}

type TopologyVisitInput = {
  id: string;
  depth: number;
  parentId: string;
  parentPath: readonly string[];
};

function getTopologyPrimitiveReferences(json: GltfJson, component: TopologyComponent): GeometryComponentPrimitiveRef[] {
  if (Array.isArray(component.primitiveRefs)) {
    return component.primitiveRefs.filter(
      (reference) =>
        Number.isInteger(reference.nodeIndex) &&
        Number.isInteger(reference.meshIndex) &&
        Number.isInteger(reference.primitiveIndex),
    );
  }

  if (typeof component.nodeIndex !== 'number') {
    return [];
  }

  const meshIndex =
    typeof component.meshIndex === 'number' ? component.meshIndex : json.nodes?.[component.nodeIndex]?.mesh;
  if (typeof meshIndex !== 'number') {
    return [];
  }

  const primitiveIndices =
    component.primitiveIndices ??
    json.meshes?.[meshIndex]?.primitives?.map((_, primitiveIndex) => primitiveIndex) ??
    [];
  return primitiveIndices
    .filter((primitiveIndex): primitiveIndex is number => Number.isInteger(primitiveIndex))
    .map((primitiveIndex) => ({
      nodeIndex: component.nodeIndex!,
      meshIndex,
      primitiveIndex,
    }));
}

function getPrimitiveReferencesMaterialIndices(
  json: GltfJson,
  primitiveReferences: readonly GeometryComponentPrimitiveRef[],
): number[] {
  return [
    ...new Set(
      primitiveReferences
        .map((reference) => json.meshes?.[reference.meshIndex]?.primitives?.[reference.primitiveIndex]?.material)
        .filter((materialIndex): materialIndex is number => typeof materialIndex === 'number'),
    ),
  ];
}

function getPrimitiveReferencesBounds(
  json: GltfJson,
  primitiveReferences: readonly GeometryComponentPrimitiveRef[],
): GeometryComponentBounds | undefined {
  return combineBounds(
    primitiveReferences
      .map((reference) => getPrimitiveBounds(json, reference.meshIndex, reference.primitiveIndex))
      .filter((bound): bound is GeometryComponentBounds => bound !== undefined),
  );
}

function createTopologyComponentManifest(
  json: GltfJson,
  topologyComponents: readonly TopologyComponent[],
  options: { sourceFile?: string; geometryHash?: string },
): GeometryComponentManifest | undefined {
  const candidates = topologyComponents.filter((component) => typeof component.id === 'string');
  if (candidates.length === 0) {
    return undefined;
  }

  const componentById = new Map(candidates.map((component) => [component.id!, component]));
  const childIdsByParent = new Map<string, string[]>();
  const topLevelIds: string[] = [];
  for (const component of candidates) {
    const id = component.id!;
    const parentId =
      typeof component.parentId === 'string' && componentById.has(component.parentId) ? component.parentId : rootId;
    const children = childIdsByParent.get(parentId) ?? [];
    children.push(id);
    childIdsByParent.set(parentId, children);
    if (parentId === rootId) {
      topLevelIds.push(id);
    }
  }

  const nodesById: Record<string, GeometryComponentNode> = {};
  const nodeOrder: string[] = [rootId];
  let hasPreciseTopology = false;

  const visit = ({ id, depth, parentId, parentPath }: TopologyVisitInput): void => {
    const component = componentById.get(id);
    if (!component || nodesById[id]) {
      return;
    }

    const primitiveReferences = getTopologyPrimitiveReferences(json, component);
    const materialIndices = getPrimitiveReferencesMaterialIndices(json, primitiveReferences);
    const providedChildIds = Array.isArray(component.childIds)
      ? component.childIds.filter((childId) => componentById.has(childId))
      : [];
    const derivedChildIds = childIdsByParent.get(id) ?? [];
    const childIds = [...new Set([...providedChildIds, ...derivedChildIds])];
    const componentHasPreciseTopology = component.capabilities?.hasPreciseTopology ?? true;
    hasPreciseTopology ||= componentHasPreciseTopology;
    const capabilities = component.capabilities
      ? { ...createCapabilities(componentHasPreciseTopology), ...component.capabilities }
      : createCapabilities(componentHasPreciseTopology);
    const name = component.name ?? component.id!.replace(/^component:/, '');
    const selector = component.selector ?? component.id!;
    const kind = component.kind ?? 'unknown';
    const path = [...parentPath, name];

    nodeOrder.push(id);
    nodesById[id] = {
      id,
      name,
      kind,
      selector,
      parentId,
      childIds,
      depth,
      path,
      meshNodeIndices: [...new Set(primitiveReferences.map((reference) => reference.nodeIndex))],
      primitiveIndices: primitiveReferences.map((reference) => reference.primitiveIndex),
      primitiveRefs: primitiveReferences,
      materialIndices,
      appearance: getComponentAppearance(json, materialIndices),
      bounds: getPrimitiveReferencesBounds(json, primitiveReferences),
      capabilities,
      reference:
        options.sourceFile === undefined
          ? undefined
          : {
              scheme: 'tau-cad',
              filePath: options.sourceFile,
              componentId: id,
              selector,
              geometryHash: options.geometryHash,
              label: name,
              kind,
            },
      extras: component.sourceRefs,
    };

    for (const childId of childIds) {
      visit({ id: childId, depth: depth + 1, parentId: id, parentPath: path });
    }
  };

  const orderedTopLevelIds = [
    ...new Set([
      ...topLevelIds,
      ...candidates
        .filter((component) => typeof component.parentId !== 'string' || !componentById.has(component.parentId))
        .map((component) => component.id!),
    ]),
  ];
  for (const id of orderedTopLevelIds) {
    visit({ id, depth: 1, parentId: rootId, parentPath: ['Model'] });
  }

  const rootCapabilities = createCapabilities(hasPreciseTopology);
  nodesById[rootId] = createRootNode(
    orderedTopLevelIds.filter((id) => nodesById[id]),
    rootCapabilities,
  );

  return {
    schemaVersion: 1,
    sourceFile: options.sourceFile,
    geometryHash: options.geometryHash,
    rootId,
    nodeOrder,
    nodesById,
    capabilities: rootCapabilities,
    extensionUsed: tauCadTopologyExtension,
  };
}

function createRootNode(childIds: string[], capabilities: GeometryComponentCapabilities): GeometryComponentNode {
  return {
    id: rootId,
    name: 'Model',
    kind: 'model',
    selector: 'root',
    childIds,
    depth: 0,
    path: ['Model'],
    meshNodeIndices: [],
    primitiveIndices: [],
    materialIndices: [],
    capabilities,
  };
}

export function buildGltfComponentManifest(
  content: Uint8Array<ArrayBuffer>,
  options: { sourceFile?: string; geometryHash?: string } = {},
): GeometryComponentManifest {
  const { json, bin } = parseGltfBytes(content);
  const topologyComponents = readTopologyComponents(json, bin);
  const topologyManifest = createTopologyComponentManifest(json, topologyComponents, options);
  if (topologyManifest) {
    return topologyManifest;
  }

  const topologyByNodeIndex = new Map<number, TopologyComponent>();
  for (const component of topologyComponents) {
    if (typeof component.nodeIndex === 'number') {
      topologyByNodeIndex.set(component.nodeIndex, component);
    }
  }

  const nodesById: Record<string, GeometryComponentNode> = {};
  const nodeOrder: string[] = [rootId];
  const childIds: string[] = [];
  const usedIds = new Map<string, number>([[rootId, 1]]);
  let hasPreciseTopology = false;

  for (const [nodeIndex, gltfNode] of (json.nodes ?? []).entries()) {
    if (gltfNode.mesh === undefined && !topologyByNodeIndex.has(nodeIndex)) {
      continue;
    }

    const topology = topologyByNodeIndex.get(nodeIndex);
    const mesh = gltfNode.mesh === undefined ? undefined : json.meshes?.[gltfNode.mesh];
    const primitiveIndices = mesh?.primitives?.map((_, primitiveIndex) => primitiveIndex) ?? [];
    const materialIndices = [
      ...new Set(
        mesh?.primitives
          ?.map((primitive) => primitive.material)
          .filter((materialIndex): materialIndex is number => typeof materialIndex === 'number') ?? [],
      ),
    ];
    const name = topology?.name ?? gltfNode.name ?? mesh?.name ?? `Component ${nodeIndex + 1}`;
    const kind = topology?.kind ?? toGeometryKind(gltfNode.extras?.['tauComponentKind']);
    const selector =
      topology?.selector ??
      (typeof gltfNode.extras?.['tauComponentSelector'] === 'string'
        ? gltfNode.extras['tauComponentSelector']
        : `node/${nodeIndex}`);
    const annotatedId =
      topology?.id ??
      (typeof gltfNode.extras?.['tauComponentId'] === 'string' ? gltfNode.extras['tauComponentId'] : undefined);
    const baseId = annotatedId ?? createFallbackComponentId(nodeIndex);
    const id = dedupeComponentId(baseId, usedIds);
    const componentHasPreciseTopology = topology?.capabilities?.hasPreciseTopology ?? Boolean(topology);
    hasPreciseTopology = hasPreciseTopology || componentHasPreciseTopology;
    const capabilities = topology?.capabilities
      ? { ...createCapabilities(componentHasPreciseTopology), ...topology.capabilities }
      : createCapabilities(componentHasPreciseTopology);

    childIds.push(id);
    nodeOrder.push(id);
    nodesById[id] = {
      id,
      name,
      kind,
      selector,
      parentId: rootId,
      childIds: [],
      depth: 1,
      path: ['Model', name],
      meshNodeIndices: [nodeIndex],
      primitiveIndices,
      primitiveRefs: primitiveIndices.map((primitiveIndex) => ({
        nodeIndex,
        meshIndex: gltfNode.mesh!,
        primitiveIndex,
      })),
      materialIndices,
      appearance: getComponentAppearance(json, materialIndices),
      bounds: getNodeBounds(json, gltfNode),
      capabilities,
      reference:
        options.sourceFile === undefined
          ? undefined
          : {
              scheme: 'tau-cad',
              filePath: options.sourceFile,
              componentId: id,
              selector,
              geometryHash: options.geometryHash,
              label: name,
              kind,
            },
      extras: gltfNode.extras,
    };
  }

  const rootCapabilities = createCapabilities(hasPreciseTopology);
  nodesById[rootId] = createRootNode(childIds, rootCapabilities);

  return {
    schemaVersion: 1,
    sourceFile: options.sourceFile,
    geometryHash: options.geometryHash,
    rootId,
    nodeOrder,
    nodesById,
    capabilities: rootCapabilities,
    extensionUsed: json.extensions?.[tauCadTopologyExtension] ? tauCadTopologyExtension : undefined,
  };
}
