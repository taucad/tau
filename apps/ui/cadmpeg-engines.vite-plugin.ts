import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import type { Plugin } from 'vite';

/** The `engines` option the build defines for the cadmpeg kernel (`app/runtime/cadmpeg-engines.ts`). */
export type CadmpegEnginesDefine = { readonly baseUrl: string; readonly layout: 'digest' | 'package' };

/** Where the dev server serves the installed engines, under the app base. */
export const cadmpegDevEnginePath = 'cadmpeg-ts/';

/** An engine file of the installed package: `<module id>_bg.wasm`, nothing else (no glue, no directory). */
const engineFilePattern = /^(?<id>[a-z\d]+)_bg\.wasm$/u;

/**
 * The installed `cadmpeg-ts` engine directory, resolved as `@taucad/cadmpeg` resolves it, so the served engines are the
 * ones whose digests the bundled plugin checks (charter I3).
 *
 * @param fromDirectory - A directory that resolves `@taucad/cadmpeg` (the UI app).
 * @returns The absolute `dist/wasm` directory of the installed `cadmpeg-ts`.
 */
export const resolveCadmpegEngineDirectory = (fromDirectory: string): string => {
  const plugin = createRequire(path.join(fromDirectory, 'package.json')).resolve('@taucad/cadmpeg/package.json');
  const manifest = createRequire(plugin).resolve('cadmpeg-ts/package.json');
  return path.join(path.dirname(manifest), 'dist', 'wasm');
};

/**
 * Parse the dependency host the deploy names (`CADMPEG_ENGINES_BASE`, the environment's `dependencies_base`).
 *
 * @param base - The host, with or without a trailing `/`.
 * @returns The host as a directory URL ending in `/`.
 * @throws When it is not a plain http(s) URL (credentials, query or fragment are refused).
 */
export const parseCadmpegEnginesBase = (base: string): string => {
  let url: URL;
  try {
    url = new URL(base.endsWith('/') ? base : `${base}/`);
  } catch (error) {
    throw new Error(`Invalid CADMPEG_ENGINES_BASE: ${base}`, { cause: error });
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error(`Invalid CADMPEG_ENGINES_BASE: ${base}`);
  }
  return url.href;
};

/**
 * Where a UI build loads the cadmpeg engines from (cadmpeg engine delivery charter D11, D12). Nothing is copied into a
 * build in any case (I1):
 *
 * - `base` set (tau.new and staging deploys): the environment's dependency host, `layout: 'digest'`.
 * - the dev server: the installed package, same-origin under `<app base>cadmpeg-ts/`, `layout: 'package'`. The
 *   dependency hosts admit only the deployed UI origins (charter F6), so development never reads them.
 * - any other build (local, CI, previews): nothing, and the browser kernel reports `KERNEL_NOT_PREPARED`.
 *
 * @param options - The deploy's dependency host, the Vite command and mode, and where to resolve `cadmpeg-ts`.
 * @param options.base - `CADMPEG_ENGINES_BASE`.
 * @param options.command - Vite's command: `serve` is the dev server, unless `mode` is `test`.
 * @param options.mode - Vite's mode.
 * @param options.root - The UI app directory.
 * @returns The `engines` option, its `tauCadmpegEngines` define, and the plugin that serves the installed engines in
 *   development.
 */
export const createCadmpegEngines = (options: {
  readonly base: string | undefined;
  readonly command: 'build' | 'serve';
  readonly mode: string;
  readonly root: string;
}): { engines: CadmpegEnginesDefine | undefined; define: string; plugin: Plugin } => {
  const dev = options.command === 'serve' && options.mode !== 'test';
  const engines: CadmpegEnginesDefine | undefined = options.base
    ? { baseUrl: parseCadmpegEnginesBase(options.base), layout: 'digest' }
    : dev
      ? { baseUrl: `/${cadmpegDevEnginePath}`, layout: 'package' }
      : undefined;
  let appBase = '/';
  return {
    engines,
    define: engines ? JSON.stringify(engines) : 'undefined',
    plugin: {
      name: 'tau:cadmpeg-engines',
      apply: 'serve',
      configResolved(config) {
        appBase = config.base;
      },
      configureServer(server) {
        if (engines?.layout !== 'package') {
          return;
        }
        const directory = resolveCadmpegEngineDirectory(options.root);
        server.middlewares.use(async (request, response, next) => {
          const pathname = (request.url ?? '').split('?')[0] ?? '';
          const prefix = `${appBase}${cadmpegDevEnginePath}`;
          const name = pathname.startsWith(prefix) ? pathname.slice(prefix.length) : undefined;
          if (name === undefined || !engineFilePattern.test(name) || !['GET', 'HEAD'].includes(request.method ?? '')) {
            next();
            return;
          }
          let bytes: Uint8Array<ArrayBuffer>;
          try {
            bytes = new Uint8Array(await readFile(path.join(directory, name)));
          } catch {
            response.statusCode = 404;
            response.end();
            return;
          }
          response.setHeader('Content-Type', 'application/wasm');
          response.setHeader('Content-Length', String(bytes.byteLength));
          response.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
          // The installed version can change under a running server; the kernel checks every byte anyway.
          response.setHeader('Cache-Control', 'no-cache');
          response.end(request.method === 'HEAD' ? undefined : bytes);
        });
      },
    },
  };
};
