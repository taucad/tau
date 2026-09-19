import { createAuthClient } from 'better-auth/react';
import { apiKeyClient } from '@better-auth/api-key/client';
import { magicLinkClient } from 'better-auth/client/plugins';
import { requireClientEnvironment } from '#environment.config.js';

const runtimeAuthFetch: typeof globalThis.fetch = async (input, init) => {
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
  plugins: [magicLinkClient(), apiKeyClient()],
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
  },
});
