/* oxlint-disable no-await-in-loop -- Closures are copied one at a time. */
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { cp, mkdir, readdir, readFile, rename, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { promisify } from 'node:util';

import type { DesktopSession } from '#support/desktop-app.js';
import { expectGeometryFramed } from '#support/scenario.js';

/**
 * Prepared native kernels for the desktop suite.
 *
 * The app ships no kernel closure: a native kernel (Build123d, PicoGK, SMLibPy) downloads on first use into the
 * payload store, `<TAU_CONFIG_DIR>/payloads`, which the fixture gives every launch afresh. So the suite does not
 * download a few hundred megabytes per spec, it keeps one store of sealed closures for the whole run: before a launch
 * the fixture copies them into the launch's store, where main composes and links them at startup like any other
 * ready closure, and when the session closes it copies back any closure the launch prepared. A spec that exercises
 * the first-use download itself launches with `preparedKernels: false`.
 */

const workspaceRoot = resolve(import.meta.dirname, '../../../..');
/** Reproducible from the pins in each native package's `tau-plugin.json`, so a dependency reinstall may delete it. */
const cacheRoot = join(workspaceRoot, 'node_modules/.cache/desktop-e2e/payloads');
const execFileAsync = promisify(execFile);

/* Through the session rather than from `playwright`, which only the suite's driver boundary imports. */
type Page = DesktopSession['page'];
type Locator = ReturnType<Page['locator']>;

/**
 * How long the first render of a native model may take: the kernel may still have to download (a cold cache, or the
 * first-use spec), which a slow runner's network takes minutes for. Specs add it to their test timeout.
 */
export const firstNativeRenderMilliseconds = 600_000;

/** Where a store keeps its sealed closures, one directory per closure digest. */
const closuresOf = (store: string): string => join(store, 'closures', 'sha256');

/** A closure's seal, or `undefined` while it is unsealed (being prepared or repaired) or absent. */
const receiptOf = async (closure: string): Promise<string | undefined> => {
  try {
    return await readFile(join(closure, 'receipt.json'), 'utf8');
  } catch {
    return undefined;
  }
};

/** APFS clones through BSD `cp -c` on macOS (`fs.cp` byte-copies), a plain recursive copy elsewhere. */
const copyTree = async (source: string, target: string): Promise<void> => {
  if (process.platform === 'darwin') {
    await execFileAsync('/bin/cp', ['-c', '-R', source, target]);
    return;
  }
  await cp(source, target, { recursive: true, verbatimSymlinks: true });
};

/**
 * Copy every cached closure the store lacks into it, before the app opens the store.
 * @param store - The launch's payload store, `<TAU_CONFIG_DIR>/payloads`.
 * @returns Nothing.
 */
export const restorePreparedKernels = async (store: string): Promise<void> => {
  const cached = await readdir(closuresOf(cacheRoot)).catch(() => []);
  if (cached.length === 0) {
    return;
  }
  await mkdir(closuresOf(store), { recursive: true });
  const present = new Set(await readdir(closuresOf(store)));
  for (const key of cached) {
    if (!present.has(key) && (await receiptOf(join(closuresOf(cacheRoot), key))) !== undefined) {
      await copyTree(join(closuresOf(cacheRoot), key), join(closuresOf(store), key));
    }
  }
};

/**
 * Copy every sealed closure of the store that the cache lacks, or holds with another seal, into the cache. Each
 * closure is copied beside its place and renamed in, so a concurrent reader never sees a partial one; when another
 * session got there first, its copy stands.
 * @param store - The closed session's payload store; nothing may still be preparing in it.
 * @returns Nothing.
 */
export const savePreparedKernels = async (store: string): Promise<void> => {
  const prepared = await readdir(closuresOf(store)).catch(() => []);
  for (const key of prepared) {
    const source = join(closuresOf(store), key);
    const target = join(closuresOf(cacheRoot), key);
    const receipt = await receiptOf(source);
    if (receipt === undefined || receipt === (await receiptOf(target))) {
      continue;
    }
    await mkdir(closuresOf(cacheRoot), { recursive: true });
    const staged = join(closuresOf(cacheRoot), `.${key}.${randomUUID()}`);
    try {
      await copyTree(source, staged);
      // A closure sealed again (a newer Tau) replaces the cached one.
      await rm(target, { recursive: true, force: true });
      await rename(staged, target).catch(() => undefined);
    } finally {
      await rm(staged, { recursive: true, force: true });
    }
  }
};

/**
 * The viewer's notice for a native kernel downloading on first use (`chat-stack-trace.tsx`).
 * @param page - The renderer.
 * @returns The notice, which holds a `Download progress` bar and a Cancel button.
 */
export const nativeKernelDownloadNotice = (page: Page): Locator =>
  page.getByRole('status').filter({ hasText: /^Downloading the .+ kernel runtime/u });

/**
 * Wait for a native model's first framed render, which on a cold cache waits for its kernel to download first.
 * @param page - The renderer.
 * @returns Nothing.
 */
export const expectFirstNativeRender = async (page: Page): Promise<void> => {
  try {
    await expectGeometryFramed(page, firstNativeRenderMilliseconds);
  } catch (error) {
    const issues = await page
      .getByRole('region', { name: 'Issues', exact: true })
      .textContent({ timeout: 1000 })
      .catch(() => '(no issues listed)');
    throw new Error(`The first native render did not complete. Viewer issues: ${issues}`, { cause: error });
  }
};
