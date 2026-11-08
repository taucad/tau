/** Electron Open With queue captured before app readiness and consumed by the import route. */

import { realpath, stat } from 'node:fs/promises';
import { basename, isAbsolute } from 'node:path';

import type { DesktopOpenFile } from '#shared/quick-look.js';

type OpenFileQueueOptions = {
  readonly extensions: readonly string[];
  readonly maxBytes: number;
  readonly maxFiles: number;
  /** Mint the import grant the services host copies the file by (W7.4): the bytes stay on the host. */
  readonly grant: (path: string, owner: number) => Promise<Readonly<{ grant: string; name: string }>>;
};

type OpenFileQueue = {
  /** Hand the queued files to the window that asked, as grants scoped to it. */
  readonly consume: (owner: number) => Promise<DesktopOpenFile[]>;
  readonly enqueue: (candidates: readonly string[]) => number;
  readonly hasPending: () => boolean;
};

const hasExtension = (path: string, extensions: readonly string[]): boolean => {
  const name = basename(path).toLowerCase();
  return extensions.some((extension) => name.endsWith(`.${extension}`));
};

/** Preserve OS-opened paths until the trusted renderer import flow is ready. */
export const createOpenFileQueue = (options: OpenFileQueueOptions): OpenFileQueue => {
  const paths: string[] = [];

  return {
    enqueue(candidates: readonly string[]): number {
      for (const path of candidates) {
        if (
          paths.length < options.maxFiles &&
          isAbsolute(path) &&
          hasExtension(path, options.extensions) &&
          !paths.includes(path)
        ) {
          paths.push(path);
        }
      }
      return paths.length;
    },
    hasPending: (): boolean => paths.length > 0,
    async consume(owner: number): Promise<DesktopOpenFile[]> {
      const queued = paths.splice(0);
      return Promise.all(
        queued.map(async (path) => {
          const canonical = await realpath(path);
          const metadata = await stat(canonical);
          if (!metadata.isFile() || metadata.size <= 0 || metadata.size > options.maxBytes) {
            throw new Error(
              `Tau refused opened file outside the 1–${String(options.maxBytes)} byte limit: ${basename(path)}`,
            );
          }
          const { grant } = await options.grant(canonical, owner);
          return { name: basename(path), grant };
        }),
      );
    },
  };
};
