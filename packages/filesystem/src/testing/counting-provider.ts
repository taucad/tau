/**
 * Count the calls the authority makes on one provider (project-library fast-path blueprint FW0).
 *
 * The provider is the instance the authority's registry already holds, so the counts are the calls a real operation
 * makes: each method on its prototype chain is replaced on the instance by a wrapper that counts and delegates. A
 * read is `readFile` or `readFileStream`; a listing is any `readdir` form. Each call is also counted by the kind of
 * question it asks of a project directory (`kinds`): a listing, a manifest read (`tau.json`), an identity read
 * (`.tau/project.json`), a head (`stat`), or another call. A call the provider makes on itself while answering a
 * counted one (`readFile` reading through its own `readFileRaw`) is not counted again. Node-only, test-only: reachable through the package's
 * internal `#*` imports and deliberately absent from `exports`.
 *
 * @module
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { projectIdentityPath } from '@taucad/project-core/identity';
import type { FileSystemProvider } from '#types.js';

/** The provider methods that read a file's bytes. */
const fileReadMethods = new Set(['readFile', 'readFileStream']);
/** The provider methods that list a directory. */
const listingMethods = new Set(['readdir', 'readdirEntries', 'readdirWithStats']);

/** The kinds of call a discovery makes of a project directory, and `other` for everything else. @public */
export type ProviderCallKind = 'listing' | 'manifestRead' | 'identityRead' | 'head' | 'other';

/** The kind of call `name` with first argument `path` is. */
const kindOf = (name: string, path: unknown): ProviderCallKind => {
  if (listingMethods.has(name)) {
    return 'listing';
  }
  if (name === 'stat') {
    return 'head';
  }
  if (fileReadMethods.has(name) && typeof path === 'string') {
    if (path === projectIdentityPath || path.endsWith(`/${projectIdentityPath}`)) {
      return 'identityRead';
    }
    if (path === 'tau.json' || path.endsWith('/tau.json')) {
      return 'manifestRead';
    }
  }
  return 'other';
};

/** What one counted window of provider calls holds. @public */
export type ProviderCallCounts = Readonly<{
  /** Calls per method name. */
  calls: Readonly<Record<string, number>>;
  /** File reads: `readFile` and `readFileStream`. */
  fileReads: number;
  /** Directory listings: every `readdir` form. */
  listings: number;
  /** Calls by the kind of question they ask; a kind never asked is 0. */
  kinds: Readonly<Record<ProviderCallKind, number>>;
  /** Every counted call. */
  total: number;
}>;

/** A provider whose calls are counted. @public */
export type CountingProvider = Readonly<{
  /** The counts since the last {@link CountingProvider.reset}. */
  counts: () => ProviderCallCounts;
  /** Start a new window. */
  reset: () => void;
  /** Put the provider's own methods back. */
  restore: () => void;
}>;

/**
 * Every public method name on the provider's prototype chain, below `Object.prototype`.
 *
 * @param provider - The provider instance.
 * @returns The method names.
 */
const methodNames = (provider: FileSystemProvider): string[] => {
  const names = new Set<string>();
  let prototype: unknown = Object.getPrototypeOf(provider);
  /* `typeof null` is `'object'` too: the chain ends at `Object.prototype` or, for a null-prototype object, at null. */
  while (typeof prototype === 'object' && prototype !== Object.prototype && Boolean(prototype)) {
    const level = prototype as Record<string, unknown>;
    for (const name of Object.getOwnPropertyNames(level)) {
      const descriptor = Object.getOwnPropertyDescriptor(level, name);
      /* A `_`-prefixed method is the provider's own plumbing, called from inside a public one: not a call the authority made. */
      if (name !== 'constructor' && !name.startsWith('_') && typeof descriptor?.value === 'function') {
        names.add(name);
      }
    }
    prototype = Object.getPrototypeOf(level);
  }
  return [...names];
};

/** Set while a counted call runs, so the provider's calls on itself are not counted again. */
const insideCall = new AsyncLocalStorage<true>();

/** One method replaced by a wrapper that tallies its calls in the current window and delegates. */
const countMethod = (
  target: FileSystemProvider,
  name: string,
  tally: { calls: Map<string, number>; kinds: Map<ProviderCallKind, number> },
): void => {
  /* The provider's own method, not what a view of it answers: the registry hands out a counting view (FW4), whose
   * wrapper would otherwise be installed on the provider and count the provider's calls on itself. */
  const method: unknown =
    Object.getOwnPropertyDescriptor(target, name)?.value ??
    Reflect.get(Object.getPrototypeOf(target) as Record<string, unknown>, name);
  if (typeof method !== 'function') {
    return;
  }
  const original = method as (...arguments_: unknown[]) => unknown;
  Object.defineProperty(target, name, {
    configurable: true,
    writable: true,
    value: function counted(this: unknown, ...arguments_: unknown[]): unknown {
      if (insideCall.getStore() === true) {
        return Reflect.apply(original, this, arguments_);
      }
      tally.calls.set(name, (tally.calls.get(name) ?? 0) + 1);
      const kind = kindOf(name, arguments_[0]);
      tally.kinds.set(kind, (tally.kinds.get(kind) ?? 0) + 1);
      return insideCall.run(true, () => Reflect.apply(original, this, arguments_));
    },
  });
};

/**
 * Count every method call on `provider` until {@link CountingProvider.restore}.
 *
 * @param provider - The instance the authority calls, as its registry returned it.
 * @returns The counts, and how to reset and restore them.
 * @public
 */
export const countProviderCalls = (provider: FileSystemProvider): CountingProvider => {
  const tally = { calls: new Map<string, number>(), kinds: new Map<ProviderCallKind, number>() };
  const names = methodNames(provider);
  /* The registry wraps some methods on the instance (the write tap, the interactive lane's count, FW4): those are
   * counted over, and put back as they were. */
  const own = new Map(
    names.flatMap((name) => {
      const descriptor = Object.getOwnPropertyDescriptor(provider, name);
      return descriptor === undefined ? [] : [[name, descriptor] as const];
    }),
  );
  for (const name of names) {
    countMethod(provider, name, tally);
  }
  const sum = (filter: (name: string) => boolean): number => {
    let total = 0;
    for (const [name, count] of tally.calls) {
      if (filter(name)) {
        total += count;
      }
    }
    return total;
  };
  return {
    counts: () => ({
      calls: Object.fromEntries(tally.calls),
      kinds: {
        listing: tally.kinds.get('listing') ?? 0,
        manifestRead: tally.kinds.get('manifestRead') ?? 0,
        identityRead: tally.kinds.get('identityRead') ?? 0,
        head: tally.kinds.get('head') ?? 0,
        other: tally.kinds.get('other') ?? 0,
      },
      fileReads: sum((name) => fileReadMethods.has(name)),
      listings: sum((name) => listingMethods.has(name)),
      total: sum(() => true),
    }),
    reset: () => {
      tally.calls = new Map();
      tally.kinds = new Map();
    },
    restore: () => {
      for (const name of names) {
        const descriptor = own.get(name);
        if (descriptor === undefined) {
          Reflect.deleteProperty(provider, name);
        } else {
          Object.defineProperty(provider, name, descriptor);
        }
      }
    },
  };
};
