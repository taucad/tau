import { createAuthClient } from 'better-auth/react';
import { apiKeyClient } from '@better-auth/api-key/client';
import { magicLinkClient, deviceAuthorizationClient } from 'better-auth/client/plugins';
import { requireClientEnvironment } from '#environment.config.js';
import { offlineRequestError, pageReadsOffline } from '#lib/page-offline.js';

/*
 * While the page reads offline no auth request leaves the device (onboarding DT3): it fails as the network would,
 * and the session query asks again on reconnect (`installQueryRevalidation`).
 */
const runtimeAuthFetch: typeof globalThis.fetch = async (input, init) => {
  if (pageReadsOffline()) {
    throw offlineRequestError();
  }
  const apiBaseURL = requireClientEnvironment('TAU_API_URL').replace(/\/$/u, '');
  const requestUrl = new URL(input instanceof Request ? input.url : input);
  const runtimeUrl = `${apiBaseURL}${requestUrl.pathname}${requestUrl.search}${requestUrl.hash}`;
  const runtimeInput = input instanceof Request ? new Request(runtimeUrl, input) : runtimeUrl;
  return globalThis.fetch(runtimeInput, init);
};

export const authClient = createAuthClient({
  // Better Auth requires an absolute base URL at construction, then delegates
  // every real request to runtimeAuthFetch where the injected host is resolved.
  baseURL: 'https://window-env.invalid/v1/auth',
  fetchOptions: { customFetchImpl: runtimeAuthFetch },
  plugins: [magicLinkClient(), apiKeyClient(), deviceAuthorizationClient()],
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
  },
});
