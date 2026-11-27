/**
 * Live operation tier: the resident cache behind Replicad's operation cache seam (audit R6, R7).
 *
 * Replicad routes every public operation that user code calls through the installed `OperationCache`
 * (`setOperationCache`). This tier keys each call by its lineage — the operation, its receiver's identity
 * and its canonical arguments — qualified by occurrence: the n-th call with one lineage in a build is its
 * own entry, so a build with the tier hands user code exactly the geometry a build without it computes
 * (byte parity, audit Q2). A hit hands user code a fresh alias (`clone()`) of the entry's retained alias;
 * OCCT reference-counts the shared `TShape`, so no ownership bookkeeping exists here.
 *
 * Retention: every entry records the generation (successful build) that last used it. An entry unused for
 * `decayGenerations` builds is evicted. The entry count and the entries' estimated resident bytes are capped:
 * under pressure the least recently used entries without live dependents go first (`entry-cost.ts`). Evicting
 * deletes the alias the entry owns, exactly once. A worker recycle remains the backstop for memory (audit Q5).
 *
 * @internal
 */
import type * as ReplicadModule from 'replicad';
import type { OperationCache, OperationRequest, OperationStep } from 'replicad';
import { isWebAssemblyException } from '@taucad/runtime/kernel';
import { sha256BytesSync, sha256StringSync } from '@taucad/utils/hash';
import { createEntryCost } from '#live-tier/entry-cost.js';
import { isUseAfterRelease } from '#build-epochs.js';

type ReplicadLibrary = typeof ReplicadModule;

/** What the tier keeps for one lineage: a retained alias or a reusable failure. */
type Retained =
  | { readonly kind: 'value'; readonly value: unknown }
  | { readonly kind: 'failure'; readonly error: unknown };
/**
 * A kept lineage: what it retains, its estimated resident bytes, the build that last used it, and the entries whose
 * results it was made from.
 */
type Entry = {
  readonly retained: Retained;
  readonly bytes: number;
  generation: number;
  readonly parents: ReadonlySet<string>;
};
type Frame = { partial: string; pending: boolean; stepKey?: string; parents: Set<string> };
type ElementGroup = {
  readonly ownerId: string;
  readonly kind: string;
  readonly ordinals: () => readonly number[] | undefined;
  /** Ordinals once read; `false` when an element is not part of its owner. */
  resolved?: readonly number[] | false;
};

/** A finder callback as the library calls it: the finder, then the shape it searches. */
type FinderCallback = (finder: unknown, shape: unknown) => unknown;

/** Sentinel for a callback argument the library keys after it ran (a step). */
const callbackArgument = Symbol('callback');
type Canonical = string | typeof callbackArgument | undefined;

/** The entry key an identity starts with: a lineage token and its occurrence (`t1f@2` in `t1f@2[0].wire`). */
const entryOfId = /^t[\da-z]+(?:@\d+)?/u;

/** Text operations read the font registered under a family name, which `loadFont(..., true)` can replace. */
const fontOperations = new Set(['drawText', 'sketchText', 'textBlueprints']);

/** Strings above this length are keyed by digest, so a large import never becomes a key. */
const longStringLength = 256;

/** Retention bounds of one tier. @internal */
export type OperationTierOptions = {
  readonly library: ReplicadLibrary;
  /** Successful builds an entry survives unused (generation decay). */
  readonly decayGenerations?: number;
  /** Entries kept at most; beyond it the least recently used goes first. */
  readonly entryCap?: number;
  /**
   * Estimated resident bytes kept at most, shared by every document's tier of a kernel; beyond it the least recently
   * used entries without live dependents go first. Unbounded when omitted.
   */
  readonly byteBudget?: ByteBudget;
  /** Estimated resident bytes of a retained value; defaults to the topology estimate of `entry-cost.ts`. */
  readonly estimateBytes?: (value: unknown) => number;
  /** Interned lineages kept at most; beyond it the table restarts and old entries decay. */
  readonly lineageCap?: number;
};

/** A byte budget the tiers of one kernel share: its limit and the estimated bytes their entries hold. @internal */
export type ByteBudget = { readonly limit: number; used: number };

/** Counters of the current build and the tier's size. @internal */
export type OperationTierStats = {
  calls: number;
  keyed: number;
  hits: number;
  misses: number;
  stored: number;
  failureHits: number;
  failuresStored: number;
  opaque: number;
  pending: number;
  evicted: number;
  entries: number;
  /** Estimated resident bytes of every entry. */
  bytes: number;
  /** Most frequent reasons a call could not be keyed. */
  opaqueReasons: Record<string, number>;
};

/** One document's live operation tier. @internal */
export type OperationTier = {
  /** The cache to install with `setOperationCache` while this document's user code runs. */
  readonly cache: OperationCache;
  /** Starts a build: occurrences restart and the counters reset. */
  beginBuild(): void;
  /** Ends a build. A delivered build advances the generation and decays unused entries; a failed one evicts nothing but the cap. */
  endBuild(outcome: 'delivered' | 'failed'): void;
  /** Counters of the build in progress or last ended. */
  stats(): OperationTierStats;
  /** Identity the tier gave a value, if any. */
  idOf(value: unknown): string | undefined;
  /** Evicts this tier's least recently used entries while the shared byte budget is exceeded. */
  relieve(): void;
  /** Deletes everything the tier owns. */
  dispose(): void;
};

const freshStats = (): OperationTierStats => ({
  calls: 0,
  keyed: 0,
  hits: 0,
  misses: 0,
  stored: 0,
  failureHits: 0,
  failuresStored: 0,
  opaque: 0,
  pending: 0,
  evicted: 0,
  entries: 0,
  bytes: 0,
  opaqueReasons: {},
});

type Deletable = { delete(): void };
type CloneableShape = Deletable & { clone(): unknown };
type ExceptionRefcount = {
  incrementExceptionRefcount?: (error: unknown) => void;
  decrementExceptionRefcount?: (error: unknown) => void;
};

/**
 * Whether a failure of an operation whose errors are deterministic may be reused: an OpenCASCADE exception
 * (raw or decoded) or Replicad's own plain `Error`. Resource exhaustion, cancellation, traps, a use of a
 * deleted value (it depends on what was released, not on the inputs) and anything else are never reused.
 * @param error - The thrown value.
 * @returns True when the failure is a function of the operation's inputs.
 */
const reusableFailure = (error: unknown): boolean => {
  if (isWebAssemblyException(error)) {
    return true;
  }
  if (!(error instanceof Error) || isUseAfterRelease(error)) {
    return false;
  }
  if (error.name === 'OcKernelError') {
    const { typeName } = error as Error & { typeName?: unknown };
    return !/outofmemory|memory/iu.test(`${String(typeName)} ${error.message}`);
  }
  return Object.getPrototypeOf(error) === Error.prototype;
};

/**
 * A reused failure with a stack captured where it is thrown again, so source locations follow the code.
 * @param error - The kept failure.
 * @returns The value to throw.
 */
const replayFailure = (error: unknown): unknown => {
  if (!(error instanceof Error)) {
    return error;
  }
  const prototype: unknown = Object.getPrototypeOf(error);
  const fresh = Object.create(prototype as Error) as Error;
  Object.defineProperties(fresh, Object.getOwnPropertyDescriptors(error));
  (Error as { captureStackTrace?: (target: Error, constructor?: unknown) => void }).captureStackTrace?.(
    fresh,
    replayFailure,
  );
  return fresh;
};

/**
 * Create one document's live operation tier.
 * @param options - The Replicad library and the retention bounds.
 * @returns The tier.
 * @internal
 */
export const createOperationTier = (options: OperationTierOptions): OperationTier => {
  const { library } = options;
  const decayGenerations = options.decayGenerations ?? 3;
  const entryCap = options.entryCap ?? 16_384;
  const byteBudget = options.byteBudget ?? { limit: Number.POSITIVE_INFINITY, used: 0 };
  const estimateBytes = options.estimateBytes ?? createEntryCost(library);
  const lineageCap = options.lineageCap ?? 65_536;
  const { finderClauses } = library;
  const valueClauses = new Set<string>(finderClauses.value);
  const combinatorClauses = new Set<string>(finderClauses.combinator);

  const ids = new WeakMap<WeakKey, string>();
  const elementOf = new WeakMap<WeakKey, { readonly group: ElementGroup; readonly index: number }>();
  const entries = new Map<string, Entry>();
  let bytes = 0;
  /** Live entries made from each entry. An entry with live dependents is never evicted alone (see `evict`). */
  const dependents = new Map<string, Set<string>>();
  /** Entries the arguments of the call being keyed refer to. */
  let referenced = new Set<string>();
  const fontIds = new WeakMap<WeakKey, string>();
  let fontSequence = 0;
  const lineages = new Map<string, string>();
  const occurrences = new Map<string, number>();
  const frames: Frame[] = [];
  let lineageSequence = 0;
  let generation = 0;
  let active = false;
  let stats = freshStats();
  let reason = '';

  const internal = <T>(run: () => T): T => library.bypassOperationCache(run);

  // ---------------------------------------------------------------- identity

  const idOf = (value: WeakKey): string | undefined => {
    const known = ids.get(value);
    if (known !== undefined) {
      return known;
    }
    const element = elementOf.get(value);
    if (!element) {
      return undefined;
    }
    const { group } = element;
    if (group.resolved === undefined) {
      try {
        group.resolved = internal(() => group.ordinals()) ?? false;
      } catch {
        // The owner was consumed (deleted) before the element was first keyed: the element has no identity.
        group.resolved = false;
      }
    }
    if (group.resolved === false) {
      return undefined;
    }
    const id = `${group.ownerId}/${group.kind}#${String(group.resolved[element.index])}`;
    ids.set(value, id);
    return id;
  };

  const assign = (value: unknown, id: string): void => {
    if (value === null || typeof value !== 'object') {
      return;
    }
    if (Array.isArray(value)) {
      for (const [index, entry] of value.entries()) {
        assign(entry, `${id}[${index}]`);
      }
      return;
    }
    ids.set(value, id);
    elementOf.delete(value);
    if (value instanceof library.Sketch) {
      ids.set(value.wire, `${id}.wire`);
    } else if (value instanceof library.CompoundSketch || value instanceof library.Sketches) {
      for (const [index, entry] of (value.sketches as readonly unknown[]).entries()) {
        assign(entry, `${id}.s${index}`);
      }
    }
  };

  const forget = (value: unknown): void => {
    if (value !== null && typeof value === 'object') {
      ids.delete(value);
      elementOf.delete(value);
    }
  };

  // ---------------------------------------------------------------- retained values

  const cacheable = (value: unknown): boolean =>
    Array.isArray(value)
      ? value.length > 0 && value.every((entry) => cacheable(entry))
      : value instanceof library.Shape ||
        value instanceof library.Drawing ||
        value instanceof library.Sketch ||
        value instanceof library.CompoundSketch ||
        value instanceof library.Sketches;

  const cloneValue = (value: unknown): unknown => {
    if (Array.isArray(value)) {
      return value.map((entry) => cloneValue(entry));
    }
    if (value instanceof library.CompoundSketch) {
      return new library.CompoundSketch(value.sketches.map((entry) => entry.clone()));
    }
    if (value instanceof library.Sketches) {
      return new library.Sketches(
        value.sketches.map((entry) => cloneValue(entry) as InstanceType<typeof library.Sketch>),
      );
    }
    return (value as CloneableShape).clone();
  };

  const deleteValue = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const entry of value) {
        deleteValue(entry);
      }
      return;
    }
    if (value instanceof library.Sketches) {
      for (const entry of value.sketches) {
        entry.delete();
      }
      return;
    }
    if (value instanceof library.Drawing) {
      // A drawing has no `delete`; its blueprint owns the native curves (a blueprint list frees them on collection).
      (value as unknown as { innerShape?: Partial<Deletable> }).innerShape?.delete?.();
      return;
    }
    (value as Deletable).delete();
  };

  const exceptionRefcount = (): ExceptionRefcount => library.getOC() as unknown as ExceptionRefcount;

  const release = (entry: Entry): void => {
    stats.evicted += 1;
    internal(() => {
      if (entry.retained.kind === 'value') {
        deleteValue(entry.retained.value);
      } else if (isWebAssemblyException(entry.retained.error)) {
        exceptionRefcount().decrementExceptionRefcount?.(entry.retained.error);
      }
    });
  };

  /**
   * Removes an entry from the table before deleting what it owns, so nothing is deleted twice. Results share
   * native sub-shapes with the results they were made from, so an entry with live dependents stays: evicting it
   * alone would let a recomputed parent meet kept dependents that share nothing with it, which reuse off never does.
   */
  const evictable = (key: string): boolean => (dependents.get(key)?.size ?? 0) === 0;
  const evict = (key: string, entry: Entry): void => {
    entries.delete(key);
    bytes -= entry.bytes;
    byteBudget.used -= entry.bytes;
    dependents.delete(key);
    for (const parent of entry.parents) {
      dependents.get(parent)?.delete(key);
    }
    release(entry);
  };

  /** Evicts least recently used entries without live dependents until the table is within its cap and budget. */
  const evictToCap = (): void => {
    const over = (): boolean => entries.size > entryCap || byteBudget.used > byteBudget.limit;
    for (let progress = true; progress && over(); ) {
      progress = false;
      for (const [key, entry] of entries) {
        if (!over()) {
          return;
        }
        if (evictable(key)) {
          evict(key, entry);
          progress = true;
          // Evicting a dependent can free an older parent: rescan from the least recently used.
          if (entry.parents.size > 0) {
            break;
          }
        }
      }
    }
  };

  const admit = (key: string, retained: Retained, parents: ReadonlySet<string>): void => {
    const kept = new Set([...parents].filter((parent) => entries.has(parent) && parent !== key));
    const cost = retained.kind === 'value' ? internal(() => estimateBytes(retained.value)) : 0;
    entries.set(key, { retained, bytes: cost, generation, parents: kept });
    bytes += cost;
    byteBudget.used += cost;
    for (const parent of kept) {
      let children = dependents.get(parent);
      if (!children) {
        children = new Set();
        dependents.set(parent, children);
      }
      children.add(key);
    }
    evictToCap();
  };

  // ---------------------------------------------------------------- canonical arguments

  const digestBytes = (value: ArrayBufferView): string => {
    const bytes = new Uint8Array(value.byteLength);
    bytes.set(new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
    return `bytes:${value.constructor.name}:${sha256BytesSync(bytes)}`;
  };

  /**
   * Clauses a declarative finder callback records against a recording finder, or undefined when it is not declarative.
   *
   * Recording runs the callback once more than the library does, so it assumes the callback is pure: it only
   * calls clauses on the finder it is given. A callback that reads the shape the library passes as its second
   * argument, calls a predicate (`when`), throws or returns something else is not recorded; the library's step
   * keys its selection after it ran instead.
   */
  const recordFinder = (callback: FinderCallback): string | undefined => {
    let declarative = true as boolean;
    const reads = (): never => {
      declarative = false;
      throw new TypeError('A recorded finder callback read its shape.');
    };
    // Any use of the shape argument makes the callback impure for recording.
    const shape = new Proxy(
      {},
      { get: reads, has: reads, ownKeys: reads, getPrototypeOf: reads, apply: reads, set: reads },
    );
    const record = (run: FinderCallback): unknown[] | undefined => {
      const log: unknown[] = [];
      const recorder: Record<string, unknown> = new Proxy(
        {},
        {
          get(_target, property) {
            if (typeof property !== 'string' || property === 'then') {
              return undefined;
            }
            if (valueClauses.has(property)) {
              return (...values: unknown[]) => {
                const parts = values.map((entry) => canonical(entry));
                if (parts.some((part) => typeof part !== 'string')) {
                  declarative = false;
                }
                log.push([property, parts]);
                return recorder;
              };
            }
            if (combinatorClauses.has(property)) {
              return (argument: unknown) => {
                const list: unknown[] = Array.isArray(argument) ? argument : [argument];
                const nested = list.map((entry) =>
                  typeof entry === 'function' ? record(entry as FinderCallback) : undefined,
                );
                if (nested.includes(undefined)) {
                  declarative = false;
                }
                log.push([property, nested]);
                return recorder;
              };
            }
            // A predicate (`when`) or an unknown member: the selection is keyed after it ran.
            declarative = false;
            return () => recorder;
          },
        },
      );
      let returned: unknown;
      try {
        returned = internal(() => run(recorder, shape));
      } catch {
        declarative = false;
        return undefined;
      }
      if (returned !== recorder) {
        declarative = false;
        return undefined;
      }
      return log;
    };
    const log = record(callback);
    return declarative && log !== undefined ? JSON.stringify(log) : undefined;
  };

  /**
   * Canonical form of one argument: a string; `callbackArgument` for a callback the library keys after it
   * ran; undefined when it cannot be described (`reason` says why).
   */
  const canonical = (value: unknown, finder = false): Canonical => {
    switch (typeof value) {
      case 'number': {
        return Object.is(value, -0) ? '-0' : String(value);
      }
      case 'string': {
        return value.length > longStringLength ? `s#${sha256StringSync(value)}` : JSON.stringify(value);
      }
      case 'boolean': {
        return value ? 'T' : 'F';
      }
      case 'undefined': {
        return 'u';
      }
      case 'function': {
        if (finder) {
          const recorded = recordFinder(value as FinderCallback);
          if (recorded !== undefined) {
            return `rec${recorded}`;
          }
        }
        return callbackArgument;
      }
      case 'object': {
        break;
      }
      default: {
        reason = `type ${typeof value}`;
        return undefined;
      }
    }
    if (value === null) {
      return 'n';
    }
    const id = idOf(value);
    if (id !== undefined) {
      const entry = entryOfId.exec(id)?.[0];
      if (entry !== undefined) {
        referenced.add(entry);
      }
      return `#${id}`;
    }
    if (ArrayBuffer.isView(value)) {
      return digestBytes(value);
    }
    if (Array.isArray(value)) {
      const parts: string[] = [];
      for (const entry of value) {
        const part = canonical(entry);
        if (typeof part !== 'string') {
          if (part === callbackArgument) {
            reason = 'function in array';
          }
          return undefined;
        }
        parts.push(part);
      }
      return `[${parts.join(',')}]`;
    }
    if (value instanceof library.Vector) {
      return `V(${String(canonical(value.x))},${String(canonical(value.y))},${String(canonical(value.z))})`;
    }
    if (value instanceof library.Plane) {
      return `P(${String(canonical(value.origin))};${String(canonical(value.xDir))};${String(canonical(value.zDir))})`;
    }
    const prototype: unknown = Object.getPrototypeOf(value);
    if (prototype === Object.prototype || prototype === null) {
      const parts: string[] = [];
      for (const key of Object.keys(value).sort()) {
        const part = canonical((value as Record<string, unknown>)[key]);
        if (typeof part !== 'string') {
          if (part === callbackArgument) {
            reason = 'function in object';
          }
          return undefined;
        }
        parts.push(`${JSON.stringify(key)}:${part}`);
      }
      return `{${parts.join(',')}}`;
    }
    reason = `untracked ${String((value as { constructor?: { name?: string } }).constructor?.name ?? 'object')}`;
    return undefined;
  };

  /** Interns a lineage and qualifies it by its occurrence in this build. */
  const intern = (recipe: string): string => {
    let token = lineages.get(recipe);
    if (token === undefined) {
      token = `t${(lineageSequence++).toString(36)}`;
      lineages.set(recipe, token);
    }
    const seen = occurrences.get(token) ?? 0;
    occurrences.set(token, seen + 1);
    return seen === 0 ? token : `${token}@${seen}`;
  };

  const noteOpaque = (label: string): void => {
    stats.opaque += 1;
    stats.opaqueReasons[label] = (stats.opaqueReasons[label] ?? 0) + 1;
  };

  // ---------------------------------------------------------------- hits and misses

  const keyed = <T>(
    lineage: { readonly key: string; readonly parents: ReadonlySet<string>; readonly deterministicErrors?: boolean },
    request: { compute(): T; consume?(): void },
  ): T => {
    const { key, parents, deterministicErrors } = lineage;
    stats.keyed += 1;
    const entry = entries.get(key);
    if (entry) {
      entries.delete(key);
      entries.set(key, entry);
      entry.generation = generation;
      stats.hits += 1;
      if (entry.retained.kind === 'failure') {
        stats.failureHits += 1;
        throw replayFailure(entry.retained.error);
      }
      const kept = entry.retained.value;
      const value = internal(() => cloneValue(kept)) as T;
      if (request.consume) {
        request.consume();
      }
      assign(value, key);
      return value;
    }
    stats.misses += 1;
    let result: T;
    try {
      result = request.compute();
    } catch (error) {
      if (deterministicErrors === true && reusableFailure(error)) {
        if (isWebAssemblyException(error)) {
          // The tier holds its own reference to the native exception until eviction.
          internal(() => exceptionRefcount().incrementExceptionRefcount?.(error));
        }
        admit(key, { kind: 'failure', error }, parents);
        stats.failuresStored += 1;
      }
      throw error;
    }
    assign(result, key);
    if (cacheable(result)) {
      admit(key, { kind: 'value', value: internal(() => cloneValue(result)) }, parents);
      stats.stored += 1;
    }
    return result;
  };

  /** Identity of the font a text operation reads, by object: the family name alone does not describe it. */
  const fontPart = (request: OperationRequest<unknown>): string | undefined => {
    const options = request.args[1];
    const named =
      options !== null && typeof options === 'object' ? (options as { fontFamily?: unknown }).fontFamily : undefined;
    const family = typeof named === 'string' ? named : 'default';
    // The library falls back to its default font when the family is not registered.
    const font = internal(
      () => (library.getFont(family) as WeakKey | undefined) ?? (library.getFont() as WeakKey | undefined),
    );
    if (font === undefined) {
      return undefined;
    }
    let id = fontIds.get(font);
    if (id === undefined) {
      id = `f${(fontSequence++).toString(36)}`;
      fontIds.set(font, id);
    }
    return `font:${id}`;
  };

  const operationIn = <T>(frame: Frame, request: OperationRequest<T>): T => {
    stats.calls += 1;
    referenced = frame.parents;
    let opaque: string | undefined;
    let receiverId = '';
    const { receiver } = request;
    if (receiver !== undefined) {
      let id = idOf(receiver);
      if (id === undefined && request.freshState) {
        // A builder still as its constructor left it is identified by that state.
        const state = request.freshState();
        const part = state === undefined ? undefined : canonical(state);
        if (typeof part === 'string') {
          id = `new:${part}`;
          ids.set(receiver, id);
        }
      }
      if (id === undefined) {
        opaque = `receiver ${String((receiver as { constructor?: { name?: string } }).constructor?.name ?? '?')}`;
      } else {
        receiverId = id;
        const entry = entryOfId.exec(id)?.[0];
        if (entry !== undefined) {
          frame.parents.add(entry);
        }
      }
    }
    let pending = false;
    const parts: string[] = [];
    if (opaque === undefined) {
      for (const [index, argument] of request.args.entries()) {
        const part = canonical(argument, request.finderArgs?.includes(index) ?? false);
        if (part === callbackArgument) {
          pending = true;
          parts.push('fn');
          continue;
        }
        if (part === undefined) {
          opaque = reason;
          break;
        }
        parts.push(part);
      }
    }
    if (opaque === undefined && fontOperations.has(request.op)) {
      const font = fontPart(request);
      if (font === undefined) {
        opaque = 'no font';
      } else {
        parts.push(font);
      }
    }
    if (opaque !== undefined) {
      noteOpaque(`${request.op}: ${opaque}`);
      try {
        return request.compute();
      } finally {
        if (request.effect !== 'pure' && request.effect !== 'alias') {
          forget(receiver);
        }
      }
    }
    const recipe = `${request.op}|${receiverId}|${parts.join(',')}`;
    if (pending) {
      // A callback the recorder cannot describe: the library's step keys the rest once it ran.
      stats.pending += 1;
      frame.partial = recipe;
      frame.pending = true;
      const result = request.compute();
      if (frame.stepKey === undefined) {
        if (request.effect !== 'pure') {
          forget(receiver);
        }
      } else {
        assign(result, frame.stepKey);
      }
      return result;
    }
    const key = intern(recipe);
    if (request.effect === 'alias') {
      const result = request.compute();
      assign(result, receiverId);
      return result;
    }
    if (request.effect === 'mutates') {
      const result = request.compute();
      // The receiver changed: it takes this call's identity, and a new value it returned derives from it.
      if (receiver !== undefined) {
        ids.set(receiver, key);
      }
      if (result !== receiver) {
        assign(result, `${key}>`);
      }
      return result;
    }
    return keyed({ key, parents: frame.parents, deterministicErrors: request.deterministicErrors }, request);
  };

  const cache: OperationCache = {
    operation<T>(request: OperationRequest<T>): T {
      if (!active) {
        return request.compute();
      }
      // One frame per operation: a step belongs to the innermost one.
      const frame: Frame = { partial: '', pending: false, parents: new Set() };
      frames.push(frame);
      try {
        return operationIn(frame, request);
      } finally {
        frames.pop();
      }
    },
    step<T>(request: OperationStep<T>): T {
      const frame = frames.at(-1);
      if (!active || !frame?.pending || frame.stepKey !== undefined) {
        return request.compute();
      }
      referenced = frame.parents;
      const values = request.values();
      const parts: string[] = [];
      let opaque = values === undefined ? 'selection not in receiver' : undefined;
      for (const value of values ?? []) {
        const part = canonical(value);
        if (typeof part !== 'string') {
          opaque = part === callbackArgument ? 'function' : reason;
          break;
        }
        parts.push(part);
      }
      if (opaque !== undefined) {
        noteOpaque(`${request.op} step: ${opaque}`);
        return request.compute();
      }
      const key = intern(`${frame.partial}>${request.op}|${parts.join(',')}`);
      frame.stepKey = key;
      return keyed({ key, parents: frame.parents, deterministicErrors: request.deterministicErrors }, request);
    },
    // oxlint-disable-next-line eslint/max-params -- the seam's `OperationCache.elements` contract
    elements(owner, kind, elements, ordinals): void {
      if (!active) {
        return;
      }
      const ownerId = ids.get(owner) ?? (elementOf.has(owner) ? idOf(owner) : undefined);
      if (ownerId === undefined) {
        return;
      }
      const group: ElementGroup = { ownerId, kind, ordinals };
      for (const [index, element] of elements.entries()) {
        ids.delete(element);
        elementOf.set(element, { group, index });
      }
    },
  };

  return {
    cache,
    beginBuild() {
      active = true;
      frames.length = 0;
      occurrences.clear();
      stats = freshStats();
      if (lineages.size > lineageCap) {
        // Old lineages can no longer be named; their entries decay like any unused entry.
        lineages.clear();
      }
    },
    endBuild(outcome) {
      active = false;
      frames.length = 0;
      if (outcome === 'delivered') {
        generation += 1;
        const oldest = generation - decayGenerations;
        // Entries are in least-recently-used order, so the unused ones are at the front. Dependents go before the
        // entries they were made from; one still used by a kept dependent stays.
        const unused: string[] = [];
        for (const [key, entry] of entries) {
          if (entry.generation >= oldest) {
            break;
          }
          unused.push(key);
        }
        for (let progress = true; progress; ) {
          progress = false;
          for (const key of unused.toReversed()) {
            const entry = entries.get(key);
            if (entry && evictable(key)) {
              evict(key, entry);
              progress = true;
            }
          }
        }
      }
      evictToCap();
      stats.entries = entries.size;
      stats.bytes = bytes;
    },
    stats() {
      return { ...stats, entries: entries.size, bytes, opaqueReasons: { ...stats.opaqueReasons } };
    },
    idOf(value) {
      return value !== null && typeof value === 'object' ? idOf(value) : undefined;
    },
    relieve() {
      evictToCap();
    },
    dispose() {
      active = false;
      for (const [key, entry] of entries) {
        evict(key, entry);
      }
      dependents.clear();
      lineages.clear();
    },
  };
};
