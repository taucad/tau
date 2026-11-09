/**
 * Where a repository's objects are stored, apart from any provider, so the
 * files link signer can name one without reaching the store adapter (NI14).
 *
 * @module
 */

import type { RepositoryLocator } from '#store/port.js';

/**
 * Everything for one repository lives under this prefix (D24).
 *
 * @param locator - The repository.
 * @returns `<owner>/repos/<project>/`, below the `tenants/` namespace prefix.
 */
export const repositoryPrefix = (locator: RepositoryLocator): string =>
  `${locator.ownerId}/repos/${locator.projectId}/`;

/**
 * Where one repository-relative key is stored in the `tenants` namespace of
 * the private tier: the one other place this layout is read is the files
 * link signer, which the catalogue hands it to (D8).
 *
 * @param locator - The repository.
 * @param key - A key relative to it, such as `packs/<name>.idx`.
 * @returns The key below the `tenants/` namespace prefix.
 */
export const repositoryObjectKey = (locator: RepositoryLocator, key: string): string =>
  `${repositoryPrefix(locator)}${key}`;
