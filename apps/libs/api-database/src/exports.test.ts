import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
  exports: Record<string, string>;
};

describe('package exports', () => {
  it('pins the public @taucad/api-database surface', () => {
    expect(packageJson.exports).toEqual({
      '.': './src/index.ts',
      './application-name': './src/application-name.ts',
      './billing-protections': './src/billing-protections.ts',
      './migration': './src/database-migration.ts',
      './owner-lock': './src/owner-lock.ts',
      './project-lifecycle': './src/project-lifecycle.ts',
      './schema': './src/schema/index.ts',
      './schema/billing-payment.types': './src/schema/billing-payment.types.ts',
      './schema/billing.types': './src/schema/billing.types.ts',
      './schema/telemetry-purpose.types': './src/schema/telemetry-purpose.types.ts',
      './service-roles': './src/service-roles.ts',
      './testing/database-reachable': './src/testing/database-reachable.ts',
      './testing/scratch-database': './src/testing/scratch-database.ts',
      './package.json': './package.json',
    });
  });
});
