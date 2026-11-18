import type { Config } from '@react-router/dev/config';

export default {
  ssr: true,
  routeDiscovery: { mode: 'initial' },
  /**
   * React Router 8 defaults (blueprint RR8; the `v8_*` flags that turned them on under 7 are removed): loaders get the
   * request as sent (B4), so a client navigation's `request.url` is `<path>.data?_routes=…` and the page loader reads
   * the `url` argument; middleware is always on, for the root's headers; data requests are trailing-slash aware (B5):
   * `/pricing/` asks for `/pricing/_.data` and `/` for `/_.data`, which the app's marketing edge function accepts beside
   * the earlier `/pricing.data` and `/_root.data`; the Environment API build (B6) writes one server
   * `build/server/index.js`, which the Netlify adapter's function and `scripts/serve.ts` import; route modules split
   * (B8), and no `www` route has a client loader to split.
   */
} satisfies Config;
