import { digestContent } from '@taucad/cache-core';
import { canonicalJson } from '@taucad/utils/hash';
import { assertRootedPath } from '@taucad/utils/path';
import { isNotFoundError } from '#filesystem/filesystem-errors.js';
import { readPublishedPartAsset } from '#framework/published-part-store.js';
import {
  readAuthoredAssembly,
  resolveAuthoredAssembly,
  resolvePinnedAssembly,
} from '#framework/published-assembly-graph.js';
import type { KernelFileSystem } from '#types/runtime-kernel.types.js';
import { publishedPartsRootSchema } from '#types/runtime-assembly.schemas.js';
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

const readCurrent = async (
  filesystem: KernelFileSystem,
  path: string,
): Promise<{
  bytes: Uint8Array<ArrayBuffer> | undefined;
  generation: number;
}> => {
  try {
    const bytes = await filesystem.readFile(path);
    const root = publishedPartsRootSchema.parse(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)));
    return { bytes, generation: root.generation };
  } catch (error) {
    if (isNotFoundError(error)) {
      return { bytes: undefined, generation: 0 };
    }
    throw error;
  }
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
  const bytes = await filesystem.readFile(path);
  if (bytes.byteLength !== asset.byteLength || (await digestContent({ bytes })) !== asset.digest) {
    throw new Error(`Published assembly root does not match its pinned digest and length: ${path}`);
  }
  return publishedPartsRootSchema.parse(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)));
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
  const bytes = new TextEncoder().encode(canonicalJson(publishedPartsRootSchema.parse(root)));
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
