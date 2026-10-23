import { constants, watch } from 'node:fs';
import { lstat, open, opendir, realpath } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { projectPathSchema } from '@taucad/workbench';
import { sceneLimits } from '#experiments/filesystem-scene/scene.js';
import type { SceneResult, SceneSource } from '#experiments/filesystem-scene/scene.js';

// Local Linux spike host, not an authorization boundary. Production must supply
// the existing composed agent-rooted provider and its policy-masked watch stream.
export const createNodeSceneSource = async (directory: string): Promise<SceneSource> => {
  const root = resolve(directory);
  const rootStat = await lstat(root);
  if ((await realpath(root)) !== root || !rootStat.isDirectory()) {
    throw new Error('Project root must be a real directory, without symlink components.');
  }
  const checked = async (path: string): Promise<string> => {
    projectPathSchema.parse(path);
    const currentRoot = await lstat(root);
    if (currentRoot.dev !== rootStat.dev || currentRoot.ino !== rootStat.ino) {
      throw new Error('Project root identity changed; reopen the source.');
    }
    let native = root;
    for (const part of path.split('/')) {
      native = join(native, part);
      // oxlint-disable-next-line no-await-in-loop -- Validate each ancestor before resolving the next component.
      const entry = await lstat(native);
      if (entry.isSymbolicLink()) {
        throw new Error('Scene paths must not traverse symlinks.');
      }
    }
    if ((await realpath(native)) !== native) {
      throw new Error('Scene path changed while resolving.');
    }
    return native;
  };
  return {
    async read(path, maxBytes) {
      const native = await checked(path);
      // oxlint-disable-next-line no-bitwise -- Node open flags are a bitmask.
      const file = await open(native, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
      try {
        const before = await file.stat();
        if (!before.isFile() || before.nlink !== 1 || before.size > maxBytes) {
          throw new Error('Expected a bounded regular file without hard links.');
        }
        // Pin the opened identity, not just the path checked before open. Linux
        // /proc validates the descriptor even if an ancestor was replaced.
        if (
          process.platform !== 'linux' ||
          (await realpath(`/proc/self/fd/${file.fd}`)) !== native ||
          !native.startsWith(`${root}${sep}`)
        ) {
          throw new Error('Opened file is outside the admitted Linux project identity.');
        }
        const bytes = new Uint8Array(before.size + 1);
        let length = 0;
        while (length < bytes.length) {
          // oxlint-disable-next-line no-await-in-loop -- Offset depends on the preceding short read.
          const result = await file.read(bytes, length, bytes.length - length, length);
          if (!result.bytesRead) {
            break;
          }
          length += result.bytesRead;
        }
        const after = await file.stat();
        if (length !== before.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) {
          throw new Error('File changed while reading.');
        }
        return bytes.slice(0, length);
      } finally {
        await file.close();
      }
    },
    async list(path) {
      const native = await checked(path);
      const directory = await opendir(native);
      const files: string[] = [];
      let examined = 0;
      for await (const entry of directory) {
        if (++examined > 1024) {
          throw new Error('Staging directory exceeds the 1024-entry scan budget.');
        }
        if (!entry.name.endsWith('.glb')) {
          continue;
        }
        if (!entry.isFile()) {
          throw new Error('Staged GLB assets must be regular files.');
        }
        files.push(`${path}/${entry.name}`);
        if (files.length > sceneLimits.assets) {
          throw new Error('Too many staged GLB assets.');
        }
      }
      return files;
    },
  };
};

export const watchScene = (options: {
  root: string;
  reconcile: () => Promise<SceneResult>;
  invalidate: () => void;
  report: (result: SceneResult) => void;
  pollMilliseconds?: number;
  debounceMilliseconds?: number;
}): { dispose: () => void } => {
  const lifecycle = { closed: false };
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running = false;
  let pending = false;
  const isClosed = (): boolean => lifecycle.closed;
  const hasPending = (): boolean => pending;
  const run = async (): Promise<void> => {
    if (lifecycle.closed) {
      return;
    }
    if (running) {
      pending = true;
      return;
    }
    running = true;
    try {
      do {
        pending = false;
        // oxlint-disable-next-line no-await-in-loop -- Serialize reconciliation and drain one coalesced pending hint.
        const result = await options.reconcile();
        if (!isClosed()) {
          options.report(result);
        }
      } while (hasPending() && !isClosed());
    } finally {
      running = false;
    }
  };
  const schedule = (): void => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      // oxlint-disable-next-line promise/prefer-await-to-then -- Timer callbacks explicitly contain asynchronous failures.
      run().catch((error: unknown) => {
        if (!isClosed()) {
          options.report({ status: 'invalid-preserved', message: String(error), revision: undefined });
        }
      });
    }, options.debounceMilliseconds ?? 100);
  };
  // Root-directory watch survives individual file replacements. Periodic full
  // reconciliation is the correctness path, including lost/overflow events.
  let watcher: ReturnType<typeof watch> | undefined;
  try {
    const hint = (): void => {
      options.invalidate();
      schedule();
    };
    watcher = watch(options.root, { recursive: true }, hint);
    watcher.on('error', hint);
  } catch {
    /* Polling still works if this host cannot watch. */
  }
  const pollInterval = setInterval(schedule, Math.max(250, options.pollMilliseconds ?? 1000));
  schedule(); // Startup/restart always reconciles actual bytes.
  return {
    dispose(): void {
      lifecycle.closed = true;
      clearTimeout(timer);
      clearInterval(pollInterval);
      watcher?.close();
    },
  };
};
