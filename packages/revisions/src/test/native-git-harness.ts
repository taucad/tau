import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import type { Checkout, RevisionPort } from '#revision-port.js';
import { createNativeGitRevisionPort } from '#native-git-port.js';

/** Whether the native Git fixture can run on this host. @internal */
export const gitOnPath = ((): boolean => {
  try {
    execFileSync('git', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

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
    dispose: async () => rm(root, { force: true, recursive: true }),
  };
};
