/**
 * The run's disposable scope.
 *
 * A GeoSpec run holds native XDE reads and prepared mesh backends whose
 * lifetimes are the run, not any single claim. The scope owns them, and
 * disposal is **idempotent by construction**: a `WeakSet` remembers what has
 * already been retired, because double-deleting an Emscripten handle does not
 * throw — it aborts the whole wasm instance (D-10).
 *
 * Disposal runs in reverse registration order (the caches a subject owns go
 * before the subject's own read) and never lets one failing disposer strand
 * the rest.
 *
 * @module
 */

import type { GeoSpecResourceScopeProfile } from '#runner/profile.js';
import type { GeometrySubject } from '#mesh/types.js';
import { releaseEngineSubject } from '#engine/subject-store.js';

/**
 * A disposable registered with a scope.
 *
 * @public
 */
export type GeoSpecDisposable = () => void | Promise<void>;

/**
 * The disposable scope owned by one module or aggregate runner run.
 *
 * @public
 */
export type GeoSpecResourceScope = {
  readonly disposed: boolean;
  readonly profile?: GeoSpecResourceScopeProfile;
  trackSubject(subject: GeometrySubject): GeometrySubject;
  register(disposable: GeoSpecDisposable): void;
  dispose(): Promise<void>;
};

/**
 * Options for {@link createGeoSpecResourceScope}.
 *
 * @public
 */
export type CreateGeoSpecResourceScopeOptions = {
  profile?: GeoSpecResourceScopeProfile;
};

/**
 * Which scope owns a subject. Engine modules that build per-subject caches
 * (the overlap ladder's prepared solids) need somewhere to register their
 * disposer, and the subject is the only thing they are handed.
 */
const scopeBySubject = new WeakMap<GeometrySubject, GeoSpecResourceScope>();

/**
 * The scope tracking a subject, if any.
 *
 * @param subject - The subject.
 * @returns Its owning scope, or `undefined` for an untracked subject.
 * @public
 */
export const getGeoSpecResourceScopeFor = (subject: GeometrySubject): GeoSpecResourceScope | undefined =>
  scopeBySubject.get(subject);

/**
 * Create a resource scope.
 *
 * @param options - Optional profile counters to populate.
 * @returns The scope.
 * @public
 */
export const createGeoSpecResourceScope = (options: CreateGeoSpecResourceScopeOptions = {}): GeoSpecResourceScope => {
  const { profile } = options;
  const disposables: GeoSpecDisposable[] = [];
  const subjects: GeometrySubject[] = [];
  const tracked = new WeakSet<GeometrySubject>();
  let disposed = false;

  const scope: GeoSpecResourceScope = {
    get disposed(): boolean {
      return disposed;
    },
    ...(profile === undefined ? {} : { profile }),

    trackSubject(subject) {
      // Idempotent: tracking the same subject twice must not queue a second
      // disposal of the same native read.
      if (!tracked.has(subject)) {
        tracked.add(subject);
        subjects.push(subject);
        scopeBySubject.set(subject, scope);
        if (profile) {
          profile.trackedSubjects += 1;
        }
      }
      return subject;
    },

    register(disposable) {
      disposables.push(disposable);
      if (profile) {
        profile.registeredDisposables += 1;
      }
    },

    async dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      if (profile) {
        profile.disposedScopes += 1;
      }
      // Reverse order: whatever was built on top of a subject goes first.
      for (const disposable of [...disposables].reverse()) {
        try {
          // oxlint-disable-next-line no-await-in-loop -- Reverse order is the contract: a dependent resource must be gone before the one it was built on.
          await disposable();
        } catch {
          // A disposer that throws must not strand the resources behind it.
        }
        if (profile) {
          profile.disposedResources += 1;
        }
      }
      disposables.length = 0;
      for (const subject of subjects) {
        const { subjectId } = subject;
        if (subjectId === undefined || !releaseEngineSubject(subjectId)) {
          subject.nativeXde?.delete?.();
        }
        scopeBySubject.delete(subject);
      }
      subjects.length = 0;
    },
  };

  return scope;
};
