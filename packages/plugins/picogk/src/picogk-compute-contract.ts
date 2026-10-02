import { createHash } from 'node:crypto';
import { lstat, open, realpath } from 'node:fs/promises';
import { dirname, join, relative, sep } from 'node:path';
import { z } from 'zod';
import { decodeStoredEnvelope } from '#compute-stored-envelope.js';
import { actionDigest, canonicalizeCacheValue, canonicalizeComputeAction, contentDigest } from '@taucad/cache-core';
import type { CacheValue, ComputeAction } from '@taucad/cache-core';
import type { ComputeStoreEntry } from '@taucad/runtime/kernel';

/** Private, versioned bridge. Producer pins managed, native, algorithm and codec assets. @internal */
export const computeNamespace = 'picogk.operation.v1';
const maximumManifestBytes = 4 * 1024 * 1024;
const maximumFragmentBytes = 65_536;
const boundedFragment = z
  .string()
  .refine(
    (value) => new TextEncoder().encode(value).byteLength <= maximumFragmentBytes,
    'Compute canonical fragment bound',
  );
const digestText = z.string().regex(/^sha256:[0-9a-f]{64}$/u);
const uint = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const cacheValue: z.ZodType<CacheValue> = z.lazy(() =>
  z.union([z.null(), z.boolean(), z.string(), z.number(), z.array(cacheValue), z.record(z.string(), cacheValue)]),
);
const producerSchema = z
  .object({
    id: z.string().min(1),
    version: z.string().min(1),
    implementationAssets: z.array(digestText.transform((value) => contentDigest({ value }))).min(1),
  })
  .strict();
const inputSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('content'),
      role: z.string().min(1),
      digest: digestText.transform((value) => contentDigest({ value })),
    })
    .strict(),
  z
    .object({
      kind: z.literal('action'),
      role: z.string().min(1),
      digest: digestText.transform((value) => actionDigest({ value })),
    })
    .strict(),
]);
/** Full operation families; callback entry points deliberately have no recipe. @internal */
export const operationCodecs = {
  'voxels.empty': 'vdb',
  'voxels.sphere': 'vdb',
  'voxels.capsule': 'vdb',
  'voxels.lattice': 'vdb',
  'voxels.mesh': 'vdb',
  'voxels.duplicate': 'vdb',
  'voxels.union': 'vdb',
  'voxels.intersection': 'vdb',
  'voxels.difference': 'vdb',
  'voxels.offset': 'vdb',
  'voxels.double-offset': 'vdb',
  'voxels.triple-offset': 'vdb',
  'voxels.render-mesh': 'vdb',
  'voxels.render-lattice': 'vdb',
  'voxels.smooth': 'vdb',
  'voxels.trim': 'vdb',
  'voxels.project-z-slice': 'vdb',
  'vdb.asset': 'vdb',
  'voxels.sign-equal': 'bool',
  'mesh.capture': 'mesh',
  'mesh.transform': 'mesh',
  'mesh.normals': 'layout',
  'mesh.uv': 'layout',
} as const;
const operationSchema = z.enum(
  Object.keys(operationCodecs) as [keyof typeof operationCodecs, ...Array<keyof typeof operationCodecs>],
);
const codecSchema = z
  .object({
    id: z.enum(['picogk.vdb-stream', 'picogk.indexed-mesh', 'picogk.bool', 'picogk.layout']),
    version: z.literal('2'),
  })
  .strict();
const actionSchema = z
  .object({
    schemaVersion: z.literal(1),
    namespace: z.literal(computeNamespace),
    producer: producerSchema,
    operation: operationSchema,
    inputs: z.array(inputSchema).max(4096),
    arguments: cacheValue,
    environment: cacheValue,
    codec: codecSchema,
  })
  .strict();
const f32 = z
  .string()
  .regex(/^[0-9a-f]{8}$/u)
  .refine((value) => {
    const view = new DataView(new ArrayBuffer(4));
    view.setUint32(0, Number.parseInt(value, 16), true);
    return Number.isFinite(view.getFloat32(0, true));
  }, 'Nonfinite float32 bits');
const pointBits = z.tuple([f32, f32, f32]);
const voxelArguments = z.object({ voxelSize: f32, narrowBand: uint }).strict();
const operationArguments = {
  'voxels.empty': voxelArguments,
  'voxels.sphere': voxelArguments.extend({ center: pointBits, radius: f32 }),
  'voxels.capsule': voxelArguments.extend({
    start: pointBits,
    end: pointBits,
    radiusStart: f32,
    radiusEnd: f32,
  }),
  'voxels.lattice': voxelArguments,
  'voxels.mesh': voxelArguments.extend({ radius: f32, shell: z.boolean() }),
  'vdb.asset': voxelArguments,
  'voxels.render-mesh': z.object({}).strict(),
  'voxels.render-lattice': z.object({}).strict(),
  'voxels.duplicate': z.object({}).strict(),
  'voxels.union': z.object({}).strict(),
  'voxels.intersection': z.object({}).strict(),
  'voxels.difference': z.object({}).strict(),
  'voxels.offset': z.object({ distance: f32 }).strict(),
  'voxels.double-offset': z.object({ first: f32, second: f32 }).strict(),
  'voxels.triple-offset': z.object({ distance: f32 }).strict(),
  'voxels.smooth': z.object({ distance: f32 }).strict(),
  'voxels.trim': z.object({ min: pointBits, max: pointBits }).strict(),
  'voxels.project-z-slice': z.object({ start: f32, end: f32 }).strict(),
  'voxels.sign-equal': z.object({}).strict(),
  'mesh.capture': z.object({}).strict(),
  'mesh.transform': z.discriminatedUnion('algorithm', [
    z
      .object({
        algorithm: z.literal('matrix'),
        matrix: z.array(f32).length(16),
      })
      .strict(),
    z
      .object({
        algorithm: z.literal('scale-offset'),
        offset: pointBits,
        scale: pointBits,
      })
      .strict(),
    z
      .object({
        algorithm: z.literal('mirror'),
        normal: pointBits,
        point: pointBits,
      })
      .strict(),
  ]),
  'mesh.normals': z
    .object({
      algorithm: z.literal('tau-vertex-normals-v3'),
      source: z.array(f32).length(16),
      baked: z.array(f32).length(16),
    })
    .strict(),
  'mesh.uv': z
    .object({
      algorithm: z.literal('tau-surface-coordinates-v1'),
      source: z.array(f32).length(16),
      baked: z.array(f32).length(16),
    })
    .strict(),
};
/**
 * Private semantic shape check; generation numbers never become persistent identities.
 * @param action - Private codec or lifecycle input.
 * @returns The validated result or owned lifecycle receipt.
 * @internal
 */
export const validateComputeAction = (action: ComputeAction): void => {
  const checked = actionSchema.parse(action);
  operationArguments[checked.operation].parse(checked.arguments);
  const noInput =
    checked.operation === 'voxels.empty' ||
    checked.operation === 'voxels.sphere' ||
    checked.operation === 'voxels.capsule';
  const binary = [
    'voxels.union',
    'voxels.intersection',
    'voxels.difference',
    'voxels.sign-equal',
    'voxels.render-mesh',
    'voxels.render-lattice',
  ].includes(checked.operation);
  const roles = noInput ? [] : binary ? ['left', 'right'] : ['source'];
  if (checked.inputs.length !== roles.length || checked.inputs.some((input, index) => input.role !== roles[index])) {
    throw new TypeError('Compute ordered operand identity mismatch.');
  }
  if (checked.codec.id !== codecFor[operationCodecs[checked.operation]]) {
    throw new TypeError('Compute operation codec mismatch.');
  }
};
const recordSchema = z
  .object({
    action: actionSchema,
    canonicalAction: z.string().refine((value) => new TextEncoder().encode(value).byteLength <= 262_144),
    actionDigest: digestText.transform((value) => actionDigest({ value })),
    contentDigest: digestText.transform((value) => contentDigest({ value })),
    filename: z.string().regex(/^[0-9a-f]{64}\.(?:vdb|mesh|bool|layout)$/u),
    size: uint,
    nativeBytes: uint,
    computeDuration: z.number().nonnegative(),
    mediaType: z.string(),
    determinism: z.enum(['byte-exact', 'equivalent']),
  })
  .strict();
/** Record names have no authority; session ownership is supplied separately by the transport. @internal */
export const manifestSchema = z
  .object({
    version: z.literal(1),
    generation: uint,
    producer: producerSchema,
    environment: cacheValue,
    producerCanonical: boundedFragment,
    environmentCanonical: boundedFragment,
    records: z.array(recordSchema).max(4096),
  })
  .strict();

/** A caller-provided path never supplies the session root or publication authority. @internal */
export type BridgeContext = {
  readonly sessionRoot: string;
  readonly generation: number;
  readonly producer: ComputeAction['producer'];
  readonly environment: CacheValue;
  readonly maxEncodedBytes: number;
  readonly maxNativeBytes: number;
  readonly signal: AbortSignal;
};

const hash = (bytes: Uint8Array<ArrayBuffer>): string => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const sameValue = (left: CacheValue, right: CacheValue): boolean =>
  canonicalizeCacheValue({ value: left }) === canonicalizeCacheValue({ value: right });

/**
 * Derive once from actual pinned identities; callers cannot supply canonical authority.
 * @internal
 * @param input - Private codec or lifecycle input.
 * @returns The validated result or owned lifecycle receipt.
 */
export const createCanonicalFragments = (input: {
  readonly producer: ComputeAction['producer'];
  readonly environment: CacheValue;
}): {
  readonly producerCanonical: string;
  readonly environmentCanonical: string;
} => {
  const producer = producerSchema.parse(input.producer);
  const fragments = {
    producerCanonical: canonicalizeCacheValue({ value: producer }),
    environmentCanonical: canonicalizeCacheValue({ value: input.environment }),
  };
  boundedFragment.parse(fragments.producerCanonical);
  boundedFragment.parse(fragments.environmentCanonical);
  return fragments;
};

/**
 * Used by request and result owners against their actual runtime identity, never caller authority.
 * @param input - Private codec or lifecycle input.
 * @returns The validated result or owned lifecycle receipt.
 * @internal
 */
export const validateCanonicalFragments = (input: {
  readonly producer: ComputeAction['producer'];
  readonly environment: CacheValue;
  readonly producerCanonical: string;
  readonly environmentCanonical: string;
}): void => {
  const expected = createCanonicalFragments(input);
  if (
    input.producerCanonical !== expected.producerCanonical ||
    input.environmentCanonical !== expected.environmentCanonical
  ) {
    throw new TypeError('Compute canonical fragment identity mismatch.');
  }
};
const mediaFor = {
  vdb: 'application/vnd.picogk.vdb',
  mesh: 'application/vnd.picogk.indexed-mesh',
  bool: 'application/vnd.picogk.bool',
  layout: 'application/vnd.picogk.layout',
} as const;
const codecFor = {
  vdb: 'picogk.vdb-stream',
  mesh: 'picogk.indexed-mesh',
  bool: 'picogk.bool',
  layout: 'picogk.layout',
} as const;

/**
 * Encode float32 bits rather than JSON rounding or -0 normalization.
 * @param value - Private codec or lifecycle input.
 * @returns The validated result or owned lifecycle receipt.
 * @internal
 */
export const floatBits = (value: number): string => {
  if (!Number.isFinite(value) || !Number.isFinite(Math.fround(value))) {
    throw new TypeError('Expected finite float32.');
  }
  const data = new DataView(new ArrayBuffer(4));
  data.setFloat32(0, value, true);
  return data.getUint32(0, true).toString(16).padStart(8, '0');
};

/**
 * Validate indexed geometry without changing topology, seam splits or affine placement.
 * @internal
 * @param bytes - Private codec or lifecycle input.
 * @returns The validated result or owned lifecycle receipt.
 */
export const validateMeshBytes = (bytes: Uint8Array<ArrayBuffer>): void => {
  // Existing immutable actual positions, optional prototype positions and one index table.
  if (bytes.byteLength < 84) {
    throw new TypeError('Truncated indexed mesh.');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== 0x31_50_4b_50 || view.getUint32(4, true) !== 1) {
    throw new TypeError('Indexed mesh codec version mismatch.');
  }
  const vertices = view.getUint32(8, true),
    indices = view.getUint32(12, true),
    placed = view.getUint32(16, true);
  if (vertices > Math.floor(0x7f_ff_ff_ff / 3) || indices > 0x7f_ff_ff_ff || placed > 1 || indices % 3 !== 0) {
    throw new TypeError('Invalid indexed mesh layout.');
  }
  const indexOffset = 84 + vertices * 12 * (placed ? 2 : 1),
    length = indexOffset + indices * 4;
  if (!Number.isSafeInteger(length) || length !== bytes.byteLength) {
    throw new TypeError('Indexed mesh length mismatch.');
  }
  for (let offset = 20; offset < indexOffset; offset += 4) {
    if (!Number.isFinite(view.getFloat32(offset, true))) {
      throw new TypeError('Nonfinite indexed mesh value.');
    }
  }
  for (let axis = 0; axis < 16; axis++) {
    const value = view.getFloat32(20 + axis * 4, true);
    if (([3, 7, 11].includes(axis) && value !== 0) || (axis === 15 && value !== 1)) {
      throw new TypeError('Invalid indexed mesh affine matrix.');
    }
    if (placed === 0 && view.getUint32(20 + axis * 4, true) !== (axis % 5 === 0 ? 0x3f_80_00_00 : 0)) {
      throw new TypeError('Invalid unplaced indexed mesh matrix.');
    }
  }
  for (let offset = indexOffset; offset < length; offset += 4) {
    if (view.getUint32(offset, true) >= vertices) {
      throw new TypeError('Indexed mesh index out of range.');
    }
  }
};

/**
 * Bounded exact existing-layout record; worker additionally checks Sources against its immutable input.
 * @internal
 * @param bytes - Private codec or lifecycle input.
 * @returns The validated result or owned lifecycle receipt.
 */
export const validateLayoutBytes = (bytes: Uint8Array<ArrayBuffer>): void => {
  if (bytes.length < 64 || new TextDecoder().decode(bytes.subarray(0, 8)) !== 'PKLAY001') {
    throw new TypeError('Layout codec version/length.');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength),
    flags = view.getUint32(12, true);
  if (view.getUint32(8, true) !== 1 || flags > 1) {
    throw new TypeError('Layout codec version/flags.');
  }
  const lengths = Array.from({ length: 6 }, (_, index) => view.getUint32(16 + index * 4, true));
  const [positions = 0, normals = 0, indices = 0, sources = 0, uv = 0, tangents = 0] = lengths;
  if (
    lengths.some((length) => length > 0x7f_ff_ff_ff) ||
    64 + lengths.reduce((total, length) => total + length, 0) * 4 !== bytes.length ||
    positions % 3 !== 0 ||
    normals !== positions ||
    indices % 3 !== 0 ||
    (sources !== 0 && sources !== positions / 3) ||
    (uv !== 0 && uv !== (positions / 3) * 2) ||
    (tangents !== 0 && tangents !== (positions / 3) * 4)
  ) {
    throw new TypeError('Layout codec array shape.');
  }
  for (let field = 0; field < 6; field++) {
    const offset = 40 + field * 4;
    if (flags === 0 && view.getUint32(offset, true) !== 0) {
      throw new TypeError('Layout unused stability.');
    }
    if (
      flags === 1 &&
      (field === 4
        ? view.getInt32(offset, true) < 0
        : Number.isNaN(view.getFloat32(offset, true)) || view.getFloat32(offset, true) < 0)
    ) {
      throw new TypeError('Layout invalid stability.');
    }
  }
  let offset = 64;
  for (let array = 0; array < 6; array++) {
    for (let index = 0; index < (lengths[array] ?? 0); index++, offset += 4) {
      if (
        array === 2
          ? view.getUint32(offset, true) >= positions / 3
          : array === 3
            ? view.getUint32(offset, true) > 0x7f_ff_ff_ff
            : !Number.isFinite(view.getFloat32(offset, true))
      ) {
        throw new TypeError('Layout invalid geometry/topology.');
      }
    }
  }
};

const readConfined = async (input: {
  readonly root: string;
  readonly filename: string;
  readonly size: number;
  readonly signal: AbortSignal;
}): Promise<Uint8Array<ArrayBuffer>> => {
  input.signal.throwIfAborted();
  if (!/^[0-9a-f]{64}\.(?:vdb|mesh|bool|layout)$/u.test(input.filename)) {
    throw new TypeError('Unconfined compute filename.');
  }
  const path = join(input.root, input.filename);
  const before = await lstat(path);
  if (!before.isFile() || before.isSymbolicLink() || before.size !== input.size) {
    throw new TypeError('Compute record file size/type mismatch.');
  }
  // Existing session artifact directory is exclusively owned; realpath also rejects foreign symlinks.
  const actual = await realpath(path);
  if (dirname(actual) !== input.root) {
    throw new TypeError('Foreign-session compute file.');
  }
  const file = await open(actual, 'r');
  try {
    const stat = await file.stat();
    if (stat.dev !== before.dev || stat.ino !== before.ino || stat.size !== input.size) {
      throw new TypeError('Compute file changed during open.');
    }
    const bytes = new Uint8Array(input.size);
    let offset = 0;
    while (offset < bytes.length) {
      input.signal.throwIfAborted();

      // oxlint-disable-next-line no-await-in-loop -- Fill one bounded buffer with partial reads and cancellation checks.
      const read = await file.read(bytes, offset, bytes.length - offset, offset);
      if (read.bytesRead === 0) {
        throw new TypeError('Truncated compute record.');
      }
      offset += read.bytesRead;
    }
    const after = await file.stat();
    if (after.size !== input.size) {
      throw new TypeError('Compute file changed during read.');
    }
    input.signal.throwIfAborted();
    return bytes;
  } finally {
    await file.close();
  }
};

/**
 * Strict all-or-nothing candidate validation; callers may bypass invalid disposable preload.
 * @internal
 * @param input - Private codec or lifecycle input.
 * @returns The validated result or owned lifecycle receipt.
 */
export const readComputeManifest = async (input: {
  readonly context: BridgeContext;
  readonly path: string;
}): Promise<
  ReadonlyArray<
    ComputeStoreEntry & {
      readonly nativeBytes: number;
      readonly computeDuration: number;
    }
  >
> => {
  const { context } = input;
  context.signal.throwIfAborted();
  for (const value of [context.generation, context.maxEncodedBytes, context.maxNativeBytes]) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new TypeError('Invalid compute budget/generation.');
    }
  }
  const root = await realpath(context.sessionRoot);
  const actual = await realpath(input.path);
  const suffix = relative(root, actual);
  if (!suffix || suffix.startsWith(`..${sep}`) || suffix === '..' || dirname(actual) !== root) {
    throw new TypeError('Foreign-session manifest.');
  }
  const stat = await lstat(input.path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > maximumManifestBytes) {
    throw new TypeError('Invalid compute manifest file.');
  }
  const file = await open(actual, 'r');
  let raw: string;
  try {
    const bytes = new Uint8Array(stat.size);

    const read = await file.read(bytes, 0, bytes.length, 0);
    if (read.bytesRead !== bytes.length) {
      throw new TypeError('Truncated compute manifest.');
    }
    raw = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } finally {
    await file.close();
  }
  const manifest = manifestSchema.parse(JSON.parse(raw));
  if (
    manifest.generation !== context.generation ||
    !sameValue(manifest.producer, context.producer) ||
    !sameValue(manifest.environment, context.environment)
  ) {
    throw new TypeError('Compute manifest identity mismatch.');
  }
  validateCanonicalFragments({
    producer: context.producer,
    environment: context.environment,
    producerCanonical: manifest.producerCanonical,
    environmentCanonical: manifest.environmentCanonical,
  });
  const seen = new Set<string>();
  let encoded = 0;
  let native = 0;
  for (const record of manifest.records) {
    validateComputeAction(record.action);
    if (seen.has(record.actionDigest)) {
      throw new TypeError('Duplicate/colliding compute action.');
    }
    seen.add(record.actionDigest);
    encoded += record.size;
    native += record.nativeBytes;
    if (
      !Number.isSafeInteger(encoded) ||
      !Number.isSafeInteger(native) ||
      encoded > context.maxEncodedBytes ||
      native > context.maxNativeBytes
    ) {
      throw new TypeError('Compute manifest exceeds byte budget.');
    }
    const family = operationCodecs[record.action.operation];
    if (
      !sameValue(record.action.producer, context.producer) ||
      !sameValue(record.action.environment, context.environment) ||
      record.action.codec.id !== codecFor[family] ||
      record.mediaType !== mediaFor[family] ||
      record.filename !== `${record.contentDigest.slice(7)}.${family}` ||
      record.determinism !== (family === 'vdb' ? 'equivalent' : 'byte-exact')
    ) {
      throw new TypeError('Compute action/codec identity mismatch.');
    }
    if (
      record.canonicalAction !== canonicalizeComputeAction(record.action) ||
      hash(new TextEncoder().encode(record.canonicalAction)) !== record.actionDigest
    ) {
      throw new TypeError('Compute action digest mismatch.');
    }
  }
  const result: Array<ComputeStoreEntry & { nativeBytes: number; computeDuration: number }> = [];
  for (const record of manifest.records) {
    // oxlint-disable-next-line no-await-in-loop -- Read one bounded record at a time to preserve the preflight allocation budget.
    const bytes = await readConfined({
      root,
      filename: record.filename,
      size: record.size,
      signal: context.signal,
    });
    if (hash(bytes) !== record.contentDigest) {
      throw new TypeError('Compute content digest mismatch.');
    }
    const family = operationCodecs[record.action.operation];
    const { body, nativeAllowance } = decodeStoredEnvelope({
      bytes,
      family,
      maximumEncoded: context.maxEncodedBytes,
      maximumNative: context.maxNativeBytes,
    });
    if (nativeAllowance !== record.nativeBytes) {
      throw new TypeError('Compute native allowance mismatch.');
    }
    if (family === 'mesh') {
      validateMeshBytes(body);
    }
    if (family === 'layout') {
      validateLayoutBytes(body);
    }
    if (family === 'bool' && (body.length !== 1 || (body[0] !== 0 && body[0] !== 1))) {
      throw new TypeError('Invalid bool codec.');
    }
    result.push({
      action: record.action,
      actionDigest: record.actionDigest,
      contentDigest: record.contentDigest,
      mediaType: record.mediaType,
      determinism: record.determinism,
      bytes,
      nativeBytes: record.nativeBytes,
      computeDuration: record.computeDuration,
    });
  }
  context.signal.throwIfAborted();
  return result;
};
