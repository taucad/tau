#!/usr/bin/env node
/**
 * Open-to-frame timeline: project open → geometry in the scene → framed, on the
 * desktop shell and in the browser, written as tagged JSONL (charter S0/D14).
 *
 * Promoted from the L10 research lane's `open-to-frame.mjs`
 * (`out/research/realtime-cad-performance-charter/2026-09-16-exploration/L10-measurement-harness/`,
 * 2026-09-16). Every guard below is one of that lane's findings, kept because
 * removing it silently produces nonsense rather than an error:
 *
 * * **Private client root (F-L10-C).** `apps/ui/desktop/build/client` is a shared
 *   singleton that any peer `ui` build empties mid-run (`tools/build-lock.mjs`).
 *   Unpackaged runs require `TAU_DESKTOP_CLIENT_ROOT` to point at a private
 *   copy; packaged runs hash the bundled client. Every sample records the
 *   payload digest before and after.
 * * **No `page.goto` before the shell's own bootstrap load resolves.** The abort
 *   is fatal (`[desktop] bootstrap failed ERR_ABORTED`) and quits the app; wait
 *   for the shell's first navigation, then drive it.
 * * **rAF throttling (F-L10-A).** An occluded or unfocused Electron window ticks
 *   at ~2 fps and every span becomes noise, so the backgrounding switches are
 *   passed and the observed frame rate is recorded with each sample.
 * * **Mark reset at `openIntent` (F-L10-B).** Home renders its own viewer; marks
 *   stamped before the intent belong to that viewer, not to the project open.
 * * The seeding path is the product's own: `a[href="/projects/new"]` →
 *   `button[role="radio"]#<kernelId>` (the bare `#jscad` is a strict-mode
 *   violation — an SVG `<symbol>` shares the id) → `input#project-name` →
 *   `Create Project`. A measured project is seeded on disk instead, because the
 *   form creates an empty stub that renders nothing.
 *
 * Usage:
 *   TAU_DESKTOP_CLIENT_ROOT=<private copy of apps/ui/desktop/build/client> \
 *   node apps/ui-e2e/src/support/open-to-frame.ts desktop jscad 3 [base-url] [cold|home|restart-warm|link-intent]
 *   node apps/ui-e2e/src/support/open-to-frame.ts browser jscad 3 http://127.0.0.1:3110 [cold|home]
 *   node apps/ui-e2e/src/support/open-to-frame.ts browser replicad 5 http://127.0.0.1:61901 reference-cold [tray|birdhouse|honeycomb] [webgl|webgpu]
 *
 * Environment:
 *   TAU_DESKTOP_CLIENT_ROOT      Required for unpackaged desktop runs; packaged runs hash their bundled client.
 *   TAU_E2E_DESKTOP_EXECUTABLE   Packaged Tau executable for budget-eligible desktop samples.
 *   TAU_MEASUREMENT_CONTENTION   `quiet` or `contended`; recorded as an operator
 *                                statement instead of the load-average derivation.
 *   TAU_MEASUREMENT_BUILD        `production` (default) or `development`.
 *   TAU_OPEN_TO_FRAME_OUT        Output directory (default `out/test-results/open-to-frame`).
 *   TAU_MEASUREMENT_OBSERVE_SPANS `1` includes selected-producer action-window diagnostics;
 *                                these do not qualify critical-path attribution.
 */
/* eslint-disable @nx/enforce-module-boundaries -- executable driver imports source projects before package install. */
import { createHash, randomInt } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { cpus, loadavg, tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import process from 'node:process';
import { setTimeout as wait } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { _electron as electron, chromium } from 'playwright';
import type { Page, Request } from 'playwright';
// oxlint-disable-next-line no-restricted-imports -- one owner for the measurement contract both harnesses answer to.
import { budgetVerdict, readContention, rendererAngle } from '../../../runtime-e2e/src/benchmarks/measurement-tags.ts';
// oxlint-disable-next-line no-restricted-imports -- same owner, type only.
import type { MeasurementTags } from '../../../runtime-e2e/src/benchmarks/measurement-tags.ts';
// oxlint-disable-next-line no-restricted-imports -- same owner: the trace both harnesses name in their tags.
import { mergeRuntimeTrace } from '../../../runtime-e2e/src/benchmarks/runtime-trace.ts';
// oxlint-disable-next-line no-restricted-imports -- same owner, type only.
import type { RuntimeTraceSummary } from '../../../runtime-e2e/src/benchmarks/runtime-trace.ts';
// oxlint-disable-next-line no-restricted-imports -- executable driver: no package alias before install.
import { classifyWebGpuAdapter } from './webgpu-profile.ts';
// oxlint-disable no-restricted-imports -- executable driver runs directly in Node without the test aliases.
import {
  epochForRelativeMarks,
  observedKernelSelection,
  observedReplicadLoadedWasm,
  observedReplicadNativeVariant,
  observedRuntimeWindow,
} from './open-to-frame-observation.ts';
// oxlint-enable no-restricted-imports

type Host = 'browser' | 'desktop';
type Scenario = 'cold' | 'home' | 'restart-warm' | 'link-intent' | 'reference-cold';
type ReferenceName = 'tray' | 'birdhouse' | 'honeycomb';
type ReferenceBackend = 'webgl' | 'webgpu';

/** Steps of one open-to-frame sample, in the order they are stamped. */
type Timeline = Readonly<Record<string, number>>;

type PageTimeline = Readonly<{
  backend: string | undefined;
  crossOriginIsolated: boolean;
  rafTicks: number;
  framesPerSecond: number;
  marks: Timeline;
  marksEpochMilliseconds: number | undefined;
  longTaskCount: number;
  workerNames: readonly string[];
  renderer: Readonly<{ api: 'webgl' | 'webgpu'; name: string; frame: number }> | undefined;
}>;

type FrameWitness = Readonly<{
  /** PNG readback follows an active viewport frame; compositor presentation is unmeasured. */
  screenshot: string;
  sha256: string;
  componentIds: readonly string[];
  visibleMeshes: number;
  rendererFrame: number;
  modelPixelDifference: number;
  backend: 'webgl' | 'webgpu' | undefined;
  framed: boolean;
  viewport: readonly number[];
  dpr: number;
  canvas: readonly number[];
}>;

const repoRoot = resolve(import.meta.dirname, '../../../..');
const hostArgument = process.argv[2] ?? 'desktop';
const host: Host = hostArgument === 'browser' ? 'browser' : 'desktop';
const kernelId = process.argv[3] ?? 'jscad';
const repeats = Number(process.argv[4] ?? 3);
const referenceStructuralProbe = process.env['TAU_OPEN_TO_FRAME_NATIVE_STRUCTURAL_PROBE'] === '1';
if (!Number.isSafeInteger(repeats) || repeats < (referenceStructuralProbe ? 1 : 2)) {
  throw new Error('Repeat count must be an integer of at least two for a variation verdict.');
}
const baseUrl = process.argv[5] ?? 'http://127.0.0.1:3110';
const scenarioArgument = process.argv[6] ?? 'cold';
if (
  scenarioArgument !== 'cold' &&
  scenarioArgument !== 'home' &&
  scenarioArgument !== 'restart-warm' &&
  scenarioArgument !== 'link-intent' &&
  scenarioArgument !== 'reference-cold'
) {
  throw new Error(
    `Scenario must be cold, home, restart-warm, link-intent or reference-cold; received '${scenarioArgument}'.`,
  );
}
const scenario: Scenario = scenarioArgument;
if (referenceStructuralProbe && scenario !== 'reference-cold') {
  throw new Error('The native structural probe is only available for reference-cold.');
}
const referenceName = process.argv[7];
const referenceBackend = process.argv[8] as ReferenceBackend | undefined;
if (
  scenario === 'reference-cold' &&
  (host !== 'browser' ||
    kernelId !== 'replicad' ||
    repeats !== (referenceStructuralProbe ? 1 : 5) ||
    (referenceName !== 'tray' && referenceName !== 'birdhouse' && referenceName !== 'honeycomb') ||
    (referenceBackend !== 'webgl' && referenceBackend !== 'webgpu'))
) {
  throw new Error(
    `reference-cold requires browser replicad ${referenceStructuralProbe ? '1 structural probe' : '5'} [base-url] reference-cold [tray|birdhouse|honeycomb] [webgl|webgpu].`,
  );
}
if (scenario === 'restart-warm' && host !== 'desktop') {
  throw new Error('restart-warm requires the desktop host with a persistent user-data profile.');
}
if (scenario === 'link-intent' && host !== 'desktop') {
  throw new Error('link-intent requires the desktop host: only it seeds a project visible from Home.');
}
const scenarioSuffix =
  scenario === 'cold'
    ? ''
    : scenario === 'reference-cold'
      ? `-${scenario}-${referenceName}-${referenceBackend}${referenceStructuralProbe ? '-structural-probe' : ''}`
      : `-${scenario}`;
const origin = host === 'desktop' ? 'app://tau' : baseUrl;
const outputDirectory = process.env['TAU_OPEN_TO_FRAME_OUT'] ?? join(repoRoot, 'out/test-results/open-to-frame');
const clientRoot = process.env['TAU_DESKTOP_CLIENT_ROOT'];
const desktopExecutable = process.env['TAU_E2E_DESKTOP_EXECUTABLE'];
const rendererRoot =
  desktopExecutable === undefined ? clientRoot : resolve(dirname(desktopExecutable), '../Resources/ui/client');

/**
 * Non-trivial fixtures from `libs/tau-examples`, one per kernel (charter OQ-P10).
 * No `.tau/cache` is seeded: every cold sample starts with an empty compute,
 * geometry and parameter cache.
 */
const examples: Readonly<Record<string, readonly [string, string]>> = {
  jscad: ['jscad/gear', 'main.ts'],
  replicad: ['replicad/bottle', 'main.ts'],
  picogk: ['picogk/parameterized-sphere', 'main.cs'],
  build123d: ['build123d/v8-engine-brep', 'main.py'],
};

const referenceFixtures: Readonly<
  Record<ReferenceName, Readonly<{ route: string; source: string; bytes: number; sha256: string }>>
> = {
  tray: {
    route: '/__e2e/example-fixture?locator=replicad.tray',
    source: 'libs/tau-examples/src/kernels/replicad/tray/main.ts',
    bytes: 1732,
    sha256: '01219b9077985715827d327bdc9821ad5a534cb755237527ff4ca5980b0f20c6',
  },
  birdhouse: {
    route: '/__e2e/example-fixture?locator=replicad.birdhouse',
    source: 'libs/tau-examples/src/kernels/replicad/birdhouse/main.ts',
    bytes: 2121,
    sha256: '8a421459a81972d10b391445ad0dc2d1879c8f2a3bea014d819e78343381238e',
  },
  honeycomb: {
    route: '/__e2e/project-file-tree?main=honeycomb',
    source: 'apps/ui/app/routes/[__e2e].project-file-tree/route.tsx#honeycombModel',
    bytes: 347,
    sha256: '9433c7f5d9d2f2bc521efddeb71e25488ee906e4f888c39b82aa7677abb2806b',
  },
};
const referenceFixture = scenario === 'reference-cold' ? referenceFixtures[referenceName as ReferenceName] : undefined;
const referenceNativeTreatment = 'custom';
const referenceAssetPins = [
  {
    name: 'replicad_single.wasm',
    sha256: '9eecb79da12acf0c6270d36548feb6595191640d87bb7f7931e90da12262ccc9',
    bytes: 23_000_363,
  },
  {
    name: 'replicad_single.mjs',
    sha256: 'cfc514722fddc9295b93da66c9ceca8627edcf22edf463db5fd316d4bb155e27',
    bytes: 60_437,
  },
] as const;
if (referenceFixture) {
  const sourceFile = referenceFixture.source.split('#')[0]!;
  const source = await readFile(join(repoRoot, sourceFile), 'utf8');
  const logicalSource =
    referenceName === 'honeycomb'
      ? /const honeycombModel = `(?<body>[\s\S]*?)`;/u.exec(source)?.groups?.['body']
      : source;
  if (
    logicalSource === undefined ||
    Buffer.byteLength(logicalSource) !== referenceFixture.bytes ||
    createHash('sha256').update(logicalSource).digest('hex') !== referenceFixture.sha256
  ) {
    throw new Error('The selected reference source no longer matches its canonical byte pin.');
  }
}

const launchArguments = [
  '--enable-unsafe-webgpu',
  '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding',
  '--disable-background-timer-throttling',
];

const launchDesktop = async (userData: string, picked: string) => {
  const inheritedEnvironment = { ...process.env };
  if (desktopExecutable !== undefined) {
    delete inheritedEnvironment['NODE_OPTIONS'];
    delete inheritedEnvironment['NODE_PATH'];
    delete inheritedEnvironment['TAU_BUILD123D_RESOURCE_ROOT'];
    delete inheritedEnvironment['TAU_DESKTOP_CLIENT_ROOT'];
    delete inheritedEnvironment['TAU_PICOGK_RESOURCE_ROOT'];
  }
  return electron.launch({
    args: [
      ...(desktopExecutable === undefined ? [join(repoRoot, 'apps/desktop')] : []),
      `--user-data-dir=${userData}`,
      ...launchArguments,
    ],
    ...(desktopExecutable === undefined ? {} : { executablePath: desktopExecutable }),
    cwd: desktopExecutable === undefined ? join(repoRoot, 'apps/desktop') : userData,
    /* eslint-disable @typescript-eslint/naming-convention -- environment variables are SCREAMING_SNAKE_CASE. */
    env: {
      ...inheritedEnvironment,
      NODE_ENV: 'production',
      TAU_DEBUG: 'true',
      ...(desktopExecutable === undefined ? { TAU_DESKTOP_CLIENT_ROOT: clientRoot! } : {}),
      TAU_E2E_PICK_DIRECTORY: picked,
      TAU_E2E_HIDE_WINDOW: '1',
      TAU_CONFIG_DIR: join(userData, 'config'),
      TAU_SECRET_VAULT: 'file',
    },
    /* eslint-enable @typescript-eslint/naming-convention -- environment scope ends here. */
  });
};

const closeDesktop = async (application: Awaited<ReturnType<typeof electron.launch>> | undefined): Promise<void> => {
  if (application === undefined) {
    return;
  }
  const child = application.process();
  const exited =
    child.exitCode === null && child.signalCode === null
      ? new Promise<void>((resolve) => {
          child.once('exit', () => {
            resolve();
          });
        })
      : Promise.resolve();
  const closeTimeout = new AbortController();
  try {
    await Promise.race([
      application
        .evaluate(({ app }) => {
          app.exit(0);
        })
        .catch(() => undefined),
      wait(5000, undefined, { signal: closeTimeout.signal }).catch(() => undefined),
    ]);
  } finally {
    closeTimeout.abort();
  }
  if (child.exitCode === null && child.signalCode === null) {
    child.kill('SIGKILL');
  }
  await exited;
};

const hashFile = async (path: string): Promise<string> => {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) {
    hash.update(chunk as Uint8Array<ArrayBuffer>);
  }
  return hash.digest('hex');
};

const desktopBinarySha256 = desktopExecutable === undefined ? undefined : await hashFile(desktopExecutable);

/**
 * `projectIdSchema` is `/^proj_[\dA-Za-z]{21}$/` (`libs/types/src/schemas/project-manifest.schema.ts:9`).
 * A manifest whose only defect is its id is not rejected — it becomes
 * *adoptable*, so the project is listed with an **Adopt** button and cannot be
 * opened at all. That single token cost L10 six samples (finding F-L10-6).
 */
const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const projectId = (): string =>
  `proj_${Array.from({ length: 21 }, () => alphabet[randomInt(alphabet.length)]).join('')}`;

const seedProject = async (
  userData: string,
  slug: string,
): Promise<{ example: string; entry: string; id: string; sourceSha256: string }> => {
  const [example, entry] = examples[kernelId] ?? examples['jscad']!;
  const directory = join(userData, 'home', slug);
  const id = projectId();
  const source = await readFile(join(repoRoot, 'libs/tau-examples/src/kernels', example, entry));
  await mkdir(join(directory, '.tau', 'parameters'), { recursive: true });
  await copyFile(join(repoRoot, 'libs/tau-examples/src/kernels', example, entry), join(directory, entry));
  await writeFile(
    join(directory, 'tau.json'),
    JSON.stringify(
      {
        $schema: 'https://tau.new/schemas/tau-schema-v1.json',
        id,
        name: slug,
        description: '',
        tags: [],
        assets: { main: { entryPath: entry } },
      },
      undefined,
      2,
    ),
  );
  await writeFile(
    join(directory, '.tau', 'parameters', `${entry}.json`),
    JSON.stringify({ activeGroup: 'default', groups: { default: { values: {} } } }),
  );
  return { example, entry, id, sourceSha256: createHash('sha256').update(source).digest('hex') };
};

/**
 * Injected into every document. Closure-free on purpose: Playwright serializes
 * it, and a `Create Project` submit is a real navigation that destroys anything
 * only evaluated into the previous document.
 *
 * It also seeds the two preferences a fresh `--user-data-dir` has no value for.
 * `tauDebug` mounts the viewer test bridge. **`tau-cad-kernel` decides which
 * kernel runs** — L10 finding F-L10-10: the active kernel comes from that
 * preference (`apps/ui/app/hooks/use-kernel.tsx:7,16`, stored by `use-cookie.ts`
 * in `localStorage` despite the name, under `metaConfig.cookiePrefix` + the
 * name), defaults to `openscad`, and is *not* derived from the project on disk.
 * Seeding files alone produces an OpenSCAD row for every kernel.
 */
const instrument = (activeKernel: string): void => {
  type State = {
    rafTicks: number;
    marks: Record<string, number>;
    start: number;
    longTasks: number;
    workers: string[];
    backend: string | undefined;
    polling: boolean;
    reset(): void;
  };
  const scope = globalThis as typeof globalThis & { __TAU_OPEN_TO_FRAME__?: State };
  try {
    localStorage.setItem('tau:flags', JSON.stringify({ tauDebug: true }));
    /* `use-cookie.ts` prefixes every preference with `metaConfig.cookiePrefix` (`tau-`), so the
     * bare name this harness used to write was read by nothing and every kernel measured OpenSCAD.
     * Both shapes on purpose: localStorage is where HEAD stores it, and an older client build reads
     * the legacy cookie of the same (prefixed) name. */
    localStorage.setItem('tau-cad-kernel', JSON.stringify(activeKernel));
    // oxlint-disable-next-line no-document-cookie -- the product's own cookie shape is the thing under test; a library would not reproduce it.
    document.cookie = `tau-cad-kernel=${encodeURIComponent(JSON.stringify(activeKernel))}; path=/`;
  } catch {
    // A private context without storage still measures; only the bridge is lost.
  }
  const state: State = scope.__TAU_OPEN_TO_FRAME__ ?? {
    rafTicks: 0,
    marks: {},
    start: performance.now(),
    longTasks: 0,
    workers: [],
    backend: undefined,
    polling: false,
    reset() {
      this.rafTicks = 0;
      this.marks = {};
      this.start = performance.now();
      this.backend = undefined;
    },
  };
  scope.__TAU_OPEN_TO_FRAME__ = state;
  if (state.polling) {
    return;
  }
  state.polling = true;
  const nativeWorker = globalThis.Worker;
  globalThis.Worker = class extends nativeWorker {
    public constructor(scriptUrl: string | URL, options?: WorkerOptions) {
      super(scriptUrl, options);
      state.workers.push(options?.name ?? String(scriptUrl));
    }
  };
  const stamp = (name: string): void => {
    state.marks[name] ??= Math.round((performance.now() - state.start) * 10) / 10;
  };
  const poll = (): void => {
    state.rafTicks += 1;
    const bridge = (
      globalThis as {
        __TAU_SECTION_VIEW_TEST__?: {
          getModelComponents(): readonly unknown[];
          isGeometryFramed(): boolean;
          getGraphicsBackend(): string;
        };
      }
    ).__TAU_SECTION_VIEW_TEST__;
    if (bridge) {
      stamp('bridgeReady');
      try {
        if (bridge.getModelComponents().length > 0) {
          stamp('geometryInScene');
        }
        if (bridge.isGeometryFramed()) {
          stamp('geometryFramed');
          state.backend ??= bridge.getGraphicsBackend();
        }
      } catch {
        // The bridge unmounts during teardown; the marks already taken stand.
      }
    }
    requestAnimationFrame(poll);
  };
  requestAnimationFrame(poll);
  try {
    new PerformanceObserver((entries) => {
      state.longTasks += entries.getEntries().length;
    }).observe({ type: 'longtask', buffered: true });
  } catch {
    // Long Tasks is unavailable in this browser; the count stays zero.
  }
};

const readPageTimeline = async (page: Page): Promise<PageTimeline> =>
  page.evaluate(() => {
    const state = (
      globalThis as typeof globalThis & {
        __TAU_OPEN_TO_FRAME__?: {
          rafTicks: number;
          marks: Record<string, number>;
          start: number;
          longTasks: number;
          workers: string[];
          backend: string | undefined;
        };
      }
    ).__TAU_OPEN_TO_FRAME__;
    const elapsed = state ? performance.now() - state.start : 0;
    const bridge = (globalThis as { __TAU_SECTION_VIEW_TEST__?: { getRendererIdentity(): PageTimeline['renderer'] } })
      .__TAU_SECTION_VIEW_TEST__;
    return {
      backend: state?.backend,
      crossOriginIsolated: globalThis.crossOriginIsolated,
      rafTicks: state?.rafTicks ?? 0,
      framesPerSecond: elapsed > 0 ? Math.round(((state?.rafTicks ?? 0) / (elapsed / 1000)) * 10) / 10 : 0,
      marks: { ...state?.marks },
      marksEpochMilliseconds: state === undefined ? undefined : Date.now() - performance.now() + state.start,
      longTaskCount: state?.longTasks ?? 0,
      workerNames: [...new Set(state?.workers ?? [])],
      renderer: bridge?.getRendererIdentity(),
    };
  });

/** Hash the entire renderer payload, including chunks that index.html references indirectly. */
const digestOf = async (path: string): Promise<string> => {
  const hash = createHash('sha256');
  const entries = await readdir(path, { recursive: true, withFileTypes: true });
  if (entries.some((entry) => entry.isSymbolicLink())) {
    throw new Error(`Renderer payload contains a symlink; full content provenance cannot be hashed: ${path}`);
  }
  const files = entries
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name))
    .sort();
  for (const file of files) {
    hash.update(relative(path, file)).update('\0');
    // oxlint-disable-next-line no-await-in-loop -- The file order is part of the content digest.
    for await (const chunk of createReadStream(file)) {
      hash.update(chunk as Uint8Array<ArrayBuffer>);
    }
    hash.update('\0');
  }
  return hash.digest('hex');
};

/** Coefficient of variation of the cold open-to-geometry durations. */
const coefficientOfVariation = (values: readonly number[]): number | undefined => {
  if (values.length < 2) {
    return undefined;
  }
  const mean = values.reduce((total, value) => total + value, 0) / values.length;
  if (mean === 0) {
    return 0;
  }
  return Math.sqrt(values.reduce((total, value) => total + (value - mean) ** 2, 0) / values.length) / mean;
};

/**
 * The selected kernel from its render trace, with a backend only when the
 * host's engine record independently names the same kernel. A desktop fork
 * logs its resident OpenRSCAD engine even when it later renders JSCAD; that
 * record cannot qualify JSCAD's variant or process identity.
 */
const observedEngine = async (
  traceFile: string | undefined,
  mainProcessLog: readonly string[] | undefined,
): Promise<string | undefined> => {
  if (traceFile === undefined) {
    return undefined;
  }
  const kernel = await observedKernelSelection(traceFile);
  if (kernel === undefined) {
    return undefined;
  }
  /* JSCAD's selected kernel executes @jscad/modeling as JavaScript and has no WASM variant. */
  if (kernel === 'jscad') {
    return 'jscad:none';
  }
  /* The host log names whichever engine the fork loaded — a desktop fork loads its resident native
   * engine whatever the render then selects — so it may only qualify the kernel the trace names. */
  const engineLine = mainProcessLog?.findLast((entry) => entry.includes(`"kernelId":"${kernel}"`));
  const backend = /"backend":"(?<backend>[^"]+)"/u.exec(engineLine ?? '')?.groups?.['backend'];
  return `${kernel}:${backend ?? 'unobserved'}`;
};

const tagsFor = (
  page: PageTimeline | undefined,
  kernelPid: number | undefined,
  observed: {
    readonly engine: string | undefined;
    readonly trace: RuntimeTraceSummary | undefined;
    readonly contention: MeasurementTags['contention'];
  },
): MeasurementTags => ({
  build: process.env['TAU_MEASUREMENT_BUILD'] === 'development' ? 'development' : 'production',
  wasmVariant: observed.engine ?? `${kernelId}:unobserved`,
  adapter: {
    api: page?.renderer?.api ?? (page?.backend === 'webgpu' ? 'webgpu' : 'webgl'),
    angle: rendererAngle(launchArguments),
    name: page?.renderer?.name ?? '',
    implementation: classifyWebGpuAdapter({
      architecture: '',
      description: page?.renderer?.name ?? '',
      device: '',
      fallback: undefined,
      vendor: '',
    }),
  },
  ...(observed.trace === undefined ? {} : { runtimeTraceJsonl: observed.trace.file }),
  /* The selected utility's trace origin supplies its PID; the desktop main PID is not a substitute. */
  kernelProcess:
    host === 'desktop'
      ? { kind: 'utility', role: 'electron kernel fork', pid: kernelPid }
      : { kind: 'worker', role: page?.workerNames.length ? page.workerNames.join(',') : 'unobserved' },
  crossOriginIsolated: page?.crossOriginIsolated,
  contention: observed.contention,
});

/**
 * Why this sample may not become a number, or `undefined` when it may.
 *
 * Ordered so the most specific cause wins. L10's close-out showed why each one
 * has to be named rather than inferred from a missing mark: ten desktop samples
 * produced zero valid rows, and the three causes were indistinguishable from
 * "slow machine" without this.
 */
// oxlint-disable-next-line complexity -- Each independent sample refusal retains its own cause.
const sampleVerdict = (input: {
  readonly marks: Record<string, number>;
  readonly projectUrl: string | undefined;
  readonly slug: string;
  readonly timeline: PageTimeline | undefined;
  readonly consoleErrors: readonly string[];
  readonly pageText: string;
  readonly mainProcessLog: readonly string[] | undefined;
  readonly engine: string | undefined;
  readonly frameWitness: FrameWitness | undefined;
  readonly homeWitness: Readonly<{ screenshot: string; sha256: string }> | undefined;
  readonly appIsPackaged: boolean | undefined;
  readonly sampleError: string | undefined;
}): string | undefined => {
  const {
    marks,
    projectUrl,
    slug,
    timeline,
    consoleErrors,
    pageText,
    mainProcessLog,
    engine,
    frameWitness,
    homeWitness,
    appIsPackaged,
    sampleError,
  } = input;
  if (host === 'desktop' && appIsPackaged !== true) {
    return 'desktop sample did not run a packaged Electron app';
  }
  if (scenario !== 'home' && projectUrl !== undefined && !projectUrl.includes(referenceFixture?.route ?? slug)) {
    /* L10 timed one sample that had silently opened a different project. */
    return `opened ${projectUrl} instead of the seeded project ${slug}`;
  }
  if (pageText.includes('needs a Tau identity')) {
    return 'the seeded manifest was adoptable, not openable — check the project id against projectIdSchema';
  }
  const refusal = [...consoleErrors, pageText].find((text) => text.includes('copy-only wire'));
  if (refusal !== undefined) {
    return `the host refused the render on the copy-only filesystem wire: ${refusal.slice(0, 200)}`;
  }
  /* The host can take the wire down instead of reporting it in the page. */
  const exits = (mainProcessLog ?? []).filter((line) => line.includes('utility.exit'));
  if (exits.length > 0) {
    return `the desktop host's utility process exited ${exits.length}x during the sample: ${exits.at(-1)?.slice(0, 120)}`;
  }
  const channelClosed = consoleErrors.find((text) => text.includes('filesystem channel is closed'));
  if (channelClosed !== undefined) {
    return `the renderer lost the node filesystem channel: ${channelClosed.slice(0, 200)}`;
  }
  if (scenario === 'home') {
    return homeWitness === undefined ? (sampleError ?? 'Home pixels were not captured') : undefined;
  }
  if (timeline !== undefined && timeline.marks['bridgeReady'] === undefined) {
    return 'the viewer never mounted its test bridge, so no frame could be observed';
  }
  if (marks['geometryInScene'] === undefined) {
    return sampleError ?? 'geometry never reached the scene';
  }
  if (frameWitness === undefined) {
    return 'current-model viewport pixels were not captured after an active renderer frame';
  }
  if (referenceFixture && sampleError !== undefined) {
    return sampleError;
  }
  if (referenceFixture && (timeline?.renderer?.api !== referenceBackend || timeline?.backend !== referenceBackend)) {
    return 'the selected reference backend was not the active renderer';
  }
  if (engine !== undefined && !engine.startsWith(`${kernelId}:`)) {
    return `the host ran ${engine}, not the requested ${kernelId} — the kernel preference did not take`;
  }
  return undefined;
};

const warmProfile = async (userData: string, picked: string, slug: string) => {
  const startedAt = new Date().toISOString();
  let application: Awaited<ReturnType<typeof electron.launch>> | undefined;
  let warmupError: string | undefined;
  let appIsPackaged: boolean | undefined;
  try {
    application = await launchDesktop(userData, picked);
    appIsPackaged = await application.evaluate(({ app }) => app.isPackaged);
    const page = await application.firstWindow({ timeout: 180_000 });
    await page.addInitScript(instrument, kernelId);
    await page.waitForLoadState('domcontentloaded');
    await page.locator('a[href="/projects"]').first().waitFor({ state: 'visible', timeout: 240_000 });
    await page.goto(`${origin}/w/home/${slug}`, { waitUntil: 'commit' });
    if (!page.url().includes(slug)) {
      throw new Error(`Warmup opened ${page.url()} instead of ${slug}.`);
    }
    await page.waitForFunction(
      () => {
        const framed = (globalThis as { __TAU_OPEN_TO_FRAME__?: { marks: Record<string, number> } })
          .__TAU_OPEN_TO_FRAME__?.marks['geometryFramed'];
        const components = (
          globalThis as {
            __TAU_SECTION_VIEW_TEST__?: { getModelComponents(): readonly unknown[] };
          }
        ).__TAU_SECTION_VIEW_TEST__?.getModelComponents();
        return framed !== undefined && (components?.length ?? 0) > 0;
      },
      undefined,
      { timeout: 480_000 },
    );
  } catch (error) {
    warmupError = String(error).slice(0, 500);
  } finally {
    await closeDesktop(application);
  }
  return { startedAt, finishedAt: new Date().toISOString(), error: warmupError, appIsPackaged };
};

/* oxlint-disable-next-line max-lines-per-function, complexity -- One sample is one sequential timeline; splitting it hides the order. */
const runSample = async (iteration: number): Promise<Record<string, unknown>> => {
  const userData = await mkdtemp(join(tmpdir(), 'tau-otf-user-'));
  const picked = join(await mkdtemp(join(tmpdir(), 'tau-otf-pick-')), 'ws');
  await mkdir(picked, { recursive: true });
  const slug = `otf-${kernelId}-${iteration}`;
  const clientDigestBefore = rendererRoot === undefined ? undefined : await digestOf(rendererRoot);
  const seeded = host === 'desktop' && scenario !== 'home' ? await seedProject(userData, slug) : undefined;
  const warmup =
    scenario === 'restart-warm' && host === 'desktop' ? await warmProfile(userData, picked, slug) : undefined;
  const warmupTrace =
    warmup === undefined
      ? undefined
      : await mergeRuntimeTrace({
          directory: join(userData, 'logs/traces'),
          destination: join(
            outputDirectory,
            `open-to-frame-${host}-${kernelId}${scenarioSuffix}-${iteration}-warmup.trace.jsonl`,
          ),
        }).catch(() => undefined);
  const warmupLog =
    warmup === undefined ? undefined : await readFile(join(userData, 'logs/desktop.log'), 'utf8').catch(() => '');
  const warmupEngine = await observedEngine(warmupTrace?.file, warmupLog?.split('\n'));
  const warmupSelection = await observedKernelSelection(warmupTrace?.file);
  if (warmup !== undefined) {
    await rm(join(userData, 'logs/traces'), { recursive: true, force: true });
  }
  const logLengthBefore =
    warmup === undefined
      ? 0
      : await readFile(join(userData, 'logs/desktop.log'), 'utf8')
          .then((log) => log.length)
          .catch(() => 0);
  const marks: Record<string, number> = {};
  const startedAt = new Date().toISOString();
  const start = performance.now();
  const marksEpochMilliseconds = epochForRelativeMarks(start, Date.now(), performance.now());
  const contention = readContention({
    loadAverage1m: loadavg()[0] ?? 0,
    cpuCount: cpus().length,
    operatorTag: process.env['TAU_MEASUREMENT_CONTENTION'],
  });
  const at = (name: string): void => {
    marks[name] = Math.round((performance.now() - start) * 10) / 10;
  };
  let application: Awaited<ReturnType<typeof electron.launch>> | undefined;
  let appIsPackaged: boolean | undefined;
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  let browserServer: Awaited<ReturnType<typeof chromium.launchServer>> | undefined;
  let browserPid: number | undefined;
  let page: Page | undefined;
  let sampleError: string | undefined;
  let timeline: PageTimeline | undefined;
  let frameWitness: FrameWitness | undefined;
  let homeWitness: Readonly<{ screenshot: string; sha256: string }> | undefined;
  let projectUrl: string | undefined;
  let referenceAssets: ReadonlyArray<Readonly<{ name: string; sha256: string; bytes: number }>> | undefined;
  const consoleErrors: string[] = [];
  const nativeLogs: string[] = [];
  const nativeRequests: Request[] = [];
  try {
    at('launchIntent');
    if (host === 'desktop') {
      application = await launchDesktop(userData, picked);
      appIsPackaged = await application.evaluate(({ app }) => app.isPackaged);
      at('hostStart');
      page = await application.firstWindow({ timeout: 180_000 });
      await page.addInitScript(instrument, kernelId);
      page.on('console', (message) => {
        if (message.type() === 'error') {
          consoleErrors.push(message.text().slice(0, 300));
        }
      });
      at('shellFirstPaint');
      /* Never navigate before the shell's own bootstrap load resolves. */
      await page.waitForLoadState('domcontentloaded').catch(() => undefined);
      await page.locator('a[href="/projects"]').first().waitFor({ state: 'visible', timeout: 240_000 });
    } else {
      if (referenceFixture) {
        browserServer = await chromium.launchServer({ headless: true, channel: 'chromium', args: launchArguments });
        browserPid = browserServer.process().pid;
        if (browserPid === undefined || !Number.isSafeInteger(browserPid) || browserPid <= 0) {
          throw new Error('The fresh reference Chromium process has no valid OS PID.');
        }
        at('hostStart');
        browser = await chromium.connect(browserServer.wsEndpoint());
      } else {
        browser = await chromium.launch({ headless: true, channel: 'chromium', args: launchArguments });
      }
      const context = await browser.newContext({
        viewport: scenario === 'reference-cold' ? { width: 1920, height: 1080 } : { width: 1440, height: 900 },
        deviceScaleFactor: 1,
      });
      if (referenceFixture) {
        context.on('requestfinished', (request) => {
          // This browser-network event excludes the driver's later APIRequestContext availability check.
          if (request.url().includes('replicad_') && request.url().includes('.wasm') && nativeRequests.length < 2) {
            nativeRequests.push(request);
          }
        });
      }
      await context.addInitScript(instrument, kernelId);
      page = await context.newPage();
      page.on('console', (message) => {
        if (message.type() === 'error') {
          consoleErrors.push(message.text().slice(0, 300));
        }
        if (referenceFixture && (message.type() === 'debug' || message.type() === 'warning')) {
          const line = message.text();
          if (
            line.startsWith('[Kernel:') &&
            (line.includes('Replicad WASM variant auto-selected:') ||
              line.includes('Replicad OCCT initialised: variant=') ||
              line.includes('OCCT parallel defaults activated:') ||
              line.includes('OCCT parallel defaults partially activated:'))
          ) {
            if (nativeLogs.length < 16 && line.length <= 300) {
              nativeLogs.push(line);
            } else if (nativeLogs.length <= 16) {
              nativeLogs.push('');
            }
          }
        }
      });
      if (referenceFixture) {
        at('browserReady');
      } else {
        at('hostStart');
      }
      if (referenceFixture) {
        at('openIntent');
        await page.goto(`${origin}${referenceFixture.route}&graphicsBackend=${referenceBackend}`, {
          waitUntil: 'commit',
        });
        at('projectRouteEntered');
        projectUrl = page.url();
      } else {
        await page.goto(`${origin}/projects`, { waitUntil: 'domcontentloaded' });
      }
    }
    page.setDefaultTimeout(240_000);
    if (!referenceFixture) {
      at('projectsInteractive');
    }
    if (scenario === 'home') {
      const screenshot = join(outputDirectory, `open-to-frame-${host}-${kernelId}${scenarioSuffix}-${iteration}.png`);
      const pixels = await page.screenshot({ path: screenshot, animations: 'disabled' });
      at('homePixelCaptureUpperBound');
      homeWitness = { screenshot, sha256: createHash('sha256').update(pixels).digest('hex') };
      timeline = await readPageTimeline(page);
    } else {
      if (!referenceFixture) {
        await page.evaluate(instrument, kernelId).catch(() => undefined);
        await page
          .getByRole('button', { name: /^decline$/iu })
          .first()
          .click({ timeout: 5000 })
          .catch(() => undefined);

        /* A link-intent sample needs a real Home link before its measured clock starts. */
        const link = scenario === 'link-intent' ? page.locator(`a[href="/w/home/${slug}"]`).first() : undefined;
        if (link) {
          await link.waitFor({ state: 'visible' });
          at('homeLinkReady');
        }
        /* The user-perceived clock starts here; Home's own viewer is discarded with it. */
        await page
          .evaluate(() => (globalThis as { __TAU_OPEN_TO_FRAME__?: { reset(): void } }).__TAU_OPEN_TO_FRAME__?.reset())
          .catch(() => undefined);
        at('openIntent');
        if (link) {
          await link.hover();
          at('intentHover');
          await link.focus();
          at('intentFocus');
          at('navigationClick');
          await link.click();
          await page.waitForURL(`${origin}/w/home/${slug}`);
        } else {
          await page.goto(`${origin}/w/home/${slug}`, { waitUntil: 'commit' });
        }
        at('projectRouteEntered');
        projectUrl = page.url();
      }
      await page.evaluate(instrument, kernelId).catch(() => undefined);
      await page.waitForFunction(
        () =>
          (globalThis as { __TAU_OPEN_TO_FRAME__?: { marks: Record<string, number> } }).__TAU_OPEN_TO_FRAME__?.marks[
            'geometryInScene'
          ] !== undefined,
        undefined,
        { timeout: 480_000 },
      );
      at('geometryInScene');
      await page.waitForFunction(
        () =>
          (globalThis as { __TAU_OPEN_TO_FRAME__?: { marks: Record<string, number> } }).__TAU_OPEN_TO_FRAME__?.marks[
            'geometryFramed'
          ] !== undefined,
        undefined,
        { timeout: 180_000 },
      );
      at('geometryFramed');
      if (referenceFixture) {
        await wait(750);
      }
      const bridgeState = await page.evaluate(() => {
        const bridge = (
          globalThis as {
            __TAU_SECTION_VIEW_TEST__?: {
              getModelComponents(): ReadonlyArray<{ id: string }>;
              getRenderedModelComponentState(id: string): { visibleMeshCount: number };
              getRendererIdentity(): { api: 'webgl' | 'webgpu'; frame: number };
              isGeometryFramed(): boolean;
              getViewportCanvas(): HTMLCanvasElement;
            };
          }
        ).__TAU_SECTION_VIEW_TEST__;
        const componentIds = bridge?.getModelComponents().map(({ id }) => id) ?? [];
        return {
          componentIds,
          visibleMeshes: componentIds.reduce(
            (count, id) => count + (bridge?.getRenderedModelComponentState(id).visibleMeshCount ?? 0),
            0,
          ),
          rendererFrame: bridge?.getRendererIdentity().frame ?? 0,
          backend: bridge?.getRendererIdentity().api,
          framed: bridge?.isGeometryFramed() ?? false,
          viewport: [innerWidth, innerHeight],
          dpr: devicePixelRatio,
          canvas: [bridge?.getViewportCanvas().width ?? 0, bridge?.getViewportCanvas().height ?? 0],
        };
      });
      if (
        referenceFixture &&
        (bridgeState.backend !== referenceBackend ||
          !bridgeState.framed ||
          bridgeState.viewport[0] !== 1920 ||
          bridgeState.viewport[1] !== 1080 ||
          bridgeState.dpr !== 1)
      ) {
        throw new Error('The selected reference backend, framed geometry, viewport or DPR changed.');
      }
      if (bridgeState.componentIds.length > 0 && bridgeState.visibleMeshes > 0 && bridgeState.rendererFrame > 0) {
        const canvas = await page.evaluateHandle(() =>
          (
            globalThis as { __TAU_SECTION_VIEW_TEST__?: { getViewportCanvas(): HTMLCanvasElement } }
          ).__TAU_SECTION_VIEW_TEST__?.getViewportCanvas(),
        );
        const screenshot = join(
          outputDirectory,
          `open-to-frame-${host}-${kernelId}${scenarioSuffix}-${iteration}-pixel.png`,
        );
        const pixels = await canvas.asElement()?.screenshot({ path: screenshot, animations: 'disabled' });
        if (pixels && pixels.length > 0) {
          at('pixelCaptureUpperBound');
          await page.evaluate(() =>
            (
              globalThis as {
                __TAU_SECTION_VIEW_TEST__?: {
                  setPresentation(presentation: { surfaces: boolean; lines: boolean }): void;
                };
              }
            ).__TAU_SECTION_VIEW_TEST__?.setPresentation({ surfaces: false, lines: false }),
          );
          await page.waitForFunction(
            ({ previousFrame, componentIds }) => {
              const bridge = (
                globalThis as {
                  __TAU_SECTION_VIEW_TEST__?: {
                    getRendererIdentity(): { frame: number };
                    getRenderedModelComponentState(id: string): { visibleMeshCount: number };
                  };
                }
              ).__TAU_SECTION_VIEW_TEST__;
              return (
                bridge !== undefined &&
                bridge.getRendererIdentity().frame > previousFrame &&
                componentIds.every((id: string) => bridge.getRenderedModelComponentState(id).visibleMeshCount === 0)
              );
            },
            { previousFrame: bridgeState.rendererFrame, componentIds: bridgeState.componentIds },
            { timeout: 10_000 },
          );
          const blankCanvas = await page.evaluateHandle(() =>
            (
              globalThis as { __TAU_SECTION_VIEW_TEST__?: { getViewportCanvas(): HTMLCanvasElement } }
            ).__TAU_SECTION_VIEW_TEST__?.getViewportCanvas(),
          );
          const blankPixels = await blankCanvas.asElement()?.screenshot({ animations: 'disabled' });
          await blankCanvas.dispose();
          const modelPixelDifference = blankPixels
            ? await page.evaluate(
                async ({ visible, hidden }) => {
                  const decode = async (base64: string): Promise<ImageData> => {
                    const response = await fetch(`data:image/png;base64,${base64}`);
                    const bytes = new Uint8Array(await response.arrayBuffer());
                    const image = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
                    const canvas = document.createElement('canvas');
                    canvas.width = image.width;
                    canvas.height = image.height;
                    const context = canvas.getContext('2d');
                    if (!context) {
                      throw new Error('Could not decode viewport screenshot pixels.');
                    }
                    context.drawImage(image, 0, 0);
                    image.close();
                    return context.getImageData(0, 0, canvas.width, canvas.height);
                  };
                  const first = await decode(visible);
                  const second = await decode(hidden);
                  if (first.width !== second.width || first.height !== second.height) {
                    return 0;
                  }
                  let changed = 0;
                  for (let index = 0; index < first.data.length; index += 4) {
                    if (
                      Math.abs(first.data[index]! - second.data[index]!) +
                        Math.abs(first.data[index + 1]! - second.data[index + 1]!) +
                        Math.abs(first.data[index + 2]! - second.data[index + 2]!) >
                      24
                    ) {
                      changed += 1;
                    }
                  }
                  return changed;
                },
                { visible: pixels.toString('base64'), hidden: blankPixels.toString('base64') },
              )
            : 0;
          frameWitness =
            modelPixelDifference > 64
              ? {
                  screenshot,
                  sha256: createHash('sha256').update(pixels).digest('hex'),
                  ...bridgeState,
                  modelPixelDifference,
                }
              : undefined;
          // oxlint-disable-next-line max-depth -- The cold witness must stay within this sample's positive PNG branch.
          if (referenceFixture && frameWitness) {
            const current = await page.evaluate((expectedCanvas) => {
              const bridge = (
                globalThis as {
                  __TAU_SECTION_VIEW_TEST__?: {
                    getModelComponents(): ReadonlyArray<{ id: string }>;
                    getRendererIdentity(): { api: 'webgl' | 'webgpu'; frame: number };
                    getViewportCanvas(): HTMLCanvasElement;
                  };
                }
              ).__TAU_SECTION_VIEW_TEST__;
              return bridge === undefined
                ? undefined
                : {
                    ids: bridge.getModelComponents().map(({ id }) => id),
                    api: bridge.getRendererIdentity().api,
                    canvasConnected: bridge.getViewportCanvas() === expectedCanvas && expectedCanvas.isConnected,
                  };
            }, canvas);
            // oxlint-disable-next-line max-depth -- Refuse the exact captured canvas, backend or component identity changing.
            if (
              !current?.canvasConnected ||
              current.api !== referenceBackend ||
              current.ids.join('\0') !== bridgeState.componentIds.join('\0')
            ) {
              throw new Error('The selected reference geometry or canvas retired during PNG verification.');
            }
            at('checkedUsefulPngUpperBound');
            const referencePage = page;
            referenceAssets = await Promise.all(
              referenceAssetPins.map(async (asset) => {
                const response = await referencePage.request.get(
                  `${origin}/assets/engines/replicad/density-single-v1/${asset.name}`,
                );
                if (!response.ok()) {
                  throw new Error(`The delivered reference asset is unavailable: ${asset.name}`);
                }
                const bytes = await response.body();
                if (bytes.length !== asset.bytes || createHash('sha256').update(bytes).digest('hex') !== asset.sha256) {
                  throw new Error(`The delivered reference asset changed: ${asset.name}`);
                }
                return { ...asset };
              }),
            );
          }
          await canvas.dispose();
        }
        if (!pixels) {
          await canvas.dispose();
        }
      }
      timeline = await readPageTimeline(page);
    }
  } catch (error) {
    sampleError = String(error).slice(0, 500);
  }
  /* A refused sample must still be tagged, and must still say what the host was doing. */
  timeline ??= page === undefined ? undefined : await readPageTimeline(page).catch(() => undefined);
  const pageText =
    page === undefined ? '' : await page.evaluate(() => document.body.textContent.slice(0, 4000)).catch(() => '');
  const mainProcessLog =
    host === 'desktop'
      ? await readFile(join(userData, 'logs/desktop.log'), 'utf8')
          .then((log) => {
            const lines = log
              .slice(logLengthBefore)
              .split('\n')
              .filter((line) => line !== '' && !line.includes('renderer.console'))
              .map((line) => line.slice(0, 400));
            return [...lines.filter((line) => line.includes('kernel.engine')), ...lines.slice(-40)];
          })
          .catch(() => undefined)
      : undefined;
  /* Read while the host is still up: every producer's sink writes per batch, and the selection span
   * is the first thing a render emits. */
  const trace = await mergeRuntimeTrace({
    directory: join(userData, 'logs/traces'),
    destination: join(
      outputDirectory,
      `open-to-frame-${host}-${kernelId}${scenarioSuffix}-${String(iteration)}.trace.jsonl`,
    ),
  }).catch(() => undefined);
  const engine = await observedEngine(trace?.file, mainProcessLog);
  const spanObservation =
    scenario === 'home'
      ? undefined
      : await observedRuntimeWindow({
          traceFile: trace?.file,
          kernelId,
          fromEpoch: marksEpochMilliseconds + (marks['openIntent'] ?? Number.NaN),
          toEpoch: marksEpochMilliseconds + (marks['pixelCaptureUpperBound'] ?? Number.NaN),
        });
  const kernelPid = host === 'desktop' ? spanObservation?.pid : undefined;
  const invalidReason = sampleVerdict({
    marks,
    projectUrl,
    slug,
    timeline,
    consoleErrors,
    pageText,
    mainProcessLog,
    engine,
    frameWitness,
    homeWitness,
    appIsPackaged,
    sampleError,
  });
  const nativeVariant = referenceFixture
    ? observedReplicadNativeVariant(nativeLogs, referenceNativeTreatment)
    : undefined;
  // Native response bytes are inspected only after the checked-PNG timing mark. The request
  // completed in this fresh browser context, alongside the consistent post-init marker.
  const loadedNativeWasm = nativeVariant
    ? await Promise.all(
        nativeRequests.map(async (request) => {
          const response = await request.response();
          if (!response) {
            throw new Error('The completed native request has no response.');
          }
          if (new URL(request.url()).origin !== new URL(origin).origin || !page) {
            throw new Error('The completed native request is outside the immutable server.');
          }
          // Chromium does not expose Worker response bodies. Join the actual completed request
          // to the same URL's separately fetched immutable server bytes after PNG verification.
          const immutableResponse = await page.request.get(request.url());
          if (!immutableResponse.ok()) {
            throw new Error('The requested immutable native asset is unavailable.');
          }
          const bytes = await immutableResponse.body();
          return {
            url: request.url(),
            status: response.status(),
            byteLength: bytes.byteLength,
            sha256: createHash('sha256').update(bytes).digest('hex'),
          };
        }),
      )
        .then(async (responses) =>
          observedReplicadLoadedWasm(responses, {
            origin: new URL(origin).origin,
            variant: nativeVariant,
            expectedSha256:
              nativeVariant === 'custom-single'
                ? referenceAssetPins.find((asset) => asset.name === 'replicad_single.wasm')?.sha256
                : await hashFile(
                    fileURLToPath(
                      import.meta.resolve(
                        nativeVariant === 'auto-multi'
                          ? 'replicad-opencascadejs/multi/wasm'
                          : 'replicad-opencascadejs/wasm',
                      ),
                    ),
                  ),
          }),
        )
        .catch(() => undefined)
    : undefined;
  const reason =
    warmup?.error ??
    (warmup !== undefined && warmup.appIsPackaged !== true
      ? 'warmup did not run a packaged Electron app'
      : warmup !== undefined && warmupSelection !== kernelId
        ? 'warmup selected kernel was not observed for the seeded project'
        : (invalidReason ??
          (referenceFixture && nativeVariant === undefined
            ? 'the selected Replicad native build did not complete a consistent initialization'
            : referenceFixture && loadedNativeWasm === undefined
              ? 'the initialized Replicad variant has no matching completed browser-network WASM response'
              : undefined)));
  if (reason !== undefined) {
    await page
      ?.screenshot({
        path: join(outputDirectory, `open-to-frame-${host}-${kernelId}${scenarioSuffix}-${iteration}-invalid.png`),
      })
      .catch(() => undefined);
  }
  const clientDigestAfter =
    rendererRoot === undefined ? undefined : await digestOf(rendererRoot).catch(() => 'unreadable');
  const binaryDigestAfter =
    desktopExecutable === undefined ? undefined : await hashFile(desktopExecutable).catch(() => 'unreadable');
  const hostPid = application?.process().pid;
  const browserVersion = browser?.version();
  await closeDesktop(application);
  if (!browserServer) {
    await browser?.close().catch(() => undefined);
  }
  let browserCloseError: string | undefined;
  if (browserServer) {
    try {
      await browserServer.close();
    } catch (error) {
      browserCloseError = String(error).slice(0, 200);
    }
  }
  const browserExit =
    browserServer === undefined
      ? undefined
      : {
          pid: browserPid,
          exitCode: browserServer.process().exitCode,
          signalCode: browserServer.process().signalCode,
        };
  const finalReason =
    reason ??
    (referenceFixture &&
    (browserCloseError !== undefined ||
      browserExit?.pid === undefined ||
      (browserExit.exitCode === null && browserExit.signalCode === null))
      ? 'the fresh reference Chromium process did not report a completed exit'
      : undefined);
  /* Each cold sample fills an OPFS `/node_modules` under its own user-data dir. */
  await rm(userData, { recursive: true, force: true }).catch(() => undefined);
  await rm(picked, { recursive: true, force: true }).catch(() => undefined);
  const unknownBoundaries: ReadonlyArray<readonly [string, string, string]> =
    scenario === 'home'
      ? [['launchIntent', 'homePixelCaptureUpperBound', 'desktop/browser launch and Home presentation']]
      : scenario === 'reference-cold'
        ? [
            ['launchIntent', 'hostStart', 'fresh Chromium process launch'],
            ['hostStart', 'browserReady', 'browser context/page creation'],
            ['browserReady', 'projectRouteEntered', 'fixture navigation and route admission'],
            ['projectRouteEntered', 'geometryInScene', 'runtime and geometry admission'],
            ['geometryInScene', 'geometryFramed', 'viewer framing'],
            ['geometryFramed', 'checkedUsefulPngUpperBound', 'settlement, renderer, screenshot and PNG verification'],
          ]
        : [
            ...(scenario === 'link-intent'
              ? ([
                  ['openIntent', 'intentHover', 'pointer intent and warmup dispatch'],
                  ['intentHover', 'intentFocus', 'focus dispatch'],
                  ['intentFocus', 'navigationClick', 'automation handoff'],
                  ['navigationClick', 'projectRouteEntered', 'click and route admission'],
                ] as const)
              : ([['openIntent', 'projectRouteEntered', 'route admission']] as const)),
            ['projectRouteEntered', 'geometryInScene', 'filesystem/runtime/geometry and scene admission'],
            ['geometryInScene', 'pixelCaptureUpperBound', 'renderer/GPU presentation and screenshot latency'],
          ];
  const unknownIntervals = unknownBoundaries.flatMap(([from, to, owner]) => {
    const start = marks[from];
    const end = marks[to];
    return start === undefined || end === undefined ? [] : [{ from, to, owner, milliseconds: end - start }];
  });

  return {
    kind: 'sample',
    iteration,
    host,
    kernelId,
    scenario,
    artifact: {
      executable: desktopExecutable,
      rendererRoot,
      binarySha256Before: desktopBinarySha256,
      binarySha256After: binaryDigestAfter,
      binaryStable: desktopExecutable === undefined || desktopBinarySha256 === binaryDigestAfter,
      appIsPackaged,
    },
    startedAt,
    marksEpochMilliseconds,
    finishedAt: new Date().toISOString(),
    seeded,
    warmup,
    warmupTrace: warmupTrace?.file,
    warmupEngine,
    warmupSelection,
    marks,
    wallAttribution: { fraction: 0, unknownIntervals },
    page: timeline,
    /* The measurement is void if the client root changed under it (F-L10-C). */
    clientDigestBefore,
    clientDigestAfter,
    clientRootStable: clientDigestBefore === clientDigestAfter,
    error: sampleError,
    mainProcessLog,
    projectUrl,
    consoleErrors,
    /* No geometry is never a number: the sample is invalid and says why. */
    valid: finalReason === undefined,
    invalidReason: finalReason,
    engine,
    frameWitness,
    reference:
      referenceFixture === undefined
        ? undefined
        : {
            name: referenceName,
            backend: referenceBackend,
            source: referenceFixture,
            assets: referenceAssets,
            nativeVariant,
            loadedNativeWasm,
            nativeResourceEvidence:
              'completed browser request URL/status and initialization joined to separately fetched immutable server bytes; original Worker response body unavailable',
            browserVersion,
            process: browserExit,
            browserProfile: 'default Chromium launch with existing unsafe-WebGPU flag',
            viewport: frameWitness?.viewport,
            dpr: frameWitness?.dpr,
            canvas: frameWitness?.canvas,
            measurementScope:
              'fresh browser process launch to checked useful PNG upper bound; server stays warm; no first-paint or native-presentation claim',
          },
    homeWitness,
    /** Total milliseconds per span name for this sample's ten heaviest spans. */
    runtimeSpans: trace?.totals,
    ...(process.env['TAU_MEASUREMENT_OBSERVE_SPANS'] !== '1' || spanObservation === undefined
      ? {}
      : { spanObservation }),
    measurement:
      scenario === 'home'
        ? {
            ...tagsFor(timeline, kernelPid, { engine: 'none', trace, contention }),
            wasmVariant: 'none',
            adapter: { api: 'none', angle: 'none', name: '', implementation: 'ambiguous' },
            kernelProcess: {
              kind: 'in-process',
              role: host === 'desktop' ? 'desktop main' : 'browser main',
              pid: hostPid,
            },
          }
        : tagsFor(timeline, kernelPid, { engine, trace, contention }),
  };
};

if (host === 'desktop' && rendererRoot === undefined) {
  throw new Error(
    'TAU_DESKTOP_CLIENT_ROOT must point at a private copy of apps/ui/desktop/build/client: that directory is a shared singleton any peer `ui` build empties mid-run.',
  );
}

await mkdir(outputDirectory, { recursive: true });
const file = join(outputDirectory, `open-to-frame-${host}-${kernelId}${scenarioSuffix}.jsonl`);
const lines: string[] = [];
const durations: number[] = [];
const samples: Array<{
  readonly valid: boolean;
  readonly clientRootStable: boolean;
  readonly binaryStable: boolean;
  readonly browserPid?: number;
  readonly measurement?: MeasurementTags;
}> = [];
for (let iteration = 0; iteration < repeats; iteration += 1) {
  // oxlint-disable-next-line no-await-in-loop -- Samples are sequential by definition.
  const sample = await runSample(iteration);
  samples.push({
    valid: sample['valid'] === true,
    clientRootStable: sample['clientRootStable'] === true,
    binaryStable: (sample['artifact'] as { binaryStable: boolean }).binaryStable,
    browserPid: (sample['reference'] as { process?: { pid?: number } } | undefined)?.process?.pid,
    measurement: sample['measurement'] as MeasurementTags | undefined,
  });
  lines.push(JSON.stringify(sample));
  const marks = sample['marks'] as Record<string, number>;
  const duration =
    scenario === 'home'
      ? marks['homePixelCaptureUpperBound']! - marks['launchIntent']!
      : scenario === 'reference-cold'
        ? marks['checkedUsefulPngUpperBound']! - marks['launchIntent']!
        : marks['pixelCaptureUpperBound']! - marks['openIntent']!;
  if (
    sample['valid'] === true &&
    sample['clientRootStable'] === true &&
    samples.at(-1)?.binaryStable === true &&
    Number.isFinite(duration) &&
    duration >= 0
  ) {
    durations.push(duration);
  }
  // oxlint-disable-next-line no-await-in-loop -- Flush after every sample: a killed run keeps what it measured.
  await writeFile(file, `${lines.join('\n')}\n`);
  console.log(
    JSON.stringify({
      iteration,
      marks,
      fps: (sample['page'] as PageTimeline | undefined)?.framesPerSecond,
      invalidReason: sample['invalidReason'],
    }),
  );
}

const spread = coefficientOfVariation(durations);
const distinctBrowserPids = new Set(samples.map((sample) => sample.browserPid).filter((pid) => pid !== undefined)).size;
const sampleVerdicts = referenceStructuralProbe
  ? []
  : samples.map((sample) => budgetVerdict({ tags: sample.measurement, coefficientOfVariation: spread }));
const refusals = referenceStructuralProbe
  ? ['non-measured native structural probe; no CV or population qualification']
  : [
      ...(durations.length === repeats
        ? []
        : [`${String(repeats - durations.length)} sample(s) had invalid timing or changed client/binary assets`]),
      ...(referenceFixture && distinctBrowserPids !== repeats
        ? ['the reference population did not use five distinct fresh Chromium OS processes']
        : []),
      ...(referenceFixture && durations.length === repeats && (spread === undefined || spread > 0.1)
        ? ['fresh-browser launch-to-checked-PNG CV exceeds 0.1']
        : []),
      'launch-to-pixel wall attribution below 95%: host launch, route admission, renderer/GPU and screenshot latency remain unjoined',
      ...sampleVerdicts.flatMap((sample, index) =>
        sample.refusals.map((reason) => `sample ${String(index)}: ${reason}`),
      ),
    ];
const verdict = { eligible: refusals.length === 0, refusals };
lines.push(
  JSON.stringify({
    kind: 'summary',
    host,
    kernelId,
    scenario,
    referenceStructuralProbe,
    ...(referenceFixture === undefined
      ? {}
      : {
          referencePopulation: {
            source: referenceName,
            backend: referenceBackend,
            requestedFreshProcesses: repeats,
            distinctBrowserPids,
          },
          ...(referenceStructuralProbe
            ? {}
            : {
                referenceCvGate: {
                  bound: 0.1,
                  measured: durations.length === repeats ? spread : undefined,
                  passed:
                    durations.length === repeats &&
                    distinctBrowserPids === repeats &&
                    spread !== undefined &&
                    spread <= 0.1,
                },
              }),
        }),
    valid: durations.length,
    requested: repeats,
    invalidReasons: lines
      .map((line) => (JSON.parse(line) as { invalidReason?: string }).invalidReason)
      .filter((reason) => reason !== undefined),
    /** Milliseconds, launch intent for reference-cold (otherwise open intent) to checked PNG; never first paint. */
    pixelCaptureUpperBound: durations,
    wallAttribution: {
      fraction: 0,
      unknown: ['host launch', 'route admission', 'renderer/GPU', 'screenshot latency'],
    },
    coefficientOfVariation: spread,
    measurements: samples.map((sample) => sample.measurement),
    verdict,
  }),
);
await writeFile(file, `${lines.join('\n')}\n`);
console.log(`${file}\n${verdict.eligible ? 'BUDGET-ELIGIBLE' : `REFUSED: ${verdict.refusals.join('; ')}`}`);
/* eslint-enable @nx/enforce-module-boundaries -- executable driver scope ends here. */
