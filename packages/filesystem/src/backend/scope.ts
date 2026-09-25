/**
 * Storage-scope vocabulary: the translation between the authority's persisted
 * configuration unions and the {@link WorkspaceScope} every backend is addressed
 * by, plus the two admission facts that depend on which root a scope names.
 *
 * It lives in the backend layer because the discriminant it reads is the backend
 * layer's own: above here a root is a capability, never a name (charter D13).
 *
 * @module
 */

import type {
  MountConfig,
  ProjectLocator,
  ProjectRootConfig,
  StorageRootConfig,
  WorkspaceScope,
} from '#mount-table.js';
import { MissingWorkspaceHandleError } from '#workspace-errors.js';

/**
 * The storage scope one mount or root configuration names.
 *
 * @param config - A mount configuration or an already-narrowed scope.
 * @returns The equivalent workspace scope.
 * @throws MissingWorkspaceHandleError when a webaccess configuration arrived without its handle.
 */
export function toScope(config: WorkspaceScope | MountConfig): WorkspaceScope {
  if (config.backend === 'webaccess') {
    // Defensive runtime check — the discriminated `MountConfig` makes
    // this unreachable in well-typed call sites, but structured-clone
    // deserialisation through the worker bridge is not type-checked.
    // oxlint-disable-next-line @typescript-eslint/no-unnecessary-condition -- defensive runtime guard against unsafe (untyped RPC / `as any`) callers
    if (!config.directoryHandle) {
      throw new MissingWorkspaceHandleError({ workspaceId: config.workspaceId });
    }
    return {
      backend: 'webaccess',
      directoryHandle: config.directoryHandle,
      workspaceId: config.workspaceId,
    };
  }
  if (config.backend === 'memory') {
    return { backend: 'memory', storageRootKey: config.storageRootKey };
  }
  return config.backend === 'node' ? { backend: 'node', path: config.path } : { backend: config.backend };
}

/**
 * The storage scope one persisted route names, project or checkout alike.
 *
 * @param config - The persisted route configuration.
 * @param webAccessRoots - Webaccess roots of the same pass, indexed by workspace id.
 * @returns The equivalent workspace scope.
 * @throws MissingWorkspaceHandleError when a webaccess route names no configured root.
 */
export function scopeForRouteConfig(
  config: ProjectRootConfig,
  webAccessRoots: ReadonlyMap<string, Extract<StorageRootConfig, { backend: 'webaccess' }>>,
): WorkspaceScope {
  if (config.backend === 'webaccess') {
    const root = webAccessRoots.get(config.workspaceId);
    if (root === undefined) {
      throw new MissingWorkspaceHandleError({ workspaceId: config.workspaceId });
    }
    return toScope(root);
  }
  if (config.backend === 'memory') {
    return toScope({ backend: 'memory', storageRootKey: config.storageRootKey });
  }
  return config.backend === 'node'
    ? toScope({ backend: 'node', path: config.path })
    : toScope({ backend: config.backend });
}

/**
 * Whether this scope's storage outlives the process. An in-memory root is
 * ephemeral: it has no persisted namespace to list, to commit a pending project
 * into, or to permanently delete a project directory from.
 *
 * @param scope - The scope an operation named.
 * @returns Whether the scope names durable storage.
 */
export const isDurableScope = (scope: WorkspaceScope): boolean => scope.backend !== 'memory';

/**
 * The locator one discovered project directory is addressed by: the storage
 * root's own physical identity plus where the directory sits inside it. One
 * config union mapped onto another — the backend layer owns the discriminant
 * both are keyed on (charter D13).
 *
 * @param root - Configured storage root the scan is walking.
 * @param storageRootKey - Resolved storage-root key of that root.
 * @param relativeDirectory - Project directory relative to the root.
 * @returns The locator naming that directory.
 */
export const projectLocatorFor = (
  root: StorageRootConfig,
  storageRootKey: string,
  relativeDirectory: string,
): ProjectLocator =>
  root.backend === 'webaccess'
    ? { backend: root.backend, storageRootKey, relativeDirectory, workspaceId: root.workspaceId }
    : root.backend === 'node'
      ? { backend: root.backend, storageRootKey, relativeDirectory, path: root.path }
      : { backend: root.backend, storageRootKey, relativeDirectory };

/**
 * Whether a dynamic mount configuration carries exactly the storage scope its
 * protected prefix reserves: one ephemeral root per preview instance, the
 * origin-private root for the bundled-types route.
 *
 * @param config - The mount configuration the caller offered.
 * @param previewInstance - Preview instance the prefix names, or `undefined` for the bundled-types route.
 * @returns Whether the configuration matches its prefix's reserved scope.
 */
export const matchesProtectedMountScope = (config: MountConfig, previewInstance: string | undefined): boolean => {
  const expected: WorkspaceScope =
    previewInstance === undefined
      ? { backend: 'opfs' }
      : { backend: 'memory', storageRootKey: `memory:preview:${previewInstance}` };
  if (config.backend !== expected.backend) {
    return false;
  }
  return (
    !('storageRootKey' in expected) || ('storageRootKey' in config && config.storageRootKey === expected.storageRootKey)
  );
};
