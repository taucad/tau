/** Electron Open With queue captured before app readiness and consumed by the import route. */

import { readFile, realpath, stat } from 'node:fs/promises';
import { basename, isAbsolute } from 'node:path';

import type { DesktopOpenFile } from '#shared/quick-look.js';

type OpenFileQueueOptions = {
  readonly extensions: readonly string[];
  readonly maxBytes: number;
  readonly maxFiles: number;
};

type OpenFileQueue = {
  readonly consume: () => Promise<DesktopOpenFile[]>;
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
    async consume(): Promise<DesktopOpenFile[]> {
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
          const bytes = Uint8Array.from(await readFile(canonical));
          if (bytes.byteLength > options.maxBytes) {
            throw new Error(`Opened file grew beyond the byte limit: ${basename(path)}`);
          }
          return { name: basename(path), bytes };
        }),
      );
    },
  };
};
