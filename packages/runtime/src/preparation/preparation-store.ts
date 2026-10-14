// The digest-keyed store shared by every Tau host on one machine. No lock files: every publication is a `rename`
// whose loser adopts the winner's result, and the `generation` token changes whenever a seal, repair or GC changes
// what the store holds.
//
// <store>/
//   generation                          rewritten by every seal, repair and GC
//   blobs/sha256/<hex>                  verified payload bytes, kept after sealing
//   blobs/alias/<algorithm>-<hex>       the sha256 key of a blob pinned by sha384 or sha512
//   closures/sha256/<hex>/receipt.json  the seal: written last, inside staging, before the rename
//   links/<sha256(hostPath)>.json       the closures each host installation uses (the GC roots)
//   tmp/<attemptId>/owner.json          one staging directory per attempt, swept when its owner is gone
//   tmp/gc-<id>/                        closures being deleted
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { hostname } from 'node:os';
import { join } from 'node:path';

import { integrityToHex } from '@taucad/archive-core';

import type { GarbageReport } from '#preparation/preparation-host.types.js';
import type { ClosureReceipt, Integrity } from '#preparation/preparation.types.js';

/** Staging, orphan blobs and dead GC directories older than this are removed. Milliseconds. */
export const abandonedAge = 24 * 60 * 60 * 1000;

const hexPattern = /^[\da-f]{64}$/u;

/**
 * The store paths one host uses.
 * @internal
 */
export type StoreLayout = {
  readonly root: string;
  readonly generation: string;
  readonly blobs: string;
  readonly aliases: string;
  readonly closures: string;
  readonly links: string;
  readonly staging: string;
};

/**
 * Lay out a store root.
 * @internal
 * @param root - Absolute store root.
 * @returns Every directory and file the store uses.
 */
export const storeLayout = (root: string): StoreLayout => ({
  root,
  generation: join(root, 'generation'),
  blobs: join(root, 'blobs', 'sha256'),
  aliases: join(root, 'blobs', 'alias'),
  closures: join(root, 'closures', 'sha256'),
  links: join(root, 'links'),
  staging: join(root, 'tmp'),
});

const errorCode = (error: unknown): string | undefined => (error as NodeJS.ErrnoException | undefined)?.code;

const exists = async (path: string): Promise<boolean> => {
  try {
    await lstat(path);
    return true;
  } catch {
    return false;
  }
};

/**
 * Write a small file atomically: a unique sibling, then `rename` over the target.
 * @internal
 * @param path - Target path; its directory is created.
 * @param content - File content.
 */
export const writeAtomically = async (path: string, content: string): Promise<void> => {
  const temporary = `${path}.${randomUUID()}.tmp`;
  await writeFile(temporary, content, { mode: 0o644 });
  try {
    await rename(temporary, path);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
};

/**
 * Mint a new store generation, so every in-process memo keyed on the old one re-reads its receipts.
 * @internal
 * @param layout - The store.
 */
export const advanceGeneration = async (layout: StoreLayout): Promise<void> => {
  await mkdir(layout.root, { recursive: true });
  await writeAtomically(layout.generation, `${randomUUID()}\n`);
};

/**
 * The store's current generation token, or `'0'` for a store that has never sealed anything.
 * @param store - Absolute store root.
 * @returns The token.
 * @public
 */
export const readStoreGeneration = async (store: string): Promise<string> => {
  try {
    const token = await readFile(storeLayout(store).generation, 'utf8');
    return token.trim();
  } catch {
    return '0';
  }
};

/**
 * The lowercase hex key of an SRI sha256 string, as `closures/sha256/<hex>` names it.
 * @internal
 * @param integrity - An SRI sha256 string.
 * @returns The hex key.
 */
export const sha256Key = (integrity: Integrity): string => integrityToHex(integrity).hex;

/**
 * Stream a file through sha256.
 * @internal
 * @param path - File to hash.
 * @param signal - Aborts the read.
 * @returns Lowercase hex sha256.
 */
export const hashFile = async (path: string, signal?: AbortSignal): Promise<string> => {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path, { signal, highWaterMark: 1024 * 1024 })) {
    hash.update(chunk as Uint8Array<ArrayBuffer>);
  }
  return hash.digest('hex');
};

// ============================================================================
// Blobs
// ============================================================================

/**
 * The store key of a blob pinned by `integrity`, when the store can know it without the bytes: a sha256 pin is its
 * own key; a sha384 or sha512 pin is looked up in the alias written when its blob was published.
 * @internal
 * @param layout - The store.
 * @param integrity - The payload's pin.
 * @returns The sha256 hex key, or `undefined` when unknown.
 */
export const blobKey = async (layout: StoreLayout, integrity: Integrity): Promise<string | undefined> => {
  const { algorithm, hex } = integrityToHex(integrity);
  if (algorithm === 'sha256') {
    return hex;
  }
  try {
    const text = await readFile(join(layout.aliases, `${algorithm}-${hex}`), 'utf8');
    const key = text.trim();
    return hexPattern.test(key) ? key : undefined;
  } catch {
    return undefined;
  }
};

/**
 * Publish verified bytes as `blobs/sha256/<key>`: written to a unique staging file, then renamed. A blob that is
 * already there was written by another host from the same verified bytes, so the rename-wins outcome is the same.
 * @internal
 * @param layout - The store.
 * @param input - Bytes, their sha256 key, their pin and a staging directory on the same volume.
 * @returns The blob path.
 */
export const publishBlob = async (
  layout: StoreLayout,
  input: {
    readonly bytes: Uint8Array<ArrayBuffer>;
    readonly key: string;
    readonly integrity: Integrity;
    readonly staging: string;
  },
): Promise<string> => {
  const target = join(layout.blobs, input.key);
  await mkdir(layout.blobs, { recursive: true });
  const temporary = join(input.staging, `blob-${input.key}-${randomUUID()}`);
  await writeFile(temporary, input.bytes, { mode: 0o644 });
  try {
    await rename(temporary, target);
  } catch (error) {
    // Windows refuses to rename over an existing file; the existing blob holds the same verified bytes.
    if (!(await exists(target))) {
      throw error;
    }
    await rm(temporary, { force: true });
  }
  const { algorithm, hex } = integrityToHex(input.integrity);
  if (algorithm !== 'sha256') {
    await mkdir(layout.aliases, { recursive: true });
    await writeAtomically(join(layout.aliases, `${algorithm}-${hex}`), `${input.key}\n`);
  }
  return target;
};

// ============================================================================
// Closures
// ============================================================================

const isReceipt = (value: unknown): value is ClosureReceipt => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const receipt = value as Partial<Record<keyof ClosureReceipt, unknown>>;
  return (
    typeof receipt.package === 'string' &&
    typeof receipt.dependency === 'string' &&
    typeof receipt.closureIntegrity === 'string' &&
    typeof receipt.treeIntegrity === 'string' &&
    typeof receipt.tauVersion === 'string' &&
    Array.isArray(receipt.files) &&
    Array.isArray(receipt.payloads)
  );
};

/**
 * Read the seal of `closures/sha256/<key>`. The receipt's `root` is reported as where the closure is now.
 * @internal
 * @param layout - The store.
 * @param key - The closure's sha256 hex key.
 * @returns The receipt, or `undefined` when the closure is not sealed or its receipt is unreadable.
 */
export const readReceipt = async (layout: StoreLayout, key: string): Promise<ClosureReceipt | undefined> => {
  const root = join(layout.closures, key);
  try {
    const parsed: unknown = JSON.parse(await readFile(join(root, 'receipt.json'), 'utf8'));
    return isReceipt(parsed) ? { ...parsed, root } : undefined;
  } catch {
    return undefined;
  }
};

/**
 * Move a closure directory that is not sealed (or whose receipt is unreadable) out of the way, so it can be sealed
 * again. Only reached when something outside Tau damaged the store.
 * @internal
 * @param layout - The store.
 * @param key - The closure's sha256 hex key.
 */
export const retireClosure = async (layout: StoreLayout, key: string): Promise<void> => {
  const trash = join(layout.staging, `gc-${randomUUID()}`);
  await mkdir(trash, { recursive: true });
  try {
    await rename(join(layout.closures, key), join(trash, key));
  } catch (error) {
    if (errorCode(error) !== 'ENOENT') {
      throw error;
    }
  }
  await rm(trash, { recursive: true, force: true });
};

/**
 * Publish a staged closure whose `receipt.json` is already written. When another host sealed the same closure
 * first, its receipt is adopted and this staging is discarded.
 * @internal
 * @param layout - The store.
 * @param staged - Absolute staged closure directory.
 * @param key - The closure's sha256 hex key.
 * @returns The sealed receipt, this host's or the winner's.
 */
export const sealClosure = async (layout: StoreLayout, staged: string, key: string): Promise<ClosureReceipt> => {
  await mkdir(layout.closures, { recursive: true });
  const target = join(layout.closures, key);
  try {
    await rename(staged, target);
  } catch (error) {
    const code = errorCode(error);
    if (code !== 'EEXIST' && code !== 'ENOTEMPTY' && code !== 'EPERM') {
      throw error;
    }
    const winner = await readReceipt(layout, key);
    if (winner === undefined) {
      // A directory without a seal is damage, not a winner: move it aside and publish this one.
      await retireClosure(layout, key);
      return sealClosure(layout, staged, key);
    }
    await rm(staged, { recursive: true, force: true });
    return winner;
  }
  const sealed = await readReceipt(layout, key);
  if (sealed === undefined) {
    throw new Error(`The closure sealed at ${target} has no readable receipt.`);
  }
  return sealed;
};

/**
 * Every sealed closure key in the store.
 * @internal
 * @param layout - The store.
 * @returns Hex keys.
 */
export const closureKeys = async (layout: StoreLayout): Promise<string[]> => {
  try {
    const names = await readdir(layout.closures);
    return names.filter((name) => hexPattern.test(name));
  } catch {
    return [];
  }
};

// ============================================================================
// Links (GC roots)
// ============================================================================

type LinkFile = {
  readonly schemaVersion: 1;
  readonly hostPath: string;
  /** `<package> <dependency>` to the closure key this host uses. */
  readonly closures: Readonly<Record<string, string>>;
};

const linkName = (hostPath: string): string => `${createHash('sha256').update(hostPath).digest('hex')}.json`;

const readLinkFile = async (path: string): Promise<LinkFile | undefined> => {
  try {
    const parsed = JSON.parse(await readFile(path, 'utf8')) as {
      readonly hostPath?: unknown;
      readonly closures?: unknown;
    };
    return typeof parsed.hostPath === 'string' && typeof parsed.closures === 'object' && parsed.closures !== null
      ? { schemaVersion: 1, hostPath: parsed.hostPath, closures: parsed.closures as Readonly<Record<string, string>> }
      : undefined;
  } catch {
    return undefined;
  }
};

/**
 * The link entry name of one plugin dependency.
 * @internal
 * @param packageName - npm package.
 * @param dependency - Dependency name.
 * @returns The entry name.
 */
export const linkEntry = (packageName: string, dependency: string): string => `${packageName} ${dependency}`;

/**
 * The closures a host installation recorded, by link entry.
 * @internal
 * @param layout - The store.
 * @param hostPath - The host installation path.
 * @returns Link entry to closure key; empty when the host has no link.
 */
export const readLink = async (layout: StoreLayout, hostPath: string): Promise<Readonly<Record<string, string>>> => {
  const link = await readLinkFile(join(layout.links, linkName(hostPath)));
  return link?.closures ?? {};
};

/**
 * Record the closures a host installation uses, merged into its link. Written only when it changes.
 * @internal
 * @param layout - The store.
 * @param hostPath - The host installation path.
 * @param closures - Link entry to closure key.
 */
export const writeLink = async (
  layout: StoreLayout,
  hostPath: string,
  closures: Readonly<Record<string, string>>,
): Promise<void> => {
  const path = join(layout.links, linkName(hostPath));
  const link = await readLinkFile(path);
  const existing = link?.closures ?? {};
  if (Object.entries(closures).every(([entry, key]) => existing[entry] === key)) {
    return;
  }
  await mkdir(layout.links, { recursive: true });
  const merged: LinkFile = { schemaVersion: 1, hostPath, closures: { ...existing, ...closures } };
  await writeAtomically(path, `${JSON.stringify(merged, undefined, 2)}\n`);
};

// ============================================================================
// Staging
// ============================================================================

type StagingOwner = { readonly pid: number; readonly hostname: string; readonly startedAt: string };

/**
 * Create `tmp/<attemptId>/` and record which process owns it.
 * @internal
 * @param layout - The store.
 * @param attemptId - The preparation attempt that will own the directory.
 * @returns The staging directory.
 */
export const createStaging = async (layout: StoreLayout, attemptId: string): Promise<string> => {
  const directory = join(layout.staging, attemptId);
  await mkdir(directory, { recursive: true });
  const owner: StagingOwner = { pid: process.pid, hostname: hostname(), startedAt: new Date().toISOString() };
  await writeFile(join(directory, 'owner.json'), JSON.stringify(owner));
  return directory;
};

const processAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM: the process exists but belongs to another user.
    return errorCode(error) === 'EPERM';
  }
};

const abandoned = async (directory: string, now: number): Promise<boolean> => {
  try {
    const owner = JSON.parse(await readFile(join(directory, 'owner.json'), 'utf8')) as Partial<StagingOwner>;
    if (owner.hostname === hostname() && typeof owner.pid === 'number' && !processAlive(owner.pid)) {
      return true;
    }
  } catch {
    // No readable owner: only age can tell.
  }
  try {
    const { mtimeMs } = await stat(directory);
    return now - mtimeMs > abandonedAge;
  } catch {
    return false;
  }
};

/**
 * Staging directories a killed or long-gone attempt left behind: their owner process on this machine has exited,
 * they are older than 24 hours, or they are a GC directory.
 * @internal
 * @param layout - The store.
 * @param now - Current time. Milliseconds.
 * @returns `tmp/` entry names.
 */
export const abandonedStaging = async (layout: StoreLayout, now: number): Promise<string[]> => {
  let names: string[];
  try {
    names = await readdir(layout.staging);
  } catch {
    return [];
  }
  const verdicts = await Promise.all(
    names.map(async (name) =>
      name.startsWith('gc-') || (await abandoned(join(layout.staging, name), now)) ? name : undefined,
    ),
  );
  return verdicts.filter((name): name is string => name !== undefined);
};

/**
 * Remove what {@link abandonedStaging} finds.
 * @internal
 * @param layout - The store.
 * @param now - Current time. Milliseconds.
 * @returns The removed entry names.
 */
export const sweepStaging = async (layout: StoreLayout, now: number): Promise<string[]> => {
  const names = await abandonedStaging(layout, now);
  await Promise.all(names.map(async (name) => rm(join(layout.staging, name), { recursive: true, force: true })));
  return names;
};

// ============================================================================
// Garbage collection
// ============================================================================

const treeBytes = async (path: string): Promise<number> => {
  try {
    const entries = await readdir(path, { recursive: true, withFileTypes: true });
    const sizes = await Promise.all(
      entries
        .filter((entry) => entry.isFile())
        .map(async (entry) => {
          const { size } = await lstat(join(entry.parentPath, entry.name));
          return size;
        }),
    );
    return sizes.reduce((sum, size) => sum + size, 0);
  } catch {
    return 0;
  }
};

const liveClosures = async (
  layout: StoreLayout,
  signal: AbortSignal | undefined,
): Promise<{ readonly live: ReadonlySet<string>; readonly deadLinks: readonly string[] }> => {
  let linkNames: string[] = [];
  try {
    const names = await readdir(layout.links);
    linkNames = names.filter((name) => name.endsWith('.json'));
  } catch {
    // No links yet.
  }
  const live = new Set<string>();
  const deadLinks: string[] = [];
  for (const name of linkNames) {
    signal?.throwIfAborted();
    // oxlint-disable-next-line no-await-in-loop -- links are few; each is read once
    const link = await readLinkFile(join(layout.links, name));
    // oxlint-disable-next-line no-await-in-loop -- ditto
    if (link === undefined || !(await exists(link.hostPath))) {
      deadLinks.push(name);
      continue;
    }
    for (const key of Object.values(link.closures)) {
      live.add(key);
    }
  }
  return { live, deadLinks };
};

/**
 * Collect garbage: drop links whose host path is gone, move closures no live link names to `tmp/gc-<id>` and
 * delete them, delete blobs no remaining receipt lists once they are older than 24 hours (a younger orphan may
 * belong to an attempt in flight or a retry after a partial failure), and remove abandoned staging. A running
 * kernel keeps the inodes of a closure deleted under it.
 * @internal
 * @param layout - The store.
 * @param input - Whether to only report, the clock for the 24-hour orphan window, and cancellation.
 * @returns What was removed, or would be.
 */
export const collectStoreGarbage = async (
  layout: StoreLayout,
  input: { readonly dryRun: boolean; readonly now: number; readonly signal?: AbortSignal },
): Promise<GarbageReport> => {
  const { dryRun, now } = input;
  const { live, deadLinks } = await liveClosures(layout, input.signal);
  const sealed = await closureKeys(layout);
  const deadClosures = sealed.filter((key) => !live.has(key));
  const closureBytes = await Promise.all(deadClosures.map(async (key) => treeBytes(join(layout.closures, key))));

  const liveBlobs = new Set<string>();
  for (const key of await closureKeys(layout)) {
    if (deadClosures.includes(key)) {
      continue;
    }
    // oxlint-disable-next-line no-await-in-loop -- receipts are few
    const receipt = await readReceipt(layout, key);
    for (const payload of receipt?.payloads ?? []) {
      liveBlobs.add(payload.sha256);
    }
  }
  let blobNames: string[] = [];
  try {
    const names = await readdir(layout.blobs);
    blobNames = names.filter((name) => hexPattern.test(name));
  } catch {
    // No blobs yet.
  }
  const blobStats = await Promise.all(
    blobNames
      .filter((name) => !liveBlobs.has(name))
      .map(async (name) => ({ name, stats: await stat(join(layout.blobs, name)) })),
  );
  const deadBlobs = blobStats.filter(({ stats }) => now - stats.mtimeMs > abandonedAge);
  const staging = await abandonedStaging(layout, now);
  const stagingBytes = await Promise.all(staging.map(async (name) => treeBytes(join(layout.staging, name))));

  const report: GarbageReport = {
    dryRun,
    closures: deadClosures,
    blobs: deadBlobs.map(({ name }) => name),
    staging,
    links: deadLinks,
    byteLength:
      closureBytes.reduce((sum, size) => sum + size, 0) +
      deadBlobs.reduce((sum, { stats }) => sum + stats.size, 0) +
      stagingBytes.reduce((sum, size) => sum + size, 0),
  };
  if (dryRun) {
    return report;
  }

  await Promise.all(deadLinks.map(async (name) => rm(join(layout.links, name), { force: true })));
  // A host that started using a closure since the links were read has linked it by now: never retire that one.
  const { live: relinked } = await liveClosures(layout, input.signal);
  for (const key of deadClosures.filter((candidate) => !relinked.has(candidate))) {
    // oxlint-disable-next-line no-await-in-loop -- each move is one rename; deletion follows the move
    await retireClosure(layout, key);
  }
  await Promise.all(report.blobs.map(async (name) => rm(join(layout.blobs, name), { force: true })));
  try {
    const sources = join(layout.root, 'blobs', 'source');
    const names = await readdir(sources);
    await Promise.all(
      names
        .filter((name) => report.blobs.includes(name.replace(/\.json$/u, '')))
        .map(async (name) => rm(join(sources, name), { force: true })),
    );
  } catch {
    // No recorded sources.
  }
  try {
    const aliases = await readdir(layout.aliases);
    await Promise.all(
      aliases.map(async (name) => {
        const text = await readFile(join(layout.aliases, name), 'utf8');
        const key = text.trim();
        if (!(await exists(join(layout.blobs, key)))) {
          await rm(join(layout.aliases, name), { force: true });
        }
      }),
    );
  } catch {
    // No aliases.
  }
  await Promise.all(staging.map(async (name) => rm(join(layout.staging, name), { recursive: true, force: true })));
  await advanceGeneration(layout);
  return report;
};
