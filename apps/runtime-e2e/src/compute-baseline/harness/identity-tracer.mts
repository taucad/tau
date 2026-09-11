/**
 * Spike-side identity tracer (analysis only; never caches). Wraps the replicad library the kernel hands to user code,
 * records every call in program order with a content identity derived from (op, canonical args, input identities),
 * and reports the theoretical reuse ceilings: which op results would be shared between two runs under a perfect
 * generic structural cache, and which of those the current allow-list could reach.
 */
import { sha256StringSync } from '../../../../../libs/utils/src/hash.utils.ts';

export type TraceEntry = {
  readonly index: number;
  readonly op: string;
  /** performance.now() at call start (same clock as runtime telemetry in-process). */
  readonly start: number;
  readonly ms: number;
  /** Content identity of the result (sha256 of op + args + inputs) or `fresh:n` when inputs/args are unidentifiable. */
  readonly id: string;
  readonly identifiable: boolean;
  /** Reachable by the current Replicad allow-list (op supported and every shape input allow-list reachable). */
  readonly allowListed: boolean;
  readonly resultKind: string;
  readonly failed: boolean;
  /** Identity overhead for this call: canonical-argument text + SHA-256 (excludes the op itself). */
  readonly idMs: number;
  /** Optional per-result measurements attached by the harness (`--trace shapes`). */
  shape?: Record<string, number | string>;
};

const allowList = new Set([
  'makeBox',
  'makeCylinder',
  'makeSphere',
  'fuse',
  'fuseAll',
  'cut',
  'cutAll',
  'intersect',
  'intersectAll',
  'translate',
  'translateX',
  'translateY',
  'translateZ',
  'rotate',
]);

type Identity = { readonly id: string; readonly identifiable: boolean; readonly allowListed: boolean };

export type IdentityTracerOptions = {
  readonly onResult?: (value: unknown, entry: TraceEntry, library: Record<string, any>) => void;
};

export const createIdentityTracer = (options: IdentityTracerOptions = {}) => {
  let rawLibrary: Record<string, any> = {};
  const identities = new WeakMap<object, Identity>();
  const proxied = new WeakMap<object, object>();
  const rawOf = new WeakMap<object, object>();
  let trace: TraceEntry[] = [];
  let fresh = 0;
  let depth = 0;

  const unwrap = (value: unknown): unknown =>
    (typeof value === 'object' && value !== null) || typeof value === 'function'
      ? (rawOf.get(value as object) ?? value)
      : value;

  /** Canonical argument text, or undefined when an argument cannot be identified (function, unknown object). */
  const canonical = (value: unknown, inputs: Identity[]): string | undefined => {
    if (value === null || value === undefined) return 'null';
    if (typeof value === 'number') return Number.isFinite(value) ? String(Object.is(value, -0) ? 0 : value) : undefined;
    if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
    if (typeof value === 'function') return undefined;
    const raw = unwrap(value) as object;
    const identity = identities.get(raw);
    if (identity) {
      inputs.push(identity);
      return `#${identity.id}`;
    }
    if (Array.isArray(raw)) {
      const parts = raw.map((entry) => canonical(entry, inputs));
      return parts.every((part) => part !== undefined) ? `[${parts.join(',')}]` : undefined;
    }
    if (ArrayBuffer.isView(raw) || raw instanceof ArrayBuffer) return undefined;
    const prototype = Object.getPrototypeOf(raw);
    if (prototype === Object.prototype || prototype === null) {
      const keys = Object.keys(raw).sort();
      const parts = keys.map((key) => {
        const part = canonical((raw as Record<string, unknown>)[key], inputs);
        return part === undefined ? undefined : `${JSON.stringify(key)}:${part}`;
      });
      return parts.every((part) => part !== undefined) ? `{${parts.join(',')}}` : undefined;
    }
    return undefined; // library object without identity (created outside traced calls)
  };

  const kindOf = (value: unknown): string =>
    value === null || typeof value !== 'object' ? typeof value : ((value as object).constructor?.name ?? 'object');

  const wrapResult = (value: unknown, identity: Identity): unknown => {
    if ((typeof value !== 'object' && typeof value !== 'function') || value === null) return value;
    if (Array.isArray(value)) return value; // arrays of shapes: leave (elements keep no identity; conservative)
    identities.set(value as object, identity);
    return proxify(value as object, identity);
  };

  const call = (input: {
    op: string;
    receiver?: object;
    receiverIdentity?: Identity;
    invoke: () => unknown;
    args: readonly unknown[];
  }): unknown => {
    const inputs: Identity[] = [];
    if (input.receiverIdentity) inputs.push(input.receiverIdentity);
    const idStart = performance.now();
    const argsText = input.args.map((argument) => canonical(argument, inputs));
    const identifiable = argsText.every((text) => text !== undefined) && inputs.every((entry) => entry.identifiable);
    let idMs = performance.now() - idStart;
    const index = trace.length;
    trace.push(undefined as unknown as TraceEntry); // reserve program-order slot (nested calls append after)
    depth += 1;
    const start = performance.now();
    let result: unknown;
    let failed = false;
    try {
      result = input.invoke();
    } catch (error) {
      failed = true;
      result = error;
      throw error;
    } finally {
      depth -= 1;
      const ms = performance.now() - start;
      const hashStart = performance.now();
      const id = identifiable
        ? sha256StringSync(`${input.op}|${input.receiverIdentity?.id ?? ''}|${argsText.join('|')}`)
        : `fresh:${fresh++}`;
      idMs += performance.now() - hashStart;
      const allowListed = allowList.has(input.op) && identifiable && inputs.every((entry) => entry.allowListed);
      // Throwing calls are recorded too (their cost is real and user code often catches and falls back).
      const entry: TraceEntry = {
        index,
        op: input.op,
        start,
        ms,
        id,
        identifiable,
        allowListed,
        resultKind: failed ? 'throw' : kindOf(result),
        failed,
        idMs,
      };
      trace[index] = entry;
      if (!failed) {
        if (options.onResult) options.onResult(result, entry, rawLibrary);
        const identity: Identity = { id, identifiable, allowListed };
        result = wrapResult(result, identity);
      }
    }
    return result;
  };

  const proxify = (target: object, identity?: Identity): object => {
    const existing = proxied.get(target);
    if (existing) return existing;
    const proxy = new Proxy(target, {
      get(object, property) {
        const value = Reflect.get(object, property, object);
        /* Promise methods must be invoked with the real promise as receiver: `await proxy` calls `then` with the Proxy
         * as `this`, and V8 rejects it ("Method Promise.prototype.then called on incompatible receiver") — which is how
         * the quadcopter (async asset loading) failed under `--trace`. Binding them to the target keeps the await
         * working; the resolved value is then unproxied, so identity is not tracked across an await (noted in the report). */
        if (property === 'then' || property === 'catch' || property === 'finally')
          return typeof value === 'function' ? value.bind(object) : value;
        if (typeof property !== 'string' || typeof value !== 'function' || property === 'constructor') return value;
        const method = value as (...values: unknown[]) => unknown;
        return (...values: unknown[]) =>
          call({
            op: property,
            receiver: object,
            receiverIdentity: identity ?? identities.get(object),
            invoke: () => method.apply(object, values.map(unwrap)),
            args: values,
          });
      },
      apply(object, thisArgument, values) {
        return call({
          op: (object as { name?: string }).name || 'call',
          invoke: () => Reflect.apply(object as (...v: unknown[]) => unknown, unwrap(thisArgument), values.map(unwrap)),
          args: values,
        });
      },
      construct(object, values) {
        return call({
          op: `new ${(object as { name?: string }).name || 'ctor'}`,
          invoke: () => Reflect.construct(object as new (...v: unknown[]) => unknown, values.map(unwrap)),
          args: values,
        }) as object;
      },
    });
    proxied.set(target, proxy);
    rawOf.set(proxy, target);
    return proxy;
  };

  const wrapLibrary = <T extends object>(library: T): T => {
    rawLibrary = library as Record<string, any>;
    return new Proxy(library, {
      get(target, property) {
        const value = Reflect.get(target, property, target);
        if (typeof property !== 'string' || typeof value !== 'function') return value;
        const cached = proxied.get(value as object);
        if (cached) return cached;
        const proxy = new Proxy(value as object, {
          apply(object, thisArgument, values) {
            return call({
              op: property,
              invoke: () => Reflect.apply(object as (...v: unknown[]) => unknown, thisArgument, values.map(unwrap)),
              args: values,
            });
          },
          construct(object, values) {
            return call({
              op: property,
              invoke: () => Reflect.construct(object as new (...v: unknown[]) => unknown, values.map(unwrap)),
              args: values,
            });
          },
        });
        proxied.set(value as object, proxy);
        rawOf.set(proxy, value as object);
        return proxy;
      },
    });
  };

  const unwrapDeep = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(unwrapDeep);
    if (
      value !== null &&
      typeof value === 'object' &&
      !rawOf.has(value as object) &&
      Object.getPrototypeOf(value) === Object.prototype
    )
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key, unwrapDeep(entry)]),
      );
    return unwrap(value);
  };
  return {
    wrapLibrary,
    unwrap,
    unwrapDeep,
    take(): TraceEntry[] {
      const taken = trace.filter(Boolean);
      trace = [];
      return taken;
    },
    reset(): void {
      trace = [];
    },
  };
};

export type CeilingReport = {
  readonly totalMs: number;
  readonly opCount: number;
  readonly identifiableMs: number;
  readonly sharedMs: number;
  readonly sharedCount: number;
  readonly prefixMs: number;
  readonly prefixCount: number;
  readonly allowListSharedMs: number;
  readonly allowListSharedCount: number;
  readonly ceilingSpeedup: number;
  readonly prefixCeilingSpeedup: number;
  readonly allowListCeilingSpeedup: number;
  readonly perOp: Record<string, { calls: number; ms: number; sharedMs: number; identifiableMs: number }>;
};

/** Compare a base-run trace with an edited-run trace: what could a perfect structural cache reuse in the edited run? */
export const ceilings = (base: readonly TraceEntry[], edited: readonly TraceEntry[]): CeilingReport => {
  const baseIds = new Set(base.filter((entry) => entry.identifiable).map((entry) => entry.id));
  const totalMs = edited.reduce((sum, entry) => sum + entry.ms, 0);
  let sharedMs = 0,
    sharedCount = 0,
    identifiableMs = 0,
    allowListSharedMs = 0,
    allowListSharedCount = 0,
    prefixMs = 0,
    prefixCount = 0;
  let inPrefix = true;
  const perOp: CeilingReport['perOp'] = {};
  edited.forEach((entry, index) => {
    const record = (perOp[entry.op] ??= { calls: 0, ms: 0, sharedMs: 0, identifiableMs: 0 });
    record.calls += 1;
    record.ms += entry.ms;
    if (entry.identifiable) {
      identifiableMs += entry.ms;
      record.identifiableMs += entry.ms;
    }
    const shared = entry.identifiable && baseIds.has(entry.id);
    if (shared) {
      sharedMs += entry.ms;
      sharedCount += 1;
      record.sharedMs += entry.ms;
      if (entry.allowListed) {
        allowListSharedMs += entry.ms;
        allowListSharedCount += 1;
      }
    }
    if (inPrefix && shared && base[index]?.id === entry.id) {
      prefixMs += entry.ms;
      prefixCount += 1;
    } else inPrefix = false;
  });
  const speedup = (saved: number) => (totalMs - saved > 0 ? totalMs / (totalMs - saved) : Infinity);
  return {
    totalMs,
    opCount: edited.length,
    identifiableMs,
    sharedMs,
    sharedCount,
    prefixMs,
    prefixCount,
    allowListSharedMs,
    allowListSharedCount,
    ceilingSpeedup: speedup(sharedMs),
    prefixCeilingSpeedup: speedup(prefixMs),
    allowListCeilingSpeedup: speedup(allowListSharedMs),
    perOp,
  };
};
