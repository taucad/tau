import { digestContent } from '@taucad/cache-core';
import { canonicalJson } from '@taucad/utils/hash';
import { assertRootedPath, joinRelativePath } from '@taucad/utils/path';
import { z } from 'zod';
import { isNotFoundError } from '#filesystem/filesystem-errors.js';
import { readPublishedPartAsset, writePublishedImmutableAsset } from '#framework/published-part-store.js';
import {
  readAuthoredAssembly,
  resolveAuthoredAssembly,
  resolvePinnedAssembly,
} from '#framework/published-assembly-graph.js';
import type { KernelFileSystem } from '#types/runtime-kernel.types.js';
import { publishedPartAssetSchema, publishedPartsRootSchema } from '#types/runtime-assembly.schemas.js';
import type {
  AuthoredAssemblySource,
  AuthoredPartRecipe,
  AssemblyDisplayProjector,
  PublishedPartReference,
  PublishedPartOccurrence,
  PreparedPublishedPart,
  PublishedPartsRoot,
  PublishedPartsRootOutcome,
  PublishedAuthoredRootReceipt,
  PublishedAssemblyRootSnapshot,
  PublishedPartAsset,
  PublishedAssemblyAdmission,
} from '#types/runtime-assembly.types.js';

// The logical v1 root is stored in bounded immutable pieces; only this small v2 pointer is mutable.
const chunkBytes = 1_048_576;
const maximumPointerBytes = 4096;
// The selected 100k-occurrence corpus is 10,704,060 canonical bytes (11 chunks).
// 32 chunks bound the allocation while leaving room for longer real part/occurrence names.
const maximumChunks = 32;
const maximumRootBytes = chunkBytes * maximumChunks;
const pointerSchema = z
  .object({ schemaVersion: z.literal(2), generation: z.number().int().positive(), manifest: publishedPartAssetSchema })
  .strict();
const manifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    content: z
      .object({ digest: publishedPartAssetSchema.shape.digest, byteLength: z.number().int().positive() })
      .strict(),
    chunks: z.array(publishedPartAssetSchema).min(1).max(maximumChunks),
  })
  .strict();
type RootPointer = z.infer<typeof pointerSchema>;

const storagePath = (rootPath: string, digest: PublishedPartAsset['digest'], extension: string): string => {
  const slash = rootPath.lastIndexOf('/');
  const parent = slash === -1 ? '' : rootPath.slice(0, slash);
  return joinRelativePath(parent, `roots/sha256/${digest.slice('sha256:'.length)}.${extension}`);
};

const readPinnedBytes = async (
  filesystem: KernelFileSystem,
  asset: PublishedPartAsset,
): Promise<Uint8Array<ArrayBuffer>> => {
  const bytes = await filesystem.readFile(asset.path);
  if (bytes.byteLength !== asset.byteLength || (await digestContent({ bytes })) !== asset.digest) {
    throw new Error(`Published assembly content does not match its pinned digest and length: ${asset.path}`);
  }
  return bytes;
};

const decodeJson = (bytes: Uint8Array<ArrayBuffer>): unknown =>
  JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));

const readContent = async (
  filesystem: KernelFileSystem,
  path: string,
  pointer: RootPointer,
): Promise<PublishedPartsRoot> => {
  if (
    pointer.manifest.path !== storagePath(path, pointer.manifest.digest, 'json') ||
    pointer.manifest.byteLength > chunkBytes
  ) {
    throw new Error('Published assembly manifest is outside its bounded root closure.');
  }
  const manifest = manifestSchema.parse(decodeJson(await readPinnedBytes(filesystem, pointer.manifest)));
  if (
    manifest.content.byteLength > maximumRootBytes ||
    manifest.chunks.length !== Math.ceil(manifest.content.byteLength / chunkBytes)
  ) {
    throw new Error('Published assembly content exceeds its bounded root closure.');
  }
  const content = new Uint8Array(manifest.content.byteLength);
  let offset = 0;
  for (const chunk of manifest.chunks) {
    const expectedLength = Math.min(chunkBytes, manifest.content.byteLength - offset);
    if (chunk.path !== storagePath(path, chunk.digest, 'chunk') || chunk.byteLength !== expectedLength) {
      throw new Error('Published assembly chunk order or length is invalid.');
    }
    // Read pinned chunks serially to bound outstanding buffers.
    content.set(await readPinnedBytes(filesystem, chunk), offset);
    offset += expectedLength;
  }
  if ((await digestContent({ bytes: content })) !== manifest.content.digest) {
    throw new Error('Published assembly reconstructed content has a mismatched digest.');
  }
  const root = publishedPartsRootSchema.parse(decodeJson(content));
  if (root.generation !== pointer.generation) {
    throw new Error('Published assembly generation differs from its checked pointer.');
  }
  return root;
};

const readCurrent = async (
  filesystem: KernelFileSystem,
  path: string,
): Promise<{
  bytes: Uint8Array<ArrayBuffer> | undefined;
  generation: number;
}> => {
  let bytes: Uint8Array<ArrayBuffer>;
  try {
    bytes = await filesystem.readFile(path);
  } catch (error) {
    if (isNotFoundError(error)) {
      return { bytes: undefined, generation: 0 };
    }
    throw error;
  }
  if (bytes.byteLength > maximumPointerBytes) {
    throw new Error('Published assembly pointer exceeds its bounded metadata limit.');
  }
  const pointer = pointerSchema.parse(decodeJson(bytes));
  await readContent(filesystem, path, pointer);
  return { bytes, generation: pointer.generation };
};

/** Re-read one shared project root after a caller loses its commit receipt. @internal */
export const readPublishedAssemblyRoot = async (
  filesystem: KernelFileSystem,
  publicationPath: string,
): Promise<PublishedAssemblyRootSnapshot> => {
  const path = assertRootedPath(publicationPath);
  if (path.length === 0) {
    throw new TypeError('Published root path must name a file.');
  }
  const { bytes, generation } = await readCurrent(filesystem, path);
  if (!bytes) {
    return { status: 'absent' };
  }
  return {
    status: 'present',
    root: { path, digest: await digestContent({ bytes }), byteLength: bytes.byteLength },
    generation,
  };
};

/** Re-admit an immutable root pin, including its byte length and digest, before following any mutable path. @internal */
export const readPinnedPublishedAssemblyRoot = async (
  filesystem: KernelFileSystem,
  asset: PublishedPartAsset,
): Promise<PublishedPartsRoot> => {
  const path = assertRootedPath(asset.path);
  if (path.length === 0) {
    throw new TypeError('Published root pin must name a file.');
  }
  const bytes = await readPinnedBytes(filesystem, asset);
  if (bytes.byteLength > maximumPointerBytes) {
    throw new Error('Published assembly pointer exceeds its bounded metadata limit.');
  }
  return readContent(filesystem, path, pointerSchema.parse(decodeJson(bytes)));
};

/** Re-admit one pinned root and all required display assets without reading authored source. @internal */
export const admitPublishedAssemblyRoot = async (
  filesystem: KernelFileSystem,
  asset: PublishedPartAsset,
  admitDisplay: AssemblyDisplayProjector,
): Promise<PublishedAssemblyAdmission> => {
  const root = await readPinnedPublishedAssemblyRoot(filesystem, asset);
  if (Object.keys(root.parts).length === 0) {
    throw new Error('A published root requires at least one pinned part.');
  }
  const admitted = await resolvePinnedAssembly(filesystem, {
    schemaVersion: 1,
    parts: Object.fromEntries(Object.entries(root.parts).map(([name, publishedPart]) => [name, { publishedPart }])),
    occurrences: root.occurrences,
  });
  await projectAdmittedDisplay(filesystem, admitted, admitDisplay);
  return {
    publication: { schemaVersion: 1, parts: admitted.records, occurrences: admitted.occurrences },
    partRecords: admitted.parts,
  };
};

const projectAdmittedDisplay = async (
  filesystem: KernelFileSystem,
  admitted: Awaited<ReturnType<typeof resolvePinnedAssembly>>,
  projector: AssemblyDisplayProjector,
): Promise<void> => {
  await projector({
    purpose: 'admission',
    records: admitted.records,
    occurrences: admitted.occurrences,
    readAsset: async (part, asset) => {
      const record = admitted.records[part];
      const reference = admitted.parts[part];
      if (
        !record ||
        !reference ||
        !Object.values(record.variants).some(
          (variant) =>
            variant.glb.digest === asset.digest &&
            variant.glb.path === asset.path &&
            variant.glb.byteLength === asset.byteLength,
        )
      ) {
        throw new Error('Display projector requested an asset outside the admitted closure.');
      }
      return readPublishedPartAsset(filesystem, reference, asset.digest);
    },
  });
};

/**
 * Admit pinned parts, then advance one host-authorized root using its captured
 * byte precondition. The checked filesystem authority owns the shared fence.
 * This internal root is not the public assembly API.
 *
 * @param filesystem - Project-rooted checked authority.
 * @param input - Mutable root path and host-issued pinned part references.
 * @param signal - Caller cancellation, checked before the commit is dispatched.
 * @returns Published generation or a stale-write outcome.
 * @internal
 */
export const publishPartsRoot = async (
  filesystem: KernelFileSystem,
  input: {
    path: string;
    parts: Readonly<Record<string, PublishedPartReference>>;
    occurrences?: readonly PublishedPartOccurrence[];
  },
  signal?: AbortSignal,
): Promise<PublishedPartsRootOutcome> => {
  const path = assertRootedPath(input.path);
  const snapshot = await readCurrent(filesystem, path);
  return commitPartsRoot(filesystem, input, { snapshot, signal });
};

const commitPartsRoot = async (
  filesystem: KernelFileSystem,
  input: {
    path: string;
    parts: Readonly<Record<string, PublishedPartReference>>;
    occurrences?: readonly PublishedPartOccurrence[];
  },
  options: {
    snapshot: Awaited<ReturnType<typeof readCurrent>>;
    signal?: AbortSignal;
    publicationWriter?: Pick<KernelFileSystem, 'ensureDir' | 'writeFileChecked'>;
  },
): Promise<PublishedPartsRootOutcome> => {
  const { snapshot, signal } = options;
  const writer = options.publicationWriter ?? filesystem;
  const checkedWrite = writer.writeFileChecked;
  if (!checkedWrite) {
    throw new Error('Checked publication authority is unavailable for this runtime filesystem.');
  }
  const path = assertRootedPath(input.path);
  if (path.length === 0) {
    throw new TypeError('Published root path must name a file.');
  }
  const { bytes: previous, generation } = snapshot;
  if (Object.keys(input.parts).length === 0) {
    throw new Error('A published root requires at least one pinned part.');
  }
  const admitted = await resolvePinnedAssembly(filesystem, {
    schemaVersion: 1,
    parts: Object.fromEntries(Object.entries(input.parts).map(([name, publishedPart]) => [name, { publishedPart }])),
    occurrences: input.occurrences ?? [],
  });
  signal?.throwIfAborted();
  const root: PublishedPartsRoot = {
    schemaVersion: 1,
    generation: generation + 1,
    parts: admitted.parts,
    occurrences: admitted.occurrences,
  };
  const content = new TextEncoder().encode(canonicalJson(publishedPartsRootSchema.parse(root)));
  if (content.byteLength > maximumRootBytes) {
    throw new Error('Published assembly root exceeds its bounded content limit.');
  }
  const chunks: PublishedPartAsset[] = [];
  for (let offset = 0; offset < content.byteLength; offset += chunkBytes) {
    const bytes = content.slice(offset, offset + chunkBytes);
    // Admit each immutable chunk before the manifest and root pointer.
    const digest = await digestContent({ bytes });
    const asset = { path: storagePath(path, digest, 'chunk'), digest, byteLength: bytes.byteLength };
    // Bounded checked writes preserve content-before-pointer order.
    await writePublishedImmutableAsset(filesystem, { asset, bytes, publicationWriter: writer });
    signal?.throwIfAborted();
    chunks.push(asset);
  }
  const manifestBytes = new TextEncoder().encode(
    canonicalJson(
      manifestSchema.parse({
        schemaVersion: 1,
        content: { digest: await digestContent({ bytes: content }), byteLength: content.byteLength },
        chunks,
      }),
    ),
  );
  if (manifestBytes.byteLength > chunkBytes) {
    throw new Error('Published assembly manifest exceeds its bounded content limit.');
  }
  const manifestDigest = await digestContent({ bytes: manifestBytes });
  const manifest = {
    path: storagePath(path, manifestDigest, 'json'),
    digest: manifestDigest,
    byteLength: manifestBytes.byteLength,
  };
  await writePublishedImmutableAsset(filesystem, { asset: manifest, bytes: manifestBytes, publicationWriter: writer });
  signal?.throwIfAborted();
  const bytes = new TextEncoder().encode(
    canonicalJson(pointerSchema.parse({ schemaVersion: 2, generation: root.generation, manifest })),
  );
  if (bytes.byteLength > maximumPointerBytes) {
    throw new Error('Published assembly pointer exceeds its bounded metadata limit.');
  }
  const slash = path.lastIndexOf('/');
  if (slash !== -1) {
    await writer.ensureDir(path.slice(0, slash));
  }
  signal?.throwIfAborted();
  // oxlint-disable-next-line typescript/no-restricted-types -- Checked writes use null as the wire-safe absent-file sentinel.
  const result = await checkedWrite({ path, data: bytes, preconditions: [{ path, expected: previous ?? null }] });
  if (result.status === 'conflict') {
    return { status: 'superseded' };
  }
  const digest = await digestContent({ bytes });
  return {
    status: 'published',
    root: { path, digest, byteLength: bytes.byteLength },
    generation: root.generation,
  };
};

/** Resolve an authored project file and CAS its root against the pre-producer snapshot. @internal */
export const publishAuthoredAssemblyRoot = async (
  filesystem: KernelFileSystem,
  input: { authoredPath: string; publicationPath: string },
  options: {
    publicationWriter?: Pick<KernelFileSystem, 'ensureDir' | 'writeFileChecked'>;
    produce: (sources: Readonly<Record<string, AuthoredAssemblySource>>) => Promise<PreparedPublishedPart>;
    /** Validate the resolved display closure before the checked root write. */
    admitDisplay?: AssemblyDisplayProjector;
    /** Retain the exact authored bytes used by this transition for a live host binding. */
    onReadAuthored?: (
      authored: Awaited<ReturnType<typeof readAuthoredAssembly>>,
      bytes: Uint8Array<ArrayBuffer>,
    ) => void;
    reusePart?: (name: string, recipe: AuthoredPartRecipe) => Promise<PublishedPartReference | undefined>;
    preflightSourceOwnership?: (
      authored: Awaited<ReturnType<typeof readAuthoredAssembly>>,
      inlineFiles: ReadonlySet<string>,
    ) => Promise<void>;
    verifyBeforeCommit?: (
      authored: Awaited<ReturnType<typeof readAuthoredAssembly>>,
      resolved: Awaited<ReturnType<typeof resolveAuthoredAssembly>>,
    ) => Promise<void>;
    signal?: AbortSignal;
  },
): Promise<PublishedAuthoredRootReceipt> => {
  const { produce, admitDisplay, onReadAuthored, reusePart, preflightSourceOwnership, verifyBeforeCommit, signal } =
    options;
  if (!admitDisplay) {
    throw new Error('Assembly display admission is unavailable on this host.');
  }
  if (!(options.publicationWriter ?? filesystem).writeFileChecked) {
    throw new Error('Checked publication authority is unavailable for this runtime filesystem.');
  }
  const path = assertRootedPath(input.publicationPath);
  if (path.length === 0) {
    throw new TypeError('Published root path must name a file.');
  }
  if (path === assertRootedPath(input.authoredPath)) {
    return {
      outcome: {
        status: 'invalid',
        issues: [
          {
            code: 'SCENE_REFERENCE_INVALID',
            path: input.authoredPath,
            message: 'Authored assembly and published root must use different files.',
            recovery: 'Choose a separate publication path and publish again.',
          },
        ],
      },
    };
  }
  const snapshot = await readCurrent(filesystem, path);
  signal?.throwIfAborted();
  let resolved: Awaited<ReturnType<typeof resolveAuthoredAssembly>>;
  let authored: Awaited<ReturnType<typeof readAuthoredAssembly>>;
  try {
    authored = await readAuthoredAssembly(filesystem, input.authoredPath, onReadAuthored);
    const authoredPath = assertRootedPath(input.authoredPath);
    const inlineFiles = new Set<string>();
    const fileBackedSources = new Set<string>();
    for (const recipe of Object.values(authored.parts)) {
      if (recipe.publishedPart) {
        continue;
      }
      for (const source of [recipe.source, ...Object.values(recipe.variants ?? {}).map((variant) => variant.source)]) {
        if (source.path !== undefined) {
          const candidate = assertRootedPath(source.path);
          if (candidate === path || candidate === authoredPath) {
            throw new TypeError(`Source file ${candidate} cannot be an assembly document or published root.`);
          }
          fileBackedSources.add(candidate);
        }
        if (source.files === undefined) {
          continue;
        }
        for (const file of Object.keys(source.files)) {
          const candidate = assertRootedPath(file);
          if (candidate === path || candidate === authoredPath) {
            throw new TypeError(
              `Inline source file ${candidate} would overwrite an assembly document or published root.`,
            );
          }
          inlineFiles.add(candidate);
        }
      }
    }
    for (const candidate of inlineFiles) {
      if (fileBackedSources.has(candidate)) {
        throw new TypeError(`Source file ${candidate} is both inline and file-backed in one assembly.`);
      }
    }
    await preflightSourceOwnership?.(authored, inlineFiles);
    resolved = await resolveAuthoredAssembly(filesystem, authored, { produce, reusePart });
    for (const [name, recipe] of Object.entries(authored.parts)) {
      if (recipe.publishedPart) {
        continue;
      }
      const sources = {
        default: recipe.source,
        ...Object.fromEntries(Object.entries(recipe.variants ?? {}).map(([variant, value]) => [variant, value.source])),
      };
      for (const [variant, source] of Object.entries(sources)) {
        if (source.path === undefined) {
          continue;
        }
        for (const file of Object.keys(resolved.records[name]?.variants[variant]?.source.files ?? {})) {
          if (inlineFiles.has(assertRootedPath(file))) {
            throw new TypeError(`File-backed source ${name}/${variant} depends on inline source file ${file}.`);
          }
        }
      }
    }
  } catch (error) {
    signal?.throwIfAborted();
    return {
      outcome: {
        status: 'invalid',
        issues: [
          {
            code: 'SCENE_REFERENCE_INVALID',
            path: input.authoredPath,
            message: error instanceof Error ? error.message : String(error),
            recovery: 'Repair the authored assembly, source, or pinned part and publish again.',
          },
        ],
      },
    };
  }
  try {
    await projectAdmittedDisplay(filesystem, resolved, admitDisplay);
  } catch (error) {
    signal?.throwIfAborted();
    return {
      outcome: {
        status: 'invalid',
        issues: [
          {
            code: 'SCENE_DISPLAY_INVALID',
            path: input.publicationPath,
            message: error instanceof Error ? error.message : String(error),
            recovery: 'Repair the required display GLB and publish again.',
          },
        ],
      },
    };
  }
  try {
    await verifyBeforeCommit?.(authored, resolved);
  } catch (error) {
    signal?.throwIfAborted();
    return {
      outcome: {
        status: 'invalid',
        issues: [
          {
            code: 'SCENE_REFERENCE_INVALID',
            path: input.authoredPath,
            message: error instanceof Error ? error.message : String(error),
            recovery: 'Repair the changed authored or source closure and publish again.',
          },
        ],
      },
    };
  }
  signal?.throwIfAborted();
  const outcome = await commitPartsRoot(
    filesystem,
    {
      path,
      parts: resolved.parts,
      occurrences: resolved.occurrences,
    },
    { snapshot, signal, publicationWriter: options.publicationWriter },
  );
  return outcome.status === 'published'
    ? {
        outcome,
        partRecords: resolved.parts,
        publication: { schemaVersion: 1, parts: resolved.records, occurrences: resolved.occurrences },
      }
    : { outcome };
};
