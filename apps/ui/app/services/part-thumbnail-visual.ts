import { tauCadTopologyExtension } from '@taucad/types/constants';
import { canonicalJson } from '@taucad/utils/hash';
import { Matrix4, Quaternion, Vector3 } from 'three';
import { parseGltfBytes } from '#components/geometry/graphics/metadata/gltf-component-manifest.js';
import type { PartPrimitiveReference } from '#services/part-thumbnail.service.js';

type JsonRecord = Record<string, unknown>;
const object = (value: unknown): JsonRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as JsonRecord) : {};
const index = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
const digest = async (bytes: Uint8Array<ArrayBuffer>): Promise<string> => {
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return `sha256:${Array.from(hash, (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
};

/** Source preparation always uses the exact currently presented bytes. */
export const sourceGlbDigest = digest;

const knownVisualExtensions = new Set([
  'KHR_materials_anisotropy',
  'KHR_materials_clearcoat',
  'KHR_materials_dispersion',
  'KHR_materials_emissive_strength',
  'KHR_materials_ior',
  'KHR_materials_iridescence',
  'KHR_materials_sheen',
  'KHR_materials_specular',
  'KHR_materials_transmission',
  'KHR_materials_unlit',
  'KHR_materials_volume',
  'KHR_texture_transform',
]);

const maxDecodedPreviewGeometryBytes = 128 * 1024 * 1024;
const maxPreviewSceneOverheadBytes = 64 * 1024 * 1024;

/**
 * Nano retains decoded vectors per mesh primitive, not per node instance. Bound
 * their aggregate before a sparse accessor can expand into native/GPU memory.
 * Node/material figures are conservative admission estimates, not RSS claims.
 */
function admitPreviewGeometry(json: ReturnType<typeof parseGltfBytes>['json']): void {
  const root = json as unknown as JsonRecord;
  const accessors = Array.isArray(root['accessors']) ? (root['accessors'] as unknown[]) : [];
  const meshes = Array.isArray(root['meshes']) ? (root['meshes'] as unknown[]) : [];
  const nodes = Array.isArray(root['nodes']) ? (root['nodes'] as unknown[]) : [];
  const materials = Array.isArray(root['materials']) ? (root['materials'] as unknown[]) : [];
  let decodedBytes = 0;
  let primitiveCount = 0;
  const countOf = (accessorIndex: unknown): number => {
    const selected = index(accessorIndex);
    if (selected === undefined || selected >= accessors.length) {
      throw new RangeError('Part preview references an invalid geometry accessor.');
    }
    const count = index(object(accessors[selected])['count']);
    if (count === undefined) {
      throw new RangeError('Part preview accessor has an invalid count.');
    }
    return count;
  };
  const add = (count: number, stride: number): void => {
    decodedBytes += count * stride;
    if (!Number.isSafeInteger(decodedBytes) || decodedBytes > maxDecodedPreviewGeometryBytes) {
      throw new RangeError('Part preview decoded geometry exceeds 128 MiB.');
    }
  };
  for (const rawMesh of meshes) {
    const primitives = object(rawMesh)['primitives'];
    if (!Array.isArray(primitives)) {
      continue;
    }
    for (const rawPrimitive of primitives) {
      primitiveCount++;
      const primitive = object(rawPrimitive);
      const attributes = object(primitive['attributes']);
      const positions = countOf(attributes['POSITION']);
      add(positions, 12);
      if (attributes['NORMAL'] !== undefined) {
        add(countOf(attributes['NORMAL']), 12);
      }
      if (
        Object.keys(attributes).some(
          (name) => name === 'TANGENT' || name.startsWith('TEXCOORD_') || name.startsWith('COLOR_'),
        )
      ) {
        add(positions, 64);
      }
      const indexCount = primitive['indices'] === undefined ? positions : countOf(primitive['indices']);
      add(indexCount, 4);
      if (primitive['mode'] === 1) {
        // Nano also expands LINES to a separate 12-byte-per-index segment upload.
        add(indexCount, 12);
      }
    }
  }
  const sceneOverheadBytes = nodes.length * 512 + meshes.length * 512 + primitiveCount * 1024 + materials.length * 2048;
  if (!Number.isSafeInteger(sceneOverheadBytes) || sceneOverheadBytes > maxPreviewSceneOverheadBytes) {
    throw new RangeError('Part preview scene instances or materials exceed the 64 MiB admission estimate.');
  }
}

function nodeParents(nodes: readonly unknown[]): Map<number, number> | undefined {
  const parents = new Map<number, number>();
  for (const [parentIndex, raw] of nodes.entries()) {
    for (const child of Array.isArray(object(raw)['children']) ? (object(raw)['children'] as unknown[]) : []) {
      const childIndex = index(child);
      if (childIndex === undefined || childIndex >= nodes.length || parents.has(childIndex)) {
        return undefined;
      }
      parents.set(childIndex, parentIndex);
    }
  }
  return parents;
}

function commonNodeChain(
  nodes: readonly unknown[],
  parents: ReadonlyMap<number, number>,
  primitives: readonly PartPrimitiveReference[],
): number[] | undefined {
  if (primitives.length === 0) {
    return undefined;
  }
  const chain = (nodeIndex: number): number[] | undefined => {
    if (nodeIndex >= nodes.length) {
      return undefined;
    }
    const result: number[] = [];
    const seen = new Set<number>();
    let cursor: number | undefined = nodeIndex;
    while (cursor !== undefined) {
      if (seen.has(cursor)) {
        return undefined;
      }
      seen.add(cursor);
      result.unshift(cursor);
      cursor = parents.get(cursor);
    }
    return result;
  };
  const chains = primitives.map(({ nodeIndex }) => chain(nodeIndex));
  if (chains.some((value) => !value)) {
    return undefined;
  }
  return chains[0]!.filter((nodeIndex, depth) => chains.every((value) => value?.[depth] === nodeIndex));
}

function validVector(value: unknown, size: 3): value is [number, number, number];
function validVector(value: unknown, size: 4): value is [number, number, number, number];
function validVector(value: unknown, size: number): value is number[] {
  return (
    Array.isArray(value) &&
    value.length === size &&
    value.every((coordinate) => typeof coordinate === 'number' && Number.isFinite(coordinate))
  );
}

const isOccurrenceWrapper = (node: JsonRecord): boolean => {
  const id: unknown = object(node['extras'])['tauComponentId'];
  if (typeof id !== 'string' || !/^occ:(?:[0-9a-f]{2})+$/u.test(id)) {
    return false;
  }
  try {
    const hex = id.slice(4).match(/../gu)!;
    const decoded: unknown = JSON.parse(
      new TextDecoder().decode(Uint8Array.from(hex, (byte) => Number.parseInt(byte, 16))),
    );
    return Array.isArray(decoded) && decoded[0] === 'occurrence';
  } catch {
    return false;
  }
};

const isPureRigidPose = (node: JsonRecord): boolean => {
  const raw = node['matrix'];
  const matrix = new Matrix4();
  if (Array.isArray(raw)) {
    if (raw.length !== 16 || raw.some((value) => typeof value !== 'number' || !Number.isFinite(value))) {
      return false;
    }
    matrix.fromArray(raw as number[]);
  } else {
    const translation = node['translation'] ?? [0, 0, 0];
    const rotation = node['rotation'] ?? [0, 0, 0, 1];
    const scale = node['scale'] ?? [1, 1, 1];
    if (
      !validVector(translation, 3) ||
      !validVector(rotation, 4) ||
      !validVector(scale, 3) ||
      scale.some((coordinate) => coordinate !== 1)
    ) {
      return false;
    }
    matrix.compose(new Vector3(...translation), new Quaternion(...rotation), new Vector3(...scale));
  }
  const { elements } = matrix;
  if (
    Math.abs(elements[3]) > 1e-6 ||
    Math.abs(elements[7]) > 1e-6 ||
    Math.abs(elements[11]) > 1e-6 ||
    Math.abs(elements[15] - 1) > 1e-6
  ) {
    return false;
  }
  const x = new Vector3().setFromMatrixColumn(matrix, 0);
  const y = new Vector3().setFromMatrixColumn(matrix, 1);
  const z = new Vector3().setFromMatrixColumn(matrix, 2);
  return (
    [x, y, z].every((axis) => Math.abs(axis.length() - 1) < 1e-12) &&
    Math.abs(x.dot(y)) < 1e-6 &&
    Math.abs(y.dot(z)) < 1e-6 &&
    Math.abs(z.dot(x)) < 1e-6 &&
    x.clone().cross(y).dot(z) > 1 - 1e-6
  );
};

/** Canonical key for a proven rigid occurrence path. */
export async function canonicalPartPreview(
  content: Uint8Array<ArrayBuffer>,
  primitives: readonly PartPrimitiveReference[],
): Promise<Readonly<{ key: string }> | undefined> {
  const { previews } = await canonicalPartPreviews(content, [primitives]);
  return previews[0];
}

/** Prepare all visible keys with one GLB parse and parent walk. */
export async function canonicalPartPreviews(
  content: Uint8Array<ArrayBuffer>,
  parts: ReadonlyArray<readonly PartPrimitiveReference[]>,
): Promise<
  Readonly<{
    visualKey: string;
    previews: ReadonlyArray<Readonly<{ key: string }> | undefined>;
    /** Built only on a cache miss; keeps source BIN and intrinsic transforms. */
    renderContent?: () => Uint8Array<ArrayBuffer>;
  }>
> {
  let parsed: ReturnType<typeof parseGltfBytes>;
  try {
    parsed = parseGltfBytes(content);
  } catch {
    return { visualKey: await digest(content), previews: parts.map(() => undefined) };
  }
  admitPreviewGeometry(parsed.json);
  const nodes = parsed.json.nodes ?? [];
  const parents = nodeParents(nodes);
  let visualKey: string;
  try {
    visualKey = await digestParsedVisual(content, parsed);
  } catch {
    return { visualKey: await digest(content), previews: parts.map(() => undefined) };
  }
  if (!parents) {
    return { visualKey, previews: parts.map(() => undefined) };
  }
  const allRigidWrappers = nodes.flatMap((node, nodeIndex) =>
    isOccurrenceWrapper(object(node)) && isPureRigidPose(object(node)) ? [nodeIndex] : [],
  );
  const prepared = parts.map((primitives) => {
    const common = commonNodeChain(nodes, parents, primitives);
    if (!common?.length) {
      return undefined;
    }
    const wrappers = common.filter((nodeIndex) => isOccurrenceWrapper(object(nodes[nodeIndex])));
    if (wrappers.length === 0 || wrappers.some((nodeIndex) => !allRigidWrappers.includes(nodeIndex))) {
      return undefined;
    }
    return true;
  });
  if (prepared.every((eligible) => !eligible)) {
    return { visualKey, previews: prepared.map(() => undefined) };
  }
  let key: string;
  try {
    key = await digestParsedVisual(content, parsed, allRigidWrappers);
  } catch {
    return { visualKey, previews: parts.map(() => undefined) };
  }
  let normalized: Uint8Array<ArrayBuffer> | undefined;
  return {
    visualKey,
    previews: prepared.map((eligible) => (eligible ? { key } : undefined)),
    renderContent: () => {
      normalized ??= writeCanonicalGlb(content, parsed, allRigidWrappers);
      return normalized;
    },
  };
}

/** Change only admitted occurrence poses in the JSON chunk; retain BIN and all other chunks. */
function writeCanonicalGlb(
  source: Uint8Array<ArrayBuffer>,
  parsed: ReturnType<typeof parseGltfBytes>,
  wrapperIndices: readonly number[],
): Uint8Array<ArrayBuffer> {
  const view = new DataView(source.buffer, source.byteOffset, source.byteLength);
  if (source.byteLength < 20 || view.getUint32(0, true) !== 0x46_54_6c_67 || view.getUint32(4, true) !== 2) {
    throw new Error('Canonical part preview requires a GLB source.');
  }
  const sourceJsonLength = view.getUint32(12, true);
  if (20 + sourceJsonLength > source.byteLength) {
    throw new Error('Canonical part preview has an invalid JSON chunk.');
  }
  const omit = new Set(wrapperIndices);
  const nodes = (parsed.json.nodes ?? []).map((raw, nodeIndex) => {
    if (!omit.has(nodeIndex)) {
      return raw;
    }
    const node = { ...raw };
    delete node.matrix;
    delete node.translation;
    delete node.rotation;
    delete node.scale;
    return node;
  });
  const encoded = new TextEncoder().encode(JSON.stringify({ ...parsed.json, nodes }));
  const paddedLength = Math.ceil(encoded.byteLength / 4) * 4;
  const remainder = source.subarray(20 + sourceJsonLength);
  const output = new Uint8Array(20 + paddedLength + remainder.byteLength);
  output.set(source.subarray(0, 12));
  const header = new DataView(output.buffer);
  header.setUint32(8, output.byteLength, true);
  header.setUint32(12, paddedLength, true);
  header.setUint32(16, 0x4e_4f_53_4a, true);
  output.fill(0x20, 20, 20 + paddedLength);
  output.set(encoded, 20);
  output.set(remainder, 20 + paddedLength);
  return output;
}

/**
 * Conservative visual content key. The only ignored nonvisual payload is Tau
 * topology; unknown extensions retain the full artifact digest.
 */
export async function visualGlbDigest(content: Uint8Array<ArrayBuffer>): Promise<string> {
  let parsed: ReturnType<typeof parseGltfBytes>;
  try {
    parsed = parseGltfBytes(content);
  } catch {
    // A malformed presentation can still be keyed conservatively; export owns
    // the resulting render error and retains the previous good preview.
    return digest(content);
  }
  try {
    return await digestParsedVisual(content, parsed);
  } catch {
    return digest(content);
  }
}

async function digestParsedVisual(
  content: Uint8Array<ArrayBuffer>,
  parsed: ReturnType<typeof parseGltfBytes>,
  omitRigidNodeIndices: readonly number[] = [],
): Promise<string> {
  const { json, bin } = parsed;
  const root = json as unknown as JsonRecord;
  const rootExtensions = object(root['extensions']);
  if (!Object.hasOwn(rootExtensions, tauCadTopologyExtension)) {
    return digest(content);
  }
  const used = Array.isArray(root['extensionsUsed']) ? (root['extensionsUsed'] as unknown[]) : [];
  const required = Array.isArray(root['extensionsRequired']) ? (root['extensionsRequired'] as unknown[]) : [];
  // An unknown extension may carry display bytes outside core accessor/image views.
  if (
    [...used, ...required].some(
      (name) => name !== tauCadTopologyExtension && (typeof name !== 'string' || !knownVisualExtensions.has(name)),
    )
  ) {
    return digest(content);
  }
  const buffers = Array.isArray(root['buffers']) ? (root['buffers'] as unknown[]) : [];
  if (buffers.length > 1 || buffers.some((buffer) => object(buffer)['uri'] !== undefined)) {
    return digest(content);
  }
  const images = Array.isArray(root['images']) ? (root['images'] as unknown[]) : [];
  if (
    images.some((image) => {
      const { uri } = object(image);
      return typeof uri === 'string' && !uri.startsWith('data:');
    })
  ) {
    return digest(content);
  }
  const views = Array.isArray(root['bufferViews']) ? (root['bufferViews'] as unknown[]) : [];
  const referenced = new Set<number>();
  const add = (value: unknown): void => {
    const parsed = index(value);
    if (parsed !== undefined) {
      referenced.add(parsed);
    }
  };
  for (const raw of Array.isArray(root['accessors']) ? (root['accessors'] as unknown[]) : []) {
    const accessor = object(raw);
    add(accessor['bufferView']);
    const sparse = object(accessor['sparse']);
    add(object(sparse['indices'])['bufferView']);
    add(object(sparse['values'])['bufferView']);
  }
  for (const image of images) {
    add(object(image)['bufferView']);
  }
  const selected = [...referenced]
    .sort((left, right) => left - right)
    .map((viewIndex) => {
      const view = object(views[viewIndex]);
      const offset = index(view['byteOffset'] ?? 0);
      const length = index(view['byteLength']);
      if (offset === undefined || length === undefined || offset + length > bin.byteLength) {
        throw new Error('Visual GLB buffer view exceeds embedded data.');
      }
      return { index: viewIndex, descriptor: view, bytes: bin.subarray(offset, offset + length) };
    });
  const visualRoot: JsonRecord = { ...root };
  if (omitRigidNodeIndices.length > 0) {
    const omit = new Set(omitRigidNodeIndices);
    visualRoot['nodes'] = (Array.isArray(root['nodes']) ? (root['nodes'] as unknown[]) : []).map((raw, nodeIndex) => {
      if (!omit.has(nodeIndex)) {
        return raw;
      }
      const node = { ...object(raw) };
      delete node['matrix'];
      delete node['translation'];
      delete node['rotation'];
      delete node['scale'];
      return node;
    });
  }
  delete visualRoot['buffers'];
  delete visualRoot['bufferViews'];
  visualRoot['extensions'] = Object.fromEntries(
    Object.entries(rootExtensions).filter(([name]) => name !== tauCadTopologyExtension),
  );
  visualRoot['extensionsUsed'] = used.filter((name) => name !== tauCadTopologyExtension);
  visualRoot['extensionsRequired'] = required.filter((name) => name !== tauCadTopologyExtension);
  const header = new TextEncoder().encode(
    canonicalJson({
      visualRoot,
      views: selected.map(({ index: viewIndex, descriptor }) => ({ index: viewIndex, descriptor })),
    }),
  );
  const bytes = new Uint8Array(header.byteLength + selected.reduce((size, view) => size + view.bytes.byteLength, 0));
  bytes.set(header);
  let offset = header.byteLength;
  for (const view of selected) {
    bytes.set(view.bytes, offset);
    offset += view.bytes.byteLength;
  }
  return digest(bytes);
}
