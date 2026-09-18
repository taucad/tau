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

import type { MountConfig, ProjectRootConfig, StorageRootConfig, WorkspaceScope } from '#mount-table.js';
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
 * Whether a standalone read of this scope can render a cross-mount tree. An
 * ephemeral in-memory root has no persisted namespace to list.
 *
 * @param scope - The standalone scope a read named.
 * @returns Whether the scope has a listable persisted namespace.
 */
export const hasStandaloneTree = (scope: WorkspaceScope): boolean => scope.backend !== 'memory';

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
