import { contentDigest, digestContent } from '@taucad/cache-core';
import { canonicalJson } from '@taucad/utils/hash';
import { assertRootedPath, joinRelativePath } from '@taucad/utils/path';
import type { KernelFileSystem } from '#types/runtime-kernel.types.js';
import { publishedPartRecordSchema } from '#types/runtime-assembly.schemas.js';
import type {
  PreparedPublishedPart,
  PublishedPartAsset,
  PublishedPartExact,
  PublishedPartRecord,
  PublishedPartReference,
} from '#types/runtime-assembly.types.js';
import type { SourceRevision } from '#types/runtime.types.js';

const filePath = (path: string): string => {
  const canonical = assertRootedPath(path);
  if (canonical.length === 0) {
    throw new TypeError('Published-part file path must not be the project root.');
  }
  return canonical;
};

const checkBytes = async (bytes: Uint8Array<ArrayBuffer>, asset: PublishedPartAsset): Promise<void> => {
  if (bytes.byteLength !== asset.byteLength || (await digestContent({ bytes })) !== asset.digest) {
    throw new Error(`Published-part asset does not match its pinned digest: ${asset.path}`);
  }
};

const readPinned = async (
  filesystem: KernelFileSystem,
  asset: PublishedPartAsset,
): Promise<Uint8Array<ArrayBuffer>> => {
  const bytes = await filesystem.readFile(filePath(asset.path));
  await checkBytes(bytes, asset);
  return bytes;
};

const object = (value: unknown): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Published-part GLB has an invalid glTF resource declaration.');
  }
  return value as Record<string, unknown>;
};

const entries = (value: unknown): unknown[] => {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new TypeError('Published-part GLB has an invalid glTF resource list.');
  }
  return value as unknown[];
};

const boundedLength = (value: unknown, label: string): number => {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`Published-part GLB has an invalid ${label}.`);
  }
  return value;
};

const embeddedUriLength = (value: unknown): number | undefined => {
  if (typeof value !== 'string' || !value.startsWith('data:')) {
    return undefined;
  }
  const comma = value.indexOf(',');
  if (comma === -1) {
    throw new Error('Published-part GLB has an invalid embedded data URI.');
  }
  const metadata = value.slice(5, comma);
  const payload = value.slice(comma + 1);
  if (/;base64$/iu.test(metadata)) {
    if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(payload)) {
      throw new Error('Published-part GLB has an invalid embedded base64 payload.');
    }
    const padding = payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0;
    return (payload.length / 4) * 3 - padding;
  }
  let length = 0;
  for (let index = 0; index < payload.length; ) {
    const codePoint = payload.codePointAt(index)!;
    const character = String.fromCodePoint(codePoint);
    if (character === '%') {
      if (!/^[0-9a-f]{2}$/iu.test(payload.slice(index + 1, index + 3))) {
        throw new Error('Published-part GLB has an invalid embedded percent encoding.');
      }
      index += 3;
      length++;
    } else {
      length += new TextEncoder().encode(character).length;
      index += character.length;
    }
  }
  return length;
};

const verifyGlb = (bytes: Uint8Array<ArrayBuffer>): Record<string, unknown> => {
  if (bytes.byteLength < 20) {
    throw new Error('Published-part GLB has no JSON chunk.');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const magic = view.getUint32(0, true);
  const version = view.getUint32(4, true);
  const declaredLength = view.getUint32(8, true);
  const jsonLength = view.getUint32(12, true);
  const jsonType = view.getUint32(16, true);
  if (
    magic !== 0x46_54_6c_67 ||
    version !== 2 ||
    declaredLength !== bytes.byteLength ||
    jsonType !== 0x4e_4f_53_4a ||
    jsonLength % 4 !== 0 ||
    jsonLength + 20 > bytes.byteLength
  ) {
    throw new Error('Published-part GLB has an invalid GLB 2.0 envelope.');
  }
  const jsonBytes = bytes.subarray(20, 20 + jsonLength);
  const json: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(jsonBytes));
  const document = object(json);
  if (object(document['asset'])['version'] !== '2.0') {
    throw new Error('Published-part GLB has no glTF 2.0 asset.');
  }
  let offset = 20 + jsonLength;
  let binLength = 0;
  let binSeen = false;
  while (offset < bytes.byteLength) {
    if (offset + 8 > bytes.byteLength) {
      throw new Error('Published-part GLB has a truncated chunk header.');
    }
    const length = view.getUint32(offset, true);
    if (length % 4 !== 0 || offset + 8 + length > bytes.byteLength) {
      throw new Error('Published-part GLB has a truncated chunk.');
    }
    if (view.getUint32(offset + 4, true) === 0x00_4e_49_42) {
      if (binSeen) {
        throw new Error('Published-part GLB has multiple BIN chunks.');
      }
      binSeen = true;
      binLength = length;
    }
    offset += 8 + length;
  }
  const buffers = entries(document['buffers']).map((entry) => object(entry));
  for (const [index, buffer] of buffers.entries()) {
    const length = boundedLength(buffer['byteLength'], 'buffer byteLength');
    if (buffer['uri'] !== undefined) {
      const embeddedLength = embeddedUriLength(buffer['uri']);
      if (embeddedLength === undefined) {
        throw new Error('Published-part GLB references an external buffer.');
      }
      if (length > embeddedLength) {
        throw new Error('Published-part GLB buffer exceeds its embedded data URI.');
      }
    } else if (index !== 0 || length > binLength) {
      throw new Error('Published-part GLB buffer exceeds its embedded BIN chunk.');
    }
  }
  for (const rawView of entries(document['bufferViews'])) {
    const bufferView = object(rawView);
    const index = boundedLength(bufferView['buffer'], 'bufferView buffer');
    const start = boundedLength(bufferView['byteOffset'] ?? 0, 'bufferView byteOffset');
    const length = boundedLength(bufferView['byteLength'], 'bufferView byteLength');
    const buffer = buffers[index];
    if (!buffer || start + length > boundedLength(buffer['byteLength'], 'buffer byteLength')) {
      throw new Error('Published-part GLB bufferView exceeds its buffer.');
    }
  }
  for (const rawImage of entries(document['images'])) {
    const image = object(rawImage);
    if (image['uri'] !== undefined && embeddedUriLength(image['uri']) === undefined) {
      throw new Error('Published-part GLB references an external image.');
    }
    if (image['bufferView'] !== undefined) {
      const index = boundedLength(image['bufferView'], 'image bufferView');
      if (index >= entries(document['bufferViews']).length) {
        throw new Error('Published-part GLB image references a missing bufferView.');
      }
    }
  }
  return document;
};

/** Project source-local IDs from a semantically admitted active GLB scene; no display/native join is inferred. @internal */
export const readPublishedGlbSourceComponentIds = (bytes: Uint8Array<ArrayBuffer>): readonly string[] => {
  const document = verifyGlb(bytes);
  const nodes = entries(document['nodes']).map((entry) => object(entry));
  const scenes = entries(document['scenes']).map((entry) => object(entry));
  const scene = scenes[boundedLength(document['scene'] ?? 0, 'active scene')];
  if (!scene) {
    throw new Error('Published-part GLB has no admitted active scene.');
  }
  const ids: string[] = [];
  const seenIds = new Set<string>();
  const active = new Set<number>();
  const visited = new Set<number>();
  const visit = (rawIndex: unknown): void => {
    const index = boundedLength(rawIndex, 'node index');
    const node = nodes[index];
    if (!node || active.has(index) || visited.has(index)) {
      throw new Error('Published-part GLB active component graph is ambiguous.');
    }
    active.add(index);
    visited.add(index);
    if (node['mesh'] !== undefined) {
      const id = object(node['extras'])['tauComponentId'];
      if (typeof id !== 'string' || id.length === 0 || seenIds.has(id)) {
        throw new Error('Published-part GLB active mesh IDs are missing or duplicated.');
      }
      seenIds.add(id);
      ids.push(id);
    }
    for (const child of entries(node['children'])) {
      visit(child);
    }
    active.delete(index);
  };
  for (const root of entries(scene['nodes'])) {
    visit(root);
  }
  return ids;
};

/** Persist one private digest-pinned publication asset before advancing a mutable root. @internal */
export const writePublishedImmutableAsset = async (
  filesystem: KernelFileSystem,
  {
    asset,
    bytes,
    publicationWriter,
  }: {
    asset: PublishedPartAsset;
    bytes: Uint8Array<ArrayBuffer>;
    publicationWriter?: Pick<KernelFileSystem, 'ensureDir' | 'writeFileChecked'>;
  },
): Promise<void> => {
  const writer = publicationWriter ?? filesystem;
  await checkBytes(bytes, asset);
  const path = filePath(asset.path);
  if (await filesystem.exists(path)) {
    await readPinned(filesystem, asset);
    return;
  }
  await writer.ensureDir(path.slice(0, path.lastIndexOf('/')));
  if (writer.writeFileChecked) {
    const result = await writer.writeFileChecked({
      path,
      data: bytes,
      preconditions: [{ path, expected: null }],
    });
    if (result.status === 'conflict') {
      await readPinned(filesystem, asset);
      return;
    }
  } else {
    // Internal groundwork only: providers without a checked authority cannot publish a scene root.
    await filesystem.writeFile(path, bytes);
  }
  await readPinned(filesystem, asset);
};

const assetPath = (directory: string, digest: string, extension: string): string =>
  joinRelativePath(directory, `${digest.slice('sha256:'.length)}.${extension}`);

/**
 * Persist a completed GLB and its versioned record in content-before-record order.
 * This does not advance an assembly root; S10 owns the checked root transition.
 *
 * @param input - Rooted filesystem, destination directories and completed source result.
 * @returns A serializable pinned reference and the admitted record.
 * @internal
 */
export const preparePublishedPart = async (input: {
  filesystem: KernelFileSystem;
  directory: string;
  source: SourceRevision;
  glb: Uint8Array<ArrayBuffer>;
}): Promise<PreparedPublishedPart> =>
  preparePublishedPartVariants({
    filesystem: input.filesystem,
    directory: input.directory,
    variants: { default: { source: input.source, glb: input.glb } },
  });

/** Persist all effective recipes and their distinct provenance in one durable record. @internal */
export const preparePublishedPartVariants = async (input: {
  filesystem: KernelFileSystem;
  publicationWriter?: Pick<KernelFileSystem, 'ensureDir' | 'writeFileChecked'>;
  directory: string;
  variants: Readonly<
    Record<
      string,
      Readonly<{
        source: SourceRevision;
        glb: Uint8Array<ArrayBuffer>;
        /** Private producer classification; never persisted or accepted on the worker protocol. */
        optionalAbsentPaths?: ReadonlySet<string>;
        exact?: Omit<PublishedPartExact, 'asset'> & Readonly<{ bytes: Uint8Array<ArrayBuffer> }>;
      }>
    >
  >;
}): Promise<PreparedPublishedPart> => {
  const { filesystem } = input;
  const directory = assertRootedPath(input.directory);
  if (!Object.hasOwn(input.variants, 'default')) {
    throw new Error('A published part requires a default display variant.');
  }
  const variants = new Map<string, PublishedPartRecord['variants'][string]>();
  for (const [name, recipe] of Object.entries(input.variants)) {
    if (name.length === 0) {
      throw new Error('Published variant name must not be empty.');
    }
    const { source, glb: bytes } = recipe;
    filePath(source.entry);
    if (
      !Object.hasOwn(source.files, source.entry) ||
      source.files[source.entry] === 'missing' ||
      Object.entries(source.files).some(
        ([path, digest]) => digest === 'missing' && !recipe.optionalAbsentPaths?.has(path),
      ) ||
      [...(recipe.optionalAbsentPaths ?? [])].some((path) => source.files[path] !== 'missing')
    ) {
      throw new Error('A published part requires a complete resolved source closure.');
    }
    contentDigest({ value: source.files[source.entry]!, name: 'published part source entry' });
    verifyGlb(bytes);
    // Every variant is verified and stored before the immutable record is written.
    // eslint-disable-next-line no-await-in-loop -- Record creation waits for each variant's digest.
    const glbDigest = await digestContent({ bytes });
    const glb: PublishedPartAsset = {
      path: assetPath(joinRelativePath(directory, 'assets/sha256'), glbDigest, 'glb'),
      digest: glbDigest,
      byteLength: bytes.byteLength,
    };
    // eslint-disable-next-line no-await-in-loop -- Each immutable asset must be verified before the record is written.
    await writePublishedImmutableAsset(filesystem, { asset: glb, bytes, publicationWriter: input.publicationWriter });
    let exact: PublishedPartExact | undefined;
    if (recipe.exact) {
      const { bytes: exactBytes, ...qualifier } = recipe.exact;
      // An exact record is issued only after its codec-owned bytes are durable and digest-verified.
      // eslint-disable-next-line no-await-in-loop -- A record cannot precede any of its immutable assets.
      const exactDigest = await digestContent({ bytes: exactBytes });
      const asset: PublishedPartAsset = {
        path: assetPath(joinRelativePath(directory, 'assets/sha256'), exactDigest, 'native'),
        digest: exactDigest,
        byteLength: exactBytes.byteLength,
      };
      // eslint-disable-next-line no-await-in-loop -- Persist exact bytes before the record that advertises them.
      await writePublishedImmutableAsset(filesystem, {
        asset,
        bytes: exactBytes,
        publicationWriter: input.publicationWriter,
      });
      exact = { ...qualifier, asset };
    }
    variants.set(name, exact ? { source, glb, exact } : { source, glb });
  }
  const record: PublishedPartRecord = { schemaVersion: 1, variants: Object.fromEntries(variants) };
  publishedPartRecordSchema.parse(record);
  const recordBytes = new TextEncoder().encode(canonicalJson(record));
  const digest = await digestContent({ bytes: recordBytes });
  const reference: PublishedPartReference = {
    path: assetPath(joinRelativePath(directory, 'parts/sha256'), digest, 'json'),
    digest,
  };
  await writePublishedImmutableAsset(filesystem, {
    asset: { ...reference, byteLength: recordBytes.byteLength },
    bytes: recordBytes,
    publicationWriter: input.publicationWriter,
  });
  return { reference, record };
};

/**
 * Verify pinned provenance and the required display closure before reuse.
 * Non-entry absence is a stored producer fact; source-free admission cannot recreate its resolution proof.
 * @internal
 */
const verifyPublishedPart = async (
  filesystem: KernelFileSystem,
  reference: PublishedPartReference,
  selectedDigest?: PublishedPartAsset['digest'],
): Promise<{ record: PublishedPartRecord; selected?: Uint8Array<ArrayBuffer> }> => {
  const path = filePath(reference.path);
  const recordBytes = await filesystem.readFile(path);
  if ((await digestContent({ bytes: recordBytes })) !== reference.digest) {
    throw new Error(`Published-part record does not match its pinned digest: ${path}`);
  }
  const record = publishedPartRecordSchema.parse(
    JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(recordBytes)),
  );
  if (Object.keys(record.variants).length === 0 || !Object.hasOwn(record.variants, 'default')) {
    throw new Error('Published-part record requires a default display variant.');
  }
  // Verify every variant serially to bound outstanding verification buffers. Individual
  // readFile allocation and the later selected-asset owned copy remain separate transients.
  const variants = Object.values(record.variants);
  let selected: Uint8Array<ArrayBuffer> | undefined;
  for (const variant of variants) {
    filePath(variant.source.entry);
    if (
      !Object.hasOwn(variant.source.files, variant.source.entry) ||
      variant.source.files[variant.source.entry] === 'missing'
    ) {
      throw new Error('Published-part record has an unresolved source dependency.');
    }
    // oxlint-disable-next-line no-await-in-loop -- All pinned variants must verify with one outstanding source read.
    const glb = await readPinned(filesystem, variant.glb);
    verifyGlb(glb);
    if (variant === variants.at(-1) && variant.glb.digest === selectedDigest) {
      selected = glb;
    }
  }
  return { record, selected };
};

/** Verify pinned provenance and the required display closure before reuse. @internal */
export const admitPublishedPart = async (
  filesystem: KernelFileSystem,
  reference: PublishedPartReference,
): Promise<PublishedPartRecord> => {
  const verified = await verifyPublishedPart(filesystem, reference);
  return verified.record;
};

/** Return an owned copy of one verified asset from an admitted published part. @internal */
export const readPublishedPartAsset = async (
  filesystem: KernelFileSystem,
  reference: PublishedPartReference,
  digest: PublishedPartAsset['digest'],
): Promise<Uint8Array<ArrayBuffer>> => {
  const { record, selected } = await verifyPublishedPart(filesystem, reference, digest);
  const assets = Object.values(record.variants).flatMap((variant) =>
    variant.exact ? [variant.glb, variant.exact.asset] : [variant.glb],
  );
  const asset = assets.find((entry) => entry.digest === digest);
  if (!asset) {
    throw new Error('Asset digest is not in the admitted published-part closure.');
  }
  return new Uint8Array(selected ?? (await readPinned(filesystem, asset)));
};

/** Read native bytes only for an exact descriptor supplied by the selected producer. @internal */
export const readCompatiblePublishedPartExact = async (
  filesystem: KernelFileSystem,
  input: Readonly<{
    reference: PublishedPartReference;
    variantName: string;
    expected: Omit<PublishedPartExact, 'asset'>;
  }>,
): Promise<Uint8Array<ArrayBuffer>> => {
  const record = await admitPublishedPart(filesystem, input.reference);
  const exact = record.variants[input.variantName]?.exact;
  if (!exact) {
    throw new Error(`Published part has no exact snapshot for variant ${input.variantName}.`);
  }
  for (const key of [
    'kernelId',
    'provider',
    'providerVersion',
    'codec',
    'codecVersion',
    'unit',
    'linearToleranceMm',
    'angularToleranceRad',
  ] as const) {
    if (exact[key] !== input.expected[key]) {
      throw new Error(`Published-part exact snapshot is incompatible: ${key}.`);
    }
  }
  return new Uint8Array(await readPinned(filesystem, exact.asset));
};
