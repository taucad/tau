import type { GeometrySubject } from '#mesh/types.js';
import type { GeoSpecResourceScopeProfile } from '#runner/profile.js';

type Disposable = () => void | Promise<void>;

const geospecResourceScopeSymbol = Symbol.for('tau.geospec.resourceScope');

type ScopedSubject = GeometrySubject & {
  [geospecResourceScopeSymbol]?: GeoSpecResourceScope;
};

const disposeSequentially = async (disposables: readonly Disposable[], index = 0): Promise<void> => {
  const disposable = disposables[index];
  if (!disposable) {
    return;
  }
  let firstError: unknown;
  let caught = false;
  try {
    await disposable();
  } catch (error) {
    firstError = error;
    caught = true;
  }
  try {
    await disposeSequentially(disposables, index + 1);
  } catch (error) {
    if (!caught) {
      firstError = error;
      caught = true;
    }
  }
  if (caught) {
    throw firstError;
  }
};

/**
 * Internal disposable scope owned by a GeoSpec module or aggregate runner run.
 *
 * @internal
 */
export type GeoSpecResourceScope = {
  readonly disposed: boolean;
  readonly profile?: GeoSpecResourceScopeProfile;
  trackSubject(subject: GeometrySubject): GeometrySubject;
  register(disposable: Disposable): void;
  dispose(): Promise<void>;
};

/**
 * Attach a runner-owned resource scope to loaded subjects so matchers can cache
 * native/WASM resources for repeated assertions without exposing an authoring API.
 *
 * @internal
 */
export const attachGeoSpecResourceScope = (subject: GeometrySubject, scope: GeoSpecResourceScope): GeometrySubject => {
  (subject as ScopedSubject)[geospecResourceScopeSymbol] = scope;
  return subject;
};

/**
 * Resolve the internal resource scope for a loaded geometry subject.
 *
 * @internal
 */
export const getGeoSpecResourceScope = (subject: GeometrySubject): GeoSpecResourceScope | undefined =>
  (subject as ScopedSubject)[geospecResourceScopeSymbol];

/**
 * Create an internal disposable resource scope for one GeoSpec run lifetime.
 *
 * @internal
 */
export const createGeoSpecResourceScope = (
  options: { profile?: GeoSpecResourceScopeProfile } = {},
): GeoSpecResourceScope => {
  const disposables: Disposable[] = [];
  const trackedSubjects = new WeakSet<GeometrySubject>();
  let disposed = false;
  const { profile } = options;

  return {
    get disposed(): boolean {
      return disposed;
    },

    ...(profile ? { profile } : {}),

    trackSubject(subject: GeometrySubject): GeometrySubject {
      if (!trackedSubjects.has(subject)) {
        trackedSubjects.add(subject);
        if (profile) {
          profile.trackedSubjects += 1;
        }
        attachGeoSpecResourceScope(subject, this);
      }
      return subject;
    },

    register(disposable: Disposable): void {
      if (profile) {
        profile.registeredDisposables += 1;
      }
      if (disposed) {
        void disposable();
        if (profile) {
          profile.disposedResources += 1;
        }
        return;
      }
      disposables.push(disposable);
    },

    async dispose(): Promise<void> {
      if (disposed) {
        return;
      }
      disposed = true;
      if (profile) {
        profile.disposedScopes += 1;
      }
      const pending = [...disposables].reverse();
      disposables.length = 0;
      await disposeSequentially(
        pending.map((disposable) => async () => {
          await disposable();
          if (profile) {
            profile.disposedResources += 1;
          }
        }),
      );
    },
  };
};
