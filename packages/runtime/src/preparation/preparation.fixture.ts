/* oxlint-disable no-bitwise -- zip records are bit fields. */
// White-box fixtures of the preparation tests: in-test archives, a hermetic registry `fetch`, manifests and hosts.
// Nothing here reaches the network; a test that forgets to inject `fetch` hits `forbidGlobalFetch`.
import { createHash } from 'node:crypto';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crc32, gzipSync } from 'node:zlib';

import { parsePluginDeployment } from '#preparation/plugin-deployment.js';
import type { PreparationPlugin } from '#preparation/preparation-host.types.js';
import type {
  DependencyPayload,
  DependencyTarget,
  DependencyVariant,
  HostIndicators,
  PayloadFormat,
} from '#preparation/preparation.types.js';

const encoder = new TextEncoder();

/**
 * The SRI sha256 string of some bytes.
 * @param bytes - Bytes.
 * @returns `sha256-<base64>`.
 */
export const sri = (bytes: Uint8Array<ArrayBuffer>): DependencyPayload['integrity'] =>
  `sha256-${createHash('sha256').update(bytes).digest('base64')}`;

/**
 * Lowercase hex sha256 of some bytes: a blob's store key.
 * @param bytes - Bytes.
 * @returns The hex digest.
 */
export const sha256Hex = (bytes: Uint8Array<ArrayBuffer>): string => createHash('sha256').update(bytes).digest('hex');

/** One member of {@link tarGz}. */
export type TarMember = {
  readonly name: string;
  readonly data?: string;
  readonly mode?: number;
  readonly linkname?: string;
};

/**
 * A gzipped ustar archive.
 * @param members - Files and symlinks in order.
 * @returns The `.tar.gz` bytes.
 */
export const tarGz = (...members: readonly TarMember[]): Uint8Array<ArrayBuffer> => {
  const blocks: Array<Uint8Array<ArrayBuffer>> = [];
  for (const member of members) {
    const data = Buffer.from(member.data ?? '');
    const header = Buffer.alloc(512);
    header.write(member.name, 0);
    header.write(`${(member.mode ?? 0o644).toString(8).padStart(7, '0')}\0`, 100);
    header.write(`${data.length.toString(8).padStart(11, '0')}\0`, 124);
    header.write(member.linkname === undefined ? '0' : '2', 156);
    header.write(member.linkname ?? '', 157);
    header.write('ustar\u000000', 257);
    header.fill(0x20, 148, 156);
    header.write(
      `${header
        .reduce((sum, byte) => sum + byte, 0)
        .toString(8)
        .padStart(6, '0')}\0 `,
      148,
    );
    blocks.push(header, data, Buffer.alloc((512 - (data.length % 512)) % 512));
  }
  return new Uint8Array(gzipSync(Buffer.concat([...blocks, Buffer.alloc(1024)])));
};

/**
 * A zip of stored (uncompressed) regular files with mode 0644.
 * @param files - Path to text.
 * @returns The zip bytes.
 */
export const storedZip = (files: Readonly<Record<string, string>>): Uint8Array<ArrayBuffer> => {
  const locals: Array<Uint8Array<ArrayBuffer>> = [];
  const central: Array<Uint8Array<ArrayBuffer>> = [];
  let offset = 0;
  for (const [path, text] of Object.entries(files)) {
    const name = Buffer.from(path);
    const data = Buffer.from(text);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04_03_4b_50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(crc32(data), 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    const record = Buffer.alloc(46);
    record.writeUInt32LE(0x02_01_4b_50, 0);
    record.writeUInt16LE((3 << 8) | 20, 4);
    record.writeUInt32LE(crc32(data), 16);
    record.writeUInt32LE(data.length, 20);
    record.writeUInt32LE(data.length, 24);
    record.writeUInt16LE(name.length, 28);
    record.writeUInt32LE((0o10_0644 << 16) >>> 0, 38);
    record.writeUInt32LE(offset, 42);
    locals.push(local, name, data);
    central.push(record, name);
    offset += 30 + name.length + data.length;
  }
  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06_05_4b_50, 0);
  end.writeUInt16LE(central.length / 2, 8);
  end.writeUInt16LE(central.length / 2, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...locals, directory, end]));
};

/**
 * A wheel whose `RECORD` lists every member's digest.
 * @param distribution - Distribution name, such as `demo`.
 * @param files - Wheel-relative path to text, beside the generated `WHEEL` and `RECORD`.
 * @returns The `.whl` bytes.
 */
export const wheel = (distribution: string, files: Readonly<Record<string, string>>): Uint8Array<ArrayBuffer> => {
  const all: Record<string, string> = { ...files, [`${distribution}-1.0.dist-info/WHEEL`]: 'Wheel-Version: 1.0\n' };
  const rows = Object.entries(all).map(
    ([path, text]) =>
      `${path},sha256=${createHash('sha256').update(text).digest('base64url')},${Buffer.byteLength(text)}`,
  );
  return storedZip({
    ...all,
    [`${distribution}-1.0.dist-info/RECORD`]: `${[...rows, `${distribution}-1.0.dist-info/RECORD,,`].join('\n')}\n`,
  });
};

/**
 * Text as bytes.
 * @param text - Text.
 * @returns UTF-8 bytes.
 */
export const utf8 = (text: string): Uint8Array<ArrayBuffer> => encoder.encode(text);

/**
 * Where every in-test payload is pinned unless a test names other URLs.
 * @param name - Payload name.
 * @returns Its canonical https URL.
 */
export const originOf = (name: string): string => `https://registry.example/payloads/${name}`;

/**
 * A manifest payload pinned to `bytes`.
 * @param input - Name, bytes, format, destination and optional origin URLs.
 * @returns The payload.
 */
export const payloadOf = (input: {
  readonly name: string;
  readonly bytes: Uint8Array<ArrayBuffer>;
  readonly format: PayloadFormat;
  readonly destination: string;
  readonly urls?: readonly [string, ...string[]];
  readonly stripComponents?: number;
  readonly unpackedByteLength?: number;
}): DependencyPayload => ({
  name: input.name,
  integrity: sri(input.bytes),
  byteLength: input.bytes.byteLength,
  format: input.format,
  origin: { kind: 'url', urls: input.urls ?? [originOf(input.name)] },
  destination: input.destination,
  ...(input.stripComponents === undefined ? {} : { stripComponents: input.stripComponents }),
  ...(input.unpackedByteLength === undefined ? {} : { unpackedByteLength: input.unpackedByteLength }),
});

/** The Linux glibc x64 target every scenario prepares. */
export const linuxTarget: DependencyTarget = { runtime: 'native', os: 'linux', arch: 'x64', libc: 'glibc' };

/** A glibc 2.39 x64 Linux host. */
export const linuxHost: HostIndicators = {
  os: 'linux',
  arch: 'x64',
  libc: 'glibc',
  libcVersion: '2.39',
  translated: false,
  wasm: { threads: false },
};

/** One site-packages, as python-build-standalone lays it out. */
export const sitePackages = 'python/lib/python3.13/site-packages';

/**
 * The bytes of a three-payload Python closure: an interpreter archive, a wheel and a raw worker script.
 * @returns Payload name to bytes.
 */
export const pythonPayloadBytes = (): {
  readonly python: Uint8Array<ArrayBuffer>;
  readonly demo: Uint8Array<ArrayBuffer>;
  readonly 'worker.py': Uint8Array<ArrayBuffer>;
} => ({
  python: tarGz(
    { name: 'python/bin/python3.13', data: 'interpreter', mode: 0o755 },
    { name: 'python/bin/python3', linkname: 'python3.13', mode: 0o777 },
    // Group-writable, as some wheels and archives ship their files: the closure must not keep that bit (S30).
    { name: 'python/lib/python3.13/os.py', data: 'import abc\n', mode: 0o664 },
  ),
  demo: wheel('demo', {
    'demo/__init__.py': 'VALUE = 1\n',
    'demo-1.0.data/data/share/man/man1/demo.1': '.TH DEMO 1\n',
  }),
  'worker.py': utf8('print("ready")\n'),
});

/**
 * The manifest payloads of {@link pythonPayloadBytes}, in closure order.
 * @param bytes - Payload bytes.
 * @returns Three payloads.
 */
export const pythonPayloads = (
  bytes: ReturnType<typeof pythonPayloadBytes>,
): readonly [DependencyPayload, ...DependencyPayload[]] => [
  payloadOf({ name: 'python', bytes: bytes.python, format: 'tar.gz', destination: 'python', stripComponents: 1 }),
  payloadOf({ name: 'demo', bytes: bytes.demo, format: 'wheel', destination: sitePackages }),
  payloadOf({ name: 'worker.py', bytes: bytes['worker.py'], format: 'raw', destination: 'worker' }),
];

/**
 * A plugin whose manifest is validated by the real parser.
 * @param packageName - npm package.
 * @param dependencies - Dependency name to its variants.
 * @returns The plugin the host registers.
 */
export const pluginOf = (
  packageName: string,
  dependencies: Readonly<Record<string, readonly DependencyVariant[]>>,
): PreparationPlugin => ({
  package: packageName,
  deployment: parsePluginDeployment({
    schemaVersion: 1,
    dependencies,
    kernels: { default: { requires: Object.keys(dependencies), extensions: ['py'] } },
  }),
});

/** How the fake registry answers one URL. */
export type FakeRoute = {
  /** Body; absent answers `status` (default 404). */
  readonly bytes?: Uint8Array<ArrayBuffer>;
  readonly status?: number;
  /** Resolves when the response may start. */
  readonly hold?: Promise<void>;
  /** Resolves when the second half of the body may be sent; the first half is sent at once. */
  readonly holdBody?: Promise<void>;
  /** Delay between body chunks of 64 KiB (a throttled origin). Milliseconds. */
  readonly chunkDelay?: number;
};

/** A hermetic registry: `fetch` answers only routed URLs and records every request. */
export type FakeRegistry = {
  readonly fetch: typeof fetch;
  /** Every requested URL, in order. */
  readonly calls: string[];
  route(url: string, route: FakeRoute): void;
  /** Requests made for one URL. */
  count(url: string): number;
};

const urlOf = (input: Parameters<typeof fetch>[0]): string =>
  typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;

const waitFor = async (gate: Promise<void>, signal: AbortSignal | undefined): Promise<void> => {
  if (signal === undefined) {
    await gate;
    return;
  }
  signal.throwIfAborted();
  const aborted = Promise.withResolvers<never>();
  const onAbort = (): void => {
    aborted.reject(signal.reason instanceof Error ? signal.reason : new Error('aborted'));
  };
  signal.addEventListener('abort', onAbort, { once: true });
  try {
    await Promise.race([gate, aborted.promise]);
  } finally {
    signal.removeEventListener('abort', onAbort);
  }
};

const chunkSize = 64 * 1024;

const bodyOf = (
  route: FakeRoute & { readonly bytes: Uint8Array<ArrayBuffer> },
  signal: AbortSignal | undefined,
): ReadableStream<Uint8Array<ArrayBuffer>> =>
  new ReadableStream<Uint8Array<ArrayBuffer>>({
    async start(controller) {
      signal?.addEventListener(
        'abort',
        () => {
          controller.error(signal.reason);
        },
        { once: true },
      );
      try {
        const { bytes } = route;
        if (route.holdBody !== undefined) {
          const half = Math.floor(bytes.byteLength / 2);
          controller.enqueue(bytes.slice(0, half));
          await waitFor(route.holdBody, signal);
          controller.enqueue(bytes.slice(half));
        } else if (route.chunkDelay === undefined) {
          controller.enqueue(new Uint8Array(bytes));
        } else {
          for (let offset = 0; offset < bytes.byteLength; offset += chunkSize) {
            controller.enqueue(bytes.slice(offset, offset + chunkSize));
            // oxlint-disable-next-line no-await-in-loop -- a throttled origin sends one chunk at a time
            await waitFor(
              new Promise((resolve) => {
                setTimeout(resolve, route.chunkDelay);
              }),
              signal,
            );
          }
        }
        controller.close();
      } catch {
        // Aborted: the stream is already errored.
      }
    },
  });

/**
 * Create a hermetic registry.
 * @returns The registry.
 */
export const createFakeRegistry = (): FakeRegistry => {
  const routes = new Map<string, FakeRoute>();
  const calls: string[] = [];
  return {
    calls,
    route(url, route) {
      routes.set(url, route);
    },
    count(url) {
      return calls.filter((call) => call === url).length;
    },
    async fetch(input, init) {
      const url = urlOf(input);
      calls.push(url);
      const signal = init?.signal ?? undefined;
      signal?.throwIfAborted();
      const route = routes.get(url);
      if (route?.hold !== undefined) {
        await waitFor(route.hold, signal);
      }
      if (route?.bytes === undefined) {
        return new Response('not found', { status: route?.status ?? 404 });
      }
      return new Response(bodyOf({ ...route, bytes: route.bytes }, signal), {
        status: 200,
        headers: { 'content-length': String(route.bytes.byteLength) },
      });
    },
  };
};

/**
 * Route every payload of some variants to its own bytes at its first origin URL.
 * @param registry - The registry.
 * @param entries - Payload and bytes pairs.
 */
export const servePayloads = (
  registry: FakeRegistry,
  entries: ReadonlyArray<readonly [DependencyPayload, Uint8Array<ArrayBuffer>]>,
): void => {
  for (const [payload, bytes] of entries) {
    if (payload.origin.kind === 'url') {
      registry.route(payload.origin.urls[0], { bytes });
    }
  }
};

/**
 * The global `fetch` replacement every preparation test installs: the host must use its injected transport.
 * @returns A fetch that always rejects.
 */
export const forbidGlobalFetch = (): typeof fetch => async (input) => {
  throw new Error(`The global fetch was called for ${urlOf(input)}; preparation tests are hermetic.`);
};

/**
 * A fresh, empty directory under the OS temp root, resolved through symlinks.
 * @param prefix - Name prefix.
 * @returns The directory and its removal.
 */
export const temporaryDirectory = async (
  prefix: string,
): Promise<{ readonly path: string; readonly remove: () => Promise<void> }> => {
  const path = await realpath(await mkdtemp(join(tmpdir(), prefix)));
  return {
    path,
    remove: async () => {
      await rm(path, { recursive: true, force: true });
    },
  };
};
