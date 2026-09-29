/**
 * A provider rooted at one directory of another, as a project's root bridge sees the workspace: the browser tier's
 * shared test facade (agent-host and seam suites).
 */
import type { FileSystemProvider } from '@taucad/filesystem';

/* oxlint-disable typescript/promise-function-async -- This test facade forwards provider promises unchanged. */
export const rootedProvider = (source: FileSystemProvider, root: string): FileSystemProvider => {
  const resolve = (path: string): string => `${root}/${path.replace(/^\/+/, '')}`;
  function readFile(path: string): Promise<Uint8Array<ArrayBuffer>>;
  function readFile(path: string, encoding: 'utf8'): Promise<string>;
  function readFile(path: string, encoding?: 'utf8'): Promise<string | Uint8Array<ArrayBuffer>> {
    return encoding === 'utf8' ? source.readFile(resolve(path), encoding) : source.readFile(resolve(path));
  }
  return {
    id: `rooted:${source.id}`,
    capabilities: source.capabilities,
    readFile,
    writeFile: (path, data) => source.writeFile(resolve(path), data),
    appendFile: (path, data) => source.appendFile!(resolve(path), data),
    readdir: (path) => source.readdir(resolve(path)),
    stat: (path) => source.stat(resolve(path)),
    lstat: (path) => source.lstat(resolve(path)),
    mkdir: (path, options) => source.mkdir(resolve(path), options),
    unlink: (path) => source.unlink(resolve(path)),
    rmdir: (path) => source.rmdir(resolve(path)),
    rename: (from, to) => source.rename(resolve(from), resolve(to)),
    exists: (path) => source.exists(resolve(path)),
    dispose: () => undefined,
  };
};
/* oxlint-enable typescript/promise-function-async -- Only the facade above forwards promises unchanged. */
