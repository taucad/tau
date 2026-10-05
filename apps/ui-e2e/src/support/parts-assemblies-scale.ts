import { runtimeDocumentProtocolSchemas } from '@taucad/runtime/transport';
/* eslint-disable no-await-in-loop -- Each checked immutable file precedes retention/import in its owned publication closure. */
import { digestContent } from '@taucad/cache-core';
import { canonicalJson } from '@taucad/utils/hash';
import { assertRootedPath } from '@taucad/utils/path';
import type {
  AdmittedAssembly,
  PublishedAssembly,
  PublishedPartAsset,
  PublishedPartReference,
  PublishAssemblyOutcome,
} from '@taucad/runtime/types';

type PublishedOutcome = Extract<PublishAssemblyOutcome, { status: 'published' }>;
type ClosureFile = Readonly<{ path: string; digest: PublishedPartAsset['digest']; bytes: Uint8Array<ArrayBuffer> }>;
type ScalePin = Pick<PublishedOutcome, 'root' | 'admitted' | 'partRecords'>;
type ScaleClosure = Readonly<{
  root: PublishedPartAsset;
  publication: PublishedAssembly;
  partRecords: Readonly<Record<string, PublishedPartReference>>;
  files: readonly ClosureFile[];
  requiredBytes: number;
}>;

/** Reconstruct the private, pinned root storage closure from actual project bytes. */
export const readPublishedRootStorage = async (
  root: PublishedPartAsset,
  readRawBytes: (path: string) => Promise<Uint8Array<ArrayBuffer>>,
): Promise<{
  parts: Readonly<Record<string, PublishedPartReference>>;
  generation: number;
  files: readonly ClosureFile[];
}> => {
  const parent = root.path.slice(0, root.path.lastIndexOf('/') + 1);
  const files = new Map<string, ClosureFile>();
  const retain = async (asset: PublishedPartAsset): Promise<Uint8Array<ArrayBuffer>> => {
    const path = assertRootedPath(asset.path);
    if (!path.startsWith(parent)) {
      throw new Error('Published root storage escapes its captured parent.');
    }
    const previous = files.get(path);
    if (previous) {
      if (previous.digest !== asset.digest || previous.bytes.byteLength !== asset.byteLength) {
        throw new Error('Published root storage has conflicting pinned identities.');
      }
      return previous.bytes;
    }
    const bytes = new Uint8Array(await readRawBytes(path));
    if (bytes.byteLength !== asset.byteLength || (await digestContent({ bytes })) !== asset.digest) {
      throw new Error('Published root storage has mismatched pinned bytes.');
    }
    files.set(path, { path, digest: asset.digest, bytes });
    return bytes;
  };
  const decode = (bytes: Uint8Array<ArrayBuffer>): unknown =>
    JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  if (root.byteLength > 4096) {
    throw new Error('Published root pointer exceeds its bounded metadata limit.');
  }
  const pointerBytes = await retain(root);
  if (pointerBytes.byteLength > 4096) {
    throw new Error('Published root pointer exceeds its bounded metadata limit.');
  }
  const pointer = decode(pointerBytes) as {
    schemaVersion: number;
    generation: number;
    manifest: PublishedPartAsset;
  };
  if (pointer.schemaVersion !== 2 || !Number.isSafeInteger(pointer.generation) || pointer.generation < 1) {
    throw new Error('Published root has an invalid checked pointer.');
  }
  const storagePath = (digest: string, extension: string): string =>
    `${parent}roots/sha256/${digest.slice('sha256:'.length)}.${extension}`;
  if (
    pointer.manifest.path !== storagePath(pointer.manifest.digest, 'json') ||
    pointer.manifest.byteLength > 1_048_576
  ) {
    throw new Error('Published root has an invalid manifest pin.');
  }
  const manifest = decode(await retain(pointer.manifest)) as {
    schemaVersion: number;
    content: { digest: PublishedPartAsset['digest']; byteLength: number };
    chunks: PublishedPartAsset[];
  };
  if (
    manifest.schemaVersion !== 1 ||
    !Number.isSafeInteger(manifest.content.byteLength) ||
    manifest.content.byteLength < 1 ||
    manifest.content.byteLength > 32 * 1_048_576 ||
    !Array.isArray(manifest.chunks) ||
    manifest.chunks.length !== Math.ceil(manifest.content.byteLength / 1_048_576)
  ) {
    throw new Error('Published root has an invalid bounded content manifest.');
  }
  const content = new Uint8Array(manifest.content.byteLength);
  let offset = 0;
  for (const chunk of manifest.chunks) {
    const expectedLength = Math.min(1_048_576, content.byteLength - offset);
    if (chunk.path !== storagePath(chunk.digest, 'chunk') || chunk.byteLength !== expectedLength) {
      throw new Error('Published root has an invalid ordered chunk.');
    }
    content.set(await retain(chunk), offset);
    offset += expectedLength;
  }
  if ((await digestContent({ bytes: content })) !== manifest.content.digest) {
    throw new Error('Published root reconstructed digest differs from its manifest.');
  }
  const logical = decode(content) as {
    schemaVersion: number;
    generation: number;
    parts: unknown;
  };
  if (
    logical.schemaVersion !== 1 ||
    logical.generation !== pointer.generation ||
    !logical.parts ||
    typeof logical.parts !== 'object' ||
    Array.isArray(logical.parts)
  ) {
    throw new Error('Published root logical content differs from its checked pointer.');
  }
  const parts = Object.fromEntries(
    Object.entries(logical.parts).map(([name, reference]) => [
      name,
      runtimeDocumentProtocolSchemas.calls.admitPublishedPart.args.parse(reference),
    ]),
  );
  return { parts, generation: logical.generation, files: [...files.values()] };
};

/** Read binary bytes below one already captured, owned test-project directory. */
export const readScaleDirectoryBytes = async (
  directory: FileSystemDirectoryHandle,
  path: string,
): Promise<Uint8Array<ArrayBuffer>> => {
  const segments = assertRootedPath(path).split('/');
  let parent = directory;
  for (const segment of segments.slice(0, -1)) {
    parent = await parent.getDirectoryHandle(segment);
  }
  const awaitedResult1 = await parent.getFileHandle(segments.at(-1)!);
  const file = await awaitedResult1.getFile();
  return new Uint8Array(await file.arrayBuffer());
};

/** Capture actual producer bytes, including the immutable root; never manufacture publication records. */
const collectScaleClosure = async (
  outcome: ScalePin,
  readRawBytes: (path: string) => Promise<Uint8Array<ArrayBuffer>>,
): Promise<ScaleClosure> => {
  const files = new Map<string, ClosureFile>();
  const parent = outcome.root.path.slice(0, outcome.root.path.lastIndexOf('/') + 1);
  if (!parent.startsWith('.tau/artifacts/reusable-parts/')) {
    throw new Error('Scale closure must come from the managed host publication owner.');
  }
  const names = Object.keys(outcome.admitted.publication.parts);
  if (
    names.length !== Object.keys(outcome.partRecords).length ||
    names.some((name) => !Object.hasOwn(outcome.partRecords, name))
  ) {
    throw new Error('Scale publication receipt does not cover its complete admitted part set.');
  }
  const retain = async (path: string, digest: PublishedPartAsset['digest'], byteLength?: number) => {
    assertRootedPath(path);
    if (!path.startsWith(parent)) {
      throw new Error('Scale closure escapes its captured publication parent.');
    }
    const existing = files.get(path);
    if (existing) {
      if (existing.digest !== digest || (byteLength !== undefined && existing.bytes.byteLength !== byteLength)) {
        throw new Error('Conflicting scale closure identity.');
      }
      return existing.bytes;
    }
    const bytes = new Uint8Array(await readRawBytes(path));
    if ((byteLength !== undefined && bytes.byteLength !== byteLength) || (await digestContent({ bytes })) !== digest) {
      throw new Error(`Scale closure byte identity mismatch: ${path}`);
    }
    files.set(path, { path, digest, bytes });
    return bytes;
  };
  const storage = await readPublishedRootStorage(outcome.root, readRawBytes);
  for (const file of storage.files) {
    files.set(file.path, file);
  }
  if (canonicalJson(storage.parts) !== canonicalJson(outcome.partRecords)) {
    throw new Error('Scale root references differ from its admitted part receipts.');
  }
  for (const [part, reference] of Object.entries(outcome.partRecords)) {
    const record = outcome.admitted.publication.parts[part];
    if (!record) {
      throw new Error('Actual admitted scale part is missing.');
    }
    const recordBytes = await retain(reference.path, reference.digest);
    if (new TextDecoder().decode(recordBytes) !== canonicalJson(record)) {
      throw new Error('Scale record bytes differ from the actual admitted record.');
    }
    for (const variant of Object.values(record.variants)) {
      const bytes = await retain(variant.glb.path, variant.glb.digest, variant.glb.byteLength);
      const admittedBytes = await outcome.admitted.readAsset(variant.glb.digest);
      if (
        (await digestContent({ bytes: admittedBytes })) !== variant.glb.digest ||
        admittedBytes.byteLength !== bytes.byteLength
      ) {
        throw new Error('Captured rooted bytes differ from the actual admitted reader.');
      }
      if (variant.exact) {
        await retain(variant.exact.asset.path, variant.exact.asset.digest, variant.exact.asset.byteLength);
      }
    }
  }
  return {
    root: outcome.root,
    publication: outcome.admitted.publication,
    partRecords: outcome.partRecords,
    files: [...files.values()],
    requiredBytes: [...files.values()].reduce((sum, file) => sum + file.bytes.byteLength, 0),
  };
};

/** Collect the actual publication outcome directly, preserving its admitted facade and references. */
export const collectPublishedScaleClosure = collectScaleClosure;

/** Read references only from the exact bytes of an already host-admitted root; this does not admit a facade. */
export const collectCommittedScaleClosure = async (
  capture: Readonly<{
    assemblyDisplay: Readonly<{ root: PublishedPartAsset; admitted: AdmittedAssembly }> | undefined;
    isCurrent(): boolean;
    readRawBytes(path: string): Promise<Uint8Array<ArrayBuffer>>;
  }>,
): Promise<ScaleClosure> => {
  const display = capture.assemblyDisplay;
  if (!display || !capture.isCurrent()) {
    throw new Error('Committed scale subject is unavailable.');
  }
  const readRawBytes = async (path: string): Promise<Uint8Array<ArrayBuffer>> => {
    if (!capture.isCurrent()) {
      throw new Error('Committed scale subject changed before collection.');
    }
    const bytes = await capture.readRawBytes(path);
    if (!capture.isCurrent()) {
      throw new Error('Committed scale subject changed during collection.');
    }
    return bytes;
  };
  const { parts: partRecords } = await readPublishedRootStorage(display.root, readRawBytes);
  const closure = await collectScaleClosure({ ...display, partRecords }, readRawBytes);
  if (!capture.isCurrent()) {
    throw new Error('Committed scale subject changed after collection.');
  }
  return closure;
};

/** Import checked bytes into an owned test project, then use the consumer's actual admission. */
export const importPublishedScaleClosure = async (
  closure: ScaleClosure,
  commitOwnedFiles: (files: Readonly<Record<string, { content: Uint8Array<ArrayBuffer> }>>) => Promise<void>,
  openAssembly: (root: PublishedPartAsset) => Promise<AdmittedAssembly>,
): Promise<AdmittedAssembly> => {
  const files: Record<string, { content: Uint8Array<ArrayBuffer> }> = {};
  const identities = new Map<string, PublishedPartAsset['digest']>();
  assertRootedPath(closure.root.path);
  const parent = closure.root.path.slice(0, closure.root.path.lastIndexOf('/') + 1);
  if (!parent.startsWith('.tau/artifacts/reusable-parts/')) {
    throw new Error('Scale import root is outside the managed publication owner.');
  }
  // Recheck mutable byte buffers before the first consumer write; no root/path/generation rewrite.
  for (const file of closure.files) {
    assertRootedPath(file.path);
    if (
      !file.path.startsWith(parent) ||
      Object.hasOwn(files, file.path) ||
      (await digestContent({ bytes: file.bytes })) !== file.digest
    ) {
      throw new Error('Scale import closure changed after capture.');
    }
    files[file.path] = { content: new Uint8Array(file.bytes) };
    identities.set(file.path, file.digest);
  }
  const root = files[closure.root.path]?.content;
  if (
    !root ||
    root.byteLength !== closure.root.byteLength ||
    (await digestContent({ bytes: root })) !== closure.root.digest
  ) {
    throw new Error('Scale import is missing its immutable root bytes.');
  }
  const storage = await readPublishedRootStorage(closure.root, async (path) => {
    const bytes = files[path]?.content;
    if (!bytes) {
      throw new Error('Scale import is missing pinned root storage.');
    }
    return bytes;
  });
  const rootReferences = storage.parts;
  const names = Object.keys(closure.publication.parts);
  if (
    canonicalJson(rootReferences) !== canonicalJson(closure.partRecords) ||
    names.length !== Object.keys(closure.partRecords).length ||
    names.some((name) => !Object.hasOwn(closure.partRecords, name))
  ) {
    throw new Error('Scale import does not cover its complete admitted part set.');
  }
  const expectedPaths = new Set(storage.files.map(({ path }) => path));
  const requireAsset = (asset: PublishedPartAsset): void => {
    const bytes = files[asset.path]?.content;
    if (!bytes || identities.get(asset.path) !== asset.digest || bytes.byteLength !== asset.byteLength) {
      throw new Error('Scale import is missing an admitted immutable asset.');
    }
    expectedPaths.add(asset.path);
  };
  for (const name of names) {
    const reference = closure.partRecords[name]!;
    const record = closure.publication.parts[name]!;
    const bytes = files[reference.path]?.content;
    if (
      !bytes ||
      identities.get(reference.path) !== reference.digest ||
      new TextDecoder().decode(bytes) !== canonicalJson(record)
    ) {
      throw new Error('Scale import is missing an admitted immutable record.');
    }
    expectedPaths.add(reference.path);
    for (const variant of Object.values(record.variants)) {
      requireAsset(variant.glb);
      if (variant.exact) {
        requireAsset(variant.exact.asset);
      }
    }
  }
  if (expectedPaths.size !== closure.files.length) {
    throw new Error('Scale import contains unrelated closure bytes.');
  }
  await commitOwnedFiles(files);
  return openAssembly(closure.root);
};

/** Remove only unchanged generated producer sources, after actual immutable pin admission. */
export const scrubScaleProducerSources = async (
  sources: Readonly<Record<string, { content: Uint8Array<ArrayBuffer> }>>,
  ownedProject: Readonly<{
    admitted: AdmittedAssembly;
    readRawBytes(path: string): Promise<Uint8Array<ArrayBuffer>>;
    removeSource(path: string): Promise<void>;
  }>,
): Promise<void> => {
  if (Object.keys(ownedProject.admitted.publication.parts).length === 0) {
    throw new Error('Scale source scrub requires an actually admitted pin.');
  }
  const paths = Object.keys(sources);
  for (const path of paths) {
    assertRootedPath(path);
    if (path !== 'scale/assembly.json' && !/^scale\/parts\/p\d{4}\.js$/u.test(path)) {
      throw new Error('Scale scrub is outside its exact generated source set.');
    }
    const current = await ownedProject.readRawBytes(path);
    if ((await digestContent({ bytes: current })) !== (await digestContent({ bytes: sources[path]!.content }))) {
      throw new Error('Scale source changed before its owned scrub.');
    }
  }
  // All current source identities and paths pass before the first removal; pins stay untouched.
  for (const path of paths) {
    await ownedProject.removeSource(path);
  }
};

/** Exact immutable closure denominators from checked producer/consumer bytes, before any timing interval. */
export const summarizeScaleClosureBytes = (
  closure: ScaleClosure,
): {
  root: PublishedPartAsset;
  definitions: number;
  occurrences: number;
  rootBytes: number;
  rootStorageBytes: number;
  partRecordBytes: number;
  allVariantGlbBytes: number;
  allVariantExactBytes: number;
  completeClosureBytes: number;
  immutableFileCount: number;
  assets: Array<{ path: string; digest: PublishedPartAsset['digest']; byteLength: number }>;
  semantics: string;
} => {
  const records = new Set(Object.values(closure.partRecords).map(({ path }) => path));
  const glbs = new Set(
    Object.values(closure.publication.parts).flatMap((part) =>
      Object.values(part.variants).map((variant) => variant.glb.path),
    ),
  );
  const exact = new Set(
    Object.values(closure.publication.parts).flatMap((part) =>
      Object.values(part.variants).flatMap((variant) => (variant.exact ? [variant.exact.asset.path] : [])),
    ),
  );
  const sum = (paths: ReadonlySet<string>): number =>
    closure.files.reduce((total, file) => total + (paths.has(file.path) ? file.bytes.byteLength : 0), 0);
  const storagePrefix = `${closure.root.path.slice(0, closure.root.path.lastIndexOf('/') + 1)}roots/sha256/`;
  const storage = new Set(closure.files.filter(({ path }) => path.startsWith(storagePrefix)).map(({ path }) => path));
  return {
    root: closure.root,
    definitions: Object.keys(closure.publication.parts).length,
    occurrences: closure.publication.occurrences.length,
    rootBytes: closure.root.byteLength,
    rootStorageBytes: closure.root.byteLength + sum(storage),
    partRecordBytes: sum(records),
    allVariantGlbBytes: sum(glbs),
    allVariantExactBytes: sum(exact),
    completeClosureBytes: closure.requiredBytes,
    immutableFileCount: closure.files.length,
    assets: closure.files.map(({ path, digest, bytes }) => ({ path, digest, byteLength: bytes.byteLength })),
    semantics:
      'checked immutable bytes; not a measurement of live read-cache copies, metadata object heap, WASM or GPU allocation',
  };
};

type ScaleRasterDifference = Readonly<{
  width: number;
  height: number;
  pixels: number;
  changedPixels: number;
  differingPixelRatioOver12: number;
  meanLuminanceDifference: number;
  maxChannelDifference: number;
  meaning: string;
}>;

/** Full-resolution raster differences; 12 levels is the existing backend diagnostic bin, not an accepted LOD limit. */
export function summarizeScaleRasterDifference(
  first: Readonly<{ width: number; height: number; data: ArrayLike<number> }>,
  second: Readonly<{ width: number; height: number; data: ArrayLike<number> }>,
): ScaleRasterDifference {
  if (
    !Number.isSafeInteger(first.width) ||
    !Number.isSafeInteger(first.height) ||
    first.width <= 0 ||
    first.height <= 0 ||
    first.width !== second.width ||
    first.height !== second.height ||
    first.data.length !== first.width * first.height * 4 ||
    second.data.length !== first.data.length
  ) {
    throw new RangeError('Scale calibration requires two complete identical-resolution RGBA captures.');
  }
  let changedPixels = 0;
  let differingPixelsOver12 = 0;
  let luminanceDifference = 0;
  let maxChannelDifference = 0;
  for (let index = 0; index < first.data.length; index += 4) {
    let difference = 0;
    let luminance = 0;
    for (const [channel, weight] of [0.2126, 0.7152, 0.0722, 0].entries()) {
      const a = first.data[index + channel];
      const b = second.data[index + channel];
      if (
        a === undefined ||
        b === undefined ||
        !Number.isFinite(a) ||
        !Number.isFinite(b) ||
        a < 0 ||
        a > 255 ||
        b < 0 ||
        b > 255
      ) {
        throw new RangeError('Scale calibration pixels are not finite byte channels.');
      }
      difference = Math.max(difference, Math.abs(a - b));
      luminance += (a - b) * weight;
    }
    changedPixels += difference > 0 ? 1 : 0;
    differingPixelsOver12 += difference > 12 ? 1 : 0;
    luminanceDifference += Math.abs(luminance);
    maxChannelDifference = Math.max(maxChannelDifference, difference);
  }
  const pixels = first.width * first.height;
  return {
    width: first.width,
    height: first.height,
    pixels,
    changedPixels,
    differingPixelRatioOver12: differingPixelsOver12 / pixels,
    meanLuminanceDifference: luminanceDifference / pixels,
    maxChannelDifference,
    meaning: 'complete RGBA raster comparison; neither screen-space geometric displacement nor Hausdorff distance',
  };
}

/** Reuse the existing browser-native PNG/ImageData decoder, without a new decoder dependency or renderer. */
export async function compareScalePngFrames(first: string, second: string): Promise<ScaleRasterDifference> {
  const read = async (png: string): Promise<ImageData> => {
    const image = new Image();
    image.src = `data:image/png;base64,${png}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Existing scale PNG decode requires the browser 2D pixel reader.');
    }
    context.drawImage(image, 0, 0);
    return context.getImageData(0, 0, canvas.width, canvas.height);
  };
  const [a, b] = await Promise.all([read(first), read(second)]);
  return summarizeScaleRasterDifference(a, b);
}

/* eslint-enable no-await-in-loop -- End the existing ordered consumer/publication closure scope. */
