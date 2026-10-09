import type { ActorOptions, AnyActorLogic } from 'xstate';
import { createAsyncLogic, createCallbackLogic } from 'xstate';
import { Topic } from '@taucad/events';
import { createObservationActor } from '#machines/observation.machine.js';
import type {
  ObservationActors,
  ObservationMachineEvent,
  ObservationReadOutput,
} from '#machines/observation.machine.js';

/** A real registration acknowledgement and connection lifetime. @public */
export type ObservationWatch = { readonly ready: Promise<void>; readonly closed: Promise<unknown>; dispose(): void };
/** Publication fence passed to domain effects which may publish internally. @public */
export type ObservationRead = {
  readonly signal: AbortSignal;
  isCurrent(): boolean;
  /** Acquire and read a current dependency through this driver's lifetime. */
  observe<S>(source: ObservationService<S>): Promise<S>;
};
/** Stable selecting snapshot; decoded values live here, outside the lifecycle machine. @public */
export type ObservationSnapshot<T> = {
  readonly status: 'registering' | 'pending' | 'ready' | 'error' | 'closed';
  readonly value?: T;
  readonly error?: string;
};
/** Read-only acquisition owned by the resource's existing service. @public */
export type ObservationLease<T> = {
  getSnapshot(): ObservationSnapshot<T>;
  subscribe(handler: () => void): () => void;
  refresh(): void;
  release(): void;
};
/** Injected resource operations. @public */
export type ObservationServiceOptions<T> = {
  readonly actorOptions?: Pick<ActorOptions<AnyActorLogic>, 'clock' | 'inspect' | 'onRejectedEvent'>;
  readonly resource: string;
  watch?(invalidate: () => void, reset: () => void): ObservationWatch;
  read(fence: ObservationRead): Promise<T>;
  equal?(previous: T, next: T): boolean;
  publish?(value: T): void;
  /** Prepare an explicit authoritative retry independently of settled dependency notifications. */
  refresh?(): void;
  /** Fence internally publishing domain effects synchronously at invalidation. */
  invalidate?(): void;
  /** Release decoded values and owned URLs on final release. */
  disposeValue?(value: T): void;
};

type ObservedDependency = {
  readonly lease: ObservationLease<unknown>;
  readonly waiting: Set<() => boolean>;
  initialized: boolean;
  unsubscribe(): void;
};

/**
 * Existing services own one instance per capability/resource/selection identity.
 * Final release closes I/O; subsequent acquisition creates a fresh actor.
 * @public
 */
export class ObservationService<T> {
  // oxlint-disable-next-line typescript/parameter-properties -- Source-consumed libraries enable erasableSyntaxOnly, which forbids parameter properties.
  private readonly options: ObservationServiceOptions<T>;
  private readonly changes = new Topic<void>({ name: 'ObservationService' });
  private snapshot: ObservationSnapshot<T> = { status: 'registering' };
  private actor: ReturnType<typeof createObservationActor> | undefined;
  private leases = 0;
  private epoch = 0;
  private readonly dependencies = new Map<ObservationService<unknown>, ObservedDependency>();
  private refreshingDependencies = false;
  private reads = 0;
  private invalidations = 0;
  private coalesced = 0;
  private refused = 0;
  private staged: { generation: number; value: T } | undefined;

  /**
   * Capture a resource's read and watch ports.
   * @param options - Resource identity and injected operations.
   */
  public constructor(options: ObservationServiceOptions<T>) {
    this.options = options;
  }

  /** Number of consumers holding this captured resource. */
  public get activeLeaseCount(): number {
    return this.leases;
  }

  /**
   * Acquire shared I/O without letting one consumer cancel another's read.
   * @returns Idempotently releasable selecting lease.
   */
  public acquire(): ObservationLease<T> {
    this.leases++;
    if (!this.actor) {
      this.start();
    }
    let released = false;
    return {
      getSnapshot: () => this.snapshot,
      subscribe: (handler) => this.changes.subscribe(handler),
      refresh: () => {
        if (!released) {
          this.refresh();
        }
      },
      release: () => {
        if (released) {
          return;
        }
        released = true;
        this.leases--;
        if (this.leases === 0) {
          this.stop();
        }
      },
    };
  }

  /** Bounded content-free counters for tests and existing diagnostic owners. */
  public get diagnostics(): {
    reads: number;
    invalidations: number;
    coalesced: number;
    refused: number;
    leases: number;
    activeWatches: number;
    dedupedLeases: number;
  } {
    return {
      reads: this.reads,
      invalidations: this.invalidations,
      coalesced: this.coalesced,
      refused: this.refused,
      leases: this.leases,
      activeWatches: this.options.watch && this.actor && !this.actor.getSnapshot().hasTag('closed') ? 1 : 0,
      dedupedLeases: Math.max(0, this.leases - 1),
    };
  }

  /** Return the current stable selecting snapshot. */
  public getSnapshot = (): ObservationSnapshot<T> => this.snapshot;

  /** Subscribe without acquiring I/O; bindings acquire in their effect. */
  public subscribe = (handler: () => void): (() => void) => this.changes.subscribe(handler);

  /** Explicit retry recreates a closed watch actor before reading again. */
  public refresh(): void {
    this.options.refresh?.();
    if (this.actor?.getSnapshot().hasTag('closed') && this.leases > 0) {
      this.epoch++;
      this.options.invalidate?.();
      this.actor.stop();
      this.actor = undefined;
      this.releaseDependencies();
      this.discardStaged();
      this.start();
      return;
    }
    this.refreshingDependencies = true;
    try {
      for (const dependency of this.dependencies.values()) {
        dependency.lease.refresh();
      }
    } finally {
      this.refreshingDependencies = false;
    }
    this.invalidate();
  }

  /** Invalidate immediately, even while a single in-flight read is pending. */
  public invalidate(): void {
    this.countInvalidation();
    this.discardStaged();
    this.options.invalidate?.();
    this.actor?.send({ type: 'invalidate' });
  }

  /** Close all active leases and fence every pending result. */
  public dispose(): void {
    this.stop();
    this.changes.dispose();
  }

  private start(): void {
    const epoch = ++this.epoch;
    const actors = {
      observationDriver: createCallbackLogic<ObservationMachineEvent, { resource: string }>(({ sendBack }) => {
        const invalidate = (): void => {
          this.countInvalidation();
          this.discardStaged();
          this.options.invalidate?.();
          sendBack({ type: 'invalidate' });
        };
        const reset = (): void => {
          this.countInvalidation();
          this.discardStaged();
          this.options.invalidate?.();
          sendBack({ type: 'reset' });
        };
        const watch = this.options.watch?.(invalidate, reset);
        let disposed = false;
        const register = async (): Promise<void> => {
          try {
            await watch?.ready;
            if (!disposed) {
              sendBack({ type: 'ready' });
            }
          } catch (error) {
            if (!disposed) {
              sendBack({ type: 'closed', error: String(error) });
            }
          }
        };
        const close = async (): Promise<void> => {
          try {
            await watch?.closed;
          } catch {
            /* Either settlement closes this captured connection. */
          }
          if (!disposed) {
            this.discardStaged();
            this.options.invalidate?.();
            sendBack({ type: 'closed', error: 'Observation connection closed.' });
          }
        };
        void register();
        if (watch) {
          void close();
        }
        return () => {
          disposed = true;
          watch?.dispose();
        };
      }),
      observationRead: createAsyncLogic<ObservationReadOutput, { generation: number }>({
        run: async ({ input, signal }) => {
          this.reads++;
          const isCurrent = (): boolean =>
            !signal.aborted &&
            epoch === this.epoch &&
            this.actor?.getSnapshot().context.generation === input.generation;
          const seen = new Set<ObservedDependency>();
          const failures = new Map<ObservedDependency, Error>();
          let value: T;
          try {
            value = await this.options.read({
              signal,
              isCurrent,
              observe: async <S>(source: ObservationService<S>): Promise<S> =>
                this.observeDependency(source, { signal, isCurrent, seen, failures, epoch }),
            });
          } catch (error) {
            if (!isCurrent()) {
              this.refused++;
            }
            signal.throwIfAborted();
            return { kind: 'failed', generation: input.generation, error: String(error) };
          }
          const failure =
            !this.options.watch && seen.size === 0
              ? new Error('Observation requires a watch or an observed dependency.')
              : failures.values().next().value;
          if (failure) {
            if (!isCurrent()) {
              this.refused++;
            }
            if (value !== this.snapshot.value) {
              this.options.disposeValue?.(value);
            }
            signal.throwIfAborted();
            return { kind: 'failed', generation: input.generation, error: String(failure) };
          }
          if (signal.aborted) {
            this.refused++;
            this.options.disposeValue?.(value);
            signal.throwIfAborted();
          }
          if (isCurrent()) {
            for (const [source, dependency] of this.dependencies) {
              if (!seen.has(dependency)) {
                this.dependencies.delete(source);
                dependency.unsubscribe();
                dependency.lease.release();
              }
            }
            this.discardStaged();
            this.staged = { generation: input.generation, value };
          } else {
            this.refused++;
            this.options.disposeValue?.(value);
          }
          return { kind: 'read', generation: input.generation };
        },
      }),
    } satisfies ObservationActors;
    const actor = createObservationActor({ resource: this.options.resource }, actors, this.options.actorOptions);
    this.actor = actor;
    actor.on('publish', ({ generation }) => {
      const { staged } = this;
      this.staged = undefined;
      if (epoch !== this.epoch || staged?.generation !== generation) {
        if (staged) {
          this.options.disposeValue?.(staged.value);
        }
        return;
      }
      const { value: previous } = this.snapshot;
      const value =
        previous !== undefined && (this.options.equal?.(previous, staged.value) ?? Object.is(previous, staged.value))
          ? previous
          : staged.value;
      if (value === previous) {
        if (staged.value !== previous) {
          this.options.disposeValue?.(staged.value);
        }
      } else {
        if (previous !== undefined) {
          this.options.disposeValue?.(previous);
        }
        this.options.publish?.(value);
      }
      this.setSnapshot({ status: 'ready', value });
    });
    actor.subscribe((state) => {
      if (epoch !== this.epoch) {
        return;
      }
      const { value } = this.snapshot;
      if (state.hasTag('closed')) {
        this.setSnapshot({
          status: 'closed',
          value,
          error: state.matches('closed') || state.matches('failed') ? state.context.error : undefined,
        });
      } else if (state.hasTag('error')) {
        this.setSnapshot({
          status: 'error',
          value,
          error: state.matches('closed') || state.matches('failed') ? state.context.error : undefined,
        });
      } else if (state.hasTag('pending')) {
        this.setSnapshot({ status: 'pending', value });
      } else if (state.hasTag('registering')) {
        this.setSnapshot({ status: 'registering', value });
      }
    });
    actor.start();
  }

  private async observeDependency<S>(
    source: ObservationService<S>,
    read: Pick<ObservationRead, 'signal' | 'isCurrent'> & {
      readonly seen: Set<ObservedDependency>;
      readonly failures: Map<ObservedDependency, Error>;
      readonly epoch: number;
    },
  ): Promise<S> {
    const { signal, isCurrent, seen, failures, epoch } = read;
    if (!isCurrent()) {
      throw new Error('Observation acquisition was superseded.');
    }
    let dependency = this.dependencies.get(source);
    if (!dependency) {
      const lease = source.acquire();
      const initial = source.getSnapshot();
      const owned: ObservedDependency = {
        lease,
        waiting: new Set(),
        initialized: initial.status === 'ready' || initial.status === 'closed' || initial.status === 'error',
        unsubscribe: () => undefined,
      };
      this.dependencies.set(source, owned);
      owned.unsubscribe = lease.subscribe(() => {
        if (epoch !== this.epoch || this.dependencies.get(source) !== owned) {
          return;
        }
        const snapshot = source.getSnapshot();
        if (!owned.initialized) {
          owned.initialized =
            snapshot.status === 'ready' || snapshot.status === 'closed' || snapshot.status === 'error';
          return;
        }
        if (
          this.refreshingDependencies ||
          (snapshot.status === 'ready' && [...owned.waiting].some((current) => current()))
        ) {
          return;
        }
        this.invalidate();
      });
      if (initial.status === 'registering') {
        lease.refresh();
      }
      dependency = owned;
    }
    seen.add(dependency);
    const owned = dependency;
    return new Promise<S>((resolve, reject) => {
      let off: () => void = () => undefined;
      const cleanup = (): void => {
        off();
        owned.waiting.delete(isCurrent);
        signal.removeEventListener('abort', aborted);
      };
      const aborted = (): void => {
        cleanup();
        reject(signal.reason instanceof Error ? signal.reason : new Error('Observation acquisition was superseded.'));
      };
      const check = (): void => {
        if (!isCurrent() || this.dependencies.get(source) !== owned) {
          aborted();
          return;
        }
        const snapshot = source.getSnapshot();
        if (this.isReadySnapshot(snapshot)) {
          cleanup();
          resolve(snapshot.value);
        } else if (snapshot.status === 'error' || snapshot.status === 'closed') {
          const error = new Error(snapshot.error ?? 'Observation dependency unavailable.');
          failures.set(owned, error);
          cleanup();
          reject(error);
        }
      };
      owned.waiting.add(isCurrent);
      off = owned.lease.subscribe(check);
      signal.addEventListener('abort', aborted, { once: true });
      check();
    });
  }

  private isReadySnapshot<S>(
    snapshot: ObservationSnapshot<S>,
  ): snapshot is ObservationSnapshot<S> & { readonly status: 'ready'; readonly value: S } {
    return snapshot.status === 'ready' && 'value' in snapshot;
  }

  private releaseDependencies(): void {
    const dependencies = [...this.dependencies.values()];
    this.dependencies.clear();
    for (const dependency of dependencies) {
      dependency.unsubscribe();
      dependency.lease.release();
    }
  }

  private discardStaged(): void {
    const { staged } = this;
    this.staged = undefined;
    if (staged && staged.value !== this.snapshot.value) {
      this.options.disposeValue?.(staged.value);
    }
  }

  private countInvalidation(): void {
    this.invalidations++;
    if (this.actor?.getSnapshot().hasTag('pending')) {
      this.coalesced++;
    }
  }

  private stop(): void {
    this.epoch++;
    this.options.invalidate?.();
    this.actor?.stop();
    this.actor = undefined;
    this.releaseDependencies();
    this.discardStaged();
    if (this.snapshot.value !== undefined) {
      this.options.disposeValue?.(this.snapshot.value);
    }
    this.setSnapshot({ status: 'closed' });
  }

  private setSnapshot(next: ObservationSnapshot<T>): void {
    if (
      this.snapshot.status === next.status &&
      this.snapshot.value === next.value &&
      this.snapshot.error === next.error
    ) {
      return;
    }
    this.snapshot = next;
    this.changes.emit();
  }
}
