import { createAuthClient } from 'better-auth/react';
import { apiKeyClient, magicLinkClient, usernameClient } from 'better-auth/client/plugins';
import { ENV } from '#config.js';

type AuthClient = ReturnType<typeof createAuthClient>;

let authClientInstance: AuthClient | undefined;

/**
 * Get the auth client instance. Lazily initializes the client to ensure
 * ENV is properly loaded (especially window.ENV on the client side).
 */
export function getAuthClient(): AuthClient {
  authClientInstance ??= createAuthClient({
    // eslint-disable-next-line @typescript-eslint/naming-convention -- 3rd-party library
    baseURL: `${ENV.TAU_API_URL}/v1/auth`,
    plugins: [magicLinkClient(), usernameClient(), apiKeyClient()],
    emailAndPassword: {
      enabled: true,
      autoSignIn: true,
    },
  });

  return authClientInstance;
}

/**
 * Auth client instance. Use this for convenience, but note that it's initialized
 * lazily via a getter to ensure ENV is loaded.
 */
export const authClient = new Proxy({} as AuthClient, {
  get(_target, property) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-explicit-any -- Proxy requires any for dynamic property access
    return (getAuthClient() as any)[property];
  },
});
