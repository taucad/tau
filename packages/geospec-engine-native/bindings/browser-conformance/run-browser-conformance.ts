import { createHash } from 'node:crypto';
import { mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, firefox, webkit } from 'playwright';
import type { Browser, BrowserType } from 'playwright';
import { createServer } from 'vite';
// oxlint-disable-next-line no-restricted-imports -- Runner and browser use the same pinned data-only selection.
import { joinCurrentCorpus, selectCorpusRecords } from '../../conformance/current-profile.mjs';
// oxlint-disable-next-line no-restricted-imports -- Executable test fixture loads its nonpublished sibling input owner.
import { loadM2BrowserInputs, loadSupplementalBrowserInputs } from './m2-inputs.ts';

/* oxlint-disable typescript/no-restricted-types -- These frozen JSON wire record types preserve explicit null separately from missing fields. */
type PackageManifest = {
  exports?: Record<string, unknown>;
  imports?: Record<string, unknown>;
};

type BrowserPageReport = {
  passed: number;
  failed: number;
  admissions?: number;
  total?: number;
  wasmAsset: { sha256: string | null };
  equivalentCanonicalGroups?: Array<{ ids: string[]; passed: boolean }>;
  corpus?: { records: number; selectedRecords: number; bindingProfile: string };
  results?: Array<{ id: string }>;
};

type BrowserCompletion = { report: BrowserPageReport } | { error: string };

type BrowserRuntimeResult = BrowserCompletion & {
  browser: string;
  version: string;
  executable: { path: string; sha256: string | null };
  launcher?: { path: string; sha256: string };
  runtime?: {
    console: Array<{ text: string; type: string }>;
    pageErrors: string[];
    requestFailures: Array<{ error: string | null; method: string; url: string }>;
  };
};

/* oxlint-enable typescript/no-restricted-types */

const conformanceDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(conformanceDirectory, '../../../..');
const applicationDirectory = resolve(conformanceDirectory, 'app');
const m2ApplicationDirectory = resolve(repositoryRoot, 'packages/geospec/host-tests/m2-browser');
const corpusPath = resolve(repositoryRoot, 'packages/geospec-engine-native/conformance/early-corpus.json');
const profilePath = resolve(
  repositoryRoot,
  'packages/geospec-engine-native/rust/tests/fixtures/current-profile-01/plan-corpus.json',
);
const currentProfileDirectory = resolve(repositoryRoot, 'packages/geospec-engine-native/conformance');
const m2ApplicationPath = resolve(m2ApplicationDirectory, 'app.ts');

const argument = (name: string): string | undefined => {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
};

const fileSha256 = async (path: string): Promise<string> =>
  createHash('sha256')
    .update(await readFile(path))
    .digest('hex');

const exportTarget = (manifest: PackageManifest, name: string): string | undefined => {
  const value = manifest.exports?.[name];
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }
  const conditions = value as Record<string, unknown>;
  for (const condition of ['browser', 'import', 'default']) {
    if (typeof conditions[condition] === 'string') {
      return conditions[condition];
    }
  }
  return undefined;
};

const importTarget = (manifest: PackageManifest, name: string): string | undefined => {
  const value = manifest.imports?.[name];
  return typeof value === 'string' ? value : undefined;
};

const errorText = (error: unknown): string => (error instanceof Error ? (error.stack ?? error.message) : String(error));

const run = async (): Promise<void> => {
  const suite = argument('--suite') ?? process.env['GEOSPEC_CONFORMANCE_SUITE'] ?? 'early';
  if (suite !== 'early' && suite !== 'm2') {
    throw new TypeError(`Unknown browser conformance suite: ${suite}.`);
  }
  const idsArgument = argument('--ids');
  if (process.argv.includes('--ids') && idsArgument === undefined) {
    throw new TypeError('--ids requires a comma-separated allowlist.');
  }
  if (suite !== 'early' && idsArgument !== undefined) {
    throw new TypeError('--ids selects engine records in the early suite only.');
  }
  const recordIds = idsArgument?.split(',');
  const inputPath = argument('--inputs') ?? process.env['GEOSPEC_CONFORMANCE_INPUTS'];
  const inputSha256 = argument('--inputs-sha256') ?? process.env['GEOSPEC_CONFORMANCE_INPUTS_SHA256'];
  if ((inputPath === undefined) !== (inputSha256 === undefined)) {
    throw new TypeError('--inputs and --inputs-sha256 must be supplied together.');
  }
  if (suite !== 'm2' && inputPath !== undefined) {
    throw new TypeError('Supplemental browser inputs require the m2 packed suite.');
  }
  const supplementalInput =
    inputPath === undefined || inputSha256 === undefined ? undefined : { path: inputPath, sha256: inputSha256 };
  const packedConsumerDirectory = await realpath(
    resolve(
      argument('--consumer') ??
        process.env['GEOSPEC_PACKED_CONSUMER'] ??
        resolve(repositoryRoot, 'node_modules/.cache/geospec-engine-native/packed-entry/consumer'),
    ),
  );
  const outputDirectory = resolve(
    argument('--output') ??
      process.env['GEOSPEC_CONFORMANCE_OUTPUT'] ??
      resolve(repositoryRoot, 'out/reports/geospec-native'),
  );
  const label =
    argument('--label') ??
    process.env['GEOSPEC_CONFORMANCE_LABEL'] ??
    (supplementalInput === undefined
      ? suite === 'm2'
        ? 'browser-packed-m2'
        : 'browser-packed'
      : 'browser-packed-supplemental');
  const packedPackageDirectory = resolve(packedConsumerDirectory, 'node_modules/@taucad/geospec-engine-native');
  const geospecPackageDirectory = resolve(packedConsumerDirectory, 'node_modules/geospec');
  const cacheDirectory = resolve(repositoryRoot, 'node_modules/.cache/geospec-engine-native/browser-conformance');
  const packageManifestPath = resolve(packedPackageDirectory, 'package.json');
  const packageManifest = JSON.parse(await readFile(packageManifestPath, 'utf8')) as PackageManifest;
  const rootExport = exportTarget(packageManifest, '.');
  const bindingName = '#mixed-wasm-binding';
  const wasmBinding = importTarget(packageManifest, bindingName);
  if (rootExport === undefined || wasmBinding === undefined) {
    throw new TypeError(`Packed package manifest is missing the public root or ${bindingName} import.`);
  }
  const rootModulePath = await realpath(resolve(packedPackageDirectory, rootExport));
  const wasmBindingPath = await realpath(resolve(packedPackageDirectory, wasmBinding));
  const wasmBinaryPath = await realpath(resolve(dirname(wasmBindingPath), 'geospec_engine_native.wasm'));
  const geospecManifestPath = resolve(geospecPackageDirectory, 'package.json');
  const geospecManifest =
    suite === 'm2' ? (JSON.parse(await readFile(geospecManifestPath, 'utf8')) as PackageManifest) : undefined;
  const assertionExport =
    geospecManifest === undefined ? undefined : exportTarget(geospecManifest, './assertion-client');
  if (suite === 'm2' && assertionExport === undefined) {
    throw new TypeError('Installed geospec manifest is missing its assertion-client export.');
  }
  const assertionModulePath =
    assertionExport === undefined ? undefined : await realpath(resolve(geospecPackageDirectory, assertionExport));
  const corpusText = await readFile(corpusPath, 'utf8');
  const profileText = suite === 'early' ? await readFile(profilePath, 'utf8') : undefined;
  const corpus =
    profileText === undefined
      ? undefined
      : await joinCurrentCorpus(Buffer.from(corpusText), Buffer.from(profileText), 'full-backend');
  const selected = corpus === undefined ? [] : selectCorpusRecords(corpus, recordIds);
  const selectedIds = selected.map(({ id }) => id);
  const expectedAdmissions = selected.reduce((count, record) => count + record.ingest.length, 0);
  const expectedGroups =
    corpus?.equivalentCanonicalGroups.filter((ids) => ids.every((id) => selectedIds.includes(id))) ?? [];
  const m2Inputs =
    suite === 'm2'
      ? supplementalInput === undefined
        ? await loadM2BrowserInputs(repositoryRoot)
        : await loadSupplementalBrowserInputs(supplementalInput.path, supplementalInput.sha256)
      : undefined;
  const expectedM2Rows = m2Inputs?.metadata.expectedRowCount ?? 30;
  const browserCompletionTimeout = supplementalInput === undefined ? 120_000 : 900_000;
  const m2MetadataText = m2Inputs === undefined ? undefined : JSON.stringify(m2Inputs.metadata);
  const loadedModules = new Set<string>();
  const resolvedSpecifiers = new Set<string>();

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
        ...(assertionModulePath === undefined
          ? []
          : [
              {
                find: /^geospec\/assertion-client$/,
                replacement: assertionModulePath,
              },
            ]),
      ],
      conditions: ['browser', 'import', 'default'],
    },
    server: {
      host: '127.0.0.1',
      port: 0,
      strictPort: false,
      fs: {
        strict: true,
        allow: [
          applicationDirectory,
          currentProfileDirectory,
          packedPackageDirectory,
          ...(suite === 'm2' ? [geospecPackageDirectory, m2ApplicationDirectory] : []),
        ],
      },
    },
    plugins: [
      {
        name: 'packed-geospec-conformance-inputs',
        transformIndexHtml(html) {
          return suite === 'm2' ? html.replace('src="/run.ts"', 'src="/m2.ts"') : html;
        },
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
          developmentServer.middlewares.use('/current-profile.json', (request, response, next) => {
            if (request.method !== 'GET' || profileText === undefined) {
              next();
              return;
            }
            response.setHeader('Content-Type', 'application/json; charset=utf-8');
            response.setHeader('Cache-Control', 'no-store');
            response.end(profileText);
          });
          developmentServer.middlewares.use('/m2-inputs.json', (request, response, next) => {
            if (suite !== 'm2' || request.method !== 'GET' || m2MetadataText === undefined) {
              next();
              return;
            }
            response.setHeader('Content-Type', 'application/json; charset=utf-8');
            response.setHeader('Cache-Control', 'no-store');
            response.end(m2MetadataText);
          });
          developmentServer.middlewares.use('/m2-assets', (request, response, next) => {
            const asset = m2Inputs?.assets.get(`/m2-assets${request.url ?? ''}`);
            if (suite !== 'm2' || request.method !== 'GET' || asset === undefined) {
              next();
              return;
            }
            response.setHeader('Content-Type', 'application/octet-stream');
            response.setHeader('Cache-Control', 'no-store');
            response.end(asset);
          });
        },
        resolveId(source) {
          resolvedSpecifiers.add(source);
          if (suite === 'm2' && source === '/m2.ts') {
            return m2ApplicationPath;
          }
          if (source === '#native-binding' || source.endsWith('.node') || source.includes('/dist/native/')) {
            throw new Error(`Browser route resolved forbidden native loader: ${source}`);
          }
          if (source === '#wasm-binding') {
            throw new Error('Browser route resolved the superseded wasm-bindgen binding.');
          }
          return undefined;
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
      const runtime: NonNullable<BrowserRuntimeResult['runtime']> = {
        console: [],
        pageErrors: [],
        requestFailures: [],
      };
      let browser: Browser | undefined;
      try {
        browser = await browserType.launch({ headless: true });
        const page = await browser.newPage();
        if (suite === 'm2') {
          page.on('console', (message) => runtime.console.push({ text: message.text(), type: message.type() }));
          page.on('pageerror', (error) => runtime.pageErrors.push(errorText(error)));
          page.on('requestfailed', (request) =>
            runtime.requestFailures.push({
              error: request.failure()?.errorText ?? null,
              method: request.method(),
              url: request.url(),
            }),
          );
        }
        const pageUrl = new URL(url);
        if (idsArgument !== undefined) {
          pageUrl.searchParams.set('ids', idsArgument);
        }
        await page.goto(pageUrl.href, { waitUntil: 'load' });
        await page.waitForFunction(
          () =>
            (
              globalThis as typeof globalThis & {
                __geospecConformance?: BrowserCompletion;
              }
            ).__geospecConformance !== undefined,
          undefined,
          { timeout: browserCompletionTimeout },
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
          ...(suite === 'm2' ? { runtime } : {}),
          ...result,
        };
      } catch (error) {
        if (suite !== 'm2') {
          throw error;
        }
        return {
          browser: browserType.name(),
          version: browser?.version() ?? 'unavailable',
          executable: {
            path: executablePath,
            sha256: await fileSha256(executablePath).catch(() => null),
          },
          runtime,
          error: errorText(error),
        };
      } finally {
        await browser?.close();
      }
    };
    const reports: BrowserRuntimeResult[] = [];
    if (suite === 'm2') {
      for (const browserType of [chromium, firefox, webkit]) {
        // oxlint-disable-next-line no-await-in-loop -- The declared target campaign runs browsers sequentially.
        reports.push(await runBrowser(browserType));
      }
    } else {
      reports.push(...(await Promise.all([runBrowser(chromium), runBrowser(firefox), runBrowser(webkit)])));
    }
    const forbiddenModules = [...loadedModules].filter(
      (id) =>
        id.includes('/dist/native/') || id.endsWith('.node') || id.includes('/dist/wasm/geospec_engine_native_wasm'),
    );
    const mixedBindingLoaded = loadedModules.has(wasmBindingPath);
    const artifactPaths = [packageManifestPath, rootModulePath, wasmBindingPath, wasmBinaryPath];
    if (suite === 'm2' && assertionModulePath !== undefined) {
      artifactPaths.push(geospecManifestPath, assertionModulePath, m2ApplicationPath);
    }
    const artifactEntries = await Promise.all(
      artifactPaths.map(async (path) => ({
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
      suite,
      ...(suite === 'early'
        ? {
            selection: {
              ids: selectedIds,
              records: selected.length,
              admissions: expectedAdmissions,
              equivalentCanonicalGroups: expectedGroups,
              bindingProfile: corpus?.bindingProfile,
            },
          }
        : {}),
      consumerDirectory: packedConsumerDirectory,
      route: {
        import: '@taucad/geospec-engine-native',
        resolvedFromInstalledManifest: rootModulePath,
        bindingImport: bindingName,
        bindingResolvedFromInstalledManifest: wasmBindingPath,
        ...(assertionModulePath === undefined
          ? {}
          : {
              assertionImport: 'geospec/assertion-client',
              assertionResolvedFromInstalledManifest: assertionModulePath,
              applicationModule: m2ApplicationPath,
            }),
        mixedBindingLoaded,
        nativeLoaderResolved: forbiddenModules.length > 0,
        forbiddenModules,
        loadedModules: [...loadedModules].sort(),
        resolvedSpecifiers: [...resolvedSpecifiers].sort(),
      },
      packageArtifacts,
      supplementalCampaign:
        supplementalInput === undefined
          ? null
          : {
              path: await realpath(resolve(supplementalInput.path)),
              sha256: supplementalInput.sha256,
              rows: expectedM2Rows,
            },
      browsers: reports,
    };
    await mkdir(outputDirectory, { recursive: true });
    const outputPath = resolve(outputDirectory, `${label}-full.json`);
    await writeFile(outputPath, `${JSON.stringify(report, undefined, 2)}\n`);

    const failures = reports.filter((result) => {
      if ('error' in result) {
        return true;
      }
      if (suite === 'm2') {
        return (
          result.report.total !== expectedM2Rows ||
          result.report.passed !== expectedM2Rows ||
          result.report.failed !== 0 ||
          result.report.wasmAsset.sha256 !== packageArtifacts[wasmBinaryPath] ||
          (result.runtime?.pageErrors.length ?? 0) > 0 ||
          (result.runtime?.requestFailures.length ?? 0) > 0 ||
          (result.runtime?.console.some((entry) => entry.type === 'error') ?? false)
        );
      }
      return (
        result.report.passed !== selected.length ||
        result.report.failed !== 0 ||
        result.report.admissions !== expectedAdmissions ||
        result.report.corpus?.records !== corpus?.records.length ||
        result.report.corpus?.selectedRecords !== selected.length ||
        result.report.corpus.bindingProfile !== 'full-backend' ||
        JSON.stringify(result.report.results?.map(({ id }) => id)) !== JSON.stringify(selectedIds) ||
        JSON.stringify(result.report.equivalentCanonicalGroups?.map(({ ids }) => ids)) !==
          JSON.stringify(expectedGroups) ||
        result.report.wasmAsset.sha256 !== packageArtifacts[wasmBinaryPath] ||
        (result.report.equivalentCanonicalGroups ?? []).some((group) => !group.passed)
      );
    });
    process.stdout.write(
      `${JSON.stringify({ outputPath, suite, browsers: reports.map((result) => ({ browser: result.browser, version: result.version, ...('report' in result ? { passed: result.report.passed, failed: result.report.failed, ...(suite === 'm2' ? { total: result.report.total } : { admissions: result.report.admissions }) } : { error: result.error }) })), mixedBindingLoaded, nativeLoaderResolved: report.route.nativeLoaderResolved })}\n`,
    );
    if (failures.length > 0 || report.route.nativeLoaderResolved || !mixedBindingLoaded) {
      process.exitCode = 1;
    }
  } finally {
    await server.close();
    await rm(cacheDirectory, { recursive: true, force: true });
  }
};

await run();
