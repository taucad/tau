import { createAuthClient } from 'better-auth/react';
import { apiKeyClient } from '@better-auth/api-key/client';
import { magicLinkClient } from 'better-auth/client/plugins';
import { ENV } from '#environment.config.js';

// Tolerate non-browser module evaluation before the root loader has injected
// `window.ENV`. Runtime SSR still validates `TAU_API_URL` through getEnvironment().
// oxlint-disable-next-line @typescript-eslint/no-unnecessary-condition -- defensive fallback for early module evaluation where `TAU_API_URL` can be unset at type level
const apiBaseURL = ENV.TAU_API_URL ?? 'http://localhost:4000';

export const authClient = createAuthClient({
  baseURL: `${apiBaseURL}/v1/auth`,
  plugins: [magicLinkClient(), apiKeyClient()],
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
  },
});
