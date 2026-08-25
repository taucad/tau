import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { build } from 'vite';
import { tauRuntime } from '@taucad/runtime/vite';

const outputDirectories: string[] = [];

afterEach(() => {
  for (const directory of outputDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('SVG transcoder Vite asset integration', () => {
  it('emits package-owned WASM and font assets without another Vite plugin', async () => {
    const outputDirectory = mkdtempSync(fileURLToPath(new URL('../.svg-vite-test-', import.meta.url)));
    outputDirectories.push(outputDirectory);
    const distributionDirectory = join(outputDirectory, 'dist');
    const entry = fileURLToPath(new URL('svg.ts', import.meta.url));
    writeFileSync(join(outputDirectory, 'index.html'), '<script type="module" src="/entry.ts"></script>');
    writeFileSync(
      join(outputDirectory, 'entry.ts'),
      `import { renderSvgPng } from ${JSON.stringify(entry)}; globalThis.renderSvgPng = renderSvgPng; globalThis.svgWorker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });`,
    );
    writeFileSync(
      join(outputDirectory, 'worker.ts'),
      `import { renderSvgPng } from ${JSON.stringify(entry)}; globalThis.renderSvgPng = renderSvgPng;`,
    );

    await build({
      configFile: false,
      logLevel: 'silent',
      root: outputDirectory,
      plugins: [tauRuntime()],
      build: {
        outDir: distributionDirectory,
        emptyOutDir: true,
        rollupOptions: {
          external: ['@resvg/resvg-wasm', '@taucad/runtime/transcoder', 'nanoraster', 'zod'],
        },
      },
    });

    const assetsDirectory = join(distributionDirectory, 'assets');
    const emitted = readdirSync(assetsDirectory);
    const wasm = emitted.find((name) => name.endsWith('.wasm'));
    const font = emitted.find((name) => name.endsWith('.ttf'));
    expect(wasm).toBeDefined();
    expect(font).toBeDefined();
    const javascript = emitted
      .filter((name) => name.endsWith('.js'))
      .map((name) => readFileSync(join(assetsDirectory, name), 'utf8'))
      .join('\n');
    expect(javascript).toContain(wasm);
    expect(javascript).toContain(font);
  });
});
