// @vitest-environment node
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const readMultiLoader = async (): Promise<string> =>
  readFile(new URL('replicad-wasm-multi-loader.ts', import.meta.url), 'utf8');

const readSingleLoader = async (): Promise<string> =>
  readFile(new URL('replicad-wasm-single-loader.ts', import.meta.url), 'utf8');

const readCopyConfig = async (): Promise<string> =>
  readFile(new URL('../../../copy-files-from-to.cjson', import.meta.url), 'utf8');

describe('Replicad WASM loader asset contracts', () => {
  it('uses the toolchain-generated fixed-variant initializers', async () => {
    const [singleSource, multiSource] = await Promise.all([readSingleLoader(), readMultiLoader()]);

    expect(singleSource).toContain("from 'replicad-opencascadejs/single/init'");
    expect(multiSource).toContain("from 'replicad-opencascadejs/multi/init'");
    for (const source of [singleSource, multiSource]) {
      expect(source).not.toContain('mainScriptUrlOrBlob');
      expect(source).not.toContain('resolveCjsDefault');
      expect(source).not.toContain("new URL('wasm/");
    }
  });

  it('copies only the version-coherent Replicad WASM and declarations', async () => {
    const copyConfig = await readCopyConfig();

    for (const variant of ['single', 'multi'] as const) {
      expect(copyConfig).toContain(`replicad_${variant}.wasm`);
      expect(copyConfig).not.toContain(`replicad-opencascadejs/dist/replicad_${variant}.js`);
    }
    // `libcascade assemble` unions both variant surfaces into one published
    // declaration file; per-variant `.d.ts` are build inputs, not artifacts.
    expect(copyConfig).toContain('replicad-opencascadejs/dist/types.d.ts');
  });

  it('erases nothing when typing the multi factory', async () => {
    const source = await readMultiLoader();

    expect(source).not.toContain('as unknown as');
    expect(source).not.toContain('oxlint-disable');
  });
});
