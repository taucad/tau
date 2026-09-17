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
 *   The desktop host therefore *requires* `TAU_DESKTOP_CLIENT_ROOT` to point at a
 *   private copy, and every sample records the root's digest before and after.
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
 *   node apps/ui-e2e/src/support/open-to-frame.ts desktop jscad 3
 *   node apps/ui-e2e/src/support/open-to-frame.ts browser jscad 3 http://127.0.0.1:3110
 *
 * Environment:
 *   TAU_DESKTOP_CLIENT_ROOT      Required for the desktop host (see above).
 *   TAU_MEASUREMENT_CONTENTION   `quiet` or `contended`; recorded as an operator
 *                                statement instead of the load-average derivation.
 *   TAU_MEASUREMENT_BUILD        `production` (default) or `development`.
 *   TAU_OPEN_TO_FRAME_OUT        Output directory (default `out/test-results/open-to-frame`).
 */
/* eslint-disable @nx/enforce-module-boundaries -- executable driver imports source projects before package install. */
import { createHash, randomInt } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { cpus, loadavg, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { _electron as electron, chromium } from 'playwright';
import type { Page } from 'playwright';
// oxlint-disable-next-line no-restricted-imports -- one owner for the measurement contract both harnesses answer to.
import { budgetVerdict, readContention, rendererAngle } from '../../../runtime-e2e/src/benchmarks/measurement-tags.ts';
// oxlint-disable-next-line no-restricted-imports -- same owner, type only.
import type { MeasurementTags } from '../../../runtime-e2e/src/benchmarks/measurement-tags.ts';
// oxlint-disable-next-line no-restricted-imports -- executable driver: no package alias before install.
import { classifyWebGpuAdapter } from './webgpu-profile.ts';

type Host = 'browser' | 'desktop';

/** Steps of one open-to-frame sample, in the order they are stamped. */
type Timeline = Readonly<Record<string, number>>;

type PageTimeline = Readonly<{
  backend: string | undefined;
  rafTicks: number;
  framesPerSecond: number;
  marks: Timeline;
  longTaskCount: number;
  workerNames: readonly string[];
  renderer: string;
}>;

const repoRoot = resolve(import.meta.dirname, '../../../..');
const hostArgument = process.argv[2] ?? 'desktop';
const host: Host = hostArgument === 'browser' ? 'browser' : 'desktop';
const kernelId = process.argv[3] ?? 'jscad';
const repeats = Number(process.argv[4] ?? 3);
const baseUrl = process.argv[5] ?? 'http://127.0.0.1:3110';
const origin = host === 'desktop' ? 'app://tau' : baseUrl;
const outputDirectory = process.env['TAU_OPEN_TO_FRAME_OUT'] ?? join(repoRoot, 'out/test-results/open-to-frame');
const clientRoot = process.env['TAU_DESKTOP_CLIENT_ROOT'];

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

const launchArguments = [
  '--enable-unsafe-webgpu',
  '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding',
  '--disable-background-timer-throttling',
];

/**
 * `projectIdSchema` is `/^proj_[\dA-Za-z]{21}$/` (`libs/types/src/schemas/project-manifest.schema.ts:9`).
 * A manifest whose only defect is its id is not rejected — it becomes
 * *adoptable*, so the project is listed with an **Adopt** button and cannot be
 * opened at all. That single token cost L10 six samples (finding F-L10-6).
 */
const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const projectId = (): string =>
  `proj_${Array.from({ length: 21 }, () => alphabet[randomInt(alphabet.length)]).join('')}`;

const seedProject = async (userData: string, slug: string): Promise<{ example: string; entry: string }> => {
  const [example, entry] = examples[kernelId] ?? examples['jscad']!;
  const directory = join(userData, 'home', slug);
  await mkdir(join(directory, '.tau', 'parameters'), { recursive: true });
  await copyFile(join(repoRoot, 'libs/tau-examples/src/kernels', example, entry), join(directory, entry));
  await writeFile(
    join(directory, 'tau.json'),
    JSON.stringify(
      {
        $schema: 'https://tau.new/schemas/tau-schema-v1.json',
        id: projectId(),
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
    JSON.stringify({
      profile: 'tau-json-structure-units-03-v1',
      activeGroup: 'default',
      groups: { default: { values: {} } },
    }),
  );
  return { example, entry };
};

/**
 * Injected into every document. Closure-free on purpose: Playwright serializes
 * it, and a `Create Project` submit is a real navigation that destroys anything
 * only evaluated into the previous document.
 *
 * It also seeds the two preferences a fresh `--user-data-dir` has no value for.
 * `tauDebug` mounts the viewer test bridge. **`cad-kernel` decides which kernel
 * runs** — L10 finding F-L10-10: the active kernel comes from that preference
 * (`apps/ui/app/hooks/use-kernel.tsx:7,16`, stored by `use-cookie.ts` in
 * `localStorage` despite the name), defaults to `openscad`, and is *not* derived
 * from the project on disk. Seeding files alone produces an OpenSCAD row for
 * every kernel.
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
    /* Both shapes on purpose: `use-cookie.ts` stores this in localStorage at HEAD,
     * but an older client build reads a real cookie, and the harness must select
     * the kernel in whichever client root it is pointed at. */
    localStorage.setItem('cad-kernel', JSON.stringify(activeKernel));
    // oxlint-disable-next-line no-document-cookie -- the product's own cookie shape is the thing under test; a library would not reproduce it.
    document.cookie = `cad-kernel=${encodeURIComponent(JSON.stringify(activeKernel))}; path=/`;
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
        /* Order matters: stamping the presented frame before this tick's geometry
         * check puts it on the tick *after* geometry arrived, which is what the
         * charter's "first presented frame" means (L10 finding F-L10-7). */
        if (state.marks['geometryInScene'] !== undefined) {
          stamp('framePresentedAfterGeometry');
        }
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
    let renderer = '';
    try {
      const gl = document.createElement('canvas').getContext('webgl2');
      renderer = String(gl?.getParameter(gl.RENDERER) ?? '');
    } catch {
      renderer = '';
    }
    return {
      backend: state?.backend,
      rafTicks: state?.rafTicks ?? 0,
      framesPerSecond: elapsed > 0 ? Math.round(((state?.rafTicks ?? 0) / (elapsed / 1000)) * 10) / 10 : 0,
      marks: { ...state?.marks },
      longTaskCount: state?.longTasks ?? 0,
      workerNames: [...new Set(state?.workers ?? [])],
      renderer,
    };
  });

const digestOf = async (path: string): Promise<string> =>
  createHash('sha256')
    .update(await readFile(join(path, 'index.html')))
    .digest('hex')
    .slice(0, 16);

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
 * The kernel that actually ran, from the host's own `kernel.engine` line. The
 * requested kernel is a *request*: L10 finding F-L10-10 showed every sample
 * forking `openrscad` regardless, and a harness with no check published that as
 * a per-kernel row.
 */
const observedEngine = (mainProcessLog: readonly string[] | undefined): string | undefined => {
  const line = mainProcessLog?.findLast((entry) => entry.includes('kernel.engine'));
  const engine = /"kernelId":"(?<kernel>[^"]+)"/u.exec(line ?? '')?.groups?.['kernel'];
  const backend = /"backend":"(?<backend>[^"]+)"/u.exec(line ?? '')?.groups?.['backend'];
  return engine === undefined ? undefined : `${engine}:${backend ?? 'unknown'}`;
};

const tagsFor = (page: PageTimeline, kernelPid: number | undefined, engine: string | undefined): MeasurementTags => ({
  build: process.env['TAU_MEASUREMENT_BUILD'] === 'development' ? 'development' : 'production',
  wasmVariant: engine ?? `${kernelId}:unobserved`,
  adapter: {
    api: page.backend === 'webgpu' ? 'webgpu' : 'webgl',
    angle: rendererAngle(launchArguments),
    name: page.renderer,
    implementation: classifyWebGpuAdapter({
      architecture: '',
      description: page.renderer,
      device: '',
      fallback: undefined,
      vendor: '',
    }),
  },
  /*
   * The pid is the Electron main process that forks the kernel; the fork's own
   * identity arrives with the D8 runtime JSONL exporter (see `runtimeTraceJsonl`).
   */
  kernelProcess:
    host === 'desktop'
      ? { kind: 'utility', role: 'electron kernel fork', pid: kernelPid }
      : { kind: 'worker', role: page.workerNames.join(',') || 'unobserved' },
  crossOriginIsolated: false,
  contention: readContention({
    loadAverage1m: loadavg()[0] ?? 0,
    cpuCount: cpus().length,
    operatorTag: process.env['TAU_MEASUREMENT_CONTENTION'],
  }),
});

/**
 * Why this sample may not become a number, or `undefined` when it may.
 *
 * Ordered so the most specific cause wins. L10's close-out showed why each one
 * has to be named rather than inferred from a missing mark: ten desktop samples
 * produced zero valid rows, and the three causes were indistinguishable from
 * "slow machine" without this.
 */
const sampleVerdict = (input: {
  readonly marks: Record<string, number>;
  readonly projectUrl: string | undefined;
  readonly slug: string;
  readonly timeline: PageTimeline | undefined;
  readonly consoleErrors: readonly string[];
  readonly pageText: string;
  readonly mainProcessLog: readonly string[] | undefined;
  readonly engine: string | undefined;
  readonly sampleError: string | undefined;
}): string | undefined => {
  const { marks, projectUrl, slug, timeline, consoleErrors, pageText, mainProcessLog, engine, sampleError } = input;
  if (projectUrl !== undefined && !projectUrl.includes(slug)) {
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
  if (timeline !== undefined && timeline.marks['bridgeReady'] === undefined) {
    return 'the viewer never mounted its test bridge, so no frame could be observed';
  }
  if (marks['geometryInScene'] === undefined) {
    return sampleError ?? 'geometry never reached the scene';
  }
  if (engine !== undefined && !engine.startsWith(`${kernelId}:`)) {
    return `the host ran ${engine}, not the requested ${kernelId} — the kernel preference did not take`;
  }
  return undefined;
};

/* oxlint-disable-next-line max-lines-per-function -- One sample is one sequential timeline; splitting it hides the order. */
const runSample = async (iteration: number): Promise<Record<string, unknown>> => {
  const userData = await mkdtemp(join(tmpdir(), 'tau-otf-user-'));
  const picked = join(await mkdtemp(join(tmpdir(), 'tau-otf-pick-')), 'ws');
  await mkdir(picked, { recursive: true });
  const slug = `otf-${kernelId}-${iteration}`;
  const seeded = host === 'desktop' ? await seedProject(userData, slug) : undefined;
  const marks: Record<string, number> = {};
  const startedAt = new Date().toISOString();
  const start = performance.now();
  const at = (name: string): void => {
    marks[name] = Math.round((performance.now() - start) * 10) / 10;
  };
  const clientDigestBefore = clientRoot === undefined ? undefined : await digestOf(clientRoot);
  let application: Awaited<ReturnType<typeof electron.launch>> | undefined;
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  let page: Page | undefined;
  let kernelPid: number | undefined;
  let sampleError: string | undefined;
  let timeline: PageTimeline | undefined;
  let projectUrl: string | undefined;
  const consoleErrors: string[] = [];
  try {
    if (host === 'desktop') {
      application = await electron.launch({
        args: [join(repoRoot, 'apps/desktop'), `--user-data-dir=${userData}`, ...launchArguments],
        cwd: join(repoRoot, 'apps/desktop'),
        /* eslint-disable @typescript-eslint/naming-convention -- environment variables are SCREAMING_SNAKE_CASE. */
        env: {
          ...process.env,
          NODE_ENV: 'production',
          TAU_DEBUG: 'true',
          TAU_DESKTOP_CLIENT_ROOT: clientRoot!,
          TAU_E2E_PICK_DIRECTORY: picked,
        },
        /* eslint-enable @typescript-eslint/naming-convention -- environment scope ends here. */
      });
      at('hostStart');
      kernelPid = application.process().pid;
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
      browser = await chromium.launch({ headless: true, channel: 'chromium', args: launchArguments });
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      await context.addInitScript(instrument, kernelId);
      page = await context.newPage();
      page.on('console', (message) => {
        if (message.type() === 'error') {
          consoleErrors.push(message.text().slice(0, 300));
        }
      });
      at('hostStart');
      await page.goto(`${origin}/projects`, { waitUntil: 'domcontentloaded' });
    }
    page.setDefaultTimeout(240_000);
    at('projectsInteractive');
    await page.evaluate(instrument, kernelId).catch(() => undefined);
    await page
      .getByRole('button', { name: /^decline$/iu })
      .first()
      .click({ timeout: 5000 })
      .catch(() => undefined);

    /* The user-perceived clock starts here; Home's own viewer is discarded with it. */
    await page
      .evaluate(() => (globalThis as { __TAU_OPEN_TO_FRAME__?: { reset(): void } }).__TAU_OPEN_TO_FRAME__?.reset())
      .catch(() => undefined);
    at('openIntent');
    await page.goto(`${origin}/w/home/${slug}`, { waitUntil: 'commit' });
    at('projectRouteEntered');
    projectUrl = page.url();
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
    await page
      .waitForFunction(
        () =>
          (globalThis as { __TAU_OPEN_TO_FRAME__?: { marks: Record<string, number> } }).__TAU_OPEN_TO_FRAME__?.marks[
            'geometryFramed'
          ] !== undefined,
        undefined,
        { timeout: 180_000 },
      )
      .catch(() => undefined);
    at('geometryFramed');
    timeline = await readPageTimeline(page);
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
          .then((log) =>
            log
              .split('\n')
              .filter((line) => line !== '' && !line.includes('renderer.console'))
              .slice(-40)
              .map((line) => line.slice(0, 200)),
          )
          .catch(() => undefined)
      : undefined;
  const engine = observedEngine(mainProcessLog);
  const invalidReason = sampleVerdict({
    marks,
    projectUrl,
    slug,
    timeline,
    consoleErrors,
    pageText,
    mainProcessLog,
    engine,
    sampleError,
  });
  if (invalidReason !== undefined) {
    await page
      ?.screenshot({ path: join(outputDirectory, `open-to-frame-${host}-${kernelId}-${iteration}-invalid.png`) })
      .catch(() => undefined);
  }
  const clientDigestAfter = clientRoot === undefined ? undefined : await digestOf(clientRoot).catch(() => 'unreadable');
  await application?.close().catch(() => undefined);
  await browser?.close().catch(() => undefined);
  /* Each cold sample fills an OPFS `/node_modules` under its own user-data dir. */
  await rm(userData, { recursive: true, force: true }).catch(() => undefined);
  await rm(picked, { recursive: true, force: true }).catch(() => undefined);

  return {
    kind: 'sample',
    iteration,
    host,
    kernelId,
    startedAt,
    finishedAt: new Date().toISOString(),
    seeded,
    marks,
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
    valid: invalidReason === undefined,
    invalidReason,
    engine,
    measurement: timeline ? tagsFor(timeline, kernelPid, engine) : undefined,
  };
};

if (host === 'desktop' && clientRoot === undefined) {
  throw new Error(
    'TAU_DESKTOP_CLIENT_ROOT must point at a private copy of apps/ui/desktop/build/client: that directory is a shared singleton any peer `ui` build empties mid-run.',
  );
}

await mkdir(outputDirectory, { recursive: true });
const file = join(outputDirectory, `open-to-frame-${host}-${kernelId}.jsonl`);
const lines: string[] = [];
const durations: number[] = [];
for (let iteration = 0; iteration < repeats; iteration += 1) {
  // oxlint-disable-next-line no-await-in-loop -- Samples are sequential by definition.
  const sample = await runSample(iteration);
  lines.push(JSON.stringify(sample));
  const marks = sample['marks'] as Record<string, number>;
  if (sample['valid'] === true && sample['clientRootStable'] === true) {
    durations.push(marks['geometryInScene']! - (marks['openIntent'] ?? 0));
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
const lastSample = JSON.parse(lines.at(-1) ?? '{}') as { measurement?: MeasurementTags };
const verdict = budgetVerdict({ tags: lastSample.measurement, coefficientOfVariation: spread });
lines.push(
  JSON.stringify({
    kind: 'summary',
    host,
    kernelId,
    valid: durations.length,
    requested: repeats,
    invalidReasons: lines
      .map((line) => (JSON.parse(line) as { invalidReason?: string }).invalidReason)
      .filter((reason) => reason !== undefined),
    /** Milliseconds, cold open intent to geometry in the scene. */
    openToGeometry: durations,
    coefficientOfVariation: spread,
    measurement: lastSample.measurement,
    verdict,
  }),
);
await writeFile(file, `${lines.join('\n')}\n`);
console.log(`${file}\n${verdict.eligible ? 'BUDGET-ELIGIBLE' : `REFUSED: ${verdict.refusals.join('; ')}`}`);
/* eslint-enable @nx/enforce-module-boundaries -- executable driver scope ends here. */
