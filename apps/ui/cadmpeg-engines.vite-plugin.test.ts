// @vitest-environment node
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { Connect, ResolvedConfig } from 'vite';
/* oxlint-disable eslint/no-restricted-imports -- Build plugin tests live outside app aliases. */
import {
  createCadmpegEngines,
  parseCadmpegEnginesBase,
  resolveCadmpegEngineDirectory,
} from './cadmpeg-engines.vite-plugin.js';
/* oxlint-enable eslint/no-restricted-imports */

type Digests = Readonly<Record<string, { readonly wasm: { readonly sha256: string; readonly byteLength: number } }>>;

/** The installed digest map, resolved the way `@taucad/cadmpeg` resolves it. */
const installedDigests = async (): Promise<Digests> => {
  const plugin = createRequire(path.join(import.meta.dirname, 'package.json')).resolve('@taucad/cadmpeg/package.json');
  const file = createRequire(plugin).resolve('cadmpeg-ts/digests');
  const { digests } = (await import(pathToFileURL(file).href)) as { digests: Digests };
  return digests;
};

type Served = {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: Uint8Array<ArrayBuffer> | undefined;
  readonly next: boolean;
};

/** Start the plugin's dev middleware under `base` and answer one request. */
const request = async (
  plugin: ReturnType<typeof createCadmpegEngines>['plugin'],
  url: string,
  options: { readonly base?: string; readonly method?: string } = {},
): Promise<Served> => {
  const middlewares: Connect.NextHandleFunction[] = [];
  const configResolved = plugin.configResolved as (config: Pick<ResolvedConfig, 'base'>) => void;
  const configureServer = plugin.configureServer as (server: {
    readonly middlewares: { readonly use: (handler: Connect.NextHandleFunction) => void };
  }) => void;
  configResolved({ base: options.base ?? '/' });
  configureServer({ middlewares: { use: (handler) => middlewares.push(handler) } });
  const handler = middlewares.at(0);
  if (handler === undefined) {
    return { status: 0, headers: {}, body: undefined, next: true };
  }
  return new Promise((resolve) => {
    const headers: Record<string, string> = {};
    const response = {
      statusCode: 200,
      setHeader: (name: string, value: string) => {
        headers[name.toLowerCase()] = value;
      },
      end: (body?: Uint8Array<ArrayBuffer>) => {
        resolve({ status: response.statusCode, headers, body, next: false });
      },
    };
    handler(
      { url, method: options.method ?? 'GET' } as unknown as Connect.IncomingMessage,
      response as unknown as Parameters<Connect.NextHandleFunction>[1],
      () => {
        resolve({ status: 0, headers, body: undefined, next: true });
      },
    );
  });
};

describe('cadmpeg engine delivery for the UI build', () => {
  it('should load from the deploy dependency host by digest', () => {
    expect(
      createCadmpegEngines({
        base: 'https://dependencies.tau.new',
        command: 'build',
        mode: 'production',
        root: import.meta.dirname,
      }).define,
    ).toBe('{"baseUrl":"https://dependencies.tau.new/","layout":"digest"}');
    expect(
      createCadmpegEngines({
        base: 'https://dependencies.taucad.dev',
        command: 'build',
        mode: 'production',
        root: import.meta.dirname,
      }).engines,
    ).toEqual({ baseUrl: 'https://dependencies.taucad.dev/', layout: 'digest' });
    expect(
      createCadmpegEngines({
        base: 'https://dependencies.tau.new/',
        command: 'serve',
        mode: 'development',
        root: import.meta.dirname,
      }).engines,
    ).toEqual({ baseUrl: 'https://dependencies.tau.new/', layout: 'digest' });
  });

  it('should serve the installed package same-origin on the dev server', () => {
    expect(
      createCadmpegEngines({ base: undefined, command: 'serve', mode: 'development', root: import.meta.dirname })
        .engines,
    ).toEqual({
      baseUrl: '/cadmpeg-ts/',
      layout: 'package',
    });
  });

  it('should define no source for any other build, nor under Vitest', () => {
    expect(
      createCadmpegEngines({ base: undefined, command: 'serve', mode: 'test', root: import.meta.dirname }).define,
    ).toBe('undefined');
    expect(
      createCadmpegEngines({ base: undefined, command: 'build', mode: 'production', root: import.meta.dirname })
        .engines,
    ).toBeUndefined();
    expect(
      createCadmpegEngines({ base: '', command: 'build', mode: 'production', root: import.meta.dirname }).engines,
    ).toBeUndefined();
  });

  it.each([
    'dependencies.tau.new',
    'file:///srv/dependencies/',
    'https://user:pass@dependencies.tau.new/',
    'https://dependencies.tau.new/?v=1',
    'https://dependencies.tau.new/#x',
  ])('should refuse the dependency host %s', (base) => {
    expect(() => parseCadmpegEnginesBase(base)).toThrow(/Invalid CADMPEG_ENGINES_BASE/u);
  });

  it('should resolve the engine directory of the cadmpeg-ts the plugin installs', async () => {
    const digests = await installedDigests();
    expect(Object.keys(digests)).toHaveLength(13);
    expect(path.basename(resolveCadmpegEngineDirectory(import.meta.dirname))).toBe('wasm');
  });

  it('should serve an installed engine whose bytes match the installed digest', async () => {
    const { plugin } = createCadmpegEngines({
      base: undefined,
      command: 'serve',
      mode: 'development',
      root: import.meta.dirname,
    });
    const { step } = await installedDigests();
    const served = await request(plugin, '/app/cadmpeg-ts/step_bg.wasm?import', { base: '/app/' });
    expect(served.next).toBe(false);
    expect(served.status).toBe(200);
    expect(served.headers).toMatchObject({
      'content-type': 'application/wasm',
      'cross-origin-resource-policy': 'same-origin',
      'content-length': String(step.wasm.byteLength),
    });
    expect(createHash('sha256').update(served.body!).digest('hex')).toBe(step.wasm.sha256);
  });

  it('should answer a HEAD without a body', async () => {
    const { plugin } = createCadmpegEngines({
      base: undefined,
      command: 'serve',
      mode: 'development',
      root: import.meta.dirname,
    });
    const served = await request(plugin, '/cadmpeg-ts/step_bg.wasm', { method: 'HEAD' });
    expect(served.status).toBe(200);
    expect(served.body).toBeUndefined();
  });

  it.each([
    '/cadmpeg-ts/step.js',
    '/cadmpeg-ts/package.json',
    '/cadmpeg-ts/../core.mjs',
    '/cadmpeg-ts/%2e%2e%2fcore.mjs',
    '/other/step_bg.wasm',
  ])('should pass %s to the next handler', async (url) => {
    const { plugin } = createCadmpegEngines({
      base: undefined,
      command: 'serve',
      mode: 'development',
      root: import.meta.dirname,
    });
    const served = await request(plugin, url);
    expect(served.next).toBe(true);
  });

  it('should answer 404 for an engine name the package does not hold', async () => {
    const { plugin } = createCadmpegEngines({
      base: undefined,
      command: 'serve',
      mode: 'development',
      root: import.meta.dirname,
    });
    const served = await request(plugin, '/cadmpeg-ts/unknown_bg.wasm');
    expect(served.status).toBe(404);
  });

  it('should mount nothing when the dev server loads by digest', async () => {
    const { plugin } = createCadmpegEngines({
      base: 'https://dependencies.taucad.dev/',
      command: 'serve',
      mode: 'development',
      root: import.meta.dirname,
    });
    const served = await request(plugin, '/cadmpeg-ts/step_bg.wasm');
    expect(served.next).toBe(true);
  });
});
