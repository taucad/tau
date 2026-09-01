import { index, route } from '@react-router/dev/routes';
import type { RouteConfig } from '@react-router/dev/routes';

export default [
  index('routes/_index/route.tsx'),
  route('llms.txt', 'routes/llms[.]txt/route.ts'),
  route('llms-full.txt', 'routes/llms-full[.]txt/route.ts'),
  route('_llms/*', 'routes/[_llms].$/route.ts'),
  route('robots.txt', 'routes/robots[.]txt/route.ts'),
  route('sitemap.xml', 'routes/sitemap[.]xml/route.ts'),
  route('_redirects', 'routes/[_redirects]/route.ts'),
  route('*', 'routes/$/route.tsx'),
] satisfies RouteConfig;
