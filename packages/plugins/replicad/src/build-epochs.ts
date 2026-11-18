/**
 * Build and module epochs: deterministic ownership of what a Replicad build delivers (memory R5, A3).
 *
 * Every handle the kernel delivers opens a build epoch that owns the values its entries return. When the runtime
 * releases the handle (`releaseHandle`), the epoch ends and deletes each value exactly once, unless another live
 * handle still delivers it or it belongs to a module epoch. So a rebuild frees the shapes it replaces when the
 * runtime drops them, instead of when the collector runs, and a long drag keeps a flat heap.
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
 * handle registry in the OpenCascade glue, nothing finds them deterministically. A value user code keeps across builds
 * in module state filled during `main`, and returns, belongs to the build that returned it: after that build is
 * released, using it throws "This object has been deleted" rather than reading freed memory.
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
  /** Values deleted by released epochs. */
  readonly deleted: number;
};

/** The kernel's build and module epochs. @internal */
export type HandleEpochs = {
  /**
   * Run module execution in a module epoch: every Replicad wrapper and drawing constructed meanwhile belongs to it.
   * Nothing is marked when the execute cache answers without running the module.
   */
  inModuleEpoch<T>(execute: () => Promise<T>): Promise<T>;
  /** Open the build epoch of a handle about to be delivered. */
  adopt<Handle extends EpochHandle>(handle: Handle): Handle;
  /** End a delivered handle's epoch, deleting each value it alone owns. A second release is a no-op. */
  release(handle: EpochHandle): void;
  stats(): HandleEpochStats;
};

type Deletable = { delete(): void };

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
  const moduleOwned = new WeakSet();
  const live = new Set<EpochHandle>();
  /** Live handles delivering each value. */
  const holders = new Map<WeakKey, number>();
  let epochs = 0;
  let deleted = 0;
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
    adopt(handle) {
      if (!live.has(handle)) {
        live.add(handle);
        epochs += 1;
        for (const value of valuesOf(handle)) {
          holders.set(value, (holders.get(value) ?? 0) + 1);
        }
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
        if (!moduleOwned.has(value) && isDeletable(value)) {
          value.delete();
          deleted += 1;
        }
      }
    },
    stats: () => ({ epochs, liveHandles: live.size, liveValues: holders.size, deleted }),
  };
};
