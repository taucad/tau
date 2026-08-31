import JSZip from 'jszip';
import { base64url, CompactEncrypt, compactDecrypt } from 'jose';
import { ShareError } from '#provider.js';
import type { ShareProjectSnapshot } from '#snapshot.js';

const fixedZipDate = new Date('1980-01-01T00:00:00.000Z');
const passwordProtectedHeader = {
  alg: 'PBES2-HS512+A256KW',
  enc: 'A256GCM',
  cty: 'application/zip',
} as const;
const passwordIterations = 210_000;

/** RFC 7518 password bounds for PBES2-HS512+A256KW, measured after UTF-8 encoding. @public */
export const sharePasswordLimits = { minBytes: 32, maxBytes: 128 } as const;

/** Default trust-boundary limits for portable share artifacts. @public */
export const shareArtifactLimits = {
  maxDirectUrlCharacters: 524_288,
  maxGistJweCharacters: 921_600,
  maxEncodedJweCharacters: 1_048_576,
  maxEncodedArchiveCharacters: 12 * 1024 * 1024,
  maxArchiveBytes: 8 * 1024 * 1024,
  maxEntries: 200,
  maxEntryBytes: 25 * 1024 * 1024,
  maxTotalBytes: 50 * 1024 * 1024,
  maxCompressionRatio: 100,
  maxPathBytes: 1024,
  maxPathDepth: 32,
  maxManifestBytes: 1024 * 1024,
  maxReadmeBytes: 2 * 1024 * 1024,
} as const;

/** One validated file opened from a portable artifact. @public */
export type ShareOpenedFile = {
  readonly path: string;
  readonly content: Uint8Array<ArrayBuffer>;
};

/** Decrypted validated portable project package retained in memory. @public */
export type ShareOpenedArtifact = {
  readonly archive: Uint8Array<ArrayBuffer>;
  readonly files: readonly ShareOpenedFile[];
};

/** Encrypted portable project package and creation metrics. @public */
export type ShareProtectedArtifact = {
  readonly archive: Uint8Array<ArrayBuffer>;
  readonly compactJwe: string;
  readonly metrics: {
    readonly fileCount: number;
    readonly uncompressedBytes: number;
    readonly archiveBytes: number;
    readonly jweCharacters: number;
  };
};

/** Plain compressed portable project package and creation metrics. @public */
export type SharePlainArtifact = {
  readonly archive: Uint8Array<ArrayBuffer>;
  readonly encodedArchive: string;
  readonly metrics: {
    readonly fileCount: number;
    readonly uncompressedBytes: number;
    readonly archiveBytes: number;
    readonly encodedCharacters: number;
  };
};

/** Codec seam implemented directly in tests and by a dedicated browser worker in the UI. @public */
export type ShareArtifactCodec = {
  readonly pack: (snapshot: ShareProjectSnapshot, signal?: AbortSignal) => Promise<SharePlainArtifact>;
  readonly openArchive: (archive: Uint8Array<ArrayBuffer>, signal?: AbortSignal) => Promise<ShareOpenedArtifact>;
  readonly openPlain: (encodedArchive: string, signal?: AbortSignal) => Promise<ShareOpenedArtifact>;
  readonly sealWithPassword: (
    snapshot: ShareProjectSnapshot,
    password: string,
    signal?: AbortSignal,
  ) => Promise<ShareProtectedArtifact>;
  readonly openWithPassword: (
    input: { readonly compactJwe: string; readonly password: string },
    signal?: AbortSignal,
  ) => Promise<ShareOpenedArtifact>;
};

const throwIfAborted = (signal?: AbortSignal): void => signal?.throwIfAborted();

const failInvalid = (message: string, cause?: unknown): never => {
  throw new ShareError('SHARE_ARTIFACT_INVALID', message, cause === undefined ? undefined : { cause });
};

const failLimit = (message: string): never => {
  throw new ShareError('SHARE_ARTIFACT_LIMIT', message);
};

const isSafePathSegment = (segment: string): boolean =>
  [...segment].every((character) => {
    const code = character.codePointAt(0);
    return code !== undefined && code > 31 && code !== 127 && character !== '\\';
  });

const validatePath = (path: string): string => {
  if (
    path.length === 0 ||
    path.startsWith('/') ||
    /^[A-Za-z]:/u.test(path) ||
    path.startsWith('\\') ||
    path.includes('\\')
  ) {
    return failInvalid('The project archive contains an unsafe path.');
  }
  const segments = path.split('/');
  const isParameterEntry = path.startsWith('.tau/parameters/') && path.endsWith('.json');
  if (
    segments.length > shareArtifactLimits.maxPathDepth ||
    (segments[0] === '.tau' && !isParameterEntry) ||
    segments.some(
      (segment) => segment.length === 0 || segment === '.' || segment === '..' || !isSafePathSegment(segment),
    )
  ) {
    return failInvalid('The project archive contains an unsafe path.');
  }
  if (new TextEncoder().encode(path).byteLength > shareArtifactLimits.maxPathBytes) {
    return failLimit('A project path exceeds the portable-share limit.');
  }
  return path;
};

const collisionKey = (path: string): string => path.normalize('NFC').toLocaleLowerCase('en-US');

const assertUniquePaths = (paths: readonly string[]): void => {
  const exact = new Set<string>();
  const portable = new Set<string>();
  for (const path of paths) {
    const canonical = validatePath(path);
    const folded = collisionKey(canonical);
    if (exact.has(canonical) || portable.has(folded)) {
      failInvalid('The project archive contains colliding paths.');
    }
    exact.add(canonical);
    portable.add(folded);
  }
  for (const path of portable) {
    const segments = path.split('/');
    for (let depth = 1; depth < segments.length; depth++) {
      if (portable.has(segments.slice(0, depth).join('/'))) {
        failInvalid('The project archive contains colliding paths.');
      }
    }
  }
};

type OwnedBytes = Uint8Array<ArrayBuffer>;

const toOwnedBytes = (bytes: OwnedBytes): OwnedBytes => new Uint8Array(bytes);

/** Create a deterministic ZIP from one provider-neutral project snapshot. @public */
export const createShareArchive = async (snapshot: ShareProjectSnapshot): Promise<Uint8Array<ArrayBuffer>> => {
  if (snapshot.files.length === 0 || snapshot.files.length > shareArtifactLimits.maxEntries) {
    failLimit('The project contains too many files for a portable share.');
  }
  const sortedFiles = [...snapshot.files].sort((left, right) => left.path.localeCompare(right.path, 'en'));
  assertUniquePaths(sortedFiles.map(({ path }) => path));
  let totalBytes = 0;
  const zip = new JSZip();
  for (const file of sortedFiles) {
    if (file.content.byteLength > shareArtifactLimits.maxEntryBytes) {
      failLimit('A project file exceeds the portable-share limit.');
    }
    totalBytes += file.content.byteLength;
    if (totalBytes > shareArtifactLimits.maxTotalBytes) {
      failLimit('The project exceeds the portable-share expanded-size limit.');
    }
    zip.file(file.path, file.content, {
      binary: true,
      createFolders: false,
      date: fixedZipDate,
      compression: 'DEFLATE',
      compressionOptions: { level: 9 },
    });
  }
  const archive = await zip.generateAsync({
    type: 'uint8array',
    platform: 'DOS',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 },
    streamFiles: false,
  });
  if (archive.byteLength > shareArtifactLimits.maxArchiveBytes) {
    failLimit('The compressed project exceeds the portable-share limit.');
  }
  return toOwnedBytes(new Uint8Array(archive));
};

type ZipEntryInternal = JSZip.JSZipObject & {
  readonly unsafeOriginalName?: string;
  readonly _data?: { readonly compressedSize?: number; readonly uncompressedSize?: number };
};

const isSymlink = (permissions: unknown): boolean => {
  const mode = typeof permissions === 'string' ? Number.parseInt(permissions, 8) : permissions;
  // oxlint-disable-next-line no-bitwise -- POSIX file-type bits are the symlink authority.
  return typeof mode === 'number' && (mode & 0o17_0000) === 0o12_0000;
};

/** Validate and open a deterministic portable share ZIP without durable writes. @public */
export const openShareArchive = async (archiveInput: OwnedBytes): Promise<ShareOpenedArtifact> => {
  if (archiveInput.byteLength === 0 || archiveInput.byteLength > shareArtifactLimits.maxArchiveBytes) {
    failLimit('The compressed project exceeds the portable-share limit.');
  }
  let zip: JSZip;
  try {
    const loadOptions: JSZip.JSZipLoadOptions = { createFolders: false };
    loadOptions.checkCRC32 = true;
    zip = await JSZip.loadAsync(archiveInput, loadOptions);
  } catch (error) {
    return failInvalid('The project archive is invalid.', error);
  }
  const entries = Object.values(zip.files) as ZipEntryInternal[];
  if (entries.length === 0 || entries.length > shareArtifactLimits.maxEntries) {
    failLimit('The project archive contains too many entries.');
  }
  const rawPaths = entries.map((entry) => entry.unsafeOriginalName ?? entry.name);
  assertUniquePaths(rawPaths);
  let totalBytes = 0;
  const files: ShareOpenedFile[] = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name, 'en'))) {
    if (entry.dir || isSymlink(entry.unixPermissions)) {
      failInvalid('The project archive contains an unsupported entry type.');
    }
    const rawPath = entry.unsafeOriginalName ?? entry.name;
    validatePath(rawPath);
    const declaredBytes = entry._data?.uncompressedSize;
    const compressedBytes = entry._data?.compressedSize;
    if (declaredBytes !== undefined && declaredBytes > shareArtifactLimits.maxEntryBytes) {
      failLimit('A project file exceeds the portable-share limit.');
    }
    if (
      declaredBytes !== undefined &&
      compressedBytes !== undefined &&
      declaredBytes > 0 &&
      declaredBytes / Math.max(compressedBytes, 1) > shareArtifactLimits.maxCompressionRatio
    ) {
      failLimit('The project archive exceeds the compression-ratio limit.');
    }
    let content: Uint8Array<ArrayBuffer>;
    try {
      // oxlint-disable-next-line no-await-in-loop -- sequential expansion enforces the aggregate limit before opening the next entry.
      content = new Uint8Array(await entry.async('uint8array'));
    } catch (error) {
      return failInvalid('A project archive entry is invalid.', error);
    }
    if (content.byteLength > shareArtifactLimits.maxEntryBytes) {
      failLimit('A project file exceeds the portable-share limit.');
    }
    if (
      compressedBytes !== undefined &&
      content.byteLength > 0 &&
      content.byteLength / Math.max(compressedBytes, 1) > shareArtifactLimits.maxCompressionRatio
    ) {
      failLimit('The project archive exceeds the compression-ratio limit.');
    }
    totalBytes += content.byteLength;
    if (totalBytes > shareArtifactLimits.maxTotalBytes) {
      failLimit('The project exceeds the portable-share expanded-size limit.');
    }
    if (rawPath === 'tau.json' && content.byteLength > shareArtifactLimits.maxManifestBytes) {
      failLimit('The project manifest exceeds the portable-share limit.');
    }
    if (/^readme\.md$/iu.test(rawPath) && content.byteLength > shareArtifactLimits.maxReadmeBytes) {
      failLimit('The project README exceeds the portable-share limit.');
    }
    files.push({ path: rawPath, content: toOwnedBytes(content) });
  }
  if (!files.some(({ path }) => path === 'tau.json')) {
    failInvalid('The project archive does not contain tau.json.');
  }
  return { archive: toOwnedBytes(archiveInput), files };
};

const encodePassword = (password: string): Uint8Array<ArrayBuffer> => {
  const bytes = new TextEncoder().encode(password.normalize('NFC'));
  if (bytes.byteLength < sharePasswordLimits.minBytes || bytes.byteLength > sharePasswordLimits.maxBytes) {
    failInvalid(
      `The password must be ${sharePasswordLimits.minBytes}–${sharePasswordLimits.maxBytes} bytes when encoded as UTF-8.`,
    );
  }
  return toOwnedBytes(bytes);
};

const assertPasswordProtectedHeader = (header: Record<string, unknown>): void => {
  const keys = Object.keys(header).sort();
  const expectedKeys = [...Object.keys(passwordProtectedHeader), 'p2c', 'p2s'].sort();
  if (
    keys.length !== expectedKeys.length ||
    keys.some((key, index) => key !== expectedKeys[index]) ||
    header['alg'] !== passwordProtectedHeader.alg ||
    header['enc'] !== passwordProtectedHeader.enc ||
    header['cty'] !== passwordProtectedHeader.cty ||
    header['p2c'] !== passwordIterations ||
    typeof header['p2s'] !== 'string'
  ) {
    failInvalid('The share uses an unsupported encryption profile.');
  }
};

const artifactMetrics = (snapshot: ShareProjectSnapshot, archive: OwnedBytes) => ({
  fileCount: snapshot.files.length,
  uncompressedBytes: snapshot.files.reduce((sum, file) => sum + file.content.byteLength, 0),
  archiveBytes: archive.byteLength,
});

/** Direct in-process implementation of the portable artifact codec. @public */
export const shareArtifactCodec: ShareArtifactCodec = {
  async pack(snapshot, signal) {
    throwIfAborted(signal);
    const archive = await createShareArchive(snapshot);
    throwIfAborted(signal);
    const encodedArchive = base64url.encode(archive);
    if (encodedArchive.length > shareArtifactLimits.maxEncodedArchiveCharacters) {
      failLimit('The encoded project exceeds the portable-share limit.');
    }
    return {
      archive,
      encodedArchive,
      metrics: { ...artifactMetrics(snapshot, archive), encodedCharacters: encodedArchive.length },
    };
  },
  async openArchive(archive, signal) {
    throwIfAborted(signal);
    const opened = await openShareArchive(archive);
    throwIfAborted(signal);
    return opened;
  },
  async openPlain(encodedArchive, signal) {
    throwIfAborted(signal);
    if (encodedArchive.length === 0 || encodedArchive.length > shareArtifactLimits.maxEncodedArchiveCharacters) {
      failLimit('The encoded project exceeds the portable-share limit.');
    }
    let archive: Uint8Array<ArrayBuffer>;
    try {
      archive = new Uint8Array(base64url.decode(encodedArchive));
    } catch (error) {
      return failInvalid('The encoded project is malformed.', error);
    }
    const opened = await openShareArchive(archive);
    throwIfAborted(signal);
    return opened;
  },
  async sealWithPassword(snapshot, password, signal) {
    throwIfAborted(signal);
    const archive = await createShareArchive(snapshot);
    const passwordBytes = encodePassword(password);
    const p2s = new Uint8Array(16);
    crypto.getRandomValues(p2s);
    const compactJwe = await new CompactEncrypt(archive)
      .setProtectedHeader(passwordProtectedHeader)
      .setKeyManagementParameters({ p2c: passwordIterations, p2s })
      .encrypt(passwordBytes);
    throwIfAborted(signal);
    if (compactJwe.length > shareArtifactLimits.maxEncodedJweCharacters) {
      failLimit('The encrypted project exceeds the portable-share limit.');
    }
    return {
      archive,
      compactJwe,
      metrics: {
        ...artifactMetrics(snapshot, archive),
        jweCharacters: compactJwe.length,
      },
    };
  },
  async openWithPassword(input, signal) {
    throwIfAborted(signal);
    if (input.compactJwe.length === 0 || input.compactJwe.length > shareArtifactLimits.maxEncodedJweCharacters) {
      failLimit('The encrypted project exceeds the portable-share limit.');
    }
    const password = encodePassword(input.password);
    try {
      const result = await compactDecrypt(input.compactJwe, password, {
        keyManagementAlgorithms: [passwordProtectedHeader.alg],
        contentEncryptionAlgorithms: [passwordProtectedHeader.enc],
        // eslint-disable-next-line @typescript-eslint/naming-convention -- JOSE's public option uses its algorithm name.
        maxPBES2Count: passwordIterations,
      });
      throwIfAborted(signal);
      assertPasswordProtectedHeader(result.protectedHeader);
      const opened = await openShareArchive(new Uint8Array(result.plaintext));
      throwIfAborted(signal);
      return opened;
    } catch (error) {
      if (error instanceof ShareError) {
        throw error;
      }
      return failInvalid('The encrypted project could not be authenticated.', error);
    }
  },
};
