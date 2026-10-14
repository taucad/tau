import { z } from 'zod';
import { createShareArtifactWorkerCodec } from '@taucad/share/artifact-worker';
import { directShareProvider, directShareProviderDescriptor } from '@taucad/share/direct';
import { bitbucketShareProvider, bitbucketShareProviderDescriptor } from '@taucad/share/bitbucket';
import { githubShareProvider, githubShareProviderDescriptor } from '@taucad/share/github';
import { githubGistShareProvider, githubGistShareProviderDescriptor } from '@taucad/share/github-gist';
import { gitlabShareProvider, gitlabShareProviderDescriptor } from '@taucad/share/gitlab';
import type { GithubGistTransport, ShareProviderContext } from '@taucad/share/provider';
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

const gistCapabilitySchema = z.object({
  status: z.enum(['connected', 'permission-required', 'not-connected', 'reconnect-required', 'disabled']),
  enabled: z.boolean(),
  grantedScopes: z.array(z.string()),
  authorizationUrl: z.url(),
  account: z.object({ id: z.number(), login: z.string() }).optional(),
  verifiedAt: z.string().optional(),
});
export type GithubGistConnectionStatus = z.infer<typeof gistCapabilitySchema>['status'] | 'signed-out';

const gistApi = async (path: string, init?: RequestInit): Promise<unknown> => {
  let response: Response;
  try {
    response = await fetch(`${ENV.TAU_API_URL.replace(/\/$/u, '')}/v1/github/gists/${path}`, {
      ...init,
      credentials: 'include',
      cache: 'no-store',
      headers: { 'content-type': 'application/json' },
    });
  } catch {
    init?.signal?.throwIfAborted();
    throw new ShareError('SHARE_PROVIDER_UNAVAILABLE', 'GitHub sharing is temporarily unavailable. Try again.');
  }
  const body: unknown = await response.json().catch(() => undefined);
  if (response.status === 401) {
    throw new ShareError('SHARE_AUTH_REQUIRED', 'Sign in or reconnect GitHub to continue.');
  }
  if (response.status === 403 && z.object({ code: z.literal('GITHUB_GIST_USE_DISABLED') }).safeParse(body).success) {
    throw new ShareError(
      'SHARE_PROVIDER_UNAVAILABLE',
      'Gist sharing is off in Tau. Enable it in Security settings before sharing.',
    );
  }
  if (response.status === 403) {
    throw new ShareError('SHARE_PERMISSION_REQUIRED', 'Check GitHub Gist access in Security settings, then try again.');
  }
  if (response.status === 409) {
    throw new ShareError(
      'SHARE_PROVIDER_UNAVAILABLE',
      'This Gist changed on GitHub. Reopen the latest publication before changing it.',
    );
  }
  if (!response.ok) {
    throw new ShareError('SHARE_PROVIDER_UNAVAILABLE', 'GitHub sharing is temporarily unavailable. Try again.');
  }
  return body;
};

export const getGithubGistCapability = async (): Promise<z.infer<typeof gistCapabilitySchema>> =>
  gistCapabilitySchema.parse(await gistApi('capability'));
export const setGithubGistEnabled = async (enabled: boolean): Promise<void> => {
  await gistApi('use', { method: 'POST', body: JSON.stringify({ enabled }) });
};

export type GithubGistAuthorizationSurface = 'editor' | 'share-page';

export type GithubGistAuthorizationReturn = {
  readonly outcome: 'returned' | 'cancelled' | 'failed';
  /** What went wrong, when the grant failed; a retry cannot fix these two (D51). */
  readonly failure?: string;
  readonly remainingSearch: string;
};

/* Better Auth's link refusals (`callback.ts`); `allowDifferentEmails` is false. */
const githubLinkFailures: Readonly<Record<string, string>> = {
  // eslint-disable-next-line @typescript-eslint/naming-convention -- Better Auth's error code.
  email_does_not_match:
    'This GitHub account uses a different email address from your Tau account. Sign in to GitHub with an account that uses the same email, then try again.',
  // eslint-disable-next-line @typescript-eslint/naming-convention -- Better Auth's error code.
  account_already_linked_to_different_user:
    'This GitHub account is already linked to another Tau account. Sign in to GitHub with a different account, then try again.',
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
  const failure = error === null ? undefined : githubLinkFailures[error];
  return {
    outcome: error === null ? 'returned' : error === 'access_denied' ? 'cancelled' : 'failed',
    ...(failure === undefined ? {} : { failure }),
    remainingSearch: remaining ? `?${remaining}` : '',
  };
};

export const getGithubGistConnectionStatus = async (): Promise<GithubGistConnectionStatus> => {
  try {
    const capability = await getGithubGistCapability();
    return capability.status;
  } catch (error) {
    if (error instanceof ShareError && error.code === 'SHARE_AUTH_REQUIRED') {
      return 'signed-out';
    }
    throw error;
  }
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

export const githubGistTransport: GithubGistTransport = {
  async mutate({ signal, ...input }) {
    const result = await gistApi('mutate', { method: 'POST', body: JSON.stringify(input), signal });
    return input.action === 'delete' ? {} : z.record(z.string(), z.unknown()).parse(result);
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
    githubGist: githubGistTransport,
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
