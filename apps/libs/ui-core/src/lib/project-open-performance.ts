import { randomUuid } from '@taucad/utils/id';

/** User Timing phases shared by the project-opening measurement contract, each measured as `tau.load.<phase>`. */
export type ProjectOpenPhase =
  | 'document'
  | 'bootstrap'
  | 'route.acquire'
  | 'route.commit'
  | 'shell.useful'
  | 'input.ready'
  | 'storage.resolve'
  | 'worker.boot'
  | 'worker.connect'
  | 'authority.ready'
  | 'discovery'
  | 'target.resolve'
  | 'access.check'
  | 'session.flush'
  | 'session.admit'
  | 'tree.list'
  | 'manifest.read'
  | 'records.read'
  | 'source.ready'
  | 'editor.ready'
  | 'runtime.connect'
  | 'model.preview'
  | 'model.current'
  | 'composer.mount'
  | 'editor.runtime'
  | 'editor.mount'
  | 'viewer.mount'
  | 'viewer.renderer'
  | 'viewer.firstFrame'
  | 'viewer.gizmo'
  | 'canvas.2d'
  | 'frame.long';

/**
 * Who acquired a `canvas.2d` context; the viewer tags its own. An untagged context inside `viewer.gizmo` belongs to
 * the gizmo package.
 */
export type ProjectOpenSource = 'gizmo.face' | 'gizmo.axis-label' | 'gizmo.style' | 'section.label';

/** A compact outcome vocabulary; no exception text reaches User Timing detail. */
export type ProjectOpenOutcome = 'ok' | 'error' | 'cancelled' | 'unavailable' | 'superseded' | 'missing';

/** Only numeric, aggregate counters are admitted. `blocking` is a long frame's blocking time, in milliseconds. */
export type ProjectOpenCounterName =
  | 'backendReads'
  | 'idbTransactions'
  | 'manifestReads'
  | 'manifestResults'
  | 'directoryEntries'
  | 'workerCount'
  | 'subscriptions'
  | 'eventFanout'
  | 'cacheHits'
  | 'scanGenerations'
  | 'invalidations'
  | 'bytes'
  | 'projectCount'
  | 'fileCount'
  | 'blocking'
  | 'scripts';

export type ProjectOpenCounters = Partial<Record<ProjectOpenCounterName, number>>;

/** Injected only by a local measurement harness; no automatic enablement or export. */
export type ProjectOpenPerformanceConfig = Readonly<{
  enabled: true;
  origin: string;
  runId: string;
  journeyId: string;
  buildId: string;
  fixtureId: string;
  routeTemplate: string;
  profile: 'desktop' | 'mobile';
  cacheCohort: 'cold' | 'warm' | 'fresh-storage' | 'initialized-storage';
  realm: 'page' | 'dedicated-worker' | 'shared-worker' | 'service-worker';
}>;

/** One idempotent span completion. */
export type ProjectOpenSpan = Readonly<{
  spanId: string;
  finish: (outcome: ProjectOpenOutcome, counters?: ProjectOpenCounters) => void;
}>;

/** A span another owner already timed, in this realm's `performance.now()` clock. */
export type ProjectOpenTimedSpan = Readonly<{
  start: number;
  end: number;
  outcome: ProjectOpenOutcome;
  source?: ProjectOpenSource;
  counters?: ProjectOpenCounters;
}>;

/**
 * Where a page's measures came from: `local` is an admitted loopback harness injection, `deployed` is any browser page
 * without one, whose measures carry no harness identifiers and stay in that page's own timeline.
 */
export type ProjectOpenEnvironment = 'local' | 'deployed';

/** Internal, inert when no valid local measurement configuration was injected. */
export type ProjectOpenPerformance = Readonly<{
  begin: (phase: ProjectOpenPhase, parentSpanId?: string) => ProjectOpenSpan;
  /** Emit a span whose start and end were read by its owner, such as the viewer. */
  record: (phase: ProjectOpenPhase, span: ProjectOpenTimedSpan) => void;
}>;

const phaseNames = new Set<ProjectOpenPhase>([
  'document',
  'bootstrap',
  'route.acquire',
  'route.commit',
  'shell.useful',
  'input.ready',
  'storage.resolve',
  'worker.boot',
  'worker.connect',
  'authority.ready',
  'discovery',
  'target.resolve',
  'access.check',
  'session.flush',
  'session.admit',
  'tree.list',
  'manifest.read',
  'records.read',
  'source.ready',
  'editor.ready',
  'runtime.connect',
  'model.preview',
  'model.current',
  'composer.mount',
  'editor.runtime',
  'editor.mount',
  'viewer.mount',
  'viewer.renderer',
  'viewer.firstFrame',
  'viewer.gizmo',
  'canvas.2d',
  'frame.long',
]);
const sources: ReadonlySet<string> = new Set<ProjectOpenSource>([
  'gizmo.face',
  'gizmo.axis-label',
  'gizmo.style',
  'section.label',
]);
const outcomes: ReadonlySet<string> = new Set<ProjectOpenOutcome>([
  'ok',
  'error',
  'cancelled',
  'unavailable',
  'superseded',
  'missing',
]);

const counterNames = new Set<string>([
  'backendReads',
  'idbTransactions',
  'manifestReads',
  'manifestResults',
  'directoryEntries',
  'workerCount',
  'subscriptions',
  'eventFanout',
  'cacheHits',
  'scanGenerations',
  'invalidations',
  'bytes',
  'projectCount',
  'fileCount',
  'blocking',
  'scripts',
]);

const uuidPattern = /^[\da-f]{8}-[\da-f]{4}-[1-8][\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/iu;
const fixturePattern = /^(?:none|root-(?:10|1000|10000)|library-(?:1|20|64|500))$/u;
const routeTemplates = new Set(['/', '/w/:workspace/:project', '/projects', '/projects/new']);
const localConfigSlot = '__TAU_LOCAL_PROJECT_OPEN_PERFORMANCE__';
/**
 * The most measures a deployed page writes. User Timing keeps every measure until it is cleared, so a long session must
 * not grow the timeline; one project open writes a few dozen.
 */
const deployedMeasureLimit = 256;
const noopSpan: ProjectOpenSpan = { spanId: '', finish: () => undefined };
const disabled: ProjectOpenPerformance = { begin: () => noopSpan, record: () => undefined };

const sanitizedCounters = (counters: ProjectOpenCounters | undefined): ProjectOpenCounters => {
  const result: Record<string, number> = {};
  if (counters === undefined) {
    return result;
  }
  for (const [name, value] of Object.entries(counters)) {
    if (
      counterNames.has(name) &&
      typeof value === 'number' &&
      Number.isSafeInteger(value) &&
      value >= 0 &&
      value <= 1_000_000_000_000
    ) {
      result[name] = value;
    }
  }
  return result;
};

const currentOrigin = (): string | undefined => {
  try {
    const location: unknown = Reflect.get(globalThis, 'location');
    if (typeof location !== 'object' || location === null) {
      return undefined;
    }
    const origin: unknown = Reflect.get(location, 'origin');
    return typeof origin === 'string' ? origin : undefined;
  } catch {
    return undefined;
  }
};

/** A browser page with an http(s) origin; false in server rendering and in workers. */
const isBrowserPage = (): boolean => {
  try {
    const document: unknown = Reflect.get(globalThis, 'document');
    const origin = currentOrigin();
    if (typeof document !== 'object' || document === null || origin === undefined) {
      return false;
    }
    const { protocol } = new URL(origin);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
};

const admittedConfig = (raw: unknown): Readonly<ProjectOpenPerformanceConfig> | undefined => {
  if (typeof raw !== 'object' || raw === null) {
    return undefined;
  }
  try {
    const values = raw as Record<string, unknown>;
    const { enabled, origin, runId, journeyId, buildId, fixtureId, routeTemplate, profile, cacheCohort, realm } =
      values;
    if (
      enabled !== true ||
      typeof origin !== 'string' ||
      typeof runId !== 'string' ||
      typeof journeyId !== 'string' ||
      typeof buildId !== 'string' ||
      typeof fixtureId !== 'string' ||
      typeof routeTemplate !== 'string' ||
      (profile !== 'desktop' && profile !== 'mobile') ||
      (cacheCohort !== 'cold' &&
        cacheCohort !== 'warm' &&
        cacheCohort !== 'fresh-storage' &&
        cacheCohort !== 'initialized-storage') ||
      (realm !== 'page' && realm !== 'dedicated-worker' && realm !== 'shared-worker' && realm !== 'service-worker')
    ) {
      return undefined;
    }
    const declared = new URL(origin);
    const actualOrigin = currentOrigin();
    if (actualOrigin === undefined) {
      return undefined;
    }
    const actual = new URL(actualOrigin);
    if (
      declared.origin !== actual.origin ||
      !['localhost', '127.0.0.1', '[::1]'].includes(declared.hostname) ||
      (declared.protocol !== 'http:' && declared.protocol !== 'https:') ||
      !uuidPattern.test(runId) ||
      !uuidPattern.test(journeyId) ||
      !/^(?:\d{1,20}|[\da-f]{7,64})$/iu.test(buildId) ||
      !fixturePattern.test(fixtureId) ||
      !routeTemplates.has(routeTemplate)
    ) {
      return undefined;
    }
    return Object.freeze({
      enabled: true,
      origin: declared.origin,
      runId,
      journeyId,
      buildId,
      fixtureId,
      routeTemplate,
      profile,
      cacheCohort,
      realm,
    });
  } catch {
    return undefined;
  }
};

/**
 * One recorder. Each finished span is one synchronous `performance.measure`; nothing is observed, scheduled or sent.
 *
 * @param harness - The admitted harness configuration, or undefined on a deployed page, whose detail then carries null
 *   for every harness identifier.
 * @param limit - The most measures this recorder writes; unbounded for an admitted harness, which clears its own.
 * @returns The begin/finish recorder.
 */
const createRecorder = (
  harness: Readonly<ProjectOpenPerformanceConfig> | undefined,
  limit: number,
): ProjectOpenPerformance => {
  const environment: ProjectOpenEnvironment = harness === undefined ? 'deployed' : 'local';
  // Read once, so a span pays no per-field work for the identifiers.
  const identity = Object.freeze({
    runId: harness?.runId ?? null,
    journeyId: harness?.journeyId ?? null,
    buildId: harness?.buildId ?? null,
    fixtureId: harness?.fixtureId ?? null,
    routeTemplate: harness?.routeTemplate ?? null,
    environment,
    profile: harness?.profile ?? null,
    cacheCohort: harness?.cacheCohort ?? null,
    realm: harness?.realm ?? 'page',
  });
  let remaining = limit;
  const emit = (
    phase: ProjectOpenPhase,
    ids: Readonly<{ spanId: string; parentSpanId: string | undefined }>,
    span: ProjectOpenTimedSpan,
  ): void => {
    const { spanId, parentSpanId } = ids;
    try {
      if (remaining <= 0 || !outcomes.has(span.outcome) || !Number.isFinite(span.start) || !Number.isFinite(span.end)) {
        return;
      }
      remaining--;
      const { start } = span;
      const end = Math.max(start, span.end);
      performance.measure(`tau.load.${phase}`, {
        start,
        end,
        detail: {
          schemaVersion: 1,
          runId: identity.runId,
          journeyId: identity.journeyId,
          spanId,
          parentSpanId: parentSpanId ?? null,
          phase,
          buildId: identity.buildId,
          fixtureId: identity.fixtureId,
          routeTemplate: identity.routeTemplate,
          environment: identity.environment,
          profile: identity.profile,
          cacheCohort: identity.cacheCohort,
          realm: identity.realm,
          timeOrigin: performance.timeOrigin,
          start,
          duration: end - start,
          outcome: span.outcome,
          source: span.source !== undefined && sources.has(span.source) ? span.source : null,
          counters: sanitizedCounters(span.counters),
        },
      });
    } catch {
      // Diagnostic measurement must never affect an owning operation.
    }
  };
  return {
    begin: (phase, parentSpanId) => {
      if (remaining <= 0 || !phaseNames.has(phase) || (parentSpanId !== undefined && !uuidPattern.test(parentSpanId))) {
        return noopSpan;
      }
      let start: number;
      let spanId: string;
      try {
        start = performance.now();
        spanId = randomUuid();
      } catch {
        return noopSpan;
      }
      let finished = false;
      return {
        spanId,
        finish: (outcome, counters) => {
          if (finished) {
            return;
          }
          finished = true;
          let end: number;
          try {
            end = performance.now();
          } catch {
            return;
          }
          emit(phase, { spanId, parentSpanId }, { start, end, outcome, counters });
        },
      };
    },
    record: (phase, span) => {
      if (remaining <= 0 || !phaseNames.has(phase)) {
        return;
      }
      let spanId: string;
      try {
        spanId = randomUuid();
      } catch {
        return;
      }
      emit(phase, { spanId, parentSpanId: undefined }, span);
    },
  };
};

/**
 * Build a synchronous, local-only timing adapter. Invalid or absent injection is inert.
 * User Timing detail carries aggregate identifiers and counters only; it never
 * receives a project ID, name, source path, URL, or exception message.
 *
 * @param config - Explicit harness configuration for this page or worker realm.
 * @returns A begin/finish recorder, inert outside an admitted loopback origin.
 */
export const createProjectOpenPerformance = (config?: ProjectOpenPerformanceConfig): ProjectOpenPerformance => {
  const admitted = admittedConfig(config);
  if (admitted === undefined) {
    return disabled;
  }
  return createRecorder(admitted, Number.POSITIVE_INFINITY);
};

/**
 * Read the one explicit harness injection slot, without creating a collector.
 * The returned recorder has already copied and validated every emitted field.
 *
 * @returns An admitted local recorder, or undefined when no valid injection exists.
 */
export const readLocalProjectOpenPerformance = (): ProjectOpenPerformance | undefined => {
  try {
    const raw: unknown = Reflect.get(globalThis, localConfigSlot);
    const admitted = admittedConfig(raw);
    return admitted === undefined ? undefined : createProjectOpenPerformance(admitted);
  } catch {
    return undefined;
  }
};

type PageRecorder = Readonly<{ recorder: ProjectOpenPerformance; environment: ProjectOpenEnvironment | undefined }>;

let pageRecorder: PageRecorder | undefined;

const readPageRecorder = (): PageRecorder => {
  if (pageRecorder !== undefined) {
    return pageRecorder;
  }
  const local = readLocalProjectOpenPerformance();
  if (local !== undefined) {
    pageRecorder = { recorder: local, environment: 'local' };
  } else if (isBrowserPage()) {
    pageRecorder = { recorder: createRecorder(undefined, deployedMeasureLimit), environment: 'deployed' };
  } else {
    pageRecorder = { recorder: disabled, environment: undefined };
  }
  return pageRecorder;
};

/**
 * This page's recorder, chosen once: the admitted harness injection; otherwise, on any browser page, a deployed
 * recorder that writes at most 256 `tau.load.*` measures with no harness identifiers and sends nothing anywhere;
 * otherwise (server rendering, a worker) the inert recorder. Owners that are not handed a recorder, such as the
 * composer and the code editor, time themselves through this.
 *
 * @returns The page's recorder.
 */
export const pageProjectOpenPerformance = (): ProjectOpenPerformance => readPageRecorder().recorder;

/**
 * Which recorder {@link pageProjectOpenPerformance} chose.
 *
 * @returns `local` for an admitted harness, `deployed` for any other browser page, undefined where it is inert.
 */
export const pageProjectOpenEnvironment = (): ProjectOpenEnvironment | undefined => readPageRecorder().environment;

/** Test seam: choose the page recorder again on the next {@link pageProjectOpenPerformance}. */
export const resetPageProjectOpenPerformance = (): void => {
  pageRecorder = undefined;
};
