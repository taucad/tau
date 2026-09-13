/**
 * A project's remotes, as git's own remotes list holds them (S24, S34).
 *
 * There is no Tau table of remotes: the store already has one, `git remote` on
 * a disk host and the same `remote.<name>.url` config in the browser, so a
 * second one could only disagree with it. The pane shows one remote at a time
 * (A23) and this module is the whole model behind that choice — a name, a URL,
 * and which of the two kinds it is.
 *
 * The kind is read from the *name*, not the URL: Tau writes the Tau Cloud
 * remote under a reserved name, so a project that has one can be recognised
 * without knowing which API origin this host was configured with (and a user
 * who adds `origin` by hand still gets a *Git remote*). W12 adds the third
 * kind's UI; the data model already holds it.
 */

/** Which of the two remote kinds a project's remote is. @public */
export type RemoteKind = 'tau' | 'git';

/** One remote, as git's remotes list holds it. @public */
export type Remote = Readonly<{
  name: string;
  url: string;
  kind: RemoteKind;
}>;

/**
 * The reserved name of a project's Tau Cloud remote.
 *
 * @public
 */
export const tauRemoteName = 'tau';

/**
 * Which kind a remote of this name is.
 *
 * @param name - The remote's name in git's config.
 * @returns `'tau'` for the reserved name, `'git'` for every other.
 * @public
 */
export const remoteKindOf = (name: string): RemoteKind => (name === tauRemoteName ? 'tau' : 'git');

/**
 * Where one project's Tau Cloud repository is.
 *
 * The smart-HTTP root the Tau API serves (`/v1/git/<projectId>.git`), so the
 * same URL is what a stock `git clone` is given.
 *
 * @param apiBaseUrl - Origin the Tau API is reachable at, with or without a trailing slash.
 * @param projectId - Identifies the project whose repository this is.
 * @returns The smart-HTTP URL a client clones and pushes.
 * @public
 *
 * @example <caption>Where Tau Cloud keeps one project</caption>
 * ```typescript
 * import { tauRemoteUrl } from '@taucad/revisions';
 *
 * tauRemoteUrl('https://api.tau.new/', 'p1'); // 'https://api.tau.new/v1/git/p1.git'
 * ```
 */
export const tauRemoteUrl = (apiBaseUrl: string, projectId: string): string =>
  `${apiBaseUrl.replace(/\/+$/u, '')}/v1/git/${projectId}.git`;

/**
 * One remote record from a name and a URL.
 *
 * @param name - Name git's config holds this remote under.
 * @param url - Where the remote is.
 * @returns The record, with its kind derived from the name.
 * @public
 */
export const remoteOf = (name: string, url: string): Remote => Object.freeze({ name, url, kind: remoteKindOf(name) });

/**
 * The ref namespaces that are this host's own and never cross a wire.
 *
 * The server's `pre-receive` allow-list refuses them too, but a client that
 * offered one would be asking to be refused — so the guard is here, in the one
 * module both legs' transports read (W3a R4; architecture "Ref allow-list").
 *
 * `refs/tau/{chats,evidence,artifacts}` are deliberately absent: they are the
 * record set the design pushes (D14, A15, A30, review 3 F13).
 */
const hostLocalRefPrefixes: readonly string[] = Object.freeze([
  'refs/tau/owners',
  'refs/tau/workspaces',
  'refs/tau/revisions',
  'refs/tau/transactions',
  'refs/tau/head',
  /* Fetch's own half of the store: a remote-tracking ref is what this host
   * last saw *of* a remote, so offering one back is meaningless. */
  'refs/remotes',
  /* Where an unresolved sync conflict lands (A22). It is evidence for the
   * person at this host, never a branch anybody else should see. */
  'refs/heads/sync',
]);

/**
 * Whether one fully-qualified ref is host-local.
 *
 * @param ref - The ref name, e.g. `refs/heads/main`.
 * @returns `true` when the ref never leaves this host.
 * @public
 */
export const isHostLocalRef = (ref: string): boolean =>
  hostLocalRefPrefixes.some((prefix) => ref === prefix || ref.startsWith(`${prefix}/`));

/**
 * The refs a *refspec* may never name, on either side.
 *
 * Narrower than {@link isHostLocalRef} by exactly two entries, and both for the
 * same reason: a refspec is written in *patterns*, so a prefix that shares a
 * namespace with legitimate refs cannot be blocked at the prefix.
 *
 * - `refs/remotes/*` never leaves this host, but it is precisely where a fetch
 *   writes, so a refspec naming it is correct rather than an attack.
 * - `refs/heads/sync` is a branch. Blocking it here would refuse
 *   `+refs/heads/*:refs/remotes/tau/*` — the ordinary fetch refspec — because
 *   that pattern can expand to it. It is still never *offered* to a remote,
 *   which is {@link isHostLocalRef}'s job and is enforced per ref in both legs'
 *   `push`, where the name is known exactly.
 *
 * What remains is `refs/tau/*`'s host-local half: namespaces no refspec has any
 * business naming, in either direction.
 */
const managedRefPrefixes: readonly string[] = Object.freeze(
  hostLocalRefPrefixes.filter((prefix) => prefix !== 'refs/remotes' && prefix !== 'refs/heads/sync'),
);

/**
 * Whether a ref *pattern* can expand into a Tau-managed ref.
 *
 * @param pattern - A ref or a wildcard pattern, from either side of a refspec.
 * @returns `true` when anything the pattern names is Tau-managed.
 * @public
 */
export const refPatternIsHostLocal = (pattern: string): boolean => {
  const wildcard = pattern.indexOf('*');
  if (wildcard === -1) {
    return managedRefPrefixes.some((prefix) => pattern === prefix || pattern.startsWith(`${prefix}/`));
  }
  const prefix = pattern.slice(0, wildcard);
  return managedRefPrefixes.some((managed) => managed.startsWith(prefix) || prefix.startsWith(`${managed}/`));
};

/**
 * Where one fetched ref lands in this store.
 *
 * `refs/heads/main` becomes `refs/remotes/<remote>/main` — git's own layout, so
 * `--force-with-lease` and every git tool read the same place — and everything
 * else keeps its namespace under the remote (`refs/tau/chats/c1` becomes
 * `refs/remotes/<remote>/tau/chats/c1`).
 *
 * @param remote - The remote's name.
 * @param ref - The fully-qualified ref on the remote.
 * @returns The remote-tracking ref this host writes.
 * @public
 */
export const remoteTrackingRef = (remote: string, ref: string): string => {
  const tail = ref.startsWith('refs/heads/') ? ref.slice('refs/heads/'.length) : ref.replace(/^refs\//u, '');
  return `refs/remotes/${remote}/${tail}`;
};

/**
 * Whether a URL is on the Tau API's own origin.
 *
 * The one question the browser leg has to answer before every request: Tau's
 * own git server is reached directly with the session cookie, and every other
 * remote is reached through the API's git proxy with *that remote's*
 * credential. Getting it backwards either breaks the connection or hands a Tau
 * session to a third party, so the rule is one function and both legs read it
 * (W11b review Q2 — the `HttpClient` has no origin guard of its own).
 *
 * @param apiBaseUrl - Origin the Tau API is reachable at.
 * @param url - The URL a request is about to be made to.
 * @returns `true` when the URL is Tau's own API origin.
 * @public
 */
export const isTauApiUrl = (apiBaseUrl: string, url: string): boolean => {
  try {
    return new URL(url).origin === new URL(apiBaseUrl).origin;
  } catch {
    return false;
  }
};

/**
 * Where a third-party git request goes instead: the API's git proxy (S25, P17).
 *
 * A browser cannot reach `https://github.com/…/info/refs` itself — no git host
 * sends CORS headers — so the request is made to Tau's API, which forwards
 * exactly the three git smart-HTTP endpoints and nothing else. The remote URL
 * travels as a query parameter and the *credential* never does (I8): it rides
 * `x-tau-proxy-authorization`, which is the only header the proxy forwards.
 *
 * @param apiBaseUrl - Origin the Tau API is reachable at, with or without a trailing slash.
 * @param url - The remote URL the client wants to reach.
 * @returns The proxy URL to request instead.
 * @public
 *
 * @example <caption>Reaching GitHub from the page</caption>
 * ```typescript
 * import { gitProxyUrl } from '@taucad/revisions';
 *
 * gitProxyUrl('https://api.tau.new', 'https://github.com/o/r.git/info/refs?service=git-upload-pack');
 * // 'https://api.tau.new/v1/git/proxy?url=https%3A%2F%2Fgithub.com%2Fo%2Fr.git%2Finfo%2Frefs%3Fservice%3Dgit-upload-pack'
 * ```
 */
export const gitProxyUrl = (apiBaseUrl: string, url: string): string =>
  `${apiBaseUrl.replace(/\/+$/u, '')}/v1/git/proxy?url=${encodeURIComponent(url)}`;

/**
 * Whether this remote is on GitHub, and therefore whether the GitHub sign-in on
 * the session is the credential for it (S34).
 *
 * @param url - The remote's URL.
 * @returns `true` for a `github.com` remote.
 * @public
 */
export const isGithubRemoteUrl = (url: string): boolean => {
  try {
    const { hostname } = new URL(url);
    return hostname === 'github.com' || hostname === 'www.github.com';
  } catch {
    return false;
  }
};

/* The proxy's own list, so the dialog refuses what the wire would refuse
 * (`git-proxy.controller.ts` `credentialQueryKeys`). */
const credentialQueryKeys = new Set(['access_token', 'token', 'authorization', 'password', 'api_key', 'apikey']);

/* The name-shaped half of the proxy's host refusal. Its numeric private ranges
 * are not mirrored — that is a whole address parser for a check the wire makes
 * anyway (W12 review R8). */
const blockedHostNames: readonly string[] = Object.freeze(['.localhost', '.internal', '.local']);

/**
 * Why this URL cannot be a Git remote, in words a person can act on.
 *
 * These are *some* of the proxy's own refusals (W11a `git-proxy.controller.ts`),
 * brought forward so they arrive while the person is still typing rather than as
 * a failed connection two steps later. Two of the proxy's checks are
 * deliberately **not** mirrored — its numeric private-address ranges, and the
 * empty-path rule here has no counterpart there — so a `400` with a code is
 * still the last word (W12 review R8).
 *
 * @param url - What the person typed.
 * @returns The reason it cannot be used, or `undefined` when it can.
 * @public
 */
export const gitRemoteUrlProblem = (url: string): string | undefined => {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return 'Enter the full address of the repository, starting with https://';
  }
  const host = parsed.hostname.toLowerCase();
  if (parsed.protocol !== 'https:') {
    return 'Only https addresses can be connected.';
  }
  if (parsed.username !== '' || parsed.password !== '') {
    return 'Remove the user name and password from the address; Tau asks for permission instead.';
  }
  for (const key of parsed.searchParams.keys()) {
    if (credentialQueryKeys.has(key.toLowerCase())) {
      return 'Remove the token from the address; Tau asks for permission instead.';
    }
  }
  if (blockedHostNames.some((suffix) => host === suffix.slice(1) || host.endsWith(suffix))) {
    return 'That address is on this machine or a private network; Tau cannot reach it for you.';
  }
  if (parsed.pathname.replaceAll('/', '') === '') {
    return 'Add the repository to the address, for example https://github.com/owner/repository.git';
  }
  return undefined;
};

/**
 * The `code` a failure carries when the remote's credential has to be granted
 * again.
 *
 * A *type*, so that `remote.machine` — which may import nothing from this module
 * but types (I20, the machine import boundary) — can write the same literal and
 * have a rename red both files. It travels as a `code` on an ordinary `Error`
 * because it crosses `isomorphic-git`, a `fetch` and an invoked actor before the
 * machine reads it, and none of those preserves a class.
 *
 * @public
 */
export type RemoteReauthorizationCode = 'REMOTE_REAUTHORIZATION_REQUIRED';

/**
 * The error a host throws when the remote's credential has to be granted again.
 *
 * The distinction it carries is the whole of the charter's *Reconnect GitHub*
 * row: a rotated `AUTH_SECRET` invalidates every stored OAuth token, and
 * surfacing that as a failed push tells the person nothing they can act on.
 *
 * @param message - What to tell the person.
 * @returns An error `remote.machine` routes to `reconnectRequired`, not `failed`.
 * @public
 */
export const reauthorizationRequired = (message: string): Error =>
  Object.assign(new Error(message), {
    code: 'REMOTE_REAUTHORIZATION_REQUIRED' satisfies RemoteReauthorizationCode,
  });

/**
 * Whether a remote of this name can carry a project's large objects (P20).
 *
 * Only Tau Cloud can. A third-party remote's LFS endpoints are not reachable:
 * the proxy carries git's three smart-HTTP endpoints and nothing else (P17), and
 * the disk leg would reach the remote's own LFS server with a credential Tau
 * never asked for — so the two legs would disagree about what a push means,
 * which is the one thing A15 exists to prevent.
 *
 * @param remote - The remote's name in git's config.
 * @returns `true` when large objects may be offered to it.
 * @public
 */
export const remoteCarriesLargeObjects = (remote: string): boolean => remoteKindOf(remote) === 'tau';

/**
 * What to tell a person whose project cannot be backed up to this remote (P20).
 *
 * Files, not counts: a refusal the person can act on names what to move
 * (D16, AC16).
 *
 * @param paths - Project-relative paths of the large files in the push.
 * @returns One sentence naming them.
 * @public
 */
export const lfsRemoteUnsupportedMessage = (paths: readonly string[]): string =>
  `Large files cannot be backed up to a Git remote: ${[...paths].toSorted().join(', ')}. Connect Tau Cloud instead, or remove them from the project.`;

/**
 * What the page told a browser host about reaching a third-party remote.
 *
 * `apiBaseUrl` decides *routing* and arrives as soon as a port opens; `origin`
 * and `authorization` decide *crediting* and arrive at *Connect*. They are
 * separate because a credential minted for one remote must never be offered to
 * the next one (W12 review R1) — a project that disconnects GitHub and connects
 * GitLab sends a frame with a new origin and no authorization, which is also
 * what clears the old one.
 *
 * @public
 */
export type GitRemoteCredential = Readonly<{
  /** Origin the Tau API is reachable at. Without it nothing can be routed. */
  apiBaseUrl: string;
  /** The remote origin this credential was minted for, e.g. `https://github.com`. */
  origin?: string;
  /** The whole header value, e.g. `Bearer gho_…`. */
  authorization?: string;
  /** Why there is none, when the session could not mint one. */
  unavailable?: string;
}>;

/** The two `createRevisionHttpClient` options a browser host needs. @public */
export type GitRemoteTransport = Readonly<{
  proxyAuthorization: (url: string) => string | undefined;
  fetch: typeof globalThis.fetch;
}>;

const originOf = (url: string): string | undefined => {
  try {
    return new URL(url).origin;
  } catch {
    return undefined;
  }
};

/**
 * How a browser reaches a remote, and which credential it may carry.
 *
 * `createRevisionHttpClient` sets whatever its resolvers return and guards
 * nothing itself, so this pair *is* the guard:
 *
 * - a **Tau** URL is requested as it stands, with the session cookie and no
 *   `x-tau-proxy-authorization`;
 * - every **other** URL goes through the API's git proxy (P17), and carries the
 *   remote's own credential **only when the credential was minted for exactly
 *   that origin**;
 * - before the page has said which origin is Tau's, nothing is requested at all.
 *
 * The resolver sees the *unrewritten* URL, because the client resolves its
 * headers before it calls `fetch` — which is what lets one predicate answer both
 * "which credential" and "which URL".
 *
 * @param credential - Reads what the page last sent for this project.
 * @returns The `proxyAuthorization` resolver and the `fetch` that routes.
 * @public
 *
 * @example <caption>The browser worker's whole auth story</caption>
 * ```typescript
 * import { createGitRemoteTransport, createRevisionHttpClient } from '@taucad/revisions';
 *
 * declare const held: () => { apiBaseUrl: string } | undefined;
 * const http = createRevisionHttpClient({ credentials: 'include', ...createGitRemoteTransport(held) });
 * ```
 */
export const createGitRemoteTransport = (credential: () => GitRemoteCredential | undefined): GitRemoteTransport => {
  /** The held credential, but only when it was minted for *this* URL's origin. */
  const credited = (url: string): GitRemoteCredential | undefined => {
    const held = credential();
    if (held === undefined || isTauApiUrl(held.apiBaseUrl, url)) {
      return undefined;
    }
    const origin = originOf(url);
    return origin !== undefined && origin === held.origin ? held : undefined;
  };
  return {
    proxyAuthorization: (url) => {
      const held = credited(url);
      if (held === undefined) {
        return undefined;
      }
      if (held.unavailable !== undefined) {
        throw reauthorizationRequired(held.unavailable);
      }
      /* No credential and no stated problem is an anonymous read of a public
       * repository, which is a request git makes without one. */
      return held.authorization;
    },
    fetch: async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const held = credential();
      if (held === undefined) {
        /* Routing is not decidable yet, and guessing "this is Tau's" would send
         * the viewer's own cookies for a third-party host (`credentials:
         * 'include'` is set on every request). The page posts the frame the
         * moment a port opens, so this is a programming error, not a race. */
        throw new Error('This host has not been told where the Tau API is; no remote can be reached yet.');
      }
      return globalThis.fetch(isTauApiUrl(held.apiBaseUrl, url) ? input : gitProxyUrl(held.apiBaseUrl, url), init);
    },
  };
};
