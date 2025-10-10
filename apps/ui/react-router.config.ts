import type { Config } from '@react-router/dev/config';

export default {
  ssr: true,
  async prerender() {
    // Static website content. Renders at build time and is served as static files,
    // speeds up the first load time.
    return [
      // TODO: make FE env-vars available during prerendering.
      // 'manifest.webmanifest', 'robots.txt', '/llms.txt', '/llms-full.txt'
    ];
  },
} satisfies Config;
