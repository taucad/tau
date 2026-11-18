import { rm } from 'node:fs/promises';
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
  /**
   * React Router 8 leaves `build/server` after an `ssr: false` build (7 deleted it). Nothing serves it, so it is removed
   * here, before the site deploys `build/client`.
   */
  async buildEnd({ reactRouterConfig }) {
    await rm(`${reactRouterConfig.buildDirectory}/server`, { recursive: true, force: true });
  },
} satisfies Config;
