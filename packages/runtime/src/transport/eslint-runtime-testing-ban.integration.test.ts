/**
 * Validates workspace ESLint `no-restricted-imports` for the dedicated testing package
 * blocks production TS while allowing dedicated test files.
 */
// @vitest-environment node

import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const workspaceRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const eslintCli = join(workspaceRoot, 'node_modules/eslint/bin/eslint.js');
const fixturesDirectory = join(workspaceRoot, 'tools/eslint-fixtures/runtime-testing-ban');

describe('eslint testing-package import ban', () => {
  it('flags non-test TypeScript that imports `@taucad/runtime-testing`', () => {
    expect(() =>
      execFileSync(
        process.execPath,
        [eslintCli, join(fixturesDirectory, 'bad-prod-import.ts'), '--max-warnings', '0'],
        {
          cwd: workspaceRoot,
          stdio: 'pipe',
        },
      ),
    ).toThrow();
  }, 30_000);

  it('allows *.test.ts files that import `@taucad/runtime-testing`', () => {
    execFileSync(process.execPath, [eslintCli, join(fixturesDirectory, 'fine.test.ts'), '--max-warnings', '0'], {
      cwd: workspaceRoot,
      stdio: 'pipe',
    });
    expect(true).toBe(true);
  }, 30_000);
});
