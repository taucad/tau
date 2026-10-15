import { describe, expect, it } from 'vitest';

import { gzip, paxRecord, tar } from '#archive-builders.fixture.js';
import { ArchiveError } from '#archive-error.js';
import { gunzip } from '#bounded-stream.js';
import { readTarEntries } from '#tar.js';

const decoder = new TextDecoder();
const limits = { maximumUnpackedBytes: 1024 * 1024, maximumEntries: 1000 };

const summary = (bytes: Uint8Array<ArrayBuffer>, options: Parameters<typeof readTarEntries>[1]) => {
  const { entries, skipped } = readTarEntries(bytes, options);
  return {
    entries: entries.map(({ path, mode, symlinkTarget, bytes: data }) => ({
      path,
      mode,
      ...(symlinkTarget === undefined ? { text: decoder.decode(data) } : { symlinkTarget }),
    })),
    skipped,
  };
};

const refusal = (run: () => unknown): ArchiveError => {
  try {
    run();
  } catch (error) {
    if (error instanceof ArchiveError) {
      return error;
    }
    throw error;
  }
  return expect.fail('should have thrown an ArchiveError');
};

// The shape of a python-build-standalone `install_only` archive: everything under `python/`, executables 0755,
// eight same-directory symlinks on macOS, and terminfo links into sibling directories on Linux.
const pythonArchive = tar(
  { name: 'python/bin/python3.13', data: 'ELF', mode: 0o775 },
  { name: 'python/bin/python3', type: '2', linkname: 'python3.13', mode: 0o777 },
  { name: 'python/bin/python', type: '2', linkname: 'python3.13', mode: 0o777 },
  { name: 'python/lib/python3.13/os.py', data: 'import abc', mode: 0o664 },
  { name: 'python/share/terminfo/h/hp2621', data: 'terminfo', mode: 0o664 },
  { name: 'python/share/terminfo/2/2621', type: '2', linkname: '../h/hp2621', mode: 0o777 },
);

describe('readTarEntries', () => {
  describe('python-build-standalone shape', () => {
    it('should strip the top folder, keep contained symlinks and return recorded modes', async () => {
      const bytes = await gunzip(gzip(pythonArchive), limits);

      expect(summary(bytes, { ...limits, stripComponents: 1 })).toEqual({
        entries: [
          { path: 'bin/python3.13', mode: 0o775, text: 'ELF' },
          { path: 'bin/python3', mode: 0o777, symlinkTarget: 'python3.13' },
          { path: 'bin/python', mode: 0o777, symlinkTarget: 'python3.13' },
          { path: 'lib/python3.13/os.py', mode: 0o664, text: 'import abc' },
          { path: 'share/terminfo/h/hp2621', mode: 0o664, text: 'terminfo' },
          { path: 'share/terminfo/2/2621', mode: 0o777, symlinkTarget: '../h/hp2621' },
        ],
        skipped: [],
      });
    });

    it('should list regular files only and skip every link when links are skipped', () => {
      expect(summary(pythonArchive, { ...limits, stripComponents: 1, links: 'skip' }).skipped).toEqual([
        'bin/python3',
        'bin/python',
        'share/terminfo/2/2621',
      ]);
    });

    it('should take a long link target from a pax linkpath or GNU long-link header', () => {
      const deepTarget = `${'../'.repeat(2)}${'nested/'.repeat(20)}target`;
      const linkPath = `python/a/b/${'nested/'.repeat(20)}link`;

      const { entries } = readTarEntries(
        tar(
          { name: 'PaxHeader', type: 'x', data: paxRecord('linkpath', deepTarget) },
          { name: 'python/a/b/link', type: '2', linkname: 'ignored' },
          { name: '././@LongLink', type: 'K', data: `${deepTarget}\0` },
          { name: '././@LongLink', type: 'L', data: `${linkPath}\0` },
          { name: linkPath.slice(0, 100), type: '2', linkname: 'ignored' },
        ),
        { ...limits, stripComponents: 1 },
      );

      expect(entries.map(({ path, symlinkTarget }) => ({ path, symlinkTarget }))).toEqual([
        { path: 'a/b/link', symlinkTarget: deepTarget },
        { path: linkPath.slice('python/'.length), symlinkTarget: deepTarget },
      ]);
    });
  });

  describe('.NET runtime shape', () => {
    it('should keep the root `dotnet` executable when nothing is stripped', () => {
      const archive = tar(
        { name: './', type: '5' },
        { name: './dotnet', data: 'muxer', mode: 0o755 },
        { name: './host/fxr/10.0.11/libhostfxr.dylib', data: 'fxr', mode: 0o644 },
        { name: './LICENSE.txt', data: 'MIT' },
      );

      expect(summary(archive, limits).entries).toEqual([
        { path: 'dotnet', mode: 0o755, text: 'muxer' },
        { path: 'host/fxr/10.0.11/libhostfxr.dylib', mode: 0o644, text: 'fxr' },
        { path: 'LICENSE.txt', mode: 0o644, text: 'MIT' },
      ]);
    });
  });

  describe('hostile entries', () => {
    it.each(['python/../evil', '/etc/passwd', String.raw`python\evil`])(
      'should refuse the unsafe entry path %j',
      (name) => {
        const error = refusal(() => readTarEntries(tar({ name, data: 'x' }), limits));

        expect([error.code, error.reason, error.path]).toEqual(['EXTRACTION_REFUSED', 'unsafe-path', name]);
      },
    );

    it('should refuse a pax path override that escapes the root', () => {
      const error = refusal(() =>
        readTarEntries(
          tar({ name: 'PaxHeader', type: 'x', data: paxRecord('path', 'python/../../x') }, { name: 'python/x' }),
          limits,
        ),
      );

      expect([error.code, error.reason, error.path]).toEqual(['EXTRACTION_REFUSED', 'unsafe-path', 'python/../../x']);
    });

    it.each([
      ['an absolute target', '/etc/passwd'],
      ['a target above the root', '../../outside'],
      ['a backslashed target', String.raw`..\..\outside`],
    ])('should refuse a symlink with %s', (_label, linkname) => {
      const error = refusal(() =>
        readTarEntries(tar({ name: 'python/bin/sh', type: '2', linkname }), { ...limits, stripComponents: 1 }),
      );

      expect([error.code, error.reason, error.path]).toEqual(['EXTRACTION_REFUSED', 'escaping-link', 'python/bin/sh']);
    });

    it.each([
      ['a hardlink', '1'],
      ['a character device', '3'],
      ['a block device', '4'],
      ['a FIFO', '6'],
    ])('should refuse %s', (_label, type) => {
      const error = refusal(() => readTarEntries(tar({ name: 'python/dev/node', type }), limits));

      expect([error.code, error.reason]).toEqual(['EXTRACTION_REFUSED', 'special-entry']);
    });

    it('should refuse a header with a corrupted checksum', () => {
      const archive = tar({ name: 'python/x', data: 'x' });
      archive[0] = 0x71;

      expect(() => readTarEntries(archive, limits)).toThrow('Tar header at byte 0 has an invalid checksum.');
    });

    it('should refuse a truncated archive', () => {
      const archive = tar({ name: 'python/x', data: 'x'.repeat(600) }).subarray(0, 1024);

      expect(refusal(() => readTarEntries(new Uint8Array(archive), limits)).message).toBe('Tarball is truncated.');
    });
  });

  describe('caps are inputs', () => {
    it('should refuse more entries than the caller admits', () => {
      const archive = tar({ name: 'a/1', data: '1' }, { name: 'a/2', data: '2' }, { name: 'a/3', data: '3' });

      expect(readTarEntries(archive, { ...limits, maximumEntries: 3 }).entries).toHaveLength(3);
      const error = refusal(() => readTarEntries(archive, { ...limits, maximumEntries: 2 }));
      expect([error.reason, error.message]).toEqual(['limit', 'Tarball has more than 2 entries.']);
    });

    it('should refuse more unpacked bytes than the caller admits', () => {
      const archive = tar({ name: 'a/1', data: '12345' }, { name: 'a/2', data: '67890' });

      expect(readTarEntries(archive, { ...limits, maximumUnpackedBytes: 10 }).entries).toHaveLength(2);
      expect(refusal(() => readTarEntries(archive, { ...limits, maximumUnpackedBytes: 9 })).reason).toBe('limit');
    });

    it('should refuse gzip output beyond the caller cap', async () => {
      const archive = gzip(tar({ name: 'a/1', data: 'x'.repeat(4096) }));

      await expect(gunzip(archive, { maximumUnpackedBytes: 4096 })).rejects.toMatchObject({
        code: 'EXTRACTION_REFUSED',
        reason: 'limit',
        message: 'Stream exceeds 4096 bytes.',
      });
    });

    it('should reject bytes that are not gzip', async () => {
      await expect(gunzip(new TextEncoder().encode('not gzip'), limits)).rejects.toThrow(TypeError);
    });
  });
});
