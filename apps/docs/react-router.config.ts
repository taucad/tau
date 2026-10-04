import type { Config } from '@react-router/dev/config';

const prerenderConcurrency = 4;

export default {
  ssr: false,
  routeDiscovery: { mode: 'initial' },
  prerender: {
    async paths() {
      const { listStaticPrerenderPaths } = await import('./app/lib/static-paths');
      return listStaticPrerenderPaths();
    },
    concurrency: prerenderConcurrency,
  },
} satisfies Config;
