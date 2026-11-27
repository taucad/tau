import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const packageJsonText = readFileSync(new URL('../package.json', import.meta.url), 'utf8');
const packageJson = JSON.parse(packageJsonText) as {
  exports: Record<string, string>;
};

describe('package exports', () => {
  it('pins the public @taucad/api-core surface', () => {
    expect(packageJson.exports).toEqual({
      '.': './src/index.ts',
      './constants/app': './src/constants/app.constant.ts',
      './constants/cors': './src/constants/cors.constant.ts',
      './constants/http-body': './src/constants/http-body.constant.ts',
      './constants/http-header': './src/constants/http-header.constant.ts',
      './utils/base62': './src/utils/base62.ts',
      './utils/cors': './src/utils/cors.utils.ts',
      './utils/diff': './src/utils/diff.utils.ts',
      './utils/string': './src/utils/string.utils.ts',
      './utils/trust-proxy': './src/utils/trust-proxy.utils.ts',
      './utils/xml': './src/utils/xml.ts',
      './zod': './src/zod.lib.ts',
      './package.json': './package.json',
    });
  });

  it('declares each subpath once and maps no two subpaths to one file', () => {
    // `JSON.parse` keeps only the last of two equal keys, so read the declared subpaths from the text.
    const exportsBlock = /^ {2}"exports": \{$([\s\S]*?)^ {2}\}/mu.exec(packageJsonText)?.[1] ?? '';
    const subpaths = [...exportsBlock.matchAll(/^ {4}"([^"]+)":/gmu)].map((match) => match[1]);
    expect(subpaths.filter((subpath, index) => subpaths.indexOf(subpath) !== index)).toEqual([]);
    expect(new Set(subpaths)).toEqual(new Set(Object.keys(packageJson.exports)));

    const targets = Object.values(packageJson.exports).map((target) => path.posix.normalize(target));
    expect(targets.filter((target, index) => targets.indexOf(target) !== index)).toEqual([]);
  });
});
