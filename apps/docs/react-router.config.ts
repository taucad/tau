import type { Config } from '@react-router/dev/config';

const prerenderConcurrency = 4;

export default {
  ssr: false,
  routeDiscovery: { mode: 'initial' },
  /**
   * React Router 8 behaviour (blueprint B4): loaders get the request as sent, `.data` suffix included. The docs loaders
   * read only `params`, so their prerendered documents and `.data` files are unchanged.
   */
  // eslint-disable-next-line @typescript-eslint/naming-convention -- React Router's flag name.
  future: { v8_passThroughRequests: true },
  prerender: {
    async paths() {
      const { listStaticPrerenderPaths } = await import('./app/lib/static-paths');
      return listStaticPrerenderPaths();
    },
    concurrency: prerenderConcurrency,
  },
} satisfies Config;
