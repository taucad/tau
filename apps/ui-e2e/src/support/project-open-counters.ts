/**
 * Opt-in, local-only browser I/O counters for the project-open diagnostic.
 * Serialize `installProjectOpenCounters.toString()` into each page or worker
 * realm before application code runs. Read with
 * `globalThis.__tauProjectOpenCounters?.read()` and reset with `.reset()`.
 * Each realm reports only its own observations; the caller must retain realm
 * identity and must not interpret an unobserved realm as zero work.
 */

export type ProjectOpenOperation = {
  readonly calls: number;
  readonly successes: number;
  readonly failures: number;
  readonly pending: number;
  readonly durationMs: number;
  readonly knownBytes: number;
  readonly byteObservations: number;
};

export type ProjectOpenCounterReceipt = {
  readonly version: 1;
  readonly enabled: boolean;
  readonly realm: 'window' | 'worker' | 'other';
  readonly generation: number;
  readonly staleCompletions: number;
  readonly coverage: Readonly<Record<string, boolean>>;
  // oxlint-disable-next-line typescript/no-restricted-types -- JSON receipt uses null for unsupported probes.
  readonly operations: Readonly<Record<string, ProjectOpenOperation | null>>;
  /** Request keys and paths are deliberately not inspected. */
  // oxlint-disable-next-line typescript/no-restricted-types -- Explicit unavailable JSON value.
  readonly manifestRequests: null;
  // oxlint-disable-next-line typescript/no-restricted-types -- Explicit unavailable JSON value.
  readonly identityRequests: null;
};

/**
 * Install in one browser realm. This function has no external references and
 * can be evaluated from its source string by Playwright or CDP.
 *
 * @param enabled - Explicit diagnostic opt-in; false performs no patching.
 * @returns Whether this local realm admitted and installed the probe.
 */
// oxlint-disable-next-line eslint/complexity -- One serializable installer covers independent browser prototypes.
export function installProjectOpenCounters(enabled: boolean): boolean {
  const host = (Reflect.get(globalThis, 'location') as Location | undefined)?.hostname;
  if (!enabled || (host !== 'localhost' && host !== '127.0.0.1' && host !== '[::1]' && host !== '::1')) {
    return false;
  }

  const global = globalThis as typeof globalThis & {
    __tauProjectOpenCounters?: { read: () => ProjectOpenCounterReceipt; reset: () => void };
  };
  if (global.__tauProjectOpenCounters !== undefined) {
    return true;
  }

  /**
   * Reads a browser-native constructor from this realm so the probe can patch
   * its prototype. The realm's own declarations are narrower than the record
   * the patch writes through, and a realm may not define the constructor at
   * all, so the lookup widens deliberately rather than asserting a DOM type.
   */
  const nativeConstructor = (name: string) =>
    Reflect.get(globalThis, name) as unknown as { prototype: Record<string, unknown> } | undefined;

  const idbDatabase = nativeConstructor('IDBDatabase');
  const idbStore = nativeConstructor('IDBObjectStore');
  const directoryHandle = nativeConstructor('FileSystemDirectoryHandle');
  const fileHandle = nativeConstructor('FileSystemFileHandle');
  const syncHandle = nativeConstructor('FileSystemSyncAccessHandle');
  // oxlint-disable-next-line typescript/no-restricted-types -- WeakSet accepts arbitrary browser-native object identities.
  const filesReturnedByHandles = new WeakSet<object>();
  // oxlint-disable-next-line typescript/no-restricted-types -- Constructor is discovered dynamically in each realm.
  const syncHandlesReturnedByHandles = new WeakSet<object>();
  const methods = {
    'idb.transaction': [idbDatabase?.prototype, 'transaction'],
    'idb.get': [idbStore?.prototype, 'get'],
    'idb.getAll': [idbStore?.prototype, 'getAll'],
    'idb.getAllKeys': [idbStore?.prototype, 'getAllKeys'],
    'idb.openCursor': [idbStore?.prototype, 'openCursor'],
    'idb.openKeyCursor': [idbStore?.prototype, 'openKeyCursor'],
    'idb.put': [idbStore?.prototype, 'put'],
    'idb.add': [idbStore?.prototype, 'add'],
    'idb.delete': [idbStore?.prototype, 'delete'],
    'idb.clear': [idbStore?.prototype, 'clear'],
    'fsa.entries': [directoryHandle?.prototype, 'entries'],
    'fsa.getFileHandle': [directoryHandle?.prototype, 'getFileHandle'],
    'fsa.getDirectoryHandle': [directoryHandle?.prototype, 'getDirectoryHandle'],
    'fsa.getFile': [fileHandle?.prototype, 'getFile'],
    'fsa.createSyncAccessHandle': [fileHandle?.prototype, 'createSyncAccessHandle'],
    'fsa.syncRead': [syncHandle?.prototype, 'read'],
    'fsa.fileArrayBuffer': [Blob.prototype, 'arrayBuffer'],
    'fsa.fileText': [Blob.prototype, 'text'],
  } as const;
  const coverage: Record<string, boolean> = {};
  type MutableOperation = { -readonly [Key in keyof ProjectOpenOperation]: ProjectOpenOperation[Key] };
  const counters: Record<string, MutableOperation> = {};
  let generation = 0;
  let staleCompletions = 0;
  const fresh = (): MutableOperation => ({
    calls: 0,
    successes: 0,
    failures: 0,
    pending: 0,
    durationMs: 0,
    knownBytes: 0,
    byteObservations: 0,
  });
  const now = (): number => globalThis.performance.now();
  const add = (value: number, increment: number): number => Math.min(Number.MAX_SAFE_INTEGER, value + increment);
  const knownWriteSize = (value: unknown): number | undefined => {
    if (value instanceof ArrayBuffer) {
      return value.byteLength;
    }
    if (ArrayBuffer.isView(value)) {
      return value.byteLength;
    }
    return undefined;
  };
  const finish = (
    counter: MutableOperation,
    outcome: { start: number; success: boolean; bytes?: number; generation: number },
  ): void => {
    if (outcome.generation !== generation) {
      staleCompletions = add(staleCompletions, 1);
      return;
    }
    if (outcome.success) {
      counter.successes = add(counter.successes, 1);
    } else {
      counter.failures = add(counter.failures, 1);
    }
    counter.durationMs = add(counter.durationMs, Math.max(0, now() - outcome.start));
    if (outcome.bytes !== undefined) {
      counter.knownBytes = add(counter.knownBytes, outcome.bytes);
      counter.byteObservations = add(counter.byteObservations, 1);
    }
  };

  for (const [name, [prototype, key]] of Object.entries(methods)) {
    const original = prototype && Object.getOwnPropertyDescriptor(prototype, key);
    if (
      original === undefined ||
      typeof original.value !== 'function' ||
      (!original.writable && !original.configurable)
    ) {
      coverage[name] = false;
      continue;
    }
    const native = original.value as (...args: unknown[]) => unknown;
    // oxlint-disable-next-line eslint/no-loop-func -- Each wrapper captures its own name/native and the shared generation state intentionally.
    const replacement = function (this: unknown, ...args: unknown[]): unknown {
      if (
        ((name === 'fsa.fileArrayBuffer' || name === 'fsa.fileText') &&
          (typeof this !== 'object' || this === null || !filesReturnedByHandles.has(this))) ||
        (name === 'fsa.syncRead' &&
          (typeof this !== 'object' || this === null || !syncHandlesReturnedByHandles.has(this)))
      ) {
        return Reflect.apply(native, this, args);
      }
      const counter = counters[name];
      if (counter === undefined) {
        return Reflect.apply(native, this, args);
      }
      const callGeneration = generation;
      counter.calls = add(counter.calls, 1);
      const start = now();
      let result: unknown;
      try {
        result = Reflect.apply(native, this, args);
      } catch (error) {
        finish(counter, { start, success: false, generation: callGeneration });
        throw error;
      }
      if (name.startsWith('idb.')) {
        // IDB requests and transactions report completion asynchronously.
        const target = result as EventTarget;
        if (typeof target.addEventListener === 'function') {
          let settled = false;
          const settle = (success: boolean): void => {
            if (settled) {
              return;
            }
            settled = true;
            const bytes = success && (name === 'idb.put' || name === 'idb.add') ? knownWriteSize(args[0]) : undefined;
            finish(counter, { start, success, bytes, generation: callGeneration });
          };
          target.addEventListener(
            name === 'idb.transaction' ? 'complete' : 'success',
            () => {
              settle(true);
            },
            {
              once: true,
            },
          );
          if (name === 'idb.transaction') {
            target.addEventListener(
              'abort',
              () => {
                settle(false);
              },
              { once: true },
            );
          } else {
            target.addEventListener(
              'error',
              () => {
                settle(false);
              },
              { once: true },
            );
          }
        } else {
          finish(counter, { start, success: true, generation: callGeneration });
        }
      } else if (result && typeof (result as PromiseLike<unknown>).then === 'function') {
        // Observe the original promise without replacing its return value.
        const observe = async (): Promise<void> => {
          try {
            const value = await (result as Promise<unknown>);
            if (name === 'fsa.getFile' && typeof value === 'object' && value !== null) {
              filesReturnedByHandles.add(value);
            }
            if (name === 'fsa.createSyncAccessHandle' && typeof value === 'object' && value !== null) {
              syncHandlesReturnedByHandles.add(value);
            }
            const bytes =
              name === 'fsa.fileArrayBuffer' && value instanceof ArrayBuffer
                ? value.byteLength
                : name === 'fsa.fileText' && typeof value === 'string' && this instanceof Blob
                  ? this.size
                  : undefined;
            finish(counter, { start, success: true, bytes, generation: callGeneration });
          } catch {
            finish(counter, { start, success: false, generation: callGeneration });
          }
        };
        // async-iife: bootstrap -- observation does not replace the caller's original promise.
        void observe();
      } else {
        // `entries()` returns an iterator; this counts acquisition, not its
        // later `next()` reads. Coverage never claims directory-entry counts.
        finish(counter, {
          start,
          success: true,
          bytes: name === 'fsa.syncRead' && typeof result === 'number' ? result : undefined,
          generation: callGeneration,
        });
      }
      return result;
    };
    try {
      Object.defineProperty(prototype, key, { ...original, value: replacement });
      coverage[name] = true;
      counters[name] = fresh();
    } catch {
      coverage[name] = false;
    }
  }

  const realm: ProjectOpenCounterReceipt['realm'] =
    typeof Window !== 'undefined' && globalThis instanceof Window
      ? 'window'
      : 'importScripts' in globalThis
        ? 'worker'
        : 'other';
  global.__tauProjectOpenCounters = {
    read: () => ({
      version: 1,
      enabled: true,
      realm,
      generation,
      staleCompletions,
      coverage: { ...coverage },
      operations: Object.fromEntries(
        Object.keys(methods).map((name) => {
          const counter = counters[name];
          return [
            name,
            counter === undefined
              ? null
              : { ...counter, pending: Math.max(0, counter.calls - counter.successes - counter.failures) },
          ];
        }),
      ),
      manifestRequests: null,
      identityRequests: null,
    }),
    reset: () => {
      generation = add(generation, 1);
      staleCompletions = 0;
      for (const name of Object.keys(counters)) {
        counters[name] = fresh();
      }
    },
  };
  return true;
}
