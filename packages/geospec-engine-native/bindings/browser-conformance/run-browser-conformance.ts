import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, firefox, webkit } from 'playwright';
import type { Browser, BrowserType } from 'playwright';
import { createServer } from 'vite';

type PackageManifest = {
  exports?: { '.'?: { import?: unknown } };
  imports?: { '#wasm-binding'?: unknown };
};

type BrowserPageReport = {
  passed: number;
  failed: number;
  admissions: number;
  wasmAsset: { sha256: string };
  equivalentCanonicalGroups: Array<{ passed: boolean }>;
};

type BrowserCompletion = { report: BrowserPageReport } | { error: string };

type BrowserRuntimeResult = BrowserCompletion & {
  browser: string;
  version: string;
  executable: { path: string; sha256: string };
  launcher?: { path: string; sha256: string };
};

const conformanceDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(conformanceDirectory, '../../../..');
const applicationDirectory = resolve(conformanceDirectory, 'app');
const corpusPath = resolve(repositoryRoot, 'packages/geospec-engine-native/conformance/early-corpus.json');

const argument = (name: string): string | undefined => {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
};

const fileSha256 = async (path: string): Promise<string> =>
  createHash('sha256')
    .update(await readFile(path))
    .digest('hex');

const run = async (): Promise<void> => {
  const packedConsumerDirectory = resolve(
    argument('--consumer') ??
      process.env['GEOSPEC_PACKED_CONSUMER'] ??
      resolve(repositoryRoot, 'node_modules/.cache/geospec-engine-native/packed-entry/consumer'),
  );
  const outputDirectory = resolve(
    argument('--output') ??
      process.env['GEOSPEC_CONFORMANCE_OUTPUT'] ??
      resolve(repositoryRoot, 'out/reports/geospec-native'),
  );
  const label = argument('--label') ?? process.env['GEOSPEC_CONFORMANCE_LABEL'] ?? 'browser-packed';
  const packedPackageDirectory = resolve(packedConsumerDirectory, 'node_modules/@taucad/geospec-engine-native');
  const cacheDirectory = resolve(repositoryRoot, 'node_modules/.cache/geospec-engine-native/browser-conformance');
  const packageManifestPath = resolve(packedPackageDirectory, 'package.json');
  const packageManifest = JSON.parse(await readFile(packageManifestPath, 'utf8')) as PackageManifest;
  const rootExport = packageManifest.exports?.['.']?.import;
  const wasmBinding = packageManifest.imports?.['#wasm-binding'];
  if (typeof rootExport !== 'string' || typeof wasmBinding !== 'string') {
    throw new TypeError('Packed package manifest is missing the public root or WASM binding export.');
  }
  const rootModulePath = resolve(packedPackageDirectory, rootExport);
  const wasmBindingPath = resolve(packedPackageDirectory, wasmBinding);
  const wasmBinaryPath = resolve(dirname(wasmBindingPath), 'geospec_engine_native_wasm_bg.wasm');
  const corpusText = await readFile(corpusPath, 'utf8');
  const loadedModules = new Set<string>();

  const server = await createServer({
    appType: 'spa',
    cacheDir: cacheDirectory,
    configFile: false,
    root: applicationDirectory,
    logLevel: 'error',
    optimizeDeps: { noDiscovery: true, include: [] },
    resolve: {
      alias: [
        {
          find: /^@taucad\/geospec-engine-native$/,
          replacement: rootModulePath,
        },
      ],
      conditions: ['browser', 'import', 'default'],
    },
    server: {
      host: '127.0.0.1',
      port: 0,
      strictPort: false,
      fs: {
        strict: true,
        allow: [applicationDirectory, packedPackageDirectory],
      },
    },
    plugins: [
      {
        name: 'packed-geospec-conformance-inputs',
        configureServer(developmentServer) {
          developmentServer.middlewares.use('/early-corpus.json', (request, response, next) => {
            if (request.method !== 'GET') {
              next();
              return;
            }
            response.setHeader('Content-Type', 'application/json; charset=utf-8');
            response.setHeader('Cache-Control', 'no-store');
            response.end(corpusText);
          });
        },
        resolveId(source) {
          if (source === '#native-binding' || source.endsWith('.node') || source.includes('/dist/native/')) {
            throw new Error(`Browser route resolved forbidden native loader: ${source}`);
          }
        },
        load(id) {
          loadedModules.add(id);
        },
      },
    ],
  });

  try {
    await server.listen();
    const url = server.resolvedUrls?.local[0];
    if (url === undefined || !url.startsWith('http://127.0.0.1:')) {
      throw new Error(`Vite did not bind an explicit loopback URL: ${String(url)}`);
    }
    const runBrowser = async (browserType: BrowserType<Browser>): Promise<BrowserRuntimeResult> => {
      const launcherPath = browserType.executablePath();
      const executablePath =
        browserType.name() === 'webkit'
          ? resolve(dirname(launcherPath), 'Playwright.app/Contents/MacOS/Playwright')
          : launcherPath;
      const browser = await browserType.launch({ headless: true });
      try {
        const page = await browser.newPage();
        await page.goto(url, { waitUntil: 'load' });
        await page.waitForFunction(
          () =>
            (
              globalThis as typeof globalThis & {
                __geospecConformance?: BrowserCompletion;
              }
            ).__geospecConformance !== undefined,
          undefined,
          { timeout: 120_000 },
        );
        const result = await page.evaluate<BrowserCompletion>(() => {
          const completion = (
            globalThis as typeof globalThis & {
              __geospecConformance?: BrowserCompletion;
            }
          ).__geospecConformance;
          if (completion === undefined) {
            throw new Error('Browser conformance completion disappeared.');
          }
          return completion;
        });
        return {
          browser: browserType.name(),
          version: browser.version(),
          executable: {
            path: executablePath,
            sha256: await fileSha256(executablePath),
          },
          ...(launcherPath === executablePath
            ? {}
            : {
                launcher: {
                  path: launcherPath,
                  sha256: await fileSha256(launcherPath),
                },
              }),
          ...result,
        };
      } finally {
        await browser.close();
      }
    };
    const reports = await Promise.all([runBrowser(chromium), runBrowser(firefox), runBrowser(webkit)]);
    const forbiddenModules = [...loadedModules].filter((id) => id.includes('/dist/native/') || id.endsWith('.node'));
    const artifactEntries = await Promise.all(
      [packageManifestPath, rootModulePath, wasmBindingPath, wasmBinaryPath].map(async (path) => ({
        path,
        sha256: await fileSha256(path),
      })),
    );
    const packageArtifacts: Record<string, string> = {};
    for (const entry of artifactEntries) {
      packageArtifacts[entry.path] = entry.sha256;
    }
    const report = {
      schemaVersion: 1,
      consumerDirectory: packedConsumerDirectory,
      route: {
        import: '@taucad/geospec-engine-native',
        resolvedFromInstalledManifest: rootModulePath,
        nativeLoaderResolved: forbiddenModules.length > 0,
        forbiddenModules,
      },
      packageArtifacts,
      browsers: reports,
    };
    await mkdir(outputDirectory, { recursive: true });
    const outputPath = resolve(outputDirectory, `${label}-full.json`);
    await writeFile(outputPath, `${JSON.stringify(report, undefined, 2)}\n`);

    const failures = reports.filter(
      (result) =>
        'error' in result ||
        result.report.passed !== 320 ||
        result.report.failed !== 0 ||
        result.report.admissions !== 109 ||
        result.report.wasmAsset.sha256 !== packageArtifacts[wasmBinaryPath] ||
        result.report.equivalentCanonicalGroups.some((group) => !group.passed),
    );
    process.stdout.write(
      `${JSON.stringify({ outputPath, browsers: reports.map((result) => ({ browser: result.browser, version: result.version, ...('report' in result ? { passed: result.report.passed, failed: result.report.failed, admissions: result.report.admissions } : { error: result.error }) })), nativeLoaderResolved: report.route.nativeLoaderResolved })}\n`,
    );
    if (failures.length > 0 || report.route.nativeLoaderResolved) {
      process.exitCode = 1;
    }
  } finally {
    await server.close();
    await rm(cacheDirectory, { recursive: true, force: true });
  }
};

await run();
