/**
 * Composer image host parity (d): the packaged Electron utility (composer image formats blueprint, "Host parity").
 *
 * Every case of the raster transcoder's `golden.json` and of the HEIF transcoder's `golden.json` runs through
 * `client.transcode` in the packaged app, on the same client the desktop composer converts with
 * (`apps/ui/app/services/attachment-image-backend.desktop.ts`): `createElectronClientOptions` with an ephemeral
 * `default` runtime, so the bytes come from an Electron utility process of the packaged app, with the codec WASM it
 * loads from beside the ASAR (`apps/desktop/scripts/runtime-stage.mts`). Each output must match the recorded
 * SHA-256, width and height, as it does in Node (a), Chromium (b) and Firefox/WebKit (c).
 */

import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { probeImage } from '@taucad/utils/image-probe';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { launchDesktopApp } from '#support/desktop-app.js';
import type { DesktopSession } from '#support/desktop-app.js';

type GoldenCase = {
  readonly fixture: string;
  readonly from: string;
  readonly to: string;
  readonly options: Record<string, unknown>;
  readonly sha256: string;
  readonly width: number;
  readonly height: number;
};

type ParityOutcome =
  | { readonly success: true; readonly bytes: readonly number[] }
  | { readonly success: false; readonly issues: readonly string[] };

type TranscodeResult =
  | { readonly success: true; readonly data: ReadonlyArray<{ readonly bytes: Uint8Array<ArrayBuffer> }> }
  | { readonly success: false; readonly issues: ReadonlyArray<{ readonly message: string }> };

type ParityClient = {
  readonly connect: () => Promise<void>;
  readonly transcode: (input: {
    readonly from: string;
    readonly to: string;
    readonly files: ReadonlyArray<{
      readonly name: string;
      readonly bytes: Uint8Array<ArrayBuffer>;
      readonly mimeType: string;
    }>;
    readonly options: Record<string, unknown>;
  }) => Promise<TranscodeResult>;
  readonly terminate: () => void;
};

const workspaceRoot = resolve(import.meta.dirname, '../../..');
const rasterFixtures = join(workspaceRoot, 'packages/plugins/image/src/raster/fixtures');
const heifFixtures = join(workspaceRoot, 'packages/plugins/heif/src/fixtures');

const readGolden = (directory: string): readonly GoldenCase[] =>
  (JSON.parse(readFileSync(join(directory, 'golden.json'), 'utf8')) as { readonly cases: readonly GoldenCase[] }).cases;

const rasterGolden = readGolden(rasterFixtures);
const heifGolden = readGolden(heifFixtures);

/** The one packaged UI chunk named `prefix…` whose source contains `diagnostic`, as an `app://tau` URL. */
const packagedRendererChunkUrl = (resourcesPath: string, prefix: string, diagnostic: string): string => {
  const assets = join(resourcesPath, 'ui/client/assets');
  const matches = readdirSync(assets).filter(
    (entry) =>
      entry.startsWith(prefix) &&
      entry.endsWith('.js') &&
      readFileSync(join(assets, entry), 'utf8').includes(diagnostic),
  );
  expect(matches, `unique packaged ${prefix} chunk containing ${diagnostic}`).toHaveLength(1);
  return `app://tau/assets/${matches[0]!}`;
};

let session: DesktopSession | undefined;

/** Transcode one golden case in the packaged renderer, through the utility client `beforeAll` connected. */
const transcodeInPackagedUtility = async (directory: string, entry: GoldenCase): Promise<ParityOutcome> =>
  session!.page.evaluate(
    async ({ fixture, source, from, to, options }) => {
      const { __tauImageParity: client } = globalThis as typeof globalThis & { __tauImageParity?: ParityClient };
      if (!client) {
        throw new Error('The packaged image parity client is unavailable');
      }
      const result = await client.transcode({
        from,
        to,
        files: [
          {
            name: fixture,
            bytes: Uint8Array.from(source),
            mimeType: 'application/octet-stream',
          },
        ],
        options,
      });
      if (!result.success) {
        return { success: false, issues: result.issues.map(({ message }) => message) };
      }
      const [file] = result.data;
      return { success: true, bytes: [...(file?.bytes ?? [])] };
    },
    {
      fixture: entry.fixture,
      source: [...readFileSync(join(directory, entry.fixture))],
      from: entry.from,
      to: entry.to,
      options: entry.options,
    },
  ) as Promise<ParityOutcome>;

const expectGolden = async (directory: string, entry: GoldenCase): Promise<void> => {
  const outcome = await transcodeInPackagedUtility(directory, entry);
  if (!outcome.success) {
    expect.fail(outcome.issues.join('; '));
  }
  const bytes = Uint8Array.from(outcome.bytes);
  const probe = probeImage(bytes);
  expect({
    sha256: createHash('sha256').update(bytes).digest('hex'),
    width: probe?.width,
    height: probe?.height,
    format: probe?.format,
  }).toEqual({ sha256: entry.sha256, width: entry.width, height: entry.height, format: entry.to });
};

describe('[completed-artifact] composer image host parity (d): packaged Electron utility', () => {
  beforeAll(async () => {
    session = await launchDesktopApp({ packaged: true, token: 'image-host-parity' });
    const resourcesPath = await session.application.evaluate(() => process.resourcesPath);
    const clientUrl = packagedRendererChunkUrl(
      resourcesPath,
      'client-',
      'createRuntimeClient: `transport` is required',
    );
    const rendererUrl = packagedRendererChunkUrl(
      resourcesPath,
      'renderer-',
      'requestElectronRuntimePort: preload relay omitted the runtime host ID',
    );
    await session.page.evaluate(
      async ({ clientUrl, rendererUrl }) => {
        type Callable = (...arguments_: unknown[]) => unknown;
        // Keep this import page-native: Vitest rewrites syntactic dynamic imports to its SSR helper, which does not
        // exist in the packaged renderer.
        // oxlint-disable-next-line eslint/no-new-func -- The string keeps import() native to the packaged page.
        const importModule = new Function('specifier', 'return import(specifier)') as (
          specifier: string,
        ) => Promise<Record<string, unknown>>;
        const clientModule = await importModule(clientUrl);
        const rendererModule = await importModule(rendererUrl);
        const createRuntimeClients = Object.values(clientModule).filter(
          (value): value is Callable =>
            typeof value === 'function' && value.toString().includes('createRuntimeClient: `transport` is required'),
        );
        if (createRuntimeClients.length !== 1) {
          throw new Error(
            `Expected one packaged createRuntimeClient export, received ${String(createRuntimeClients.length)}`,
          );
        }
        // `@taucad/runtime/electron/renderer` is dynamically imported, so the chunk exposes it as a namespace object
        // whose keys keep source names.
        const electronRenderer = Object.values(rendererModule).find(
          (value): value is { createElectronClientOptions: Callable } =>
            typeof value === 'object' &&
            value !== null &&
            typeof (value as { createElectronClientOptions?: unknown }).createElectronClientOptions === 'function',
        );
        if (!electronRenderer) {
          throw new Error('Expected a packaged @taucad/runtime/electron/renderer namespace export');
        }
        const environment = (globalThis as typeof globalThis & { ENV: Record<string, string> }).ENV;
        /* The composer's desktop conversion client: an ephemeral utility running the `default` runtime. */
        const provideClientOptions = electronRenderer.createElectronClientOptions({
          config: { tauApiUrl: environment['TAU_API_URL'], tauWebSocketUrl: environment['TAU_WEBSOCKET_URL'] },
          context: { purpose: 'ephemeral', definition: 'default' },
        }) as () => Promise<unknown>;
        const client = createRuntimeClients[0]!(await provideClientOptions()) as ParityClient;
        await client.connect();
        (globalThis as typeof globalThis & { __tauImageParity?: ParityClient }).__tauImageParity = client;
      },
      { clientUrl, rendererUrl },
    );
  });

  afterAll(async () => {
    await session?.page
      .evaluate(() => {
        (globalThis as typeof globalThis & { __tauImageParity?: ParityClient }).__tauImageParity?.terminate();
      })
      .catch(() => undefined);
    await session?.close();
    session = undefined;
  });

  it('should cover every raster source and target format, and both HEIC fixtures', () => {
    expect(new Set(rasterGolden.map(({ from }) => from))).toEqual(
      new Set(['jpeg', 'png', 'webp', 'gif', 'avif', 'bmp', 'tiff']),
    );
    expect(new Set(rasterGolden.map(({ to }) => to))).toEqual(new Set(['jpeg', 'png', 'webp']));
    expect(new Set(heifGolden.map(({ fixture }) => fixture))).toEqual(new Set(['small.heic', 'heic-rot6.heic']));
  });

  it.each(
    rasterGolden.map((entry) => [`${entry.fixture} → ${entry.to} ${JSON.stringify(entry.options)}`, entry] as const),
  )('should reproduce the raster golden output of %s', async (_label, entry) => {
    await expectGolden(rasterFixtures, entry);
  });

  it.each(
    heifGolden.map(
      (entry) => [`${entry.fixture} (${entry.from}) → ${entry.to} ${JSON.stringify(entry.options)}`, entry] as const,
    ),
  )('should reproduce the HEIF golden output of %s', async (_label, entry) => {
    await expectGolden(heifFixtures, entry);
  });
});
