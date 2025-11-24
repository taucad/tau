import { createAuthClient } from 'better-auth/react';
import { apiKeyClient, magicLinkClient, usernameClient } from 'better-auth/client/plugins';
import { ENV } from '#config.js';

export const authClient = createAuthClient({
  // eslint-disable-next-line @typescript-eslint/naming-convention -- 3rd-party library
  baseURL: `${ENV.TAU_API_URL}/v1/auth`,
  plugins: [magicLinkClient(), usernameClient(), apiKeyClient()],
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
  },
});
