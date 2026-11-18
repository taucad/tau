/**
 * Parsed shape of the publication record returned by the API GET response. Loader callers
 * pass the raw `Record<string, unknown>` payload through `parsePublicationRecord`; UI consumers
 * read this typed projection.
 */
/* oxlint-disable typescript-eslint/no-restricted-types -- API wire shape uses null */
export type ParsedPublicationOwnerSnapshot = {
  id: string;
  name: string;
  image: string | null;
};

export type ParsedPublication = {
  id: string;
  title: string;
  description?: string;
  visibility: 'private' | 'public';
  viewerRole: 'owner' | 'grantee' | 'public';
  entryPath: string;
  ownerSnapshot: ParsedPublicationOwnerSnapshot | null;
  forkCount: number;
  viewCount: number;
  createdAt: string;
};

const isString = (value: unknown): value is string => typeof value === 'string';
const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

const parseOwnerSnapshot = (value: unknown): ParsedPublicationOwnerSnapshot | null => {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value !== 'object') {
    return null;
  }

  const record = value as Record<string, unknown>;
  const { id, name, image: imageRaw } = record;

  if (!isString(id) || !isString(name)) {
    return null;
  }

  const image = imageRaw === null || imageRaw === undefined ? null : isString(imageRaw) ? imageRaw : null;

  return { id, name, image };
};
/* oxlint-enable typescript-eslint/no-restricted-types -- end null window */

/**
 * Fetch init for publication file URLs. Private publications serve files
 * through the authenticated API proxy, which authorizes via the session
 * cookie — so the request must include credentials. Public publications use
 * anonymous CDN URLs where a credentialed CORS request would be rejected
 * (`Access-Control-Allow-Origin: *` forbids credentials), so none are sent.
 */
export const publicationFileFetchInit = (visibility: ParsedPublication['visibility']): RequestInit | undefined =>
  visibility === 'private' ? { credentials: 'include' } : undefined;

export const parsePublicationRecord = (
  raw: Record<string, unknown>,
  viewerRoleRaw: unknown = 'public',
): ParsedPublication | undefined => {
  const id = isString(raw['id']) ? raw['id'] : undefined;
  const title = isString(raw['title']) ? raw['title'] : undefined;
  const entryPath = isString(raw['entryPath']) ? raw['entryPath'] : undefined;
  const visRaw = raw['visibility'];
  const visibility = visRaw === 'private' || visRaw === 'public' ? visRaw : undefined;
  const description = isString(raw['description']) ? raw['description'] : undefined;
  const createdAt = isString(raw['createdAt']) ? raw['createdAt'] : undefined;
  const forkCount = isFiniteNumber(raw['forkCount']) ? raw['forkCount'] : 0;
  const viewCount = isFiniteNumber(raw['viewCount']) ? raw['viewCount'] : 0;
  const viewerRole =
    viewerRoleRaw === 'owner' || viewerRoleRaw === 'grantee' || viewerRoleRaw === 'public' ? viewerRoleRaw : 'public';

  if (!id || !title || !entryPath || !visibility || !createdAt) {
    return undefined;
  }

  return {
    id,
    title,
    description,
    visibility,
    viewerRole,
    entryPath,
    ownerSnapshot: parseOwnerSnapshot(raw['ownerSnapshot']),
    forkCount,
    viewCount,
    createdAt,
  };
};
