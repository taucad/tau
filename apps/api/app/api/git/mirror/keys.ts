import { repositoryLocator } from '#api/git/store/locator.js';
import type { RepositoryLocator } from '#api/git/store/port.js';

/**
 * The B2 second copy's key layout (W13 B2), as bucket keys.
 *
 * Immutable objects keep their R2 keys verbatim under `tenants/`. Manifests are
 * never written as `manifest.json`: each copied generation becomes an immutable
 * snapshot whose name sorts in generation order, and an owner's deletion is an
 * immutable marker, so every B2 key is written once and a restore from B2 alone
 * knows who was erased. Every key is under `tenants/`, the only prefix the copy
 * key may write (`modules/backblaze-b2-copy`, `name_prefix`).
 */

/** Digits in a snapshot's generation: `Number.MAX_SAFE_INTEGER` has 16, so 20 always sorts. */
const generationDigits = 20;

const snapshotPattern = /^manifests\/(\d{20})-([\da-f]{32})\.json$/u;

/** `tenants/<owner>/repos/<project>/`: where one repository's copy lives, as in R2. */
export const repositoryPrefix = (locator: RepositoryLocator): string =>
  `tenants/${locator.ownerId}/repos/${locator.projectId}/`;

/** `tenants/<owner>/lfs/<project>/`: one project's LFS objects, as in R2 (D24). */
export const lfsPrefix = (locator: RepositoryLocator): string => `tenants/${locator.ownerId}/lfs/${locator.projectId}/`;

/** The bucket key of a repository-relative key (`packs/…`, `pushes/…`, `retired/…`). */
export const repositoryKey = (locator: RepositoryLocator, key: string): string => `${repositoryPrefix(locator)}${key}`;

/** The repository-relative snapshot key of generation `generation` under `incarnation` (W13 B2). */
export const snapshotRelativeKey = (generation: number, incarnation: string): string =>
  `manifests/${String(generation).padStart(generationDigits, '0')}-${incarnation}.json`;

/** The bucket key of a snapshot. */
export const snapshotKey = (locator: RepositoryLocator, generation: number, incarnation: string): string =>
  repositoryKey(locator, snapshotRelativeKey(generation, incarnation));

/** The generation and incarnation a repository-relative snapshot key names, or `undefined`. */
export const parseSnapshotKey = (relativeKey: string): { generation: number; incarnation: string } | undefined => {
  const match = snapshotPattern.exec(relativeKey);
  if (match?.[1] === undefined || match[2] === undefined) {
    return undefined;
  }
  return { generation: Number(match[1]), incarnation: match[2] };
};

/** The bucket key of one LFS object of a project. */
export const lfsKey = (locator: RepositoryLocator, oid: string): string => `${lfsPrefix(locator)}${oid}`;

/**
 * `tenants/<owner>/tombstone-<epoch ms>.json`: the owner's deletion as an immutable
 * marker. The time is the `storage_tombstone` row's creation, so re-marking the
 * same deletion names the same key.
 */
export const ownerMarkerKey = (ownerId: string, deletedAt: Date): string => {
  const { ownerId: checked } = repositoryLocator({
    ownerId,
    projectId: 'marker',
  });
  return `tenants/${checked}/tombstone-${String(deletedAt.getTime())}.json`;
};

/** The prefix every marker of an owner shares. */
export const ownerMarkerPrefix = (ownerId: string): string => {
  const { ownerId: checked } = repositoryLocator({
    ownerId,
    projectId: 'marker',
  });
  return `tenants/${checked}/tombstone-`;
};
