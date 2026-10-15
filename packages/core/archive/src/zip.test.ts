import { describe, expect, it } from 'vitest';

import { zip } from '#archive-builders.fixture.js';
import { ArchiveError } from '#archive-error.js';
import { crc32, readZipEntries } from '#zip.js';

const decoder = new TextDecoder();
const limits = { maximumUnpackedBytes: 1024 * 1024, maximumEntries: 100 };
const text = 'deflate me '.repeat(50);

const files = async (bytes: Uint8Array<ArrayBuffer>, options = limits) => {
  const { entries } = await readZipEntries(bytes, options);
  return entries.map(({ path, mode, bytes: data }) => ({ path, mode, text: decoder.decode(data) }));
};

describe('readZipEntries', () => {
  it('should read stored and deflated members with Unix modes and implied directories', async () => {
    const archive = zip([
      { name: 'pkg/', mode: 0o4_0755 },
      { name: 'pkg/stored.txt', data: 'stored', method: 0 },
      { name: 'pkg/deflated.txt', data: text, method: 8 },
      { name: 'pkg/tool', data: '#!', method: 8, mode: 0o10_0755 },
    ]);

    expect(await files(archive)).toEqual([
      { path: 'pkg/stored.txt', mode: 0o644, text: 'stored' },
      { path: 'pkg/deflated.txt', mode: 0o644, text },
      { path: 'pkg/tool', mode: 0o755, text: '#!' },
    ]);
  });

  it('should read ZIP64 extras and end records', async () => {
    const archive = zip(
      [
        { name: 'a.txt', data: 'a', method: 0 },
        { name: 'b.txt', data: text, method: 8 },
      ],
      { zip64: true },
    );

    const members = await files(archive);

    expect(members.map(({ path, text: contents }) => [path, contents.length])).toEqual([
      ['a.txt', 1],
      ['b.txt', text.length],
    ]);
  });

  it('should strip leading components and skip members left with no path', async () => {
    const archive = zip([
      { name: 'root/', mode: 0o4_0755 },
      { name: 'root/inner/file.txt', data: 'x' },
      { name: 'top.txt', data: 'y' },
    ]);

    const contents = await readZipEntries(archive, { ...limits, stripComponents: 1 });

    expect({ paths: contents.entries.map(({ path }) => path), skipped: contents.skipped }).toEqual({
      paths: ['inner/file.txt'],
      skipped: ['top.txt'],
    });
  });

  it('should match the zlib CRC-32 of the member bytes', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcb_f4_39_26);
  });

  describe('refusals', () => {
    it.each([
      {
        label: 'an escaping path',
        members: [{ name: '../evil.py', data: 'x' }],
        code: 'EXTRACTION_REFUSED',
        reason: 'unsafe-path',
      },
      {
        label: 'an absolute path',
        members: [{ name: '/etc/passwd', data: 'x' }],
        code: 'EXTRACTION_REFUSED',
        reason: 'unsafe-path',
      },
      {
        label: 'a backslashed path',
        members: [{ name: String.raw`a\..\..\evil`, data: 'x' }],
        code: 'EXTRACTION_REFUSED',
        reason: 'unsafe-path',
      },
      {
        label: 'a duplicate name',
        members: [
          { name: 'a', data: '1' },
          { name: 'a', data: '2' },
        ],
        code: 'EXTRACTION_REFUSED',
        reason: 'duplicate-path',
      },
      {
        label: 'a corrupt CRC-32',
        members: [{ name: 'a', data: 'x', crc: 1 }],
        code: 'EXTRACTION_REFUSED',
        reason: 'malformed',
      },
      {
        label: 'an encrypted member',
        members: [{ name: 'a', data: 'x', flags: 0x1 }],
        code: 'UNSUPPORTED_FEATURE',
        reason: 'encryption',
      },
      {
        label: 'a bzip2 member',
        members: [{ name: 'a', data: 'x', labelMethod: 12 }],
        code: 'UNSUPPORTED_FEATURE',
        reason: 'compression-method',
      },
      {
        label: 'a symlink',
        members: [{ name: 'link', data: 'target', mode: 0o12_0777 }],
        code: 'UNSUPPORTED_FEATURE',
        reason: 'zip-symlink',
      },
    ] as const)('should refuse $label', async ({ members, code, reason }) => {
      await expect(readZipEntries(zip(members), limits)).rejects.toMatchObject({ name: 'ArchiveError', code, reason });
    });

    it('should refuse bytes with no end of central directory', async () => {
      await expect(readZipEntries(new Uint8Array(64), limits)).rejects.toThrow(
        'Zip end of central directory not found.',
      );
    });
  });

  describe('caps are inputs', () => {
    it('should refuse a declared total above the cap before inflating anything', async () => {
      const archive = zip([{ name: 'big', data: 'x'.repeat(2048) }]);

      expect(await files(archive, { ...limits, maximumUnpackedBytes: 2048 })).toHaveLength(1);
      const refusal = await readZipEntries(archive, { ...limits, maximumUnpackedBytes: 2047 }).catch(
        (error: unknown) => error,
      );
      expect(refusal).toBeInstanceOf(ArchiveError);
      expect(refusal).toMatchObject({ code: 'EXTRACTION_REFUSED', reason: 'limit' });
    });

    it('should refuse more entries than the caller admits', async () => {
      const archive = zip([
        { name: 'a', data: '1' },
        { name: 'b', data: '2' },
      ]);

      await expect(readZipEntries(archive, { ...limits, maximumEntries: 1 })).rejects.toMatchObject({
        reason: 'limit',
        message: 'Zip archive has more than 1 entries.',
      });
    });
  });
});
