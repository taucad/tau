import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

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
    // Native tar validates the archive and its sorted members without depending on GNU/BSD verbose formatting.
    const listing = execFileSync('tar', ['-tzf', join(root, 'first', layerAsset)], { encoding: 'utf8' });
    expect(listing.trim().split('\n')).toEqual([
      'assets/entry.client-a.js',
      'assets/nested/kernel.wasm',
      'index.html',
      'run.sh',
    ]);
    // Read the actual ustar metadata, independent of the host's locale, timezone and tar display conventions.
    const archive = gunzipSync(bytes);
    const members: Array<{ mode: number; uid: number; gid: number; size: number; mtime: number }> = [];
    for (let offset = 0; offset < archive.byteLength && archive[offset] !== 0; ) {
      expect(archive.toString('ascii', offset + 156, offset + 157)).toBe('0'); // Regular-file typeflag.
      const octal = (start: number, end: number): number =>
        Number.parseInt(archive.toString('ascii', offset + start, offset + end), 8);
      const size = octal(124, 136);
      members.push({ mode: octal(100, 108), uid: octal(108, 116), gid: octal(116, 124), size, mtime: octal(136, 148) });
      offset += 512 + Math.ceil(size / 512) * 512;
    }
    expect(members).toEqual([
      { mode: 0o644, uid: 0, gid: 0, size: 16, mtime: 0 },
      { mode: 0o644, uid: 0, gid: 0, size: 1500, mtime: 0 },
      { mode: 0o644, uid: 0, gid: 0, size: 64, mtime: 0 },
      { mode: 0o755, uid: 0, gid: 0, size: 10, mtime: 0 },
    ]);
  });

  it('should record the cadmpeg-ts version a build names in cadmpeg-engines.json (EQ1 option A)', async () => {
    const root = await scratch();
    const source = await client(root);
    await writeFile(
      join(source, 'cadmpeg-engines.json'),
      JSON.stringify({ schemaVersion: 1, package: 'cadmpeg-ts', version: '0.1.0-beta.5', path: '/cadmpeg-engines/' }),
    );

    const record = await buildLayer({ client: source, out: join(root, 'out') });

    expect(record.engines).toEqual({ package: 'cadmpeg-ts', version: '0.1.0-beta.5' });
    expect(JSON.parse(await readFile(join(root, 'out', 'tau-layer.json'), 'utf8'))).toEqual(record);

    await writeFile(join(source, 'cadmpeg-engines.json'), '{"package":"cadmpeg-ts"}');
    await expect(buildLayer({ client: source, out: join(root, 'again') })).rejects.toThrow(
      /names no cadmpeg-ts version/u,
    );
  });

  it('should refuse a layer over the size line', async () => {
    const root = await scratch();

    await expect(buildLayer({ client: await client(root), out: join(root, 'out'), maximumBytes: 10 })).rejects.toThrow(
      /over the 10-byte line \(X2\)/u,
    );
  });

  it('should hold a layer at the line, and refuse one a byte over it (I11: at most the line)', async () => {
    const root = await scratch();
    const source = await client(root);
    const { byteLength } = await buildLayer({ client: source, out: join(root, 'measure') });

    await expect(
      buildLayer({ client: source, out: join(root, 'at'), maximumBytes: byteLength }),
    ).resolves.toMatchObject({ byteLength });
    await expect(buildLayer({ client: source, out: join(root, 'over'), maximumBytes: byteLength - 1 })).rejects.toThrow(
      `The layer is ${String(byteLength)} bytes gzipped, over the ${String(byteLength - 1)}-byte line (X2).`,
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
      `https://dependencies.tau.new/blobs/sha256/${record.sha256}`,
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

describe('serve-ui-layer.mts build', () => {
  const script = fileURLToPath(new URL('serve-ui-layer.mts', import.meta.url));
  const run = (
    args: readonly string[],
  ): { readonly status: number | undefined; readonly stdout: string; readonly stderr: string } => {
    const result = spawnSync(process.execPath, ['--import', '@oxc-node/core/register', script, 'build', ...args], {
      encoding: 'utf8',
    });
    return { status: result.status ?? undefined, stdout: result.stdout, stderr: result.stderr };
  };

  it('should print the layer size on a pass and on a refusal, the gate the build lane runs (X2)', async () => {
    const root = await scratch();
    const source = await client(root);

    const pass = run(['--client', source, '--out', join(root, 'pass')]);
    const record = JSON.parse(pass.stdout) as { readonly byteLength: number };
    expect(pass.status).toBe(0);
    expect(pass.stderr).toBe(
      `The layer is ${String(record.byteLength)} bytes gzipped, within the 150000000-byte line (X2).\n`,
    );

    const fail = run(['--client', source, '--out', join(root, 'fail'), '--max-bytes', '10']);
    expect(fail.status).toBe(1);
    expect(fail.stdout).toBe('');
    expect(fail.stderr).toContain(
      `The layer is ${String(record.byteLength)} bytes gzipped, over the 10-byte line (X2).`,
    );
  });

  it('should refuse a size line that is not a positive integer as usage', async () => {
    const root = await scratch();
    const source = await client(root);

    for (const line of ['abc', '0', '-1', '1.5']) {
      const result = run(['--client', source, '--out', join(root, 'out'), `--max-bytes=${line}`]);
      expect(result.status, line).toBe(2);
      expect(result.stderr, line).toMatch(/^Usage: serve-ui-layer\.mts build/u);
    }
  });
});
