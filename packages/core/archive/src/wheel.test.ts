import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { recordHash, wheel, zip } from '#archive-builders.fixture.js';
import { parseCsv, readWheel } from '#wheel.js';

const limits = { maximumUnpackedBytes: 16 * 1024 * 1024, maximumEntries: 1000 };
const stem = 'demo-1.0';
const files = { 'demo/__init__.py': 'VALUE = 1\n', 'demo/data.txt': 'payload' };
const fixture = (name: string): Uint8Array<ArrayBuffer> =>
  new Uint8Array(readFileSync(new URL(`fixtures/${name}`, import.meta.url)));

describe('readWheel', () => {
  it('should return every member verified against RECORD with the distribution name and version', async () => {
    const contents = await readWheel(wheel(stem, files), limits);

    expect({
      distribution: contents.distribution,
      version: contents.version,
      paths: contents.entries.map(({ path }) => path),
      data: contents.data,
    }).toEqual({
      distribution: 'demo',
      version: '1.0',
      paths: ['demo/__init__.py', 'demo/data.txt', 'demo-1.0.dist-info/WHEEL', 'demo-1.0.dist-info/RECORD'],
      data: [],
    });
  });

  it('should accept RFC 4180 rows with quoted commas and an unhashed RECORD.jws', async () => {
    const quoted = 'demo/odd, "name".py';
    const bytes = wheel(stem, { ...files, [quoted]: 'x', 'demo-1.0.dist-info/RECORD.jws': '{}' }, (rows) =>
      rows.map((row) => (row[0] === 'demo-1.0.dist-info/RECORD.jws' ? [row[0], '', ''] : row)),
    );
    const contents = await readWheel(bytes, limits);

    expect(contents.entries.map(({ path }) => path)).toContain(quoted);
  });

  it('should parse CSV per RFC 4180', () => {
    expect(parseCsv('a,"b,""c""",3\r\n"multi\nline",,\n\n')).toEqual([
      ['a', 'b,"c"', '3'],
      ['multi\nline', '', ''],
    ]);
  });

  describe('RECORD disagreements refuse the whole wheel', () => {
    it.each([
      [
        'a wrong hash',
        (rows: string[][]) =>
          rows.map((row) => (row[0] === 'demo/data.txt' ? [row[0], recordHash('other'), row[2] ?? ''] : row)),
      ],
      ['a missing row', (rows: string[][]) => rows.filter((row) => row[0] !== 'demo/data.txt')],
      [
        'an unhashed row',
        (rows: string[][]) => rows.map((row) => (row[0] === 'demo/data.txt' ? [row[0], '', ''] : row)),
      ],
      [
        'a wrong size',
        (rows: string[][]) => rows.map((row) => (row[0] === 'demo/data.txt' ? [row[0], row[1] ?? '', '1'] : row)),
      ],
      ['a row for an absent file', (rows: string[][]) => [...rows, ['demo/ghost.py', recordHash('ghost'), '5']]],
      [
        'a padded base64 hash',
        (rows: string[][]) =>
          rows.map((row) => (row[0] === 'demo/data.txt' ? [row[0], `${row[1] ?? ''}=`, row[2] ?? ''] : row)),
      ],
      [
        'an md5 hash',
        (rows: string[][]) => rows.map((row) => (row[0] === 'demo/data.txt' ? [row[0], 'md5=abc', ''] : row)),
      ],
      [
        'a hashed RECORD row',
        (rows: string[][]) =>
          rows.map((row) => (row[0] === `${stem}.dist-info/RECORD` ? [row[0], recordHash('x'), ''] : row)),
      ],
    ])('should refuse %s', async (_label, edit) => {
      await expect(readWheel(wheel(stem, files, edit), limits)).rejects.toMatchObject({
        name: 'ArchiveError',
        code: 'INTEGRITY_MISMATCH',
        reason: 'record',
      });
    });

    it('should refuse a member whose bytes changed after RECORD was written', async () => {
      const honest = await readWheel(wheel(stem, files), limits);
      const tampered = zip([
        { name: 'demo/__init__.py', data: 'VALUE = 2\n' },
        { name: 'demo/data.txt', data: 'payload' },
        { name: `${stem}.dist-info/WHEEL`, data: 'Wheel-Version: 1.0\nRoot-Is-Purelib: true\n' },
        {
          name: `${stem}.dist-info/RECORD`,
          data: honest.entries.find(({ path }) => path.endsWith('RECORD'))?.bytes,
        },
      ]);

      await expect(readWheel(tampered, limits)).rejects.toMatchObject({
        code: 'INTEGRITY_MISMATCH',
        path: 'demo/__init__.py',
      });
    });
  });

  describe('.data/ schemes', () => {
    it('should return the data scheme relative to the interpreter prefix', async () => {
      const contents = await readWheel(
        wheel(stem, { ...files, 'demo-1.0.data/data/share/man/man1/demo.1': '.TH' }),
        limits,
      );

      expect(contents.data.map(({ path }) => path)).toEqual(['share/man/man1/demo.1']);
      expect(contents.entries.map(({ path }) => path)).not.toContain('demo-1.0.data/data/share/man/man1/demo.1');
    });

    it.each(['scripts', 'headers', 'purelib', 'platlib'])(
      'should refuse the %s scheme as unsupported',
      async (scheme) => {
        await expect(
          readWheel(wheel(stem, { ...files, [`demo-1.0.data/${scheme}/thing`]: 'x' }), limits),
        ).rejects.toMatchObject({
          code: 'UNSUPPORTED_FEATURE',
          reason: 'data-scheme',
          path: `demo-1.0.data/${scheme}/thing`,
        });
      },
    );
  });

  describe('hostile and malformed wheels', () => {
    it('should refuse an escaping member path', async () => {
      await expect(readWheel(wheel(stem, { ...files, '../evil.py': 'x' }), limits)).rejects.toMatchObject({
        code: 'EXTRACTION_REFUSED',
        reason: 'unsafe-path',
      });
    });

    it('should refuse a wheel without exactly one dist-info directory', async () => {
      await expect(readWheel(zip([{ name: 'demo/__init__.py', data: '' }]), limits)).rejects.toMatchObject({
        code: 'EXTRACTION_REFUSED',
        reason: 'malformed',
      });
    });

    it('should honour the caller caps', async () => {
      await expect(readWheel(wheel(stem, files), { ...limits, maximumEntries: 3 })).rejects.toMatchObject({
        reason: 'limit',
      });
    });
  });

  describe('real wheels', () => {
    it('should verify a pinned closure wheel with directory entries (cadquery-ocp-proxy 7.9.3.1.1)', async () => {
      const contents = await readWheel(fixture('cadquery_ocp_proxy-7.9.3.1.1-py3-none-any.whl'), limits);

      expect({
        distribution: contents.distribution,
        version: contents.version,
        paths: contents.entries.map(({ path }) => path),
      }).toEqual({
        distribution: 'cadquery_ocp_proxy',
        version: '7.9.3.1.1',
        paths: [
          'cadquery_ocp_proxy/__init__.py',
          'cadquery_ocp_proxy/_version.py',
          'cadquery_ocp_proxy-7.9.3.1.1.dist-info/WHEEL',
          'cadquery_ocp_proxy-7.9.3.1.1.dist-info/METADATA',
          'cadquery_ocp_proxy-7.9.3.1.1.dist-info/RECORD',
        ],
      });
    });

    it('should install the data scheme of a real data-scheme wheel (ipykernel 6.29.5)', async () => {
      const contents = await readWheel(fixture('ipykernel-6.29.5-py3-none-any.whl'), limits);

      expect(contents.data.map(({ path, bytes }) => [path, bytes.byteLength])).toEqual([
        ['share/jupyter/kernels/python3/kernel.json', 193],
        ['share/jupyter/kernels/python3/logo-32x32.png', 1084],
        ['share/jupyter/kernels/python3/logo-64x64.png', 2180],
        ['share/jupyter/kernels/python3/logo-svg.svg', 9605],
      ]);
      expect(contents.entries.some(({ path }) => path === 'ipykernel/kernelapp.py')).toBe(true);
    });

    it('should refuse the real wheel after one byte of a member changes', async () => {
      const bytes = fixture('cadquery_ocp_proxy-7.9.3.1.1-py3-none-any.whl');
      const { entries } = await readWheel(bytes, limits);
      const [entry] = entries;
      const tampered = zip(
        entries.map(({ path, bytes: data }) => ({
          name: path,
          data: path === entry?.path ? new TextEncoder().encode(`${new TextDecoder().decode(data)} `) : data,
        })),
      );

      await expect(readWheel(tampered, limits)).rejects.toMatchObject({
        code: 'INTEGRITY_MISMATCH',
        path: entry?.path,
      });
    });
  });
});
