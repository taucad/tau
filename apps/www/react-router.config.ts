import type { Config } from '@react-router/dev/config';

export default {
  ssr: true,
  routeDiscovery: { mode: 'initial' },
  /**
   * React Router 8 behaviour (blueprint B4): loaders get the request as sent, so a client navigation's `request.url`
   * is `<path>.data?_routes=…`. The page loader reads the `url` argument. Middleware (C1) is on for the root's headers.
   * Data requests are trailing-slash aware (B5, RR4): `/pricing/` asks for `/pricing/_.data` and `/` for `/_.data`,
   * which the app's marketing edge function accepts beside the earlier `/pricing.data` and `/_root.data`.
   * The Environment API build (B6, RR5) writes one server `build/server/index.js`, which the Netlify adapter's function
   * and `scripts/serve.ts` import.
   */
  future: {
    /* eslint-disable @typescript-eslint/naming-convention -- React Router's flag names. */
    v8_passThroughRequests: true,
    v8_middleware: true,
    v8_trailingSlashAwareDataRequests: true,
    v8_viteEnvironmentApi: true,
    /* eslint-enable @typescript-eslint/naming-convention -- The flag names end here. */
  },
} satisfies Config;
