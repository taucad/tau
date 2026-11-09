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
        slowestId = reported;
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
  private firstTimer: ReturnType<typeof setTimeout> | undefined;
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
    this.firstTimer = setTimeout(() => {
      this.firstTimer = undefined;
      this.sample();
    }, 0);
    unref(this.firstTimer);
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
    if (this.firstTimer !== undefined) {
      clearTimeout(this.firstTimer);
      this.firstTimer = undefined;
    }
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

/** What the parameter walk reads of a manifest. */
type ParameterFactsManifest = Pick<ParameterManifest, 'bindings' | 'defaults'>;
type Template = Readonly<{ parts: readonly string[]; binding: ParameterBinding; wildcard: boolean }>;
const templatesByManifest = new WeakMap<ParameterFactsManifest, readonly Template[]>();

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

const templatesOf = (manifest: ParameterFactsManifest): readonly Template[] => {
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

/**
 * Whether a value has a canonical form (JSON with sorted keys) within the leaf budget. The form is never built: every
 * primitive costs the length of its JSON text, an array one character more than its item count and an object key four
 * more than its length.
 *
 * @param value - A leaf's default or resolved value.
 * @param walk - The characters `left`, decremented by the cost.
 * @returns `false` when the value holds something that is not JSON or its cost passes the budget.
 */
const fits = (value: unknown, walk: { left: number }): boolean => {
  switch (typeof value) {
    case 'number': {
      // `JSON.stringify` writes a finite number as `String` does, `-0` as `0`, and any other number as `null`.
      walk.left -= Number.isFinite(value) ? String(value).length : 4;
      break;
    }
    case 'boolean': {
      walk.left -= value ? 4 : 5;
      break;
    }
    case 'string': {
      walk.left -= JSON.stringify(value).length;
      break;
    }
    case 'object': {
      if (value === null) {
        walk.left -= 4;
      } else if (Array.isArray(value)) {
        for (const item of value as unknown[]) {
          if (!fits(item, walk)) {
            return false;
          }
        }
        walk.left -= value.length + 1;
      } else {
        for (const key of Object.keys(value)) {
          if (!fits((value as Record<string, unknown>)[key], walk)) {
            return false;
          }
          walk.left -= key.length + 4;
        }
      }
      break;
    }
    default: {
      return false;
    }
  }
  return walk.left >= 0;
};

/**
 * Whether a value writes JSON `null`: `null` itself or a number that is not finite.
 *
 * @param value - A JSON value.
 * @returns Whether it does.
 */
const writesNull = (value: unknown): boolean =>
  value === null || (typeof value === 'number' && !Number.isFinite(value));

/**
 * Whether two values that both {@link fits | fit} have the same canonical form, compared without building it: equal
 * primitives write the same text and distinct ones only `null`, arrays match item by item, and objects match on their
 * own enumerable keys in any order.
 *
 * @param left - A JSON value.
 * @param right - A JSON value.
 * @returns Whether their canonical forms are equal.
 */
const sameCanonical = (left: unknown, right: unknown): boolean => {
  if (left === right) {
    return true;
  }
  if (typeof left !== 'object' || left === null || typeof right !== 'object' || right === null) {
    return writesNull(left) && writesNull(right);
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    const items = left as unknown[];
    const others = right as unknown[];
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      items.length === others.length &&
      items.every((item, index) => sameCanonical(item, others[index]))
    );
  }
  const keys = Object.keys(left);
  return (
    keys.length === Object.keys(right).length &&
    keys.every(
      (key) =>
        Object.prototype.propertyIsEnumerable.call(right, key) &&
        sameCanonical((left as Record<string, unknown>)[key], (right as Record<string, unknown>)[key]),
    )
  );
};

/**
 * One walk over a manifest's leaves: its tally, the features its bindings and leaves use, its deadline, the template
 * being walked and the canonical-form budget left for the value being measured. One object per walk, so the walk
 * allocates no closure per template.
 */
class ParameterWalk {
  public declared = 0;
  public modified = 0;
  public unknown = 0;
  public truncated = false;
  public readonly features = new Set<RuntimeParameterFeature>();
  /** The parts of the template being walked. */
  public parts: readonly string[] = [];
  /** Characters of canonical form left for the value being measured. */
  public left = 0;
  readonly #deadline = performance.now() + walkBound;

  /**
   * Count one (default, resolved) leaf pair. Two primitives are compared directly; a structured leaf through its
   * canonical form, and one too large to compare is counted as `unknown`.
   *
   * @param fallback - The default.
   * @param value - The resolved value.
   * @returns `false` once the walk must stop.
   */
  public visit(fallback: unknown, value: unknown): boolean {
    if (this.declared >= leafLimit || (this.declared % 64 === 63 && performance.now() > this.#deadline)) {
      this.truncated = true;
      return false;
    }
    this.declared++;
    if (value === fallback) {
      return true;
    }
    if ((typeof value !== 'object' || value === null) && (typeof fallback !== 'object' || fallback === null)) {
      this.modified++;
      return true;
    }
    this.features.add('structured');
    this.left = canonicalBudget;
    const valueFits = fits(value, this);
    this.left = canonicalBudget;
    if (!valueFits || !fits(fallback, this)) {
      this.unknown++;
    } else if (!sameCanonical(value, fallback)) {
      this.modified++;
    }
    return true;
  }

  /**
   * Visit the (default, resolved) leaf pairs the template names from one part on, descending both values in lockstep.
   * No pointer string is built. A wildcard descends the longer of the two arrays, so a leaf the user added or removed
   * counts once.
   *
   * @param index - The part to descend from.
   * @param fallback - The default value there.
   * @param value - The resolved value there.
   * @returns `false` once the walk stopped.
   */
  public descend(index: number, fallback: unknown, value: unknown): boolean {
    const { parts } = this;
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
      return this.visit(left, right);
    }
    const leftItems = Array.isArray(left) ? (left as unknown[]) : undefined;
    const rightItems = Array.isArray(right) ? (right as unknown[]) : undefined;
    const length = Math.max(leftItems?.length ?? 0, rightItems?.length ?? 0);
    const last = at === parts.length - 1;
    for (let item = 0; item < length; item++) {
      const leftItem = leftItems?.[item];
      const rightItem = rightItems?.[item];
      if (!(last ? this.visit(leftItem, rightItem) : this.descend(at + 1, leftItem, rightItem))) {
        return false;
      }
    }
    return true;
  }
}

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
  manifest: ParameterFactsManifest,
  resolved: Readonly<Record<string, unknown>>,
): NonNullable<WorkerOperationFacts['parameters']> => {
  const walk = new ParameterWalk();
  const { features } = walk;
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
    walk.parts = parts;
    if (!walk.descend(0, manifest.defaults, resolved)) {
      break;
    }
  }
  return {
    declared: walk.declared,
    modified: walk.modified,
    ...(walk.unknown > 0 ? { unknown: walk.unknown } : {}),
    ...(walk.truncated ? { truncated: true } : {}),
    ...(features.size > 0 ? { features: [...features] } : {}),
  };
};
