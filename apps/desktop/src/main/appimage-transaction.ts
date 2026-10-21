/* oxlint-disable no-bitwise -- Linux open flags and Unix permission masks require bit operations. */
/* oxlint-disable no-await-in-loop -- Copy bounded chunks sequentially while holding the installation lease. */
/** App-owned, same-filesystem replacement; neither this boundary nor recovery launches an older profile. */
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import {
  closeSync,
  constants,
  existsSync,
  fstatSync,
  fsyncSync,
  linkSync,
  lstatSync,
  openSync,
  readFileSync,
  readSync,
  realpathSync,
  renameSync,
  statfsSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { open } from 'node:fs/promises';
import type { FileHandle } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';

export type AppImageCandidate = {
  readonly path: string;
  readonly sha512: string;
  readonly size: number;
  readonly version: string;
};
export type AppImageInstallation = {
  readonly commit: () => void;
  readonly release: () => void;
};
export type AppImageCheckpoint = 'copied' | 'staged' | 'backup-durable' | 'renamed' | 'committed';
type HealthyImage = { sha512: string; version: string };
type ImageHealth = { schemaVersion: 1; healthy: HealthyImage; previousHealthy?: HealthyImage };
const sha512Pattern = /^[A-Za-z\d+/]{85}[AQgw]==$/u;
const versionPattern = /^\d+\.\d+\.\d+$/u;
const localFilesystems = new Set([0xef_53, 0x58_46_53_42, 0x91_23_68_3e, 0x01_02_19_94, 0x79_4c_76_30]);

const copyCandidate = async (source: FileHandle, output: FileHandle, size: number): Promise<void> => {
  const buffer = Buffer.alloc(1024 * 1024);
  let offset = 0;
  while (offset < size) {
    const { bytesRead } = await source.read(buffer, 0, Math.min(buffer.length, size - offset), offset);
    if (bytesRead === 0) {
      throw new Error('Downloaded AppImage ended before authenticated size');
    }
    let written = 0;
    while (written < bytesRead) {
      const result = await output.write(buffer, written, bytesRead - written, offset + written);
      if (result.bytesWritten === 0) {
        throw new Error('Staged AppImage write made no progress');
      }
      written += result.bytesWritten;
    }
    offset += bytesRead;
  }
};

/** An error after rename means the new image exists; callers must not report an untouched installation. */
export class AppImageCommitError extends Error {
  public get committed(): boolean {
    return true;
  }
  public constructor(cause: unknown) {
    super(
      'AppImage was replaced, but durability confirmation failed. The previous image is retained; restart manually.',
      { cause },
    );
    this.name = 'AppImageCommitError';
  }
}

const syncDirectory = (directory: string): void => {
  const descriptor = openSync(directory, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  try {
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
};

/** Hash a regular, non-symlink image with fixed-size buffers, independently of the updater cache. */
export const appImageDigest = (path: string): string => {
  const descriptor = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    if (!fstatSync(descriptor).isFile()) {
      throw new Error('AppImage must be a regular file');
    }
    const hash = createHash('sha512');
    const buffer = Buffer.alloc(1024 * 1024);
    for (let length = readSync(descriptor, buffer); length !== 0; length = readSync(descriptor, buffer)) {
      hash.update(buffer.subarray(0, length));
    }
    return hash.digest('base64');
  } finally {
    closeSync(descriptor);
  }
};

const ownedRegularFile = (path: string): void => {
  const metadata = lstatSync(path);
  if (
    !metadata.isFile() ||
    metadata.isSymbolicLink() ||
    metadata.uid !== process.getuid?.() ||
    (metadata.mode & 0o6022) !== 0
  ) {
    throw new Error('AppImage files must be owned by this user, without special or shared write permissions');
  }
};

/** Refuse indirect, shared, remote or unsupported installation locations before save/quit. */
export const validateAppImageLocation = (current: string): string => {
  if (
    process.platform !== 'linux' ||
    !isAbsolute(current) ||
    resolve(current) !== current ||
    realpathSync(current) !== current
  ) {
    throw new Error('AppImage updates require the real absolute outer image path on Linux');
  }
  ownedRegularFile(current);
  const directory = dirname(current);
  const metadata = lstatSync(directory);
  if (!metadata.isDirectory() || metadata.uid !== process.getuid?.() || (metadata.mode & 0o022) !== 0) {
    throw new Error('AppImage update directory must be owned by this user and not shared writable');
  }
  if (!localFilesystems.has(statfsSync(directory).type)) {
    throw new Error('AppImage in-place updates require a supported local filesystem');
  }
  return current;
};

/** Parent and trusted flock child share one open-file description; keep its inode permanently. */
export const acquireAppImageLease = (current: string): (() => void) => {
  const lock = `${current}.update-lock`;
  const descriptor = openSync(lock, constants.O_CREAT | constants.O_RDWR | constants.O_NOFOLLOW, 0o600);
  try {
    const metadata = fstatSync(descriptor);
    if (
      !metadata.isFile() ||
      metadata.uid !== process.getuid?.() ||
      (metadata.mode & 0o077) !== 0 ||
      metadata.nlink !== 1
    ) {
      throw new Error('AppImage update lock must be a private regular file');
    }
    execFileSync('/usr/bin/flock', ['--nonblock', '--exclusive', '--conflict-exit-code', '75', '3'], {
      stdio: ['ignore', 'pipe', 'pipe', descriptor],
      timeout: 10_000,
    });
    let released = false;
    return () => {
      if (!released) {
        released = true;
        closeSync(descriptor);
      }
    };
  } catch (error) {
    closeSync(descriptor);
    throw error;
  }
};

const recoveryPath = (current: string, sha512: string): string =>
  join(dirname(current), `.${basename(current)}.healthy-${createHash('sha256').update(sha512).digest('hex')}.AppImage`);
const healthPath = (current: string): string => `${current}.update-health.json`;
const isHealthyImage = (value: unknown): value is HealthyImage =>
  typeof value === 'object' &&
  value !== null &&
  'sha512' in value &&
  typeof value.sha512 === 'string' &&
  sha512Pattern.test(value.sha512) &&
  'version' in value &&
  typeof value.version === 'string' &&
  versionPattern.test(value.version);
const readHealth = (current: string): ImageHealth | undefined => {
  const path = healthPath(current);
  if (!existsSync(path)) {
    return undefined;
  }
  ownedRegularFile(path);
  const descriptor = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    if (fstatSync(descriptor).size > 4096) {
      throw new Error('AppImage health record is oversized');
    }
    const value: unknown = JSON.parse(readFileSync(descriptor, 'utf8'));
    if (
      typeof value !== 'object' ||
      value === null ||
      !('schemaVersion' in value) ||
      value.schemaVersion !== 1 ||
      !('healthy' in value) ||
      !isHealthyImage(value.healthy) ||
      ('previousHealthy' in value && value.previousHealthy !== undefined && !isHealthyImage(value.previousHealthy))
    ) {
      throw new Error('AppImage health record is invalid');
    }
    return {
      schemaVersion: 1,
      healthy: value.healthy,
      ...('previousHealthy' in value && isHealthyImage(value.previousHealthy)
        ? { previousHealthy: value.previousHealthy }
        : {}),
    };
  } finally {
    closeSync(descriptor);
  }
};

const retainImage = (current: string, expected: string): void => {
  const backup = recoveryPath(current, expected);
  try {
    linkSync(current, backup);
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) {
      throw error;
    }
  }
  ownedRegularFile(backup);
  if (appImageDigest(backup) !== expected) {
    throw new Error('Retained AppImage recovery bytes disagree');
  }
  syncDirectory(dirname(current));
};

/** Call only after the actual app is ready; a scheduled relaunch or spawned PID is not healthy. */
export const acknowledgeHealthyAppImage = (options: {
  current: string;
  expectedCurrent: string;
  version: string;
}): void => {
  const current = validateAppImageLocation(options.current);
  if (!versionPattern.test(options.version) || !sha512Pattern.test(options.expectedCurrent)) {
    throw new Error('Invalid AppImage startup identity');
  }
  const release = acquireAppImageLease(current);
  const temporary = `${healthPath(current)}.${randomUUID()}.pending`;
  try {
    if (appImageDigest(current) !== options.expectedCurrent) {
      throw new Error('AppImage changed before healthy startup acknowledgement');
    }
    const previous = readHealth(current);
    retainImage(current, options.expectedCurrent);
    const healthy = { sha512: options.expectedCurrent, version: options.version };
    const previousHealthy = previous?.healthy.sha512 === healthy.sha512 ? previous.previousHealthy : previous?.healthy;
    writeFileSync(
      temporary,
      JSON.stringify({ schemaVersion: 1, healthy, ...(previousHealthy ? { previousHealthy } : {}) }) + '\n',
      { flag: 'wx', mode: 0o600 },
    );
    const descriptor = openSync(temporary, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      fsyncSync(descriptor);
    } finally {
      closeSync(descriptor);
    }
    renameSync(temporary, healthPath(current));
    syncDirectory(dirname(current));
    // Recovery images are deliberately retained; cleanup needs a separate compatible-profile decision.
  } finally {
    if (existsSync(temporary)) {
      unlinkSync(temporary);
    }
    release();
  }
};

/** Prepare large I/O before saving; commit is a bounded synchronous same-directory rename boundary. */
export const prepareAppImageInstallation = async (options: {
  current: string;
  expectedCurrent: string;
  candidate: AppImageCandidate;
  checkpoint?: (phase: AppImageCheckpoint) => void;
}): Promise<AppImageInstallation> => {
  const current = validateAppImageLocation(options.current);
  const { candidate } = options;
  if (
    !sha512Pattern.test(options.expectedCurrent) ||
    !sha512Pattern.test(candidate.sha512) ||
    !Number.isSafeInteger(candidate.size) ||
    candidate.size <= 0 ||
    !versionPattern.test(candidate.version)
  ) {
    throw new Error('Invalid authenticated AppImage candidate');
  }
  const releaseLease = acquireAppImageLease(current);
  const directory = dirname(current);
  const staged = join(directory, `.${basename(current)}.${randomUUID()}.pending`);
  let released = false;
  let committed = false;
  const release = (): void => {
    if (released) {
      return;
    }
    released = true;
    try {
      if (existsSync(staged)) {
        unlinkSync(staged);
      }
    } finally {
      releaseLease();
    }
  };
  try {
    if (appImageDigest(current) !== options.expectedCurrent) {
      throw new Error('Current AppImage digest changed');
    }
    const health = readHealth(current);
    if (!health) {
      throw new Error('AppImage must acknowledge healthy startup before an update');
    }
    const healthy = recoveryPath(current, health.healthy.sha512);
    ownedRegularFile(healthy);
    if (appImageDigest(healthy) !== health.healthy.sha512) {
      throw new Error('Healthy AppImage recovery is unavailable');
    }
    const source = await open(candidate.path, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const metadata = await source.stat();
      if (!metadata.isFile() || metadata.size !== candidate.size) {
        throw new Error('Downloaded AppImage size is invalid');
      }
      const output = await open(
        staged,
        constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
        0o700,
      );
      try {
        await copyCandidate(source, output, candidate.size);
        options.checkpoint?.('copied');
        if (appImageDigest(staged) !== candidate.sha512) {
          throw new Error('Staged AppImage digest mismatch');
        }
        await output.sync();
      } finally {
        await output.close();
      }
    } finally {
      await source.close();
    }
    options.checkpoint?.('staged');
    retainImage(current, options.expectedCurrent);
    options.checkpoint?.('backup-durable');
    return {
      release,
      commit: () => {
        if (released || committed) {
          throw new Error('AppImage transaction is no longer prepared');
        }
        try {
          validateAppImageLocation(current);
          if (appImageDigest(current) !== options.expectedCurrent || appImageDigest(staged) !== candidate.sha512) {
            throw new Error('AppImage changed before commit');
          }
          renameSync(staged, current);
          committed = true;
          options.checkpoint?.('renamed');
          syncDirectory(directory);
          options.checkpoint?.('committed');
        } catch (error) {
          if (committed) {
            throw new AppImageCommitError(error);
          }
          throw error;
        } finally {
          release();
        }
      },
    };
  } catch (error) {
    release();
    throw error;
  }
};

/* oxlint-enable no-bitwise -- End filesystem operations. */
/* oxlint-enable no-await-in-loop -- End sequential copy. */
