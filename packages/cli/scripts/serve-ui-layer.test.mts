import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

// oxlint-disable-next-line no-restricted-imports -- The script's own sibling module; scripts have no `#` alias.
import { buildLayer, composePin, layerAsset, pinLayer, ustarName } from './serve-ui-layer.mjs';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map(async (root) => rm(root, { recursive: true, force: true })));
});

const scratch = async (): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), 'tau-serve-ui-layer-'));
  roots.push(root);
  return root;
};

/** A client directory shaped like `ui:build:serve`'s, with source maps beside the bundles. */
const client = async (root: string): Promise<string> => {
  const directory = join(root, 'client');
  await mkdir(join(directory, 'assets', 'nested'), { recursive: true });
  await writeFile(join(directory, 'index.html'), '<!doctype html><script src="/assets/entry.client-a.js"></script>');
  await writeFile(join(directory, 'assets', 'entry.client-a.js'), 'console.log(1);\n');
  await writeFile(join(directory, 'assets', 'entry.client-a.js.map'), '{"version":3}');
  await writeFile(join(directory, 'assets', 'nested', 'kernel.wasm'), new Uint8Array(1500).fill(7));
  await writeFile(join(directory, 'assets', 'nested', 'kernel.wasm.MAP'), '{}');
  await writeFile(join(directory, 'run.sh'), '#!/bin/sh\n');
  await chmod(join(directory, 'run.sh'), 0o755);
  return directory;
};

describe('buildLayer', () => {
  it('should write a deterministic tar.gz without source maps, and a record of it', async () => {
    const root = await scratch();
    const source = await client(root);

    const first = await buildLayer({ client: source, out: join(root, 'first') });
    const second = await buildLayer({ client: source, out: join(root, 'second') });
    const bytes = await readFile(join(root, 'first', layerAsset));

    expect(second.sha256).toBe(first.sha256);
    expect(first).toEqual({
      schemaVersion: 1,
      asset: layerAsset,
      tag: `serve-ui-layer-${first.sha256.slice(0, 16)}`,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      byteLength: bytes.byteLength,
      unpackedByteLength: 1500 + 16 + 10 + 64,
      fileCount: 4,
      excludedSourceMaps: { fileCount: 2, byteLength: 15 },
    });
    expect(JSON.parse(await readFile(join(root, 'first', 'tau-layer.json'), 'utf8'))).toEqual(first);
    /* Sorted members, no map, mtime 0, owner 0, and the two modes; the preparation host's own reader unpacks it in
     * `src/serve-ui.test.ts`. */
    const listing = execFileSync('tar', ['-tvzf', join(root, 'first', layerAsset)], { encoding: 'utf8' });
    expect(
      listing
        .trim()
        .split('\n')
        .map((line) => line.split(/\s+/u).at(-1)),
    ).toEqual(['assets/entry.client-a.js', 'assets/nested/kernel.wasm', 'index.html', 'run.sh']);
    expect(listing).toMatch(/^-rw-r--r-- 0\/0 +16 1970-01-01 00:00 assets\/entry\.client-a\.js$/mu);
    expect(listing).toMatch(/^-rwxr-xr-x 0\/0 +10 1970-01-01 00:00 run\.sh$/mu);
  });

  it('should refuse a layer over the size line', async () => {
    const root = await scratch();

    await expect(buildLayer({ client: await client(root), out: join(root, 'out'), maximumBytes: 10 })).rejects.toThrow(
      /over the 10-byte line \(X2\)/u,
    );
  });

  it('should refuse a client with no document, or with a link in it', async () => {
    const root = await scratch();
    await mkdir(join(root, 'empty'));
    await expect(buildLayer({ client: join(root, 'empty'), out: join(root, 'out') })).rejects.toThrow(
      /has no index\.html/u,
    );

    const source = await client(root);
    await symlink('/etc/hosts', join(source, 'assets', 'hosts'));
    await expect(buildLayer({ client: source, out: join(root, 'out') })).rejects.toThrow(
      'assets/hosts is not a regular file',
    );
  });
});

describe('ustarName', () => {
  it('should keep a short path whole, split a long one at a slash, and refuse what cannot fit', () => {
    const long = `${'a'.repeat(120)}/${'b'.repeat(90)}`;

    expect(ustarName('assets/x.js')).toEqual({ prefix: '', name: 'assets/x.js' });
    expect(ustarName(long)).toEqual({ prefix: 'a'.repeat(120), name: 'b'.repeat(90) });
    expect(() => ustarName('c'.repeat(101))).toThrow(/does not fit a ustar header/u);
  });
});

describe('pinLayer', () => {
  it('should write the pin from a published archive, and check it', async () => {
    const root = await scratch();
    const record = await buildLayer({ client: await client(root), out: join(root, 'out') });
    const pinPath = join(root, 'serve-ui-layer.json');
    const options = { layer: join(root, 'out', 'tau-layer.json'), archive: join(root, 'out', layerAsset) };

    await expect(pinLayer({ ...options, write: pinPath })).resolves.toEqual(record);
    const pin = JSON.parse(await readFile(pinPath, 'utf8')) as Record<string, unknown>;
    expect(pin).toEqual(composePin(record));
    expect(pin['urls']).toEqual([
      `https://cdn.tau.new/blobs/sha256/${record.sha256}`,
      `https://github.com/taucad/tau/releases/download/${record.tag}/${layerAsset}`,
    ]);
    /* The comment is oxfmt's and the operator's; only the pin itself is compared. */
    await writeFile(pinPath, JSON.stringify({ ...pin, '//': 'reworded' }));
    await expect(pinLayer({ ...options, check: pinPath })).resolves.toEqual(record);
  });

  it('should refuse an archive that differs from its record, and a stale pin', async () => {
    const root = await scratch();
    await buildLayer({ client: await client(root), out: join(root, 'out') });
    const layer = join(root, 'out', 'tau-layer.json');
    const archive = join(root, 'out', layerAsset);
    const stale = join(root, 'stale.json');
    await writeFile(stale, JSON.stringify({ schemaVersion: 1, integrity: 'sha256-x', urls: [] }));

    await expect(pinLayer({ layer, archive, check: stale })).rejects.toThrow(/does not pin serve-ui-layer-/u);
    await writeFile(archive, 'tampered');
    await expect(pinLayer({ layer, archive, write: stale })).rejects.toThrow(/its record says/u);
    await writeFile(layer, '{"schemaVersion":1}');
    await expect(pinLayer({ layer, archive, write: stale })).rejects.toThrow(/is not a serve UI layer record/u);
  });
});
