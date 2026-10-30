/**
 * The path grammar of a files link, and the only R2 keys it can name.
 *
 * Two layouts exist, the same two `apps/api/app/api/git/lfs-keys.ts` reads
 * through: the tenant key every upload lands at since D24, and the legacy
 * per-project key under `blobs/`. Nothing else in the bucket (repository
 * packs, publication manifests) has a path here, so even a valid signing key
 * cannot reach it.
 */

/**
 * One LFS object a files link can name.
 *
 * @public
 */
export type FileLinkLocation =
  | Readonly<{ layout: 'tenant'; ownerId: string; projectId: string; oid: string }>
  | Readonly<{ layout: 'legacy'; projectId: string; oid: string }>;

const identifierPattern = /^[A-Za-z\d][\w-]{0,63}$/u;
const oidPattern = /^[0-9a-f]{64}$/u;

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

const assertLocation = (location: FileLinkLocation): void => {
  const ids = location.layout === 'tenant' ? [location.ownerId, location.projectId] : [location.projectId];
  if (!ids.every((id) => isFileLinkIdentifier(id)) || !isFileLinkOid(location.oid)) {
    throw new RangeError('The files link location is not a storable LFS object.');
  }
};

/**
 * The URL path that names one LFS object on the files host.
 *
 * @param location - The object.
 * @returns `/v1/lfs/<ownerId>/<projectId>/<oid>` or `/v1/lfs-legacy/<projectId>/<oid>`.
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
  return location.layout === 'tenant'
    ? `/v1/lfs/${location.ownerId}/${location.projectId}/${location.oid}`
    : `/v1/lfs-legacy/${location.projectId}/${location.oid}`;
};

/**
 * Read a request path back into the object it names.
 *
 * The path is taken exactly as sent, never percent-decoded: every valid
 * segment is plain ASCII, so an escape, an empty segment, a `.` or `..`, or an
 * extra segment is simply not a match.
 *
 * @param path - The request's raw path, without its query.
 * @returns The object, or `undefined` when the path is not one of the two layouts.
 * @public
 */
export const parseFileLinkPath = (path: string): FileLinkLocation | undefined => {
  const segments = path.split('/');
  if (segments[0] !== '' || segments[1] !== 'v1') {
    return undefined;
  }
  let location: FileLinkLocation | undefined;
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
 * The bucket key, with its namespace prefix, that holds one LFS object.
 *
 * Tenant: `tenants/<ownerId>/lfs/<projectId>/<oid>` (D24). Legacy:
 * `blobs/git-lfs/<projectId>/lfs/objects/<oid[0:2]>/<oid[2:4]>/<oid>`
 * (`gitLfsObjectKey` under the `blobs/` namespace).
 *
 * @param location - The object.
 * @returns The full R2 key in the private bucket.
 * @throws RangeError - When an id or the oid is not storable.
 * @public
 */
export const fileLinkObjectKey = (location: FileLinkLocation): string => {
  assertLocation(location);
  const { oid } = location;
  return location.layout === 'tenant'
    ? `tenants/${location.ownerId}/lfs/${location.projectId}/${oid}`
    : `blobs/git-lfs/${location.projectId}/lfs/objects/${oid.slice(0, 2)}/${oid.slice(2, 4)}/${oid}`;
};

/**
 * Read a full R2 key back into the object it holds, the inverse of {@link fileLinkObjectKey}.
 *
 * The API uses this to decide whether a stored location may be served by the
 * files host at all: a key outside the two layouts keeps its presigned link.
 *
 * @param key - A full key in the private bucket, with its namespace prefix.
 * @returns The object, or `undefined` for any other key.
 * @public
 */
export const fileLinkLocationOfKey = (key: string): FileLinkLocation | undefined => {
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
