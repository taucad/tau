import { createAuthClient } from 'better-auth/react';
import { apiKeyClient } from '@better-auth/api-key/client';
import { magicLinkClient, deviceAuthorizationClient } from 'better-auth/client/plugins';
import { requireClientEnvironment } from '#environment.config.js';
import { offlineRequestError, pageReadsOffline } from '#lib/page-offline.js';
import { isDesktopTarget } from '#lib/build-target.js';

/*
 * While the page reads offline no auth request leaves the device (onboarding DT3): it fails as the network would,
 * and the session query asks again on reconnect (`installQueryRevalidation`).
 */
/**
 * Tau Desktop holds an OAuth access token, which no Better Auth route accepts (operator ruling D1=A). It reads who is
 * signed in from Tau's own `/v1/account/session`, which answers the `get-session` shape for either client (Principal
 * ruling P2), so `useSession` works unchanged in the desktop.
 *
 * @param pathname - The Better Auth path the client asked for.
 * @returns The path to request.
 */
const desktopPathname = (pathname: string): string =>
  isDesktopTarget() && pathname === '/v1/auth/get-session' ? '/v1/account/session' : pathname;

const runtimeAuthFetch: typeof globalThis.fetch = async (input, init) => {
  if (pageReadsOffline()) {
    throw offlineRequestError();
  }
  const apiBaseURL = requireClientEnvironment('TAU_API_URL').replace(/\/$/u, '');
  const requestUrl = new URL(input instanceof Request ? input.url : input);
  const runtimeUrl = `${apiBaseURL}${desktopPathname(requestUrl.pathname)}${requestUrl.search}${requestUrl.hash}`;
  const runtimeInput = input instanceof Request ? new Request(runtimeUrl, input) : runtimeUrl;
  return globalThis.fetch(runtimeInput, init);
};

export const authClient = createAuthClient({
  // Better Auth requires an absolute base URL at construction, then delegates
  // every real request to runtimeAuthFetch where the injected host is resolved.
  baseURL: 'https://window-env.invalid/v1/auth',
  fetchOptions: { customFetchImpl: runtimeAuthFetch },
  // No `oauthProviderClient`: a Tau Desktop sign-in continues through the sign-in page's `redirectTo` (DSI-3), and the
  // plugin would add the page's query to every non-GET call and its modules to the critical path.
  plugins: [magicLinkClient(), apiKeyClient(), deviceAuthorizationClient()],
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
  },
});
