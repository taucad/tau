import { gzipSync } from 'node:zlib';

import { describe, expect, it } from 'vitest';

import { gunzip, readTarEntries } from '#tarball.js';

type TestEntry = { readonly name: string; readonly data?: string; readonly type?: string; readonly prefix?: string };

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const header = (entry: TestEntry, size: number): Uint8Array<ArrayBuffer> => {
  const block = new Uint8Array(512);
  const put = (value: string, start: number): void => {
    block.set(encoder.encode(value), start);
  };
  put(entry.name.slice(0, 100), 0);
  put('0000644\0', 100);
  put(`${size.toString(8).padStart(11, '0')}\0`, 124);
  put(entry.type ?? '0', 156);
  put('ustar\u000000', 257);
  put(entry.prefix ?? '', 345);
  block.fill(0x20, 148, 156);
  put(
    `${block
      .reduce((sum, byte) => sum + byte, 0)
      .toString(8)
      .padStart(6, '0')}\0 `,
    148,
  );
  return block;
};

/** Build an uncompressed ustar archive by hand so the reader is tested against the format, not a library. */
const tar = (...entries: readonly TestEntry[]): Uint8Array<ArrayBuffer> => {
  const blocks: Array<Uint8Array<ArrayBuffer>> = [];
  for (const entry of entries) {
    const data = encoder.encode(entry.data ?? '');
    blocks.push(header(entry, data.length), data, new Uint8Array((512 - (data.length % 512)) % 512));
  }
  blocks.push(new Uint8Array(1024));
  const result = new Uint8Array(blocks.reduce((length, block) => length + block.length, 0));
  let offset = 0;
  for (const block of blocks) {
    result.set(block, offset);
    offset += block.length;
  }
  return result;
};

const paxRecord = (key: string, value: string): string => {
  const body = ` ${key}=${value}\n`;
  let { length } = body;
  while (`${length}${body}`.length !== length) {
    length = `${length}${body}`.length;
  }
  return `${length}${body}`;
};

const read = (
  bytes: Uint8Array<ArrayBuffer>,
): { readonly files: Record<string, string>; readonly skipped: readonly string[] } => {
  const { entries, skipped } = readTarEntries(bytes);
  return { files: Object.fromEntries(entries.map((entry) => [entry.path, decoder.decode(entry.bytes)])), skipped };
};

describe('gunzip and readTarEntries', () => {
  it('should round-trip nested regular files and strip the npm package folder', async () => {
    const archive = tar(
      { name: 'package/', type: '5' },
      { name: 'package/package.json', data: '{"name":"is-number"}' },
      { name: 'package/lib/index.js', data: 'export default 1;' },
    );

    const { entries, skipped } = readTarEntries(await gunzip(new Uint8Array(gzipSync(archive))));

    expect(entries.map(({ path, mode }) => ({ path, mode }))).toEqual([
      { path: 'package.json', mode: 0o644 },
      { path: 'lib/index.js', mode: 0o644 },
    ]);
    expect(decoder.decode(entries[1]?.bytes)).toBe('export default 1;');
    expect(skipped).toEqual([]);
  });

  it('should take long paths from pax, GNU long-name and ustar prefix headers', () => {
    const paxPath = `package/${'deep/'.repeat(25)}pax.js`;
    const gnuPath = `package/${'gnu/'.repeat(30)}gnu.js`;

    const { files } = read(
      tar(
        { name: 'PaxHeader', type: 'x', data: paxRecord('path', paxPath) },
        { name: paxPath.slice(0, 100), data: 'pax' },
        { name: '././@LongLink', type: 'L', data: `${gnuPath}\0` },
        { name: gnuPath.slice(0, 100), data: 'gnu' },
        { name: 'prefixed.js', prefix: 'package/src', data: 'prefix' },
      ),
    );

    expect(paxPath.length).toBeGreaterThan(100);
    expect(files).toEqual({
      [paxPath.slice('package/'.length)]: 'pax',
      [gnuPath.slice('package/'.length)]: 'gnu',
      'src/prefixed.js': 'prefix',
    });
  });

  it('should strip a non-standard first folder and skip entries outside it', () => {
    expect(read(tar({ name: 'node-v1/index.js', data: 'x' }, { name: 'README', data: 'top' }))).toEqual({
      files: { 'index.js': 'x' },
      skipped: ['README'],
    });
  });

  it('should skip symlinks and hardlinks without extracting them', () => {
    expect(
      read(
        tar(
          { name: 'package/index.js', data: 'x' },
          { name: 'package/link.js', type: '2' },
          { name: 'package/hard.js', type: '1' },
        ),
      ),
    ).toEqual({ files: { 'index.js': 'x' }, skipped: ['link.js', 'hard.js'] });
  });

  it.each(['package/../evil.js', '/etc/passwd', String.raw`package\evil.js`])(
    'should reject the escaping entry path %s',
    (name) => {
      expect(() => readTarEntries(tar({ name, data: 'x' }))).toThrow(
        `Tar entry path '${name}' escapes the package folder.`,
      );
    },
  );

  it('should reject a pax path override that escapes the package folder', () => {
    expect(() =>
      readTarEntries(
        tar({ name: 'PaxHeader', type: 'x', data: paxRecord('path', 'package/../../x') }, { name: 'package/x' }),
      ),
    ).toThrow("Tar entry path 'package/../../x' escapes the package folder.");
  });

  it('should reject a header with a corrupted checksum', () => {
    const archive = tar({ name: 'package/index.js', data: 'x' });
    archive[0] = 0x71;

    expect(() => readTarEntries(archive)).toThrow('Tar header at byte 0 has an invalid checksum.');
  });

  it('should reject bytes that are not gzip', async () => {
    await expect(gunzip(encoder.encode('not gzip'))).rejects.toThrow(TypeError);
  });
});
