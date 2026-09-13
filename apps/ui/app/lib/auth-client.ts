import { createAuthClient } from 'better-auth/react';
import { apiKeyClient } from '@better-auth/api-key/client';
import { magicLinkClient } from 'better-auth/client/plugins';
import { ENV } from '#environment.config.js';

// Tolerate `TAU_API_URL` missing during the React Router prerender pass: that build
// step imports the SSR bundle in Node where `process.env.TAU_API_URL` may be unset
// (e.g. CI runners), and `createAuthClient` rejects an undefined `baseURL`. The
// browser bundle always reads the real value from `window.ENV.TAU_API_URL` injected
// by the root loader, and prerender never invokes any auth methods, so the
// placeholder URL is unreachable at runtime.
// oxlint-disable-next-line @typescript-eslint/no-unnecessary-condition -- defensive fallback for prerender/SSR where `TAU_API_URL` can be unset at type level
const apiBaseURL = ENV.TAU_API_URL ?? 'http://localhost:4000';

export const authClient = createAuthClient({
  baseURL: `${apiBaseURL}/v1/auth`,
  plugins: [magicLinkClient(), apiKeyClient()],
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
  },
});
