/* eslint-disable @typescript-eslint/naming-convention -- the fixtures are GitHub REST release fields */
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  blobsKey,
  cadmpegEngineCaps,
  checkServed,
  fetchPinned,
  parsePlan,
  parseRelease,
  releaseOfTag,
  releasePins,
  run,
  urlPins,
} from '#mirror-dependency-files.js';
import type { PlanRow, RetryPolicy } from '#mirror-dependency-files.js';

const encode = (text: string): Uint8Array<ArrayBuffer> => new TextEncoder().encode(text);
const hex = (bytes: Uint8Array<ArrayBuffer>): string => createHash('sha256').update(bytes).digest('hex');
const sri = (algorithm: 'sha256' | 'sha512', bytes: Uint8Array<ArrayBuffer>): string =>
  `${algorithm}-${createHash(algorithm).update(bytes).digest('base64')}`;

const darwin = encode('dotnet runtime for darwin-arm64');
const linux = encode('dotnet runtime for linux-x64');
const origin = (platform: string) => `https://builds.example.test/dotnet-runtime-${platform}.tar.gz`;
const file = (bytes: Uint8Array<ArrayBuffer>, urls: readonly string[], integrity = sri('sha512', bytes)) => ({
  name: 'dotnet',
  integrity,
  byteLength: bytes.byteLength,
  format: 'tar.gz',
  origin: { kind: 'url', urls },
  destination: 'dotnet',
});
const worker = {
  name: 'worker',
  integrity: sri('sha256', encode('worker')),
  byteLength: 6,
  format: 'tar.gz',
  origin: { kind: 'url', urls: ['https://dependencies.example.test/blobs/sha256/x'] },
  destination: 'tau-worker',
};
const manifest = (
  darwinFile = file(darwin, [origin('osx-arm64')]),
  linuxFile = file(linux, [origin('linux-x64')]),
) => ({
  schemaVersion: 1,
  kernels: { picogk: { requires: ['runtime'], extensions: ['cs'] } },
  dependencies: {
    runtime: [
      { target: { runtime: 'native', os: 'darwin', arch: 'arm64' }, files: [darwinFile, worker] },
      { target: { runtime: 'native', os: 'linux', arch: 'x64' }, files: [linuxFile, worker] },
    ],
  },
});

// A published cadmpeg-ts release as `GET /repos/taucad/cadmpeg-ts/releases/tags/v<version>` returns it.
const version = '0.1.0-beta.2';
const engineIds = [
  'catia',
  'creo',
  'f3d',
  'fcstd',
  'iges',
  'inventor',
  'nx',
  'pvz',
  'rhino',
  'sat',
  'sldprt',
  'step',
  'usd',
];
const engineBytes = new Map(engineIds.map((id) => [id, encode(`gzip of the ${id} engine`)]));
const download = (name: string, tag = `v${version}`) =>
  `https://github.com/taucad/cadmpeg-ts/releases/download/${tag}/${name}`;
const asset = (id: string, overrides: Readonly<Record<string, unknown>> = {}) => {
  const bytes = engineBytes.get(id) ?? encode(id);
  const name = `${id}_bg.wasm.gz`;
  return {
    name,
    state: 'uploaded',
    size: bytes.byteLength,
    digest: `sha256:${hex(bytes)}`,
    browser_download_url: download(name),
    ...overrides,
  };
};
const release = (overrides: Readonly<Record<string, unknown>> = {}) => ({
  tag_name: `v${version}`,
  draft: false,
  prerelease: false,
  published_at: '2026-11-18T04:15:09Z',
  assets: [
    ...engineIds.map((id) => asset(id)),
    {
      name: 'engines.sha256',
      state: 'uploaded',
      size: 10,
      digest: `sha256:${'0'.repeat(64)}`,
      browser_download_url: download('engines.sha256'),
    },
  ],
  ...overrides,
});
const releaseApi = `https://api.github.com/repos/taucad/cadmpeg-ts/releases/tags/v${version}`;

const noWait: RetryPolicy = { attempts: 2, wait: async () => undefined };
const serve =
  (routes: ReadonlyMap<string, Uint8Array<ArrayBuffer> | number | Error>, seen: string[] = []): typeof fetch =>
  async (input) => {
    const url = input instanceof Request ? input.url : input instanceof URL ? input.href : input;
    seen.push(url);
    const route = routes.get(url);
    if (route instanceof Error) {
      throw route;
    }
    return route === undefined || typeof route === 'number'
      ? new Response(undefined, { status: route ?? 404 })
      : new Response(route);
  };
const io = () => {
  const out: string[] = [];
  const diagnostics: string[] = [];
  return {
    out,
    diagnostics,
    io: { out: (line: string) => out.push(line), err: (line: string) => diagnostics.push(line) },
  };
};

describe('mirror-dependency-files', () => {
  const roots: string[] = [];
  const temporary = async (): Promise<string> => {
    const root = await mkdtemp(join(tmpdir(), 'tau-mirror-dependency-files-'));
    roots.push(root);
    return root;
  };

  afterEach(async () => {
    await Promise.all(roots.splice(0).map(async (root) => rm(root, { recursive: true, force: true })));
  });

  describe('urlPins', () => {
    it('lists every file of the name, labelled by platform, and ignores the others', () => {
      expect(urlPins(manifest(), 'dotnet')).toEqual([
        {
          label: 'runtime/dotnet@darwin-arm64',
          integrity: sri('sha512', darwin),
          byteLength: darwin.byteLength,
          urls: [origin('osx-arm64')],
        },
        {
          label: 'runtime/dotnet@linux-x64',
          integrity: sri('sha512', linux),
          byteLength: linux.byteLength,
          urls: [origin('linux-x64')],
        },
      ]);
    });

    it('refuses a manifest that is not schema v1, names no such file or pins one loosely', () => {
      expect(() => urlPins({ schemaVersion: 2 }, 'dotnet')).toThrow('Not a tau-plugin.json schema v1 manifest.');
      expect(() => urlPins(manifest(), 'missing')).toThrow('pins no dependency file named missing');
      expect(() => urlPins(manifest(file(darwin, [origin('osx-arm64')], 'md5-x')), 'dotnet')).toThrow(
        'runtime/dotnet@darwin-arm64 is not pinned by SRI integrity',
      );
      expect(() => urlPins(manifest(file(darwin, ['http://insecure.test/x'])), 'dotnet')).toThrow('https URLs');
      expect(() => urlPins(manifest(file(darwin, [])), 'dotnet')).toThrow('https URLs');
    });
  });

  describe('releasePins', () => {
    it('pins every engine asset by its GitHub sha256 digest and size, in name order, ignoring other assets', () => {
      const pins = releasePins(release(), version);

      expect(pins).toHaveLength(13);
      expect(pins[0]).toEqual({
        label: `cadmpeg-ts/catia_bg.wasm.gz@${version}`,
        integrity: sri('sha256', engineBytes.get('catia')!),
        byteLength: engineBytes.get('catia')!.byteLength,
        urls: [download('catia_bg.wasm.gz')],
      });
      expect(pins.map((pin) => pin.label).toSorted()).toEqual(pins.map((pin) => pin.label));
    });

    it('refuses a draft, an unpublished release or another version', () => {
      expect(() => releasePins(release({ draft: true }), version)).toThrow('is a draft or unpublished');
      expect(() => releasePins(release({ published_at: null }), version)).toThrow('is a draft or unpublished');
      expect(() => releasePins(release({ tag_name: 'v0.1.0-beta.1' }), version)).toThrow(
        `The release is not taucad/cadmpeg-ts v${version}.`,
      );
      expect(() => releasePins([], version)).toThrow('The release is not');
    });

    it('refuses any engine count but 13', () => {
      const twelve = release({ assets: engineIds.slice(1).map((id) => asset(id)) });
      const fourteen = release({ assets: [...engineIds, 'extra'].map((id) => asset(id)) });
      expect(() => releasePins(twelve, version)).toThrow('attaches 12 engines (<id>_bg.wasm.gz), not 13.');
      expect(() => releasePins(fourteen, version)).toThrow('attaches 14 engines');
      expect(() => releasePins(release({ assets: [] }), version)).toThrow('attaches 0 engines');
    });

    it('refuses an engine without an uploaded state, a sha256 digest or a byte length', () => {
      const withEngine = (overrides: Readonly<Record<string, unknown>>) =>
        release({ assets: engineIds.map((id) => (id === 'sldprt' ? asset(id, overrides) : asset(id))) });
      const refusal = `cadmpeg-ts/sldprt_bg.wasm.gz@${version} is not an uploaded asset with a sha256 digest`;
      expect(() => releasePins(withEngine({ state: 'starter' }), version)).toThrow(refusal);
      expect(() => releasePins(withEngine({ digest: null }), version)).toThrow(refusal);
      expect(() => releasePins(withEngine({ digest: `sha512:${'a'.repeat(128)}` }), version)).toThrow(refusal);
      expect(() => releasePins(withEngine({ size: 0 }), version)).toThrow(refusal);
    });

    it('refuses an engine downloaded from anywhere but this release', () => {
      const elsewhere = release({
        assets: engineIds.map((id) =>
          id === 'step' ? asset(id, { browser_download_url: download('step_bg.wasm.gz', 'v0.1.0') }) : asset(id),
        ),
      });
      expect(() => releasePins(elsewhere, version)).toThrow(
        `cadmpeg-ts/step_bg.wasm.gz@${version} is not downloaded from ${download('step_bg.wasm.gz')}.`,
      );
    });

    it('refuses an engine over the per-file cap and engines over the total cap', () => {
      const big = release({
        assets: engineIds.map((id) => (id === 'nx' ? asset(id, { size: cadmpegEngineCaps.file + 1 }) : asset(id))),
      });
      expect(() => releasePins(big, version)).toThrow('over the 16777216-byte cap per engine');

      const heavy = release({ assets: engineIds.map((id) => asset(id, { size: cadmpegEngineCaps.file })) });
      expect(() => releasePins(heavy, version)).toThrow('over the 104857600-byte cap.');
    });
  });

  describe('parseRelease and releaseOfTag', () => {
    it('admits only taucad/cadmpeg-ts at a lowercase semantic version', () => {
      expect(parseRelease(`taucad/cadmpeg-ts@${version}`)).toBe(version);
      expect(parseRelease('taucad/cadmpeg-ts@1.2.3')).toBe('1.2.3');
      expect(() => parseRelease(`taucad/other@${version}`)).toThrow(
        'Only taucad/cadmpeg-ts releases are mirrored, not "taucad/other".',
      );
      expect(() => parseRelease(`evil/cadmpeg-ts@${version}`)).toThrow('Only taucad/cadmpeg-ts releases');
      expect(() => parseRelease('taucad/cadmpeg-ts')).toThrow('"" is not a taucad/cadmpeg-ts version');
      expect(() => parseRelease('taucad/cadmpeg-ts@v1.2.3')).toThrow('is not a taucad/cadmpeg-ts version');
      expect(() => parseRelease('taucad/cadmpeg-ts@1.2.3/../x')).toThrow('is not a taucad/cadmpeg-ts version');
    });

    it('recovers the release from a tag by stripping the prefix and the key', () => {
      expect(releaseOfTag(`dependency@cadmpeg-engines-${version}-0123456789abcdef`)).toBe(
        `taucad/cadmpeg-ts@${version}`,
      );
      expect(() => releaseOfTag(`dependency@cadmpeg-engines-${version}`)).toThrow(
        'is not a dependency@cadmpeg-engines-',
      );
      expect(() => releaseOfTag('dependency@dotnet-runtime-0123456789abcdef')).toThrow('is not a dependency@cadmpeg');
      expect(() => releaseOfTag('dependency@cadmpeg-engines-latest-0123456789abcdef')).toThrow(
        '"latest" is not a taucad/cadmpeg-ts version',
      );
    });
  });

  describe('blobsKey', () => {
    it('names the set of digests, whatever their order or repetition', () => {
      const digests = [hex(darwin), hex(linux)];
      expect(blobsKey(digests)).toMatch(/^[\da-f]{16}$/u);
      expect(blobsKey(digests.toReversed())).toBe(blobsKey(digests));
      expect(blobsKey([...digests, hex(darwin)])).toBe(blobsKey(digests));
      expect(blobsKey([hex(darwin)])).not.toBe(blobsKey(digests));
      expect(blobsKey(digests)).toBe(
        createHash('sha256')
          .update(`${[...digests].sort().join('\n')}\n`)
          .digest('hex')
          .slice(0, 16),
      );
    });
  });

  describe('fetchPinned', () => {
    const [pin] = urlPins(manifest(), 'dotnet');

    it('keeps the verified bytes under their sha256', async () => {
      const out = await temporary();
      const row = await fetchPinned({
        pin: pin!,
        out,
        transport: serve(new Map([[origin('osx-arm64'), darwin]])),
        retry: noWait,
      });

      expect(row).toEqual({ sha256: hex(darwin), byteLength: darwin.byteLength, label: 'runtime/dotnet@darwin-arm64' });
      expect(await readdir(out)).toEqual([hex(darwin)]);
      expect(new Uint8Array(await readFile(join(out, hex(darwin))))).toEqual(darwin);
    });

    it('falls through to the next URL after a 404', async () => {
      const seen: string[] = [];
      const second = 'https://mirror.example.test/dotnet.tar.gz';
      const out = await temporary();
      const row = await fetchPinned({
        pin: { ...pin!, urls: [origin('osx-arm64'), second] },
        out,
        transport: serve(
          new Map<string, Uint8Array<ArrayBuffer> | number>([
            [origin('osx-arm64'), 404],
            [second, darwin],
          ]),
          seen,
        ),
        retry: noWait,
      });

      expect(row.sha256).toBe(hex(darwin));
      // A 404 is final for its URL, so the next URL is tried at once.
      expect(seen).toEqual([origin('osx-arm64'), second]);
    });

    it('refuses bytes that do not match the pinned integrity or length, leaving nothing behind', async () => {
      const out = await temporary();
      const wrong = encode('x'.repeat(darwin.byteLength));
      await expect(
        fetchPinned({ pin: pin!, out, transport: serve(new Map([[origin('osx-arm64'), wrong]])), retry: noWait }),
      ).rejects.toThrow(`does not match ${pin!.integrity}`);
      await expect(
        fetchPinned({
          pin: pin!,
          out,
          transport: serve(new Map([[origin('osx-arm64'), encode(`${'x'.repeat(darwin.byteLength)}!`)]])),
          retry: noWait,
        }),
      ).rejects.toThrow('serves more than the pinned');
      await expect(
        fetchPinned({
          pin: pin!,
          out,
          transport: serve(new Map([[origin('osx-arm64'), encode('short')]])),
          retry: noWait,
        }),
      ).rejects.toThrow('served 5 bytes');
      await expect(
        fetchPinned({
          pin: pin!,
          out,
          transport: serve(new Map([[origin('osx-arm64'), new TypeError('fetch failed')]])),
          retry: noWait,
        }),
      ).rejects.toThrow('could not be fetched: fetch failed');
      expect(await readdir(out)).toEqual([]);
    });
  });

  describe('parsePlan and checkServed', () => {
    const base = 'https://dependencies.example.test/';
    const rows: PlanRow[] = [
      { sha256: hex(darwin), byteLength: darwin.byteLength, label: 'runtime/dotnet@darwin-arm64' },
      { sha256: hex(linux), byteLength: linux.byteLength, label: 'runtime/dotnet@linux-x64' },
    ];
    const tsv = rows.map((row) => `${row.sha256}\t${String(row.byteLength)}\t${row.label}\n`).join('');

    it('parses the rows fetch writes and refuses anything else', () => {
      expect(parsePlan(tsv)).toEqual(rows);
      expect(() => parsePlan('')).toThrow('The plan lists no blob.');
      expect(() => parsePlan(`${hex(darwin)}\tmany\tlabel\n`)).toThrow('Not a plan row');
      expect(() => parsePlan(`abc\t1\tlabel\n`)).toThrow('Not a plan row');
    });

    it('passes when the host serves every blob with its digest, retrying a cached miss', async () => {
      let misses = 1;
      const routes = new Map([
        [`${base}blobs/sha256/${hex(darwin)}`, darwin],
        [`${base}blobs/sha256/${hex(linux)}`, linux],
      ]);
      const transport: typeof fetch = async (input, init) => {
        if (misses-- > 0) {
          return new Response(undefined, { status: 404 });
        }
        return serve(routes)(input, init);
      };

      await expect(checkServed({ rows, base, transport, retry: noWait })).resolves.toEqual([]);
    });

    it('names each blob the host does not serve with its digest', async () => {
      const failures = await checkServed({
        rows,
        base,
        transport: serve(new Map([[`${base}blobs/sha256/${hex(darwin)}`, linux.slice(0, darwin.byteLength)]])),
        retry: noWait,
      });

      expect(failures).toHaveLength(2);
      expect(failures[0]).toMatch(/^runtime\/dotnet@darwin-arm64: .*(does not hash|served)/u);
      expect(failures[1]).toBe(`runtime/dotnet@linux-x64: ${base}blobs/sha256/${hex(linux)} answered HTTP 404`);
    });
  });

  describe('run', () => {
    const transport = serve(
      new Map([
        [origin('osx-arm64'), darwin],
        [origin('linux-x64'), linux],
      ]),
    );
    const key = blobsKey([hex(darwin), hex(linux)]);

    const writeManifest = async (value: unknown): Promise<string> => {
      const path = join(await temporary(), 'tau-plugin.json');
      await writeFile(path, JSON.stringify(value));
      return path;
    };

    it('fetches, plans and names the tag; a sha256 re-pin of the same bytes keeps the key', async () => {
      const out = await temporary();
      const result = io();
      const args = ['--name', 'dotnet', '--tag-name', 'dotnet-runtime', '--out', out];

      expect(
        await run(['fetch', '--manifest', await writeManifest(manifest()), ...args], result.io, {
          transport,
          retry: noWait,
        }),
      ).toBe(0);
      expect(result.out).toEqual([`key=${key}`, `tag=dependency@dotnet-runtime-${key}`]);
      expect(parsePlan(await readFile(join(out, 'plan.tsv'), 'utf8')).map((row) => row.sha256)).toEqual([
        hex(darwin),
        hex(linux),
      ]);

      const repinned = manifest(
        file(darwin, [origin('osx-arm64')], sri('sha256', darwin)),
        file(linux, [origin('linux-x64')], sri('sha256', linux)),
      );
      const again = io();
      expect(
        await run(['fetch', '--manifest', await writeManifest(repinned), ...args], again.io, {
          transport,
          retry: noWait,
        }),
      ).toBe(0);
      expect(again.out).toEqual(result.out);
    });

    it('refuses a tag that does not name the bytes', async () => {
      const result = io();
      const code = await run(
        [
          'fetch',
          '--manifest',
          await writeManifest(manifest()),
          '--name',
          'dotnet',
          '--tag-name',
          'dotnet-runtime',
          '--out',
          await temporary(),
          '--tag',
          'dependency@dotnet-runtime-0000000000000000',
        ],
        result.io,
        { transport, retry: noWait },
      );

      expect(code).toBe(1);
      expect(result.out).toEqual([]);
      expect(result.diagnostics.at(-1)).toBe(
        `The tag dependency@dotnet-runtime-0000000000000000 does not name these bytes; they are dependency@dotnet-runtime-${key}. Nothing is published.`,
      );
    });

    it('checks a plan against a host', async () => {
      const out = await temporary();
      const plan = join(out, 'plan.tsv');
      await writeFile(plan, `${hex(darwin)}\t${String(darwin.byteLength)}\truntime/dotnet@darwin-arm64\n`);
      const base = 'https://dependencies.example.test/';
      const served = io();
      const missing = io();

      expect(
        await run(['check', '--plan', plan, '--base', base], served.io, {
          transport: serve(new Map([[`${base}blobs/sha256/${hex(darwin)}`, darwin]])),
          retry: noWait,
        }),
      ).toBe(0);
      expect(await run(['check', '--plan', plan, '--base', base], missing.io, { transport, retry: noWait })).toBe(1);
      expect(missing.diagnostics[0]).toContain('answered HTTP 404');
    });

    describe('--release', () => {
      const engineRoutes = () =>
        new Map<string, Uint8Array<ArrayBuffer> | number>(
          engineIds.map((id) => [download(`${id}_bg.wasm.gz`), engineBytes.get(id)!]),
        );
      const releaseKey = blobsKey([...engineBytes.values()].map((bytes) => hex(bytes)));
      const releaseTag = `dependency@cadmpeg-engines-${version}-${releaseKey}`;
      const releaseTransport =
        (body: unknown, routes = engineRoutes(), seen: Array<{ url: string; init?: RequestInit }> = []): typeof fetch =>
        async (input, init) => {
          const url = input instanceof Request ? input.url : input instanceof URL ? input.href : input;
          seen.push({ url, init });
          if (url === releaseApi) {
            return typeof body === 'number' ? new Response(undefined, { status: body }) : Response.json(body);
          }
          return serve(routes)(input, init);
        };

      it('fetches every engine, plans them under their sha256 and names the versioned tag', async () => {
        const out = await temporary();
        const result = io();
        const seen: Array<{ url: string; init?: RequestInit }> = [];
        const code = await run(['fetch', '--release', `taucad/cadmpeg-ts@${version}`, '--out', out], result.io, {
          transport: releaseTransport(release(), engineRoutes(), seen),
          retry: noWait,
          token: 'token-value',
        });

        expect(code).toBe(0);
        expect(result.out).toEqual([`key=${releaseKey}`, `tag=${releaseTag}`]);
        const plan = parsePlan(await readFile(join(out, 'plan.tsv'), 'utf8'));
        expect(plan).toHaveLength(13);
        expect(plan[0]).toEqual({
          sha256: hex(engineBytes.get('catia')!),
          byteLength: engineBytes.get('catia')!.byteLength,
          label: `cadmpeg-ts/catia_bg.wasm.gz@${version}`,
        });
        // The token reaches the API only, never a download URL.
        const authorized = seen.filter(({ init }) => new Headers(init?.headers).has('authorization'));
        expect(authorized.map(({ url }) => url)).toEqual([releaseApi]);
      });

      it('accepts its own tag and refuses one whose key does not name the bytes', async () => {
        const accepted = io();
        expect(
          await run(
            ['fetch', '--release', `taucad/cadmpeg-ts@${version}`, '--out', await temporary(), '--tag', releaseTag],
            accepted.io,
            { transport: releaseTransport(release()), retry: noWait },
          ),
        ).toBe(0);

        const refused = io();
        const wrong = `dependency@cadmpeg-engines-${version}-0000000000000000`;
        expect(
          await run(
            ['fetch', '--release', `taucad/cadmpeg-ts@${version}`, '--out', await temporary(), '--tag', wrong],
            refused.io,
            { transport: releaseTransport(release()), retry: noWait },
          ),
        ).toBe(1);
        expect(refused.out).toEqual([]);
        expect(refused.diagnostics.at(-1)).toBe(
          `The tag ${wrong} does not name these bytes; they are ${releaseTag}. Nothing is published.`,
        );
      });

      it('refuses an engine whose bytes do not match the digest GitHub states, writing no plan', async () => {
        const out = await temporary();
        const result = io();
        const routes = engineRoutes();
        routes.set(download('sldprt_bg.wasm.gz'), encode('x'.repeat(engineBytes.get('sldprt')!.byteLength)));
        expect(
          await run(['fetch', '--release', `taucad/cadmpeg-ts@${version}`, '--out', out], result.io, {
            transport: releaseTransport(release(), routes),
            retry: noWait,
          }),
        ).toBe(1);
        expect(result.diagnostics.at(-1)).toContain(`cadmpeg-ts/sldprt_bg.wasm.gz@${version}: no pinned URL serves`);
        expect(await readdir(out)).not.toContain('plan.tsv');
      });

      it('refuses a missing or draft release and another repository before any download', async () => {
        const missing = io();
        expect(
          await run(['fetch', '--release', `taucad/cadmpeg-ts@${version}`, '--out', await temporary()], missing.io, {
            transport: releaseTransport(404),
            retry: noWait,
          }),
        ).toBe(1);
        expect(missing.diagnostics.at(-1)).toBe(
          `${releaseApi} answered HTTP 404; a draft or missing release is not mirrored.`,
        );

        const draft = io();
        expect(
          await run(['fetch', '--release', `taucad/cadmpeg-ts@${version}`, '--out', await temporary()], draft.io, {
            transport: releaseTransport(release({ draft: true })),
            retry: noWait,
          }),
        ).toBe(1);
        expect(draft.diagnostics.at(-1)).toContain('is a draft or unpublished');

        const seen: Array<{ url: string }> = [];
        const other = io();
        expect(
          await run(['fetch', '--release', `taucad/tau@${version}`, '--out', await temporary()], other.io, {
            transport: releaseTransport(release(), engineRoutes(), seen),
            retry: noWait,
          }),
        ).toBe(1);
        expect(other.diagnostics.at(-1)).toBe('Only taucad/cadmpeg-ts releases are mirrored, not "taucad/tau".');
        expect(seen).toEqual([]);
      });

      it('recovers the release from a tag', async () => {
        const result = io();
        expect(await run(['release-of', '--tag', releaseTag], result.io)).toBe(0);
        expect(result.out).toEqual([`release=taucad/cadmpeg-ts@${version}`]);
        const refused = io();
        expect(await run(['release-of', '--tag', 'dependency@dotnet-runtime-0123456789abcdef'], refused.io)).toBe(1);
      });
    });

    it('rejects usage errors', async () => {
      const result = io();
      expect(await run(['fetch', '--manifest', 'x'], result.io)).toBe(2);
      expect(await run(['check', '--plan', 'x', '--base', 'https://host.test/path'], result.io)).toBe(2);
      expect(
        await run(['fetch', '--manifest', 'x', '--name', 'n', '--tag-name', 'Bad_Name', '--out', 'o'], result.io),
      ).toBe(2);
      expect(await run(['publish'], result.io)).toBe(2);
      expect(await run(['fetch', '--release', `taucad/cadmpeg-ts@${version}`], result.io)).toBe(2);
      expect(
        await run(['fetch', '--release', `taucad/cadmpeg-ts@${version}`, '--manifest', 'x', '--out', 'o'], result.io),
      ).toBe(2);
      expect(await run(['release-of'], result.io)).toBe(2);
    });
  });
});
