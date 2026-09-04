import { createAuthClient } from 'better-auth/react';
import { apiKeyClient } from '@better-auth/api-key/client';
import { stripeClient } from '@better-auth/stripe/client';
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
  // The stripeClient plugin drives subscription.upgrade()/billingPortal()/list():
  // upgrade + portal surfaces are plugin-owned; Tau only adds the credit
  // ledger endpoints under /v1/billing (blueprint AD1/AD5, deviation 1).
  plugins: [magicLinkClient(), apiKeyClient(), stripeClient({ subscription: true })],
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
  },
});
