/* oxlint-disable eslint/max-depth, eslint/no-await-in-loop -- product matrix nesting and samples are intentionally explicit/sequential */

import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { cpus } from 'node:os';
import { extname, join, resolve, sep } from 'node:path';
import { performance as nodePerformance } from 'node:perf_hooks';
import { parseArgs } from 'node:util';

import { chromium } from 'playwright';
import type { Browser, Page } from 'playwright';
import { build } from 'vite';

type Arm = 'esbuild' | 'rolldown';
type Fixture = 'birdhouse' | 'feature-matrix';
type WarmState = 'warm-cache-disabled' | 'full-hot';
type RuntimeRow = {
  readonly wall: number;
  readonly runtimeRootCoverage: number;
  readonly clientOverhead: number;
  readonly telemetryEntries: number;
  readonly runtimePhases: Readonly<Record<string, number>>;
  readonly bytes: number;
  readonly sha256: string;
};
type ColdSample = {
  readonly externalWall: number;
  readonly contextCreation: number;
  readonly pageCreation: number;
  readonly navigation: number;
  readonly export: RuntimeRow;
  readonly contextClose: number;
  readonly residual: number;
  readonly resources: readonly ResourceTiming[];
};
type WarmSample = {
  readonly coldNavigation: number;
  readonly warmNavigation: number;
  readonly clientCreation: number;
  readonly shutdown: number;
  readonly rows: readonly RuntimeRow[];
  readonly resources: readonly ResourceTiming[];
};
type ResourceTiming = {
  readonly name: string;
  readonly duration: number;
  readonly transferSize: number;
  readonly decodedBodySize: number;
};
type BrowserBenchmarkApi = {
  readonly cold: (fixture: Fixture) => Promise<RuntimeRow>;
  readonly warm: (input: {
    readonly fixture: Fixture;
    readonly state: WarmState;
    readonly iterations: number;
    readonly warmups: number;
  }) => Promise<{ readonly clientCreation: number; readonly shutdown: number; readonly rows: readonly RuntimeRow[] }>;
};

const repositoryRoot = resolve(import.meta.dirname, '../../..');
const configFile = join(repositoryRoot, 'apps/react-e2e/vite.bundler-products.config.ts');
const outputRoot = join(repositoryRoot, 'out/reports/runtime-telemetry/bundler-core-parity');
const { values } = parseArgs({
  options: {
    iterations: { type: 'string', default: '30' },
    warmups: { type: 'string', default: '5' },
    output: { type: 'string', default: outputRoot },
  },
});
const iterations = Number(values.iterations);
const warmups = Number(values.warmups);
const arms: readonly Arm[] = ['esbuild', 'rolldown'];
const fixtures: readonly Fixture[] = ['birdhouse', 'feature-matrix'];
const warmStates: readonly WarmState[] = ['warm-cache-disabled', 'full-hot'];
const consoleMessages: string[] = [];

const percentile = (sorted: readonly number[], fraction: number): number =>
  sorted[Math.ceil(sorted.length * fraction) - 1] ?? Number.NaN;
const stats = (samples: readonly number[]) => {
  const sorted = [...samples].sort((left, right) => left - right);
  const mean = samples.reduce((sum, value) => sum + value, 0) / samples.length;
  const variance = samples.reduce((sum, value) => sum + (value - mean) ** 2, 0) / samples.length;
  return {
    minimum: sorted[0],
    median: percentile(sorted, 0.5),
    mean,
    p95: percentile(sorted, 0.95),
    maximum: sorted.at(-1),
    standardDeviation: Math.sqrt(variance),
    coefficientOfVariation: mean === 0 ? 0 : Math.sqrt(variance) / mean,
  };
};

const contentType = (path: string): string => {
  switch (extname(path)) {
    case '.html': {
      return 'text/html; charset=utf-8';
    }
    case '.js': {
      return 'text/javascript; charset=utf-8';
    }
    case '.wasm': {
      return 'application/wasm';
    }
    case '.map': {
      return 'application/json';
    }
    case '.ttf': {
      return 'font/ttf';
    }
    default: {
      return 'application/octet-stream';
    }
  }
};

const serve = async (root: string): Promise<{ readonly server: Server; readonly url: string }> => {
  const server = createServer(async (request, response) => {
    try {
      const { pathname } = new URL(request.url ?? '/', 'http://localhost');
      const path = resolve(root, pathname === '/' ? 'index.html' : `.${decodeURIComponent(pathname)}`);
      if (path !== root && !path.startsWith(`${root}${sep}`)) {
        response.writeHead(403).end();
        return;
      }
      const bytes = await readFile(path);
      response.writeHead(200, {
        'Content-Type': contentType(path),
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Cross-Origin-Embedder-Policy': 'require-corp',
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Resource-Policy': 'same-origin',
      });
      response.end(bytes);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('Benchmark server did not bind a TCP port.');
  }
  return { server, url: `http://127.0.0.1:${address.port}` };
};

const closeServer = async (server: Server): Promise<void> =>
  new Promise((resolve, reject) => {
    server.close((error) => {
      if (error === undefined) {
        resolve();
      } else {
        reject(error);
      }
    });
  });

const resourceTimings = async (page: Page): Promise<ResourceTiming[]> =>
  page.evaluate(() =>
    performance.getEntriesByType('resource').map((entry) => {
      const resource = entry as PerformanceResourceTiming;
      return {
        name: resource.name,
        duration: resource.duration,
        transferSize: resource.transferSize,
        decodedBodySize: resource.decodedBodySize,
      };
    }),
  );

const browserMemory = async (page: Page): Promise<number | undefined> =>
  page.evaluate(() => {
    const browserPerformance = performance as Performance & {
      memory?: { readonly usedJSHeapSize: number };
    };
    return browserPerformance.memory?.usedJSHeapSize;
  });

const apiReady = async (page: Page): Promise<void> => {
  await page.waitForFunction(() => '__tauBundlerBenchmark' in globalThis);
  const isolated = await page.evaluate(() => globalThis.crossOriginIsolated);
  if (!isolated) {
    throw new Error('Production benchmark page is not cross-origin isolated.');
  }
};

const coldSample = async (browser: Browser, url: string, fixture: Fixture): Promise<ColdSample> => {
  const externalStarted = nodePerformance.now();
  const contextStarted = nodePerformance.now();
  const context = await browser.newContext();
  const contextCreation = nodePerformance.now() - contextStarted;
  const pageStarted = nodePerformance.now();
  const page = await context.newPage();
  page.on('console', (message) => {
    if (message.type() === 'warning' || message.type() === 'error') {
      consoleMessages.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on('pageerror', (error) => consoleMessages.push(`pageerror: ${error.message}`));
  const pageCreation = nodePerformance.now() - pageStarted;
  const navigationStarted = nodePerformance.now();
  await page.goto(url, { waitUntil: 'networkidle' });
  await apiReady(page);
  const navigation = nodePerformance.now() - navigationStarted;
  const exported = await page.evaluate(
    async (fixtureName) =>
      (globalThis as typeof globalThis & { __tauBundlerBenchmark: BrowserBenchmarkApi }).__tauBundlerBenchmark.cold(
        fixtureName,
      ),
    fixture,
  );
  const resources = await resourceTimings(page);
  const closeStarted = nodePerformance.now();
  await context.close();
  const contextClose = nodePerformance.now() - closeStarted;
  const externalWall = nodePerformance.now() - externalStarted;
  return {
    externalWall,
    contextCreation,
    pageCreation,
    navigation,
    export: exported,
    contextClose,
    residual: externalWall - contextCreation - pageCreation - navigation - exported.wall - contextClose,
    resources,
  };
};

const warmSample = async (input: {
  readonly browser: Browser;
  readonly url: string;
  readonly fixture: Fixture;
  readonly state: WarmState;
}): Promise<WarmSample> => {
  const { browser, fixture, state, url } = input;
  const context = await browser.newContext();
  const primingPage = await context.newPage();
  let started = nodePerformance.now();
  await primingPage.goto(url, { waitUntil: 'networkidle' });
  await apiReady(primingPage);
  const coldNavigation = nodePerformance.now() - started;
  await primingPage.close();

  const page = await context.newPage();
  page.on('console', (message) => {
    if (message.type() === 'warning' || message.type() === 'error') {
      consoleMessages.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on('pageerror', (error) => consoleMessages.push(`pageerror: ${error.message}`));
  started = nodePerformance.now();
  await page.goto(url, { waitUntil: 'networkidle' });
  await apiReady(page);
  const warmNavigation = nodePerformance.now() - started;
  const result = await page.evaluate(
    async (benchmarkInput) =>
      (globalThis as typeof globalThis & { __tauBundlerBenchmark: BrowserBenchmarkApi }).__tauBundlerBenchmark.warm(
        benchmarkInput,
      ),
    { fixture, state, iterations, warmups },
  );
  const resources = await resourceTimings(page);
  await context.close();
  return { coldNavigation, warmNavigation, ...result, resources };
};

const memorySample = async (browser: Browser, url: string): Promise<number | undefined> => {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.goto(url, { waitUntil: 'networkidle' });
    await apiReady(page);
    await page.evaluate(async () =>
      (globalThis as typeof globalThis & { __tauBundlerBenchmark: BrowserBenchmarkApi }).__tauBundlerBenchmark.cold(
        'feature-matrix',
      ),
    );
    return await browserMemory(page);
  } finally {
    await context.close();
  }
};

const inventory = async (root: string): Promise<Array<{ readonly path: string; readonly bytes: number }>> => {
  const entries = await readdir(root, { withFileTypes: true });
  const children = await Promise.all(
    entries.map(async (entry) => {
      const path = join(root, entry.name);
      if (entry.isDirectory()) {
        const nested = await inventory(path);
        return nested.map((item) => ({ ...item, path: `${entry.name}/${item.path}` }));
      }
      const fileStat = await stat(path);
      return [{ path: entry.name, bytes: fileStat.size }];
    }),
  );
  return children.flat();
};

const buildRoots: Record<Arm, string> = {
  esbuild: join(values.output, 'browser-builds/esbuild'),
  rolldown: join(values.output, 'browser-builds/rolldown'),
};
await mkdir(values.output, { recursive: true });
for (const arm of arms) {
  await build({
    configFile,
    mode: arm,
    build: { outDir: buildRoots[arm], emptyOutDir: true },
  });
}
const assets = {
  esbuild: await inventory(buildRoots.esbuild),
  rolldown: await inventory(buildRoots.rolldown),
};
if (!assets.esbuild.some(({ path }) => path.includes('esbuild') && path.endsWith('.wasm'))) {
  throw new Error('Esbuild production graph has no esbuild WASM asset.');
}
if (assets.esbuild.some(({ path }) => path.includes('rolldown'))) {
  throw new Error('Esbuild production graph contains a Rolldown asset.');
}
if (!assets.rolldown.some(({ path }) => path.includes('rolldown') && path.endsWith('.wasm'))) {
  throw new Error('Rolldown production graph has no Rolldown WASM asset.');
}
if (assets.rolldown.some(({ path }) => path.includes('esbuild') && path.endsWith('.wasm'))) {
  throw new Error('Rolldown production graph contains an esbuild WASM asset.');
}
if (
  assets.rolldown.some(
    ({ path }) => path.endsWith('.node') || /binding-(?:android|darwin|freebsd|linux|openharmony|win32)/u.test(path),
  )
) {
  throw new Error('Rolldown browser production graph contains a native host binding.');
}

const served = { esbuild: await serve(buildRoots.esbuild), rolldown: await serve(buildRoots.rolldown) };
const browser = await chromium.launch({ channel: 'chromium', headless: true });
const browserVersion = browser.version();
type FixtureSamples = {
  cold: Record<Arm, ColdSample[]>;
  'warm-cache-disabled': Partial<Record<Arm, WarmSample>>;
  'full-hot': Partial<Record<Arm, WarmSample>>;
};
const emptyFixtureSamples = (): FixtureSamples => ({
  cold: { esbuild: [], rolldown: [] },
  'warm-cache-disabled': {},
  'full-hot': {},
});
const raw: Record<Fixture, FixtureSamples> = {
  birdhouse: emptyFixtureSamples(),
  'feature-matrix': emptyFixtureSamples(),
};
const memory: Partial<Record<Arm, number>> = {};

try {
  for (const fixture of fixtures) {
    console.error(`Benchmarking browser cold: ${fixture}`);
    for (let round = 0; round < warmups + iterations; round += 1) {
      const offset = round % arms.length;
      for (const arm of [...arms.slice(offset), ...arms.slice(0, offset)]) {
        const sample = await coldSample(browser, served[arm].url, fixture);
        if (round >= warmups) {
          raw[fixture].cold[arm].push(sample);
        }
      }
    }
    for (const state of warmStates) {
      for (const arm of arms) {
        console.error(`Benchmarking browser ${state}: ${fixture}/${arm}`);
        raw[fixture][state][arm] = await warmSample({ browser, url: served[arm].url, fixture, state });
      }
    }
  }
  for (const arm of arms) {
    console.error(`Measuring representative browser memory: ${arm}`);
    memory[arm] = await memorySample(browser, served[arm].url);
  }
} finally {
  await browser.close();
  await Promise.all(arms.map(async (arm) => closeServer(served[arm].server)));
}

const summarizeRows = (rows: readonly RuntimeRow[]) => ({
  wall: stats(rows.map(({ wall }) => wall)),
  runtimeRootCoverage: stats(rows.map(({ runtimeRootCoverage }) => runtimeRootCoverage)),
  clientOverhead: stats(rows.map(({ clientOverhead }) => clientOverhead)),
  runtimePhases: Object.fromEntries(
    [...new Set(rows.flatMap(({ runtimePhases }) => Object.keys(runtimePhases)))].map((name) => [
      name,
      stats(rows.map(({ runtimePhases }) => runtimePhases[name] ?? 0)),
    ]),
  ),
  outputs: [...new Set(rows.map(({ bytes, sha256 }) => `${bytes}:${sha256}`))],
});
const summary = Object.fromEntries(
  fixtures.map((fixture) => [
    fixture,
    {
      cold: Object.fromEntries(
        arms.map((arm) => {
          const samples = raw[fixture].cold[arm];
          return [
            arm,
            {
              externalWall: stats(samples.map(({ externalWall }) => externalWall)),
              contextCreation: stats(samples.map(({ contextCreation }) => contextCreation)),
              pageCreation: stats(samples.map(({ pageCreation }) => pageCreation)),
              navigation: stats(samples.map(({ navigation }) => navigation)),
              contextClose: stats(samples.map(({ contextClose }) => contextClose)),
              residual: stats(samples.map(({ residual }) => residual)),
              ...summarizeRows(samples.map(({ export: exported }) => exported)),
            },
          ];
        }),
      ),
      ...Object.fromEntries(
        warmStates.map((state) => [
          state,
          Object.fromEntries(
            arms.map((arm) => {
              const sample = raw[fixture][state][arm];
              if (sample === undefined) {
                throw new Error(`Missing ${fixture}/${state}/${arm} sample.`);
              }
              return [
                arm,
                {
                  coldNavigation: sample.coldNavigation,
                  warmNavigation: sample.warmNavigation,
                  clientCreation: sample.clientCreation,
                  shutdown: sample.shutdown,
                  ...summarizeRows(sample.rows),
                },
              ];
            }),
          ),
        ]),
      ),
    },
  ]),
);
type CompressedAsset = {
  readonly path: string;
  readonly bytes: number;
  readonly gzip: number;
  readonly brotli: number;
};
const compressedAssets: Record<Arm, CompressedAsset[]> = { esbuild: [], rolldown: [] };
for (const arm of arms) {
  compressedAssets[arm] = await Promise.all(
    assets[arm].map(async (item) => {
      const bytes = await readFile(join(buildRoots[arm], item.path));
      return {
        ...item,
        gzip: gzipSync(bytes, { level: 9 }).byteLength,
        brotli: brotliCompressSync(bytes, {
          params: { [constants.BROTLI_PARAM_QUALITY]: 9 },
        }).byteLength,
      };
    }),
  );
}
const report = {
  generatedAt: new Date().toISOString(),
  environment: {
    cpu: cpus()[0]?.model,
    platform: process.platform,
    architecture: process.arch,
    node: process.version,
    chromium: browserVersion,
  },
  protocol: {
    iterations,
    warmups,
    design: 'paired fresh isolated contexts for cold; primed HTTP cache and one initialized worker per warm state',
    replicadWasm: 'multi',
    compression: { gzipLevel: 9, brotliQuality: 9 },
  },
  memory,
  compressedAssets,
  consoleMessages,
  summary,
  raw,
};
const output = join(values.output, `browser-product-${Date.now()}.json`);
await writeFile(output, `${JSON.stringify(report, undefined, 2)}\n`);
console.log(JSON.stringify({ output, environment: report.environment, summary }, undefined, 2));

/* oxlint-enable eslint/max-depth, eslint/no-await-in-loop -- end sequential benchmark */
