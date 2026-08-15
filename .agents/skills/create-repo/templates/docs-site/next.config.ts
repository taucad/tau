import type { NextConfig } from 'next';
import { createMDX } from 'fumadocs-mdx/next';

const config: NextConfig = {
  output: 'export',
  reactStrictMode: true,
  turbopack: { root: new URL('..', import.meta.url).pathname },
};

export default createMDX()(config);
