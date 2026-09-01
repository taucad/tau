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
    // eslint-disable-next-line @typescript-eslint/naming-convention -- upstream React Router config field.
    unstable_concurrency: prerenderConcurrency,
  },
} satisfies Config;
