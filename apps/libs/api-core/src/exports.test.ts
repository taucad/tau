import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
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
});
