/**
 * Build and module epochs: deterministic ownership of what a Replicad build delivers (memory R5, A3).
 *
 * Every handle the kernel delivers opens a build epoch that owns the values its entries return. When the runtime
 * releases the handle (`releaseHandle`), each value no other live handle delivers and no module epoch owns is parked,
 * not deleted: user code may keep a shape it returned in module state and return it again. The next delivered handle
 * settles the parked values: those it delivers again are adopted by it, and the rest are deleted, exactly once.
 * Disposing the epochs deletes whatever is still parked. So a rebuild frees the shapes it replaced one build later,
 * instead of whenever the collector runs, and a long drag keeps a flat heap.
 *
 * A module epoch holds what a module's top level creates. The execute cache keeps a module across parameter-only
 * rebuilds, so a shape built at module scope and returned by `main` is delivered by build after build. Values created
 * while a module executes are marked as they are constructed, and no build epoch deletes them. A module epoch is
 * never deleted by the kernel: the execute cache keeps every module value keyed by its bundle output, so reverting a
 * code edit runs the older module again with the same module-scope shapes. They live as long as the module does and
 * are freed by Replicad's finalization registry with it. (The program's rule A3 released them on re-execution; that
 * would make such a revert throw.)
 *
 * What a build creates and does not return (the intermediates of `main`) is still freed by the registry: without a
 * handle registry in the OpenCascade glue, nothing finds them deterministically.
 *
 * Release fallback. A module that keeps shapes `main` built in module state (a memo keyed by a parameter) may return
 * one after its build was released and the shape deleted: a drag through three values and back does. The kernel then
 * runs that module fresh, once, in the same build, and adopts its handles for the collector from then on
 * (`adopt(handle, { collector: true })`): their values are never parked or deleted here, and Replicad's finalization
 * registry frees them as it did before epochs. The epochs remember what they deleted (`wasReleased`), so the kernel
 * can tell a returned released value from a shape the user deleted.
 *
 * @internal
 */
import type * as ReplicadModule from 'replicad';

type ReplicadLibrary = typeof ReplicadModule;

/** A handle as epochs see it: the values its entries deliver. @internal */
export type EpochHandle = { readonly shapes: ReadonlyArray<{ readonly shape: unknown }> };

/** Counters for tests and diagnostics. @internal */
export type HandleEpochStats = {
  /** Build epochs opened so far. */
  readonly epochs: number;
  /** Delivered handles not yet released. */
  readonly liveHandles: number;
  /** Distinct values the live handles deliver. */
  readonly liveValues: number;
  /** Released values waiting for the next delivered handle. */
  readonly parked: number;
  /** Values deleted by released epochs. */
  readonly deleted: number;
  /** Handles adopted for the collector (release fallback). */
  readonly collected: number;
};

/** How a handle is adopted. @internal */
export type AdoptOptions = {
  /**
   * Leave the handle's values to Replicad's finalization registry: no epoch holds, parks or deletes them. The kernel
   * adopts a module's handles this way once the module returned a value its epochs had deleted.
   */
  readonly collector?: boolean;
};

/** The kernel's build and module epochs. @internal */
export type HandleEpochs = {
  /**
   * Run module execution in a module epoch: every Replicad wrapper and drawing constructed meanwhile belongs to it.
   * Nothing is marked when the execute cache answers without running the module.
   */
  inModuleEpoch<T>(execute: () => Promise<T>): Promise<T>;
  /**
   * Open the build epoch of a handle about to be delivered. Parked values it delivers again are its own; the other
   * parked values are deleted.
   */
  adopt<Handle extends EpochHandle>(handle: Handle, options?: AdoptOptions): Handle;
  /** End a delivered handle's epoch, parking each value it alone owns. A second release is a no-op. */
  release(handle: EpochHandle): void;
  /** Whether an epoch deleted `value`: user code returned or used a shape after its build was released. */
  wasReleased(value: unknown): boolean;
  /** Delete every parked value, when the kernel is disposed. */
  dispose(): void;
  stats(): HandleEpochStats;
};

type Deletable = { delete(): void };

/**
 * Messages of a value used after it was deleted: Replicad's wrappers and finders, and embind's own checks.
 */
const useAfterReleasePattern = /\b(?:has been deleted|instance already deleted|deleted object)\b/u;

/**
 * Whether a build failed because a value it used had been deleted: Replicad's "This object has been deleted", or
 * embind's "Cannot pass deleted object" and "instance already deleted". Not a function of the build's inputs, so the
 * live tier never keeps it as a failure, and the kernel answers it with the release fallback.
 *
 * @param error - What the build threw.
 * @returns True for a use-after-release failure.
 * @internal
 */
export const isUseAfterRelease = (error: unknown): boolean =>
  error instanceof Error && useAfterReleasePattern.test(error.message);

const isDeletable = (value: unknown): value is Deletable =>
  value !== null && typeof value === 'object' && typeof (value as Partial<Deletable>).delete === 'function';

/**
 * Mark objects as their constructor assigns `property`: an accessor on the prototype defines the own property the
 * plain assignment would have made, then marks the object. Replicad assigns `oc` in every wrapper's constructor and
 * `innerShape` in a drawing's. The accessor exists only while a module executes.
 *
 * @param prototype - Prototype whose constructor assigns `property`.
 * @param property - The property the constructor assigns.
 * @param mark - Called with each object constructed meanwhile.
 * @returns Removes the accessor.
 */
const markConstruction = (prototype: unknown, property: string, mark: (value: WeakKey) => void): (() => void) => {
  const target = prototype as Record<string, unknown>;
  Object.defineProperty(target, property, {
    configurable: true,
    // oxlint-disable-next-line eslint/accessor-pairs -- constructors only assign; the setter defines the own property every later read finds.
    set(this: WeakKey, value: unknown) {
      Object.defineProperty(this, property, { value, writable: true, enumerable: true, configurable: true });
      mark(this);
    },
  });
  return () => {
    Reflect.deleteProperty(target, property);
  };
};

/**
 * Create the kernel's epochs.
 *
 * @param library - The Replicad library user code imports.
 * @returns The epochs.
 * @internal
 */
export const createHandleEpochs = (library: ReplicadLibrary): HandleEpochs => {
  /** Values no build epoch deletes: built while a module executed, or delivered by a collector handle. */
  const moduleOwned = new WeakSet();
  /** Values the epochs deleted. */
  const released = new WeakSet();
  const live = new Set<EpochHandle>();
  /** Live handles delivering each value. */
  const holders = new Map<WeakKey, number>();
  /** Released values the next delivered handle settles. */
  const parked = new Set<WeakKey>();
  let epochs = 0;
  let deleted = 0;
  let collected = 0;
  let executing = false;

  const valuesOf = (handle: EpochHandle): Set<WeakKey> => {
    const values = new Set<WeakKey>();
    for (const { shape } of handle.shapes) {
      if (shape !== null && typeof shape === 'object') {
        values.add(shape);
      }
    }
    return values;
  };

  const deleteParked = (): void => {
    for (const value of parked) {
      if (isDeletable(value)) {
        value.delete();
        released.add(value);
        deleted += 1;
      }
    }
    parked.clear();
  };

  return {
    async inModuleEpoch(execute) {
      if (executing) {
        return execute();
      }
      executing = true;
      const mark = (value: WeakKey): void => {
        moduleOwned.add(value);
      };
      const unmarkWrappers = markConstruction(library.WrappingObj.prototype, 'oc', mark);
      const unmarkDrawings = markConstruction(library.Drawing.prototype, 'innerShape', mark);
      try {
        return await execute();
      } finally {
        unmarkDrawings();
        unmarkWrappers();
        executing = false;
      }
    },
    adopt(handle, options) {
      if (options?.collector === true) {
        collected += 1;
        for (const value of valuesOf(handle)) {
          moduleOwned.add(value);
          parked.delete(value);
        }
        deleteParked();
        return handle;
      }
      if (!live.has(handle)) {
        live.add(handle);
        epochs += 1;
        for (const value of valuesOf(handle)) {
          holders.set(value, (holders.get(value) ?? 0) + 1);
          parked.delete(value);
        }
        deleteParked();
      }
      return handle;
    },
    release(handle) {
      if (!live.delete(handle)) {
        return;
      }
      for (const value of valuesOf(handle)) {
        const remaining = (holders.get(value) ?? 1) - 1;
        if (remaining > 0) {
          holders.set(value, remaining);
          continue;
        }
        holders.delete(value);
        if (!moduleOwned.has(value)) {
          parked.add(value);
        }
      }
    },
    wasReleased: (value) => value !== null && typeof value === 'object' && released.has(value),
    dispose: deleteParked,
    stats: () => ({
      epochs,
      liveHandles: live.size,
      liveValues: holders.size,
      parked: parked.size,
      deleted,
      collected,
    }),
  };
};
