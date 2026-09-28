import { expect, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import * as target from '#support/external-target.js';
import { percentile, readBenchmarkMeasurement } from '#support/headless-capture-performance.js';
/* eslint-disable @nx/enforce-module-boundaries -- one owner for the measurement contract both harnesses answer to. */
// oxlint-disable-next-line no-restricted-imports -- same owner; the disable has to sit on the import's own line.
import { budgetVerdict } from '../../runtime-e2e/src/benchmarks/measurement-tags.ts';
/* eslint-enable @nx/enforce-module-boundaries -- scope ends at the import. */

/**
 * What a parameter edit costs the person making it, on a 6-field and a 101-field form (parameter
 * performance close-out, budgets G1–G15).
 *
 * A probe installed before the app's first script records, per interaction phase:
 *
 * - **Renders**, by the DOM region each rendered component owns (file tree, parameter row,
 *   viewer, three.js scene), through a React DevTools hook. Counts are deterministic, so they
 *   bind in every run.
 * - **Input → paint** for every key and pointer event, and Long Animation Frames.
 * - **The committed-edit waterfall**: the product marks `tau:parameter-edit`,
 *   `tau:parameter-settled` and `tau:parameter-dispatch`, the worker's `kernel.render` span and
 *   the frame that first shows the new geometry.
 * - **Physical sidecar writes**, as the cross-tab change notifications the filesystem publishes.
 *
 * Timing budgets bind only on a quiet, tagged production run whose series pass `budgetVerdict`
 * (set `VITE_TAU_MEASUREMENT_LOAD_1M`, and `VITE_TAU_MEASUREMENT_CONTENTION=quiet` when the
 * operator vouches for the machine); otherwise every series is written to the artifact with the
 * reasons it did not bind. The Playwright trace is stopped first: it screenshots and snapshots
 * every action, which loads the page under measurement.
 */

/* oxlint-disable no-await-in-loop, tau-lint/no-time-unit-suffix, typescript/no-restricted-types -- Interactions are sequential by design; the artifact names its millisecond unit explicitly; React fibers and the DOM report absent links as `null`. */

type Fixture = Readonly<{
  name: string;
  route: string;
  fields: number;
  field: string;
  /** The field's default; its inferred slider range is zero to twice this, so edits stay near it. */
  base: number;
  filterText: string;
  /** G2: input → settled p50. */
  settledP50: number;
  /** G5 / G6: input → frame p50. */
  frameP50: number;
  /** G4: parameter machinery inside `kernel.render` p50. */
  machineryP50: number;
}>;

const fixtures: readonly Fixture[] = [
  {
    name: 'honeycomb',
    route: '/__e2e/project-file-tree',
    fields: 6,
    field: 'Input for Width',
    base: 20,
    filterText: 'wall',
    settledP50: 12,
    frameP50: 33,
    machineryP50: 1,
  },
  {
    name: 'box-corner',
    route: '/__e2e/project-file-tree?main=box-corner',
    fields: 101,
    field: 'Input for Width',
    base: 16,
    filterText: 'value 9',
    settledP50: 20,
    frameP50: 50,
    machineryP50: 2,
  },
];

const commitKinds = ['enter', 'arrow', 'slider'] as const;
type CommitKind = (typeof commitKinds)[number];
const commitRounds = 8;
const burstRounds = 10;
const dragSamples = 40;
const foreignRounds = 4;

type Region = 'file-tree' | 'other' | 'parameter-row' | 'parameters' | 'scene' | 'viewer';

type Fiber = {
  tag: number;
  flags: number;
  alternate: Fiber | null;
  child: Fiber | null;
  sibling: Fiber | null;
  return: Fiber | null;
  stateNode: unknown;
  memoizedProps?: { value?: unknown } | null;
  memoizedState?: unknown;
};

type CommitRecord = Readonly<{
  phase: string;
  t: number;
  urgent: boolean;
  walkMs: number;
  fibers: Partial<Record<Region, number>>;
  rows: readonly number[];
}>;

/** The entry points a Long Animation Frame attributes its script time to. */
type LoafScript = Readonly<{ invoker: string; source: string; position: number; duration: number }>;

type EventRecord = { phase: string; type: string; key: string; ts: number; paint?: number };
type Span = Readonly<{ name: string; start: number; dur: number }>;

type Waterfall = Readonly<{
  inputToEdit?: number;
  inputToSettled?: number;
  settledToDispatch?: number;
  dispatchToRender?: number;
  kernelRender?: number;
  machinery?: number;
  children: Readonly<Record<string, number>>;
  renderEndToFrame?: number;
  inputToFrame?: number;
  sidecarWrites: number;
  sidecarNotices: readonly string[];
  longFrames: number;
  maxFrame: number;
}>;

type Actor = {
  getSnapshot(): { value: unknown; context: Record<string, unknown> };
  subscribe(listener: (snapshot: { value: unknown; context: Record<string, unknown> }) => void): unknown;
  on(type: string, listener: (event: { outcome?: { status?: string } }) => void): unknown;
  send(event: unknown): void;
};

type Probe = {
  phase: string;
  phaseStart: Record<string, number>;
  commits: CommitRecord[];
  events: EventRecord[];
  loafs: Array<{ phase: string; start: number; duration: number; blocking: number; scripts: LoafScript[] }>;
  fsWrites: Array<{ phase: string; t: number; type: string; path: string }>;
  pill: Array<{ phase: string; t: number; on: boolean }>;
  frames: number[];
  settled: Array<{ phase: string; t: number; status: string }>;
  cad?: Actor;
  graphics: Actor[];
  setPhase(name: string): void;
  lastCommitAt(): number;
  telemetry(): Span[];
  presented(): boolean;
  attach(): string;
  waterfall(phase: string): Waterfall;
};

type ProbeGlobal = typeof globalThis & { __TAU_PARAMETER_PERF__?: Probe };

/** Installed before the app's first script; closure-free because it crosses the command boundary as source. */
const installProbe = (): void => {
  const scope = globalThis as ProbeGlobal;
  if (scope.__TAU_PARAMETER_PERF__) {
    return;
  }
  const rowIds = new WeakMap<Element, number>();
  let nextRow = 0;
  let domRenderer: number | undefined;
  let rendererCount = 0;
  let eventTask = false;
  const sum = (values: readonly number[]): number => {
    let total = 0;
    for (const value of values) {
      total += value;
    }
    return total;
  };
  /* Spans that make up the parameter machinery inside one `kernel.render` (G4), with the resolver's own share. */
  const machinerySpans = ['kernel.select', 'kernel.extract-params'];
  const regions = new WeakMap<Element, { region: Region; row?: number }>();
  const classify = (element: Element): { region: Region; row?: number } => {
    if (element.closest('[data-testid="file-tree-item"]')) {
      return { region: 'file-tree' };
    }
    const row = element.closest(String.raw`.group\/field`);
    if (row) {
      let id = rowIds.get(row);
      if (id === undefined) {
        id = nextRow;
        nextRow += 1;
        rowIds.set(row, id);
      }
      return { region: 'parameter-row', row: id };
    }
    if (element.closest('[data-slot="parameters"]')) {
      return { region: 'parameters' };
    }
    if (element.closest('[data-testid="cad-viewer-canvas-region"]')) {
      return { region: 'viewer' };
    }
    return { region: 'other' };
  };
  const regionOf = (fiber: Fiber, dom: boolean): { region: Region; row?: number } => {
    if (!dom) {
      return { region: 'scene' };
    }
    let host: Fiber | null = fiber;
    for (let depth = 0; host && !(host.tag === 5 && host.stateNode instanceof Element) && depth < 40; depth += 1) {
      host = host.child;
    }
    if (!host || !(host.stateNode instanceof Element)) {
      host = fiber.return;
      while (host && !(host.tag === 5 && host.stateNode instanceof Element)) {
        host = host.return;
      }
    }
    const element = host?.stateNode;
    if (!(element instanceof Element)) {
      return { region: 'other' };
    }
    /* A host element never changes region, so the selector walk runs once per element. */
    let known = regions.get(element);
    if (known === undefined) {
      known = classify(element);
      regions.set(element, known);
    }
    return known;
  };
  const probe: Probe = {
    phase: 'boot',
    phaseStart: {},
    commits: [],
    events: [],
    loafs: [],
    fsWrites: [],
    pill: [],
    frames: [],
    settled: [],
    graphics: [],
    setPhase(name) {
      probe.phase = name;
      probe.phaseStart[name] = performance.now();
    },
    lastCommitAt() {
      return probe.commits.at(-1)?.t ?? 0;
    },
    telemetry() {
      const entries = (probe.cad?.getSnapshot().context['telemetryEntries'] ?? []) as Array<{
        name: string;
        startTime: number;
        duration: number;
        workerTimeOrigin?: number;
      }>;
      return entries.map((entry) => ({
        name: entry.name,
        start: entry.startTime + (entry.workerTimeOrigin ?? performance.timeOrigin) - performance.timeOrigin,
        dur: entry.duration,
      }));
    },
    presented() {
      return probe.graphics.every((actor) => {
        const presentation = actor.getSnapshot().context['gltfPresentation'] as {
          phase: string;
          presentedRevision?: number;
          requestedRevision?: number;
        };
        return presentation.phase === 'presented' && presentation.presentedRevision === presentation.requestedRevision;
      });
    },
    attach() {
      const region = document.querySelector('[data-testid="cad-viewer-canvas-region"]');
      const fiberKey = region ? Object.keys(region).find((key) => key.startsWith('__reactFiber$')) : undefined;
      if (!region || !fiberKey) {
        return 'no viewer fiber';
      }
      let root = (region as unknown as Record<string, Fiber>)[fiberKey]!;
      while (root.return) {
        root = root.return;
      }
      const isActor = (value: unknown): value is Actor =>
        typeof value === 'object' &&
        value !== null &&
        typeof (value as Actor).getSnapshot === 'function' &&
        typeof (value as Actor).subscribe === 'function';
      const cads = new Set<Actor>();
      const graphics = new Set<Actor>();
      let parameterService: { actor(path: string): Actor | undefined } | undefined;
      const consider = (value: unknown, depth: number): void => {
        if (typeof value !== 'object' || value === null) {
          return;
        }
        if (isActor(value)) {
          /* Not every actor-shaped value carries a context (a spawned callback, a stopped ref). */
          const context = (value.getSnapshot() as { context?: Record<string, unknown> } | undefined)?.context;
          if (context === undefined) {
            return;
          }
          if ('parameterRender' in context && 'telemetryEntries' in context) {
            cads.add(value);
          }
          if ('gltfPresentation' in context) {
            graphics.add(value);
          }
          return;
        }
        const service = (value as { parameterService?: { actor?: unknown } }).parameterService;
        if (typeof service?.actor === 'function') {
          parameterService = service as { actor(path: string): Actor | undefined };
        }
        if (depth > 0 && !Array.isArray(value)) {
          for (const key of Object.keys(value).slice(0, 60)) {
            try {
              consider((value as Record<string, unknown>)[key], depth - 1);
            } catch {
              // A getter threw; nothing to find there.
            }
          }
        }
      };
      const stack: Fiber[] = [root];
      for (let visited = 0; stack.length > 0 && visited < 200_000; visited += 1) {
        const fiber = stack.pop()!;
        consider(fiber.memoizedProps?.value, 1);
        let hook = fiber.memoizedState as { memoizedState?: unknown; next?: unknown } | null | undefined;
        for (let index = 0; hook && typeof hook === 'object' && 'next' in hook && index < 80; index += 1) {
          consider(hook.memoizedState, 1);
          hook = hook.next as typeof hook;
        }
        if (fiber.child) {
          stack.push(fiber.child);
        }
        if (fiber.sibling) {
          stack.push(fiber.sibling);
        }
      }
      const cad = [...cads].find((actor) => actor.getSnapshot().context['entryPath'] !== undefined) ?? [...cads][0];
      const entryPath = cad?.getSnapshot().context['entryPath'] as string | undefined;
      const parameters = entryPath === undefined ? undefined : parameterService?.actor(entryPath);
      if (!cad || graphics.size === 0 || !parameters) {
        return `cad=${cads.size} graphics=${graphics.size} parameters=${Boolean(parameters)}`;
      }
      probe.cad = cad;
      probe.graphics = [...graphics];
      for (const actor of probe.graphics) {
        let presentedKey = '';
        actor.subscribe((snapshot) => {
          const presentation = snapshot.context['gltfPresentation'] as { phase: string; presentedRevision?: number };
          const key = `${presentation.phase}:${String(presentation.presentedRevision)}`;
          if (key !== presentedKey && presentation.phase === 'presented') {
            requestAnimationFrame(() => {
              probe.frames.push(performance.now());
            });
          }
          presentedKey = key;
        });
      }
      parameters.on('settled', (event) => {
        probe.settled.push({ phase: probe.phase, t: performance.now(), status: event.outcome?.status ?? 'unknown' });
      });
      return 'attached';
    },
    waterfall(phase) {
      const t0 = probe.phaseStart[phase] ?? 0;
      const next = Object.values(probe.phaseStart)
        .filter((start) => start > t0)
        .sort((left, right) => left - right)[0];
      const inPhase = (t: number): boolean => t >= t0 && (next === undefined || t < next);
      const input = probe.events.find(
        (event) =>
          event.phase === phase &&
          ((event.type === 'keydown' && (event.key === 'Enter' || event.key === 'ArrowUp')) ||
            event.type === 'pointerup'),
      );
      const mark = (name: string): number | undefined =>
        performance.getEntriesByName(name, 'mark').find((entry) => inPhase(entry.startTime))?.startTime;
      const edit = mark('tau:parameter-edit');
      const settled = mark('tau:parameter-settled');
      const dispatch = mark('tau:parameter-dispatch');
      const spans = probe.telemetry();
      const render =
        dispatch === undefined
          ? undefined
          : spans.find((span) => span.name === 'kernel.render' && span.start + span.dur > dispatch);
      const children: Record<string, number> = {};
      if (render) {
        for (const span of spans) {
          if (
            span !== render &&
            span.start >= render.start - 0.5 &&
            span.start + span.dur <= render.start + render.dur + 0.5
          ) {
            children[span.name] = (children[span.name] ?? 0) + span.dur;
          }
        }
      }
      const renderEnd = render ? render.start + render.dur : undefined;
      const frame = renderEnd === undefined ? undefined : probe.frames.find((t) => t >= renderEnd);
      /* One physical write fans out as five notifications (the writer's, then the ingest re-publishes),
       * which a loaded machine delivers up to ~8 ms apart. ponytail: a 10 ms cluster window, so a second
       * write landing within 10 ms of the first reads as one; the runtime's staged re-write, when it
       * existed, landed 10–39 ms later, and kernel-worker tests pin the write count exactly. */
      let sidecarWrites = 0;
      let lastWrite = Number.NEGATIVE_INFINITY;
      const sidecarNotices: string[] = [];
      for (const write of probe.fsWrites) {
        if (write.phase === phase && write.path.includes('/.tau/parameters/')) {
          if (write.t - lastWrite >= 10) {
            sidecarWrites += 1;
          }
          lastWrite = write.t;
          sidecarNotices.push(`${Math.round(write.t - t0)}ms ${write.type} ${write.path}`);
        }
      }
      /* A middleware span wraps everything inside it; the resolver's own share is its span less the next one in. */
      const resolverWrap = children['middleware.wrap(ParameterFileResolver)'] ?? 0;
      const innerWrap = Math.max(
        0,
        ...Object.entries(children)
          .filter(([name, duration]) => name.startsWith('middleware.wrap(') && duration < resolverWrap)
          .map(([, duration]) => duration),
      );
      const frames = probe.loafs.filter((loaf) => loaf.phase === phase);
      const since = (from: number | undefined, to: number | undefined): number | undefined =>
        from === undefined || to === undefined ? undefined : to - from;
      return {
        inputToEdit: since(input?.ts, edit),
        inputToSettled: since(input?.ts, settled),
        settledToDispatch: since(settled, dispatch),
        dispatchToRender: since(dispatch, render?.start),
        kernelRender: render?.dur,
        machinery: render
          ? sum(machinerySpans.map((name) => children[name] ?? 0)) + resolverWrap - innerWrap
          : undefined,
        children,
        renderEndToFrame: since(renderEnd, frame),
        inputToFrame: since(input?.ts, frame),
        sidecarWrites,
        sidecarNotices,
        longFrames: frames.filter((loaf) => loaf.duration >= 50).length,
        maxFrame: Math.max(0, ...frames.map((loaf) => loaf.duration)),
      };
    },
  };
  scope.__TAU_PARAMETER_PERF__ = probe;

  const countCommit = (root: { current: Fiber }, dom: boolean): void => {
    const started = performance.now();
    const fibers: Partial<Record<Region, number>> = {};
    const rows = new Set<number>();
    const stack: Fiber[] = [root.current];
    while (stack.length > 0) {
      const fiber = stack.pop()!;
      const { alternate, tag } = fiber;
      /* Function, class, forwardRef and memo components: the fibers DevTools reports as rendered. */
      if (
        (tag === 0 || tag === 1 || tag === 11 || tag === 14 || tag === 15) &&
        // oxlint-disable-next-line no-bitwise -- `PerformedWork` is bit 0 of React's fiber flags.
        (alternate === null || (fiber.flags & 1) === 1)
      ) {
        const { region, row } = regionOf(fiber, dom);
        fibers[region] = (fibers[region] ?? 0) + 1;
        if (row !== undefined) {
          rows.add(row);
        }
      }
      if (fiber.sibling && fiber !== root.current) {
        stack.push(fiber.sibling);
      }
      if (fiber.child && (alternate === null || fiber.child !== alternate.child)) {
        stack.push(fiber.child);
      }
    }
    probe.commits.push({
      phase: probe.phase,
      t: started,
      urgent: eventTask,
      walkMs: performance.now() - started,
      fibers,
      rows: [...rows],
    });
  };
  const renderers = new Map<number, unknown>();
  (scope as unknown as Record<string, unknown>)['__REACT_DEVTOOLS_GLOBAL_HOOK__'] = {
    renderers,
    supportsFiber: true,
    isDisabled: false,
    inject(renderer: unknown) {
      rendererCount += 1;
      domRenderer ??= rendererCount;
      renderers.set(rendererCount, renderer);
      return rendererCount;
    },
    // eslint-disable-next-line @typescript-eslint/naming-convention -- React's DevTools hook contract names it.
    checkDCE: () => undefined,
    onScheduleFiberRoot: () => undefined,
    onPostCommitFiberRoot: () => undefined,
    onCommitFiberUnmount: () => undefined,
    onCommitFiberRoot(id: number, root: { current: Fiber }) {
      countCommit(root, id === domRenderer);
    },
  };

  /* Input → paint: the next frame after the event's task, observed from the task after that frame. */
  const nextTask = (callback: () => void): void => {
    const channel = new MessageChannel();
    channel.port1.addEventListener('message', callback);
    channel.port1.start();
    channel.port2.postMessage(undefined);
  };
  const onInput = (event: Event): void => {
    const record: EventRecord = {
      phase: probe.phase,
      type: event.type,
      key: event instanceof KeyboardEvent ? event.key : '',
      ts: event.timeStamp,
    };
    probe.events.push(record);
    /* A commit before this task ends is urgent work the event caused. */
    eventTask = true;
    nextTask(() => {
      eventTask = false;
    });
    requestAnimationFrame(() => {
      nextTask(() => {
        record.paint = performance.now();
      });
    });
  };
  for (const type of ['keydown', 'pointerdown', 'pointermove', 'pointerup']) {
    addEventListener(type, onInput, { capture: true });
  }
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as Array<
        PerformanceEntry & {
          blockingDuration?: number;
          scripts?: ReadonlyArray<{
            invoker?: string;
            sourceURL?: string;
            sourceCharPosition?: number;
            duration: number;
          }>;
        }
      >) {
        probe.loafs.push({
          phase: probe.phase,
          start: entry.startTime,
          duration: entry.duration,
          blocking: entry.blockingDuration ?? 0,
          scripts: (entry.scripts ?? []).map((script) => ({
            invoker: script.invoker ?? '',
            source: script.sourceURL ?? '',
            position: script.sourceCharPosition ?? -1,
            duration: script.duration,
          })),
        });
      }
    }).observe({ type: 'long-animation-frame', buffered: false });
  } catch {
    // Only Chromium reports Long Animation Frames; the budget then reads zero frames.
  }
  new BroadcastChannel('tau-fs-changes').addEventListener(
    'message',
    (event: MessageEvent<{ type?: string; path?: string }>) => {
      probe.fsWrites.push({
        phase: probe.phase,
        t: performance.now(),
        type: String(event.data.type ?? ''),
        path: String(event.data.path ?? ''),
      });
    },
  );
  let pillOn = false;
  const watchPill = (): void => {
    new MutationObserver(() => {
      /* The pill budget covers drags only; scanning on every mutation elsewhere would load the page. */
      if (!probe.phase.startsWith('drag')) {
        return;
      }
      const on = [...document.querySelectorAll('span.font-mono.capitalize')].some((element) =>
        /^(?:rendering|buffering)\.\.\.$/iu.test(String(element.textContent).trim()),
      );
      if (on !== pillOn) {
        pillOn = on;
        probe.pill.push({ phase: probe.phase, t: performance.now(), on });
      }
    }).observe(document, { childList: true, subtree: true, characterData: true });
  };
  watchPill();
};

const probeCall = async <Result, Argument>(
  callback: (probe: Probe, argument: Argument) => Result,
  argument: Argument,
  surface?: target.TargetSurface,
): Promise<Result> =>
  target.evaluate(
    ([source, value]) => {
      const probe = (globalThis as ProbeGlobal).__TAU_PARAMETER_PERF__;
      if (!probe) {
        throw new Error('The parameter performance probe is not installed.');
      }
      // oxlint-disable-next-line no-eval -- the callback crosses the command boundary as source, as every target evaluation does.
      return (globalThis.eval(`(${source})`) as (p: Probe, a: Argument) => Result)(probe, value);
    },
    [callback.toString(), argument] as const,
    surface,
  );

const setPhase = async (name: string): Promise<void> => {
  await probeCall((probe, value) => {
    probe.setPhase(value);
  }, name);
};

/** Wait until no React commit landed for `quietMs`, or `maxMs` passed (a page that never goes quiet is measured anyway). */
const settle = async (quietMs = 600, maxMs = 15_000): Promise<void> => {
  const started = await target.evaluate(() => performance.now());
  await target.waitFor(
    ([quiet, maximum, from]) => {
      const probe = (globalThis as ProbeGlobal).__TAU_PARAMETER_PERF__;
      const now = performance.now();
      return probe === undefined || now - from >= maximum || now - Math.max(probe.lastCommitAt(), from) >= quiet;
    },
    [quietMs, maxMs, started] as const,
    { timeout: maxMs + 10_000 },
  );
};

const openCommand = async (name: string, surface?: target.TargetSurface): Promise<void> => {
  await target.click(selectors.getByRole('button', { name: 'Search', exact: true }), undefined, surface);
  await target.fill(selectors.getByPlaceholder('Search projects, chats, and actions...'), name, surface);
  await target.click(selectors.getByText(name, { exact: true }), undefined, surface);
};

const openParameters = async (field: string, surface?: target.TargetSurface): Promise<void> => {
  await target.expectVisible(
    selectors.getByTestId('cad-viewer-canvas-region').getByCss('canvas').first(),
    120_000,
    surface,
  );
  await target
    .click(selectors.getByRole('button', { name: /^decline$/iu }), { timeout: 5000 }, surface)
    .catch(() => undefined);
  await openCommand('Open parameters', surface);
  await target.expectVisible(selectors.getByLabelText(field, { exact: true }).first(), 120_000, surface);
};

const beginMeasuring = async (fixture: Fixture): Promise<void> => {
  /* Stops the harness trace: its per-action screenshots and DOM snapshots load the page under test. */
  await target.commands.uiCaptureTargetDiagnostics();
  await target.addInitScript(installProbe);
  await target.setViewport({ width: 1440, height: 900 });
  await target.navigate(fixture.route);
  await openParameters(fixture.field);
  let attached = await probeCall((probe) => probe.attach(), undefined);
  if (attached !== 'attached') {
    await target.delay(3000);
    attached = await probeCall((probe) => probe.attach(), undefined);
  }
  expect(attached).toBe('attached');
  await settle(1000, 30_000);
};

const fieldValue = async (label: string, surface?: target.TargetSurface): Promise<number> => {
  const text = await target.evaluateLocator(
    selectors.getByLabelText(label, { exact: true }).first(),
    (element) => (element as HTMLInputElement).value,
    undefined,
    surface,
  );
  return Number(text.replaceAll(',', ''));
};

/** Commit `value` into the fixture's field and wait until it is on screen. */
const commitValue = async (fixture: Fixture, value: number): Promise<void> => {
  if ((await fieldValue(fixture.field)) === value) {
    return;
  }
  const input = selectors.getByLabelText(fixture.field, { exact: true }).first();
  await target.fill(input, String(value));
  await target.press(input, 'Enter');
  await target.waitFor(
    ([label, expected]) => {
      const probe = (globalThis as ProbeGlobal).__TAU_PARAMETER_PERF__;
      const element = document.querySelector<HTMLInputElement>(`[aria-label="${label}"]`);
      return Number(element?.value.replaceAll(',', '')) === expected && probe?.presented() === true;
    },
    [fixture.field, value] as const,
    { timeout: 30_000 },
  );
  await settle(800, 15_000);
};

const drive = async (
  fixture: Fixture,
  { kind, round, phase }: Readonly<{ kind: CommitKind; round: number; phase: string }>,
): Promise<void> => {
  const input = selectors.getByLabelText(fixture.field, { exact: true }).first();
  if (kind === 'enter') {
    await target.fill(input, String(Number((fixture.base + ((round % 4) + 1) * 0.37).toFixed(3))));
    await settle(300, 5000);
    await setPhase(phase);
    await target.press(input, 'Enter');
    return;
  }
  if (kind === 'arrow') {
    await target.focus(input);
    await settle(300, 5000);
    await setPhase(phase);
    await target.press(input, 'ArrowUp');
    return;
  }
  await target.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  });
  const box = await target.boundingBox(input);
  if (!box) {
    throw new Error(`${fixture.field} has no box to drag.`);
  }
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await target.mouseMove(x, y);
  await settle(300, 5000);
  await target.mouseDown();
  for (let step = 1; step <= 6; step += 1) {
    /* Always down: the fixtures' upper bounds sit close to the values the other kinds commit. */
    await target.mouseMove(x - step * 6, y);
  }
  await setPhase(phase);
  await target.mouseUp();
};

type Series = Readonly<{ count: number; p50: number; p95: number; max: number; coefficientOfVariation: number }>;

const total = (values: readonly number[]): number => {
  let sum = 0;
  for (const value of values) {
    sum += value;
  }
  return sum;
};

const summarize = (values: ReadonlyArray<number | undefined>): Series | undefined => {
  const present = values.filter((value): value is number => value !== undefined && Number.isFinite(value));
  if (present.length === 0) {
    return undefined;
  }
  const mean = total(present) / present.length;
  const deviation = Math.sqrt(total(present.map((value) => (value - mean) ** 2)) / present.length);
  return {
    count: present.length,
    p50: percentile(present, 0.5),
    p95: percentile(present, 0.95),
    max: Math.max(...present),
    coefficientOfVariation: mean === 0 ? 0 : deviation / mean,
  };
};

type BudgetResult = Readonly<{
  id: string;
  measure: string;
  statistic: 'max' | 'p50' | 'p95';
  limit: number;
  value?: number;
  series?: Series;
  binds: boolean;
  refusals: readonly string[];
}>;

const measurement = async () => {
  const environment = (import.meta as ImportMeta & { readonly env: Readonly<Record<string, string | undefined>> }).env;
  const profile = target.currentWebGpuProfile();
  const observed = await target.evaluate(() => ({
    crossOriginIsolated: globalThis.crossOriginIsolated,
    cpuCount: navigator.hardwareConcurrency,
  }));
  return readBenchmarkMeasurement(environment, {
    adapter: {
      api: profile === 'disabled' ? 'webgl' : 'webgpu',
      angle: 'default',
      name: profile,
      implementation: profile === 'hardware' ? 'hardware' : profile === 'software' ? 'software' : 'ambiguous',
    },
    ...observed,
  });
};

/**
 * A budget binds only when its series passes `budgetVerdict`. A count of long frames has no spread
 * to judge, so only the run's tags decide it.
 */
const judge = (
  tags: Awaited<ReturnType<typeof measurement>>,
  { id, measure, statistic, limit }: Pick<BudgetResult, 'id' | 'limit' | 'measure' | 'statistic'>,
  values: ReadonlyArray<number | undefined>,
): BudgetResult => {
  const series = summarize(values);
  const verdict = budgetVerdict({
    tags,
    coefficientOfVariation: statistic === 'max' ? 0 : series?.coefficientOfVariation,
  });
  const refusals = series ? verdict.refusals : [...verdict.refusals, 'series is empty'];
  return {
    id,
    measure,
    statistic,
    limit,
    value: series?.[statistic],
    series,
    binds: series !== undefined && verdict.eligible,
    refusals,
  };
};

type PhaseRenders = Readonly<{
  commits: number;
  urgentCommits: number;
  fibers: Partial<Record<Region, number>>;
  urgentFibers: Partial<Record<Region, number>>;
  rows: number;
  walkP95: number;
}>;

const readRenders = async (phases: readonly string[]): Promise<PhaseRenders[]> =>
  probeCall((probe, names) => {
    return names.map((name) => {
      const commits = probe.commits.filter((commit) => commit.phase === name);
      const fibers: Record<string, number> = {};
      const urgentFibers: Record<string, number> = {};
      const rows = new Set<number>();
      for (const commit of commits) {
        for (const [region, count] of Object.entries(commit.fibers)) {
          fibers[region] = (fibers[region] ?? 0) + count;
          if (commit.urgent) {
            urgentFibers[region] = (urgentFibers[region] ?? 0) + count;
          }
        }
        for (const row of commit.rows) {
          rows.add(row);
        }
      }
      const walks = commits.map((commit) => commit.walkMs).sort((left, right) => left - right);
      return {
        commits: commits.length,
        urgentCommits: commits.filter((commit) => commit.urgent).length,
        fibers,
        urgentFibers,
        rows: rows.size,
        walkP95: walks[Math.floor(walks.length * 0.95)] ?? 0,
      };
    });
  }, phases);

const readEvents = async (
  phase: string,
  type: string,
): Promise<{
  paints: number[];
  longFrames: number;
  maxFrame: number;
  pillOns: number;
  longFrameScripts: LoafScript[];
}> =>
  probeCall(
    (probe, [name, eventType]) => {
      const loafs = probe.loafs.filter((loaf) => loaf.phase === name);
      return {
        paints: probe.events
          .filter((event) => event.phase === name && event.type === eventType && event.paint !== undefined)
          .map((event) => (event.paint ?? event.ts) - event.ts),
        longFrames: loafs.filter((loaf) => loaf.duration >= 50).length,
        maxFrame: Math.max(0, ...loafs.map((loaf) => loaf.duration)),
        pillOns: probe.pill.filter((entry) => entry.phase === name && entry.on).length,
        longFrameScripts: loafs
          .filter((loaf) => loaf.duration >= 50)
          .flatMap((loaf) => loaf.scripts)
          .filter((script) => script.duration >= 5),
      };
    },
    [phase, type] as const,
  );

const writeReport = async (name: string, report: Readonly<Record<string, unknown>>): Promise<void> => {
  await target.writeArtifact(`parameters-pane-performance-${name}.json`, `${JSON.stringify(report, null, 2)}\n`);
};

const expectBudgets = (budgets: readonly BudgetResult[]): void => {
  for (const budget of budgets.filter((candidate) => candidate.binds)) {
    expect(budget.value, `${budget.id} ${budget.measure} ${budget.statistic}`).toBeLessThanOrEqual(budget.limit);
  }
};

for (const fixture of fixtures) {
  test(`should keep ${fixture.name} (${fixture.fields} fields) edits within the parameter budgets`, async () => {
    await beginMeasuring(fixture);
    const tags = await measurement();
    const input = selectors.getByLabelText(fixture.field, { exact: true }).first();

    /* G1: typing into a number field (the slider's display covers the input until it has focus). */
    await target.focus(input);
    await settle(300, 5000);
    await setPhase('typing');
    for (let round = 0; round < 5; round += 1) {
      for (const key of ['1', '2', 'Backspace', 'Backspace']) {
        await target.keyboardPress(key);
      }
    }
    await settle(300, 5000);
    await setPhase('typing-escape');
    await target.keyboardPress('Escape');
    await settle();

    /* G2–G7, G15: committed edits, interleaved so no kind always follows the same predecessor. */
    const waterfalls: Array<Waterfall & { kind: CommitKind; round: number }> = [];
    const commitPhases: string[] = [];
    for (let round = 0; round < commitRounds; round += 1) {
      for (const kind of commitKinds) {
        const phase = `commit-${kind}-${round}`;
        await drive(fixture, { kind, round, phase });
        /* A commit that never presents is recorded without a frame and fails the count below. */
        await target
          .waitFor(
            (name) => {
              const probe = (globalThis as ProbeGlobal).__TAU_PARAMETER_PERF__;
              return probe?.waterfall(name).inputToFrame !== undefined && probe.presented();
            },
            phase,
            { timeout: 30_000 },
          )
          .catch(() => undefined);
        await settle(800, 15_000);
        waterfalls.push({ kind, round, ...(await probeCall((probe, name) => probe.waterfall(name), phase)) });
        commitPhases.push(phase);
      }
    }
    const commitRenders = await readRenders(commitPhases);

    /* G8: a burst of three steps loses nothing. */
    const burstStart = fixture.base - 5;
    await commitValue(fixture, burstStart);
    await target.focus(input);
    await target.keyboardPress('ArrowUp');
    await settle(800, 15_000);
    const step = (await fieldValue(fixture.field)) - burstStart;
    expect(step, 'one ArrowUp moves the value').toBeGreaterThan(0);
    const bursts: Array<{ start: number; end: number; statuses: string[] }> = [];
    for (let round = 0; round < burstRounds; round += 1) {
      const phase = `burst-${round}`;
      await commitValue(fixture, burstStart);
      await target.focus(input);
      await settle(300, 5000);
      const start = await fieldValue(fixture.field);
      await setPhase(phase);
      for (let press = 0; press < 3; press += 1) {
        await target.keyboardPress('ArrowUp');
      }
      /* A lost step never reaches the target value; the wait then ends and the counts below say why. */
      await target
        .waitFor(
          ([label, expected]) => {
            const probe = (globalThis as ProbeGlobal).__TAU_PARAMETER_PERF__;
            const element = document.querySelector<HTMLInputElement>(`[aria-label="${label}"]`);
            return (
              Math.abs(Number(element?.value.replaceAll(',', '')) - expected) < 1e-9 && probe?.presented() === true
            );
          },
          [fixture.field, start + 3 * step] as const,
          { timeout: 30_000 },
        )
        .catch(() => undefined);
      await settle(800, 15_000);
      bursts.push({
        start,
        end: await fieldValue(fixture.field),
        statuses: await probeCall(
          (probe, name) => probe.settled.filter((entry) => entry.phase === name).map((entry) => entry.status),
          phase,
        ),
      });
    }

    /* G9, G10: a live drag, downwards from the fixture's base value. */
    await commitValue(fixture, fixture.base);
    const slider = selectors.getByCss(`[data-slot="slider-input"]:has([aria-label="${fixture.field}"])`).first();
    const bounds = await target.boundingBox(slider);
    if (!bounds) {
      throw new Error('The drag slider has no bounds.');
    }
    const y = bounds.y + bounds.height / 2;
    const x = bounds.x + bounds.width / 2;
    await target.evaluate(() => {
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
    });
    await target.mouseMove(x, y);
    await settle(300, 5000);
    await setPhase('drag');
    await target.mouseDown();
    await target.mouseMove(x - bounds.width / 5, y, { steps: dragSamples / 2 });
    await target.mouseMove(x - bounds.width / 10, y, { steps: dragSamples / 2 });
    await setPhase('drag-release');
    await target.mouseUp();
    await settle(800, 15_000);
    const drag = await readEvents('drag', 'pointermove');
    const [dragRenders] = await readRenders(['drag']);

    /* G12: typing a filter. */
    const filter = selectors.getByRole('searchbox', { name: 'Filter parameters' });
    await target.click(filter);
    await settle(300, 5000);
    await setPhase('filter');
    for (const key of fixture.filterText) {
      await target.keyboardPress(key === ' ' ? 'Space' : key);
    }
    await settle(300, 5000);
    const filtering = await readEvents('filter', 'keydown');
    const [filterRenders] = await readRenders(['filter']);
    await setPhase('filter-clear');
    await target.fill(filter, '');
    await settle();

    const typing = await readEvents('typing', 'keydown');
    const of = (kinds: readonly CommitKind[], pick: (entry: Waterfall) => number | undefined) =>
      waterfalls.filter((entry) => kinds.includes(entry.kind)).map((entry) => pick(entry));
    const all = commitKinds;
    const budgets = [
      judge(tags, { id: 'G1', measure: 'typing key → paint', statistic: 'p95', limit: 16 }, typing.paints),
      judge(
        tags,
        { id: 'G2', measure: 'input → settled', statistic: 'p50', limit: fixture.settledP50 },
        of(all, (entry) => entry.inputToSettled),
      ),
      judge(
        tags,
        { id: 'G3', measure: 'dispatch → kernel.render start', statistic: 'p95', limit: 2 },
        of(all, (entry) => entry.dispatchToRender),
      ),
      judge(
        tags,
        { id: 'G4', measure: 'parameter machinery in kernel.render', statistic: 'p50', limit: fixture.machineryP50 },
        of(all, (entry) => entry.machinery),
      ),
      judge(
        tags,
        { id: fixture.fields > 6 ? 'G6' : 'G5', measure: 'input → frame', statistic: 'p50', limit: fixture.frameP50 },
        of(all, (entry) => entry.inputToFrame),
      ),
      judge(tags, { id: 'G9', measure: 'drag long frames', statistic: 'max', limit: 0 }, [drag.longFrames]),
      judge(tags, { id: 'G9', measure: 'drag pointer → paint', statistic: 'p95', limit: 16 }, drag.paints),
      ...(fixture.fields > 6
        ? [
            judge(tags, { id: 'G12', measure: 'filter key → paint', statistic: 'p95', limit: 16 }, filtering.paints),
            judge(tags, { id: 'G12', measure: 'filter long frames', statistic: 'max', limit: 0 }, [
              filtering.longFrames,
            ]),
          ]
        : []),
    ];
    const series = Object.fromEntries(
      (
        [
          'inputToEdit',
          'inputToSettled',
          'settledToDispatch',
          'dispatchToRender',
          'kernelRender',
          'machinery',
          'renderEndToFrame',
          'inputToFrame',
          'maxFrame',
        ] as const
      ).flatMap((measure) =>
        commitKinds.map((kind) => [`${kind}.${measure}`, summarize(of([kind], (entry) => entry[measure]))]),
      ),
    );
    const counts = {
      commitsWithoutFrame: waterfalls.filter((entry) => entry.inputToFrame === undefined).length,
      sidecarWritesPerCommit: waterfalls.map((entry) => entry.sidecarWrites),
      fileTreeRendersPerCommit: commitRenders.map((renders) => renders.fibers['file-tree'] ?? 0),
      rowsRenderedPerCommit: commitRenders.map((renders) => renders.rows),
      /* A step a newer step displaces settles `cancelled-before-apply`; only a refusal loses an edit. */
      burstRejections: bursts.map((burst) => burst.statuses.filter((status) => status === 'rejected').length),
      burstLostSteps: bursts.map((burst) => Math.round((burst.start + 3 * step - burst.end) / step)),
      dragPillShows: drag.pillOns,
      filterUrgentRowRenders: filterRenders?.urgentFibers['parameter-row'] ?? 0,
    };
    await writeReport(fixture.name, {
      fixture: fixture.name,
      fields: fixture.fields,
      measurement: tags ?? null,
      budgets,
      counts,
      series,
      step,
      renders: { commit: commitRenders, drag: dragRenders, filter: filterRenders },
      drag,
      filtering,
      typing,
      waterfalls,
      bursts,
    });

    /* Deterministic: these bind in every run (G7, G8, G10, G15). */
    expect(counts.commitsWithoutFrame, 'every committed edit reached the screen').toBe(0);
    expect(
      counts.sidecarWritesPerCommit.every((writes) => writes === 1),
      'G7 one physical sidecar write per commit',
    ).toBe(true);
    expect(counts.burstRejections, 'G8 no rejected step in a burst').toEqual(bursts.map(() => 0));
    expect(counts.burstLostSteps, 'G8 every step of a burst lands').toEqual(bursts.map(() => 0));
    expect(counts.dragPillShows, 'G10 no status pill while dragging').toBe(0);
    expect(Math.max(...counts.fileTreeRendersPerCommit), 'G15 file tree renders per commit').toBe(0);
    expect(Math.max(...counts.rowsRenderedPerCommit), 'G15 parameter rows rendered per commit').toBeLessThanOrEqual(3);
    expect(counts.filterUrgentRowRenders, 'filter rows never render on the urgent lane').toBe(0);
    expectBudgets(budgets);
  }, 900_000);

  test(`should keep the ${fixture.name} tab responsive while another tab edits its parameters`, async () => {
    await beginMeasuring(fixture);
    const tags = await measurement();
    await target.openSecondary(await target.currentUrl());
    try {
      await target.setViewport({ width: 1440, height: 900 }, 'secondary');
      await openParameters(fixture.field, 'secondary');
      await settle(1000, 30_000);
      const secondaryInput = selectors.getByLabelText(fixture.field, { exact: true }).first();
      const rounds: Array<{
        seenMs: number;
        longFrames: number;
        maxFrame: number;
        longFrameScripts: LoafScript[];
        profile?: string;
      }> = [];
      /* The last round runs under the CPU profiler, so its timings are not budget samples. */
      for (let round = 0; round <= foreignRounds; round += 1) {
        const value = String(fixture.base - 1 - round);
        const phase = `foreign-${round}`;
        const profiled = round === foreignRounds;
        await target.fill(secondaryInput, value, 'secondary');
        await settle(300, 5000);
        await setPhase(phase);
        if (profiled) {
          await target.startCpuProfile();
        }
        const sentAt = await target.evaluate(() => Date.now(), undefined, 'secondary');
        await target.press(secondaryInput, 'Enter', 'secondary');
        const seenAt = await target.evaluate(
          async ([label, expected]) => {
            const started = performance.now();
            while (performance.now() - started < 30_000) {
              const element = document.querySelector<HTMLInputElement>(`[aria-label="${label}"]`);
              if (element?.value.replaceAll(',', '') === expected) {
                return performance.timeOrigin + performance.now();
              }
              await new Promise((resolve) => {
                requestAnimationFrame(resolve);
              });
            }
            return Number.NaN;
          },
          [fixture.field, value] as const,
        );
        await settle(800, 15_000);
        const profile = profiled ? await target.stopCpuProfile(`foreign-edit-${fixture.name}.cpuprofile`) : undefined;
        const frames = await readEvents(phase, 'keydown');
        rounds.push({
          seenMs: seenAt - sentAt,
          longFrames: frames.longFrames,
          maxFrame: frames.maxFrame,
          longFrameScripts: frames.longFrameScripts,
          ...(profile === undefined ? {} : { profile }),
        });
      }
      const timed = rounds.slice(0, foreignRounds);
      /* The same edit made in this tab, under the same load: the control that separates what a
       * foreign edit adds from what any committed edit costs here. */
      const primaryInput = selectors.getByLabelText(fixture.field, { exact: true }).first();
      const own: Array<{ longFrames: number; maxFrame: number; profile?: string }> = [];
      for (let round = 0; round <= foreignRounds; round += 1) {
        const phase = `own-${round}`;
        const profiled = round === foreignRounds;
        await target.fill(primaryInput, String(fixture.base - 6 - round));
        await settle(300, 5000);
        await setPhase(phase);
        if (profiled) {
          await target.startCpuProfile();
        }
        /* The keyboard, not a locator press: a press waits on actionability, which a blocked tab never reports. */
        await target.keyboardPress('Enter');
        await target.waitFor(
          (name) => {
            const probe = (globalThis as ProbeGlobal).__TAU_PARAMETER_PERF__;
            return probe?.waterfall(name).inputToFrame !== undefined && probe.presented();
          },
          phase,
          { timeout: 30_000 },
        );
        await settle(800, 15_000);
        const profile = profiled ? await target.stopCpuProfile(`own-edit-${fixture.name}.cpuprofile`) : undefined;
        const frames = await readEvents(phase, 'keydown');
        own.push({
          longFrames: frames.longFrames,
          maxFrame: frames.maxFrame,
          ...(profile === undefined ? {} : { profile }),
        });
      }
      const budgets = [
        judge(
          tags,
          { id: 'G13', measure: 'foreign edit long frames', statistic: 'max', limit: 0 },
          timed.map((round) => round.longFrames),
        ),
        judge(
          tags,
          { id: 'G13', measure: 'foreign edit → value seen', statistic: 'p95', limit: 250 },
          timed.map((round) => round.seenMs),
        ),
      ];
      const renders = await readRenders(rounds.map((_, round) => `foreign-${round}`));
      await writeReport(`${fixture.name}-foreign`, {
        fixture: fixture.name,
        fields: fixture.fields,
        measurement: tags ?? null,
        budgets,
        rounds,
        own,
        renders,
        ownRenders: await readRenders(own.map((_, round) => `own-${round}`)),
      });
      expect(
        rounds.every((round) => Number.isFinite(round.seenMs)),
        'every foreign edit reached this tab',
      ).toBe(true);
      expectBudgets(budgets);
    } finally {
      await target.closeSecondary();
    }
  }, 600_000);
}

/* oxlint-enable no-await-in-loop, tau-lint/no-time-unit-suffix, typescript/no-restricted-types -- file scope ends here. */
