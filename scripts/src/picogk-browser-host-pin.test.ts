import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  checkPinnedBlobs,
  compareBundles,
  contentType,
  blobBases,
  isInputsKey,
  manifestFiles,
  parsePin,
  dependencyTag,
  pinFor,
  pinServed,
  pinStatus,
  publishPlan,
  readPin,
  run,
  serializePin,
  verifyBundle,
} from '#picogk-browser-host-pin.js';
import type { PicogkBrowserHostPin, RetryPolicy } from '#picogk-browser-host-pin.js';

const hex = (bytes: Uint8Array<ArrayBuffer> | string): string => createHash('sha256').update(bytes).digest('hex');
const key = `picogk-browser-host-v2-${'9'.repeat(40)}-0.2.1-${'a'.repeat(64)}-${'b'.repeat(64)}`;
const otherKey = `picogk-browser-host-v2-${'9'.repeat(40)}-0.2.1-${'c'.repeat(64)}-${'b'.repeat(64)}`;
const encode = (text: string): Uint8Array<ArrayBuffer> => new TextEncoder().encode(text);

// A small host: a serial and a threaded variant whose reference is the same bytes in both.
const contents: Readonly<Record<string, string>> = {
  '_framework/dotnet.js': 'export const boot = 1;',
  '_framework/dotnet.native.wasm': 'wasm bytes',
  'refs/PicoGK.dll': 'shared reference',
  'multi/_framework/dotnet.js': 'export const boot = 2;',
  'multi/_framework/dotnet.native.wasm': 'threaded wasm bytes',
  'multi/refs/PicoGK.dll': 'shared reference',
};
const entry = (path: string) => ({ path, sha256: hex(contents[path]!), byteLength: encode(contents[path]!).length });
const variant = (prefix: string) => ({
  archiveInputReceipt: 'd'.repeat(64),
  bootstrap: `${prefix}_framework/dotnet.js`,
  compilerIdentity: 'e'.repeat(64),
  runtimeFiles: [entry(`${prefix}_framework/dotnet.js`), entry(`${prefix}_framework/dotnet.native.wasm`)],
  references: [entry(`${prefix}refs/PicoGK.dll`)],
});
const manifest = { format: 'tau-picogk-browser-v2', single: variant(''), multi: variant('multi/') };
const manifestBytes = encode(JSON.stringify(manifest));
const totalBytes = Object.values(contents).reduce((total, text) => total + encode(text).length, 0);
const pin: PicogkBrowserHostPin = {
  schemaVersion: 1,
  inputsKey: key,
  manifest: { sha256: hex(manifestBytes), byteLength: manifestBytes.length },
  files: { count: 6, byteLength: totalBytes },
};
const { production, staging } = blobBases;
const noWait: RetryPolicy = { attempts: 2, wait: async () => undefined };

const serve =
  (
    routes: ReadonlyMap<string, Uint8Array<ArrayBuffer> | number | Error>,
    seen: string[] = [],
    requests: string[] = [],
  ): typeof fetch =>
  async (input, init) => {
    const url = input instanceof Request ? input.url : input instanceof URL ? input.href : input;
    seen.push(url);
    requests.push(`${init?.method ?? 'GET'} ${url}`);
    const route = routes.get(url);
    if (route instanceof Error) {
      throw route;
    }
    return route === undefined || typeof route === 'number'
      ? new Response(undefined, { status: route ?? 404 })
      : new Response(route);
  };
// Both environments' hosts, each serving every pinned blob, unless an override replaces a route.
const mirror = (
  overrides: ReadonlyMap<string, Uint8Array<ArrayBuffer> | number | Error> = new Map(),
  bases: readonly string[] = [production, staging],
) =>
  new Map<string, Uint8Array<ArrayBuffer> | number | Error>([
    ...bases.flatMap((base) => [
      [`${base}${pin.manifest.sha256}`, manifestBytes] as const,
      ...Object.values(contents).map((text) => [`${base}${hex(text)}`, encode(text)] as const),
    ]),
    ...overrides,
  ]);
const io = () => {
  const out: string[] = [];
  const errors: string[] = [];
  return {
    out,
    errors,
    io: {
      out: (line: string) => {
        out.push(line);
      },
      err: (line: string) => {
        errors.push(line);
      },
    },
  };
};

describe('picogk-browser-host-pin', () => {
  const roots: string[] = [];
  const temporary = async (): Promise<string> => {
    const root = await mkdtemp(join(tmpdir(), 'tau-picogk-host-pin-'));
    roots.push(root);
    return root;
  };
  const bundle = async (changes: Readonly<Record<string, string | undefined>> = {}): Promise<string> => {
    const root = await temporary();
    const files: Record<string, string | undefined> = {
      ...contents,
      'assets-manifest.json': JSON.stringify(manifest),
      'assets-receipt.json': '{"url":"./assets-manifest.json"}',
      ...changes,
    };
    for (const [path, text] of Object.entries(files)) {
      if (text !== undefined) {
        // oxlint-disable-next-line no-await-in-loop -- fixture files are written in order
        await mkdir(dirname(join(root, path)), { recursive: true });
        // oxlint-disable-next-line no-await-in-loop -- fixture files are written in order
        await writeFile(join(root, path), text);
      }
    }
    return root;
  };

  afterEach(async () => {
    await Promise.all(roots.splice(0).map(async (root) => rm(root, { recursive: true, force: true })));
  });

  describe('inputs key and tag', () => {
    it('should accept the v2 cache key shape and refuse anything else', () => {
      expect(isInputsKey(key)).toBe(true);
      expect(isInputsKey(`${key}-extra`)).toBe(false);
      expect(isInputsKey('picogk-browser-host-v2')).toBe(false);
    });

    it('should name the tag by the first 16 hex of the key digest', () => {
      expect(dependencyTag(key)).toBe(`dependency@picogk-browser-${hex(key).slice(0, 16)}`);
      expect(dependencyTag(key)).toMatch(/^dependency@picogk-browser-[\da-f]{16}$/u);
      expect(dependencyTag(otherKey)).not.toBe(dependencyTag(key));
    });
  });

  describe('pin parsing', () => {
    it('should parse a schema v1 pin and ignore its provenance note', () => {
      expect(parsePin({ '//': 'note', ...pin })).toEqual(pin);
      expect(parsePin(JSON.parse(serializePin(pin)))).toEqual(pin);
      expect(serializePin(pin)).toMatch(/^\{\n {2}"\/\/": "Written by the release bot/u);
      expect(serializePin(pin).endsWith('}\n')).toBe(true);
    });

    it('should refuse a pin with another schema, key, manifest or file record', () => {
      expect(() => parsePin({ ...pin, schemaVersion: 2 })).toThrow(
        new TypeError('Not a schema v1 PicoGK browser host pin.'),
      );
      expect(() => parsePin([])).toThrow('Not a schema v1 PicoGK browser host pin.');
      expect(() => parsePin({ ...pin, inputsKey: 'x' })).toThrow('has no valid inputsKey');
      expect(() => parsePin({ ...pin, manifest: { sha256: 'x', byteLength: 1 } })).toThrow(
        'has no valid manifest digest and byte length',
      );
      expect(() => parsePin({ ...pin, manifest: { ...pin.manifest, byteLength: 0 } })).toThrow(
        'has no valid manifest digest and byte length',
      );
      expect(() => parsePin({ ...pin, files: { count: 0, byteLength: 0 } })).toThrow(
        'has no valid file count and byte length',
      );
      expect(() => parsePin({ ...pin, files: { count: 1, byteLength: -1 } })).toThrow(
        'has no valid file count and byte length',
      );
    });

    it('should read an absent pin as nothing pinned and refuse an invalid file', async () => {
      const root = await temporary();
      await expect(readPin(join(root, 'browser-host.pin.json'))).resolves.toBeUndefined();
      await writeFile(join(root, 'browser-host.pin.json'), serializePin(pin));
      await expect(readPin(join(root, 'browser-host.pin.json'))).resolves.toEqual(pin);
      await writeFile(join(root, 'browser-host.pin.json'), '{"schemaVersion":1}');
      await expect(readPin(join(root, 'browser-host.pin.json'))).rejects.toThrow('has no valid inputsKey');
      await expect(readPin(root)).rejects.toThrow('EISDIR');
    });
  });

  describe('skip decision', () => {
    it('should skip only when the tree key equals the pinned key', () => {
      expect(pinStatus(pin, key)).toEqual({ pinned: true, tag: dependencyTag(key) });
      expect(pinStatus(pin, otherKey)).toEqual({ pinned: false, tag: dependencyTag(otherKey) });
      expect(pinStatus(undefined, key)).toEqual({ pinned: false, tag: dependencyTag(key) });
    });

    it('should refuse a key that is not an inputs key', () => {
      expect(() => pinStatus(pin, '')).toThrow(new TypeError('Not a PicoGK browser host inputs key: "".'));
    });
  });

  describe('manifest files', () => {
    it('should list serial then threaded files and allow a serial-only host', () => {
      expect(manifestFiles(manifestBytes).map(({ path }) => path)).toEqual([
        '_framework/dotnet.js',
        '_framework/dotnet.native.wasm',
        'refs/PicoGK.dll',
        'multi/_framework/dotnet.js',
        'multi/_framework/dotnet.native.wasm',
        'multi/refs/PicoGK.dll',
      ]);
      expect(manifestFiles(encode(JSON.stringify({ ...manifest, multi: undefined })))).toHaveLength(3);
    });

    it('should refuse another format, a malformed entry and a duplicate path', () => {
      expect(() => manifestFiles(encode('{"format":"tau-picogk-browser-v1"}'))).toThrow(
        new TypeError('Not a tau-picogk-browser-v2 manifest.'),
      );
      expect(() => manifestFiles(encode(JSON.stringify({ ...manifest, single: {} })))).toThrow(
        'single variant has no runtimeFiles and references',
      );
      const bad = { ...variant(''), references: [{ path: 'refs/../x', sha256: 'f'.repeat(64), byteLength: 1 }] };
      expect(() => manifestFiles(encode(JSON.stringify({ ...manifest, multi: bad })))).toThrow(
        'multi variant lists an invalid file',
      );
      const twice = { ...variant(''), references: [entry('_framework/dotnet.js')] };
      expect(() => manifestFiles(encode(JSON.stringify({ ...manifest, single: twice })))).toThrow(
        'lists _framework/dotnet.js twice or over its own files',
      );
    });
  });

  describe('content types', () => {
    it.each([
      ['_framework/dotnet.native.wasm', 'application/wasm'],
      ['_framework/dotnet.js', 'text/javascript'],
      ['_framework/dotnet.runtime.MJS', 'text/javascript'],
      ['assets-manifest.json', 'application/json'],
      ['refs/PicoGK.dll', 'application/octet-stream'],
      ['_framework/icudt.dat', 'application/octet-stream'],
      ['LICENSE', 'application/octet-stream'],
    ])('should serve %s as %s', (path, type) => {
      expect(contentType(path)).toBe(type);
    });
  });

  describe('bundle verification and the pin', () => {
    it('should pin a bundle by its manifest, file count and byte length', async () => {
      const verified = await verifyBundle(await bundle());
      expect(verified.manifest).toEqual(pin.manifest);
      expect(pinFor(key, verified)).toEqual(pin);
    });

    it('should refuse a bundle with an unlisted, changed or missing file', async () => {
      await expect(verifyBundle(await bundle({ 'stray.txt': 'x' }))).rejects.toThrow(
        'The bundle holds files its manifest does not list: stray.txt.',
      );
      await expect(verifyBundle(await bundle({ 'refs/PicoGK.dll': 'other bytes' }))).rejects.toThrow(
        "The bundle's refs/PicoGK.dll does not match its manifest entry.",
      );
      await expect(verifyBundle(await bundle({ 'multi/refs/PicoGK.dll': undefined }))).rejects.toThrow(
        'The bundle is missing multi/refs/PicoGK.dll.',
      );
    });
  });

  describe('reproducibility', () => {
    it('should pass two byte-identical builds', async () => {
      await expect(compareBundles(await bundle(), await bundle())).resolves.toEqual([]);
    });

    it('should refuse two builds that differ in bytes or in files', async () => {
      const first = await bundle({ 'assets-receipt.json': 'one' });
      const second = await bundle({ 'assets-receipt.json': 'two', 'refs/PicoGK.dll': undefined, 'extra.bin': 'x' });
      await expect(compareBundles(first, second)).resolves.toEqual([
        'refs/PicoGK.dll is only in the first build',
        'extra.bin is only in the second build',
        `assets-receipt.json differs (${hex('one')} 3 B, ${hex('two')} 3 B)`,
      ]);
      const { errors, io: streams } = io();
      await expect(run(['compare', first, second], streams)).resolves.toBe(1);
      expect(errors[0]).toMatch(/^The two builds of the PicoGK browser host differ; nothing is pinned:\n {2}refs/u);
    });
  });

  describe('publish plan', () => {
    it('should list each distinct blob once, files first and the manifest last', async () => {
      const rows = publishPlan({
        pin,
        tag: dependencyTag(key),
        inputsKey: key,
        bundle: await verifyBundle(await bundle()),
      });
      expect(rows).toEqual([
        {
          sha256: hex(contents['_framework/dotnet.js']!),
          path: '_framework/dotnet.js',
          contentType: 'text/javascript',
        },
        {
          sha256: hex(contents['_framework/dotnet.native.wasm']!),
          path: '_framework/dotnet.native.wasm',
          contentType: 'application/wasm',
        },
        { sha256: hex('shared reference'), path: 'refs/PicoGK.dll', contentType: 'application/octet-stream' },
        {
          sha256: hex(contents['multi/_framework/dotnet.js']!),
          path: 'multi/_framework/dotnet.js',
          contentType: 'text/javascript',
        },
        {
          sha256: hex(contents['multi/_framework/dotnet.native.wasm']!),
          path: 'multi/_framework/dotnet.native.wasm',
          contentType: 'application/wasm',
        },
        { sha256: pin.manifest.sha256, path: 'assets-manifest.json', contentType: 'application/json' },
      ]);
    });

    it('should serve one digest under two media types as plain bytes', () => {
      const files = [
        { path: 'a.js', sha256: 'f'.repeat(64), byteLength: 1 },
        { path: 'a.wasm', sha256: 'f'.repeat(64), byteLength: 1 },
      ];
      const shared = { ...pin, files: { count: 2, byteLength: 2 } };
      expect(
        publishPlan({
          pin: shared,
          tag: dependencyTag(key),
          inputsKey: key,
          bundle: { manifest: pin.manifest, files },
        })[0],
      ).toEqual({
        sha256: 'f'.repeat(64),
        path: 'a.js',
        contentType: 'application/octet-stream',
      });
    });

    it('should refuse a missing pin, another tag, another key and a bundle that is not the pinned one', async () => {
      const verified = await verifyBundle(await bundle());
      const tag = dependencyTag(key);
      expect(() => publishPlan({ pin: undefined, tag, inputsKey: key, bundle: verified })).toThrow(
        `${tag} carries no PicoGK browser host pin; nothing is published.`,
      );
      expect(() => publishPlan({ pin, tag: dependencyTag(otherKey), inputsKey: key, bundle: verified })).toThrow(
        `${dependencyTag(otherKey)} is not the tag of the pinned inputs key (${tag}).`,
      );
      expect(() => publishPlan({ pin, tag, inputsKey: otherKey, bundle: verified })).toThrow(
        `The tree's inputs key ${otherKey} is not the pinned ${key}.`,
      );
      const other = { ...pin, files: { ...pin.files, byteLength: pin.files.byteLength + 1 } };
      expect(() => publishPlan({ pin: other, tag, inputsKey: key, bundle: verified })).toThrow(
        'The bundle does not match the pin',
      );
    });
  });

  describe('pinned blob check', () => {
    it('should pass when the mirror serves the manifest and every distinct blob once', async () => {
      const seen: string[] = [];
      await expect(checkPinnedBlobs({ pin, base: production, transport: serve(mirror(), seen) })).resolves.toEqual([]);
      expect(seen[0]).toBe(`${production}${pin.manifest.sha256}`);
      expect(seen).toHaveLength(6);
      expect(new Set(seen).size).toBe(6);
    });

    it('should report a missing, changed, oversized or unreachable blob', async () => {
      const url = (text: string) => `${production}${hex(text)}`;
      const failures = await checkPinnedBlobs({
        pin,
        base: production,
        retry: noWait,
        transport: serve(
          mirror(
            new Map<string, Uint8Array<ArrayBuffer> | number | Error>([
              [url(contents['_framework/dotnet.js']!), 404],
              [url(contents['_framework/dotnet.native.wasm']!), encode('wasm bytez')],
              [url('shared reference'), encode('shared reference and more')],
              [url(contents['multi/_framework/dotnet.js']!), encode('short')],
              [url(contents['multi/_framework/dotnet.native.wasm']!), new TypeError('fetch failed')],
            ]),
          ),
        ),
      });
      expect(failures).toEqual([
        `_framework/dotnet.js: ${url(contents['_framework/dotnet.js']!)} answered HTTP 404`,
        `_framework/dotnet.native.wasm: ${url(contents['_framework/dotnet.native.wasm']!)} does not hash to ${hex(contents['_framework/dotnet.native.wasm']!)}`,
        `multi/_framework/dotnet.js: ${url(contents['multi/_framework/dotnet.js']!)} served 5 bytes, not 22`,
        `multi/_framework/dotnet.native.wasm: ${url(contents['multi/_framework/dotnet.native.wasm']!)} could not be fetched: fetch failed`,
        `refs/PicoGK.dll: ${url('shared reference')} serves more than the pinned 16 bytes`,
      ]);
    });

    it('should retry a blob that is not served yet', async () => {
      let first = true;
      const flaky: typeof fetch = async (input, init) => {
        if (first) {
          first = false;
          return new Response(undefined, { status: 404 });
        }
        return serve(mirror())(input, init);
      };
      const waits: number[] = [];
      const retry: RetryPolicy = {
        attempts: 2,
        wait: async (attempt) => {
          waits.push(attempt);
        },
      };
      await expect(checkPinnedBlobs({ pin, base: production, transport: flaky, retry })).resolves.toEqual([]);
      expect(waits).toEqual([1]);
    });

    it('should stop at a missing manifest or a manifest that is not the pinned inventory', async () => {
      const manifestUrl = `${production}${pin.manifest.sha256}`;
      await expect(
        checkPinnedBlobs({
          pin,
          base: production,
          retry: noWait,
          transport: serve(new Map([[manifestUrl, 404]])),
        }),
      ).resolves.toEqual([`manifest: ${manifestUrl} answered HTTP 404`]);
      const counted = { ...pin, files: { count: 5, byteLength: totalBytes } };
      await expect(checkPinnedBlobs({ pin: counted, base: production, transport: serve(mirror()) })).resolves.toEqual([
        `manifest lists 6 files of ${String(totalBytes)} bytes, not the pinned 5 of ${String(totalBytes)}`,
      ]);
    });
  });

  describe('served decision', () => {
    const manifestUrl = (base: string) => `${base}${pin.manifest.sha256}`;

    it('should stop at one HEAD when production does not serve the manifest', async () => {
      const requests: string[] = [];
      const transport = serve(mirror(new Map(), [staging]), [], requests);
      await expect(pinServed({ pin, transport, retry: noWait })).resolves.toEqual({
        served: false,
        reason: `${manifestUrl(production)} is not served (HTTP 404)`,
      });
      expect(requests).toEqual([`HEAD ${manifestUrl(production)}`]);
    });

    it('should stop at the staging HEAD without fetching any blob when staging does not serve the manifest', async () => {
      const requests: string[] = [];
      const transport = serve(mirror(new Map(), [production]), [], requests);
      await expect(pinServed({ pin, transport, retry: noWait })).resolves.toEqual({
        served: false,
        reason: `${manifestUrl(staging)} is not served (HTTP 404)`,
      });
      expect(requests).toEqual([`HEAD ${manifestUrl(production)}`, `HEAD ${manifestUrl(staging)}`]);
    });

    it('should read another status, an unreachable host or a wrong length as not served', async () => {
      await expect(
        pinServed({ pin, transport: serve(mirror(new Map([[manifestUrl(production), 503]]))), retry: noWait }),
      ).resolves.toEqual({ served: false, reason: `${manifestUrl(production)} answered HTTP 503` });
      await expect(
        pinServed({
          pin,
          transport: serve(mirror(new Map([[manifestUrl(staging), new Error('offline')]]))),
          retry: noWait,
        }),
      ).resolves.toEqual({ served: false, reason: `${manifestUrl(staging)} could not be probed: offline` });
      const throwsText: typeof fetch = async () => {
        // oxlint-disable-next-line no-throw-literal, typescript/only-throw-error -- a transport may throw a non-Error
        throw 'refused';
      };
      await expect(pinServed({ pin, transport: throwsText })).resolves.toEqual({
        served: false,
        reason: `${manifestUrl(production)} could not be probed: refused`,
      });
      const wrongLength: typeof fetch = async () =>
        new Response(undefined, { status: 200, headers: { 'content-length': '1' } });
      await expect(pinServed({ pin, transport: wrongLength, retry: noWait })).resolves.toEqual({
        served: false,
        reason: `${manifestUrl(production)} is 1 bytes, not the pinned ${String(pin.manifest.byteLength)}`,
      });
    });

    it('should prove both hosts in full before deciding the pin is served', async () => {
      const requests: string[] = [];
      await expect(
        pinServed({ pin, transport: serve(mirror(), [], requests), retry: noWait, concurrency: 2 }),
      ).resolves.toEqual({
        served: true,
        reason: `manifest ${pin.manifest.sha256} and its 6 files are already served with their digests at ${production} and ${staging}`,
      });
      expect(requests.slice(0, 2)).toEqual([`HEAD ${manifestUrl(production)}`, `HEAD ${manifestUrl(staging)}`]);
      // The manifest and the five distinct files, read once on each host.
      expect(requests.slice(2).filter((request) => request.startsWith('GET '))).toHaveLength(12);
      // Without a retry policy, a host that serves everything at once is proven without a wait.
      await expect(pinServed({ pin, transport: serve(mirror()) })).resolves.toMatchObject({ served: true });
      const missingBlob = `${staging}${hex(contents['_framework/dotnet.js']!)}`;
      await expect(
        pinServed({ pin, transport: serve(mirror(new Map([[missingBlob, 404]]))), retry: noWait }),
      ).resolves.toEqual({
        served: false,
        reason: `_framework/dotnet.js: ${missingBlob} answered HTTP 404`,
      });
    });
  });

  describe('command line', () => {
    it('should print usage for an unknown command or missing flag', async () => {
      for (const argv of [
        [],
        ['status', '--pin', 'x'],
        ['check', '--nope', 'x'],
        ['check', 'pin', 'x'],
        ['check', '--pin', 'x', '--environment', 'preview'],
        ['check', '--pin', 'x', '--environment', 'staging', '--base', 'https://mirror.test/blobs/sha256/'],
        ['compare', 'a'],
      ]) {
        const { errors, io: streams } = io();
        // oxlint-disable-next-line no-await-in-loop -- each argument list is checked in turn
        await expect(run(argv, streams)).resolves.toBe(2);
        expect(errors[0]).toMatch(/^Usage: node scripts\/src\/picogk-browser-host-pin\.ts status/u);
      }
    });

    it('should report the skip decision as step outputs', async () => {
      const root = await temporary();
      const path = join(root, 'browser-host.pin.json');
      await writeFile(path, serializePin(pin));
      const { out, io: streams } = io();
      await expect(run(['status', '--pin', path, '--key', key], streams)).resolves.toBe(0);
      await expect(run(['status', '--pin', join(root, 'absent.json'), '--key', key], streams)).resolves.toBe(0);
      expect(out).toEqual(['pinned=true', `tag=${dependencyTag(key)}`, 'pinned=false', `tag=${dependencyTag(key)}`]);
      const { errors, io: failing } = io();
      await expect(run(['status', '--pin', path, '--key', 'nope'], failing)).resolves.toBe(1);
      expect(errors).toEqual(['Not a PicoGK browser host inputs key: "nope".']);
    });

    it('should write a pin and plan its publish from a verified bundle', async () => {
      const root = await temporary();
      const host = await bundle();
      const path = join(root, 'browser-host.pin.json');
      const plan = join(root, 'plan.tsv');
      const { out, io: streams } = io();
      await expect(run(['compare', host, await bundle()], streams)).resolves.toBe(0);
      await expect(run(['write', '--key', key, '--bundle', host, '--out', path], streams)).resolves.toBe(0);
      expect(await readPin(path)).toEqual(pin);
      await expect(
        run(
          ['plan', '--pin', path, '--key', key, '--bundle', host, '--tag', dependencyTag(key), '--out', plan],
          streams,
        ),
      ).resolves.toBe(0);
      const text = await readFile(plan, 'utf8');
      const rows = text.trimEnd().split('\n');
      expect(rows).toHaveLength(6);
      expect(rows.at(-1)).toBe(`${pin.manifest.sha256}\tassets-manifest.json\tapplication/json`);
      expect(out).toEqual([
        'The two builds of the PicoGK browser host are byte-identical.',
        `Pinned manifest ${pin.manifest.sha256} (6 files) for ${key}.`,
        'Planned 6 write-once blobs.',
      ]);
    });

    it('should pass the blob check trivially without a pin and fail it on an unserved blob', async () => {
      const root = await temporary();
      const path = join(root, 'browser-host.pin.json');
      const { out, errors, io: streams } = io();
      await expect(
        run(['check', '--pin', path], streams, { transport: serve(new Map()), retry: noWait }),
      ).resolves.toBe(0);
      expect(out[0]).toBe(
        `::notice title=No PicoGK browser host pin::${path} does not exist yet, so no blob is checked.`,
      );
      await writeFile(path, serializePin(pin));
      await expect(run(['check', '--pin', path], streams, { transport: serve(mirror()), retry: noWait })).resolves.toBe(
        0,
      );
      expect(out.slice(1)).toEqual([
        `Every blob of manifest ${pin.manifest.sha256} (6 files) is served at ${production}.`,
        `Every blob of manifest ${pin.manifest.sha256} (6 files) is served at ${staging}.`,
      ]);
      const base = 'https://mirror.test/blobs/sha256/';
      await expect(
        run(['check', '--pin', path, '--base', base], streams, { transport: serve(new Map()), retry: noWait }),
      ).resolves.toBe(1);
      expect(errors).toEqual([
        `Pinned PicoGK browser host blobs that are not served with their digest:\n  manifest: ${base}${pin.manifest.sha256} answered HTTP 404`,
      ]);
    });

    it('should prove both hosts by default and fail when either one misses a blob', async () => {
      const root = await temporary();
      const path = join(root, 'browser-host.pin.json');
      await writeFile(path, serializePin(pin));
      const { out, errors, io: streams } = io();
      const seen: string[] = [];
      const productionOnly = serve(mirror(new Map(), [production]), seen);
      await expect(run(['check', '--pin', path], streams, { transport: productionOnly, retry: noWait })).resolves.toBe(
        1,
      );
      expect(new Set(seen.map((url) => new URL(url).host))).toEqual(
        new Set(['dependencies.tau.new', 'dependencies.taucad.dev']),
      );
      expect(out).toEqual([`Every blob of manifest ${pin.manifest.sha256} (6 files) is served at ${production}.`]);
      expect(errors).toEqual([
        `Pinned PicoGK browser host blobs that are not served with their digest:\n  manifest: ${staging}${pin.manifest.sha256} answered HTTP 404`,
      ]);
      const stagingOnly = serve(mirror(new Map(), [staging]));
      await expect(
        run(['check', '--pin', path, '--environment', 'staging'], streams, { transport: stagingOnly, retry: noWait }),
      ).resolves.toBe(0);
      await expect(
        run(['check', '--pin', path, '--environment', 'production'], streams, {
          transport: stagingOnly,
          retry: noWait,
        }),
      ).resolves.toBe(1);
      expect(out.at(-1)).toBe(`Every blob of manifest ${pin.manifest.sha256} (6 files) is served at ${staging}.`);
      expect(errors.at(-1)).toBe(
        `Pinned PicoGK browser host blobs that are not served with their digest:\n  manifest: ${production}${pin.manifest.sha256} answered HTTP 404`,
      );
    });

    it('should report whether a written pin is already served as a step output', async () => {
      const root = await temporary();
      const path = join(root, 'browser-host.pin.json');
      const { out, errors, io: streams } = io();
      await expect(run(['served', '--pin', path], streams)).resolves.toBe(1);
      expect(errors).toEqual([`${path} does not exist; write the pin before asking whether it is served.`]);
      await writeFile(path, serializePin(pin));
      await expect(
        run(['served', '--pin', path], streams, { transport: serve(mirror()), retry: noWait }),
      ).resolves.toBe(0);
      await expect(
        run(['served', '--pin', path], streams, { transport: serve(new Map()), retry: noWait }),
      ).resolves.toBe(0);
      expect(out).toEqual(['served=true', 'served=false']);
      expect(errors.slice(1)).toEqual([
        `Already served: manifest ${pin.manifest.sha256} and its 6 files are already served with their digests at ${production} and ${staging}.`,
        `Not served: ${production}${pin.manifest.sha256} is not served (HTTP 404).`,
      ]);
      await expect(run(['served', '--pin', path, '--base', production], streams)).resolves.toBe(2);
    });

    it('should name each environment by its dependency host', () => {
      expect(blobBases).toEqual({
        production: 'https://dependencies.tau.new/blobs/sha256/',
        staging: 'https://dependencies.taucad.dev/blobs/sha256/',
      });
      expect(serializePin(pin)).toContain('https://dependencies.tau.new/blobs/sha256/<hex>');
      expect(serializePin(pin)).not.toContain('cdn.tau.new');
    });
  });
});
