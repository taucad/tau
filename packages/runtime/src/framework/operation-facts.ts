/**
 * Worker facts: the bounded summary of one operation that a worker sends after its terminal reply, and only while a
 * client observes.
 *
 * Nothing here runs on the span path. The walk reads the collector's slice for one operation, the heap read is one
 * hook call or one cached sample, and the parameter walk is bounded in work. With observation `off` none of it runs.
 */

import type { ParameterBinding, ParameterManifest } from '@taucad/parameters';
import type {
  RuntimeParameterFeature,
  RuntimePhase,
  RuntimeRealm,
  WorkerOperationFacts,
} from '#types/runtime-observation.types.js';
import type { TelemetryEntry } from '#types/runtime-wire.types.js';

/**
 * The framework's span-name → phase map, one entry per `kernel.*` span the framework starts outside tests. A span the
 * map does not name inherits the phase of its nearest named ancestor. The completeness test fails when a framework
 * `startSpan('kernel.…')` site is missing here, or a name here has no such site.
 *
 * `kernel.compute.publication` ends while the worker is idle, between operations, so it is in no operation's slice;
 * it is listed so the map stays complete.
 */
export const phaseOfSpan: ReadonlyMap<string, RuntimePhase> = new Map<string, RuntimePhase>([
  ['kernel.init', 'prepare'],
  ['kernel.load-module', 'prepare'],
  ['kernel.bundle', 'prepare'],
  ['kernel.bundler-init', 'prepare'],
  ['kernel.bundler-context-init', 'prepare'],
  ['kernel.detect-import', 'prepare'],
  ['kernel.detect-bundle', 'prepare'],
  ['kernel.resolve-deps', 'prepare'],
  ['kernel.load-middleware', 'prepare'],
  ['kernel.load-transcoders', 'prepare'],
  ['kernel.load-transcoder', 'prepare'],
  ['kernel.extract-params', 'resolve'],
  ['kernel.select', 'resolve'],
  ['kernel.compute', 'compute'],
  ['kernel.execute', 'compute'],
  ['kernel.mesh', 'mesh'],
  ['kernel.mesh-compute', 'mesh'],
  ['kernel.export-compute', 'export'],
  ['kernel.export-reheat', 'export'],
  ['kernel.compute.reuse', 'reuse'],
  ['kernel.compute.publication', 'reuse'],
]);

/** The roots the framework opens; they carry an operation and have no phase of their own. */
export const operationRootNames: ReadonlySet<string> = new Set([
  'kernel.bootstrap',
  'kernel.describe',
  'kernel.evaluate',
  'kernel.render',
  'kernel.export',
  'kernel.transcode',
]);

/** First-party middleware names; any other name is reported as `_OTHER` in `ran`. */
const knownMiddleware: ReadonlySet<string> = new Set([
  'ParameterCache',
  'ParameterUnits',
  'ParameterFileResolver',
  'GeometryCache',
  'GltfEdgeDetection',
  'DisplaySimplification',
]);

const wrapPrefix = 'middleware.wrap(';
const ranLimit = 8;

const spanIdOf = (entry: TelemetryEntry): string | undefined => {
  const id = entry.detail?.['spanId'];
  return typeof id === 'string' ? id : undefined;
};

const parentIdOf = (entry: TelemetryEntry): string | undefined => {
  const parent = entry.detail?.['parentSpanId'];
  return typeof parent === 'string' ? parent : undefined;
};

/** Ancestry facts of one span within an operation's subtree, memoised so the walk stays linear. */
type Placement = Readonly<{ inside: boolean; phase: RuntimePhase | undefined }>;

/**
 * Summarise one operation's spans: milliseconds per phase, middleware self-time, the middleware that ran and the
 * bundler that bundled the entry.
 *
 * Only spans under the operation's root count: a span of another operation that landed in the same slice is ignored
 * by its ancestry. The outermost named span of a subtree gives its phase; a `middleware.wrap(…)` span at any depth
 * contributes its self-time (its duration minus its direct children's) to `middleware` and, only when it sits under a
 * named span, takes that self-time out of that span's phase. Every phase is clamped at zero.
 *
 * @param entries - The operation's slice, as the collector holds it.
 * @param rootSpanId - The operation root's span id; without it every span in the slice counts.
 * @returns The walked facts.
 */
export const workerFactsFromEntries = (
  entries: readonly TelemetryEntry[],
  rootSpanId?: string,
): Pick<WorkerOperationFacts, 'phases' | 'middleware' | 'bundler'> => {
  const byId = new Map<string, TelemetryEntry>();
  const childSum = new Map<string, number>();
  for (const entry of entries) {
    const id = spanIdOf(entry);
    if (id !== undefined) {
      byId.set(id, entry);
    }
  }
  for (const entry of entries) {
    const parent = parentIdOf(entry);
    if (parent !== undefined && byId.has(parent)) {
      childSum.set(parent, (childSum.get(parent) ?? 0) + entry.duration);
    }
  }
  const placements = new Map<string, Placement>();
  const outside: Placement = { inside: false, phase: undefined };
  const placementOf = (entry: TelemetryEntry): Placement => {
    const id = spanIdOf(entry);
    if (id === undefined) {
      return rootSpanId === undefined ? { inside: true, phase: undefined } : outside;
    }
    const known = placements.get(id);
    if (known !== undefined) {
      return known;
    }
    let placement: Placement;
    if (id === rootSpanId) {
      placement = { inside: true, phase: undefined };
    } else {
      const parentId = parentIdOf(entry);
      const parent = parentId === undefined ? undefined : byId.get(parentId);
      if (parent === undefined) {
        placement = rootSpanId === undefined ? { inside: true, phase: undefined } : outside;
      } else {
        placements.set(id, outside); // A cycle guard: a span that reaches itself is outside.
        const above = placementOf(parent);
        placement = above.inside ? { inside: true, phase: above.phase ?? phaseOfSpan.get(parent.name) } : outside;
      }
    }
    placements.set(id, placement);
    return placement;
  };

  const phases: Partial<Record<RuntimePhase, number>> = {};
  let total = 0;
  let slowest = -1;
  let slowestId = '';
  const ran: string[] = [];
  let bundler: string | undefined;
  for (const entry of entries) {
    const { inside, phase: above } = placementOf(entry);
    if (!inside) {
      continue;
    }
    if (entry.name.startsWith(wrapPrefix)) {
      const self = entry.duration - (childSum.get(spanIdOf(entry) ?? '') ?? 0);
      const name = entry.name.slice(wrapPrefix.length, -1);
      total += self;
      const reported = knownMiddleware.has(name) ? name : '_OTHER';
      if (ran.length < ranLimit && !ran.includes(reported)) {
        ran.push(reported);
      }
      if (self > slowest) {
        slowest = self;
        slowestId = name;
      }
      if (above !== undefined) {
        phases[above] = (phases[above] ?? 0) - self;
      }
      continue;
    }
    if (bundler === undefined && entry.name === 'kernel.bundle') {
      const id = entry.detail?.['bundler.id'];
      if (typeof id === 'string' && id.length > 0) {
        bundler = id;
      }
    }
    const own = phaseOfSpan.get(entry.name);
    if (own !== undefined && above === undefined) {
      phases[own] = (phases[own] ?? 0) + entry.duration;
    }
  }
  for (const key of Object.keys(phases) as RuntimePhase[]) {
    phases[key] = Math.max(0, phases[key] ?? 0);
  }
  return {
    phases,
    ...(slowest < 0
      ? {}
      : { middleware: { total: Math.max(0, total), slowestId, slowest: Math.max(0, slowest), ran } }),
    ...(bundler === undefined ? {} : { bundler }),
  };
};

/**
 * The process's resident-set reader.
 *
 * @returns `process.memoryUsage.rss`, or `undefined` outside Node.
 */
const residentReader = (): (() => number) | undefined => {
  const { process: hostProcess } = globalThis as { process?: { memoryUsage?: { rss?: () => number } } };
  const rss = hostProcess?.memoryUsage?.rss;
  return typeof rss === 'function' ? () => rss.call(hostProcess?.memoryUsage) : undefined;
};

/**
 * The resident set of this process, sampled off the settle path.
 *
 * Node only. The first in-flight operation starts the sampler, whose first sample is taken on a later turn, so no
 * settle path pays the system call; samples follow every five seconds on a timer that never keeps the process alive,
 * and the timer lingers a minute after the worker goes idle so bursty use does not restart cold. A read at settle is a
 * variable read.
 */
export class ResidentSampler {
  private latestBytes: number | undefined;
  private timer: ReturnType<typeof setInterval> | undefined;
  private lingerTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly read: (() => number) | undefined;

  /** @param read - The resident-set reader; defaults to `process.memoryUsage.rss` where it exists. */
  public constructor(read: (() => number) | undefined = residentReader()) {
    this.read = read;
  }

  /** Bytes of the latest sample, or `undefined` before the first one lands. */
  public latest(): number | undefined {
    return this.latestBytes;
  }

  /** An operation started: sample while operations run. */
  public start(): void {
    if (this.read === undefined) {
      return;
    }
    if (this.lingerTimer !== undefined) {
      clearTimeout(this.lingerTimer);
      this.lingerTimer = undefined;
    }
    if (this.timer !== undefined) {
      return;
    }
    const first = setTimeout(() => {
      this.sample();
    }, 0);
    unref(first);
    this.timer = setInterval(() => {
      this.sample();
    }, 5000);
    unref(this.timer);
  }

  /** The worker went idle: keep sampling for a minute, then stop. */
  public idle(): void {
    if (this.timer === undefined || this.lingerTimer !== undefined) {
      return;
    }
    this.lingerTimer = setTimeout(() => {
      this.stop();
    }, 60_000);
    unref(this.lingerTimer);
  }

  /** Stop sampling now. */
  public stop(): void {
    if (this.timer !== undefined) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
    if (this.lingerTimer !== undefined) {
      clearTimeout(this.lingerTimer);
      this.lingerTimer = undefined;
    }
  }

  private sample(): void {
    try {
      this.latestBytes = this.read?.();
    } catch {
      this.latestBytes = undefined;
    }
  }
}

const unref = (timer: unknown): void => {
  // Node timers are objects with `unref`; browser timers are numbers.
  if (typeof timer === 'object' && timer !== null && 'unref' in timer && typeof timer.unref === 'function') {
    (timer as { unref: () => void }).unref();
  }
};

/** The heap sources {@link heapFacts} reads, cheapest first. */
export type HeapFactsInput = Readonly<{
  /** The kernel's observation-only hook. */
  observedHeapBytes: (() => number | undefined) | undefined;
  /** The kernel's recycling hook, read where a kernel already implements it, never extended. */
  heapBytes: (() => number | undefined) | undefined;
  /** Whether the kernel samples a native child process; its sample is overlaid after this read. */
  observesChild: boolean;
  /** Set by the worker host, never inferred from a client transport. */
  realm: RuntimeRealm;
  /** The cached resident sample of this process. */
  resident: () => number | undefined;
}>;

/**
 * Memory at settle, observation only: nothing read here feeds recycling or `rendering.heapBytes`.
 *
 * A kernel hook answers first. A native kernel's memory is its child process tree's, sampled asynchronously after
 * this read, so it starts from `none` rather than this process's resident set. Otherwise only a realm that owns its
 * process reports that process's resident set; a thread or the host's own thread reports `none`.
 *
 * @param input - The sources this worker has.
 * @returns The heap facts.
 */
export const heapFacts = (input: HeapFactsInput): Pick<WorkerOperationFacts, 'heapBytes' | 'heapSource' | 'realm'> => {
  let fromKernel: number | undefined;
  try {
    fromKernel = input.observedHeapBytes?.() ?? input.heapBytes?.();
  } catch {
    fromKernel = undefined;
  }
  if (fromKernel !== undefined && Number.isFinite(fromKernel) && fromKernel >= 0) {
    return { heapBytes: fromKernel, heapSource: 'kernel', realm: input.realm };
  }
  if (input.observesChild) {
    return { heapSource: 'none', realm: input.realm };
  }
  if (input.realm === 'utility' || input.realm === 'process') {
    const resident = input.resident();
    return resident === undefined
      ? { heapSource: 'none', realm: input.realm }
      : { heapBytes: resident, heapSource: 'resident', realm: input.realm };
  }
  return { heapSource: 'none', realm: input.realm };
};

/**
 * Resolve with a read, or with `undefined` once the bound passes or the read fails.
 *
 * @param read - The pending read.
 * @param bound - Milliseconds to wait at most.
 * @returns The value, or `undefined`.
 */
export const settleWithin = async <T>(read: Promise<T | undefined>, bound: number): Promise<T | undefined> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<undefined>((resolve) => {
    timer = setTimeout(() => {
      resolve(undefined);
    }, bound);
    unref(timer);
  });
  try {
    return await Promise.race([read.catch(() => undefined), expired]);
  } finally {
    clearTimeout(timer);
  }
};

/* ---------------------------------------------------------------------------------------------------------------- *
 * Parameter facts.                                                                                                 *
 * ---------------------------------------------------------------------------------------------------------------- */

/** Leaves walked at most. */
const leafLimit = 1000;
/** Milliseconds the walk may take at most; the clock is read once per 64 leaves. */
const walkBound = 0.1;
/** Characters of canonical form one structured leaf may take before it is counted as `unknown`. */
const canonicalBudget = 256;

type Template = Readonly<{ parts: readonly string[]; binding: ParameterBinding; wildcard: boolean }>;
const templatesByManifest = new WeakMap<ParameterManifest, readonly Template[]>();

const parsePointer = (pointer: string): string[] | undefined => {
  if (!pointer.startsWith('/')) {
    return undefined;
  }
  const parts = pointer.slice(1).split('/');
  if (parts.some((part) => /~(?![01])/u.test(part))) {
    return undefined;
  }
  return parts.map((part) => part.replaceAll('~1', '/').replaceAll('~0', '~'));
};

const templatesOf = (manifest: ParameterManifest): readonly Template[] => {
  const cached = templatesByManifest.get(manifest);
  if (cached !== undefined) {
    return cached;
  }
  const templates: Template[] = [];
  for (const [pointer, binding] of Object.entries(manifest.bindings)) {
    const parts = parsePointer(pointer);
    if (parts !== undefined && parts.length > 0) {
      templates.push({ parts, binding, wildcard: parts.includes('*') });
    }
  }
  templatesByManifest.set(manifest, templates);
  return templates;
};

const childOf = (value: unknown, part: string): unknown => {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }
  if (Array.isArray(value)) {
    if (!/^(?:0|[1-9]\d*)$/u.test(part)) {
      return undefined;
    }
    const index = Number(part);
    return index < value.length ? (value[index] as unknown) : undefined;
  }
  return Object.hasOwn(value, part) ? (value as Record<string, unknown>)[part] : undefined;
};

/** Receives one (default, resolved) leaf pair; returns `false` to stop the walk. */
type LeafVisitor = (fallback: unknown, value: unknown) => boolean;

/**
 * A walker over the (default, resolved) leaf pairs one binding template names, descending both values in lockstep. No
 * pointer string is built. A wildcard descends the longer of the two arrays, so a leaf the user added or removed counts
 * once.
 *
 * @param parts - The template's parsed parts.
 * @param visit - Receives each concrete leaf present on either side.
 * @returns A descent from one part with the default and resolved value there; it returns `false` once the visitor
 *   stopped the walk.
 */
const leafWalker = (
  parts: readonly string[],
  visit: LeafVisitor,
): ((index: number, fallback: unknown, value: unknown) => boolean) => {
  const descend = (index: number, fallback: unknown, value: unknown): boolean => {
    let left = fallback;
    let right = value;
    let at = index;
    while (at < parts.length && parts[at] !== '*') {
      left = childOf(left, parts[at]!);
      right = childOf(right, parts[at]!);
      if (left === undefined && right === undefined) {
        return true;
      }
      at++;
    }
    if (at === parts.length) {
      return visit(left, right);
    }
    const leftItems = Array.isArray(left) ? (left as unknown[]) : undefined;
    const rightItems = Array.isArray(right) ? (right as unknown[]) : undefined;
    const length = Math.max(leftItems?.length ?? 0, rightItems?.length ?? 0);
    for (let item = 0; item < length; item++) {
      const leftItem = leftItems?.[item];
      const rightItem = rightItems?.[item];
      const going = at === parts.length - 1 ? visit(leftItem, rightItem) : descend(at + 1, leftItem, rightItem);
      if (!going) {
        return false;
      }
    }
    return true;
  };
  return descend;
};

/**
 * Canonical JSON with sorted keys, abandoned once it passes the budget.
 *
 * @param value - A JSON value.
 * @param budget - Characters left; decremented as the form is built.
 * @returns The canonical form, or `undefined` once the budget is exhausted or the value is not JSON.
 */
const canonicalBounded = (value: unknown, budget: { left: number }): string | undefined => {
  if (value === null || typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') {
    const text = typeof value === 'number' && Object.is(value, -0) ? '0' : JSON.stringify(value);
    budget.left -= text.length;
    return budget.left < 0 ? undefined : text;
  }
  if (typeof value !== 'object') {
    return undefined;
  }
  const items: string[] = [];
  if (Array.isArray(value)) {
    for (const item of value as unknown[]) {
      const text = canonicalBounded(item, budget);
      if (text === undefined) {
        return undefined;
      }
      items.push(text);
    }
    budget.left -= items.length + 1;
    return budget.left < 0 ? undefined : `[${items.join(',')}]`;
  }
  for (const key of Object.keys(value).sort()) {
    const text = canonicalBounded((value as Record<string, unknown>)[key], budget);
    if (text === undefined) {
      return undefined;
    }
    budget.left -= key.length + 4;
    items.push(`${JSON.stringify(key)}:${text}`);
  }
  return budget.left < 0 ? undefined : `{${items.join(',')}}`;
};

/**
 * Count a manifest's concrete parameter leaves and how many differ from their default after resolution, with the
 * features its bindings use.
 *
 * Bounded in work: it stops at 1,000 leaves or 0.1 ms, whichever comes first, and says so with `truncated`. Two
 * primitives are compared directly; a structured leaf through a canonical form capped per leaf, and one too large to
 * compare is counted as `unknown` while the walk continues.
 *
 * @param manifest - The manifest the evaluation used.
 * @param resolved - The values the kernel received, after unit resolution.
 * @returns Counts only: no names, values or types.
 */
export const parameterFacts = (
  manifest: ParameterManifest,
  resolved: Readonly<Record<string, unknown>>,
): NonNullable<WorkerOperationFacts['parameters']> => {
  const deadline = performance.now() + walkBound;
  const budget = { left: 0 };
  const features = new Set<RuntimeParameterFeature>();
  // One mutable tally: the visitor writes it, so no flow narrowing hides its updates from the return.
  const tally = { declared: 0, modified: 0, unknown: 0, truncated: false };
  const visit: LeafVisitor = (fallback, value) => {
    if (tally.declared >= leafLimit || (tally.declared % 64 === 63 && performance.now() > deadline)) {
      tally.truncated = true;
      return false;
    }
    tally.declared++;
    if (value === fallback) {
      return true;
    }
    if ((typeof value !== 'object' || value === null) && (typeof fallback !== 'object' || fallback === null)) {
      tally.modified++;
      return true;
    }
    features.add('structured');
    budget.left = canonicalBudget;
    const left = canonicalBounded(value, budget);
    budget.left = canonicalBudget;
    const right = canonicalBounded(fallback, budget);
    if (left === undefined || right === undefined) {
      tally.unknown++;
    } else if (left !== right) {
      tally.modified++;
    }
    return true;
  };
  for (const { parts, binding, wildcard } of templatesOf(manifest)) {
    if (binding.unit !== undefined) {
      features.add('units');
    }
    if (binding.representation === 'decimal') {
      features.add('decimal');
    }
    if (wildcard) {
      features.add('array');
    }
    if (!leafWalker(parts, visit)(0, manifest.defaults, resolved)) {
      break;
    }
  }
  return {
    declared: tally.declared,
    modified: tally.modified,
    ...(tally.unknown > 0 ? { unknown: tally.unknown } : {}),
    ...(tally.truncated ? { truncated: true } : {}),
    ...(features.size > 0 ? { features: [...features] } : {}),
  };
};
