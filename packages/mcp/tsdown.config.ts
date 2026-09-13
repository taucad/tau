import { defineConfig } from 'tsdown';
import type { UserConfig } from 'tsdown';

const baseConfig: UserConfig = {
  entry: ['src/index.ts'],
  sourcemap: false,
  clean: true,
  dts: true,
  minify: true,
  tsconfig: 'tsconfig.build.json',
  unbundle: false,
  platform: 'node',
  target: 'node24',
  deps: { neverBundle: [/^@modelcontextprotocol\/sdk(?:\/|$)/u, 'zod'] },
};

const packageConfig: UserConfig = {
  ...baseConfig,
  format: 'esm',
  outDir: 'dist',
  // @taucad/chat is private. Its four canonical schema/RPC subpaths are
  // intentionally bundled; only the public MCP SDK and Zod remain external.
};

export default defineConfig(packageConfig);
