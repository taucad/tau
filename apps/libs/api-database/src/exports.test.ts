import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const packageJsonText = readFileSync(new URL('../package.json', import.meta.url), 'utf8');
const packageJson = JSON.parse(packageJsonText) as {
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
