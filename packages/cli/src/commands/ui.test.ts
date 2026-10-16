/**
 * `tau ui verify` over a client build on disk: a document root with the asset receipt the UI build writes
 * (`tau-asset-receipt.json`, `tau-ui-asset-receipt-v1`, SHA-384 Subresource Integrity per file). An untouched copy
 * passes; a tampered WASM module, a missing file or a receipt that is not there exits 3 naming the file.
 */

import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { runCommand } from 'citty';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { exitCodes } from '#output.js';

const { uiCommand, verifyUi } = await import('#commands/ui.js');

const files: Readonly<Record<string, Uint8Array<ArrayBuffer>>> = {
  'index.html': new TextEncoder().encode('<!doctype html><title>Tau</title>\n'),
  'assets/kernel-a1b2c3.wasm': Uint8Array.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 0x2a]),
  'assets/entry-d4e5f6.js': new TextEncoder().encode('export const ready = true;\n'),
};

const integrity = (bytes: Uint8Array<ArrayBuffer>): string =>
  `sha384-${createHash('sha384').update(bytes).digest('base64')}`;

describe('tau ui verify', () => {
  let root: string;
  let stdout: string[];

  const records = (): Array<Record<string, unknown>> =>
    stdout
      .join('')
      .split('\n')
      .filter((line) => line.startsWith('{'))
      .map((line) => JSON.parse(line) as Record<string, unknown>);

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'tau-ui-verify-'));
    await Promise.all(
      Object.entries(files).map(async ([path, bytes]) => {
        await mkdir(dirname(join(root, path)), { recursive: true });
        await writeFile(join(root, path), bytes);
      }),
    );
    const assets = Object.entries(files)
      .map(([path, bytes]) => ({ path, bytes: bytes.byteLength, integrity: integrity(bytes) }))
      .toSorted((left, right) => left.path.localeCompare(right.path));
    await writeFile(
      join(root, 'tau-asset-receipt.json'),
      JSON.stringify({ schema: 'tau-ui-asset-receipt-v1', algorithm: 'sha384', assets }),
    );
    stdout = [];
    vi.spyOn(process.stdout, 'write').mockImplementation(((
      chunk: string | Uint8Array<ArrayBuffer>,
      ...rest: unknown[]
    ) => {
      stdout.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));
      const callback = rest.at(-1);
      if (typeof callback === 'function') {
        (callback as () => void)();
      }
      return true;
    }) as typeof process.stdout.write);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(root, { recursive: true, force: true });
  });

  it('should pass an untouched copy and report the files the receipt does not list', async () => {
    await writeFile(join(root, '_headers'), '/*\n  Cross-Origin-Opener-Policy: same-origin\n');
    await writeFile(join(root, 'assets', 'entry-d4e5f6.js.map'), '{}');

    await runCommand(uiCommand, { rawArgs: ['verify', root, '--json'] });

    expect(records()).toEqual([
      { v: 1, kind: 'ui-verify', ok: true, directory: root, assets: 3, problems: [], unlisted: ['_headers'] },
    ]);
  });

  it('should exit 3 naming a WASM module that differs from the build by one byte', async () => {
    const tampered = Uint8Array.from(files['assets/kernel-a1b2c3.wasm'] ?? []);
    tampered[8] = 0x2b;
    await writeFile(join(root, 'assets', 'kernel-a1b2c3.wasm'), tampered);

    await expect(runCommand(uiCommand, { rawArgs: ['verify', root, '--json'] })).rejects.toMatchObject({
      code: 'UI_ASSETS_ALTERED',
      exit: exitCodes.refused,
      message: expect.stringContaining('assets/kernel-a1b2c3.wasm') as unknown,
    });
    expect(records()[0]).toMatchObject({
      kind: 'ui-verify',
      ok: false,
      problems: [
        {
          path: 'assets/kernel-a1b2c3.wasm',
          problem: 'altered',
          found: { integrity: integrity(tampered), bytes: tampered.byteLength },
        },
      ],
    });
  });

  it('should report a deleted file as missing', async () => {
    await rm(join(root, 'assets', 'entry-d4e5f6.js'));

    const report = await verifyUi(root);

    expect(report.problems).toEqual([{ path: 'assets/entry-d4e5f6.js', problem: 'missing' }]);
  });

  it('should refuse a receipt path that escapes the document root', async () => {
    await writeFile(
      join(root, 'tau-asset-receipt.json'),
      JSON.stringify({
        schema: 'tau-ui-asset-receipt-v1',
        algorithm: 'sha384',
        assets: [{ path: '../outside.wasm', bytes: 1, integrity: 'sha384-AAAA' }],
      }),
    );

    const report = await verifyUi(root);

    expect(report.problems).toEqual([{ path: '../outside.wasm', problem: 'outside-root' }]);
  });

  it('should exit 3 when the directory holds no receipt', async () => {
    await rm(join(root, 'tau-asset-receipt.json'));

    await expect(verifyUi(root)).rejects.toMatchObject({ code: 'UI_RECEIPT_MISSING', exit: exitCodes.refused });
  });
});
