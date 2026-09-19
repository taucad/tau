/**
 * The `tau://` link a web page may hand the desktop app (R4, D4).
 *
 * The shell's parser (`apps/desktop/src/main/deep-links.ts`) admits an
 * *identifier* and nothing else: no query on a content link, a fragment only on
 * a share, one bounded character set per segment. A web page that offers the
 * app a link the shell would refuse sends the person to a dead end, so the
 * offer is built here — the one place that mirrors those rules — and a page
 * that gets `undefined` back offers nothing at all.
 *
 * Mirrored deliberately rather than imported: `apps/ui` does not depend on
 * `apps/desktop`, and the table test below is the whole of the contract.
 */

/** Longest fragment a `tau://s/<slug>` link may carry (`shareArtifactLimits.maxDirectUrlCharacters`). */
const fragmentMaxCharacters = 524_288;

/** Longest single identifier: invitation token, share slug, one import path segment. */
const identifierMaxCharacters = 256;

/** Longest joined import repository path. */
const repositoryMaxCharacters = 1024;

const identifierPattern = /^[\w~.-]{1,256}$/u;
/* `URLSearchParams` form-encoding — exactly what `formatShareUrl` produces. */
const fragmentPattern = /^[A-Za-z0-9*%=&+._-]+$/u;

const isIdentifier = (value: string): boolean =>
  value.length <= identifierMaxCharacters && identifierPattern.test(value) && value !== '.' && value !== '..';

/**
 * Split a location path into its pieces without consulting `globalThis`.
 *
 * @param path - `pathname` with the page's `search` and `hash` still attached.
 * @returns The decoded path segments, the query string and the fragment.
 */
const splitPath = (path: string): { segments: readonly string[]; search: string; hash: string } => {
  const hashAt = path.indexOf('#');
  const hash = hashAt === -1 ? '' : path.slice(hashAt);
  const withoutHash = hashAt === -1 ? path : path.slice(0, hashAt);
  const searchAt = withoutHash.indexOf('?');
  const search = searchAt === -1 ? '' : withoutHash.slice(searchAt);
  const pathname = searchAt === -1 ? withoutHash : withoutHash.slice(0, searchAt);
  return { segments: pathname.split('/').filter((segment) => segment !== ''), search, hash };
};

const shareLink = (segments: readonly string[], hash: string): string | undefined => {
  if (segments.length !== 1 || !isIdentifier(segments[0]!)) {
    return undefined;
  }
  /* `#` alone is the same link as no fragment; anything longer has to be
   * something the share locator could have produced. */
  const payload = hash.slice(1);
  if (hash !== '' && (payload.length === 0 || payload.length > fragmentMaxCharacters)) {
    return undefined;
  }
  if (payload !== '' && !fragmentPattern.test(payload)) {
    return undefined;
  }
  return `tau://s/${segments[0]!}${hash}`;
};

const importLink = (segments: readonly string[]): string | undefined => {
  const repository = segments.join('/');
  if (
    segments.length === 0 ||
    repository.length > repositoryMaxCharacters ||
    !segments.every((segment) => isIdentifier(segment))
  ) {
    return undefined;
  }
  return `tau://i/${repository}`;
};

/**
 * The `tau://` link for the web page at `path`, when the shell would admit one.
 *
 * `/import/<repository>` and `/i/<repository>` produce the same link: the web
 * `/i/*` route is a server redirect to `/import/*`, so the page a person
 * actually lands on is the one that offers the app.
 *
 * @param path - The page's `pathname`, with its `search` and `hash` attached.
 * @returns The link to hand the browser, or `undefined` when the shell's
 *   parser would refuse it — an import link that needs its `?ref=`, a slug
 *   longer than 256 characters, a repository path carrying a URL scheme.
 */
export const desktopDeepLink = (path: string): string | undefined => {
  const { segments, search, hash } = splitPath(path);
  /* Every content link the shell admits carries no query at all, so a page
   * whose query is load-bearing cannot be represented. */
  if (search !== '' || segments.length === 0) {
    return undefined;
  }
  const rest = segments.slice(1);
  switch (segments[0]) {
    case 'invitations': {
      return rest.length === 1 && isIdentifier(rest[0]!) && hash === '' ? `tau://invitations/${rest[0]!}` : undefined;
    }
    case 's': {
      return shareLink(rest, hash);
    }
    case 'i':
    case 'import': {
      return hash === '' ? importLink(rest) : undefined;
    }
    default: {
      return undefined;
    }
  }
};
