/**
 * Timing for the offline engine: wall time per modeling command and per libcascade call.
 *
 * libcascade classes are embind constructors, so the profiler patches each class's prototype methods and static
 * functions in place and wraps each constructor in a `construct` proxy. Every call is timed as `Class.method`,
 * `Class.new` or `Class::static`; a method inherited from a base class reports under the receiver's class name.
 */

/** Aggregated timing for one key. */
export type TimingEntry = { name: string; calls: number; totalMs: number; maxMs: number };

/** Snapshot of one profiling window. */
export type ProfileSnapshot = {
  commands: TimingEntry[];
  occt: TimingEntry[];
};

const now = (): number => performance.now();

/**
 * Accumulates `{ calls, totalMs, maxMs }` per key.
 */
class TimingTable {
  private readonly entries = new Map<string, TimingEntry>();

  public record(name: string, ms: number): void {
    let entry = this.entries.get(name);
    if (!entry) {
      entry = { name, calls: 0, totalMs: 0, maxMs: 0 };
      this.entries.set(name, entry);
    }

    entry.calls += 1;
    entry.totalMs += ms;
    if (ms > entry.maxMs) {
      entry.maxMs = ms;
    }
  }

  public snapshot(): TimingEntry[] {
    return [...this.entries.values()].map((entry) => ({ ...entry })).sort((a, b) => b.totalMs - a.totalMs);
  }

  public clear(): void {
    this.entries.clear();
  }
}

const skippedPrototypeKeys = new Set(['constructor', 'delete', 'clone', 'isDeleted', 'deleteLater', 'isAliasOf']);

type AnyFunction = (...args: unknown[]) => unknown;
type AnyClass = (new (...args: unknown[]) => unknown) & Record<string, unknown>;

const receiverName = (receiver: unknown, fallback: string): string => {
  const ctor = (receiver as { constructor?: { name?: string } } | undefined)?.constructor;
  const name = ctor?.name;
  return name && name !== 'Object' && name !== 'Function' ? name : fallback;
};

/**
 * Profiles modeling commands and libcascade calls for the offline engine.
 *
 * @public
 */
export class OfflineProfiler {
  private readonly commandTable = new TimingTable();
  private readonly occtTable = new TimingTable();
  private enabled = true;

  /**
   * Turns call recording on or off; the patches stay installed.
   *
   * @param enabled - whether to record
   */
  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * Times one modeling command.
   *
   * @param name - command type
   * @param run - the handler
   * @returns the handler's result
   */
  public timeCommand<T>(name: string, run: () => T): T {
    const start = now();
    try {
      return run();
    } finally {
      if (this.enabled) {
        this.commandTable.record(name, now() - start);
      }
    }
  }

  /**
   * Records one timed region that is not a single libcascade call.
   *
   * @param name - region name
   * @param ms - elapsed milliseconds
   */
  public recordOcct(name: string, ms: number): void {
    if (this.enabled) {
      this.occtTable.record(name, ms);
    }
  }

  /**
   * Patches every class and static function on a libcascade instance so each call is timed.
   *
   * @param oc - libcascade instance; patched in place and returned
   * @returns the same instance
   */
  public instrument<T extends Record<string, unknown>>(oc: T): T {
    const record = this.occtTable;
    const isEnabled = (): boolean => this.enabled;
    const patchedPrototypes = new Set<Record<string, unknown>>();
    const target = oc as Record<string, unknown>;

    // oxlint-disable-next-line eslint/max-params -- internal helper
    const wrapMethod = (owner: Record<string, unknown>, key: string, className: string, isStatic: boolean): void => {
      const descriptor = Object.getOwnPropertyDescriptor(owner, key);
      if (!descriptor || typeof descriptor.value !== 'function' || !descriptor.writable) {
        return;
      }

      const original = descriptor.value as AnyFunction;
      const wrapped = function (this: unknown, ...args: unknown[]): unknown {
        if (!isEnabled()) {
          return original.apply(this, args);
        }

        const start = now();
        try {
          return original.apply(this, args);
        } finally {
          const name = isStatic ? `${className}::${key}` : `${receiverName(this, className)}.${key}`;
          record.record(name, now() - start);
        }
      };
      // Embind overload dispatchers look up `overloadTable` on the installed function, so carry it across.
      for (const property of Object.getOwnPropertyNames(original)) {
        if (!['length', 'name', 'prototype', 'arguments', 'caller'].includes(property)) {
          Object.defineProperty(wrapped, property, Object.getOwnPropertyDescriptor(original, property)!);
        }
      }

      Object.defineProperty(owner, key, { ...descriptor, value: wrapped });
    };

    for (const className of Object.keys(target)) {
      const value = target[className];
      if (typeof value !== 'function' || !/^[A-Z]/.test(className)) {
        continue;
      }

      const cls = value as AnyClass;
      const proto = cls.prototype as Record<string, unknown> | undefined;
      if (proto && !patchedPrototypes.has(proto)) {
        patchedPrototypes.add(proto);
        for (const key of Object.getOwnPropertyNames(proto)) {
          if (!skippedPrototypeKeys.has(key) && !key.startsWith('$$')) {
            wrapMethod(proto, key, className, false);
          }
        }
      }

      for (const key of Object.getOwnPropertyNames(cls)) {
        if (key !== 'prototype' && key !== 'length' && key !== 'name' && !key.startsWith('$$')) {
          wrapMethod(cls, key, className, true);
        }
      }

      const descriptor = Object.getOwnPropertyDescriptor(target, className);
      if (!descriptor?.writable && !descriptor?.set && !descriptor?.configurable) {
        continue;
      }

      const proxied = new Proxy(cls, {
        construct(ctor, args, newTarget): Record<string, unknown> {
          if (!isEnabled()) {
            return Reflect.construct(ctor, args, newTarget === proxied ? ctor : newTarget) as Record<string, unknown>;
          }

          const start = now();
          try {
            return Reflect.construct(ctor, args, newTarget === proxied ? ctor : newTarget) as Record<string, unknown>;
          } finally {
            record.record(`${className}.new`, now() - start);
          }
        },
      });
      try {
        Object.defineProperty(target, className, { ...descriptor, value: proxied });
      } catch {
        // Non-configurable export: constructor timing is skipped for this class.
      }
    }

    return oc;
  }

  /**
   * Returns and resets the accumulated timings.
   *
   * @returns command and libcascade timings, largest total first
   */
  public takeSnapshot(): ProfileSnapshot {
    const snapshot = { commands: this.commandTable.snapshot(), occt: this.occtTable.snapshot() };
    this.commandTable.clear();
    this.occtTable.clear();
    return snapshot;
  }
}
