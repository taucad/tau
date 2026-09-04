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

export const githubShareCredentialBroker: ShareCredentialBroker = {
  async getAccessToken(request) {
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
    origin: globalThis.location.origin,
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
