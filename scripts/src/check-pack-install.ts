/**
 * Pack every publishable package, install the TGZs with npm outside Tau, and exercise the
 * published surface: every export subpath, every `files` entry, the native payloads that only
 * fail once instantiated, and the runtime's shipped README quick start.
 *
 * All tarballs install into ONE application in a single `npm install`, so npm resolves the
 * `@taucad/*` and `geospec` sibling specifiers against the local tarballs instead of the
 * registry — the registry copies are stale or absent.
 *
 * Usage: node scripts/src/check-pack-install.ts [package-dir…]
 *
 * A subset only works when it is closed under workspace dependencies; omitting a sibling makes npm
 * fall back to the registry and 404. Requesting `packages/runtime` also packs the packages its
 * README quick start imports and their publishable closure, computed from the graph.
 */

import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { bundledLibraries, publishable, publishableClosure, publishWaves, workspace } from '@taucad/nx';
import { chromium } from 'playwright';
import type { Page } from 'playwright';
import ts from 'typescript';

type Dependencies = Record<string, string>;

type ExportEntry = string | { types?: string; import?: string; default?: string };

export type Manifest = {
  readonly name: string;
  readonly version: string;
  readonly files?: readonly string[];
  readonly exports?: Record<string, ExportEntry>;
  readonly dependencies?: Dependencies;
  readonly optionalDependencies?: Dependencies;
  readonly peerDependencies?: Dependencies;
};

export type ImportFailure = {
  readonly specifier: string;
  readonly code?: string;
  readonly message: string;
};

const repositoryRoot = resolve(import.meta.dirname, '../..');

/**
 * Subpaths that cannot be imported in a bare Node process for a stated reason, keyed by a
 * substring the produced error must contain. A tolerated entry still has to *resolve* — the
 * module body runs, so a missing sibling file surfaces as ERR_MODULE_NOT_FOUND and stays red.
 * Anything not listed here, and any listed entry that fails differently, is red.
 */
const toleratedImportFailures: Record<string, string> = {};

/**
 * Payloads that only fail when instantiated, keyed by package name; the source runs inside the
 * installed application.
 */
const instantiationProbes: Record<string, string> = {};

const invariant: (condition: unknown, message: string) => asserts condition = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const run = (command: string, arguments_: string[], cwd: string): string => {
  const result = spawnSync(command, arguments_, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(
      `${command} ${arguments_.join(' ')} failed with status ${String(result.status)}\n${result.error?.message ?? ''}${result.stdout}${result.stderr}`,
    );
  }
  return result.stdout;
};

const exportTarget = (entry: ExportEntry): string | undefined =>
  typeof entry === 'string' ? entry : (entry.import ?? entry.default);

/**
 * Every subpath a consumer can `import()`, as bare specifiers. Type-only entries have no runtime target;
 * asset targets (CSS, WASM) are covered by {@link requiredArtifactPaths} instead.
 */
export const importableSpecifiers = (manifest: Manifest): string[] =>
  Object.entries(manifest.exports ?? {})
    .filter(
      ([key, entry]) => key !== './package.json' && !key.includes('*') && /\.[cm]?js$/u.test(exportTarget(entry) ?? ''),
    )
    .map(([key]) => (key === '.' ? manifest.name : `${manifest.name}${key.slice(1)}`));

/** Every file an installed tree must contain: `files` entries plus every export condition target. */
export const requiredArtifactPaths = (manifest: Manifest): string[] =>
  [
    ...(manifest.files ?? []),
    ...Object.values(manifest.exports ?? {}).flatMap((entry) =>
      typeof entry === 'string'
        ? [entry]
        : [entry.types, entry.import, entry.default].filter((path) => path !== undefined),
    ),
  ].filter((path) => !path.includes('*'));

/** Specifiers that must not survive into a published manifest, plus bundled private libraries. */
export const manifestViolations = (manifest: Manifest, bundledLibraryNames: ReadonlySet<string>): string[] => {
  const violations: string[] = [];
  for (const dependencies of [manifest.dependencies, manifest.optionalDependencies, manifest.peerDependencies]) {
    for (const [name, specifier] of Object.entries(dependencies ?? {})) {
      if (/^(?:file|workspace|catalog):/u.test(specifier)) {
        violations.push(`${manifest.name} declares ${name} as ${specifier}.`);
      }
      if (bundledLibraryNames.has(name)) {
        violations.push(`${manifest.name} leaks bundled private dependency ${name}.`);
      }
    }
  }
  return violations;
};

/**
 * A failure is tolerated only when it is a missing *external optional peer* of the package that
 * declared it, or an explicitly listed environment-dependent entry. A missing relative sibling
 * (`./geospec_opencascade_single.js`) reports a path rather than a package name and stays red.
 */
export const isToleratedImportFailure = (failure: ImportFailure, peerDependencies: readonly string[]): boolean => {
  const expected = toleratedImportFailures[failure.specifier];
  if (expected !== undefined) {
    return failure.message.includes(expected);
  }
  const missingPackage = /Cannot find package '(?<name>[^']+)'/u.exec(failure.message)?.groups?.['name'];
  return (
    failure.code === 'ERR_MODULE_NOT_FOUND' && missingPackage !== undefined && peerDependencies.includes(missingPackage)
  );
};

/**
 * Every `new URL('<relative>', import.meta.url)` literal in an emitted module.
 * That form is the published asset contract — it is how a bundler fingerprints a
 * WASM payload and how the installed `dist/wasm/…` resolves with no
 * `node_modules` lookup at consumer runtime — so each one must land inside the
 * installed package.
 */
export const assetUrlSpecifiers = (source: string): string[] =>
  [...source.matchAll(/new URL\(\s*(["'`])(?<specifier>[^"'`]+)\1\s*,\s*import\.meta\.url\s*\)/gu)].flatMap((match) => {
    const specifier = match.groups?.['specifier'];
    // A bare scheme is not a file the tarball has to carry.
    return specifier === undefined || /^[a-z][\d+.a-z-]*:/u.test(specifier) ? [] : [specifier];
  });

/** Exported package assets reached through Node's standard package resolver; interpolated specifiers are dynamic. */
export const packageAssetUrlSpecifiers = (source: string): string[] =>
  [...source.matchAll(/new URL\(\s*import\.meta\.resolve\(\s*(["'`])(?<specifier>[^"'`]+)\1\s*\)\s*\)/gu)].flatMap(
    (match) => {
      const specifier = match.groups?.['specifier'];
      return specifier === undefined || specifier.includes('${') ? [] : [specifier];
    },
  );

/** Every asset an installed package's modules reach for must exist inside that package. */
const assertAssetUrlsResolve = (installedRoot: string, name: string): number => {
  const modules = readdirSync(installedRoot, {
    recursive: true,
    encoding: 'utf8',
  }).filter((path) => path.endsWith('.mjs'));
  let checked = 0;
  for (const module_ of modules) {
    const modulePath = join(installedRoot, module_);
    const source = readFileSync(modulePath, 'utf8');
    for (const specifier of assetUrlSpecifiers(source)) {
      const asset = fileURLToPath(new URL(specifier, pathToFileURL(modulePath)));
      invariant(
        asset.startsWith(`${installedRoot}/`) && existsSync(asset),
        `${name} resolves ${specifier} from ${module_} to ${asset}, which the installed package does not contain.`,
      );
      checked += 1;
    }
    const require_ = createRequire(modulePath);
    for (const specifier of packageAssetUrlSpecifiers(source)) {
      let asset: string;
      try {
        asset = require_.resolve(specifier);
      } catch (error) {
        throw new Error(`${name} cannot resolve exported package asset ${specifier} from ${module_}.`, {
          cause: error,
        });
      }
      invariant(existsSync(asset), `${name} resolves exported package asset ${specifier} to missing file ${asset}.`);
      checked += 1;
    }
  }
  return checked;
};

/**
 * One zod in the installed tree. The schema types carry instance identity
 * (`instanceof ZodType` inside the runtime's `parse`) and type identity
 * (`$strip`/`$strict` brands), so a second copy breaks both — this is the
 * independent witness for the `tau-peer-dependency-shape` gate, read from a real
 * npm install rather than from the manifests.
 *
 * A dependent listed in `isolatedZodDependents` keeps its own nested copy: no Tau
 * schema crosses into it, so that copy cannot fork identity.
 */
const isolatedZodDependents: Record<string, string> = {
  '@anthropic-ai/sandbox-runtime':
    'zod ^3 validates its own CLI/config input only; @taucad/native-process-core passes it no schemas.',
};

const assertSingleZodInstance = (appRoot: string): void => {
  type Node = {
    readonly path?: string;
    readonly dependencies?: Record<string, Node>;
    readonly problems?: readonly string[];
  };
  // `--long` carries each node's install `path`: `--all` lists the same hoisted
  // copy once per dependent, so paths — not node counts — say how many copies
  // exist. npm may exit non-zero while still returning a useful structured
  // dependency tree; its reported problems must still fail admission.
  const listing = spawnSync('npm', ['ls', 'zod', '--json', '--all', '--long'], {
    cwd: appRoot,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  const installs = new Set<string>();
  const walk = (node: Node): void => {
    for (const [name, child] of Object.entries(node.dependencies ?? {})) {
      if (name === 'zod' && child.path !== undefined) {
        installs.add(child.path);
      }
      if (!(name in isolatedZodDependents)) {
        walk(child);
      }
    }
  };
  invariant(!listing.error, `Cannot inspect installed Zod: ${listing.error?.message}`);
  let tree: Node;
  try {
    tree = JSON.parse(listing.stdout) as Node;
  } catch {
    throw new Error(`Cannot parse npm ls Zod tree (status ${String(listing.status)}): ${listing.stderr}`);
  }
  invariant(
    tree.problems?.length === undefined || tree.problems.length === 0,
    `npm reports invalid Zod dependencies: ${tree.problems?.join('; ')}`,
  );
  invariant(listing.status === 0, `npm ls Zod failed (${String(listing.status)}): ${listing.stderr}`);
  walk(tree);
  invariant(installs.size === 1, `npm resolved ${String(installs.size)} zod copies: ${[...installs].join(', ')}`);
  console.log(`zod: one instance in the installed tree (${[...installs][0]!}).`);
};

/** The vendored graph must not reappear as consumer dependencies. */
const assertTscircuitInstallShape = (appRoot: string): void => {
  const listing = spawnSync('npm', ['ls', '--json', '--all'], {
    cwd: appRoot,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  type Node = { readonly dependencies?: Record<string, Node> };
  invariant(
    listing.status === 0,
    `Cannot verify tscircuit install tree: npm ls failed (${String(listing.status)}). ${listing.error?.message ?? listing.stderr}`,
  );
  const tree = JSON.parse(listing.stdout) as Node;
  invariant(tree.dependencies?.['@taucad/tscircuit'], 'npm ls omitted installed @taucad/tscircuit.');
  const forbidden = new Set([
    '@resvg/resvg-js',
    'occt-import-js',
    '@tscircuit/props',
    'circuit-json',
    'circuit-json-to-gltf',
    'graphics-debug',
    '@taucad/replicad',
    'replicad',
    'replicad-opencascadejs',
  ]);
  const found = new Set<string>();
  const walk = (node: Node): void => {
    for (const [name, child] of Object.entries(node.dependencies ?? {})) {
      if (forbidden.has(name)) {
        found.add(name);
      }
      walk(child);
    }
  };
  walk(tree);
  invariant(found.size === 0, `Vendored tscircuit packages leaked into the consumer install: ${[...found].join(', ')}`);
};

const quickStartSource = (readme: string): string => {
  const source = /## Quick start\s+[\s\S]*?```(?:typescript|javascript|ts|js)\n(?<source>[\s\S]*?)\n```/u.exec(readme)
    ?.groups?.['source'];
  invariant(source, 'Installed runtime README must contain a JavaScript-compatible fence under `## Quick start`.');
  return source;
};

const runRuntimeQuickStart = (appRoot: string, installedRoot: string): void => {
  writeFileSync(join(appRoot, 'smoke.mjs'), quickStartSource(readFileSync(join(installedRoot, 'README.md'), 'utf8')));
  const quickStartOutput = run(process.execPath, ['smoke.mjs'], appRoot).trim();
  // The quick start reports the exported artifact's size; a zero-byte or absent
  // GLB otherwise exits 0 and reports success, so assert the bytes it names.
  const exportedBytes = /(?<bytes>\d+) bytes/u.exec(quickStartOutput)?.groups?.['bytes'];
  invariant(
    exportedBytes !== undefined,
    `README quick start did not report an exported byte count: ${quickStartOutput}`,
  );
  invariant(Number(exportedBytes) > 0, `README quick start exported an empty artifact: ${quickStartOutput}`);
  console.log(`README quick start: ${quickStartOutput}`);
};

const runtimeParameterOperationSource = `
import { contentDigest } from '@taucad/cache-core';
import { parameterUnits } from '@taucad/middleware/parameter-units';
import { compileParameterManifest } from '@taucad/parameters';
import { loadParameterSnapshot, commitParameterChange } from '@taucad/parameters/authority';
import { createActor, createAsyncLogic, waitFor } from 'xstate';
import { parameterSetMachine, submitParameterRequest } from '@taucad/parameters/set-machine';
import { resolveRuntimePluginDefinition } from '@taucad/runtime/plugin';

const digest = contentDigest({ value: \`sha256:\${'1'.repeat(64)}\` });
const bareManifest = await compileParameterManifest({
  declaration: {
    schema: {
      $schema: 'https://json-structure.org/meta/extended/v0/#',
      $id: 'urn:taucad:packed-smoke:parameters',
      $uses: ['JSONSchemaUnits'],
      name: 'PackedSmokeParameters',
      type: 'object',
      properties: {
        width: { type: 'double', minimum: 0 },
        rotationAngle: { type: 'double', minimum: -180, maximum: 180 },
      },
    },
    defaults: { width: 10, rotationAngle: 45 },
  },
  scope: { kind: 'source', authority: 'memory', root: '/project', entry: 'main.ts' },
  source: { id: 'packed-smoke', version: '1', revision: digest, capability: 'json-structure' },
  dependency: digest,
  middleware: digest,
});
const middlewareDefinition = await resolveRuntimePluginDefinition('middleware', parameterUnits());
const inferred = await middlewareDefinition.wrapDescribe(
  { entryPath: 'main.ts', resolution: { mode: 'default', inferenceLanguage: 'en' } },
  async () => ({ success: true, data: { parameters: bareManifest }, issues: [] }),
  { options: { angleDefault: 'deg' } },
);
if (!inferred.success) throw new Error('Packed parameter middleware failed to resolve a manifest.');
const manifest = inferred.data.parameters;
if (manifest.bindings['/width']?.unit !== 'mm' || manifest.bindings['/rotationAngle']?.unit !== 'deg') {
  throw new Error(\`Packed parameter middleware returned the wrong units: \${JSON.stringify(manifest.bindings)}\`);
}
if (!Object.values(manifest.provenance).some(({ field, origin, evidence }) =>
  field === 'unit' && origin === 'inferred' && evidence?.includes('instance=/width;')
)) {
  throw new Error('Packed parameter middleware omitted inferred width provenance.');
}

let bytes = null;
const equalBytes = (left, right) =>
  left === null || right === null
    ? left === right
    : left.byteLength === right.byteLength && left.every((value, index) => value === right[index]);
const target = { authority: 'memory', root: '/project', entry: 'main.ts' };
const authority = {
  path: () => '.tau/parameters/main.ts.json',
  read: async () => bytes?.slice() ?? null,
  writeChecked: async (input) => {
    const expected = input.preconditions.find(({ path }) => path === input.path)?.expected ?? null;
    if (!equalBytes(bytes, expected)) {
      return { status: 'conflict', conflicts: [{ path: input.path, actual: bytes?.slice() ?? null }] };
    }
    const status = equalBytes(bytes, input.data) ? 'unchanged' : 'applied';
    bytes = input.data.slice();
    return { status, content: bytes.slice() };
  },
};
const actor = createActor(parameterSetMachine.provide({ actors: {
  loadParameterSet: createAsyncLogic({ run: async ({ signal }) => loadParameterSnapshot({ target, authority, manifest: async () => manifest, signal }) }),
  commitParameterSet: createAsyncLogic({ run: async ({ input: change, signal }) => commitParameterChange({ change, authority, signal }) }),
} }), { input: { target } });
actor.start();
const resolution = await waitFor(actor, snapshot => snapshot.matches({ open: 'ready' }));
if (bytes !== null) throw new Error('Reading defaults unexpectedly wrote a sidecar.');
const outcome = await submitParameterRequest(actor, {
  requestId: 'packed-smoke:replace',
  fingerprint: 'packed-smoke:replace:v1',
  expected: resolution.context.current.identity,
  pressure: 'final',
  operation: { kind: 'replace-group-values', group: 'default', values: { width: 25 } },
});
if (outcome.status !== 'committed' || outcome.write !== 'applied') {
  throw new Error(\`Packed runtime operation did not commit: \${JSON.stringify(outcome)}\`);
}
if (bytes === null || !new TextDecoder().decode(bytes).includes('"width": 25')) {
  throw new Error('Packed runtime operation did not persist the admitted native value.');
}
actor.send({ type: 'close' });
await waitFor(actor, snapshot => snapshot.status === 'done');
globalThis.__TAU_PARAMETER_PACK_SMOKE__ = 'committed width=25 and settled';
console.log(globalThis.__TAU_PARAMETER_PACK_SMOKE__);
`;

const runBrowserModule = async (
  modulePath: string,
  assertPage: (page: Page) => Promise<void>,
  assets: Readonly<Record<string, string>> = {},
): Promise<void> => {
  const scriptPath = `/${basename(modulePath)}`;
  const server = createServer((request, response) => {
    if (request.url === '/') {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end(`<div id="root"></div><script type="module" src="${scriptPath}"></script>`);
      return;
    }
    if (request.url === scriptPath) {
      response.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' });
      response.end(readFileSync(modulePath));
      return;
    }
    if (request.url !== undefined && Object.hasOwn(assets, request.url)) {
      response.writeHead(200, { 'content-type': 'application/wasm' });
      response.end(readFileSync(assets[request.url]!));
      return;
    }
    response.writeHead(404);
    response.end();
  });
  const port = await new Promise<number>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      invariant(address && typeof address === 'object', 'Browser smoke server did not bind a TCP port.');
      resolve(address.port);
    });
  });
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  const errors: string[] = [];
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') {
        errors.push(message.text());
      }
    });
    await page.goto(`http://127.0.0.1:${String(port)}/`);
    await assertPage(page);
    invariant(errors.length === 0, `Packed browser module failed:\n${errors.join('\n')}`);
  } finally {
    await browser?.close();
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }
};

/** Exercise one checked operation from the installed runtime in Node and Chromium. */
const runRuntimeParameterOperation = async (appRoot: string): Promise<void> => {
  const source = join(appRoot, 'parameter-operation.mjs');
  const browserBundle = join(appRoot, 'parameter-operation.browser.mjs');
  writeFileSync(source, runtimeParameterOperationSource);
  const nodeOutput = run(process.execPath, [source], appRoot).trim();
  const esbuildRoot = dirname(createRequire(import.meta.url).resolve('esbuild/package.json'));
  run(
    join(esbuildRoot, 'bin/esbuild'),
    [source, '--bundle', '--platform=browser', '--format=esm', `--outfile=${browserBundle}`],
    appRoot,
  );
  await runBrowserModule(browserBundle, async (page) => {
    await page.waitForFunction(
      (expected) =>
        (globalThis as typeof globalThis & { __TAU_PARAMETER_PACK_SMOKE__?: string }).__TAU_PARAMETER_PACK_SMOKE__ ===
        expected,
      nodeOutput,
    );
  });
  console.log(`Packed parameter operation (Node + Chromium): ${nodeOutput}`);
};

const installedReactRuntimeSource = `
import { createElement, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { useRuntime } from '@taucad/react';
import { defineKernel } from '@taucad/runtime';
import { fromMemoryFs } from '@taucad/runtime/filesystem';
import { inProcessTransport } from '@taucad/runtime/transport/in-process';
import { defineRuntime } from '@taucad/runtime/worker';

const kernel = defineKernel({
  id: 'packed-react',
  extensions: ['mock'],
  name: 'PackedReactKernel',
  version: '1.0.0',
  views: { model: { title: 'Model', mimeType: 'image/svg+xml' } },
  exports: {},
  async initialize() { return {}; },
  async resolve({ entryPath }) { return { resolved: [entryPath], unresolved: [] }; },
  async describe() {
    return {
      success: true,
      data: {
        parameters: {
          schema: {
            $schema: 'https://json-structure.org/meta/extended/v0/#',
            $id: 'urn:taucad:packed-react:parameters',
            $uses: ['JSONSchemaUnits'],
            name: 'PackedReactParameters',
            type: 'object',
          },
          defaults: {},
        },
      },
      issues: [],
    };
  },
  async evaluate(input, runtime) {
    const source = await runtime.filesystem.readFile(input.entryPath, 'utf8');
    if (source === 'bad') throw new Error('packed react failure');
    return { handle: { source }, views: ['model'] };
  },
  async render({ handle }) { return { content: \`<svg data-source="\${handle.source}"></svg>\` }; },
});
const runtime = defineRuntime({ kernels: [kernel()] });
const clientOptions = { transport: inProcessTransport({ runtime, fileSystem: fromMemoryFs() }) };

const App = () => {
  const [source, setSource] = useState('good-one');
  const result = useRuntime({ clientOptions, source: { files: { 'main.mock': source }, entry: 'main.mock' }, view: { id: 'model' } });
  const geometry = typeof result.artifact?.content === 'string' ? result.artifact.content : '';
  return createElement('main', {},
    createElement('output', {
      id: 'state',
      'data-status': result.status,
      'data-geometry-status': result.artifactStatus,
      'data-geometry': geometry,
      'data-error': result.error?.message ?? '',
    }),
    createElement('button', { id: 'fail', onClick: () => setSource('bad') }, 'fail'),
    createElement('button', { id: 'recover', onClick: () => setSource('good-two') }, 'recover'),
  );
};

createRoot(document.querySelector('#root')).render(createElement(App));
`;

/** Verify the installed public React hook retains last-good geometry through a real browser failure. */
const runInstalledReactRuntime = async (appRoot: string): Promise<void> => {
  const source = join(appRoot, 'react-runtime.mjs');
  const bundle = join(appRoot, 'react-runtime.browser.mjs');
  writeFileSync(source, installedReactRuntimeSource);
  const esbuildRoot = dirname(createRequire(import.meta.url).resolve('esbuild/package.json'));
  run(
    join(esbuildRoot, 'bin/esbuild'),
    [source, '--bundle', '--platform=browser', '--format=esm', '--external:node:*', `--outfile=${bundle}`],
    appRoot,
  );
  await runBrowserModule(bundle, async (page) => {
    const state = page.locator('#state');
    await page.waitForFunction(
      () => document.querySelector<HTMLElement>('#state')?.dataset['geometryStatus'] === 'current',
    );
    const firstGeometry = await state.getAttribute('data-geometry');
    invariant(
      firstGeometry?.includes('good-one'),
      `Installed React hook did not render initial geometry: ${firstGeometry ?? ''}`,
    );
    await page.locator('#fail').click();
    await page.waitForFunction(() => {
      const element = document.querySelector<HTMLElement>('#state');
      return element?.dataset['status'] === 'error' && element.dataset['geometryStatus'] === 'stale';
    });
    invariant(
      (await state.getAttribute('data-geometry')) === firstGeometry,
      'Installed React hook discarded last-good geometry.',
    );
    const renderError = await state.getAttribute('data-error');
    invariant(renderError?.includes('packed react failure'), 'Installed React hook omitted the render failure.');
    await page.locator('#recover').click();
    await page.waitForFunction(() => {
      const element = document.querySelector<HTMLElement>('#state');
      return (
        element?.dataset['status'] === 'ready' &&
        element.dataset['geometryStatus'] === 'current' &&
        element.dataset['geometry']?.includes('good-two')
      );
    });
  });
  console.log('Packed React/runtime Chromium lifecycle: current → stale → current.');
};

/** Compile and query real installed declarations, including a schema-rich public factory. */
export const installedTypeSource = `
import { createRuntimeClient, defineKernel, defineRuntime, fromMemoryFs, defineTranscoder } from '@taucad/runtime';
import { inProcessTransport } from '@taucad/runtime/transport/in-process';
import { esbuildBundler } from '@taucad/esbuild';
import { tscircuit } from '@taucad/tscircuit';
import { useRuntime } from '@taucad/react';
import type { RuntimeClient } from '@taucad/runtime';
import { z } from 'zod';

const strictKernel = defineKernel({
  id: 'type-probe', name: 'Type probe', version: '1', extensions: ['tsx'],
  evaluateOptionsSchema: z.object({ required: z.number(), defaulted: z.string().default('ready'), transformed: z.string().transform(Number) }),
  views: {
    required: { title: 'Required', mimeType: 'image/svg+xml', optionsSchema: z.object({ scale: z.number() }) },
    defaulted: { title: 'Defaulted', mimeType: 'image/svg+xml', optionsSchema: z.object({ pins: z.boolean().default(false) }) },
    union: { title: 'Union', mimeType: 'image/svg+xml', optionsSchema: z.union([z.object({ kind: z.literal('single'), camera: z.string() }), z.object({ kind: z.literal('batch'), views: z.array(z.string()).nonempty() })]) },
    loose: { title: 'Loose', mimeType: 'image/svg+xml', optionsSchema: z.looseObject({ label: z.string() }) },
    empty: { title: 'Empty', mimeType: 'image/svg+xml' },
  },
  exports: {
    data: { title: 'Data', mimeType: 'application/json', extension: 'json', optionsSchema: z.object({ count: z.number() }) },
  },
  async initialize() { return {}; },
  async resolve() { return { resolved: [], unresolved: [] }; },
  async describe() { return { success: false, issues: [] }; },
  async evaluate(input) {
    const required: number = input.options.required;
    const defaulted: string = input.options.defaulted;
    const transformed: number = input.options.transformed;
    // @ts-expect-error The kernel hook receives parsed transform output.
    const wrong: string = input.options.transformed;
    void [required, defaulted, transformed, wrong];
    return { handle: {} };
  },
  async render(input) {
    if (input.view === 'defaulted') {
      const pins: boolean = input.options.pins;
      void pins;
    }
    return { content: '<svg/>' };
  },
  async export() { return { files: [{ name: 'data.json', mimeType: 'application/json', bytes: new Uint8Array([1]) }] }; },
});
const route = defineTranscoder({
  id: 'type-route', name: 'Type route', version: '1',
  edges: [{ from: 'json', to: 'txt', fidelity: 'mesh', optionsSchema: z.object({ separator: z.string() }) }] as const,
  async initialize() { return {}; },
  async transcode(input) { return { success: true, data: input.files, issues: [] }; },
});
const runtime = defineRuntime({ kernels: [strictKernel()], plugins: [tscircuit()], bundlers: [esbuildBundler()], transcoders: [route()] });
const client = createRuntimeClient({ transport: inProcessTransport({ runtime, fileSystem: fromMemoryFs() }) });
const strictRuntime = defineRuntime({ kernels: [strictKernel()], transcoders: [route()] });
const strictTransport = inProcessTransport({ runtime: strictRuntime, fileSystem: fromMemoryFs() });
const strictClient = createRuntimeClient({ transport: strictTransport });
const doc = strictClient.open({ source: { files: { 'main.tsx': '', 'other.tsx': '' }, entry: 'main.tsx' }, evaluateOptions: { required: 1, transformed: '2' } });
const circuitDoc = client.open({ source: { path: 'main.tsx' } });
circuitDoc.view('board');
circuitDoc.view('pcb', { options: { pinNumbers: true } });
doc.view('required', { options: { scale: 2 } });
doc.view('defaulted');
doc.view('union', { options: { kind: 'single', camera: 'front' } });
doc.view('union', { options: { kind: 'batch', views: ['front'] } });
doc.view('loose', { options: { label: 'open', other: true } });
doc.view('empty');
void circuitDoc.export('board');
void doc.export('data', { options: { count: 1 } });
void strictClient.transcode({ from: 'json', to: 'txt', files: [], options: { separator: ',' } });
void doc.update({ evaluateOptions: { required: 2, transformed: '3' } });
defineRuntime({ kernels: [] });
defineRuntime({ kernels: [strictKernel()] });
declare const wideClient: RuntimeClient;
wideClient.open({ source: { path: 'wide.ts' } }).view('anything');
const hook = useRuntime({ clientOptions: { transport: strictTransport }, source: { path: 'main.tsx' }, evaluateOptions: { required: 1, transformed: '2' }, view: { id: 'required', options: { scale: 1 } } });
void hook.exportModel('data', { options: { count: 1 } });
// @ts-expect-error The packed React hook retains the selected view's required options.
useRuntime({ clientOptions: { transport: strictTransport }, source: { path: 'main.tsx' }, evaluateOptions: { required: 1, transformed: '2' }, view: { id: 'required' } });
// @ts-expect-error Required evaluation option cannot be omitted.
strictClient.open({ source: { path: 'main.tsx' } });
// @ts-expect-error Entry must be a member of the inline file map.
strictClient.open({ source: { files: { 'main.tsx': '' }, entry: 'missing.tsx' }, evaluateOptions: { required: 1, transformed: '2' } });
// @ts-expect-error A required view option cannot be omitted.
doc.view('required');
// @ts-expect-error Selected view option types remain narrow.
circuitDoc.view('pcb', { options: { pinNumbers: 'yes' } });
// @ts-expect-error Union branches cannot mix single camera and batch views.
doc.view('union', { options: { kind: 'single', views: ['front'] } });
// @ts-expect-error Required export options cannot be omitted.
void doc.export('data');
// @ts-expect-error Route options remain required.
void strictClient.transcode({ from: 'json', to: 'txt', files: [], options: {} });
// @ts-expect-error Unknown export IDs are rejected.
void doc.export('step');
`;

export const installedEditorSource = `${installedTypeSource}
circuitDoc.view('/*view*/');
void circuitDoc.export('/*export*/');
circuitDoc.view('pcb', { options: { /*selectedViewOptions*/ } });
strictClient.open({ source: { files: { 'main.tsx': '', 'other.tsx': '' }, entry: '/*entry*/' }, evaluateOptions: { required: 1, transformed: '2' } });
strictClient.open({ source: { path: 'main.tsx' }, evaluateOptions: { /*evaluateOptions*/ } });
void strictClient.transcode({ from: '/*routeFrom*/', to: 'txt', files: [], options: { separator: ',' } });
void strictClient.transcode({ from: 'json', to: '/*routeTo*/', files: [], options: { separator: ',' } });
`;

/** The compiler is the workspace tool, but all resolved public declarations come from the installed app. */
const checkInstalledTypes = (appRoot: string): void => {
  const consumer = join(appRoot, 'consumer.ts');
  const editor = join(appRoot, 'editor.ts');
  writeFileSync(consumer, installedTypeSource);
  writeFileSync(editor, installedEditorSource);
  const options: ts.CompilerOptions = {
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    strict: true,
    skipLibCheck: false,
    noEmit: true,
    types: [],
    lib: ['lib.esnext.d.ts', 'lib.dom.d.ts'],
  };
  for (const moduleResolution of [ts.ModuleResolutionKind.Bundler, ts.ModuleResolutionKind.NodeNext]) {
    const compilerOptions: ts.CompilerOptions = {
      ...options,
      module: moduleResolution === ts.ModuleResolutionKind.NodeNext ? ts.ModuleKind.NodeNext : ts.ModuleKind.ESNext,
      moduleResolution,
    };
    const program = ts.createProgram([consumer], compilerOptions);
    const diagnostics = ts.getPreEmitDiagnostics(program);
    invariant(
      diagnostics.length === 0,
      `Packed TypeScript consumer failed (${ts.ModuleResolutionKind[moduleResolution]}):\n${ts.formatDiagnosticsWithColorAndContext(
        diagnostics,
        {
          getCanonicalFileName: (file) => file,
          getCurrentDirectory: () => appRoot,
          getNewLine: () => '\n',
        },
      )}`,
    );
  }
  const host: ts.LanguageServiceHost = {
    getScriptFileNames: () => [editor],
    getScriptVersion: () => '1',
    getScriptSnapshot: (file) => {
      const source = file === editor ? installedEditorSource : ts.sys.readFile(file);
      return source === undefined ? undefined : ts.ScriptSnapshot.fromString(source);
    },
    getCurrentDirectory: () => appRoot,
    getCompilationSettings: () => options,
    getDefaultLibFileName: ts.getDefaultLibFilePath,
    fileExists: (file) => file === editor || ts.sys.fileExists(file),
    readFile: (file) => (file === editor ? installedEditorSource : ts.sys.readFile(file)),
    readDirectory: ts.sys.readDirectory,
    directoryExists: ts.sys.directoryExists,
    getDirectories: ts.sys.getDirectories,
  };
  const service = ts.createLanguageService(host);
  try {
    const expected: Record<string, readonly string[]> = {
      view: ['board', 'schematic', 'pcb'],
      export: ['board', 'bom', 'netlist', 'circuit'],
      selectedViewOptions: ['pinNumbers'],
      entry: ['main.tsx', 'other.tsx'],
      evaluateOptions: ['required', 'defaulted', 'transformed'],
      routeFrom: ['json'],
      routeTo: ['txt'],
    };
    for (const [marker, wanted] of Object.entries(expected)) {
      const position = installedEditorSource.indexOf(`/*${marker}*/`);
      invariant(position !== -1, `Missing installed editor marker ${marker}.`);
      const completion = service.getCompletionsAtPosition(editor, position, { includeCompletionsWithInsertText: true });
      const names = new Set(completion?.entries.map((entry) => entry.name) ?? []);
      invariant(
        wanted.every((name) => names.has(name)),
        `Packed ${marker} completions omitted ${wanted.filter((name) => !names.has(name)).join(', ')}; got ${[...names].join(', ')}.`,
      );
    }
  } finally {
    service.dispose();
  }
  console.log(`Packed TypeScript ${ts.version}: strict consumer and view/export/option/file-entry completions passed.`);
};

/** Exercise Zod 4.0.0 through public runtime admission, not a local schema-only parse. */
export const installedZodFloorSource = `
import { realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createRuntimeClient, defineKernel, defineRuntime, fromMemoryFs } from '@taucad/runtime';
import { inProcessTransport } from '@taucad/runtime/transport/in-process';
import { quantity } from '@taucad/runtime/configuration/zod';
import { z } from 'zod';
const requireFromRuntime = createRequire(import.meta.resolve('@taucad/runtime'));
const requireFromConsumer = createRequire(import.meta.url);
if (realpathSync(requireFromRuntime.resolve('zod/package.json')) !== realpathSync(requireFromConsumer.resolve('zod/package.json'))) throw new Error('Runtime and consumer resolved different Zod packages.');
const version = requireFromRuntime('zod/package.json').version;
if (version !== '4.0.0') throw new Error('Declared Zod floor was not installed: ' + version);
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const quantitySchema = quantity({ unit: 'm', space: 'linear' }).positive().max(10).describe('Length').default(0.2);
assert(quantitySchema.parse(undefined) === 0.2 && !quantitySchema.safeParse(0).success, 'Quantity default or refinement changed.');
const integerQuantity = quantity({ unit: '1', space: 'linear', symbol: 'px' }).int().min(16).max(4096).default(768);
assert(integerQuantity.parse(undefined) === 768 && !integerQuantity.safeParse(10).success && !integerQuantity.safeParse(17.5).success, 'Integer quantity default or bounds changed.');
for (const io of ['input', 'output']) {
  const schema = z.toJSONSchema(quantitySchema, { target: 'draft-7', io });
  assert(schema['x-tau-unit'] === 'm' && schema['x-tau-space'] === 'linear' && schema.description === 'Length', 'Quantity annotation lost in ' + io + ' JSON schema.');
  assert(schema.exclusiveMinimum === 0 && schema.maximum === 10 && schema.default === 0.2, 'Quantity constraints changed in ' + io + ' JSON schema.');
  const wrapped = z.toJSONSchema(z.object({ length: quantitySchema.optional(), values: quantity({ unit: 'm' }).nullable().array() }), { target: 'draft-7', io });
  assert(wrapped.properties.length['x-tau-unit'] === 'm', 'Optional quantity annotation lost in ' + io + ' JSON schema.');
  assert(wrapped.properties.values.items.anyOf.some((item) => item['x-tau-unit'] === 'm'), 'Array quantity annotation lost in ' + io + ' JSON schema.');
  const integerSchema = z.toJSONSchema(integerQuantity, { target: 'draft-7', io });
  assert(integerSchema.type === 'integer' && integerSchema.minimum === 16 && integerSchema.maximum === 4096 && integerSchema.default === 768, 'Integer quantity JSON schema bounds changed in ' + io + '.');
  assert(integerSchema['x-tau-unit'] === '1' && integerSchema['x-tau-space'] === 'linear' && integerSchema['x-tau-symbol'] === 'px', 'Integer quantity annotation lost in ' + io + '.');
}
const kernel = defineKernel({
  id: 'zod-floor', name: 'Zod floor', version: '1', extensions: ['ts'],
  evaluateOptionsSchema: z.object({ required: z.number(), size: z.string().default('2').transform(Number) }),
  views: {
    union: { title: 'Union', mimeType: 'image/svg+xml', optionsSchema: z.union([
      z.object({ mode: z.literal('single'), camera: z.string() }),
      z.object({ mode: z.literal('batch'), views: z.array(z.string()).nonempty() }),
    ]) },
    discriminated: { title: 'Discriminated', mimeType: 'image/svg+xml', optionsSchema: z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('a'), a: z.number() }),
      z.object({ kind: z.literal('b'), b: z.number() }),
    ]) },
    required: { title: 'Required', mimeType: 'image/svg+xml', optionsSchema: z.object({ scale: z.number() }) },
    defaulted: { title: 'Defaulted', mimeType: 'image/svg+xml', optionsSchema: z.object({ viewSize: z.string().default('3').transform(Number) }) },
    nested: { title: 'Nested', mimeType: 'image/svg+xml', optionsSchema: z.object({ rows: z.tuple([z.object({ known: z.string() })]) }) },
    loose: { title: 'Loose', mimeType: 'image/svg+xml', optionsSchema: z.looseObject({ known: z.string() }) },
    schemaless: { title: 'Schemaless', mimeType: 'image/svg+xml' },
  },
  exports: { data: { title: 'Data', mimeType: 'application/json', extension: 'json', optionsSchema: z.object({ count: z.number() }) } },
  async initialize() { return {}; },
  async resolve({ entryPath }) { return { resolved: [entryPath], unresolved: [] }; },
  async describe() { return { success: true, data: { parameters: { schema: { $schema: 'https://json-structure.org/meta/extended/v0/#', $id: 'urn:taucad:zod-floor', $uses: ['JSONSchemaUnits'], name: 'ZodFloorParameters', type: 'object' }, defaults: {} } }, issues: [] }; },
  async evaluate(input) {
    assert(input.options.required === 1 && input.options.size === 2, 'Evaluate required/default/transform admission changed.');
    return { handle: {}, views: ['defaulted', 'union', 'discriminated', 'required', 'nested', 'loose', 'schemaless'], exports: ['data'] };
  },
  async render(input) {
    if (input.view === 'defaulted') assert(input.options.viewSize === 3, 'View default/transform admission changed.');
    if (input.view === 'loose') assert(input.options.extra === true, 'Loose view option was stripped.');
    return { content: '<svg/>' };
  },
  async export(input) {
    assert(input.options.count === 4, 'Required export option changed.');
    return { files: [{ name: 'data.json', mimeType: 'application/json', bytes: new Uint8Array([1]) }] };
  },
});
const runtime = defineRuntime({ kernels: [kernel()] });
const client = createRuntimeClient({ transport: inProcessTransport({ runtime, fileSystem: fromMemoryFs() }) });
const doc = client.open({ source: { files: { 'main.ts': '' }, entry: 'main.ts' }, evaluateOptions: { required: 1 } });
const outcome = await doc.evaluation();
assert(!outcome.superseded && outcome.evaluation.success, 'Zod floor evaluation failed: ' + JSON.stringify(outcome));
const view = async (id, options, expected) => {
  const opened = doc.view(id, options === undefined ? undefined : { options });
  try {
    const result = await opened.rendering();
    assert(!result.superseded && result.rendering.success === expected, id + ' admission mismatch: ' + JSON.stringify(result));
  } finally { opened.close(); }
};
try {
  await view('union', { mode: 'single', camera: 'front' }, true);
  await view('union', { mode: 'batch', views: ['front'] }, true);
  await view('union', { mode: 'single', camera: 'front', views: ['stripped'] }, false);
  await view('discriminated', { kind: 'a', a: 1 }, true);
  await view('discriminated', { kind: 'b', b: 2 }, true);
  await view('discriminated', { kind: 'a', a: 1, b: 2 }, false);
  await view('required', { scale: 1 }, true);
  await view('required', {}, false);
  await view('defaulted', {}, true);
  await view('nested', { rows: [{ known: 'yes' }] }, true);
  await view('nested', { rows: [{ known: 'yes', extra: true }] }, false);
  await view('loose', { known: 'yes', extra: true }, true);
  await view('schemaless', undefined, true);
  await view('schemaless', { extra: true }, false);
  const exported = await doc.export('data', { options: { count: 4 } });
  assert(exported.success, 'Required export option was rejected: ' + JSON.stringify(exported.issues));
  const missing = await doc.export('data', { options: {} });
  assert(!missing.success, 'Missing required export option was admitted.');
} finally { doc.close(); await client.shutdown(); }
console.log('Installed Zod 4.0.0 union/discriminated/default/transform/required/strict/loose/schemaless and identity passed.');
`;

const installedTscircuitSource = `
import { createRuntimeClient, defineRuntime, fromMemoryFs } from '@taucad/runtime';
import { inProcessTransport } from '@taucad/runtime/transport/in-process';
import { esbuild } from '@taucad/esbuild';
import { tscircuit } from '@taucad/tscircuit';

const source = \`import React from 'react';
export default () => { const [width] = React.useState('20mm'); return <board width={width} height="20mm">
  <resistor name="R1" resistance="1k" footprint="0402" pcbX={-4} pcbY={0} />
  <led name="LED1" color="red" footprint="0603" pcbX={4} pcbY={0} />
  <trace from=".R1 > .pin2" to=".LED1 > .anode" />
</board>; };\`;
const runtime = defineRuntime({ plugins: [esbuild(), tscircuit()] });
const client = createRuntimeClient({ transport: inProcessTransport({ runtime, fileSystem: fromMemoryFs({}) }) });
const document = client.open({ source: { files: { 'main.tsx': source } }, watch: false });
const board = document.view('board');
const schematic = document.view('schematic');
try {
  const evaluated = await document.evaluation();
  if (evaluated.superseded || !evaluated.evaluation.success) throw new Error('tscircuit evaluation failed: ' + JSON.stringify(evaluated));
  const glb = await board.rendering();
  if (glb.superseded || !glb.rendering.success) throw new Error('tscircuit board failed: ' + JSON.stringify(glb));
  const bytes = glb.rendering.artifact.content;
  if (!(bytes instanceof Uint8Array) || new TextDecoder().decode(bytes.subarray(0, 4)) !== 'glTF') throw new Error('tscircuit board omitted GLB');
  const svg = await schematic.rendering();
  if (svg.superseded || !svg.rendering.success || !String(svg.rendering.artifact.content).includes('<svg')) throw new Error('tscircuit schematic omitted SVG');
  console.log('tscircuit GLB ' + bytes.byteLength + ' bytes; schematic SVG passed');
  if (typeof window !== 'undefined') globalThis.document.querySelector('#root').textContent = 'tscircuit GLB and SVG passed';
} finally {
  board.close(); schematic.close(); document.close(); await client.shutdown();
}
`;

/** Render the installed tscircuit package in Node and an alias-free browser bundle. */
const runInstalledTscircuit = async (appRoot: string): Promise<void> => {
  const source = join(appRoot, 'tscircuit-render.mjs');
  const bundle = join(appRoot, 'tscircuit-render.browser.mjs');
  checkInstalledTypes(appRoot);
  writeFileSync(join(appRoot, 'tscircuit-zod-floor.mjs'), installedZodFloorSource);
  run(process.execPath, ['tscircuit-zod-floor.mjs'], appRoot);
  writeFileSync(source, installedTscircuitSource);
  run(process.execPath, [source], appRoot);
  const esbuildRoot = dirname(createRequire(import.meta.url).resolve('esbuild/package.json'));
  run(
    join(esbuildRoot, 'bin/esbuild'),
    [source, '--bundle', '--platform=browser', '--format=esm', '--external:node:*', `--outfile=${bundle}`],
    appRoot,
  );
  const esbuildPackage = createRequire(pathToFileURL(join(appRoot, 'package.json'))).resolve(
    '@taucad/esbuild/package.json',
  );
  const wasmAsset = join(dirname(esbuildPackage), 'dist/vm/wasm/esbuild.wasm');
  invariant(existsSync(wasmAsset), `Installed esbuild WASM asset is missing: ${wasmAsset}`);
  await runBrowserModule(
    bundle,
    async (page) => {
      await page.waitForFunction(() => document.querySelector('#root')?.textContent === 'tscircuit GLB and SVG passed');
    },
    { '/wasm/esbuild.wasm': wasmAsset },
  );
  console.log('Packed tscircuit Node and Chromium GLB/SVG render passed.');
};

/** Installed-consumer probe: load modules and JSON; resolve and read exported documentation. */
export const probeSource = `
import { readFileSync } from 'node:fs';

const plan = JSON.parse(readFileSync(new URL('./probe-plan.json', import.meta.url), 'utf8'));
const failures = [];
const record = (specifier, error) => {
  failures.push({
    specifier,
    code: typeof error?.code === 'string' ? error.code : undefined,
    message: String(error?.message ?? error).split('\\n')[0],
  });
};

for (const specifier of plan.specifiers) {
  try {
    const url = new URL(import.meta.resolve(specifier));
    if (url.pathname.endsWith('.json')) {
      await import(specifier, { with: { type: 'json' } });
    } else if (url.pathname.endsWith('.md')) {
      readFileSync(url, 'utf8');
    } else {
      await import(specifier);
    }
  } catch (error) {
    record(specifier, error);
  }
}
for (const [name, file] of Object.entries(plan.instantiations)) {
  try {
    await import(new URL(file, import.meta.url).href);
  } catch (error) {
    record(\`\${name} (instantiate)\`, error);
  }
}
console.log(JSON.stringify(failures));
`;

const main = async (): Promise<void> => {
  const resolved = await workspace({ fresh: true });
  const projectByName = new Map(publishable(resolved).map((project) => [project.name, project]));
  // The release train, in dependency order, derived from the graph.
  const releaseTrainDirectories = publishWaves(resolved)
    .flat()
    .flatMap((name) => {
      const project = projectByName.get(name);
      return project ? [project.root] : [];
    });
  /** Private workspace libraries bundled into some artifact; none may ever be declared. */
  const bundledLibraryNames = new Set(
    publishable(resolved).flatMap((project) => bundledLibraries(resolved, project.name)),
  );

  const requested = process.argv.slice(2);
  // The runtime README quick start imports these plugins, so a subset that packs the runtime must
  // pack them and everything they publishably depend on, or the install 404s against the registry.
  const quickStartDirectories =
    requested.includes('packages/runtime') && !requested.includes('packages/plugins/tscircuit')
      ? publishableClosure(resolved, ['esbuild', 'replicad', 'middleware']).flatMap((name) => {
          const root = projectByName.get(name)?.root;
          return root === undefined || requested.includes(root) ? [] : [root];
        })
      : [];
  const tscircuitDirectories = requested.includes('packages/plugins/tscircuit')
    ? publishableClosure(resolved, ['tscircuit', 'esbuild']).flatMap((name) => {
        const root = projectByName.get(name)?.root;
        return root === undefined ? [] : [root];
      })
    : [];
  const packageDirectories =
    requested.length > 0
      ? [...new Set([...requested, ...quickStartDirectories, ...tscircuitDirectories])]
      : releaseTrainDirectories;
  const temporaryRoot = mkdtempSync(join(tmpdir(), 'tau-npm-local-'));
  const artifactRoot = join(temporaryRoot, 'artifact');
  const appRoot = join(temporaryRoot, 'app');
  let passed = false;

  mkdirSync(artifactRoot);
  mkdirSync(appRoot);
  try {
    console.log(`Node: ${process.version}`);
    console.log(`npm: ${run('npm', ['--version'], appRoot).trim()}`);
    console.log(`Platform: ${process.platform}/${process.arch}`);

    const tarballs: string[] = [];
    for (const packageDirectory of packageDirectories) {
      const packageRoot = resolve(repositoryRoot, packageDirectory);
      const destination = join(artifactRoot, basename(packageDirectory));
      mkdirSync(destination);
      // `prepack` hooks write to stdout, so the tarball is identified by the (empty, per-package)
      // destination directory rather than by parsing `pnpm pack --json`.
      run('pnpm', ['pack', '--pack-destination', destination], packageRoot);
      const produced = readdirSync(destination).filter((filename) => filename.endsWith('.tgz'));
      invariant(produced.length === 1, `pnpm pack must create exactly one TGZ for ${packageDirectory}.`);
      const tarball = resolve(destination, produced[0]!);
      const tarballBytes = statSync(tarball).size;
      invariant(tarballBytes > 0, `${packageDirectory} TGZ is empty.`);
      console.log(`TGZ ${basename(tarball)}: ${tarballBytes} bytes (${(tarballBytes / 1_048_576).toFixed(3)} MiB)`);
      tarballs.push(tarball);
    }

    // The app declares zod itself, the way a consumer satisfying the plugin peer
    // does; `assertSingleZodInstance` then proves npm did not fork it.
    writeFileSync(
      join(appRoot, 'package.json'),
      JSON.stringify(
        {
          private: true,
          type: 'module',
          dependencies: {
            react: '19.2.7',
            'react-dom': '19.2.7',
            zod: '4.0.0',
            ...(packageDirectories.includes('packages/plugins/middleware') ? { xstate: '6.0.0-alpha.59' } : {}),
          },
        },
        undefined,
        2,
      ),
    );
    // One install for every tarball: npm resolves the sibling `@taucad/*` and `geospec`
    // specifiers against the local files instead of their stale registry copies.
    run('npm', ['install', '--no-save', '--no-audit', '--no-fund', ...tarballs], appRoot);

    const dependencyTree = JSON.parse(run('npm', ['ls', '--json', '--depth=0'], appRoot)) as {
      dependencies?: Record<string, { version?: string; resolved?: string }>;
    };

    assertSingleZodInstance(appRoot);
    if (packageDirectories.includes('packages/plugins/tscircuit')) {
      assertTscircuitInstallShape(appRoot);
    }

    const specifiers: string[] = [];
    const instantiations: Record<string, string> = {};
    const failureContext = new Map<string, readonly string[]>();
    let assetUrls = 0;
    for (const packageDirectory of packageDirectories) {
      const sourceManifest = JSON.parse(
        readFileSync(resolve(repositoryRoot, packageDirectory, 'package.json'), 'utf8'),
      ) as Manifest;
      const installedRoot = join(appRoot, 'node_modules', sourceManifest.name);
      const installed = JSON.parse(readFileSync(join(installedRoot, 'package.json'), 'utf8')) as Manifest;

      const violations = manifestViolations(installed, bundledLibraryNames);
      invariant(violations.length === 0, violations.join('\n'));

      for (const required of requiredArtifactPaths(installed)) {
        invariant(
          existsSync(join(installedRoot, required)),
          `${installed.name} ships a manifest path that the installed tree lacks: ${required}`,
        );
      }

      assetUrls += assertAssetUrlsResolve(installedRoot, installed.name);

      const resolvedFrom = dependencyTree.dependencies?.[installed.name];
      invariant(
        resolvedFrom?.version === installed.version && resolvedFrom.resolved?.startsWith('file:') === true,
        `${installed.name} did not resolve from its local TGZ: ${JSON.stringify(resolvedFrom)}`,
      );

      const peerDependencies = Object.keys(installed.peerDependencies ?? {});
      for (const specifier of importableSpecifiers(installed)) {
        specifiers.push(specifier);
        failureContext.set(specifier, peerDependencies);
      }
      const probe = instantiationProbes[installed.name];
      if (probe !== undefined) {
        const file = `./instantiate-${installed.name.replaceAll(/\W/gu, '-')}.mjs`;
        writeFileSync(join(appRoot, file), probe);
        instantiations[installed.name] = file;
        failureContext.set(`${installed.name} (instantiate)`, peerDependencies);
      }
    }
    console.log(`npm install: ${packageDirectories.length} TGZ resolved from disk, no registry copies.`);
    console.log(`Asset URLs: ${String(assetUrls)} relative or exported package reference(s) resolve after install.`);

    writeFileSync(join(appRoot, 'probe-plan.json'), JSON.stringify({ specifiers, instantiations }));
    writeFileSync(join(appRoot, 'probe.mjs'), probeSource);
    const failures = JSON.parse(run(process.execPath, ['probe.mjs'], appRoot)) as ImportFailure[];
    const unexpected = failures.filter(
      (failure) => !isToleratedImportFailure(failure, failureContext.get(failure.specifier) ?? []),
    );
    for (const failure of failures.filter((failure) => !unexpected.includes(failure))) {
      console.log(`tolerated: ${failure.specifier} — ${failure.message}`);
    }
    invariant(
      unexpected.length === 0,
      `Published entry points failed to load:\n${unexpected
        .map((failure) => `- ${failure.specifier}: ${failure.code ?? 'no code'} — ${failure.message}`)
        .join('\n')}`,
    );
    console.log(
      `Imported ${String(specifiers.length)} published subpaths and instantiated ${String(Object.keys(instantiations).length)} native payload(s).`,
    );

    if (existsSync(join(appRoot, 'node_modules/@taucad/tscircuit'))) {
      await runInstalledTscircuit(appRoot);
    }
    const runtimeRoot = join(appRoot, 'node_modules/@taucad/runtime');
    if (existsSync(runtimeRoot)) {
      if (existsSync(join(appRoot, 'node_modules/@taucad/replicad'))) {
        runRuntimeQuickStart(appRoot, runtimeRoot);
      }
      if (existsSync(join(appRoot, 'node_modules/@taucad/middleware'))) {
        await runRuntimeParameterOperation(appRoot);
      }
      if (existsSync(join(appRoot, 'node_modules/@taucad/react'))) {
        await runInstalledReactRuntime(appRoot);
      }
    }
    console.log('npm-local TGZ install and published-surface smoke passed.');
    passed = true;
  } finally {
    if (passed) {
      rmSync(temporaryRoot, { recursive: true, force: true });
    } else {
      console.error(`Temporary app retained for diagnosis: ${appRoot}`);
    }
  }
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await main();
  } catch (error) {
    console.error('npm-local pack-install smoke failed:', error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
