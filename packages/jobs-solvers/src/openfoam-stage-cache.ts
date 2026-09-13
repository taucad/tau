import { chmod, lstat, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative, sep } from 'node:path';

import { contentDigest, digestContent } from '@taucad/cache-core';
import type {
  ActionDigest,
  CacheCodec,
  ComputeAction,
  ComputeEvaluationResult,
  ComputeReuseService,
  ContentDigest,
} from '@taucad/cache-core';

import type { JobInputSnapshot } from '@taucad/jobs';

import type { OpenFoamSolverVersion } from '#openfoam-definition.js';

const archiveMagic = new TextEncoder().encode('TAUCASE1');
const archiveHeaderBytes = archiveMagic.byteLength + 4;
const entryHeaderBytes = 1 + 4 + 4 + 8;
const maximumArchiveBytes = 512 * 1024 * 1024;
const openFoamProviderVersion = '1.1.0';

/** Docker policy shared by execution and its deterministic action identity. @internal */
export const openFoamContainerPolicy = Object.freeze({
  executable: 'docker',
  network: 'none',
  memory: '8g',
  processLimit: 512,
  readOnly: true,
  capabilitiesDrop: ['ALL'] as const,
  securityOptions: ['no-new-privileges'] as const,
  temporaryFilesystems: ['/tmp:rw,noexec,nosuid,nodev,size=512m'] as const,
  workdir: '/case',
  home: '/tmp',
  entrypoint: '/openfoam/run',
  casePath: '/case',
});

/** Host user mapping applied to the OpenFOAM container. @internal */
export type OpenFoamContainerUser =
  | { readonly mode: 'host'; readonly uid: number; readonly gid: number }
  | { readonly mode: 'container-default' };

/** Resolve the exact user mapping used by Docker on this host. @internal */
export const resolveOpenFoamContainerUser = (): OpenFoamContainerUser =>
  process.getuid === undefined || process.getgid === undefined
    ? { mode: 'container-default' }
    : { mode: 'host', uid: process.getuid(), gid: process.getgid() };

type OpenFoamStage = {
  readonly name: string;
  readonly command: string;
  readonly arguments: readonly string[];
};

type ArchiveEntry =
  | { readonly kind: 'directory'; readonly path: string; readonly mode: number }
  | { readonly kind: 'file'; readonly path: string; readonly mode: number; readonly bytes: Uint8Array<ArrayBuffer> };

const toArchivePath = (path: string): string => path.split(sep).join('/');

const compareText = (left: string, right: string): number => {
  if (left < right) {
    return -1;
  }
  return left > right ? 1 : 0;
};

const assertSafeArchivePath = (path: string): readonly string[] => {
  if (!path || path.startsWith('/') || path.includes('\\')) {
    throw new TypeError(`OpenFOAM stage archive contains an unsafe path: ${JSON.stringify(path)}.`);
  }
  const segments = path.split('/');
  if (segments.some((segment) => !segment || segment === '.' || segment === '..')) {
    throw new TypeError(`OpenFOAM stage archive contains an unsafe path: ${JSON.stringify(path)}.`);
  }
  return segments;
};

const collectEntries = async (input: {
  readonly root: string;
  readonly directory: string;
  readonly entries: ArchiveEntry[];
}): Promise<void> => {
  const directoryEntries = await readdir(input.directory, { withFileTypes: true });
  const children = directoryEntries.toSorted((left, right) => compareText(left.name, right.name));
  for (const child of children) {
    const physicalPath = join(input.directory, child.name);
    const archivePath = toArchivePath(relative(input.root, physicalPath));
    assertSafeArchivePath(archivePath);
    // oxlint-disable-next-line no-await-in-loop -- deterministic snapshots walk one stable tree in lexical order
    const metadata = await lstat(physicalPath);
    // oxlint-disable-next-line eslint/no-bitwise -- POSIX permission bits are part of the archive identity.
    const mode = metadata.mode & 0o777;
    if (metadata.isSymbolicLink() || (!metadata.isDirectory() && !metadata.isFile())) {
      throw new TypeError(`OpenFOAM stage snapshots do not support special file ${JSON.stringify(archivePath)}.`);
    }
    if (metadata.isDirectory()) {
      input.entries.push({ kind: 'directory', path: archivePath, mode });
      // oxlint-disable-next-line no-await-in-loop -- recursive lexical traversal defines canonical archive order
      await collectEntries({ ...input, directory: physicalPath });
      continue;
    }
    if (!Number.isSafeInteger(metadata.size) || metadata.size > maximumArchiveBytes) {
      throw new RangeError(`OpenFOAM stage file ${JSON.stringify(archivePath)} exceeds the snapshot limit.`);
    }
    // oxlint-disable-next-line no-await-in-loop -- file bytes must correspond to the preceding metadata check
    const bytes = Uint8Array.from(await readFile(physicalPath));
    input.entries.push({ kind: 'file', path: archivePath, mode, bytes });
  }
};

const encodedLength = (entries: readonly ArchiveEntry[]): number => {
  let length = archiveHeaderBytes;
  for (const entry of entries) {
    length += entryHeaderBytes + new TextEncoder().encode(entry.path).byteLength;
    if (entry.kind === 'file') {
      length += entry.bytes.byteLength;
    }
    if (!Number.isSafeInteger(length) || length > maximumArchiveBytes) {
      throw new RangeError('OpenFOAM stage snapshot exceeds the 512 MiB archive limit.');
    }
  }
  return length;
};

const encodeArchive = (entries: readonly ArchiveEntry[]): Uint8Array<ArrayBuffer> => {
  const pathEncoder = new TextEncoder();
  const bytes = new Uint8Array(encodedLength(entries));
  bytes.set(archiveMagic);
  const view = new DataView(bytes.buffer);
  let offset = archiveMagic.byteLength;
  view.setUint32(offset, entries.length, false);
  offset += 4;
  for (const entry of entries) {
    const pathBytes = pathEncoder.encode(entry.path);
    const contentBytes = entry.kind === 'file' ? entry.bytes : new Uint8Array();
    view.setUint8(offset, entry.kind === 'file' ? 1 : 0);
    view.setUint32(offset + 1, entry.mode, false);
    view.setUint32(offset + 5, pathBytes.byteLength, false);
    view.setBigUint64(offset + 9, BigInt(contentBytes.byteLength), false);
    offset += entryHeaderBytes;
    bytes.set(pathBytes, offset);
    offset += pathBytes.byteLength;
    bytes.set(contentBytes, offset);
    offset += contentBytes.byteLength;
  }
  return bytes;
};

const readBoundedInteger = (value: bigint): number => {
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError('OpenFOAM stage archive entry exceeds the safe integer limit.');
  }
  return Number(value);
};

const decodeArchive = (bytes: Uint8Array<ArrayBuffer>): readonly ArchiveEntry[] => {
  if (bytes.byteLength < archiveHeaderBytes || bytes.byteLength > maximumArchiveBytes) {
    throw new RangeError('OpenFOAM stage archive size is invalid.');
  }
  if (!archiveMagic.every((byte, index) => bytes[index] === byte)) {
    throw new TypeError('OpenFOAM stage archive has an invalid header.');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let offset = archiveMagic.byteLength;
  const count = view.getUint32(offset, false);
  offset += 4;
  const entries: ArchiveEntry[] = [];
  let previousPath = '';
  for (let index = 0; index < count; index += 1) {
    if (offset + entryHeaderBytes > bytes.byteLength) {
      throw new TypeError('OpenFOAM stage archive ended inside an entry header.');
    }
    const kind = view.getUint8(offset);
    const mode = view.getUint32(offset + 1, false);
    const pathLength = view.getUint32(offset + 5, false);
    const contentLength = readBoundedInteger(view.getBigUint64(offset + 9, false));
    offset += entryHeaderBytes;
    if (offset + pathLength + contentLength > bytes.byteLength) {
      throw new TypeError('OpenFOAM stage archive ended inside an entry payload.');
    }
    const path = decoder.decode(bytes.subarray(offset, offset + pathLength));
    offset += pathLength;
    assertSafeArchivePath(path);
    if (previousPath && path <= previousPath) {
      throw new TypeError('OpenFOAM stage archive paths must be unique and lexically ordered.');
    }
    previousPath = path;
    if (kind === 0 && contentLength === 0) {
      entries.push({ kind: 'directory', path, mode });
      continue;
    }
    if (kind !== 1) {
      throw new TypeError('OpenFOAM stage archive contains an invalid entry kind.');
    }
    const content = Uint8Array.from(bytes.subarray(offset, offset + contentLength));
    offset += contentLength;
    entries.push({ kind: 'file', path, mode, bytes: content });
  }
  if (offset !== bytes.byteLength) {
    throw new TypeError('OpenFOAM stage archive contains trailing bytes.');
  }
  return entries;
};

const captureWorkspace = async (workspace: string): Promise<Uint8Array<ArrayBuffer>> => {
  const entries: ArchiveEntry[] = [];
  await collectEntries({ root: workspace, directory: workspace, entries });
  return encodeArchive(entries.toSorted((left, right) => compareText(left.path, right.path)));
};

const restoreWorkspace = async (input: {
  readonly workspace: string;
  readonly bytes: Uint8Array<ArrayBuffer>;
}): Promise<void> => {
  const entries = decodeArchive(input.bytes);
  const existing = await readdir(input.workspace);
  await Promise.all(existing.map(async (name) => rm(join(input.workspace, name), { force: true, recursive: true })));
  for (const entry of entries) {
    const physicalPath = join(input.workspace, ...assertSafeArchivePath(entry.path));
    if (entry.kind === 'directory') {
      // oxlint-disable-next-line no-await-in-loop -- canonical replay preserves parent-before-child order
      await mkdir(physicalPath, { recursive: true });
    } else {
      // oxlint-disable-next-line no-await-in-loop -- files are restored before a later dependent stage starts
      await mkdir(dirname(physicalPath), { recursive: true });
      // oxlint-disable-next-line no-await-in-loop -- files are restored before a later dependent stage starts
      await writeFile(physicalPath, entry.bytes);
    }
    // oxlint-disable-next-line no-await-in-loop -- file modes are semantic solver inputs
    await chmod(physicalPath, entry.mode);
  }
};

const archiveCodec: CacheCodec<Uint8Array<ArrayBuffer>> = {
  id: 'tau.openfoam.stage-workspace',
  version: '1',
  mediaType: 'application/vnd.tau.openfoam-stage-workspace',
  encode: ({ value }) => Uint8Array.from(value),
  decode: ({ bytes }) => Uint8Array.from(bytes),
};

const imageDigest = (image: string): ContentDigest => {
  const marker = image.lastIndexOf('@');
  return contentDigest({ value: image.slice(marker + 1).toLowerCase() });
};

const resultContentDigest = async (result: ComputeEvaluationResult<Uint8Array<ArrayBuffer>>): Promise<ContentDigest> =>
  result.source === 'cache'
    ? result.contentDigest
    : result.publication.status === 'stored'
      ? result.publication.contentDigest
      : digestContent({ bytes: result.value });

/** Execute or restore one deterministic OpenFOAM stage. @internal */
export const evaluateOpenFoamStage = async (input: {
  readonly compute: ComputeReuseService;
  readonly signal: AbortSignal;
  readonly workspace: string;
  readonly inputSnapshot: JobInputSnapshot;
  readonly image: string;
  readonly solverVersion: OpenFoamSolverVersion;
  readonly cpus: number;
  readonly containerUser: OpenFoamContainerUser;
  readonly stage: OpenFoamStage;
  readonly priorActionDigest?: ActionDigest;
  readonly priorContentDigest: ContentDigest;
  readonly execute: () => Promise<void>;
}): Promise<{ readonly actionDigest: ActionDigest; readonly contentDigest: ContentDigest }> => {
  const priorInputs: ComputeAction['inputs'] =
    input.priorActionDigest === undefined
      ? []
      : [{ kind: 'action', role: 'prior-stage', digest: input.priorActionDigest }];
  const action: ComputeAction = {
    schemaVersion: 1,
    namespace: 'tau.jobs.openfoam.stage',
    producer: {
      id: 'tau.openfoam.container',
      version: openFoamProviderVersion,
      implementationAssets: [imageDigest(input.image)],
    },
    operation: 'execute-stage-v1',
    inputs: [{ kind: 'content', role: 'prior-workspace', digest: input.priorContentDigest }, ...priorInputs],
    arguments: {
      name: input.stage.name,
      command: input.stage.command,
      arguments: [...input.stage.arguments],
      declaredInputDigest: input.inputSnapshot.digest,
    },
    environment: {
      solverVersion: input.solverVersion,
      image: input.image,
      platform: process.platform,
      architecture: process.arch,
      container: {
        engine: openFoamContainerPolicy.executable,
        entrypoint: openFoamContainerPolicy.entrypoint,
        workdir: openFoamContainerPolicy.workdir,
        casePath: openFoamContainerPolicy.casePath,
        network: openFoamContainerPolicy.network,
        cpus: input.cpus,
        memory: openFoamContainerPolicy.memory,
        processLimit: openFoamContainerPolicy.processLimit,
        readOnly: openFoamContainerPolicy.readOnly,
        capabilitiesDrop: openFoamContainerPolicy.capabilitiesDrop,
        securityOptions: openFoamContainerPolicy.securityOptions,
        temporaryFilesystems: openFoamContainerPolicy.temporaryFilesystems,
        home: openFoamContainerPolicy.home,
        user: input.containerUser,
      },
    },
    codec: { id: archiveCodec.id, version: archiveCodec.version },
  };
  const result = await input.compute.evaluate({
    action,
    codec: archiveCodec,
    policy: 'best-effort',
    signal: input.signal,
    async compute() {
      await input.execute();
      return captureWorkspace(input.workspace);
    },
  });
  if (result.source === 'cache') {
    await restoreWorkspace({ workspace: input.workspace, bytes: result.value });
  }
  return {
    actionDigest: result.actionDigest,
    contentDigest: await resultContentDigest(result),
  };
};

/** Hash the exact materialized attempt workspace before the first stage. @internal */
export const digestOpenFoamWorkspace = async (workspace: string): Promise<ContentDigest> =>
  digestContent({ bytes: await captureWorkspace(workspace) });

/** Provider version used in provenance and deterministic stage identities. @internal */
export const openFoamExecutionProviderVersion = openFoamProviderVersion;
