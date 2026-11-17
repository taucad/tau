import { execFileSync } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readFile, readdir, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import type { Checkout, RevisionPort } from '#revision-port.js';
import { createNativeGitRevisionPort } from '#native-git-port.js';
import { resolveGitToolchain } from '#git-toolchain.js';

/**
 * Whether this host has the toolchain a native store records with: `git` and
 * `git lfs`, probed exactly as a disk host probes them (`resolveGitToolchain`).
 *
 * A native suite gated on `git` alone fails product-shaped on a machine without
 * `git-lfs` (the host refuses, large objects are never pointerised), which is
 * indistinguishable from a real regression. Gate every native suite on this.
 *
 * @internal
 */
export const gitToolchainOnPath = await resolveGitToolchain().then(
  () => true,
  () => false,
);

const directoryFiles = async (directory: string, path = ''): Promise<readonly string[]> => {
  const entries = await readdir(join(directory, path), { withFileTypes: true }).catch(() => []);
  const nested = await Promise.all(
    entries
      .filter((entry) => entry.name !== '.git')
      .map(async (entry) => {
        const child = path === '' ? entry.name : `${path}/${entry.name}`;
        return entry.isDirectory() ? directoryFiles(directory, child) : [child];
      }),
  );
  return nested.flat().toSorted();
};

/**
 * `rm` options for a test's temporary roots. Windows refuses to remove a
 * directory (EBUSY, ENOTEMPTY) while a git child that just exited, or one a
 * stopped actor's background read started, still holds a handle in it; Node
 * retries those codes, with a short backoff, only when asked.
 *
 * @internal
 */
export const removalRetries = Object.freeze({ maxRetries: 5, retryDelay: 100 });

/**
 * Whether this host's temporary disk keeps a file's executable bit. NTFS has
 * none: Windows' `chmod` sets only the read-only flag, so a change of mode
 * alone cannot happen there.
 *
 * @internal
 */
export const diskKeepsExecutableBit = await (async () => {
  const directory = await mkdtemp(join(tmpdir(), 'tau-revisions-mode-'));
  try {
    const file = join(directory, 'probe');
    await writeFile(file, '');
    await chmod(file, 0o755);
    const { mode } = await stat(file);
    return Math.floor(mode / 0o100) % 2 === 1;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
})();

/**
 * A test's timeout for file-heavy work: ten times as long on Windows. Measured
 * on the hosted windows-2025 runner (run 44003602977), writing 2,000 new files
 * through the Node provider took 35,181 ms against 3,741 ms on Linux, 9.4
 * times as long: each file there is its own create, handle sync and rename.
 *
 * @param milliseconds - The timeout elsewhere.
 * @returns The timeout on this platform.
 * @internal
 */
export const fileHeavyTimeout = (milliseconds: number): number =>
  process.platform === 'win32' ? milliseconds * 10 : milliseconds;

/** A real native Git repository outside the checkout. @internal */
export type NativeGitHarness = Readonly<{
  root: string;
  port: RevisionPort;
  readGenerated: (path: string) => Promise<string>;
  liveRoot: string;
  checkoutFiles: (checkout: Checkout) => Promise<readonly string[]>;
  writeCheckoutFile: (checkout: Checkout, path: string, content: string) => Promise<void>;
  reopen: () => RevisionPort;
  withTransport: () => RevisionPort;
  writeRawRef: (name: string, head: string) => Promise<void>;
  dispose: () => Promise<void>;
}>;

/**
 * Create the native harness shared by effect and port conformance rows.
 *
 * @internal
 * @param projectId - Project identity reported by its checkouts.
 * @param prefix - Temporary-directory prefix for test attribution.
 * @returns The native port, worktree helpers, and cleanup handle.
 */
export const nativeHarness = async (projectId: string, prefix: string): Promise<NativeGitHarness> => {
  const root = await mkdtemp(join(tmpdir(), prefix));
  const repositoryPath = join(root, 'project');
  await mkdir(repositoryPath, { recursive: true });
  // Never inside the repository's own worktree: native Git refuses that.
  const checkouts = { projectId, directory: join(root, 'checkouts') };
  const create = (): RevisionPort => createNativeGitRevisionPort({ repositoryPath, checkouts });
  return {
    root,
    port: create(),
    withTransport: create,
    writeRawRef: async (name, head) => {
      execFileSync('git', ['update-ref', name, head], { cwd: repositoryPath, stdio: 'ignore' });
    },
    readGenerated: async (path) => readFile(join(repositoryPath, path), 'utf8'),
    // Git reports a resolved path, and on macOS that is `/private/var/…`.
    liveRoot: await realpath(repositoryPath),
    checkoutFiles: async (checkout) => directoryFiles(checkout.root),
    writeCheckoutFile: async (checkout, path, content) => {
      await mkdir(dirname(join(checkout.root, path)), { recursive: true });
      await writeFile(join(checkout.root, path), content);
    },
    reopen: create,
    dispose: async () => rm(root, { force: true, recursive: true, ...removalRetries }),
  };
};
