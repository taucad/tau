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
    const { primitives } = object(rawMesh);
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
  const allRigidWrappers = new Set(
    nodes.flatMap((node, nodeIndex) =>
      isOccurrenceWrapper(object(node)) && isPureRigidPose(object(node)) ? [nodeIndex] : [],
    ),
  );
  const prepared = parts.map((primitives) => {
    const common = commonNodeChain(nodes, parents, primitives);
    if (!common?.length) {
      return undefined;
    }
    const wrappers = common.filter((nodeIndex) => isOccurrenceWrapper(object(nodes[nodeIndex])));
    if (wrappers.length === 0 || wrappers.some((nodeIndex) => !allRigidWrappers.has(nodeIndex))) {
      return undefined;
    }
    return wrappers;
  });
  if (prepared.every((eligible) => !eligible)) {
    return { visualKey, previews: prepared.map(() => undefined) };
  }
  const normalizedWrappers = [...new Set(prepared.flatMap((wrappers) => wrappers ?? []))];
  // One export source serves the batch. Never normalize a selected intrinsic child
  // or a conservative fallback row merely because another row canonicalizes it.
  const conflicts = parts.some((primitives, partIndex) =>
    primitives.some((primitive) => {
      const chain = commonNodeChain(nodes, parents, [primitive]) ?? [];
      return normalizedWrappers.some((wrapper) => chain.includes(wrapper) && !prepared[partIndex]?.includes(wrapper));
    }),
  );
  if (conflicts) {
    return { visualKey, previews: parts.map(() => undefined) };
  }
  let previews: ReadonlyArray<Readonly<{ key: string }> | undefined>;
  try {
    previews = await selectedPartVisualKeys({
      parsed,
      parents,
      parts,
      eligible: prepared.map(Boolean),
      rigidWrappers: normalizedWrappers,
    });
  } catch {
    return { visualKey, previews: parts.map(() => undefined) };
  }
  if (previews.every((preview) => !preview)) {
    return { visualKey, previews };
  }
  let normalized: Uint8Array<ArrayBuffer> | undefined;
  return {
    visualKey,
    previews,
    renderContent: () => {
      normalized ??= writeCanonicalGlb(content, parsed, normalizedWrappers);
      return normalized;
    },
  };
}

/** Resolve only the selected visual closure; scene-local array indices never enter its identity. */
async function selectedPartVisualKeys({
  parsed: { json, bin },
  parents,
  parts,
  eligible,
  rigidWrappers,
}: {
  readonly parsed: ReturnType<typeof parseGltfBytes>;
  readonly parents: ReadonlyMap<number, number>;
  readonly parts: ReadonlyArray<readonly PartPrimitiveReference[]>;
  readonly eligible: ReadonlyArray<boolean | undefined>;
  readonly rigidWrappers: readonly number[];
}): Promise<ReadonlyArray<Readonly<{ key: string }> | undefined>> {
  const root: JsonRecord = { ...json };
  if (!supportsCanonicalVisual(root)) {
    return parts.map(() => undefined);
  }
  const stripMetadata = (raw: unknown): JsonRecord => {
    const value = { ...object(raw) };
    delete value['name'];
    const extras = { ...object(value['extras']) };
    delete extras['tauComponentId'];
    delete value['extras'];
    if (Object.keys(extras).length > 0) {
      value['extras'] = extras;
    }
    return value;
  };
  const resources = new Map<string, Promise<unknown>>();
  const resource = async (kind: string, reference: unknown): Promise<unknown> => {
    const resourceIndex = index(reference);
    const collection = root[kind];
    if (resourceIndex === undefined || !Array.isArray(collection) || resourceIndex >= collection.length) {
      throw new Error(`Part preview references an invalid ${kind} resource.`);
    }
    const address = `${kind}/${resourceIndex}`;
    let resolved = resources.get(address);
    if (resolved) {
      return resolved;
    }
    const resolve = async (): Promise<unknown> => {
      const value = stripMetadata(collection[resourceIndex]);
      if (kind === 'bufferViews') {
        const offset = index(value['byteOffset'] ?? 0);
        const length = index(value['byteLength']);
        if (offset === undefined || length === undefined || offset + length > bin.byteLength) {
          throw new Error('Part preview buffer view exceeds embedded data.');
        }
        delete value['buffer'];
        delete value['byteOffset'];
        value['bytes'] = await digest(bin.subarray(offset, offset + length));
      } else if (kind === 'materials') {
        const textures = async (raw: unknown): Promise<unknown> => {
          if (Array.isArray(raw)) {
            return Promise.all(raw.map(async (child) => textures(child)));
          }
          if (typeof raw !== 'object' || raw === null) {
            return raw;
          }
          const record = object(raw);
          return Object.fromEntries(
            await Promise.all(
              Object.entries(record).map(async ([name, child]) => [
                name,
                name === 'index' ? await resource('textures', child) : await textures(child),
              ]),
            ),
          );
        };
        return textures(value);
      } else {
        const references: Record<string, string> =
          kind === 'textures'
            ? { source: 'images', sampler: 'samplers' }
            : kind === 'images' || kind === 'accessors'
              ? { bufferView: 'bufferViews' }
              : {};
        for (const [name, target] of Object.entries(references)) {
          if (value[name] !== undefined) {
            // oxlint-disable-next-line no-await-in-loop -- Resolve each resource once through the shared promise map.
            value[name] = await resource(target, value[name]);
          }
        }
        if (kind === 'accessors' && value['sparse'] !== undefined) {
          const sparse = { ...object(value['sparse']) };
          for (const name of ['indices', 'values']) {
            const selected = { ...object(sparse[name]) };
            // oxlint-disable-next-line no-await-in-loop -- Sparse accessor indices and values have independent byte ownership.
            selected['bufferView'] = await resource('bufferViews', selected['bufferView']);
            sparse[name] = selected;
          }
          value['sparse'] = sparse;
        }
      }
      return value;
    };
    resolved = resolve();
    resources.set(address, resolved);
    return resolved;
  };
  const omit = new Set(rigidWrappers);
  return Promise.all(
    parts.map(async (primitives, partIndex) => {
      if (!eligible[partIndex]) {
        return undefined;
      }
      const selected = await Promise.all(
        primitives.map(async ({ nodeIndex, meshIndex, primitiveIndex }) => {
          const node = object(json.nodes?.[nodeIndex]);
          const { meshes } = root;
          const mesh = Array.isArray(meshes) ? object(meshes[meshIndex]) : {};
          const rawPrimitives = mesh['primitives'];
          if (node['mesh'] !== meshIndex || !Array.isArray(rawPrimitives) || !rawPrimitives[primitiveIndex]) {
            throw new Error('Part preview primitive does not belong to the selected node.');
          }
          const primitive = stripMetadata(rawPrimitives[primitiveIndex]);
          const attributes = async (raw: unknown): Promise<JsonRecord> => {
            const entries = await Promise.all(
              Object.entries(object(raw)).map(
                async ([name, accessor]): Promise<[string, unknown]> => [name, await resource('accessors', accessor)],
              ),
            );
            return Object.fromEntries<unknown>(entries);
          };
          primitive['attributes'] = await attributes(primitive['attributes']);
          if (primitive['indices'] !== undefined) {
            primitive['indices'] = await resource('accessors', primitive['indices']);
          }
          if (primitive['material'] !== undefined) {
            primitive['material'] = await resource('materials', primitive['material']);
          }
          if (Array.isArray(primitive['targets'])) {
            primitive['targets'] = await Promise.all(primitive['targets'].map(async (target) => attributes(target)));
          }
          const chain: number[] = [];
          let cursor: number | undefined = nodeIndex;
          while (cursor !== undefined) {
            chain.unshift(cursor);
            cursor = parents.get(cursor);
          }
          const transform = new Matrix4();
          for (const selectedNode of chain) {
            const value = object(json.nodes?.[selectedNode]);
            if (value['skin'] !== undefined) {
              throw new Error('Skinned part previews require full source identity.');
            }
            if (omit.has(selectedNode)) {
              continue;
            }
            const matrix = new Matrix4();
            const raw = value['matrix'];
            if (
              Array.isArray(raw) &&
              raw.length === 16 &&
              raw.every((item) => typeof item === 'number' && Number.isFinite(item))
            ) {
              matrix.fromArray(raw as number[]);
            } else {
              const translation = value['translation'] ?? [0, 0, 0];
              const rotation = value['rotation'] ?? [0, 0, 0, 1];
              const scale = value['scale'] ?? [1, 1, 1];
              if (
                raw !== undefined ||
                !validVector(translation, 3) ||
                !validVector(rotation, 4) ||
                !validVector(scale, 3)
              ) {
                throw new Error('Part preview has an invalid intrinsic transform.');
              }
              matrix.compose(new Vector3(...translation), new Quaternion(...rotation), new Vector3(...scale));
            }
            transform.multiply(matrix);
          }
          // Intrinsic child and primitive order can affect equal-depth transparent
          // draws. Preserve it while excluding global node/mesh array addresses.
          const lastWrapper = chain.findLastIndex((selectedNode) => omit.has(selectedNode));
          const intrinsicPath = chain.slice(lastWrapper + 1).flatMap((selectedNode, depth) => {
            const parentIndex = chain[lastWrapper + depth];
            return parentIndex === undefined ? [] : [json.nodes?.[parentIndex]?.children?.indexOf(selectedNode) ?? 0];
          });
          return canonicalJson({
            primitive,
            drawOrder: [...intrinsicPath, primitiveIndex],
            transform: transform.elements,
            weights: node['weights'] ?? mesh['weights'],
          });
        }),
      );
      return { key: await digest(new TextEncoder().encode(canonicalJson(selected.sort()))) };
    }),
  );
}

function supportsCanonicalVisual(root: JsonRecord): boolean {
  const used: unknown = root['extensionsUsed'];
  const required: unknown = root['extensionsRequired'];
  const usedExtensions: readonly unknown[] = Array.isArray(used) ? used : [];
  const requiredExtensions: readonly unknown[] = Array.isArray(required) ? required : [];
  const extensions = [...usedExtensions, ...requiredExtensions];
  const buffers = Array.isArray(root['buffers']) ? root['buffers'] : [];
  const images = Array.isArray(root['images']) ? root['images'] : [];
  return (
    Object.hasOwn(object(root['extensions']), tauCadTopologyExtension) &&
    extensions.every(
      (name) => name === tauCadTopologyExtension || (typeof name === 'string' && knownVisualExtensions.has(name)),
    ) &&
    buffers.length <= 1 &&
    buffers.every((buffer) => object(buffer)['uri'] === undefined) &&
    images.every(
      (image) => typeof object(image)['uri'] !== 'string' || (object(image)['uri'] as string).startsWith('data:'),
    )
  );
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
  if (!supportsCanonicalVisual(root)) {
    return digest(content);
  }
  const used = Array.isArray(root['extensionsUsed']) ? (root['extensionsUsed'] as unknown[]) : [];
  const required = Array.isArray(root['extensionsRequired']) ? (root['extensionsRequired'] as unknown[]) : [];
  const images = Array.isArray(root['images']) ? (root['images'] as unknown[]) : [];
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
