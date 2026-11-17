import type { Config } from '@react-router/dev/config';

export default {
  ssr: true,
  routeDiscovery: { mode: 'initial' },
  /**
   * React Router 8 behaviour (blueprint B4): loaders get the request as sent, so a client navigation's `request.url`
   * is `<path>.data?_routes=…`. The page loader reads the `url` argument. Middleware (C1) is on for the root's headers.
   * The Environment API build (B6, RR5) writes one server `build/server/index.js`, which the Netlify adapter's function
   * and `scripts/serve.ts` import.
   */
  // eslint-disable-next-line @typescript-eslint/naming-convention -- React Router's flag names.
  future: { v8_passThroughRequests: true, v8_middleware: true, v8_viteEnvironmentApi: true },
} satisfies Config;
