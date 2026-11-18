#!/usr/bin/env node
/**
 * Guard G3 of the progressive loading architecture (Brain `research/progressive-loading-architecture.md`,
 * Enforcement), and its shell invariant 7, "no early kernel", on the web client build.
 *
 * For each route class of `critical-path.mts` it measures the interactive tier on the real build output: the
 * chunks the class's roots load statically (`.vite/manifest.json`, the same walk as `staticChunkFiles`) and their
 * stylesheets. It reports brotli bytes, request count and the largest chunk against `critical-budget.json`, and
 * names every heavy module family (`critical-path.mts`) found among the closure's module ids, which come from the
 * module-id manifest the build writes (`@taucad/vite/module-id-manifest`). So it sees what the source guards
 * cannot: a package reached through another package, and a module the bundler merged into a shared chunk.
 *
 * The budget is a ratchet, per build variant (`cloud` for deploys, `self-host` for the CI build):
 * - growth past the tolerance fails;
 * - landing under the budget by more than the ratchet margin fails too, until the budget is lowered, so a gain is
 *   kept (`--write` rewrites the variant's numbers from this build);
 * - a heavy family found and not listed under the class's `knownHeavy` fails, and so does a listed one no longer
 *   found, so the list only shrinks.
 * Raising a budget is a one-line change to the budget file that names its reason in the commit.
 *
 * "No early kernel": no module the documents may preload (the React Router manifest's entry and route modules,
 * their imports and styles, and every link in a prerendered HTML file) is a wasm file, a worker or verbatim
 * runtime asset, or a chunk holding a kernel module.
 *
 * The warm manifest (PL8, `app/lib/warm-manifest.ts`): every file it lists for a class is in that class's measured
 * closure, and none is a wasm file, a worker or runtime asset, or a chunk holding any heavy module family, so warming
 * the next step never fetches a viewer, three.js, kernel, wasm or worker asset. It also reports what each warm-up
 * prefetches once idle, after the warming page's own interactive tier.
 *
 * The service worker's precache list (PL7, shell invariant 8, `scripts/build-service-worker.ts`): it equals the list
 * generated from the registry (each answered class's document, its references and its interactive tier), so nothing
 * was added by hand; it holds each guarded class's measured closure; no entry is a wasm file, a worker or runtime
 * asset, or a chunk holding any heavy module family; hashed `/assets/*` entries carry no revision, every other entry
 * carries one, and none carries an `integrity`. It also reports the precache's size.
 *
 * "No split route module" (React Router 8 migration B8, RR6): no route's client loader, action, middleware or hydrate
 * fallback is split into a chunk of its own ({@link findSplitRouteModules}).
 *
 * Usage (after `nx build ui`):
 *   node apps/ui/scripts/check-critical-budget.mts           # check
 *   node apps/ui/scripts/check-critical-budget.mts --write   # rebaseline this build's variant
 *
 * Exit codes:
 *   0  Every class within budget, no early kernel and no split route module
 *   1  A budget, heavy-family, early-kernel, warm-manifest, precache or split-route-module violation, or a missing
 *      build output
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { brotliCompressSync, constants } from 'node:zlib';
import type { ModuleIdManifest, ModuleIdManifestChunk } from '@taucad/vite/module-id-manifest';
import { criticalRouteClasses, heavyFamilyOfModuleId } from '#scripts/critical-path.mts';
import { rootKeys, staticClosure } from '#scripts/interactive-closure.ts';
import type { ViteManifest } from '#scripts/interactive-closure.ts';
/* oxlint-disable no-restricted-imports -- Native Node scripts read the registry without bundler aliases. */
import { routeClasses, workerRouteClasses } from '../app/lib/route-classes.ts';
import { collectPrecacheFiles, isHashedUrl, precacheListFile } from './precache-list.ts';
import type { ClientBuildView, PrecacheDocument } from './precache-list.ts';
import { isWarmableHref, parseWarmManifest, warmHrefs, warmManifestFile } from '../app/lib/warm-manifest.ts';
import type { WarmManifest } from '../app/lib/warm-manifest.ts';
/* oxlint-enable no-restricted-imports */

/** The ratcheted numbers of one route class. */
export type ClassBudget = {
  brotliBytes: number;
  requests: number;
  largestChunkBrotliBytes: number;
  /** Heavy families the class's interactive tier holds today, each with the work package that removes it. */
  knownHeavy: Record<string, string>;
};

export type BuildVariant = 'cloud' | 'self-host';

export type BudgetFile = {
  $comment?: string;
  /** Growth allowed before a check fails: a fraction of the budget for bytes, a count for requests. */
  tolerance: { bytes: number; requests: number };
  /** How far under budget a class may land before the budget must be lowered. */
  ratchetMargin: { bytes: number; requests: number };
  variants: Partial<Record<BuildVariant, Record<string, ClassBudget>>>;
};

/** What one route class's interactive tier measures. */
export type ClassMeasure = {
  brotliBytes: number;
  requests: number;
  largestChunkBrotliBytes: number;
  largestChunk: string;
  files: string[];
  /** Each heavy family found, with the closure's chunks holding it. */
  heavy: Map<string, string[]>;
  /** Rendered bytes per module id in the closure, before minification. */
  moduleBytes: Map<string, number>;
};

const scriptDirectory = fileURLToPath(new URL('.', import.meta.url));
const appDirectory = join(scriptDirectory, '..');
const clientDirectory = join(appDirectory, 'build', 'client');
const moduleIdsPath = join(appDirectory, 'build', 'client-module-ids.json');
const budgetPath = join(appDirectory, 'critical-budget.json');

/**
 * Measure one route class.
 *
 * @param input - The manifest, the module-id manifest's chunks by file, the roots, and a brotli size reader.
 * @returns The measure.
 */
export const measureClass = (input: {
  manifest: ViteManifest;
  chunksByFile: ReadonlyMap<string, ModuleIdManifestChunk>;
  roots: readonly string[];
  brotliSize: (file: string) => number;
}): ClassMeasure => {
  const { js, css } = staticClosure(input.manifest, rootKeys(input.manifest, input.roots));
  const files = [...js, ...css];
  let brotliBytes = 0;
  let largestChunkBrotliBytes = 0;
  let largestChunk = '';
  for (const file of files) {
    const size = input.brotliSize(file);
    brotliBytes += size;
    if (file.endsWith('.js') && size > largestChunkBrotliBytes) {
      largestChunkBrotliBytes = size;
      largestChunk = file;
    }
  }
  const heavy = new Map<string, string[]>();
  const moduleBytes = new Map<string, number>();
  for (const file of js) {
    const chunk = input.chunksByFile.get(file);
    if (chunk === undefined) {
      throw new Error(`check-critical-budget: the module-id manifest has no chunk ${file}`);
    }
    for (const module of chunk.modules) {
      moduleBytes.set(module.id, (moduleBytes.get(module.id) ?? 0) + module.renderedLength);
      const family = heavyFamilyOfModuleId(module.id)?.name;
      if (family !== undefined) {
        const holders = heavy.get(family) ?? [];
        if (!holders.includes(file)) {
          holders.push(file);
        }
        heavy.set(family, holders);
      }
    }
  }
  return { brotliBytes, requests: files.length, largestChunkBrotliBytes, largestChunk, files, heavy, moduleBytes };
};

/**
 * Compare a measure with its budget.
 *
 * @param input - The class's name in messages, what the build measured, the checked-in budget (undefined when the
 *   class has none yet) and the budget file's tolerance and ratchet margin.
 * @returns One message per violation; empty when the class passes.
 */
export const compareWithBudget = (input: {
  label: string;
  measure: ClassMeasure;
  budget: ClassBudget | undefined;
  limits: Pick<BudgetFile, 'tolerance' | 'ratchetMargin'>;
}): string[] => {
  const { label, measure, budget, limits } = input;
  if (budget === undefined) {
    return [`${label}: no budget for this class; run with --write to record one`];
  }
  const problems: string[] = [];
  const bytes = (name: string, measured: number, allowed: number): void => {
    if (measured > Math.round(allowed * (1 + limits.tolerance.bytes))) {
      problems.push(
        `${label}: ${name} ${measured} B exceeds the budget ${allowed} B by more than ${limits.tolerance.bytes * 100}%`,
      );
    } else if (measured < Math.round(allowed * (1 - limits.ratchetMargin.bytes))) {
      problems.push(
        `${label}: ${name} ${measured} B is more than ${limits.ratchetMargin.bytes * 100}% under the budget ${allowed} B; lower the budget (--write) to keep the gain`,
      );
    }
  };
  bytes('brotli bytes', measure.brotliBytes, budget.brotliBytes);
  bytes('largest chunk', measure.largestChunkBrotliBytes, budget.largestChunkBrotliBytes);
  if (measure.requests > budget.requests + limits.tolerance.requests) {
    problems.push(
      `${label}: ${measure.requests} requests exceed the budget ${budget.requests} by more than ${limits.tolerance.requests}`,
    );
  } else if (measure.requests < budget.requests - limits.ratchetMargin.requests) {
    problems.push(
      `${label}: ${measure.requests} requests are more than ${limits.ratchetMargin.requests} under the budget ${budget.requests}; lower the budget (--write)`,
    );
  }
  for (const [family, files] of measure.heavy) {
    if (!(family in budget.knownHeavy)) {
      problems.push(
        `${label}: the interactive tier holds the heavy family '${family}' (${files.join(', ')}); load it behind import()`,
      );
    }
  }
  for (const family of Object.keys(budget.knownHeavy)) {
    if (!measure.heavy.has(family)) {
      problems.push(`${label}: '${family}' is no longer in the interactive tier; remove it from knownHeavy`);
    }
  }
  return problems;
};

/** The modules route module splitting (`splitRouteModules`, on by default in React Router 8) can move out of a route's own chunk. */
const splitModuleFields = [
  'clientLoaderModule',
  'clientActionModule',
  'clientMiddlewareModule',
  'hydrateFallbackModule',
] as const;

/** The React Router browser manifest's preload-relevant fields, and the split modules of a route. */
export type RouterManifest = {
  entry: { module: string; imports: readonly string[] };
  routes: Record<
    string,
    { module: string; imports?: readonly string[]; css?: readonly string[] } & Partial<
      Record<(typeof splitModuleFields)[number], string>
    >
  >;
};

/**
 * The route modules split out of their route's chunk (React Router 8 migration B8, RR6). None exists today. A split
 * chunk loads outside the patched `loadRouteModule`, so a deploy that stops serving it gets no stale-build reload, and
 * this check's preload walk does not see it; when one first appears, that gap is reviewed and this list updated.
 *
 * @param router - The React Router browser manifest.
 * @returns One line per split module.
 */
export const findSplitRouteModules = (router: RouterManifest): string[] =>
  Object.entries(router.routes).flatMap(([id, route]) =>
    splitModuleFields.flatMap((field) => {
      const file = route[field];
      return file === undefined ? [] : [`${id} splits ${field} ${file}`];
    }),
  );

const linkPattern = /<link\b[^>]*\brel=["']?(?:modulepreload|preload|prefetch)["']?[^>]*>/giu;
const hrefPattern = /\bhref=["']?([^"'\s>]+)/iu;

/**
 * The hrefs a prerendered document preloads or prefetches.
 *
 * @param html - The document.
 * @returns The hrefs, in document order.
 */
export const preloadHrefs = (html: string): string[] =>
  [...html.matchAll(linkPattern)].flatMap((match) => {
    const href = hrefPattern.exec(match[0])?.[1];
    return href === undefined ? [] : [href];
  });

/**
 * Shell invariant 7: the preloadable files that are kernel, wasm or worker assets.
 *
 * @param input - Every file a document may preload, keyed by where it came from, and the module-id manifest.
 * @returns One message per offender; empty when the invariant holds.
 */
export const findEarlyKernelPreloads = (input: {
  preloads: ReadonlyMap<string, readonly string[]>;
  moduleIds: ModuleIdManifest;
}): string[] => {
  const chunks = new Map(input.moduleIds.chunks.map((chunk) => [chunk.fileName, chunk]));
  const scriptAssets = new Set(
    input.moduleIds.assets.filter((asset) => /\.[cm]?js$/u.test(asset.fileName)).map((asset) => asset.fileName),
  );
  const problems: string[] = [];
  for (const [origin, hrefs] of input.preloads) {
    for (const href of hrefs) {
      const file = href.replace(/^\//u, '').split(/[?#]/u, 1)[0] ?? '';
      if (file.endsWith('.wasm')) {
        problems.push(`${origin} preloads the wasm file ${href}`);
      } else if (scriptAssets.has(file)) {
        problems.push(`${origin} preloads ${href}, a worker or runtime asset`);
      } else {
        const kernel = chunks.get(file)?.modules.find((module) => heavyFamilyOfModuleId(module.id)?.kernel === true);
        if (kernel !== undefined) {
          problems.push(`${origin} preloads ${href}, a chunk holding the kernel module ${kernel.id}`);
        }
      }
    }
  }
  return problems;
};

/**
 * The warm manifest's violations: a class it lists that the guards do not measure or the reverse, and a listed file
 * outside its class's measured closure, not a warmable URL, a wasm file, a worker or runtime asset, or a chunk holding
 * any heavy module family.
 *
 * @param input - The parsed manifest (`undefined` when it is missing or malformed), each class's measured closure
 *   (build-relative files) and the module-id manifest.
 * @returns One message per violation; empty when the manifest holds.
 */
export const findWarmManifestProblems = (input: {
  warm: WarmManifest | undefined;
  closures: ReadonlyMap<string, readonly string[]>;
  manifest: ViteManifest;
  moduleIds: ModuleIdManifest;
}): string[] => {
  if (input.warm === undefined) {
    return [`warm manifest: build/client/${warmManifestFile} is missing or not version 1`];
  }
  const chunks = new Map(input.moduleIds.chunks.map((chunk) => [chunk.fileName, chunk]));
  const assets = new Set(input.moduleIds.assets.map((asset) => asset.fileName));
  const problems: string[] = [];
  for (const id of input.closures.keys()) {
    if (!(id in input.warm.classes)) {
      problems.push(`warm manifest: no list for the guarded class '${id}'`);
    }
  }
  for (const [id, hrefs] of Object.entries(input.warm.classes)) {
    const closure = input.closures.get(id);
    if (closure === undefined) {
      problems.push(`warm manifest: '${id}' is not a class the critical-path guards measure`);
      continue;
    }
    const inClosure = new Set(closure);
    for (const href of hrefs) {
      const file = href.replace(/^\//u, '');
      // A stylesheet is heavy with the chunks that import it: the viewer's styles go where the viewer goes.
      const owners = file.endsWith('.css')
        ? Object.values(input.manifest).flatMap((chunk) => (chunk.css?.includes(file) === true ? [chunk.file] : []))
        : [file];
      const heavy = owners
        .flatMap((owner) => chunks.get(owner)?.modules ?? [])
        .find((module) => heavyFamilyOfModuleId(module.id) !== undefined);
      if (!isWarmableHref(href) || file.endsWith('.wasm')) {
        problems.push(`warm manifest: ${id} lists ${href}, which is not a script or stylesheet of /assets`);
      } else if (!inClosure.has(file)) {
        problems.push(`warm manifest: ${id} lists ${href}, which is outside its interactive tier`);
      } else if (assets.has(file) && !file.endsWith('.css')) {
        problems.push(`warm manifest: ${id} lists ${href}, a worker or runtime asset`);
      } else if (heavy !== undefined) {
        problems.push(
          `warm manifest: ${id} lists ${href}, which belongs with the ${heavyFamilyOfModuleId(heavy.id)?.name ?? ''} module ${heavy.id}`,
        );
      }
    }
  }
  return problems;
};

/** One entry of the precache list as the build wrote it; anything beyond `url` and `revision` is a violation. */
export type WrittenPrecacheEntry = Readonly<{
  url: string;
  // oxlint-disable-next-line typescript/no-restricted-types -- Workbox's precache wire value for "no revision".
  revision?: string | null;
  integrity?: string;
}>;

/** The violations of one precache entry: a deferred-tier, wasm, worker or runtime file, or a wrong revision. */
const precacheEntryProblems = (
  entry: WrittenPrecacheEntry,
  input: Readonly<{
    manifest: ViteManifest;
    chunks: ReadonlyMap<string, ModuleIdManifestChunk>;
    assets: ReadonlySet<string>;
  }>,
): string[] => {
  const problems: string[] = [];
  const file = entry.url.replace(/^\//u, '');
  const owners = file.endsWith('.css')
    ? Object.values(input.manifest).flatMap((chunk) => (chunk.css?.includes(file) === true ? [chunk.file] : []))
    : [file];
  const heavy = owners
    .flatMap((owner) => input.chunks.get(owner)?.modules ?? [])
    .find((module) => heavyFamilyOfModuleId(module.id) !== undefined);
  if (file.endsWith('.wasm') || (input.assets.has(file) && /\.[cm]?js$/u.test(file))) {
    problems.push(`precache: ${entry.url} is a wasm, worker or runtime asset`);
  } else if (heavy !== undefined) {
    problems.push(
      `precache: ${entry.url} belongs with the ${heavyFamilyOfModuleId(heavy.id)?.name ?? ''} module ${heavy.id}`,
    );
  }
  const hashed = isHashedUrl(entry.url);
  if (hashed && entry.revision !== null) {
    problems.push(`precache: ${entry.url} is hashed by name but carries a revision`);
  } else if (!hashed && typeof entry.revision !== 'string') {
    problems.push(`precache: ${entry.url} carries no content revision`);
  }
  if (Object.keys(entry).some((key) => key !== 'url' && key !== 'revision')) {
    problems.push(`precache: ${entry.url} carries ${Object.keys(entry).join(', ')}; only url and revision are allowed`);
  }
  return problems;
};

/**
 * The service worker precache list's violations (shell invariant 8).
 *
 * @param input - The written list (`undefined` when missing), the list the registry generates for this build, each
 *   guarded class's measured closure, the classes the worker answers, and the build manifests.
 * @returns One message per violation; empty when the list holds.
 */
export const findPrecacheProblems = (input: {
  entries: readonly WrittenPrecacheEntry[] | undefined;
  expected: readonly string[];
  closures: ReadonlyMap<string, readonly string[]>;
  workerClassIds: readonly string[];
  manifest: ViteManifest;
  moduleIds: ModuleIdManifest;
}): string[] => {
  if (input.entries === undefined) {
    return [`precache: build/${precacheListFile} is missing`];
  }
  const listed = new Set(input.entries.map((entry) => entry.url));
  const expected = new Set(input.expected);
  const problems = [
    ...[...expected]
      .filter((url) => !listed.has(url))
      .map((url) => `precache: ${url} is generated from the registry but not in the worker's list`),
    ...[...listed]
      .filter((url) => !expected.has(url))
      .map((url) => `precache: ${url} is in the worker's list but not generated from the registry`),
  ];
  for (const [id, closure] of input.closures) {
    if (input.workerClassIds.includes(id)) {
      problems.push(
        ...closure
          .filter((file) => !listed.has(`/${file}`))
          .map((file) => `precache: ${id}'s interactive tier holds /${file}, which the worker does not precache`),
      );
    }
  }
  const context = {
    manifest: input.manifest,
    chunks: new Map(input.moduleIds.chunks.map((chunk) => [chunk.fileName, chunk])),
    assets: new Set(input.moduleIds.assets.map((asset) => asset.fileName)),
  };
  return [...problems, ...input.entries.flatMap((entry) => precacheEntryProblems(entry, context))];
};

/**
 * Which variant a build is: each `#cloud/…` boundary module resolves to its `.cloud` or its `.self-host` file.
 *
 * @param moduleIds - The module-id manifest.
 * @returns The variant.
 * @throws When the build holds neither, or both.
 */
export const buildVariantOf = (moduleIds: ModuleIdManifest): BuildVariant => {
  const ids = moduleIds.chunks.flatMap((chunk) => chunk.modules.map((module) => module.id));
  const cloud = ids.some((id) => /^apps\/ui\/app\/cloud\/[^/]+\.cloud\.tsx?$/u.test(id));
  const selfHost = ids.some((id) => /^apps\/ui\/app\/cloud\/[^/]+\.self-host\.tsx?$/u.test(id));
  if (cloud === selfHost) {
    throw new Error('check-critical-budget: cannot tell whether this is a cloud or a self-host build');
  }
  return cloud ? 'cloud' : 'self-host';
};

function readJson<T>(path: string): T {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T;
  } catch (error) {
    throw new Error(`check-critical-budget: cannot read ${path}; run nx build ui first`, { cause: error });
  }
}

const readRouterManifest = (): RouterManifest => {
  const assets = join(clientDirectory, 'assets');
  const candidates = readdirSync(assets).filter((name) => /^manifest-[\w-]+\.js$/u.test(name));
  for (const name of candidates) {
    const text = readFileSync(join(assets, name), 'utf8');
    const prefix = 'window.__reactRouterManifest=';
    if (text.startsWith(prefix)) {
      return JSON.parse(text.slice(prefix.length).replace(/;\s*$/u, '')) as RouterManifest;
    }
  }
  throw new Error('check-critical-budget: no React Router manifest under build/client/assets');
};

const htmlFiles = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.html'))
    .map((entry) => join(entry.parentPath, entry.name));

/** Every file a document may preload, by origin. */
const documentPreloads = (): Map<string, string[]> => {
  const router = readRouterManifest();
  const preloads = new Map<string, string[]>([['entry', [router.entry.module, ...router.entry.imports]]]);
  for (const [id, route] of Object.entries(router.routes)) {
    preloads.set(`route ${id}`, [route.module, ...(route.imports ?? []), ...(route.css ?? [])]);
  }
  for (const file of htmlFiles(clientDirectory)) {
    preloads.set(file.slice(clientDirectory.length + 1), preloadHrefs(readFileSync(file, 'utf8')));
  }
  return preloads;
};

const formatBytes = (bytes: number): string => `${(bytes / 1024).toFixed(1)} KiB`;

/** The package a module id belongs to, for the byte attribution report. */
const packageOf = (id: string): string => {
  const nodeModules = id.lastIndexOf('node_modules/');
  if (nodeModules !== -1) {
    const [scope = '', name = ''] = id.slice(nodeModules + 'node_modules/'.length).split('/');
    return scope.startsWith('@') ? `${scope}/${name}` : scope;
  }
  const [top = '', second = '', third = ''] = id.split('/');
  return top === 'packages' && second === 'plugins' ? `${top}/${second}/${third}` : `${top}/${second}`;
};

const topEntries = (bytes: ReadonlyMap<string, number>, count: number): string[] =>
  [...bytes]
    .toSorted((left, right) => right[1] - left[1])
    .slice(0, count)
    .map(([name, size]) => `    ${formatBytes(size).padStart(10)}  ${name}`);

const attribution = (measure: ClassMeasure): string[] => {
  const packages = new Map<string, number>();
  for (const [id, size] of measure.moduleBytes) {
    packages.set(packageOf(id), (packages.get(packageOf(id)) ?? 0) + size);
  }
  return [
    '  Largest packages (rendered bytes, before minification):',
    ...topEntries(packages, 15),
    '  Largest modules:',
    ...topEntries(measure.moduleBytes, 15),
  ];
};

const main = (): void => {
  const write = process.argv.includes('--write');
  const manifest = readJson<ViteManifest>(join(clientDirectory, '.vite', 'manifest.json'));
  const moduleIds = readJson<ModuleIdManifest>(moduleIdsPath);
  const budgetFile = readJson<BudgetFile>(budgetPath);
  const variant = buildVariantOf(moduleIds);
  const chunksByFile = new Map(moduleIds.chunks.map((chunk) => [chunk.fileName, chunk]));
  const sizes = new Map<string, number>();
  const brotliSize = (file: string): number => {
    let size = sizes.get(file);
    if (size === undefined) {
      size = brotliCompressSync(readFileSync(join(clientDirectory, file)), {
        params: { [constants.BROTLI_PARAM_QUALITY]: constants.BROTLI_MAX_QUALITY },
      }).length;
      sizes.set(file, size);
    }
    return size;
  };

  const budgets = budgetFile.variants[variant] ?? {};
  const problems: string[] = [];
  const measured: Record<string, ClassBudget> = {};
  const closures = new Map<string, readonly string[]>();
  for (const routeClass of criticalRouteClasses) {
    const measure = measureClass({ manifest, chunksByFile, roots: routeClass.roots, brotliSize });
    closures.set(routeClass.id, measure.files);
    const budget = budgets[routeClass.id];
    const label = `${routeClass.label} (${variant})`;
    console.info(
      `${label}: ${formatBytes(measure.brotliBytes)} brotli in ${measure.requests} requests; largest chunk ${measure.largestChunk} ${formatBytes(measure.largestChunkBrotliBytes)}; heavy: ${[...measure.heavy.keys()].join(', ') || 'none'}`,
    );
    measured[routeClass.id] = {
      brotliBytes: measure.brotliBytes,
      requests: measure.requests,
      largestChunkBrotliBytes: measure.largestChunkBrotliBytes,
      knownHeavy: Object.fromEntries(
        [...measure.heavy.keys()]
          .toSorted()
          .map((family) => [family, budget?.knownHeavy[family] ?? 'unowned: name the work package that removes it']),
      ),
    };
    const classProblems = compareWithBudget({ label, measure, budget, limits: budgetFile });
    if (classProblems.length > 0 && !write) {
      problems.push(...classProblems, ...attribution(measure));
    }
  }

  problems.push(...findEarlyKernelPreloads({ preloads: documentPreloads(), moduleIds }));
  problems.push(...findSplitRouteModules(readRouterManifest()));

  const precacheListPath = join(appDirectory, 'build', precacheListFile);
  const precache = existsSync(precacheListPath) ? readJson<WrittenPrecacheEntry[]>(precacheListPath) : undefined;
  const workerClasses = workerRouteClasses().filter(
    (workerClass) => variant === 'cloud' || workerClass.routeClass.id !== 'offline-shell',
  );
  const clientView: ClientBuildView = {
    readText: (relativePath) =>
      existsSync(join(clientDirectory, relativePath))
        ? readFileSync(join(clientDirectory, relativePath), 'utf8')
        : undefined,
    exists: (relativePath) => existsSync(join(clientDirectory, relativePath)),
    manifest,
  };
  const precacheDocuments: PrecacheDocument[] = workerClasses.map((workerClass) => ({
    document: workerClass.document,
    roots: workerClass.routeClass.interactive ?? [],
  }));
  problems.push(
    ...findPrecacheProblems({
      entries: precache,
      expected: collectPrecacheFiles(precacheDocuments, clientView),
      closures,
      workerClassIds: workerClasses.map((workerClass) => workerClass.routeClass.id),
      manifest,
      moduleIds,
    }),
  );
  if (precache !== undefined) {
    const bytes = precache.reduce((total, entry) => total + brotliSize(entry.url.slice(1)), 0);
    console.info(
      `Service worker precache (${variant}): ${formatBytes(bytes)} brotli in ${precache.length} entries, for ${workerClasses.map((workerClass) => workerClass.routeClass.id).join(', ')}`,
    );
  }

  const warm = parseWarmManifest(readJson<unknown>(join(clientDirectory, warmManifestFile)));
  problems.push(...findWarmManifestProblems({ warm, closures, manifest, moduleIds }));
  if (warm !== undefined) {
    const warmUps = [
      ...routeClasses.flatMap((routeClass) =>
        routeClass.warms === undefined
          ? []
          : [{ from: routeClass.label, target: routeClass.warms, loaded: routeClass.id }],
      ),
      { from: 'the marketing site', target: 'home', loaded: undefined },
    ];
    for (const { from, target, loaded } of warmUps) {
      const hrefs = warmHrefs(warm, target, loaded);
      const bytes = hrefs.reduce((total, href) => total + brotliSize(href.slice(1)), 0);
      console.info(
        `Warm-up from ${from}: ${target}'s interactive tier, ${formatBytes(bytes)} brotli in ${hrefs.length} prefetches once idle, after the page's own interactive tier`,
      );
    }
  }

  if (write) {
    budgetFile.variants[variant] = measured;
    writeFileSync(budgetPath, `${JSON.stringify(budgetFile, undefined, 2)}\n`);
    console.info(`Wrote the ${variant} budgets to ${budgetPath}`);
  }
  if (problems.length > 0) {
    console.error(problems.join('\n'));
    process.exit(1);
  }
  console.info(
    'Critical budget OK; no document preloads a kernel, wasm or worker asset; the precache holds no deferred-tier asset; no route module is split',
  );
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
