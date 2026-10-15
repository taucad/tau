import { createHash } from 'node:crypto';
import { lstat, mkdtemp, readdir, readFile, readlink, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { tar } from '#archive-builders.fixture.js';
import type { ArchiveEntry } from '#archive-entry.js';
import { writeArchiveEntries } from '#node.js';
import { readTarEntries } from '#tar.js';

const limits = { maximumUnpackedBytes: 1024 * 1024, maximumEntries: 1000 };
const sha256 = (text: string): string => createHash('sha256').update(text).digest('hex');
const pythonEntries = readTarEntries(
  tar(
    { name: 'python/bin/python3.13', data: 'ELF', mode: 0o775 },
    { name: 'python/bin/python3', type: '2', linkname: 'python3.13', mode: 0o777 },
    { name: 'python/lib/python3.13/os.py', data: 'import abc', mode: 0o664 },
    { name: 'python/share/terminfo/h/hp2621', data: 'terminfo', mode: 0o664 },
    { name: 'python/share/terminfo/2/2621', type: '2', linkname: '../h/hp2621', mode: 0o777 },
  ),
  { ...limits, stripComponents: 1 },
).entries;

/** Permission bits of a path, file type removed. */
const permissions = async (path: string): Promise<number> => {
  const { mode } = await lstat(path);
  return Number.parseInt(mode.toString(8).slice(-3), 8);
};

const entry = (path: string, text: string, extra: Partial<ArchiveEntry> = {}): ArchiveEntry => ({
  path,
  bytes: new TextEncoder().encode(text),
  ...extra,
});

describe('writeArchiveEntries', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'archive-core-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('should write files with their modes, keep symlinks and return the receipt rows hashed while writing', async () => {
    const rows = await writeArchiveEntries({ root, destination: 'python', entries: pythonEntries, links: 'symlink' });

    expect(rows).toEqual([
      { path: 'python/bin/python3.13', byteLength: 3, sha256: sha256('ELF'), mode: 0o775 },
      { path: 'python/bin/python3', byteLength: 3, sha256: sha256('ELF'), mode: 0o775, symlinkTarget: 'python3.13' },
      { path: 'python/lib/python3.13/os.py', byteLength: 10, sha256: sha256('import abc'), mode: 0o664 },
      { path: 'python/share/terminfo/h/hp2621', byteLength: 8, sha256: sha256('terminfo'), mode: 0o664 },
      {
        path: 'python/share/terminfo/2/2621',
        byteLength: 8,
        sha256: sha256('terminfo'),
        mode: 0o664,
        symlinkTarget: '../h/hp2621',
      },
    ]);
    expect(await permissions(join(root, 'python/bin/python3.13'))).toBe(0o775);
    expect(await permissions(join(root, 'python/lib/python3.13/os.py'))).toBe(0o664);
    expect(await readlink(join(root, 'python/share/terminfo/2/2621'))).toBe('../h/hp2621');
    expect(await readFile(join(root, 'python/bin/python3'), 'utf8')).toBe('ELF');
  });

  it('should copy links as their resolved files and record the same rows', async () => {
    const symlinked = await writeArchiveEntries({ root: join(root, 'a'), entries: pythonEntries, links: 'symlink' });
    const copied = await writeArchiveEntries({ root: join(root, 'b'), entries: pythonEntries, links: 'copy' });

    expect(copied).toEqual(symlinked);
    const copiedLink = await lstat(join(root, 'b/share/terminfo/2/2621'));

    expect(copiedLink.isSymbolicLink()).toBe(false);
    expect(await readFile(join(root, 'b/share/terminfo/2/2621'), 'utf8')).toBe('terminfo');
  });

  it('should keep every written file a descendant of the root', async () => {
    await writeArchiveEntries({ root, destination: 'python', entries: pythonEntries, links: 'symlink' });
    const realRoot = await realpath(root);

    const resolved = await Promise.all(
      pythonEntries.map(async ({ path }) => relative(realRoot, await realpath(join(root, 'python', path)))),
    );

    expect(resolved.every((path) => path.length > 0 && !path.startsWith('..') && !path.startsWith(sep))).toBe(true);
  });

  it('should default file modes to 0644 when the archive records none', async () => {
    const [row] = await writeArchiveEntries({ root, entries: [entry('plain.txt', 'x')] });

    expect(row?.mode).toBe(0o644);
    expect(await permissions(join(root, 'plain.txt'))).toBe(0o644);
  });

  it('should strip setuid, setgid and sticky bits', async () => {
    const [row] = await writeArchiveEntries({ root, entries: [entry('tool', 'x', { mode: 0o4755 })] });

    expect(row?.mode).toBe(0o755);
  });

  describe('refusals', () => {
    it.each([
      ['an escaping path', [entry('../outside', 'x')], 'unsafe-path'],
      ['an absolute path', [entry('/etc/passwd', 'x')], 'unsafe-path'],
      ['a dangling link', [entry('link', '', { symlinkTarget: 'missing' })], 'escaping-link'],
      ['a link above the root', [entry('link', '', { symlinkTarget: '../../etc/passwd' })], 'escaping-link'],
      [
        'a link loop',
        [entry('a', '', { symlinkTarget: 'b' }), entry('b', '', { symlinkTarget: 'a' })],
        'escaping-link',
      ],
      ['a link to a directory', [entry('dir/file', 'x'), entry('link', '', { symlinkTarget: 'dir' })], 'escaping-link'],
    ])('should refuse %s before writing anything', async (_label, entries, reason) => {
      await expect(writeArchiveEntries({ root, entries })).rejects.toMatchObject({
        code: 'EXTRACTION_REFUSED',
        reason,
      });
      expect(await readdir(root)).toEqual([]);
    });

    it('should refuse an escaping destination', async () => {
      await expect(
        writeArchiveEntries({ root, destination: '../sibling', entries: [entry('a', 'x')] }),
      ).rejects.toMatchObject({ code: 'EXTRACTION_REFUSED', reason: 'unsafe-path' });
    });

    it('should refuse a path another payload already wrote', async () => {
      await writeArchiveEntries({ root, entries: [entry('site-packages/shared.py', 'first')] });

      await expect(
        writeArchiveEntries({ root, entries: [entry('site-packages/shared.py', 'second')] }),
      ).rejects.toMatchObject({
        code: 'EXTRACTION_REFUSED',
        reason: 'duplicate-path',
        path: 'site-packages/shared.py',
      });
      expect(await readFile(join(root, 'site-packages/shared.py'), 'utf8')).toBe('first');
    });

    it('should stop when the signal is aborted', async () => {
      const controller = new AbortController();
      controller.abort(new Error('cancelled'));

      await expect(writeArchiveEntries({ root, entries: pythonEntries, signal: controller.signal })).rejects.toThrow(
        'cancelled',
      );
    });
  });
});
