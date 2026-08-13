/**
 * Resource-scope contract.
 *
 * A run's disposable scope owns engine resources (native XDE handles, kernel
 * caches), so constructing one is engine work (D-S3). The substrate declares
 * the shape the runner shells and `RunGeoSpecModuleOptions` speak.
 *
 * @module
 */

import type { GeometrySubject } from '#mesh/types.js';
import type { GeoSpecResourceScopeProfile } from '#runner/profile.js';

/**
 * A disposable registered with a resource scope.
 *
 * @internal
 */
export type GeoSpecDisposable = () => void | Promise<void>;

/**
 * Internal disposable scope owned by a GeoSpec module or aggregate runner run.
 *
 * @internal
 */
export type GeoSpecResourceScope = {
  readonly disposed: boolean;
  readonly profile?: GeoSpecResourceScopeProfile;
  trackSubject(subject: GeometrySubject): GeometrySubject;
  register(disposable: GeoSpecDisposable): void;
  dispose(): Promise<void>;
};
