import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { build } from 'vite';
import type { Rollup } from 'vite';
import { tauRuntime } from '@taucad/runtime/vite';

const libheifModule = /[/\\]node_modules[/\\].*libheif-js[/\\]/u;

describe('HEIF transcoder browser build', () => {
  it('keeps libheif out of the static import graph, emits libheif.wasm as its own file and never the inlined bundle', async () => {
    const result = await build({
      configFile: false,
      logLevel: 'silent',
      plugins: [tauRuntime()],
      build: {
        write: false,
        lib: { entry: fileURLToPath(new URL('heif.transcoder.ts', import.meta.url)), formats: ['es'] },
        rollupOptions: { external: ['@taucad/runtime/transcoder', 'zod'] },
      },
    });
    const outputs = (Array.isArray(result) ? result : [result]).flatMap((output) =>
      'output' in output ? output.output : [],
    );
    const chunks = new Map(
      outputs
        .filter((output): output is Rollup.OutputChunk => output.type === 'chunk')
        .map((chunk) => [chunk.fileName, chunk]),
    );
    const entry = [...chunks.values()].find(({ isEntry }) => isEntry)!;
    const staticGraph = new Set<string>();
    const visit = (fileName: string): void => {
      if (staticGraph.has(fileName)) {
        return;
      }
      staticGraph.add(fileName);
      for (const imported of chunks.get(fileName)?.imports ?? []) {
        visit(imported);
      }
    };
    visit(entry.fileName);

    const staticModules = [...staticGraph].flatMap((fileName) => Object.keys(chunks.get(fileName)?.modules ?? {}));
    const allModules = [...chunks.values()].flatMap((chunk) => Object.keys(chunk.modules));
    const wasm = outputs
      .filter((output) => output.type === 'asset' && output.fileName.endsWith('.wasm'))
      .map(({ fileName }) => fileName.replace(/^.*\//u, '').replace(/-[\w-]{8}\.wasm$/u, '.wasm'));

    expect(staticModules.filter((id) => libheifModule.test(id))).toEqual([]);
    expect(
      allModules.filter((id) => libheifModule.test(id)).map((id) => id.replace(/^.*libheif-js[/\\]/u, '')),
    ).toEqual(['libheif-wasm/libheif.js']);
    expect(allModules.some((id) => id.includes('libheif-bundle'))).toBe(false);
    // `@taucad/image/raster` also declares the raster decoders in the same module, so they are emitted beside the
    // encoders; none of them is fetched unless the raster transcoder needs it.
    expect(wasm).toEqual(
      expect.arrayContaining([
        'libheif.wasm',
        'mozjpeg_enc.wasm',
        'squoosh_png_bg.wasm',
        'squoosh_resize_bg.wasm',
        'webp_enc.wasm',
      ]),
    );
    expect(wasm.filter((name) => name.startsWith('libheif'))).toEqual(['libheif.wasm']);
  });
});
