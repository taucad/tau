import type { Config } from '@react-router/dev/config';

export default {
  ssr: true,
  // eslint-disable-next-line @typescript-eslint/naming-convention -- React Router's flag name.
  future: { v8_middleware: true },
  routeDiscovery: { mode: 'initial' },
} satisfies Config;
