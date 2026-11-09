/**
 * The path grammar of a files link, and the only R2 keys it can name.
 *
 * Three layouts exist. Two are the LFS keys `apps/libs/api-git-core/src/lfs-keys.ts`
 * reads through: the tenant key every upload lands at since D24, and the
 * legacy per-project key under `blobs/`. The third is the cold-open surface
 * of a repository (charter D8): a live pack's body and its stored `.idx`
 * (`packs/`), and the head listing written at push (`listings/`). Nothing
 * else in the bucket (the manifest, retirement markers, push-log segments,
 * publication manifests) has a path here, so even a valid signing key cannot
 * reach it.
 */

/**
 * One LFS object a files link can name.
 *
 * @public
 */
export type FileLinkLocation = FileLinkLfsLocation | FileLinkRepositoryLocation;

/**
 * One LFS object a files link can name: its tenant key, or its legacy key.
 *
 * @public
 */
export type FileLinkLfsLocation =
  | Readonly<{ layout: 'tenant'; ownerId: string; projectId: string; oid: string }>
  | Readonly<{ layout: 'legacy'; projectId: string; oid: string }>;

/** What a repository link may name. @public */
export type FileLinkRepositoryKind = 'pack' | 'index' | 'listing';

/**
 * One cold-open file of a repository (charter D8): a live pack (`pack`, read
 * by Range), its stored index (`index`), or a head listing (`listing`).
 *
 * `name` is the stored file's name without its extension: an upload's pack
 * name (`pack-<git hash>-<16 hex nonce>`, `commit.ts` `uploadKeyFor`) or, for
 * a listing, the commit id it lists.
 *
 * @public
 */
export type FileLinkRepositoryLocation = Readonly<{
  layout: 'repository';
  ownerId: string;
  projectId: string;
  kind: FileLinkRepositoryKind;
  name: string;
}>;

const identifierPattern = /^[A-Za-z\d][\w-]{0,63}$/u;
const oidPattern = /^[0-9a-f]{64}$/u;
const packNamePattern = /^pack-(?:[0-9a-f]{40}|[0-9a-f]{64})-[0-9a-f]{16}$/u;
const commitPattern = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;

/* Each kind's directory and extension, the same in the link path and the bucket key. */
const repositoryFiles: Readonly<Record<FileLinkRepositoryKind, Readonly<{ directory: string; extension: string }>>> = {
  pack: { directory: 'packs', extension: '.pack' },
  index: { directory: 'packs', extension: '.idx' },
  listing: { directory: 'listings', extension: '.tsv.gz' },
};
const repositoryKinds = ['pack', 'index', 'listing'] as const;

const isRepositoryName = (kind: FileLinkRepositoryKind, name: string): boolean =>
  (kind === 'listing' ? commitPattern : packNamePattern).test(name);

/* A repository file below its repository: `packs/<name>.pack`, `packs/<name>.idx` or `listings/<commit>.tsv.gz`. */
const repositoryFile = (location: FileLinkRepositoryLocation): string => {
  const { directory, extension } = repositoryFiles[location.kind];
  return `${directory}/${location.name}${extension}`;
};

/**
 * Whether a value is a storable owner or project id: the `repositoryLocator`
 * rule (`isProjectRepositoryId`), which refuses a separator, a traversal, a
 * percent-escape and an over-long name.
 *
 * @param value - The candidate id.
 * @returns Whether it may appear in a link path and an R2 key.
 * @public
 */
export const isFileLinkIdentifier = (value: string): boolean => identifierPattern.test(value);

/**
 * Whether a value is a git-lfs SHA-256 object id in lower-case hex.
 *
 * @param value - The candidate oid.
 * @returns Whether it is 64 lower-case hex digits.
 * @public
 */
export const isFileLinkOid = (value: string): boolean => oidPattern.test(value);

/* The repository file an owner, a project, a directory and a file name spell, or `undefined`. */
const repositoryLocationOf = ([ownerId = '', projectId = '', directory = '', file = '']: readonly string[]):
  | FileLinkRepositoryLocation
  | undefined => {
  if (!isFileLinkIdentifier(ownerId) || !isFileLinkIdentifier(projectId)) {
    return undefined;
  }
  for (const kind of repositoryKinds) {
    const spelled = repositoryFiles[kind];
    if (directory === spelled.directory && file.endsWith(spelled.extension)) {
      const name = file.slice(0, -spelled.extension.length);
      return isRepositoryName(kind, name) ? { layout: 'repository', ownerId, projectId, kind, name } : undefined;
    }
  }
  return undefined;
};

/**
 * The strong entity tag of what a location names: the LFS oid, or the
 * repository file's kind and immutable name (no two uploads share a name).
 *
 * @param location - A verified location.
 * @returns The tag's value, unquoted.
 * @public
 */
export const fileLinkEntityTag = (location: FileLinkLocation): string =>
  location.layout === 'repository' ? `${location.kind}-${location.name}` : location.oid;

const assertLocation = (location: FileLinkLocation): void => {
  if (location.layout === 'repository') {
    if (
      !isFileLinkIdentifier(location.ownerId) ||
      !isFileLinkIdentifier(location.projectId) ||
      !repositoryKinds.includes(location.kind) ||
      !isRepositoryName(location.kind, location.name)
    ) {
      throw new RangeError('The files link location is not a storable repository file.');
    }
    return;
  }
  const ids = location.layout === 'tenant' ? [location.ownerId, location.projectId] : [location.projectId];
  if (!ids.every((id) => isFileLinkIdentifier(id)) || !isFileLinkOid(location.oid)) {
    throw new RangeError('The files link location is not a storable LFS object.');
  }
};

/**
 * The URL path that names one LFS object on the files host.
 *
 * @param location - The object.
 * @returns `/v1/lfs/<ownerId>/<projectId>/<oid>`, `/v1/lfs-legacy/<projectId>/<oid>`, or
 *   `/v1/git/<ownerId>/<projectId>/` and `packs/<name>.pack`, `packs/<name>.idx` or `listings/<commit>.tsv.gz`.
 * @throws RangeError - When an id or the oid is not storable.
 * @public
 *
 * @example <caption>A tenant object's path</caption>
 * ```typescript
 * import { fileLinkPath } from '@taucad/file-links';
 *
 * fileLinkPath({ layout: 'tenant', ownerId: 'user_1', projectId: 'proj_1', oid: 'a'.repeat(64) });
 * ```
 */
export const fileLinkPath = (location: FileLinkLocation): string => {
  assertLocation(location);
  if (location.layout === 'repository') {
    return `/v1/git/${location.ownerId}/${location.projectId}/${repositoryFile(location)}`;
  }
  return location.layout === 'tenant'
    ? `/v1/lfs/${location.ownerId}/${location.projectId}/${location.oid}`
    : `/v1/lfs-legacy/${location.projectId}/${location.oid}`;
};

/* The LFS object a path's segments spell, or `undefined`. */
const lfsLocationOf = (segments: readonly string[]): FileLinkLfsLocation | undefined => {
  let location: FileLinkLfsLocation | undefined;
  if (segments[2] === 'lfs' && segments.length === 6) {
    const [ownerId = '', projectId = '', oid = ''] = segments.slice(3);
    location = { layout: 'tenant', ownerId, projectId, oid };
  } else if (segments[2] === 'lfs-legacy' && segments.length === 5) {
    const [projectId = '', oid = ''] = segments.slice(3);
    location = { layout: 'legacy', projectId, oid };
  }
  if (location === undefined) {
    return undefined;
  }
  const ids = location.layout === 'tenant' ? [location.ownerId, location.projectId] : [location.projectId];
  return ids.every((id) => isFileLinkIdentifier(id)) && isFileLinkOid(location.oid) ? location : undefined;
};

/**
 * Read a request path back into the object it names.
 *
 * The path is taken exactly as sent, never percent-decoded: every valid
 * segment is plain ASCII, so an escape, an empty segment, a `.` or `..`, or an
 * extra segment is simply not a match.
 *
 * @param path - The request's raw path, without its query.
 * @returns The object, or `undefined` when the path is not one of the three layouts.
 * @public
 */
export const parseFileLinkPath = (path: string): FileLinkLocation | undefined => {
  const segments = path.split('/');
  if (segments[0] !== '' || segments[1] !== 'v1') {
    return undefined;
  }
  if (segments[2] === 'git') {
    return segments.length === 7 ? repositoryLocationOf(segments.slice(3)) : undefined;
  }
  return lfsLocationOf(segments);
};

/**
 * The bucket key, with its namespace prefix, that holds one LFS object.
 *
 * Tenant: `tenants/<ownerId>/lfs/<projectId>/<oid>` (D24). Legacy:
 * `blobs/git-lfs/<projectId>/lfs/objects/<oid[0:2]>/<oid[2:4]>/<oid>`
 * (`gitLfsObjectKey` under the `blobs/` namespace). Repository:
 * `tenants/<ownerId>/repos/<projectId>/<file>` (`S3RepositoryStore`'s prefix).
 *
 * @param location - The object.
 * @returns The full R2 key in the private bucket.
 * @throws RangeError - When an id or the oid is not storable.
 * @public
 */
export const fileLinkObjectKey = (location: FileLinkLocation): string => {
  assertLocation(location);
  if (location.layout === 'repository') {
    return `tenants/${location.ownerId}/repos/${location.projectId}/${repositoryFile(location)}`;
  }
  const { oid } = location;
  return location.layout === 'tenant'
    ? `tenants/${location.ownerId}/lfs/${location.projectId}/${oid}`
    : `blobs/git-lfs/${location.projectId}/lfs/objects/${oid.slice(0, 2)}/${oid.slice(2, 4)}/${oid}`;
};

/**
 * Read a full R2 key back into the object it holds, the inverse of {@link fileLinkObjectKey}.
 *
 * The API uses this to decide whether a stored location may be served by the
 * files host at all: a key outside the three layouts keeps its presigned link.
 *
 * @param key - A full key in the private bucket, with its namespace prefix.
 * @returns The object, or `undefined` for any other key.
 * @public
 */
export const fileLinkLocationOfKey = (key: string): FileLinkLocation | undefined => {
  const repository = /^tenants\/([^/]+)\/repos\/([^/]+)\/([^/]+)\/([^/]+)$/u.exec(key);
  if (repository !== null) {
    return repositoryLocationOf(repository.slice(1));
  }
  const tenant = /^tenants\/([^/]+)\/lfs\/([^/]+)\/([^/]+)$/u.exec(key);
  if (tenant !== null) {
    const [, ownerId = '', projectId = '', oid = ''] = tenant;
    return parseFileLinkPath(`/v1/lfs/${ownerId}/${projectId}/${oid}`);
  }
  const legacy = /^blobs\/git-lfs\/([^/]+)\/lfs\/objects\/([^/]+)\/([^/]+)\/([^/]+)$/u.exec(key);
  if (legacy !== null) {
    const [, projectId = '', first = '', second = '', oid = ''] = legacy;
    const location = parseFileLinkPath(`/v1/lfs-legacy/${projectId}/${oid}`);
    return location !== undefined && first === oid.slice(0, 2) && second === oid.slice(2, 4) ? location : undefined;
  }
  return undefined;
};
