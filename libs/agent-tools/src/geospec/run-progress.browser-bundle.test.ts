import { resolve } from 'node:path';
import { build } from 'vite';
import { tauRuntime } from '@taucad/runtime/vite';
import { describe, expect, it } from 'vitest';

describe('GeoSpec browser progress contract', () => {
  it('should bundle progress helpers without a runner VM or emitted WASM', async () => {
    const entry = '\0geospec-progress-consumer';
    const result = await build({
      root: resolve(import.meta.dirname, '../../../..'),
      configFile: false,
      logLevel: 'silent',
      plugins: [
        tauRuntime(),
        {
          name: 'geospec-progress-consumer',
          resolveId(id) {
            return id === entry ? entry : undefined;
          },
          load(id) {
            return id === entry
              ? "export { createGeoSpecRunProgress, markGeoSpecRunTimeout } from '@taucad/agent-tools/geospec';"
              : undefined;
          },
        },
      ],
      build: {
        write: false,
        minify: false,
        assetsInlineLimit: 0,
        rollupOptions: { input: entry, preserveEntrySignatures: 'strict' },
      },
    });
    if (!('output' in result)) {
      throw new Error('Expected one browser bundle');
    }
    expect(
      result.output.filter((output) => output.fileName.endsWith('.wasm')).map((output) => output.fileName),
    ).toEqual([]);
    const chunks = result.output.filter((output) => output.type === 'chunk');
    expect(chunks.flatMap((chunk) => chunk.exports)).toEqual(
      expect.arrayContaining(['createGeoSpecRunProgress', 'markGeoSpecRunTimeout']),
    );
    expect(
      chunks.flatMap((chunk) => Object.keys(chunk.modules)).filter((id) => /esbuild|run-geospec-module/u.test(id)),
    ).toEqual([]);
  });
});
