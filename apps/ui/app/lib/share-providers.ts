import { createShareArtifactWorkerCodec } from '@taucad/share/artifact-worker';
import { directShareProvider, directShareProviderDescriptor } from '@taucad/share/direct';
import { bitbucketShareProvider, bitbucketShareProviderDescriptor } from '@taucad/share/bitbucket';
import { githubShareProvider, githubShareProviderDescriptor } from '@taucad/share/github';
import { githubGistShareProvider, githubGistShareProviderDescriptor } from '@taucad/share/github-gist';
import { gitlabShareProvider, gitlabShareProviderDescriptor } from '@taucad/share/gitlab';
import type { ShareCredentialBroker, ShareProviderContext } from '@taucad/share/provider';
import { ShareError } from '@taucad/share/provider';
import { createShareProviderRegistry } from '@taucad/share/registry';
import { tauShareProvider, tauShareProviderDescriptor } from '@taucad/share/tau';
import { authClient } from '#lib/auth-client.js';
import { builtinShareProvider, builtinShareProviderDescriptor } from '#lib/builtin-share-provider.js';
import { ENV } from '#environment.config.js';
import { shareOrigin } from '#lib/share-origin.js';

export const shareProviderRegistry = createShareProviderRegistry([
  { descriptor: directShareProviderDescriptor, load: async () => directShareProvider },
  { descriptor: tauShareProviderDescriptor, load: async () => tauShareProvider },
  { descriptor: githubGistShareProviderDescriptor, load: async () => githubGistShareProvider },
  { descriptor: builtinShareProviderDescriptor, load: async () => builtinShareProvider },
  { descriptor: githubShareProviderDescriptor, load: async () => githubShareProvider },
  { descriptor: gitlabShareProviderDescriptor, load: async () => gitlabShareProvider },
  { descriptor: bitbucketShareProviderDescriptor, load: async () => bitbucketShareProvider },
]);

const requireGithubAccount = async () => {
  const result = await authClient.listAccounts();
  if (result.error) {
    throw new ShareError('SHARE_AUTH_REQUIRED', 'Sign in to connect GitHub.');
  }
  const account = result.data.find(({ providerId }) => providerId === 'github');
  if (!account) {
    throw new ShareError('SHARE_AUTH_REQUIRED', 'Connect GitHub to share a Gist.');
  }
  return account;
};

export type GithubGistConnectionStatus = 'connected' | 'permission-required' | 'not-connected' | 'signed-out';

export type GithubGistAuthorizationSurface = 'editor' | 'share-page';

export type GithubGistAuthorizationReturn = {
  readonly outcome: 'returned' | 'cancelled' | 'failed';
  readonly remainingSearch: string;
};

export const createGithubGistAuthorizationReturnUrl = ({
  returnUrl,
  surface,
}: {
  readonly returnUrl: string;
  readonly surface: GithubGistAuthorizationSurface;
}): string => {
  const url = new URL(returnUrl, globalThis.location.origin);
  url.hash = '';
  url.searchParams.set('shareAuth', 'github-gist');
  if (surface === 'editor') {
    url.searchParams.set('workbench', 'share');
    url.searchParams.set('shareProvider', 'github-gist');
  } else {
    url.searchParams.delete('workbench');
    url.searchParams.delete('shareProvider');
  }
  return url.href;
};

export const parseGithubGistAuthorizationReturn = (search: string): GithubGistAuthorizationReturn | undefined => {
  const parameters = new URLSearchParams(search);
  if (parameters.get('shareAuth') !== 'github-gist') {
    return undefined;
  }
  const error = parameters.get('error');
  parameters.delete('shareAuth');
  parameters.delete('error');
  parameters.delete('error_description');
  const remaining = parameters.toString();
  return {
    outcome: error === null ? 'returned' : error === 'access_denied' ? 'cancelled' : 'failed',
    remainingSearch: remaining ? `?${remaining}` : '',
  };
};

export const getGithubGistConnectionStatus = async (): Promise<GithubGistConnectionStatus> => {
  const result = await authClient.listAccounts();
  if (result.error) {
    return 'signed-out';
  }
  const account = result.data.find(({ providerId }) => providerId === 'github');
  if (!account) {
    return 'not-connected';
  }
  return account.scopes.includes('gist') ? 'connected' : 'permission-required';
};

export const connectGithubGist = async ({
  returnUrl,
  surface,
}: {
  readonly returnUrl: string;
  readonly surface: GithubGistAuthorizationSurface;
}): Promise<void> => {
  const authorizationReturnUrl = createGithubGistAuthorizationReturnUrl({ returnUrl, surface });
  const result = await authClient.linkSocial({
    provider: 'github',
    scopes: ['gist'],
    callbackURL: authorizationReturnUrl,
    errorCallbackURL: authorizationReturnUrl,
  });
  if (result.error) {
    throw new ShareError('SHARE_PROVIDER_UNAVAILABLE', 'GitHub authorization could not be started.');
  }
};

/**
 * Every GitHub authority Tau is allowed to ask the session for.
 *
 * An allow-set rather than a literal, because there are now two surfaces:
 * sharing a Gist, and connecting a project to a GitHub repository (S34). It
 * stays a *set* — never "whatever the caller asked for" — so a broker call that
 * invented a scope is refused here rather than on GitHub's consent screen.
 */
const githubBrokerScopes = new Set(['gist', 'public_repo', 'repo']);

/** Whether the repository being connected is a private one (S34). @public */
export type GithubRemoteVisibility = 'public' | 'private';

/**
 * The one GitHub authority a repository of this visibility needs.
 *
 * `public_repo` writes to public repositories and cannot read a private one;
 * `repo` is GitHub's only scope that can. There is no third option, which is
 * why the private choice is a second consent rather than a bigger first one.
 *
 * @param visibility - What the person said about the repository.
 * @returns The GitHub scope to ask for.
 * @public
 */
export const githubRemoteScope = (visibility: GithubRemoteVisibility): string =>
  visibility === 'private' ? 'repo' : 'public_repo';

const githubScopesOnSession = async (): Promise<readonly string[] | undefined> => {
  const result = await authClient.listAccounts();
  if (result.error) {
    return undefined;
  }
  return result.data.find(({ providerId }) => providerId === 'github')?.scopes;
};

/* Where GitHub sends the consent window when it is done. Nothing reads it: the
 * opener notices the new scope on the session, which is the fact that matters,
 * and closes the window.
 * ponytail: the app root is a heavy landing page for a window that lives half a
 * second; give it a static one when a second consent surface needs it. */
const consentReturnUrl = (): string => `${globalThis.location.origin}/`;

const consentPollMilliseconds = 500;
const consentTimeoutMilliseconds = 5 * 60 * 1000;

const delay = async (milliseconds: number): Promise<void> =>
  new Promise((resolve) => {
    globalThis.setTimeout(resolve, milliseconds);
  });

/**
 * Wait until the session actually carries the scope, or the person closed the
 * window without granting it.
 *
 * The session is the authority, not the window: `linkSocial` writes the new
 * scope on the account, so asking `listAccounts` is asking the thing that the
 * credential will be minted from.
 *
 * @param scope - The scope being granted.
 * @param consent - The window GitHub's consent screen is in.
 */
const awaitGithubScope = async (scope: string, consent: Window): Promise<void> => {
  try {
    for (let waited = 0; waited <= consentTimeoutMilliseconds; waited += consentPollMilliseconds) {
      // oxlint-disable-next-line no-await-in-loop -- polling is sequential by definition.
      const scopes: readonly string[] | undefined = await githubScopesOnSession();
      if (scopes?.includes(scope) === true) {
        return;
      }
      if (consent.closed) {
        break;
      }
      // oxlint-disable-next-line no-await-in-loop -- polling is sequential by definition.
      await delay(consentPollMilliseconds);
    }
  } finally {
    consent.close();
  }
  throw new ShareError('SHARE_PERMISSION_REQUIRED', 'GitHub permission was not granted.');
};

const requestGithubScope = async (scope: string, consent: Window | undefined, force: boolean): Promise<void> => {
  const granted = await githubScopesOnSession();
  if (!force && granted?.includes(scope) === true) {
    return;
  }
  const result = await authClient.linkSocial({
    provider: 'github',
    scopes: [scope],
    callbackURL: consentReturnUrl(),
    errorCallbackURL: consentReturnUrl(),
    disableRedirect: true,
  });
  const url = result.error ? '' : result.data.url;
  if (url === '') {
    throw new ShareError('SHARE_PROVIDER_UNAVAILABLE', 'GitHub authorization could not be started.');
  }
  if (consent === undefined) {
    throw new ShareError('SHARE_PROVIDER_UNAVAILABLE', 'Allow pop-ups so Tau can ask GitHub for permission.');
  }
  consent.location.href = url;
  await awaitGithubScope(scope, consent);
};

/**
 * Get the authority a GitHub remote needs, asking for it if the session has not
 * got it (S34, charter W12).
 *
 * Two consents, in this order, and never a pre-emptive one: `public_repo` when
 * *Connect* is pressed, and `repo` only once the person has said the repository
 * is private. A scope already on the session is not asked for again.
 *
 * The window is opened by the caller, inside the click, because a browser
 * blocks a pop-up that is opened after an `await`.
 *
 * `reconnect` asks again for a scope the session already records, and asks for
 * **the widest one it records**. That is the *Reconnect GitHub* row: an
 * `AUTH_SECRET` rotation leaves the recorded scopes intact and the stored token
 * unreadable, so a project connected to a *private* repository has to get `repo`
 * back — re-asking for `public_repo` would silently downgrade it (review R4).
 * The caller no longer knows which it was: the row survives a reload and the
 * session does not record a per-project visibility, so the account's own scopes
 * are the authority.
 *
 * The window is closed on every path, including the one where nothing is asked
 * for at all (review R5).
 *
 * @param input - The repository's visibility, the window to run consent in, and whether to re-ask.
 * @public
 */
export const authorizeGithubRemote = async (input: {
  readonly visibility: GithubRemoteVisibility;
  readonly consent: Window | undefined;
  readonly reconnect?: boolean;
}): Promise<void> => {
  try {
    if (input.reconnect === true) {
      const recorded = await githubScopesOnSession();
      /* `repo` implies `public_repo` on GitHub, so the widest recorded scope is
       * one ask, not two. */
      await requestGithubScope(recorded?.includes('repo') === true ? 'repo' : 'public_repo', input.consent, true);
      return;
    }
    await requestGithubScope('public_repo', input.consent, false);
    if (input.visibility === 'private') {
      await requestGithubScope(githubRemoteScope('private'), input.consent, false);
    }
  } finally {
    /* Closing a window `awaitGithubScope` already closed is a no-op; leaving an
     * `about:blank` pop-up open because nothing needed asking is not. */
    input.consent?.close();
  }
};

export const githubShareCredentialBroker: ShareCredentialBroker = {
  async getAccessToken(request) {
    if (
      request.connectionId !== 'github' ||
      request.audience !== 'https://api.github.com' ||
      request.scopes.length !== 1 ||
      !githubBrokerScopes.has(request.scopes[0] ?? '')
    ) {
      throw new ShareError('SHARE_PERMISSION_REQUIRED', 'The requested GitHub authority is not allowed.');
    }
    const account = await requireGithubAccount();
    const result = await authClient.getAccessToken({ providerId: 'github', accountId: account.accountId });
    if (result.error) {
      throw new ShareError('SHARE_AUTH_REQUIRED', 'The GitHub connection needs to be renewed.');
    }
    if (!result.data.accessToken) {
      throw new ShareError('SHARE_AUTH_REQUIRED', 'The GitHub connection needs to be renewed.');
    }
    return {
      accessToken: result.data.accessToken,
      grantedScopes: result.data.scopes,
      ...(result.data.accessTokenExpiresAt ? { expiresAt: result.data.accessTokenExpiresAt } : {}),
    };
  },
};

/**
 * The header value a request to a GitHub remote carries through Tau's proxy.
 *
 * Read through the same broker the Gist surface uses, so the allow-set is
 * checked once and in one place; the token itself is never written anywhere
 * (I8) and travels only in `x-tau-proxy-authorization`.
 *
 * @param visibility - What the person said about the repository.
 * @returns The whole header value.
 * @public
 */
export const githubRemoteAuthorization = async (visibility: GithubRemoteVisibility): Promise<string> => {
  const credential = await githubShareCredentialBroker.getAccessToken({
    connectionId: 'github',
    audience: 'https://api.github.com',
    scopes: [githubRemoteScope(visibility)],
  });
  return `Bearer ${credential.accessToken}`;
};

type BrowserShareProviderContext = ShareProviderContext & {
  readonly archiveUrl: string;
  readonly dispose: () => void;
};

export const createBrowserShareProviderContext = (): BrowserShareProviderContext => {
  const archiveUrl = `${ENV.TAU_API_URL}/v1/repositories/archive`;
  const artifactCodec = createShareArtifactWorkerCodec();
  return {
    origin: shareOrigin(),
    archiveUrl,
    artifactCodec,
    fetch: globalThis.fetch.bind(globalThis),
    credentialBroker: githubShareCredentialBroker,
    dispose: artifactCodec.dispose,
  };
};

export const withBrowserShareProviderContext = async <Result>(
  operation: (context: BrowserShareProviderContext) => Promise<Result>,
): Promise<Result> => {
  const context = createBrowserShareProviderContext();
  try {
    return await operation(context);
  } finally {
    context.dispose();
  }
};
