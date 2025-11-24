import { createAuthClient } from 'better-auth/react';
import { apiKeyClient, magicLinkClient, usernameClient } from 'better-auth/client/plugins';
import { ENV } from '#config.js';

console.log('[AUTH-CLIENT] Module loaded. ENV.TAU_API_URL:', ENV.TAU_API_URL);
console.log('[AUTH-CLIENT] window.ENV:', typeof window !== 'undefined' ? window.ENV : 'not in browser');
console.log('[AUTH-CLIENT] process.env.TAU_API_URL:', process.env.TAU_API_URL);

export const authClient = createAuthClient({
  // eslint-disable-next-line @typescript-eslint/naming-convention -- 3rd-party library
  baseURL: `${ENV.TAU_API_URL}/v1/auth`,
  plugins: [magicLinkClient(), usernameClient(), apiKeyClient()],
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
  },
});
