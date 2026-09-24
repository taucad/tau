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
import { isDesktopTarget } from '#lib/build-target.js';
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

/** The web page that runs the Gist grant for the desktop app (D16c). */
export const githubGistConsentPath = '/connect/github-gist';

/** Where a Gist grant continues: this page leaves for GitHub, or the system browser runs it. */
export type GithubGistConsentHandoff = 'redirect' | 'system-browser';

/**
 * Start the incremental `gist` grant on the signed-in GitHub account.
 *
 * On desktop the grant cannot run in the renderer: Better Auth keeps its OAuth
 * `state` cookie in the Electron cookie jar, while GitHub's callback runs in
 * the system browser, so every attempt ended in `state_mismatch` (D16c). The
 * web page at {@link githubGistConsentPath} runs the whole grant in the browser
 * instead, and the desktop watches the account with
 * {@link awaitGithubGistConnection}.
 *
 * @param input - The page to come back to, and which surface it is.
 * @returns How the grant continues.
 */
export const connectGithubGist = async ({
  returnUrl,
  surface,
}: {
  readonly returnUrl: string;
  readonly surface: GithubGistAuthorizationSurface;
}): Promise<GithubGistConsentHandoff> => {
  if (isDesktopTarget()) {
    /* The shell sends every window.open to the system browser (`apps/desktop` main, setWindowOpenHandler). */
    globalThis.open(`${shareOrigin()}${githubGistConsentPath}`, '_blank', 'noopener,noreferrer');
    return 'system-browser';
  }
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
  return 'redirect';
};

const gistConsentPollMilliseconds = 2000;
const gistConsentTimeoutMilliseconds = 10 * 60 * 1000;

/**
 * Wait for Gist access granted in the system browser to reach this session's GitHub account.
 *
 * @param signal - Aborted when the person stops waiting.
 * @returns Whether access arrived before the ten-minute deadline or the abort.
 */
export const awaitGithubGistConnection = async (signal: AbortSignal): Promise<boolean> => {
  const deadline = Date.now() + gistConsentTimeoutMilliseconds;
  while (Date.now() < deadline) {
    // oxlint-disable-next-line no-await-in-loop -- polling is sequential by definition.
    await new Promise<void>((resolve) => {
      globalThis.setTimeout(resolve, gistConsentPollMilliseconds);
    });
    if (signal.aborted) {
      return false;
    }
    /* A failed check is one missed poll, not the end of the wait. */
    // oxlint-disable-next-line no-await-in-loop -- polling is sequential by definition.
    const status = await getGithubGistConnectionStatus().catch(() => undefined);
    if (status === 'connected') {
      return true;
    }
  }
  return false;
};

export const githubShareCredentialBroker: ShareCredentialBroker = {
  async getAccessToken(request) {
    /* D23: the sign-in token serves Gist sharing only; repositories use the GitHub App connection. */
    if (
      request.connectionId !== 'github' ||
      request.audience !== 'https://api.github.com' ||
      request.scopes.length !== 1 ||
      request.scopes[0] !== 'gist'
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
