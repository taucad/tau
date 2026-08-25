// @vitest-environment node
/* eslint-disable no-await-in-loop -- loader variants are validated sequentially against shared globals */
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const readMultiLoader = async (): Promise<string> =>
  readFile(new URL('replicad-wasm-multi-loader.ts', import.meta.url), 'utf8');

const readSingleLoader = async (): Promise<string> =>
  readFile(new URL('replicad-wasm-single-loader.ts', import.meta.url), 'utf8');

const readBuildConfig = async (): Promise<string> => readFile(new URL('../tsdown.config.ts', import.meta.url), 'utf8');

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

  it('does not copy upstream Replicad WASM into the package', async () => {
    const buildConfig = await readBuildConfig();
    expect(buildConfig).not.toContain('src/wasm');
  });

  it('erases nothing when typing the multi factory', async () => {
    const source = await readMultiLoader();

    expect(source).not.toContain('as unknown as');
    expect(source).not.toContain('oxlint-disable');
  });
});
