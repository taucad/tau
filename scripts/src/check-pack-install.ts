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
 *
 * `@taucad/geospec-engine` is loaded through `dist/native/opencascade-module.mjs` rather than the
 * published `./native/opencascade/single` subpath, because the adapter is the module every shipped
 * consumer path reaches — it is what proves the subpath resolves and instantiates from inside the
 * installed tree. It is not itself an export target, so it is imported by file URL from
 * `node_modules`.
 */
const instantiationProbes: Record<string, string> = {
  '@taucad/geospec-engine': `
const moduleUrl = new URL('./node_modules/@taucad/geospec-engine/dist/native/opencascade-module.mjs', import.meta.url);
const { getOpenCascadeStepModule } = await import(moduleUrl.href);
const occt = await getOpenCascadeStepModule();
if (!(occt.HEAPF64?.length > 0)) {
  throw new Error('OCCT module instantiated without a heap.');
}
`,
};

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

/** Every subpath a consumer can `import()`, as bare specifiers. Type-only entries have no runtime target. */
export const importableSpecifiers = (manifest: Manifest): string[] =>
  Object.entries(manifest.exports ?? {})
    .filter(([key, entry]) => key !== './package.json' && !key.includes('*') && exportTarget(entry) !== undefined)
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

/** Exported package assets reached through Node's standard package resolver. */
export const packageAssetUrlSpecifiers = (source: string): string[] =>
  [...source.matchAll(/new URL\(\s*import\.meta\.resolve\(\s*(["'`])(?<specifier>[^"'`]+)\1\s*\)\s*\)/gu)].flatMap(
    (match) => (match.groups?.['specifier'] === undefined ? [] : [match.groups['specifier']]),
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
 */
const assertSingleZodInstance = (appRoot: string): void => {
  type Node = {
    readonly path?: string;
    readonly dependencies?: Record<string, Node>;
  };
  // `--long` carries each node's install `path`: `--all` lists the same hoisted
  // copy once per dependent, so paths — not node counts — say how many copies
  // exist. `npm ls` exits non-zero on any tree advisory, so the JSON is read
  // regardless of status.
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
      walk(child);
    }
  };
  walk(JSON.parse(listing.stdout || '{}') as Node);
  invariant(installs.size === 1, `npm resolved ${String(installs.size)} zod copies: ${[...installs].join(', ')}`);
  console.log(`zod: one instance in the installed tree (${[...installs][0]!}).`);
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
import { createActor, fromPromise, waitFor } from 'xstate';
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
const inferred = await middlewareDefinition.wrapGetParameters(
  { entryPath: 'main.ts', resolution: { mode: 'default', inferenceLanguage: 'en' } },
  async () => ({ success: true, data: bareManifest, issues: [] }),
  { options: { angleDefault: 'deg' } },
);
if (!inferred.success) throw new Error('Packed parameter middleware failed to resolve a manifest.');
const manifest = inferred.data;
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
  semanticPreconditions: async () => [],
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
  loadParameterSet: fromPromise(async ({ signal }) => loadParameterSnapshot({ target, authority, manifest: async () => manifest, signal })),
  commitParameterSet: fromPromise(async ({ input: change, signal }) => commitParameterChange({ change, authority, signal })),
} }), { input: { target } });
actor.start();
const resolution = await waitFor(actor, snapshot => snapshot.matches({ open: 'ready' }));
if (bytes !== null) throw new Error('Reading defaults unexpectedly wrote a sidecar.');
const outcome = await submitParameterRequest(actor, {
  requestId: 'packed-smoke:replace',
  draftGeneration: 1,
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

const runBrowserModule = async (modulePath: string, assertPage: (page: Page) => Promise<void>): Promise<void> => {
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
  exportFormats: {},
  async initialize() { return {}; },
  async getDependencies({ entryPath }) { return { resolved: [entryPath], unresolved: [] }; },
  async getParameters() {
    return {
      success: true,
      data: {
        schema: {
          $schema: 'https://json-structure.org/meta/extended/v0/#',
          $id: 'urn:taucad:packed-react:parameters',
          $uses: ['JSONSchemaUnits'],
          name: 'PackedReactParameters',
          type: 'object',
        },
        defaults: {},
      },
      issues: [],
    };
  },
  async createGeometry(input, runtime) {
    const source = await runtime.filesystem.readFile(input.entryPath, 'utf8');
    if (source === 'bad') throw new Error('packed react failure');
    return {
      geometry: { format: 'svg', content: \`<svg data-source="\${source}"></svg>\` },
      nativeHandle: {},
    };
  },
  async exportGeometry() { return { success: true, data: [], issues: [] }; },
});
const runtime = defineRuntime({ kernels: [kernel()] });
const clientOptions = { transport: inProcessTransport({ runtime, fileSystem: fromMemoryFs() }) };

const App = () => {
  const [source, setSource] = useState('good-one');
  const result = useRuntime({ clientOptions, source: { files: { 'main.mock': source } } });
  const geometry = result.geometry?.format === 'svg' ? result.geometry.content : '';
  return createElement('main', {},
    createElement('output', {
      id: 'state',
      'data-status': result.status,
      'data-geometry-status': result.geometryStatus,
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
  const quickStartDirectories = requested.includes('packages/runtime')
    ? publishableClosure(resolved, ['esbuild', 'replicad']).flatMap((name) => {
        const root = projectByName.get(name)?.root;
        return root === undefined || requested.includes(root) ? [] : [root];
      })
    : [];
  const packageDirectories = requested.length > 0 ? [...requested, ...quickStartDirectories] : releaseTrainDirectories;
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
          dependencies: { react: '19.2.7', 'react-dom': '19.2.7', zod: '^4.0.0' },
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

    const runtimeRoot = join(appRoot, 'node_modules/@taucad/runtime');
    if (existsSync(runtimeRoot)) {
      runRuntimeQuickStart(appRoot, runtimeRoot);
      await runRuntimeParameterOperation(appRoot);
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
