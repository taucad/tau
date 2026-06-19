// @vitest-environment node
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const readMultiLoader = async (): Promise<string> =>
  readFile(new URL('replicad-wasm-multi-loader.ts', import.meta.url), 'utf8');

const readCopyConfig = async (): Promise<string> =>
  readFile(new URL('../../../copy-files-from-to.cjson', import.meta.url), 'utf8');

describe('Replicad WASM loader asset contracts', () => {
  it('uses the emitted multi-thread glue URL as Emscripten pthread main script', async () => {
    const source = await readMultiLoader();

    expect(source).toContain("new URL('wasm/replicad_multi.js', import.meta.url).href");
    expect(source).toContain('mainScriptUrlOrBlob: pthreadMainScriptUrlOrPath()');
    expect(source).toContain("url.protocol !== 'file:'");
    expect(source).toContain('import(');
    expect(source).toContain('replicadMultiBindingsUrl');
  });

  it('copies version-coherent Replicad OCJS glue, WASM, and declarations', async () => {
    const copyConfig = await readCopyConfig();

    for (const variant of ['single', 'multi'] as const) {
      expect(copyConfig).toContain(`replicad_${variant}.js`);
      expect(copyConfig).toContain(`replicad_${variant}.wasm`);
      expect(copyConfig).toContain(`replicad_${variant}.d.ts`);
    }
  });
});
