#!/usr/bin/env node
/* oxlint-disable typescript/no-unsafe-assignment, typescript/no-unsafe-argument, typescript/no-unsafe-call, typescript/no-unsafe-return, typescript/no-unnecessary-condition, typescript/use-unknown-in-catch-callback-variable -- Product receipts, Vite and Playwright are runtime-checked dynamic boundaries. */
/**
 * Independent, fail-closed MT product qualification.
 *
 * Usage: packages/geospec-engine-native/scripts/qualify-mt-product.sh
 *   --mt-receipt /absolute/product/geospec_engine_native.mt.json
 *   --mt-receipt-sha256 HEX --st-package /absolute/staged-st-package
 *   --st-module-sha256 HEX --st-glue-sha256 HEX --st-wasm-sha256 HEX
 *   --st-build-receipt /absolute/st/build-receipt.json
 *   --output /absolute/independent/qualification.json
 *
 * Runs ST, MT at grant 1 and MT at the product's permit cap in Node (this process's version) and
 * Chromium, Firefox and WebKit, and requires exact result bytes across all of them. The verifier's own
 * main thread then hosts only the MT product (no ST) to prove canonicalization and allocation after a
 * foreign memory grow. No qualification receipt is written on failure. This verifier never builds products.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { Worker } from 'node:worker_threads';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium, firefox, webkit } from 'playwright';
import { createServer } from 'vite';
// oxlint-disable-next-line eslint/no-restricted-imports -- The frozen conformance authority is a private package module.
import { joinCurrentCorpus } from '../../conformance/current-profile.mjs';

const directory = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(directory, '../..');
const browserRoot = directory;
const corpusPath = join(packageRoot, 'conformance/early-corpus.json');
const profilePath = join(packageRoot, 'rust/tests/fixtures/current-profile-01/plan-corpus.json');
const successorPath = join(packageRoot, 'rust/tests/fixtures/current-profile-v5/numeric-profile.txt');
const ids = ['a2/raw/asymmetric-all-fields', 'a2/invalid-claim/null-expected'];
// Frozen M3 authority rows (exact ingest and claim requests) that reach each OCCT grant route of the
// `native/occt/rust/src/lib.rs` Document. `witness` is a work counter or response marker proving the row
// reached its route; `serial` names why a row stays serial under a grant today.
const authorityPath = join(
  packageRoot,
  '../geospec/host-tests/fixtures/data/fb0920d448648cf1ea82c1305f8701c7992156a72f5a592cc569b3b3bec0bd51',
);
const authorityLogicalPath = join(packageRoot, '../geospec/host-tests/m3-corpus/current-authority-v3.json');
const stepRows = [
  { id: 'ancillary/analyzeMeshOverlap/positive', route: 'dedicated-tessellate', witness: { counter: 'tessellations' } },
  {
    id: 'family/toHaveCircularHole/positive',
    route: 'dedicated-circular-bore-common',
    witness: { marker: '"circularBoreTopology"' },
  },
  {
    id: 'amendment/W3-CONTAINMENT-SET-01/ap242-cavity-countermodel/positive',
    route: 'dedicated-regular-solid-cut',
    witness: { marker: '"method":"boolean-difference"' },
  },
  {
    id: 'family/toBeValidBrep/positive',
    route: 'validity',
    serial: 'Admission validity stays reusable; only common_volume, which no matcher calls, invalidates it.',
  },
  {
    id: 'family/toBeWatertight/positive',
    route: 'report-mesh',
    witness: { counter: 'meshAnalysisBuilds' },
    serial: 'Report meshing is serial until the grant reaches build_report_generation (lane C9).',
  },
];
const currentSteps = () => {
  const authority = verify(authorityPath, basename(authorityPath), 'M3 authority corpus');
  const { rows } = JSON.parse(authority.bytes);
  return stepRows.map(({ id, route, witness, serial }) => {
    const row = rows.find((candidate) => candidate.id === id);
    const primary = row?.sourceRow?.transport?.primaryBuffer;
    if (!primary || primary.byteLength < 1) {
      fail(`Frozen STEP qualification row changed: ${id}`);
    }
    const { bytes } = verify(resolve(authorityLogicalPath, primary.path), primary.sha256, id);
    return {
      id,
      route,
      witness,
      serial,
      ingestUtf8: row.sourceRow.transport.ingestRequestUtf8,
      claimUtf8: row.authoredRequestUtf8,
      stepHex: bytes.toString('hex'),
    };
  });
};
const currentInputs = async (permits) => {
  const corpus = await joinCurrentCorpus(
    readFileSync(corpusPath),
    readFileSync(profilePath),
    'full-backend',
    readFileSync(successorPath),
  );
  const records = ids.map((id) => corpus.records.find((row) => row.id === id));
  if (records.some((row) => !row) || records[0].ingest.length === 0 || records[1].expectedCode === undefined) {
    fail('Frozen geometry/refusal selection changed');
  }
  return { permits, records, meshes: corpus.meshes, steps: currentSteps() };
};
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const fail = (message) => {
  throw new Error(message);
};
const argument = (name) => {
  const index = process.argv.indexOf(name);
  if (index === -1 || !process.argv[index + 1]) {
    fail(`Missing ${name}`);
  }
  return process.argv[index + 1];
};
const json = (path) => JSON.parse(readFileSync(path, 'utf8'));
const source = (path) => ({ path, bytes: readFileSync(path) });
const verify = (path, expected, label) => {
  const found = source(path);
  if (!/^[\da-f]{64}$/.test(expected) || sha(found.bytes) !== expected) {
    fail(`${label} SHA-256 mismatch`);
  }
  return found;
};
const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
// Every response in the graph, including 304 revalidations and the nested pthread worker script,
// needs the hosted isolation headers; WebKit refuses a revalidated module worker without COEP.
const isolationHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Resource-Policy': 'same-origin',
};

const nodeThreads = () => {
  if (process.platform === 'linux') {
    return readdirSync('/proc/self/task').length;
  }
  if (process.platform === 'darwin') {
    return (
      execFileSync('ps', ['-M', '-p', String(process.pid)], { encoding: 'utf8' })
        .trim()
        .split('\n').length - 1
    );
  }
  fail(`No process thread-count observer for ${process.platform}`);
};

const workerResult = async (data, hold = false) => {
  const worker = new Worker(new URL('mt-node-worker.mjs', import.meta.url), {
    workerData: data,
  });
  const result = await new Promise((resolve, reject) => {
    const workerTimeout = setTimeout(() => {
      reject(new Error('Node MT worker timed out'));
    }, 120_000);
    worker.once('error', (error) => {
      clearTimeout(workerTimeout);
      reject(error);
    });
    worker.on('message', (message) => {
      if (message.type === 'result' || message.type === 'error' || (data.stress && message.type === 'progress')) {
        clearTimeout(workerTimeout);
        if (message.type === 'error') {
          reject(new Error(message.error));
        } else {
          resolve(message);
        }
      }
    });
    worker.once('exit', (code) => {
      clearTimeout(workerTimeout);
      reject(new Error(`Node worker exited early: ${code}`));
    });
  }).catch(async (error) => {
    await worker.terminate();
    throw error;
  });
  if (hold) {
    return { worker, result };
  }
  const exitCode = await worker.terminate();
  if (exitCode === undefined) {
    fail('Node worker did not acknowledge termination');
  }
  return result;
};

/**
 * MT-only host rows on this (never ST-initialized) main thread. Shared memory grown off this thread leaves its
 * Emscripten views stale, so the row grows the captured memory from JS, which this thread cannot observe either,
 * then allocates an input larger than the whole pre-grow heap; it must reach the engine's own input-limit refusal.
 */
const mtOnlyHost = async ({ stModule, receiptPath, permits, step }) => {
  const execution = { variant: 'mt', permits, receipt: pathToFileURL(receiptPath).href };
  const rows = { canonicalize: false, allocationAfterGrowth: false, releaseAfterGrowth: false };
  const NativeMemory = WebAssembly.Memory;
  /** @type {WebAssembly.Memory | undefined} */
  let memory;
  const control = (value) => Buffer.from(JSON.stringify(value));
  const parsed = (bytes) => JSON.parse(Buffer.from(bytes).toString('utf8'));
  try {
    WebAssembly.Memory = function Memory(descriptor) {
      const created = new NativeMemory(descriptor);
      if (descriptor?.shared) {
        memory = created;
      }
      return created;
    };
    const binding = await import(pathToFileURL(stModule).href);
    await binding.initialize(undefined, execution);
    WebAssembly.Memory = NativeMemory;
    const vector = Buffer.from(' {"b": 1, "a": [1.0, 2e0, "x"]} ');
    rows.canonicalize = Buffer.from(binding.canonicalize(vector)).toString('utf8') === '{"a":[1,2,"x"],"b":1}';
    const oldBytes = memory.buffer.byteLength;
    memory.grow((oldBytes + 16_777_216) / 65_536);
    rows.growth = { oldBytes, newBytes: memory.buffer.byteLength };
    try {
      binding.canonicalize(new Uint8Array(oldBytes + 1_048_576).fill(0x20));
    } catch (error) {
      rows.allocationError = `${error?.name}: ${error?.message}`;
      rows.allocationAfterGrowth = error?.code === 'limit-exceeded' && error.message.includes('16 MiB input limit');
    }
    const { protocolVersion, registryVersion, canonicalProfile } = JSON.parse(step.ingestUtf8);
    const header = { protocolVersion, registryVersion, canonicalProfile };
    const engine = new binding.Engine(execution);
    try {
      const primary = Buffer.from(step.stepHex, 'hex');
      const { subjectHash } = parsed(engine.ingestSubject(Buffer.from(step.ingestUtf8), primary, [])).result.subject;
      const { subjectHandle } = parsed(
        engine.subjectHandle(control({ ...header, method: 'subjectHandle', requestId: 'h', subjectHash })),
      ).result;
      memory.grow(1024);
      const release = engine.releaseSubject(
        control({ ...header, method: 'releaseSubject', requestId: 'r', subjectHandle }),
      );
      rows.releaseAfterGrowth = parsed(release).result !== undefined;
    } finally {
      engine.close();
    }
  } catch (error) {
    rows.error = error?.stack ?? String(error);
  } finally {
    WebAssembly.Memory = NativeMemory;
  }
  return rows;
};

// Worker termination is asynchronous: Chromium takes seconds to close a worker and its nested pthread
// workers, so wait for every worker's close within a bound instead of sampling once.
/** Waits at most `deadline` milliseconds; `settled` reports the milliseconds waited. */
const settledWorkers = async (page, deadline = 10_000) => {
  const started = performance.now();
  while (page.workers().length > 0 && performance.now() - started < deadline) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- Poll until every worker closes or the bound expires.
    await page.waitForTimeout(100);
  }
  return { remaining: page.workers().length, settled: Math.round(performance.now() - started) };
};

const browserRun = async (type, { inputs, stModule, assets }) => {
  let browser;
  const runtime = { name: type.name(), supported: false };
  try {
    browser = await type.launch({ headless: true });
    runtime.version = browser.version();
    const page = await browser.newPage();
    const server = await createServer({
      configFile: false,
      root: browserRoot,
      appType: 'spa',
      logLevel: 'error',
      optimizeDeps: { noDiscovery: true, include: [] },
      resolve: {
        alias: [{ find: /^@taucad\/geospec-engine-native\/wasm$/, replacement: stModule }],
        conditions: ['browser', 'import', 'default'],
      },
      server: {
        host: '127.0.0.1',
        port: 0,
        hmr: false,
        headers: isolationHeaders,
        fs: { strict: true, allow: [browserRoot, dirname(stModule)] },
      },
      plugins: [
        {
          name: 'qualified-mt-candidate-assets',
          configureServer(dev) {
            dev.middlewares.use((_request, response, next) => {
              for (const [header, value] of Object.entries(isolationHeaders)) {
                response.setHeader(header, value);
              }
              next();
            });
            dev.middlewares.use('/@vite/client', (request, response, next) => {
              if (request.method !== 'GET') {
                next();
                return;
              }
              // The static qualification page must not open Vite's dev-only HMR WebSocket.
              response.setHeader('Content-Type', 'text/javascript; charset=utf-8');
              response.end(
                'export const injectQuery=(url,query)=>{if(!/^[./]/.test(url))return url;const path=url.replace(/[?#].*$/,""),u=new URL(url,"http://vite.dev");return path+"?"+query+(u.search?"&"+u.search.slice(1):"")+(u.hash||"")};export const createHotContext=()=>undefined;',
              );
            });
            dev.middlewares.use('/mt', (request, response, next) => {
              const name = request.url?.slice(1).split('?')[0];
              const bytes = assets.get(name);
              if (request.method !== 'GET' || !bytes) {
                next();
                return;
              }
              response.setHeader('Cache-Control', 'no-store');
              response.setHeader(
                'Content-Type',
                name.endsWith('.wasm')
                  ? 'application/wasm'
                  : name.endsWith('.mjs')
                    ? 'text/javascript; charset=utf-8'
                    : 'application/json; charset=utf-8',
              );
              response.end(bytes);
            });
          },
        },
      ],
    });
    try {
      await server.listen();
      const { origin } = new URL(server.resolvedUrls.local[0]);
      await page.goto(`${origin}/mt-app/`, { waitUntil: 'load' });
      runtime.isolated = await page.evaluate(
        () => globalThis.crossOriginIsolated && typeof SharedArrayBuffer !== 'undefined',
      );
      if (!runtime.isolated) {
        fail(`${runtime.name} is not cross-origin isolated`);
      }
      const launch = async (variant, permits, stress = false) =>
        page.evaluate(
          async ({ variant, permits, stress, inputs, origin }) => {
            const worker = new Worker('/mt-browser-worker.mjs', { type: 'module' });
            const id = Math.random();
            const message = await new Promise((resolve, reject) => {
              const browserWorkerTimeout = setTimeout(() => {
                reject(new Error('Browser MT worker timed out'));
              }, 120_000);
              worker.addEventListener('error', (error) => {
                clearTimeout(browserWorkerTimeout);
                reject(new Error(error.message));
              });
              worker.addEventListener('message', (event) => {
                if (event.data.id === id && (event.data.type !== 'progress' || stress)) {
                  clearTimeout(browserWorkerTimeout);
                  resolve(event.data);
                }
              });
              worker.postMessage({
                ...inputs,
                id,
                variant,
                stress,
                permits,
                receipt: `${origin}/mt/geospec_engine_native.mt.json`,
              });
            }).finally(() => {
              void worker.terminate();
            });
            return message;
          },
          { variant, permits, stress, inputs, origin },
        );
      const st = await launch('st', 1);
      if (st.type !== 'result') {
        fail(`${runtime.name} ST product refusal: ${st.error}`);
      }
      runtime.st = st.report;
      runtime.mt = {};
      runtime.resources = {};
      for (const width of [1, inputs.permits]) {
        // oxlint-disable-next-line eslint/no-await-in-loop -- Each width loads its own product instance in turn.
        const mt = await launch('mt', width);
        if (mt.type !== 'result') {
          fail(`${runtime.name} MT-${width} product refusal: ${mt.error}`);
        }
        runtime.mt[width] = mt.report;
        runtime.resources[width] = mt.resources;
      }
      const cancelled = await launch('mt', inputs.permits, true);
      if (cancelled.type !== 'progress') {
        fail(`${runtime.name} did not enter bounded MT geometry before cancellation`);
      }
      runtime.cancelledAfterIteration = cancelled.iteration;
      runtime.workers = await settledWorkers(page);
      runtime.workersRemaining = runtime.workers.remaining;
      runtime.supported = true;
    } finally {
      await server.close();
    }
  } catch (error) {
    runtime.error = error?.stack ?? String(error);
  } finally {
    await browser?.close();
  }
  return runtime;
};

// oxlint-disable-next-line eslint/complexity -- One fail-closed qualification gate combines product, host, and parity checks.
const main = async () => {
  const mtReceiptInput = argument('--mt-receipt');
  const stPackageInput = argument('--st-package');
  const outputInput = argument('--output');
  if (![mtReceiptInput, stPackageInput, outputInput].every((value) => isAbsolute(value))) {
    fail('MT receipt, ST package and output paths must be absolute');
  }
  const receiptPath = realpathSync(mtReceiptInput);
  if (basename(receiptPath) !== 'geospec_engine_native.mt.json') {
    fail('MT asset receipt filename is invalid');
  }
  const receipt = verify(receiptPath, argument('--mt-receipt-sha256'), 'MT asset receipt');
  const mt = JSON.parse(receipt.bytes);
  const product = dirname(receiptPath);
  const output = resolve(outputInput);
  if (dirname(output) === product || output.startsWith(product + '/')) {
    fail('Qualification output must be independent of the MT product');
  }
  if (existsSync(output)) {
    fail('Qualification output already exists; use a fresh explicit path');
  }
  const stRoot = realpathSync(stPackageInput);
  const stManifest = json(join(stRoot, 'package.json'));
  if (stManifest.name !== '@taucad/geospec-engine-native') {
    fail('ST package identity mismatch');
  }
  const stExport = stManifest.exports?.['./wasm'];
  if (stExport?.import !== './dist/wasm.mjs' || stExport?.default !== './dist/wasm.mjs') {
    fail('ST package does not export the independently pinned facade');
  }
  const stModule = realpathSync(join(stRoot, 'dist/wasm.mjs'));
  const stGlue = realpathSync(join(stRoot, 'dist/bindings/mixed-wasm/geospec_engine_native.mjs'));
  const stWasm = realpathSync(join(stRoot, 'dist/bindings/mixed-wasm/geospec_engine_native.wasm'));
  if (stManifest.imports?.['#mixed-wasm-binding'] !== './dist/bindings/mixed-wasm/geospec_engine_native.mjs') {
    fail('ST package does not resolve the independently pinned glue');
  }
  verify(stModule, argument('--st-module-sha256'), 'ST facade');
  verify(stGlue, argument('--st-glue-sha256'), 'ST glue');
  verify(stWasm, argument('--st-wasm-sha256'), 'ST WASM');
  if (mt.schema !== 'geospec-mixed-mt-assets-v1' || !Number.isSafeInteger(mt.permits) || mt.permits < 2) {
    fail('MT receipt needs a caller-inclusive permit budget of at least two for pthread proof');
  }
  const assets = new Map();
  for (const [field, name] of [
    ['buildReceipt', 'build-receipt.json'],
    ['glue', 'geospec_engine_native.mjs'],
    ['wasm', 'geospec_engine_native.wasm'],
    ['worker', 'geospec_engine_native.mjs'],
  ]) {
    const declared = mt[field];
    if (!record(declared) || declared.file !== name || !Number.isSafeInteger(declared.bytes) || declared.bytes < 1) {
      fail(`Invalid ${field}`);
    }
    const file = realpathSync(join(product, name));
    if (dirname(file) !== product) {
      fail(`MT asset escapes product: ${name}`);
    }
    const { bytes } = verify(file, declared.sha256, `MT ${field}`);
    if (bytes.length !== declared.bytes) {
      fail(`MT ${field} length mismatch`);
    }
    assets.set(name, bytes);
  }
  if (JSON.stringify(mt.worker) !== JSON.stringify(mt.glue)) {
    fail('MT pthread worker differs from glue');
  }
  assets.set('geospec_engine_native.mt.json', receipt.bytes);
  const build = JSON.parse(assets.get('build-receipt.json'));
  if (
    build.schema !== 'geospec-mixed-build-receipt-mt-v1' ||
    build.variant !== 'mt' ||
    build.mtSettings?.executionPermits !== mt.permits ||
    build.mtSettings?.poolSize !== mt.permits - 1 ||
    !/^[\da-f]{40}$/.test(build.sourceRevision) ||
    !isAbsolute(build.output)
  ) {
    fail('MT build identity mismatch');
  }
  for (const name of ['geospec_engine_native.mjs', 'geospec_engine_native.wasm']) {
    const bytes = assets.get(name);
    if (
      !build.artifacts?.some(
        (item) => item.path === join(build.output, name) && item.bytes === bytes.length && item.sha256 === sha(bytes),
      )
    ) {
      fail(`Build artifact mismatch: ${name}`);
    }
  }
  // Same source: the ST and MT products must come from one verified mixed input manifest.
  const stBuildPath = realpathSync(argument('--st-build-receipt'));
  const stBuild = JSON.parse(readFileSync(stBuildPath));
  const sameSource =
    stBuild.schema === 'geospec-mixed-build-receipt-v2' &&
    stBuild.manifestSha256 === build.manifestSha256 &&
    [stGlue, stWasm].every((path) => {
      const bytes = readFileSync(path);
      return stBuild.artifacts?.some((item) => item.bytes === bytes.length && item.sha256 === sha(bytes));
    });
  const inputs = await currentInputs(mt.permits);
  const { records, steps } = inputs;
  const rowCount = records.length + steps.length;
  // ST, MT at grant 1 and MT at the product cap; each is its own worker and product instance.
  const widths = [1, mt.permits];
  const workerData = { stModule, mtReceipt: receiptPath, ...inputs };
  const before = nodeThreads();
  const held = [];
  const threads = { before };
  try {
    held.push(await workerResult({ ...workerData, variant: 'st' }, true));
    threads.st = nodeThreads();
    for (const width of widths) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- Thread deltas are read after each held worker settles.
      held.push(await workerResult({ ...workerData, variant: 'mt', permits: width }, true));
      threads[`mt${width}`] = nodeThreads();
    }
  } finally {
    await Promise.all(held.map(({ worker }) => worker.terminate()));
  }
  if (held.length !== widths.length + 1) {
    fail('Node ST/MT workers did not all complete');
  }
  threads.after = nodeThreads();
  const cancellation = await workerResult({ ...workerData, variant: 'mt', stress: true });
  threads.afterCancel = nodeThreads();
  const mtOnly = await mtOnlyHost({
    stModule,
    receiptPath,
    permits: mt.permits,
    step: steps.find(({ route }) => route === 'report-mesh'),
  });
  const [stReport, ...mtReports] = held.map(({ result }) => result.report);
  const node = {
    version: process.version,
    platform: process.platform,
    stReport,
    mtReports: Object.fromEntries(widths.map((width, index) => [width, mtReports[index]])),
    memory: held.map(({ result }) => result.memory),
    threads,
    cancellation,
    mtOnly,
  };
  const browsers = [];
  for (const type of [chromium, firefox, webkit]) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- Browser qualification runs are isolated and serialized.
    browsers.push(await browserRun(type, { inputs, stModule, assets }));
  }
  const same = (a, b) =>
    JSON.stringify(a?.results) === JSON.stringify(b?.results) && a?.closed === rowCount && b?.closed === rowCount;
  const counters = (result) => JSON.parse(result.observationsUtf8).physical;
  const verdict = (result) => JSON.parse(result.canonicalUtf8).result?.results?.[0]?.status;
  const semantic =
    records.every((row, index) => {
      const result = stReport.results[index];
      return (
        result.id === row.id &&
        (row.expectedCode
          ? result.status === 'refusal' && result.code === row.expectedCode
          : result.status === 'success')
      );
    }) &&
    // Every STEP row reaches a geometric verdict, and witnessed rows prove they reached their route.
    steps.every((row, index) => {
      const result = stReport.results[records.length + index];
      return (
        result.id === row.id &&
        result.status === 'success' &&
        ['passed', 'failed'].includes(verdict(result)) &&
        (row.witness === undefined ||
          (row.witness.counter === undefined
            ? result.canonicalUtf8.includes(row.witness.marker)
            : counters(result)[row.witness.counter] !== '0'))
      );
    });
  const checks = {
    nodePthreads:
      // Each held MT worker adds one Node worker plus the product's (permits - 1) pthread pool.
      widths.every((width, index) => {
        const delta = threads[`mt${width}`] - (index === 0 ? threads.st : threads[`mt${widths[index - 1]}`]);
        return delta >= mt.permits && delta <= Number(mt.permits) + 1;
      }) &&
      threads.after <= before &&
      threads.afterCancel <= before &&
      cancellation.type === 'progress',
    browserPthreads: browsers.every(
      (b) =>
        b.supported &&
        b.isolated &&
        widths.every(
          (width) =>
            b.resources?.[width]?.pthreadWorkersCreated === mt.permits - 1 &&
            b.resources?.[width]?.pthreadWorkersActive === mt.permits - 1,
        ) &&
        b.workersRemaining === 0,
    ),
    stParity:
      semantic &&
      mtReports.every((report) => same(stReport, report)) &&
      browsers.every(
        (b) => b.supported && same(stReport, b.st) && widths.every((width) => same(stReport, b.mt?.[width])),
      ),
    sameSource,
    mtOnlyHost: mtOnly.canonicalize && mtOnly.allocationAfterGrowth && mtOnly.releaseAfterGrowth,
  };
  const evidence = {
    schema: 'geospec-mt-qualification-evidence-v1',
    sourceRevision: build.sourceRevision,
    mtReceipt: { path: receiptPath, sha256: sha(receipt.bytes) },
    stProduct: {
      root: stRoot,
      moduleSha256: sha(readFileSync(stModule)),
      glueSha256: sha(readFileSync(stGlue)),
      wasmSha256: sha(readFileSync(stWasm)),
    },
    corpus: {
      path: corpusPath,
      sha256: sha(readFileSync(corpusPath)),
      profileSha256: sha(readFileSync(profilePath)),
      successorSha256: sha(readFileSync(successorPath)),
      ids,
      stepAuthoritySha256: basename(authorityPath),
      steps: steps.map(({ id, route, serial }) => ({ id, route, ...(serial === undefined ? {} : { serial }) })),
    },
    stBuildReceipt: { path: stBuildPath, sha256: sha(readFileSync(stBuildPath)) },
    widths,
    node,
    browsers,
    checks,
  };
  await mkdir(dirname(output), { recursive: true });
  writeFileSync(output + '.evidence.json', JSON.stringify(evidence, null, 2) + '\n');
  if (!Object.values(checks).every(Boolean)) {
    fail(`MT qualification refused; inspect ${output}.evidence.json`);
  }
  const qualification = {
    schema: 'geospec-mt-qualification-v1',
    verdict: 'passed',
    permits: mt.permits,
    widths,
    node: process.version,
    browsers: browsers.map(({ name, version }) => ({ name, version })),
    assetReceiptSha256: sha(receipt.bytes),
    stBuildReceiptSha256: sha(readFileSync(stBuildPath)),
    buildReceiptSha256: sha(assets.get('build-receipt.json')),
    sourceRevision: build.sourceRevision,
    corpusRecordIds: [...ids, ...steps.map(({ id }) => id)],
    checks,
    evidenceSha256: sha(readFileSync(output + '.evidence.json')),
  };
  writeFileSync(output, JSON.stringify(qualification, null, 2) + '\n', { flag: 'wx' });
  process.stdout.write(`Qualified MT product: ${output}\n`);
};

try {
  // oxlint-disable-next-line unicorn/prefer-top-level-await -- The selected async entrypoint is caught below.
  await main();
} catch (error) {
  process.stderr.write(`${error?.stack ?? String(error)}\n`);
  process.exitCode = 1;
}
