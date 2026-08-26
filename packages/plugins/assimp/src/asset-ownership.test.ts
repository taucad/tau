import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const importerSource = readFileSync(new URL('assimp.kernel.ts', import.meta.url), 'utf8');
const exporterSource = readFileSync(new URL('assimp.transcoder.ts', import.meta.url), 'utf8');
const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
  dependencies: Record<string, string>;
};

describe('Assimp asset ownership', () => {
  it('loads both import and export through libassimp without a local WASM copy', () => {
    expect(importerSource).toContain("from 'libassimp'");
    expect(exporterSource).toContain('await createAssimp()');
    expect(Object.keys(packageJson.dependencies).sort()).toEqual(['@taucad/geometry-core', 'libassimp']);
    expect(existsSync(new URL('../copy-files-from-to.cjson', import.meta.url))).toBe(false);
    expect(existsSync(new URL('wasm', import.meta.url))).toBe(false);
  });
});
