// The cadmpeg engines a `tau serve` page loads (cadmpeg engine delivery charter W6, D12, I9, EQ1 option A). The serve
// UI build carries the cadmpeg glue and no engine: it fetches `<id>_bg.wasm` same-origin from the path it names in
// `cadmpeg-engines.json`, and the daemon answers that path from the `cadmpeg-ts` this CLI has installed. The layer and
// the CLI are released at different commits (F9), so before mounting anything the daemon compares the layer's
// `cadmpeg-ts` version and engine digests with its own. On a difference it mounts nothing and says why: the page's
// integrity check would refuse every engine anyway (I2), and a warning at start names both versions and the fix.
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

import type { StaticUiWasmMount } from '@taucad/host';

/** The file the serve UI build writes at its client root to say which engines it loads, and from where. */
export const servedEnginesManifestName = 'cadmpeg-engines.json';

/** The SHA-256 (lowercase hex) and byte length of one engine, as `cadmpeg-ts/digests` states its `wasm` file. */
export type EngineDigest = { readonly sha256: string; readonly byteLength: number };

/**
 * `cadmpeg-engines.json`, written by `apps/ui/serve/vite.config.ts`: the `cadmpeg-ts` version the build bundled the glue
 * of, the URL path it fetches `<id>_bg.wasm` from (`layout: 'package'`), and each engine's `wasm` digest.
 */
export type ServedEnginesManifest = {
  readonly schemaVersion: 1;
  readonly package: 'cadmpeg-ts';
  readonly version: string;
  readonly path: string;
  readonly modules: Readonly<Record<string, EngineDigest>>;
};

/** The `cadmpeg-ts` this CLI resolves through `@taucad/cadmpeg`: its version, engine directory and digests. */
export type InstalledEngines = {
  readonly version: string;
  /** The package's `dist/wasm` directory, which holds `<id>_bg.wasm`. */
  readonly directory: string;
  readonly modules: Readonly<Record<string, EngineDigest>>;
};

/** What the daemon serves beside the UI. */
export type ServeEngines =
  | {
      readonly status: 'mounted';
      readonly version: string;
      readonly mount: StaticUiWasmMount;
      /** The mounted engines' digests, which the layer and the CLI agree on. */
      readonly modules: Readonly<Record<string, EngineDigest>>;
    }
  /** The layer and the CLI disagree (EQ1 option A): nothing is mounted. */
  | { readonly status: 'skew'; readonly message: string }
  /** The UI names no engines (a build from before engine delivery, or not a Tau UI): nothing is mounted. */
  | { readonly status: 'none' };

const sha256Hex = /^[\da-f]{64}$/u;
/* The same shape `serveStaticUi` accepts for a mount: one lowercase segment between slashes. */
const mountPath = /^\/[\da-z][\d_a-z-]*\/$/u;
const moduleId = /^[\da-z]+$/u;

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const readDigests = (value: unknown, where: string): Readonly<Record<string, EngineDigest>> => {
  if (!isRecord(value) || Object.keys(value).length === 0) {
    throw new TypeError(`${where} lists no engines.`);
  }
  const modules: Record<string, EngineDigest> = {};
  for (const [id, digest] of Object.entries(value)) {
    const { sha256, byteLength } = isRecord(digest) ? digest : {};
    if (
      !moduleId.test(id) ||
      typeof sha256 !== 'string' ||
      !sha256Hex.test(sha256) ||
      !Number.isSafeInteger(byteLength) ||
      (byteLength as number) < 1
    ) {
      throw new TypeError(`${where} states no valid digest for engine ${JSON.stringify(id)}.`);
    }
    modules[id] = { sha256, byteLength: byteLength as number };
  }
  return modules;
};

/**
 * Validate a parsed `cadmpeg-engines.json`.
 *
 * @param value - The parsed file.
 * @returns The manifest.
 * @throws {TypeError} When a field is missing or malformed.
 */
export const readServedEnginesManifest = (value: unknown): ServedEnginesManifest => {
  const manifest = isRecord(value) ? value : {};
  const { version, path } = manifest;
  if (
    manifest['schemaVersion'] !== 1 ||
    manifest['package'] !== 'cadmpeg-ts' ||
    typeof version !== 'string' ||
    version === '' ||
    typeof path !== 'string' ||
    !mountPath.test(path)
  ) {
    throw new TypeError(`${servedEnginesManifestName} is not a schema 1 cadmpeg engine manifest.`);
  }
  return {
    schemaVersion: 1,
    package: 'cadmpeg-ts',
    version,
    path,
    modules: readDigests(manifest['modules'], servedEnginesManifestName),
  };
};

/**
 * Read the engine manifest a UI build carries at its client root.
 *
 * @param uiRoot - The UI build's client directory.
 * @returns The manifest, or `undefined` when the build carries none.
 * @throws {TypeError} When the file exists and is malformed.
 */
export const servedEnginesManifest = async (uiRoot: string): Promise<ServedEnginesManifest | undefined> => {
  const text = await readFile(join(uiRoot, servedEnginesManifestName), 'utf8').catch((error: unknown) => {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return undefined;
    }
    throw error;
  });
  return text === undefined ? undefined : readServedEnginesManifest(JSON.parse(text));
};

/**
 * Resolve the `cadmpeg-ts` this CLI loads, exactly as its runtime does: through `@taucad/cadmpeg`, whose dependency it
 * is. The digests are the package's own `cadmpeg-ts/digests`, generated from the bytes it ships.
 *
 * @param from - The module to resolve from; this one by default.
 * @returns The installed engines.
 * @throws {Error} When `@taucad/cadmpeg` or `cadmpeg-ts` cannot be resolved.
 */
export const installedEngines = async (from: string = import.meta.url): Promise<InstalledEngines> => {
  const plugin = createRequire(createRequire(from).resolve('@taucad/cadmpeg/package.json'));
  const packageJson = JSON.parse(await readFile(plugin.resolve('cadmpeg-ts/package.json'), 'utf8')) as {
    readonly version?: unknown;
  };
  if (typeof packageJson.version !== 'string') {
    throw new TypeError('The installed cadmpeg-ts states no version.');
  }
  const { digests } = (await import(pathToFileURL(plugin.resolve('cadmpeg-ts/digests')).href)) as {
    readonly digests: Readonly<Record<string, { readonly wasm: unknown }>>;
  };
  const wasm = Object.fromEntries(Object.entries(digests).map(([id, digest]) => [id, digest.wasm]));
  return {
    version: packageJson.version,
    /* `cadmpeg-ts/wasm/*` is the package's exported engine directory; its `package.json` sits beside the engines. */
    directory: dirname(plugin.resolve('cadmpeg-ts/wasm/package.json')),
    modules: readDigests(wasm, 'cadmpeg-ts/digests'),
  };
};

/** The first engine whose digest differs between the two maps, or that only one of them lists. */
const firstDifference = (
  layer: Readonly<Record<string, EngineDigest>>,
  installed: Readonly<Record<string, EngineDigest>>,
): string | undefined =>
  [...new Set([...Object.keys(layer), ...Object.keys(installed)])]
    .toSorted()
    .find((id) => layer[id]?.sha256 !== installed[id]?.sha256 || layer[id]?.byteLength !== installed[id]?.byteLength);

/**
 * Decide what the daemon serves beside a UI (EQ1 option A): the installed engine directory when the UI's manifest names
 * the same `cadmpeg-ts` version and the same engine digests, and nothing otherwise.
 *
 * @param manifest - The UI build's manifest, if it carries one.
 * @param installed - The CLI's installed engines, or why they could not be resolved.
 * @returns The mount, or why there is none.
 */
export const serveEngines = (
  manifest: ServedEnginesManifest | undefined,
  installed: InstalledEngines | Error,
): ServeEngines => {
  if (manifest === undefined) {
    return { status: 'none' };
  }
  const unavailable = `Native CAD import (SOLIDWORKS, CATIA, Inventor and the other cadmpeg formats) is unavailable in the served UI; every other kernel, and the agent's own native import, still work.`;
  if (installed instanceof Error) {
    return {
      status: 'skew',
      message: `The Tau UI served here expects cadmpeg-ts ${manifest.version} engines, and this CLI could not resolve its own cadmpeg-ts (${installed.message}), so tau serve serves no engines. ${unavailable} Fix: reinstall the CLI (npm install -g @taucad/cli).`,
    };
  }
  const difference = firstDifference(manifest.modules, installed.modules);
  if (manifest.version !== installed.version || difference !== undefined) {
    const what =
      manifest.version === installed.version
        ? `cadmpeg-ts ${manifest.version} engines whose ${difference!} digest differs from the cadmpeg-ts ${installed.version} this CLI has installed`
        : `cadmpeg-ts ${manifest.version} engines, and this CLI has cadmpeg-ts ${installed.version} installed`;
    return {
      status: 'skew',
      message: `The Tau UI served here was built against ${what}, so tau serve does not serve its engines. ${unavailable} Fix: install the Tau CLI release whose UI layer matches its cadmpeg-ts (npm install -g @taucad/cli@latest once the next Tau UI layer is pinned), or pass --ui=<a Tau UI serve build made against cadmpeg-ts ${installed.version}>.`,
    };
  }
  return {
    status: 'mounted',
    version: installed.version,
    mount: { path: manifest.path, root: installed.directory },
    modules: installed.modules,
  };
};

/**
 * Read the UI's manifest and the installed engines, and decide what to serve.
 *
 * @param uiRoot - The UI build's client directory.
 * @param resolveInstalled - Where the installed engines come from (tests).
 * @returns The mount, or why there is none.
 * @throws {TypeError} When the UI carries a malformed manifest.
 */
export const prepareServeEngines = async (
  uiRoot: string,
  resolveInstalled: () => Promise<InstalledEngines> = installedEngines,
): Promise<ServeEngines> => {
  const manifest = await servedEnginesManifest(uiRoot);
  if (manifest === undefined) {
    return { status: 'none' };
  }
  const installed = await resolveInstalled().catch((error: unknown) =>
    error instanceof Error ? error : new Error(String(error)),
  );
  return serveEngines(manifest, installed);
};

/**
 * The engine the `--smoke-test` fetches: the smallest one stated, so the check stays quick.
 *
 * @param modules - The mounted engines' digests.
 * @returns Its id and digest.
 */
export const smokeTestEngine = (
  modules: Readonly<Record<string, EngineDigest>>,
): { readonly id: string } & EngineDigest => {
  const [id, digest] = Object.entries(modules).toSorted(
    ([, left], [, right]) => left.byteLength - right.byteLength,
  )[0]!;
  return { id, ...digest };
};

/**
 * Hash a response body as it streams.
 *
 * @param response - A response whose body has not been read.
 * @returns The body's SHA-256 (lowercase hex) and byte length.
 */
export const sha256OfResponse = async (response: Response): Promise<EngineDigest> => {
  const hash = createHash('sha256');
  let byteLength = 0;
  if (response.body !== null) {
    for await (const chunk of response.body) {
      hash.update(chunk);
      byteLength += chunk.byteLength;
    }
  }
  return { sha256: hash.digest('hex'), byteLength };
};
