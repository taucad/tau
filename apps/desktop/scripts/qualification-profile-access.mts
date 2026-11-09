/**
 * Everything the route orchestrator reads or writes in the app's profile, and the app's process liveness. On a Linux
 * clean host the profile (under the consumer's 0750/0700 home) and the processes belong to the consumer account, so
 * this administrator process reaches them only through the consumer's agent; elsewhere they are local.
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, realpath, rename, rm, stat, writeFile } from 'node:fs/promises';
// oxlint-disable-next-line no-restricted-imports -- The consumer agent's interface is a private qualification owner.
import type { LinuxConsumer } from './qualification-linux-consumer.mjs';

export type ProfileAccess = {
  mkdir(path: string, recursive: boolean): Promise<void>;
  /** Throws when the file is absent, like `readFile`. */
  read(path: string): Promise<Uint8Array<ArrayBuffer>>;
  writeJson(path: string, value: unknown): Promise<void>;
  /** `undefined` when the file is absent. */
  size(path: string): Promise<number | undefined>;
  readdir(path: string): Promise<string[]>;
  realpath(path: string): Promise<string>;
  rm(path: string): Promise<void>;
  sha256(path: string): Promise<string>;
  alive(pid: number): Promise<boolean>;
  terminate(pid: number): Promise<void>;
};
const absent = (error: unknown): boolean => error instanceof Error && 'code' in error && error.code === 'ENOENT';
export const localProfile: ProfileAccess = {
  mkdir: async (path, recursive) => {
    await mkdir(path, { recursive });
  },
  read: async (path) => {
    const bytes = await readFile(path);
    return new Uint8Array(bytes);
  },
  writeJson: async (path, value) => {
    await writeFile(`${path}.tmp`, JSON.stringify(value), { mode: 0o600 });
    await rename(`${path}.tmp`, path);
  },
  size: async (path) => {
    try {
      const info = await stat(path);
      return info.size;
    } catch (error) {
      if (absent(error)) {
        return undefined;
      }
      throw error;
    }
  },
  readdir: async (path) => {
    try {
      return await readdir(path);
    } catch (error) {
      if (absent(error)) {
        return [];
      }
      throw error;
    }
  },
  realpath: async (path) => realpath(path),
  rm: async (path) => rm(path, { force: true }),
  sha256: async (path) => {
    const bytes = await readFile(path);
    return createHash('sha256').update(bytes).digest('hex');
  },
  alive: async (pid) => {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  },
  terminate: async (pid) => {
    process.kill(pid, 'SIGTERM');
  },
};
/** The consumer agent's view of the same operations; none of them touches this process's own filesystem view. */
export const consumerProfile = (
  consumer: Pick<
    LinuxConsumer,
    | 'mkdir'
    | 'mkdirOne'
    | 'readFile'
    | 'writeFile'
    | 'stat'
    | 'readdir'
    | 'realpath'
    | 'rm'
    | 'sha256'
    | 'alive'
    | 'signal'
  >,
): ProfileAccess => ({
  mkdir: async (path, recursive) => (recursive ? consumer.mkdir(path) : consumer.mkdirOne(path)),
  read: async (path) => {
    const bytes = await consumer.readFile(path);
    if (!bytes) {
      throw Object.assign(new Error(`ENOENT: ${path}`), { code: 'ENOENT' });
    }
    return bytes;
  },
  writeJson: async (path, value) => consumer.writeFile(path, JSON.stringify(value)),
  size: async (path) => {
    const info = await consumer.stat(path);
    return info?.size;
  },
  readdir: async (path) => {
    const entries = await consumer.readdir(path);
    return entries ?? [];
  },
  realpath: async (path) => consumer.realpath(path),
  rm: async (path) => consumer.rm(path),
  sha256: async (path) => consumer.sha256(path),
  alive: async (pid) => consumer.alive(pid),
  terminate: async (pid) => consumer.signal(pid, 'SIGTERM'),
});
