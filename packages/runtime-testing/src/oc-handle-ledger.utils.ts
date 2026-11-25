/**
 * A handle ledger for an Emscripten (embind) OpenCascade instance, ported from the `@taulabs/replicad` fork's T1 test
 * support (`__tests__/support/handleLedger.ts`, MIT). Every embind object that reaches JavaScript from a constructor,
 * a static function, a method or `clone()` is recorded with the first source frame outside `node_modules` that
 * created it, and `delete()` removes it. Whatever is still recorded once its owner should have deleted it is a leaked
 * handle. Deleting a handle that was already deleted is counted too.
 *
 * It patches the instance in place and cannot be removed: install it once per test file, on the instance the tests
 * use, before the code under test runs.
 */

/** One live handle: the class that made it, how, and where. @public */
export type HandleLedgerEntry = {
  /** Class whose constructor, static function or method returned the handle. */
  readonly className: string;
  /** `new Class`, `Class.method`, `Class::static` or `clone`. */
  readonly via: string;
  /** The first source frame outside `node_modules` that created it. */
  readonly site: string;
  /** The frames that created it, innermost first, library frames included. */
  readonly stack: string;
};

/** The ledger of one instance. @public */
export type HandleLedger = {
  /** Handles created since installation and not deleted. */
  readonly live: ReadonlyMap<WeakKey, HandleLedgerEntry>;
  stats(): { created: number; deleted: number; live: number; doubleDeletes: number };
  /** The handles alive now, to compare with later. */
  snapshot(): ReadonlySet<WeakKey>;
  /** Handles created after `snapshot` was taken that are still alive. */
  since(snapshot: ReadonlySet<WeakKey>): HandleLedgerEntry[];
};

type ClassHandle = {
  delete(this: ClassHandle): void;
  clone(this: ClassHandle): unknown;
  isDeleted(this: ClassHandle): boolean;
};
type Callable = (...args: unknown[]) => unknown;

const isHandle = (value: unknown): value is ClassHandle =>
  value !== null &&
  typeof value === 'object' &&
  typeof (value as Partial<ClassHandle>).delete === 'function' &&
  typeof (value as Partial<ClassHandle>).isDeleted === 'function';

/** Embind's shared `ClassHandle` methods, which the ledger patches once instead of per class. */
const sharedMembers = new Set(['constructor', 'delete', 'clone', 'isDeleted', 'isAliasOf', 'deleteLater']);
/** Own properties of a function that are not embind's overload table. */
const functionProperties = new Set(['length', 'name', 'prototype', 'arguments', 'caller']);

const ledgers = new WeakMap<WeakKey, HandleLedger>();

/**
 * One V8 call site as `function (file:line:column)`, or `file:line:column` for an anonymous function, as V8 prints it.
 *
 * @param site - The call site.
 * @returns The frame.
 */
const describeFrame = (site: NodeJS.CallSite): string => {
  const location = `${site.getFileName() ?? '<anonymous>'}:${site.getLineNumber() ?? 0}:${site.getColumnNumber() ?? 0}`;
  const typeName = site.getTypeName();
  const functionName = site.getFunctionName() ?? site.getMethodName();
  if (!functionName) {
    return location;
  }
  const qualified =
    typeName && !site.isToplevel() && !functionName.startsWith(`${typeName}.`)
      ? `${typeName}.${functionName}`
      : functionName;
  return `${site.isConstructor() ? 'new ' : ''}${qualified} (${location})`;
};

/**
 * The first stack frame outside `node_modules`, Node internals and this file, and the frames that led there.
 *
 * The frames are read from V8's call sites while the stack is captured, without the host's stack formatting: a test
 * runner's formatter source-maps every frame, which cost about 0.3 ms per handle (4 s of a 26 s planetary-gear-system
 * build that creates 15,000 handles). Positions are therefore those of the code as it ran. Only strings are kept, so
 * nothing the stack referenced (a receiver, a closure) is kept alive.
 *
 * @returns The site and the stack.
 */
const siteOf = (): { site: string; stack: string } => {
  const { stackTraceLimit, prepareStackTrace } = Error;
  Error.stackTraceLimit = 40;
  Error.prepareStackTrace = (_error, sites) => sites.map((site) => describeFrame(site));
  let captured: unknown;
  try {
    captured = new Error('site').stack;
  } finally {
    Error.prepareStackTrace = prepareStackTrace;
    Error.stackTraceLimit = stackTraceLimit;
  }
  const frames = (captured as string[]).filter(
    (line) => !/oc-handle-ledger\.utils\.[jt]s|node:|<anonymous>/u.test(line),
  );
  return {
    site: frames.find((line) => !line.includes('node_modules')) ?? '?',
    stack: frames.slice(0, 8).join(' < '),
  };
};

/**
 * Keep an embind function's own properties live on its wrapper: an overload dispatcher reads
 * `<owner>[name].overloadTable` when it is called.
 *
 * @param original - The embind function.
 * @param wrapper - Its recording wrapper.
 * @returns The wrapper.
 */
const carry = (original: Callable, wrapper: Callable): Callable => {
  for (const key of Object.getOwnPropertyNames(original)) {
    if (!functionProperties.has(key)) {
      Object.defineProperty(wrapper, key, {
        get: () => (original as unknown as Record<string, unknown>)[key],
        set(value: unknown) {
          (original as unknown as Record<string, unknown>)[key] = value;
        },
        configurable: true,
      });
    }
  }
  return wrapper;
};

/**
 * Install the ledger on an instance, or return the one already installed.
 *
 * @param instance - The embind module: its own properties are the bound classes.
 * @returns The ledger.
 * @public
 */
export const installHandleLedger = (instance: WeakKey): HandleLedger => {
  const existing = ledgers.get(instance);
  if (existing) {
    return existing;
  }

  const live = new Map<WeakKey, HandleLedgerEntry>();
  let created = 0;
  let deleted = 0;
  let doubleDeletes = 0;

  const track = (value: unknown, className: string, via: string): void => {
    if (isHandle(value) && !value.isDeleted() && !live.has(value)) {
      created += 1;
      live.set(value, { className, via, ...siteOf() });
    }
  };
  const trackResult = (result: unknown, className: string, via: string): unknown => {
    for (const value of Array.isArray(result) ? (result as unknown[]) : [result]) {
      track(value, className, via);
    }
    return result;
  };

  const module = instance as Record<string, unknown>;
  const classes = Object.getOwnPropertyNames(module)
    .map((name) => [name, module[name]] as const)
    .filter(
      (entry): entry is readonly [string, Callable & { prototype: Record<string, unknown> }] =>
        typeof entry[1] === 'function' &&
        typeof (entry[1] as { prototype?: Partial<ClassHandle> }).prototype?.delete === 'function',
    );
  const [first] = classes;
  if (!first) {
    throw new Error('The instance binds no embind class.');
  }

  // Embind's shared ClassHandle prototype owns delete, clone and isDeleted.
  let base: unknown = first[1].prototype;
  while (!Object.hasOwn(base as Record<string, unknown>, 'delete')) {
    base = Object.getPrototypeOf(base);
  }
  const shared = base as ClassHandle;
  const { delete: originalDelete, clone: originalClone } = shared;
  shared.delete = function (this: ClassHandle) {
    if (this.isDeleted()) {
      doubleDeletes += 1;
    }
    if (live.delete(this)) {
      deleted += 1;
    }
    originalDelete.call(this);
  };
  shared.clone = function (this: ClassHandle) {
    return trackResult(originalClone.call(this), this.constructor.name, 'clone');
  };

  const wrapped = new WeakSet();
  for (const [name, bound] of classes) {
    if (wrapped.has(bound)) {
      continue;
    }
    wrapped.add(bound);
    const { prototype } = bound;
    for (const member of Object.getOwnPropertyNames(prototype)) {
      const method = Object.getOwnPropertyDescriptor(prototype, member)?.value as unknown;
      if (!sharedMembers.has(member) && typeof method === 'function') {
        prototype[member] = carry(method as Callable, function (this: unknown, ...args: unknown[]) {
          return trackResult((method as Callable).apply(this, args), name, `${name}.${member}`);
        });
      }
    }
    const statics = bound as unknown as Record<string, unknown>;
    for (const member of Object.getOwnPropertyNames(bound)) {
      const descriptor = Object.getOwnPropertyDescriptor(bound, member);
      const method = descriptor?.value as unknown;
      if (descriptor?.writable === true && typeof method === 'function') {
        statics[member] = carry(method as Callable, (...args: unknown[]) =>
          trackResult((method as Callable).apply(bound, args), name, `${name}::${member}`),
        );
      }
    }
    module[name] = new Proxy(bound, {
      construct(target, args, newTarget) {
        const value = Reflect.construct(target, args, newTarget) as WeakKey;
        track(value, name, `new ${name}`);
        return value as Record<string, unknown>;
      },
    });
  }

  const ledger: HandleLedger = {
    live,
    stats: () => ({ created, deleted, live: live.size, doubleDeletes }),
    snapshot: () => new Set(live.keys()),
    since: (snapshot) => [...live].filter(([handle]) => !snapshot.has(handle)).map(([, entry]) => entry),
  };
  ledgers.set(instance, ledger);
  return ledger;
};

/**
 * Group leaked handles by creation site, most frequent first.
 *
 * @param entries - Leaked handles, for example from {@link HandleLedger.since}.
 * @returns One row per `via @ site`.
 * @public
 */
export const summarizeLeaks = (entries: readonly HandleLedgerEntry[]): Array<{ key: string; count: number }> => {
  const counts = new Map<string, number>();
  for (const { via, site } of entries) {
    const key = `${via} @ ${site}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts]
    .map(([key, count]) => ({ key, count }))
    .toSorted((left, right) => right.count - left.count || left.key.localeCompare(right.key));
};
