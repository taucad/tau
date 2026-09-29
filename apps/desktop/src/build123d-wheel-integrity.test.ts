import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// oxlint-disable-next-line no-restricted-imports -- private preparation helper has no package import mapping.
import { replaceResourceDirectory, verifyOcpWheel } from '../scripts/build123d-wheel-integrity.mjs';

const version = '7.9.3.1.1';
const bytes = (value: string): Uint8Array<ArrayBuffer> => new TextEncoder().encode(value);
const digest = (value: Uint8Array<ArrayBuffer>): string => createHash('sha256').update(value).digest('base64url');
const verify = async (sitePackages: string, targetName: string, expectedRecordSha256?: string): Promise<string> =>
  verifyOcpWheel(sitePackages, { ocpVersion: version, targetName, expectedRecordSha256 });

describe('OCP installed wheel integrity', () => {
  let root: string;
  let sitePackages: string;
  let recordPath: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'tau-ocp-integrity-'));
    sitePackages = join(root, 'site-packages');
    recordPath = join(sitePackages, `cadquery_ocp_novtk-${version}.dist-info`, 'RECORD');
    await mkdir(dirname(recordPath), { recursive: true });
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  const fixture = async (
    extension: 'so' | 'pyd',
  ): Promise<{ native: string; support: string; recordSha256: string }> => {
    const native = `OCP/OCP.cp313-test.${extension}`;
    const support = 'OCP/.libs/libTKernel.so';
    const rows = await Promise.all(
      [
        { path: native, payload: bytes('native payload') },
        { path: support, payload: bytes('support payload') },
      ].map(async ({ path, payload }) => {
        const file = join(sitePackages, path);
        await mkdir(dirname(file), { recursive: true });
        await writeFile(file, payload);
        return `${path},sha256=${digest(payload)},${String(payload.length)}`;
      }),
    );
    const record = `${rows.join('\n')}\n`;
    await writeFile(recordPath, record);
    return { native, support, recordSha256: createHash('sha256').update(record).digest('hex') };
  };

  it.each([
    ['darwin-arm64', 'so'],
    ['linux-x64', 'so'],
    ['win32-x64', 'pyd'],
  ] as const)('accepts intact %s payloads', async (target, extension) => {
    const { recordSha256 } = await fixture(extension);
    await expect(verify(sitePackages, target, recordSha256)).resolves.toBe(recordSha256);
  });

  it('rejects a missing native extension even though the manifest and RECORD remain intact', async () => {
    const { native, recordSha256 } = await fixture('so');
    await rm(join(sitePackages, native));
    await expect(verify(sitePackages, 'darwin-arm64', recordSha256)).rejects.toThrow();
  });

  it.each(['truncated', 'changed'] as const)('rejects a %s native extension', async (damage) => {
    const { native, recordSha256 } = await fixture('so');
    await writeFile(join(sitePackages, native), damage === 'truncated' ? 'native' : 'Native payload');
    await expect(verify(sitePackages, 'darwin-arm64', recordSha256)).rejects.toThrow('payload integrity mismatch');
  });

  it('rejects a missing support library', async () => {
    const { support, recordSha256 } = await fixture('so');
    await rm(join(sitePackages, support));
    await expect(verify(sitePackages, 'darwin-arm64', recordSha256)).rejects.toThrow();
  });

  it('rejects an altered RECORD against the staged manifest hash', async () => {
    const { recordSha256 } = await fixture('so');
    await writeFile(recordPath, `${await readFile(recordPath, 'utf8')}OCP/extra.py,sha256=abc,1\n`);
    await expect(verify(sitePackages, 'darwin-arm64', recordSha256)).rejects.toThrow('RECORD integrity mismatch');
  });

  it('rejects duplicate inventory rows', async () => {
    const { native } = await fixture('so');
    const record = await readFile(recordPath, 'utf8');
    await writeFile(recordPath, `${record}${record.split('\n').find((line) => line.startsWith(native))}\n`);
    await expect(verify(sitePackages, 'darwin-arm64')).rejects.toThrow('Duplicate');
  });

  it('rejects an escaping inventory path', async () => {
    await fixture('so');
    await writeFile(recordPath, `${await readFile(recordPath, 'utf8')}OCP/../escape,sha256=${digest(bytes('x'))},1\n`);
    await expect(verify(sitePackages, 'darwin-arm64')).rejects.toThrow('Unsafe OCP wheel path');
  });

  it('rejects an inventory without the platform native extension', async () => {
    await fixture('so');
    const record = await readFile(recordPath, 'utf8');
    await writeFile(
      recordPath,
      record
        .split('\n')
        .filter((line) => !line.startsWith('OCP/OCP.'))
        .join('\n'),
    );
    await expect(verify(sitePackages, 'darwin-arm64')).rejects.toThrow('Expected one OCP native extension');
  });
});

describe('Python resource replacement', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'tau-python-replace-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('restores the previous resource when installing the staged directory fails', async () => {
    const output = join(root, 'darwin-arm64');
    await mkdir(output);
    await writeFile(join(output, 'existing.txt'), 'previous resource');

    await expect(replaceResourceDirectory(join(root, 'missing-stage'), output)).rejects.toThrow('ENOENT');
    await expect(readFile(join(output, 'existing.txt'), 'utf8')).resolves.toBe('previous resource');
    await expect(readdir(root)).resolves.toEqual(['darwin-arm64']);
  });
});
