/**
 * A native watch leaves nothing a child process inherits.
 *
 * Every process the host starts after a watch (a shell launch's bubblewrap among them) gets each descriptor of the
 * host that is not close-on-exec. Left to choose its backend, @parcel/watcher probed for watchman through `popen` and
 * kept that pipe's read end open without close-on-exec, which reached the sandboxed shell as descriptor 23 (shell
 * qualification E05). Its own file: the native backend is one per process, so a watch another file opened first
 * would hide the probe.
 */

import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, readdir, readlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { NodeFsProvider } from '#backend/node/provider.js';

/** `O_CLOEXEC` (octal 02000000), the bit `/proc/<pid>/fdinfo` reports in `flags`. */
const closeOnExec = 2 ** 19;

/** This process's descriptors above the standard streams that a child would inherit, with what each one holds. */
const inheritable = async (): Promise<ReadonlyMap<number, string>> => {
  const held = new Map<number, string>();
  for (const name of await readdir('/proc/self/fd')) {
    const fd = Number(name);
    if (fd <= 2) {
      continue;
    }
    try {
      // oxlint-disable-next-line no-await-in-loop -- one descriptor at a time, so a closed one is simply skipped.
      const info = await readFile(`/proc/self/fdinfo/${name}`, 'utf8');
      const flags = Number.parseInt(/flags:\s+(?<flags>\d+)/u.exec(info)?.groups?.['flags'] ?? '0', 8);
      if (Math.floor(flags / closeOnExec) % 2 === 0) {
        // oxlint-disable-next-line no-await-in-loop -- as above.
        held.set(fd, await readlink(`/proc/self/fd/${name}`));
      }
    } catch {
      /* The listing's own directory handle, closed by the time it is read. */
    }
  }
  return held;
};

/** What a child process started now holds above the standard streams, by what each descriptor points at. */
const childDescriptors = (): readonly string[] =>
  execFileSync(
    '/bin/sh',
    ['-c', 'for fd in /proc/self/fd/*; do [ "$(basename "$fd")" -gt 2 ] && readlink "$fd"; done; true'],
    {
      encoding: 'utf8',
    },
  )
    .split('\n')
    /* The loop's own listing of the directory: gone by the time it is read, or a `/proc` path. */
    .filter((target) => target !== '' && !target.startsWith('/proc/'));

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map(async (root) => rm(root, { recursive: true, force: true })));
});

describe.runIf(process.platform === 'linux')('a native watch and the processes started after it', () => {
  it('should leave no descriptor a child inherits', async () => {
    const root = await mkdtemp(join(tmpdir(), 'tau-watch-descriptors-'));
    roots.push(root);
    const before = await inheritable();
    const childBefore = childDescriptors();

    const stop = await new NodeFsProvider(root).watch({ paths: [''], recursive: true }, () => undefined);
    try {
      const after = await inheritable();
      const added = [...after].filter(([fd]) => !before.has(fd)).map(([fd, target]) => `${String(fd)} -> ${target}`);
      expect(added).toEqual([]);
      expect(childDescriptors().toSorted()).toEqual([...childBefore].toSorted());
    } finally {
      stop();
    }
  });
});
