import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
  exports: Record<string, string>;
};

describe('package exports', () => {
  it('pins the public @taucad/api-observability surface', () => {
    expect(packageJson.exports).toEqual({
      '.': './src/index.ts',
      './cardinality-views': './src/cardinality-views.ts',
      './logger-factory': './src/logger/logger-factory.ts',
      './logger-module': './src/logger/logger.module.ts',
      './metrics': './src/metrics.ts',
      './otel': './src/otel.ts',
      './sentry': './src/sentry.ts',
      './package.json': './package.json',
    });
  });
});
