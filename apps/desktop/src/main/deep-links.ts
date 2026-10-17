/**
 * `tau://` deep links, parsed strictly before anything acts on one (R4, D4).
 *
 * A custom scheme carries no ownership proof — any application on the machine
 * can claim `tau://`, and any page can navigate a browser to one — so an
 * inbound link is untrusted input. This module therefore admits only an
 * *identifier*: main re-resolves it through the app's own routes and never
 * loads a URL a link handed it. Everything here is a pure decision, so the
 * table test is the whole specification.
 *
 * The parser reality these rules are written against: `tau:` is not one of the
 * WHATWG parser's *special* schemes, but `tau://invitations/<token>` still
 * parses as host `invitations` with path `/<token>` — the first path segment a
 * reader sees is the **host**. `tau:invitations/<token>`, with no authority, is
 * a different URL with an opaque path, and is refused rather than guessed at.
 *
 * One link names an address rather than a route: `tau://host/<loopback origin>?code=<code>`, which `tau open --desktop`
 * opens for a folder it serves (ruling X54). It is admitted only for a loopback HTTP origin with a port, because the
 * renderer redeems its single-use code there and nowhere else: a link cannot point the app at another machine.
 */

/** Scheme prefix, as it appears in `process.argv` and `open-url`. */
export const deepLinkScheme = 'tau:';

/**
 * Longest fragment a `tau://s/<slug>` link may carry.
 *
 * A direct share puts its whole encrypted payload in the fragment, so this is
 * the number `apps/libs/share/src/artifact.ts` already defends a direct URL
 * with (`shareArtifactLimits.maxDirectUrlCharacters`). Copied rather than
 * imported: the shell does not otherwise depend on the share library, and one
 * constant is not worth the edge.
 */
export const deepLinkFragmentMaxCharacters = 524_288;

/** Longest whole link accepted before it is even parsed. */
const linkMaxCharacters = deepLinkFragmentMaxCharacters + 2048;

/** Longest single identifier (invitation token, share slug, path segment). */
const identifierMaxCharacters = 256;

/** Longest joined import repository path. */
const repositoryMaxCharacters = 1024;

const identifierPattern = /^[\w~.-]{1,256}$/u;
/* `URLSearchParams` form-encoding: unreserved `*-._`, `+` for space, `%XX`,
 * and the `=`/`&` separators. That is exactly what `formatShareUrl` produces. */
const fragmentPattern = /^[A-Za-z0-9*%=&+._-]+$/u;
/* The same shape `apps/ui/app/routes/auth.desktop` refuses to carry. */
const statePattern = /^[\w-]{8,128}$/u;
const oneTimeTokenPattern = /^[\w-]{1,256}$/u;
/* The daemon mints 32 random bytes, base64url: 43 characters. */
const handOffCodePattern = /^[\w-]{16,256}$/u;
/* Loopback only, with a port: the daemon binds `127.0.0.1` and names `localhost` among its own origins. */
const loopbackOriginPattern = /^http:\/\/(?:127\.0\.0\.1|localhost):([1-9]\d{0,4})$/u;

/** One admitted `tau://` link. */
export type DeepLink =
  | { readonly kind: 'machine'; readonly route: string }
  /** `tau://invitations/<token>`. */
  | { readonly kind: 'invitation'; readonly route: string }
  /** `tau://s/<slug>` with the share payload's optional fragment. */
  | { readonly kind: 'share'; readonly route: string }
  /** `tau://i/<repository path>`. */
  | { readonly kind: 'import'; readonly route: string }
  /** `tau://auth/callback` — redeemed in main; it never reaches the renderer. */
  | { readonly kind: 'auth-callback'; readonly oneTimeToken: string; readonly state: string }
  /** `tau://host/<loopback origin>?code=<code>` — handed to the renderer, which redeems the code at that daemon. */
  | { readonly kind: 'host'; readonly origin: string; readonly code: string };

const machineRoute = (segments: readonly string[]): DeepLink | undefined => {
  if (segments.length === 0 || (segments.length === 1 && segments[0] === '')) {
    return { kind: 'machine', route: '/machines' };
  }
  if (segments.length !== 2) {
    return undefined;
  }
  try {
    const identities = segments.map((segment) => decodeURIComponent(segment));
    if (
      !identities.every(
        (value) =>
          value.length > 0 &&
          value.length <= 256 &&
          value.isWellFormed() &&
          value !== '.' &&
          value !== '..' &&
          !/[/\\]/u.test(value) &&
          [...value].every(
            (character) => (character.codePointAt(0) ?? 0) >= 32 && (character.codePointAt(0) ?? 0) !== 127,
          ),
      )
    ) {
      return undefined;
    }
    return { kind: 'machine', route: `/machines/${identities.map((value) => encodeURIComponent(value)).join('/')}` };
  } catch {
    return undefined;
  }
};

const isIdentifier = (value: string): boolean =>
  value.length <= identifierMaxCharacters && identifierPattern.test(value) && value !== '.' && value !== '..';

const shareRoute = (slug: string, hash: string): DeepLink | undefined => {
  if (!isIdentifier(slug)) {
    return undefined;
  }
  /* `#` alone is a fragment the WHATWG parser reports as `''`, so an empty
   * payload and no payload are the same link; anything longer must be one the
   * share locator could have produced. */
  const payload = hash.slice(1);
  if (hash !== '' && (payload.length === 0 || payload.length > deepLinkFragmentMaxCharacters)) {
    return undefined;
  }
  if (payload !== '' && !fragmentPattern.test(payload)) {
    return undefined;
  }
  return { kind: 'share', route: `/s/${slug}${hash}` };
};

const importRoute = (segments: readonly string[]): DeepLink | undefined => {
  const repository = segments.join('/');
  if (
    segments.length === 0 ||
    repository.length > repositoryMaxCharacters ||
    !segments.every((segment) => isIdentifier(segment))
  ) {
    return undefined;
  }
  /* `/i/*` is a server redirect on the web and is not in the desktop SPA;
   * `/import/*` is the page it redirects to, and the one the SPA serves. */
  return { kind: 'import', route: `/import/${repository}` };
};

const authCallback = (segments: readonly string[], parameters: URLSearchParams): DeepLink | undefined => {
  if (segments.length !== 1 || segments[0] !== 'callback' || parameters.size !== 2) {
    return undefined;
  }
  const oneTimeToken = parameters.get('ott') ?? '';
  const state = parameters.get('state') ?? '';
  if (!oneTimeTokenPattern.test(oneTimeToken) || !statePattern.test(state)) {
    return undefined;
  }
  return { kind: 'auth-callback', oneTimeToken, state };
};

const hostHandOff = (path: string, parameters: URLSearchParams): DeepLink | undefined => {
  const port = loopbackOriginPattern.exec(path)?.[1];
  const code = parameters.get('code') ?? '';
  if (port === undefined || Number(port) > 65_535 || parameters.size !== 1 || !handOffCodePattern.test(code)) {
    return undefined;
  }
  return { kind: 'host', origin: path, code };
};

/**
 * Parse one inbound `tau://` link.
 *
 * @param value - Whatever `open-url` or `process.argv` handed the shell.
 * @returns The admitted link, or `undefined` — which the caller refuses and logs.
 */
export const parseDeepLink = (value: string): DeepLink | undefined => {
  if (value.length > linkMaxCharacters) {
    return undefined;
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return undefined;
  }
  /* Userinfo and a port are refused rather than ignored: they are the parts of
   * an authority a hand-written link uses to make a host read as something
   * else. The host itself is compared verbatim, so `tau://Invitations/…` — which
   * an opaque host parser does *not* lower-case — is refused too. */
  if (url.protocol !== deepLinkScheme || url.username !== '' || url.password !== '' || url.port !== '') {
    return undefined;
  }
  const path = url.pathname.split('/');
  /* A hierarchical URL's path always begins with an empty segment; an opaque
   * one (`tau:invitations/x`) does not, and is refused with this test. */
  if (path[0] !== '') {
    return undefined;
  }
  const segments = path.slice(1);
  const hasFragmentOrQuery = url.search !== '' || url.hash !== '';
  switch (url.hostname) {
    case 'machines': {
      // Reject normalized dot paths and even empty query/fragment delimiters.
      if (/[?#]/u.test(value) || /(?:^|\/)(?:\.|%2e){1,2}(?:\/|$)/iu.test(value)) {
        return undefined;
      }
      return machineRoute(segments);
    }
    case 'invitations': {
      return segments.length === 1 && isIdentifier(segments[0]!) && !hasFragmentOrQuery
        ? { kind: 'invitation', route: `/invitations/${segments[0]!}` }
        : undefined;
    }
    case 's': {
      return segments.length === 1 && url.search === '' ? shareRoute(segments[0]!, url.hash) : undefined;
    }
    case 'i': {
      return hasFragmentOrQuery ? undefined : importRoute(segments);
    }
    case 'auth': {
      return url.hash === '' ? authCallback(segments, url.searchParams) : undefined;
    }
    case 'host': {
      /* The origin is the whole path after `/`, compared verbatim: a dot segment, a second slash or a userinfo makes
       * it fail the pattern rather than normalise into one. */
      return url.hash === '' ? hostHandOff(url.pathname.slice(1), url.searchParams) : undefined;
    }
    default: {
      return undefined;
    }
  }
};

/**
 * The first `tau:` argument in a command line, admitted or not.
 *
 * Returned before validation so that a foreign link is refused *and logged*
 * rather than passing silently as an ordinary argument.
 *
 * @param argv - Command-line arguments, without the executable.
 * @returns The argument, or `undefined` when none names the scheme.
 */
export const deepLinkArgument = (argv: readonly string[]): string | undefined =>
  argv.find((value) => value.slice(0, deepLinkScheme.length).toLowerCase() === deepLinkScheme);
