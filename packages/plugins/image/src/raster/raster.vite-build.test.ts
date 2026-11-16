import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { build } from 'vite';
import type { Rollup } from 'vite';
import { tauRuntime } from '@taucad/runtime/vite';

const codecModule = /[/\\]node_modules[/\\].*(?:@jsquash|omggif|utif2|jpeg-js|pako)[/\\]|bmp-decoder\.ts$/u;

describe('raster transcoder browser build', () => {
  it('keeps every codec out of the static import graph and emits each pinned WASM file', async () => {
    const result = await build({
      configFile: false,
      logLevel: 'silent',
      plugins: [tauRuntime()],
      build: {
        write: false,
        lib: { entry: fileURLToPath(new URL('raster.transcoder.ts', import.meta.url)), formats: ['es'] },
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
    const lazyModules = [...chunks.values()]
      .filter(({ fileName }) => !staticGraph.has(fileName))
      .flatMap((chunk) => Object.keys(chunk.modules));
    const wasm = outputs
      .filter((output) => output.type === 'asset' && output.fileName.endsWith('.wasm'))
      .map(({ fileName }) => fileName.replace(/^.*\//u, '').replace(/-[\w-]{8}\.wasm$/u, '.wasm'));

    expect(staticModules.filter((id) => codecModule.test(id))).toEqual([]);
    expect(lazyModules.filter((id) => codecModule.test(id)).length).toBeGreaterThanOrEqual(8);
    expect(new Set(wasm)).toEqual(
      new Set([
        'avif_dec.wasm',
        'mozjpeg_dec.wasm',
        'mozjpeg_enc.wasm',
        'squoosh_png_bg.wasm',
        'squoosh_resize_bg.wasm',
        'webp_dec.wasm',
        'webp_enc.wasm',
      ]),
    );
  });
});
