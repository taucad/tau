import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { build } from 'vite';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';

describe('image transcoder browser build', () => {
  it('keeps Node builtin shims out of the browser-reachable bounds reader', async () => {
    const result = await build({
      configFile: false,
      logLevel: 'silent',
      plugins: [nxViteTsPaths()],
      build: {
        write: false,
        lib: { entry: fileURLToPath(new URL('image.transcoder.ts', import.meta.url)), formats: ['es'] },
        rollupOptions: {
          external: ['@taucad/camera', '@taucad/runtime/transcoder', 'nanoraster'],
        },
      },
    });
    const outputs = Array.isArray(result) ? result : [result];
    const javascript = outputs
      .flatMap((output) => ('output' in output ? output.output : []))
      .filter((output) => output.type === 'chunk')
      .map((output) => output.code)
      .join('\n');

    expect(javascript).not.toContain('__vite-browser-external');
    expect(javascript).not.toMatch(/(?:from|import\()\s*["'](?:node:)?(?:fs|path)["']/u);
  });
});
